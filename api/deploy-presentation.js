require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  findTemplate, findPerson, slugify, extFromDataUrl, renderPresentation,
  generatePassword, injectPasswordGate,
} = require('./_lib.js');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const PRAESENTATIONEN_KEY = 'praesentationen';

async function redisCmd(...args) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const json = await res.json();
  return json.result;
}

async function logPresentation(entry) {
  try {
    const raw = await redisCmd('GET', PRAESENTATIONEN_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.unshift(entry);
    if (list.length > 100) list.splice(100);
    await redisCmd('SET', PRAESENTATIONEN_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('Konnte Präsentation nicht in Redis loggen:', err.message);
  }
}

async function gh(method, apiPath, body) {
  const res = await fetch('https://api.github.com' + apiPath, {
    method,
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}

async function vc(method, apiPath, body) {
  const res = await fetch('https://api.vercel.com' + apiPath, {
    method,
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Mirrors the Git Data API blob/tree/commit/ref-update sequence used by
// the working reference implementation in Sales_Neukunden_Demo/deploy.py.
async function pushFiles(owner, repo, files) {
  const ref = await gh('GET', `/repos/${owner}/${repo}/git/ref/heads/main`);
  if (!ref.data || !ref.data.object) throw new Error('Konnte main-Branch nicht lesen: ' + JSON.stringify(ref.data));
  const baseCommitSha = ref.data.object.sha;

  const baseCommit = await gh('GET', `/repos/${owner}/${repo}/git/commits/${baseCommitSha}`);
  if (!baseCommit.data || !baseCommit.data.tree) throw new Error('Konnte Basis-Commit nicht lesen: ' + JSON.stringify(baseCommit.data));
  const baseTreeSha = baseCommit.data.tree.sha;

  const treeEntries = [];
  for (const f of files) {
    const blob = await gh('POST', `/repos/${owner}/${repo}/git/blobs`, { content: f.contentB64, encoding: 'base64' });
    if (blob.status !== 200 && blob.status !== 201) {
      throw new Error(`Blob-Upload fehlgeschlagen (${f.repoPath}): ` + JSON.stringify(blob.data));
    }
    treeEntries.push({ path: f.repoPath, mode: '100644', type: 'blob', sha: blob.data.sha });
  }

  const tree = await gh('POST', `/repos/${owner}/${repo}/git/trees`, { base_tree: baseTreeSha, tree: treeEntries });
  if (!tree.data || !tree.data.sha) throw new Error('Tree konnte nicht erstellt werden: ' + JSON.stringify(tree.data));

  const commit = await gh('POST', `/repos/${owner}/${repo}/git/commits`, {
    message: 'Präsentation generiert',
    tree: tree.data.sha,
    parents: [baseCommitSha],
  });
  if (!commit.data || !commit.data.sha) throw new Error('Commit konnte nicht erstellt werden: ' + JSON.stringify(commit.data));

  const updateRef = await gh('PATCH', `/repos/${owner}/${repo}/git/refs/heads/main`, { sha: commit.data.sha });
  if (updateRef.status !== 200) throw new Error('Branch-Ref konnte nicht aktualisiert werden: ' + JSON.stringify(updateRef.data));

  return commit.data.sha;
}

async function deployPresentation(input) {
  const {
    templateId, companyName, contactPersonId, logoBase64, schulcardHtml,
  } = input;

  if (!GITHUB_TOKEN || !VERCEL_TOKEN) throw new Error('GITHUB_TOKEN/VERCEL_TOKEN sind nicht konfiguriert (.env prüfen).');

  const template = findTemplate(templateId);
  if (!template) throw new Error('Unbekannte Vorlage: ' + templateId);
  const person = findPerson(contactPersonId);
  if (!person) throw new Error('Unbekannter Ansprechpartner: ' + contactPersonId);
  if (!companyName) throw new Error('Firmenname fehlt.');
  if (!schulcardHtml) throw new Error('Schulcard fehlt – bitte zuerst Schritt 4 abschließen.');

  const slug = 'deinerstertag-' + slugify(companyName);
  const password = generatePassword();

  // index.html mit relativen Dateinamen (nicht data:-URIs) — die referenzierten
  // Dateien werden unten mit hochgeladen. Passwort-Gate schützt die Live-Domain.
  const indexHtml = injectPasswordGate(renderPresentation(input, { embed: false }), password);

  const contactExt = (path.extname(person.photo) || '.jpg').replace(/^\./, '');
  const logoExt = extFromDataUrl(logoBase64, 'png');
  const logoB64 = (logoBase64 || '').split(',')[1] || '';

  const files = [];
  files.push({ repoPath: 'index.html', contentB64: Buffer.from(indexHtml, 'utf8').toString('base64') });
  files.push({ repoPath: 'schulcard.html', contentB64: Buffer.from(schulcardHtml, 'utf8').toString('base64') });

  const contactPhotoPath = path.join(__dirname, '..', person.photo);
  if (fs.existsSync(contactPhotoPath)) {
    files.push({ repoPath: 'contact-photo.' + contactExt, contentB64: fs.readFileSync(contactPhotoPath).toString('base64') });
  }
  if (logoB64) {
    files.push({ repoPath: 'customer-logo.' + logoExt, contentB64: logoB64 });
  }
  for (const assetName of template.staticAssets) {
    const assetPath = path.join(__dirname, '..', template.assetDir, assetName);
    if (fs.existsSync(assetPath)) {
      files.push({ repoPath: assetName, contentB64: fs.readFileSync(assetPath).toString('base64') });
    } else {
      console.warn('Statisches Asset fehlt, wird übersprungen:', assetPath);
    }
  }

  // 0. GitHub-User ermitteln (bestimmt den Owner der neuen Repos)
  const userRes = await gh('GET', '/user');
  const owner = (userRes.data && userRes.data.login) || 'roberttgreve-web';

  // 1. Repo erstellen (oder wiederverwenden, falls Name schon existiert)
  const createRepo = await gh('POST', '/user/repos', { name: slug, private: false, auto_init: true });
  if (createRepo.status !== 201 && createRepo.status !== 422) {
    throw new Error('GitHub-Repo konnte nicht erstellt werden: ' + JSON.stringify(createRepo.data));
  }
  // auto_init braucht einen Moment, bis der main-Branch existiert
  await sleep(2000);

  // 2. Dateien pushen (Git Data API: blobs -> tree -> commit -> ref)
  const commitSha = await pushFiles(owner, slug, files);

  // 3. Vercel-Projekt anlegen (oder wiederverwenden)
  let projectId = null;
  const existingProject = await vc('GET', `/v9/projects/${slug}`);
  if (existingProject.status === 200 && existingProject.data) {
    projectId = existingProject.data.id;
  } else {
    const createProject = await vc('POST', '/v10/projects', {
      name: slug,
      framework: null,
      gitRepository: { type: 'github', repo: `${owner}/${slug}` },
      outputDirectory: '.',
    });
    if (createProject.status !== 200 && createProject.status !== 201) {
      throw new Error('Vercel-Projekt konnte nicht erstellt werden: ' + JSON.stringify(createProject.data));
    }
    projectId = createProject.data.id;
  }

  // 4. Production-Deployment auslösen
  const deploy = await vc('POST', '/v13/deployments?forceNew=1', {
    name: slug,
    gitSource: { type: 'github', org: owner, repo: slug, ref: 'main', sha: commitSha },
    target: 'production',
  });
  if (deploy.status !== 200 && deploy.status !== 201) {
    throw new Error('Deployment fehlgeschlagen: ' + JSON.stringify(deploy.data));
  }

  const liveUrl = `https://${slug}.vercel.app`;

  await logPresentation({
    id: slug + '-' + Date.now(),
    companyName,
    url: liveUrl,
    password,
    contactPersonId,
    createdAt: new Date().toISOString(),
  });

  return {
    url: liveUrl,
    deploymentUrl: deploy.data.url ? `https://${deploy.data.url}` : null,
    repo: `${owner}/${slug}`,
    projectId,
    password,
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const result = await deployPresentation(req.body);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

module.exports.config = { api: { bodyParser: { sizeLimit: '15mb' } }, maxDuration: 60 };

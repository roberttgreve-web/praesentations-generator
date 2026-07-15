require('dotenv').config();

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ARCHIVE_KEY = 'schulcards';
const MAX_ENTRIES = 50;

async function redisCmd(...args) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const json = await res.json();
  return json.result;
}

async function getArchive() {
  const raw = await redisCmd('GET', ARCHIVE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function setArchive(archive) {
  await redisCmd('SET', ARCHIVE_KEY, JSON.stringify(archive));
}

module.exports = async (req, res) => {
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({ error: 'Archiv nicht konfiguriert (fehlende Env-Variablen).' });
  }

  try {
    if (req.method === 'GET') {
      const archive = await getArchive();
      return res.json({ archive });
    }

    if (req.method === 'POST') {
      const { entry } = req.body;
      if (!entry || !entry.id) return res.status(400).json({ error: 'Ungültiger Eintrag.' });
      const archive = await getArchive();
      // Replace existing entry with same company+job, otherwise prepend
      const idx = archive.findIndex(e =>
        e.companyName === entry.companyName && e.jobTitle === entry.jobTitle
      );
      if (idx >= 0) { entry.id = archive[idx].id; archive.splice(idx, 1); }
      archive.unshift(entry);
      if (archive.length > MAX_ENTRIES) archive.splice(MAX_ENTRIES);
      await setArchive(archive);
      return res.json({ ok: true, id: entry.id });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'Keine ID angegeben.' });
      const archive = (await getArchive()).filter(e => e.id !== id);
      await setArchive(archive);
      return res.json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Archive error:', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports.config = { api: { bodyParser: { sizeLimit: '2mb' } } };

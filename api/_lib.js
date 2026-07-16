// Gemeinsame Hilfsfunktionen für generate-presentation.js und deploy-presentation.js.
// Datei beginnt mit "_", daher von Vercel NICHT als eigener API-Endpunkt behandelt.
const fs = require('fs');
const path = require('path');
const { TEMPLATES } = require('../templates.js');
const { PEOPLE } = require('../people.js');

const EXT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/gif': 'gif' };
const MIME_BY_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif' };

function findTemplate(id) {
  return TEMPLATES.find(t => t.id === id);
}
function findPerson(id) {
  return PEOPLE.find(p => p.id === id);
}

function slugify(name) {
  return (name || '')
    .toString()
    .normalize('NFKD').replace(new RegExp('[̀-ͯ]', 'g'), '') // Umlaute/Akzente entfernen
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'kunde';
}

function extFromDataUrl(dataUrl, fallback) {
  const m = /^data:([\w-]+\/[\w.+-]+);base64,/.exec(dataUrl || '');
  if (!m) return fallback;
  return EXT_BY_MIME[m[1]] || fallback;
}

function mimeFromExt(ext) {
  return MIME_BY_EXT[ext.toLowerCase()] || 'application/octet-stream';
}

function buildCalendlyBlock(person) {
  if (!person || !person.calendly) return '';
  return `<a href="${person.calendly}" target="_blank" class="cta-btn">
          Termin im Kalender buchen
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        </a>`;
}

function contactPhotoDataUri(person) {
  const photoPath = path.join(__dirname, '..', person.photo);
  const ext = path.extname(photoPath);
  const buf = fs.readFileSync(photoPath);
  return `data:${mimeFromExt(ext)};base64,${buf.toString('base64')}`;
}

/**
 * Baut das finale Präsentations-HTML aus der Vorlage + Token-Ersetzung.
 * opts.embed = true  → Kontaktfoto/Kundenlogo/Schulcard werden als data:-URIs eingebettet
 *                       (funktioniert als eigenständiger Download ohne weitere Dateien).
 * opts.embed = false → Kontaktfoto/Kundenlogo/Schulcard werden als relative Dateinamen
 *                       referenziert (so wie sie von deploy-presentation.js danebengelegt werden).
 */
function renderPresentation(input, opts = {}) {
  const embed = opts.embed !== false;
  const {
    templateId, companyName, contactPersonId, logoBase64,
    contractPrice, contractEndDate, arProdCost, arMarketingCost, schulcardHtml,
  } = input;

  const template = findTemplate(templateId);
  if (!template) throw new Error('Unbekannte Vorlage: ' + templateId);
  const person = findPerson(contactPersonId);
  if (!person) throw new Error('Unbekannter Ansprechpartner: ' + contactPersonId);

  const templatePath = path.join(__dirname, '..', template.file);
  let html = fs.readFileSync(templatePath, 'utf8');

  const logoExt = extFromDataUrl(logoBase64, 'png');
  const contactExt = (path.extname(person.photo) || '.jpg').replace(/^\./, '');

  const replacements = {
    '{{CONTACT_NAME}}': person.name,
    '{{CONTACT_PHONE}}': person.phone,
    '{{CONTACT_EMAIL}}': person.email,
    '{{CONTACT_CALENDLY_BLOCK}}': buildCalendlyBlock(person),
    '{{CUSTOMER_LOGO_ALT}}': companyName || '',
  };

  if (embed) {
    replacements['{{CONTACT_PHOTO_SRC}}'] = contactPhotoDataUri(person);
    replacements['{{CUSTOMER_LOGO_SRC}}'] = logoBase64 || '';
    replacements['{{SCHULCARD_SRC}}'] = schulcardHtml
      ? `data:text/html;base64,${Buffer.from(schulcardHtml, 'utf8').toString('base64')}`
      : '';
  } else {
    replacements['{{CONTACT_PHOTO_SRC}}'] = 'contact-photo.' + contactExt;
    replacements['{{CUSTOMER_LOGO_SRC}}'] = 'customer-logo.' + logoExt;
    replacements['{{SCHULCARD_SRC}}'] = 'schulcard.html';
  }

  if (template.extraFields.includes('contractPrice'))   replacements['{{CONTRACT_PRICE}}']    = contractPrice    || '';
  if (template.extraFields.includes('contractEndDate')) replacements['{{CONTRACT_END_DATE}}'] = contractEndDate || '';
  if (template.extraFields.includes('arProdCost'))       replacements['{{AR_PROD_COST}}']       = arProdCost      || '';
  if (template.extraFields.includes('arMarketingCost'))  replacements['{{AR_MARKETING_COST}}']  = arMarketingCost || '';

  for (const [token, value] of Object.entries(replacements)) {
    html = html.split(token).join(value);
  }

  // Für den Solo-Download (embed:true) auch alle <img>-Referenzen des Templates
  // (Fotos/Screenshots) als data-URI einbetten, damit die Datei offline funktioniert.
  // <video>-Referenzen bleiben bewusst relativ (Dateigröße) und fehlen offline.
  if (embed) {
    html = embedTemplateImages(html, template);
  }

  return html;
}

function embedTemplateImages(html, template) {
  return html.replace(/(<img\b[^>]*?\ssrc=")([^"]+)(")/gi, (match, pre, src, post) => {
    if (!src || src.startsWith('data:') || /^https?:\/\//i.test(src)) return match;
    const assetPath = path.join(__dirname, '..', template.assetDir, src);
    if (!fs.existsSync(assetPath)) return match;
    const ext = path.extname(assetPath);
    const dataUri = `data:${mimeFromExt(ext)};base64,${fs.readFileSync(assetPath).toString('base64')}`;
    return pre + dataUri + post;
  });
}

const PW_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // ohne 0/O/1/l/I
function generatePassword(length = 8) {
  let pw = '';
  for (let i = 0; i < length; i++) pw += PW_CHARS[Math.floor(Math.random() * PW_CHARS.length)];
  return pw;
}

// Einfaches Client-Side-Passwort-Gate für die Live-Präsentation. Kein echter
// Zugriffsschutz (Passwort steht im HTML-Quelltext), sondern ein Soft-Gate,
// damit der Link nicht ohne Passwort weitergereicht/gefunden werden kann.
function injectPasswordGate(html, password) {
  const gate = `
<div id="__pwgate" style="position:fixed;inset:0;z-index:99999;background:#181818;display:flex;align-items:center;justify-content:center;font-family:'Roboto',sans-serif;">
  <div style="background:#fff;border-radius:16px;padding:40px 36px;max-width:360px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.35);">
    <div style="font-size:32px;margin-bottom:12px;">🔒</div>
    <div style="font-weight:700;font-size:18px;margin-bottom:6px;color:#181818;">Passwortgeschützt</div>
    <div style="font-size:13px;color:#888;margin-bottom:20px;">Bitte gib das Passwort ein, das du erhalten hast.</div>
    <input id="__pwinput" type="password" placeholder="Passwort" style="width:100%;padding:12px 14px;border:1.5px solid #e0e0e0;border-radius:8px;font-size:14px;margin-bottom:12px;box-sizing:border-box;font-family:inherit;" />
    <button id="__pwbtn" style="width:100%;padding:12px;border:none;border-radius:8px;background:#00afd6;color:#fff;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit;">Ansehen</button>
    <div id="__pwerr" style="color:#e5484d;font-size:12px;margin-top:10px;display:none;">Falsches Passwort.</div>
  </div>
</div>
<script>
(function(){
  var PW = ${JSON.stringify(password)};
  var KEY = 'pwok_' + PW.length + location.pathname;
  var gate = document.getElementById('__pwgate');
  function unlock(){ gate.remove(); try { sessionStorage.setItem(KEY, '1'); } catch(e){} }
  try { if (sessionStorage.getItem(KEY) === '1') { unlock(); return; } } catch(e){}
  var input = document.getElementById('__pwinput');
  function check(){
    if (input.value === PW) unlock();
    else document.getElementById('__pwerr').style.display = 'block';
  }
  document.getElementById('__pwbtn').addEventListener('click', check);
  input.addEventListener('keydown', function(e){ if (e.key === 'Enter') check(); });
})();
<\/script>
`;
  return html.replace(/<body(\s[^>]*)?>/i, (m) => m + gate);
}

module.exports = {
  TEMPLATES, PEOPLE,
  findTemplate, findPerson,
  slugify, extFromDataUrl, mimeFromExt,
  buildCalendlyBlock, contactPhotoDataUri,
  renderPresentation,
  generatePassword, injectPasswordGate,
};

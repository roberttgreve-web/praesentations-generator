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
  return html;
}

module.exports = {
  TEMPLATES, PEOPLE,
  findTemplate, findPerson,
  slugify, extFromDataUrl, mimeFromExt,
  buildCalendlyBlock, contactPhotoDataUri,
  renderPresentation,
};

// Liste der 6 Vertriebspersonen für den "Wer bist du?"-Schritt.
// calendly: null bedeutet: kein "Termin buchen"-Button auf der Kontakt-Folie (z.B. Franziska).
const PEOPLE = [
  { id: 'robert',     name: 'Robert Greve',       phone: '0155 66 44 9108',         email: 'robert.greve@deinerstertag.de',      photo: 'assets/Robert.jpg',            calendly: 'https://calendly.com/robert-greve/termin-mit-robert?back=1&month=2026-06' },
  { id: 'ferdinand',  name: 'Ferdinand Sieglin',  phone: '+49 (0)155 67052375',      email: 'ferdinand.sieglin@deinerstertag.de', photo: 'assets/Ferdinand.jpg',         calendly: 'https://calendly.com/ferdinand-sieglin/30min?back=1' },
  { id: 'annkathrin', name: 'Ann-Kathrin Fees',   phone: '+49 (0)176 47324241',      email: 'Ann-Kathrin.Fees@deinerstertag.de',  photo: 'assets/Ann-Kathrin Fees.jpg',  calendly: 'https://calendly.com/ann-kathrin-fees/dein-erster-tag-follow-up-30-min?back=1' },
  { id: 'marie',      name: 'Marie Hemmis',       phone: '+49 30 1663570166',       email: 'marie.hemmis@deinerstertag.de',      photo: 'assets/Marie.jpg',             calendly: 'https://calendly.com/marie-hemmis/dein-erster-tag-follow-up' },
  { id: 'franziska',  name: 'Franziska Miodek',   phone: '+49 (0)30 166 35 70 15',  email: 'franziska.miodek@deinerstertag.de',  photo: 'assets/Franzi (kleiner).jpg',  calendly: null },
  { id: 'holger',     name: 'Holger Heeren',      phone: '+49 (0)30 166 357 01-31', email: 'holger.heeren@deinerstertag.de',     photo: 'assets/Holger Heeren.jpg',     calendly: 'https://calendly.com/holger-heeren/30min?back=1' },
];

// In Vercel-Functions (CommonJS) verfügbar machen; im Browser bleibt PEOPLE ein globales const.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PEOPLE };
}

require('dotenv').config();
const { renderPresentation } = require('./_lib.js');

// Deterministische String-Templating-Funktion – KEIN Bedrock-Aufruf hier
// (Bedrock wurde bereits in Schritt 3 für die Schulcard verwendet).
// embed:true bettet Kontaktfoto/Kundenlogo/Schulcard als data:-URIs ein,
// damit der Download-Button eine eigenständig funktionierende Datei liefert.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      templateId, companyName, branche, contactPersonId, logoBase64,
      contractPrice, contractEndDate, arProdCost, arMarketingCost, schulcardHtml,
    } = req.body;

    if (!templateId || !companyName || !contactPersonId) {
      return res.status(400).json({ error: 'Vorlage, Firmenname und Ansprechpartner sind Pflicht.' });
    }

    const html = renderPresentation({
      templateId, companyName, branche, contactPersonId, logoBase64,
      contractPrice, contractEndDate, arProdCost, arMarketingCost, schulcardHtml,
    }, { embed: true });

    res.json({ html });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

module.exports.config = { api: { bodyParser: { sizeLimit: '15mb' } } };

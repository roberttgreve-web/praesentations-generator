require('dotenv').config();
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'eu-central-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const SYSTEM_PROMPT = `Du bist ein Experte für deutsche Ausbildungsberufe, Duale Studiengänge und Unternehmen. Du erstellst und pflegst Inhalte für Schulcards – visuelle Berufserkundungskarten für Schüler*innen (14–16 Jahre). WICHTIGSTE REGELN: (1) Alle Inhalte müssen 100% zum genannten Beruf und Unternehmen passen. Verwende niemals Inhalte aus anderen Berufsfeldern. (2) Verwende KEIN Markdown in Textwerten (keine **Fettung**, keine Unterstriche). (3) Gendering: IMMER *in-Schreibweise (Mechaniker*in, Informatiker*in), niemals /in, (in) oder andere Formen. (4) Behalte alle nicht geänderten Felder exakt bei.`;

async function callBedrock(prompt) {
  const modelId = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';
  const res = await bedrock.send(new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept:      'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 8096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    })
  }));
  const body = JSON.parse(Buffer.from(res.body).toString('utf8'));
  return body.content[0].text;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { currentData, instruction } = req.body;
    if (!instruction) return res.status(400).json({ error: 'Keine Anweisung angegeben.' });

    const prompt = `Du hast diese Schulcard-Daten generiert:\n\n${JSON.stringify(currentData, null, 2)}\n\nDer Nutzer möchte folgende Änderungen:\n"${instruction}"\n\nPasse nur die betroffenen Felder an, behalte alle anderen exakt bei. Antworte NUR mit dem vollständigen aktualisierten JSON – kein Markdown, keine Erklärungen.`;

    let raw = await callBedrock(prompt);
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      raw = await callBedrock(prompt + '\n\nWICHTIG: Antworte AUSSCHLIESSLICH mit rohem JSON-Objekt. Kein Text davor oder danach, keine Codeblöcke.');
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      data = JSON.parse(raw);
    }

    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

module.exports.config = { api: { bodyParser: { sizeLimit: '1mb' } } };

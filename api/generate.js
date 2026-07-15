require('dotenv').config();
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'eu-central-1',
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const SYSTEM_PROMPT = `Du bist ein Experte für deutsche Ausbildungsberufe, Duale Studiengänge und Unternehmen. Du erstellst Inhalte für Schulcards – visuelle Berufserkundungskarten für Schüler*innen (14–16 Jahre). WICHTIGSTE REGELN: (1) Alle Inhalte müssen 100% zum genannten Beruf und Unternehmen passen. Verwende niemals Inhalte aus anderen Berufsfeldern. (2) Verwende KEIN Markdown in Textwerten (keine **Fettung**, keine Unterstriche). (3) Gendering: IMMER *in-Schreibweise (Mechaniker*in, Informatiker*in), niemals /in, (in) oder andere Formen.`;

async function callBedrock(userPrompt) {
  const modelId = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';
  const res = await bedrock.send(new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept:      'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 8096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    })
  }));
  const body = JSON.parse(Buffer.from(res.body).toString('utf8'));
  return body.content[0].text;
}

async function fetchUrlContent(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SchulcardBot/1.0)' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
    return text || null;
  } catch {
    return null;
  }
}

function buildPrompt(companyName, jobTitle, trainingType, urlContent) {
  const isStudium = trainingType === 'duales-studium';
  const typeLabel = isStudium ? 'Duales Studium' : 'Ausbildung';
  const personLabel = isStudium ? 'Studierende*r' : 'Azubi';
  const urlSection = urlContent
    ? `\nZUSATZINFOS von der angegebenen URL (nutze diese für präzisere Inhalte):\n"""\n${urlContent}\n"""\n`
    : '';

  return `Du erstellst Inhalte für eine "Schulcard" – eine visuelle Berufserkundungskarte für deutsche Schülerinnen und Schüler (14–16 Jahre).

WICHTIG: Erstelle alle Inhalte AUSSCHLIESSLICH für dieses konkrete Unternehmen und diesen konkreten Beruf:
- Unternehmen: ${companyName}
- Beruf/Studiengang: ${jobTitle}
- Art: ${typeLabel}
${urlSection}
Nutze dein Wissen über ${companyName}. Wenn du keine gesicherten Infos hast, erfinde realistische Inhalte passend zu Beruf und Branche. Niemals Inhalte aus anderen Berufsfeldern verwenden.

GENDERING: Verwende IMMER die *in-Schreibweise (Mechaniker*in). Niemals /in, (in) oder andere Formen.

${isStudium ? `DUALES STUDIUM: Es handelt sich um ein Duales Studium, nicht um eine klassische Ausbildung. Verwende "${personLabel}" statt "Azubi". Das Studium endet mit einem Bachelor-Abschluss. Mindestvoraussetzung ist Abitur oder Fachabitur. Vergütung ist höher als bei Ausbildung. WICHTIG: Formuliere natürlich – nicht robotisch "Duales Studium ${jobTitle}" in jedem Satz, sondern fließend in die Texte eingebettet.` : ''}

Sprache: Deutsch, Du-Form, jugendlich aber seriös, für 14–16-Jährige.

Antworte NUR mit validem JSON – kein Markdown, keine Erklärungen:

{
  "pageTitle": "Schulcard – ${jobTitle} bei ${companyName}",
  "companyName": "Vollständiger Name von ${companyName}",
  "companyNameShort": "Kurzname ohne Rechtsform",
  "jobTitle": "${jobTitle} mit *in-Genderstern (z.B. Informatiker*in)",
  "jobTitleShort": "Kurzform mit *in-Genderstern – PFLICHT",
  "trainingType": "${typeLabel}",
  "website": "Offizielle Website von ${companyName}",
  "personName": "Passender Vorname für eine*n ${personLabel} bei ${companyName}",
  "personRole": "${personLabel} ${jobTitle} · ${companyName}",
  "companyDescription": "Was ${companyName} macht – max 18 Wörter, direkt und ansprechend",
  "jobDescription": "Was man als ${jobTitle} bei ${companyName} konkret macht – 2 Sätze, Du-Form, berufsspezifisch",
  "importanceText": "Warum ${jobTitle} wichtig ist – 2 emotionale Sätze mit einem Highlight-Wort, berufsspezifisch",
  "importanceHighlight": "1–3 Wörter die den Kern des Berufs beschreiben",
  "photoCaptions": ["Bildunterschrift 1 passend zu ${jobTitle}", "Bildunterschrift 2", "Bildunterschrift 3", "Bildunterschrift 4"],
  "tasksDo": ["Typische Aufgabe 1", "Aufgabe 2", "Aufgabe 3", "Aufgabe 4", "Aufgabe 5"],
  "tasksDont": ["Was man NICHT macht 1", "Nicht-Aufgabe 2", "Nicht-Aufgabe 3", "Nicht-Aufgabe 4"],
  "education": "${isStudium ? 'Abitur oder Fachabitur' : 'NUR der Abschlussname, z.B. Hauptschulabschluss oder Mittlere Reife. Kein weiterer Text.'}",
  "salaryY1": ${isStudium ? 1200 : 900},
  "salaryY2": ${isStudium ? 1300 : 1000},
  "salaryY3": ${isStudium ? 1400 : 1100},
  "workHours": "Typische Wochenstunden für ${jobTitle}",
  "duration": "${isStudium ? 'z.B. 3,5 Jahre' : 'z.B. 3 Jahre'}",
  "equipment": [
    {"name": "Arbeitsutensil 1 typisch für ${jobTitle}", "desc": "Wozu man es braucht"},
    {"name": "Arbeitsutensil 2", "desc": "Wozu man es braucht"},
    {"name": "Arbeitsutensil 3", "desc": "Wozu man es braucht"},
    {"name": "Arbeitsutensil 4", "desc": "Wozu man es braucht"},
    {"name": "Arbeitsutensil 5", "desc": "Wozu man es braucht"}
  ],
  "traits": [
    {"emoji": "passendes Emoji", "name": "Eigenschaft 1 wichtig für ${jobTitle}", "desc": "Warum diese Eigenschaft für den Beruf wichtig ist"},
    {"emoji": "passendes Emoji", "name": "Eigenschaft 2", "desc": "Kurze Erklärung"},
    {"emoji": "passendes Emoji", "name": "Eigenschaft 3", "desc": "Kurze Erklärung"},
    {"emoji": "passendes Emoji", "name": "Eigenschaft 4", "desc": "Kurze Erklärung"},
    {"emoji": "passendes Emoji", "name": "Eigenschaft 5", "desc": "Kurze Erklärung"}
  ],
  "internshipDesc": "Wie ein Praktikum als ${jobTitle} bei ${companyName} aussieht",
  "applyDate": "01.08.2026",
  "applyUrl": "Bewerbungsseite von ${companyName}",
  "brandColor": "Primärfarbe von ${companyName} als Hex-Code",
  "brandColorLight": "Helle Version der Primärfarbe als Hex-Code",
  "quiz": [
    {
      "type": "wf",
      "label": "WAHR ODER FALSCH",
      "q": "Interessante Frage über ${companyName} – nur eine Aussage ist wahr",
      "opts": [
        {"lbl": "AUSSAGE 1", "txt": "Wahre Aussage über ${companyName}", "ok": true},
        {"lbl": "AUSSAGE 2", "txt": "Falsche aber plausible Aussage", "ok": false},
        {"lbl": "AUSSAGE 3", "txt": "Falsche aber plausible Aussage", "ok": false}
      ],
      "fbOk": "Richtig! Kurze Erklärung warum diese Aussage stimmt.",
      "fbErr": "Leider falsch. Die richtige Antwort mit Erklärung."
    },
    {
      "type": "mc",
      "label": "MULTIPLE CHOICE",
      "q": "Konkrete Frage über den Alltag als ${jobTitle}",
      "opts": [
        {"txt": "Falsche Antwort passend zum Beruf", "ok": false},
        {"txt": "Richtige Antwort passend zum Beruf", "ok": true},
        {"txt": "Falsche Antwort passend zum Beruf", "ok": false},
        {"txt": "Falsche Antwort passend zum Beruf", "ok": false}
      ],
      "fbOk": "Genau! Kurze Bestätigung mit Berufsbezug.",
      "fbErr": "Fast! Die richtige Antwort mit Erklärung."
    },
    {
      "type": "schaetz",
      "label": "SCHÄTZFRAGE",
      "q": "Interessante Schätzfrage passend zu ${jobTitle} oder ${companyName}",
      "unit": "sinnvolle Einheit",
      "answer": 50,
      "tol": 15,
      "fbOk": "Gut geschätzt! Kurze Erklärung.",
      "fbClose": "Nah dran! Die genaue Zahl mit Kontext.",
      "fbErr": "Die Antwort mit Erklärung und Berufsbezug."
    }
  ]
}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { companyName, jobTitle, trainingType = 'ausbildung', contextUrl = '' } = req.body;
    if (!companyName || !jobTitle) return res.status(400).json({ error: 'Unternehmensname und Beruf sind Pflicht.' });

    const urlContent = contextUrl ? await fetchUrlContent(contextUrl) : null;
    const userPrompt = buildPrompt(companyName, jobTitle, trainingType, urlContent);

    let raw = await callBedrock(userPrompt);
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      raw = await callBedrock(userPrompt + '\n\nWICHTIG: Antworte AUSSCHLIESSLICH mit rohem JSON-Objekt. Kein Text davor oder danach, keine Codeblöcke.');
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

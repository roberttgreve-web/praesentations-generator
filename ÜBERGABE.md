# Übergabe: Präsentations-Generator – DEIN ERSTER TAG

## Live-URL

**https://praesentations-generator.vercel.app**

## Was das Tool macht

5-Schritte-Assistent, mit dem das Sales-Team individuelle Kundenpräsentationen erstellt:

1. **Wer bist du?** – Sales-Person auswählen (Kontaktdaten erscheinen automatisch auf der Abschluss-Folie)
2. **Vorlage** – eine von 4 Präsentations-Vorlagen wählen
3. **Kundendaten** – Firmenname, Kundenlogo, ggf. Vertragspreis/AR-Avatar-Kosten
4. **Schulcard** – KI-generierte Schulcard (AWS Bedrock) wird in die Präsentation eingebettet, inkl. Fotos/Refine-Loop
5. **Ergebnis** – Präsentation als eigenständige HTML-Datei herunterladen **oder** live unter einer eigenen, passwortgeschützten Domain veröffentlichen

## Tech-Stack

- **Frontend:** eine einzige `index.html` (vanilla JS, kein Framework/Build-Step)
- **Backend:** Vercel Serverless Functions (Node.js, CommonJS) unter `api/`
- **KI:** AWS Bedrock (Claude, `eu.anthropic.claude-sonnet-4-6` – siehe Hinweis unten)
- **Live-Deploy:** GitHub API (neues Repo pro Kunde) + Vercel API (neues Projekt + Deployment pro Kunde)
- **Speicher:** Upstash Redis (REST-API) für Schulcard-Archiv und Log der live veröffentlichten Präsentationen
- **Repository:** https://github.com/roberttgreve-web/praesentations-generator

## Projektstruktur

```
Präsentations-Generator/
├── index.html                    — der komplette 5-Schritte-Wizard (Frontend)
├── people.js                     — die 6 Sales-Personen (Schritt 1)
├── templates.js                  — Manifest der 4 Vorlagen (id, Datei, Zusatzfelder, Assets)
├── Large.svg / Large@2x.png      — DET-Logo (Root, für den Wizard selbst)
├── assets/                       — Kontaktfotos der Sales-Personen
├── templates/
│   ├── neukunden-demo-b2b.html
│   ├── bestandskunden-nur-app.html
│   ├── bestandskunden-nur-sv.html
│   ├── bestandskunden-app-sv.html
│   └── assets/<template-id>/     — Bilder/Videos je Vorlage (für Live-Deploy)
├── api/
│   ├── generate.js               — Bedrock-Aufruf: Schulcard-Inhalte generieren
│   ├── refine.js                 — Bedrock-Aufruf: Schulcard nachträglich anpassen
│   ├── generate-presentation.js  — baut die Solo-Download-HTML (alles eingebettet)
│   ├── deploy-presentation.js    — veröffentlicht live (GitHub + Vercel API, Passwortschutz)
│   ├── archive.js                — Schulcard-Verlauf in Redis (Key "schulcards")
│   └── _lib.js                   — gemeinsame Helfer (Template-Rendering, Passwort-Gate, Slugify …)
├── vercel.json                   — maxDuration + includeFiles für die Functions
└── .env                          — Secrets (nicht im Git)
```

## Die 4 Präsentations-Vorlagen

| Vorlage | Zusatzfelder in Schritt 2 |
|---|---|
| Neukunden-Demo B2B | keine |
| Bestandskunden: Nur App | Vertragspreis, Testphase-Enddatum, AR-Avatar-Kosten |
| Bestandskunden: Nur SV | AR-Avatar-Kosten |
| Bestandskunden: App + SV | AR-Avatar-Kosten |

Jede Vorlage ist eine eigenständige HTML-Datei mit `{{TOKEN}}`-Platzhaltern (`CONTACT_NAME`, `CUSTOMER_LOGO_SRC`, `SCHULCARD_SRC`, `AR_PROD_COST` …), die `api/_lib.js::renderPresentation()` befüllt.

## Schulcard-Generierung (Schritt 4)

Nutzt denselben Bedrock-Flow wie der eigenständige [Schulcard-Generator](https://schulcard-generator.vercel.app) (`api/generate.js`, `api/refine.js`). Fotos (Logo, Hero, Arbeitsumfeld, Arbeitskleidung) können per Datei-Upload **oder** per "Einfügen"-Button aus der Zwischenablage gesetzt werden.

**Wichtig:** `BEDROCK_MODEL_ID` muss zur `AWS_REGION` passen. Bei `AWS_REGION=eu-central-1` funktioniert nur ein `eu.`-Inference-Profile (`eu.anthropic.claude-sonnet-4-6`), ein `us.`-Profile wirft `ValidationException: The provided model identifier is invalid.` (kostete uns produktiv die Schulcard-Generierung, siehe Git-Historie).

## Kundenlogo (ein einziges, überall gleiches Feld)

Egal ob in Schritt 2 ("Kundenlogo", Titelfolie) oder in Schritt 3 ("Unternehmenslogo", Schulcard) hochgeladen/eingefügt – beide Felder sind bidirektional synchronisiert (`setCompanyLogo()` in `index.html`). Es muss nur einmal hochgeladen werden.

## AR-Avatar-Kostenrechner

Für die AR-Avatar-Kostenfelder ist in Schritt 2 ein Button "🧮 Preis berechnen" eingebaut, der den [Preiskalkulator](https://deinerstertag-pricing.vercel.app) per iFrame einbettet. Der Rechner meldet seine Live-Berechnung per `postMessage` an das Elternfenster; "✅ Preis übernehmen" schreibt die aktuellen Summen (Produktionskosten, Jahrespreis) direkt in die Felder. Eingaben werden beim Verlassen des Feldes automatisch auf `1.500 €`-Format normalisiert.

## Schritt 5: Download vs. Live-Veröffentlichung

**Schritt 1 – HTML herunterladen** (`generate-presentation.js`, `embed:true`):
Baut eine eigenständige HTML-Datei. Kontaktfoto, Kundenlogo, Schulcard **und alle im Template referenzierten Fotos** werden als data-URIs eingebettet (funktioniert komplett offline). **Videos werden bewusst nicht eingebettet** (Dateigröße) – sie fehlen in der heruntergeladenen Version.

**Schritt 2 – Live veröffentlichen** (`deploy-presentation.js`, `embed:false`):
1. Legt (falls nötig) ein neues GitHub-Repo `deinerstertag-<firmenname-slug>` an
2. Pusht `index.html` + `schulcard.html` + Kontaktfoto + Kundenlogo + alle statischen Assets der Vorlage (Git Data API: blob → tree → commit → ref)
3. Legt (falls nötig) ein Vercel-Projekt mit demselben Namen an, verknüpft mit dem Repo
4. Löst ein Production-Deployment aus
5. Domain: **`https://deinerstertag-<slug>.vercel.app`**

### Passwortschutz der Live-Präsentation

Jede live veröffentlichte Präsentation bekommt ein zufälliges 8-stelliges Passwort (`generatePassword()`), das als Client-Side-Gate in die Seite eingebaut wird (`injectPasswordGate()` in `_lib.js` – ein Overlay, das erst nach korrekter Passworteingabe verschwindet, mit `sessionStorage`-Merker pro Tab).

⚠️ **Kein echter Zugriffsschutz** – das Passwort steht im Klartext im HTML-Quelltext (View Source). Es ist ein Soft-Gate gegen zufälliges Finden/Weiterleiten des Links, keine Absicherung gegen technisch versierte Personen. Für echten Passwortschutz müsste Vercels natives "Password Protection"-Feature (Pro-Plan) oder eine serverseitige Middleware eingesetzt werden.

Domain + Passwort werden in Schritt 5 als ein Block angezeigt und lassen sich mit "📋 Für E-Mail kopieren" in einem Klick kopieren (für die Kunden-Mail).

### Verwaltung der Passwörter

Jede Live-Veröffentlichung wird zusätzlich in Upstash Redis unter dem Key `praesentationen` geloggt (`companyName`, `url`, `password`, `contactPersonId`, `createdAt` – max. 100 Einträge). Auf **[det-saleshelper.vercel.app](https://det-saleshelper.vercel.app)** gibt es unten rechts einen Button **"🔑 Passwörter"**, der diese Liste anzeigt (liest denselben Redis-Key über `/api/dashboard`) und pro Eintrag einen "Kopieren"-Block anbietet. Dieselben Einträge erscheinen dadurch automatisch auch im bestehenden "Zuletzt erstellt"-Feed des SalesHelpers.

## Secrets (.env)

| Variable | Zweck |
|---|---|
| `VERCEL_TOKEN` | Vercel API – Projekte/Deployments anlegen |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | AWS Bedrock |
| `AWS_REGION` | `eu-central-1` |
| `BEDROCK_MODEL_ID` | `eu.anthropic.claude-sonnet-4-6` |
| `GITHUB_TOKEN` | GitHub API – Repos anlegen/pushen |
| `GITHUB_REPO` | (aktuell ungenutzt für den Live-Deploy-Flow, historisch) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Redis – Schulcard-Archiv + Präsentationen-Log |

Diese Werte sind identisch auf Vercel als Projekt-Environment-Variablen hinterlegt (Dashboard oder `vercel env`).

## Bekannte Stolpersteine

- **Vercel-Datei-Tracing:** `templates/*.html` und `assets/*` werden über dynamisch zusammengesetzte Pfade (`path.join(__dirname, '..', template.file)`) gelesen. Vercels automatische Datei-Erkennung findet solche Pfade nicht zuverlässig – deshalb müssen sie explizit über `functions.<datei>.includeFiles` in `vercel.json` eingebunden werden. Fehlt das, wirft `generate-presentation`/`deploy-presentation` einen `ENOENT`-Fehler.
- **Git-Push löst nicht immer automatisch ein Production-Deployment aus** (bei anderen Projekten im selben Team, z.B. `pricing-tool`, blieb der Auto-Deploy im Status `BLOCKED` hängen). Bei Bedarf manuell auslösen: `POST https://api.vercel.com/v13/deployments` mit `{ "project": "<id>", "target": "production", "gitSource": { "type": "github", "org": "roberttgreve-web", "repo": "<repo>", "ref": "main" } }`.
- **Modell-ID muss zur Region passen** (siehe oben) – bei `ValidationException: The provided model identifier is invalid.` zuerst hier nachsehen.

## Offene Punkte / mögliche nächste Schritte

- [ ] Echter Passwortschutz statt Client-Side-Gate (Vercel Password Protection oder eigene Middleware)
- [ ] Eigene Domain statt `*.vercel.app` für Live-Präsentationen
- [ ] Videos ebenfalls für den Offline-Download nutzbar machen (z.B. optional, mit Größenwarnung)
- [ ] Alte Test-/QA-Deployments (z.B. `deinerstertag-qa-test-firma-xyz`) und deren GitHub-Repos aufräumen

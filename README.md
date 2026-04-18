# opendata-pa-quality-audit

Strumento per la **validazione batch della qualità dei CSV** nei cataloghi open data della Pubblica Amministrazione italiana basati su CKAN.

Complementare a [SIMBA](https://github.com/piersoft/ckan-mcp-server-docker-ollama) — il chatbot per la ricerca, validazione e arricchimento semantico dei dataset PA.

---

## Cosa fa

Dato l'URL di un catalogo CKAN (es. `https://dati.comune.milano.it`), lo strumento:

1. **Scopre** tutte le risorse dichiarate come CSV tramite le API CKAN
2. **Verifica** il Content-Type reale di ogni risorsa (blocca HTML, ZIP, PDF)
3. **Valida** ogni CSV secondo gli stessi standard del validatore SIMBA
4. **Produce** un report aggregato in formato CSV, JSON e HTML

### Standard di riferimento

I check si basano su una sintesi ragionata di standard internazionali e normativa italiana:

| Check | Standard |
|-------|----------|
| S1–S6 | RFC 4180 — struttura CSV |
| S8–S11 | RFC 4180 • W3C CSVW • Unicode — encoding |
| C1 | ISO/IEC 25012 — Unicità |
| C2 | ISO/IEC 25012 — Completezza |
| C4 | ISO/IEC 25012 — Consistenza |
| C5 | ISO 8601:2019 — date |
| C6 | RFC 4180 — separatore decimale |
| C7 | ISO/IEC 25012 — Accuratezza |
| O1–O4 | Linee guida AGID Open Data v1.0 (2024) |
| L1–L2 | dati-semantic-assets • schema.gov.it |
| L3 | Vocabolari controllati ISTAT |
| L4 | D.Lgs. 36/2023 • ANAC (CIG/CUP) |
| L6 | Modello 5 stelle Open Data — W3C |

---

## Uso locale

### Prerequisiti

- Node.js >= 18
- Nessuna dipendenza npm esterna

### Installazione

```bash
git clone https://github.com/piersoft/opendata-pa-quality-audit.git
cd opendata-pa-quality-audit
```

### Esecuzione

```bash
# Audit base (prime 100 risorse CSV)
node src/auditor.js --url https://dati.comune.milano.it

# Con opzioni
node src/auditor.js \
  --url https://opendata.regione.toscana.it \
  --limit 50 \
  --concurrency 3 \
  --format html \
  --output ./mio-report

# Aiuto
node src/auditor.js --help
```

### Opzioni

| Opzione | Default | Descrizione |
|---------|---------|-------------|
| `--url` | — | URL base del catalogo CKAN (**obbligatorio**) |
| `--limit` | 100 | Numero massimo di risorse CSV (max 500) |
| `--concurrency` | 5 | Richieste parallele (max 10) |
| `--format` | all | Formato output: `all`, `csv`, `json`, `html` |
| `--output` | output | Directory di output |

### Output

Nella directory `output/` vengono generati:

- `report.csv` — tabella completa dei risultati
- `report.json` — dati strutturati con sommario e dettaglio
- `report.html` — report visuale con tabella interattiva e check più violati

---

## Uso con GitHub Actions

Puoi eseguire l'audit direttamente su GitHub senza installare nulla in locale.

### Setup

1. **Fork** questo repository
2. Vai su **Actions** → **Audit Qualità Open Data**
3. Clicca **Run workflow**
4. Inserisci l'URL del catalogo CKAN e i parametri desiderati
5. Attendi il completamento del run (icona verde ✅)
6. Clicca sul run completato nell'elenco dei workflow
7. Scorri in fondo alla pagina — trovi la sezione **Artifacts** con il file `report-qualita-N`
8. Clicca per scaricare lo zip contenente `report.html`, `report.csv` e `report.json`

> **Nota**: il report non è disponibile durante l'esecuzione. Bisogna attendere il completamento, tornare all'elenco dei run e riaprire il run completato per trovare gli Artifacts.

### Audit schedulato

Per eseguire l'audit automaticamente ogni settimana:

1. Vai su **Settings** → **Variables** → **Actions**
2. Crea una variabile `CATALOG_URL` con l'URL del tuo catalogo
3. Nel file `.github/workflows/audit.yml`, decommenta la riga `schedule`

---

## Limiti e protezioni

- **Massimo 500 risorse** per run (protezione risorse)
- **Timeout 15s** per singolo download CSV
- **Dimensione massima 5 MB** per file CSV
- **Concorrenza massima 10** richieste parallele
- Blocco automatico di risorse HTML, ZIP, PDF dichiarate come CSV

---

## Progetti collegati

- [SIMBA](https://github.com/piersoft/ckan-mcp-server-docker-ollama) — chatbot per ricerca, validazione e arricchimento semantico dei dataset PA
- [CSV-to-RDF](https://github.com/piersoft/CSV-to-RDF) — conversione CSV in RDF Linked Data con ontologie italiane

---

## Licenza

MIT — Piersoft

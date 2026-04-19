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

I check si basano su una sintesi ragionata di standard internazionali, normativa italiana e buone pratiche open data:

| Check | Cosa verifica | Riferimento | Tipo |
|-------|--------------|-------------|------|
| S1–S6 | Struttura CSV: separatore, intestazioni, colonne | [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180) | Standard formale |
| S7 | Dimensione file (soglia 5 MB) | Nessuno standard normativo | Scelta pragmatica |
| S8–S9 | Encoding UTF-8, caratteri illeggibili, accentate corrotte | RFC 4180 § 2 • Unicode Standard | Standard formale |
| S10 | Marcatore BOM | W3C CSVW — raccomanda UTF-8 senza BOM | Buona pratica |
| S11–S12 | Caratteri di controllo nascosti, righe vuote | RFC 4180 | Standard formale |
| C1 | Righe duplicate | [ISO/IEC 25012](https://www.iso.org/standard/35736.html) — Unicità | Standard formale |
| C2 | Valori mancanti | ISO/IEC 25012 — Completezza | Standard formale |
| C3 | Colonna identificatore univoco | Buona pratica per interoperabilità e Linked Data | Buona pratica |
| C4 | Coerenza tipi per colonna | ISO/IEC 25012 — Consistenza (applicazione pratica) | Buona pratica |
| C5 | Date in formato standard | [ISO 8601:2019](https://www.iso.org/iso-8601-date-and-time-format.html) | Standard formale |
| C6 | Separatore decimale (punto, non virgola) | [W3C CSVW](https://www.w3.org/TR/tabular-data-primer/) — xsd:decimal usa il punto | Standard formale |
| C7 | Valori statisticamente anomali (outlier) | ISO/IEC 25012 — Accuratezza (applicazione pratica) | Buona pratica |
| C8 | Celle molto lunghe (>500 caratteri) | Nessuno standard — segnale di dati non normalizzati | Scelta pragmatica |
| O1–O2 | Numero minimo di righe e colonne | Buona pratica consolidata — nessuna soglia normativa | Buona pratica |
| O3 | Intestazioni descrittive | [Linee guida AGID Open Data v1.0 (2024)](https://www.agid.gov.it/sites/agid/files/2024-05/lg-open-data_v.1.0_1.pdf) | Linee guida |
| O4 | Intestazioni minuscolo con underscore | W3C CSVW — naming convention raccomandato | Buona pratica |
| O5–O6 | Riferimento geografico e temporale | Buona pratica per riusabilità — non è obbligo per il CSV | Buona pratica |
| O7–O10 | Caratteri speciali, URI, booleani, commenti | W3C CSVW e best practice Linked Data | Buona pratica |
| L1 | Identificatori UUID | [W3C Best Practices Linked Data](https://www.w3.org/TR/ld-bp/) | Buona pratica |
| L2 | Mapping colonne a ontologie PA italiane | [dati-semantic-assets](https://github.com/italia/dati-semantic-assets) • [schema.gov.it](https://schema.gov.it) | Standard formale |
| L3 | Codici ISTAT per territori | Vocabolari controllati ISTAT — schema.gov.it | Standard formale |
| L4 | CIG e CUP negli appalti pubblici | [D.Lgs. 36/2023](https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2023-03-31;36) • ANAC | Normativa italiana |
| L5 | URI di ontologie note nei valori | W3C Best Practices for Publishing Linked Data | Buona pratica |
| L6 | Potenziale 5 stelle Open Data | [Modello 5 stelle — Tim Berners-Lee / W3C](https://5stardata.info/en/) | Standard formale |

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

## Uso locale

### Prerequisiti

> ⚠️ **Node.js >= 18 obbligatorio.** Versioni precedenti non sono supportate.
> Verifica con `node --version`. Se necessario aggiorna con:
> ```bash
> curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
> sudo apt-get install -y nodejs
> ```

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
| `--limit` | 100 | Numero massimo di risorse CSV (nessun limite in locale; max 5000 su GitHub Actions) |
| `--concurrency` | 5 | Richieste parallele (max 10) |
| `--format` | all | Formato output: `all`, `csv`, `json`, `html` |
| `--output` | output | Directory di output |

### Output

Nella directory `output/` vengono generati:

- `report.csv` — tabella completa dei risultati
- `report.json` — dati strutturati con sommario e dettaglio
- `report.html` — report visuale con tabella interattiva e check più violati

---

## Limiti e protezioni

- **Massimo 5000 risorse** per run su GitHub Actions (protezione minuti gratuiti); nessun limite in locale
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

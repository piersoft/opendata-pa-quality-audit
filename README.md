# opendata-pa-quality-audit

Strumento per la **validazione batch della qualità dei CSV** nei cataloghi open data della Pubblica Amministrazione italiana basati su CKAN.

Complementare a [SIMBA](https://github.com/piersoft/ckan-mcp-server-docker-ollama) — il chatbot per la ricerca, validazione e arricchimento semantico dei dataset PA — e al [Validatore CSV standalone](https://piersoft.github.io/CSV-to-RDF/validatore-csv-pa.html) per la validazione di singoli file.

---

## Cosa fa

Dato l'URL di un catalogo CKAN (es. `https://dati.comune.milano.it`), lo strumento:

1. **Scopre** tutte le risorse dichiarate come CSV tramite le API CKAN
2. **Filtra** opzionalmente per una o più organizzazioni (`--org`)
3. **Verifica** il Content-Type reale di ogni risorsa (blocca HTML, ZIP, PDF)
4. **Valida** ogni CSV con 34 check automatici suddivisi in 4 categorie
5. **Produce** un report aggregato in formato CSV, JSON e HTML

---

## Standard di riferimento

I check si basano su una sintesi ragionata di standard internazionali, normativa italiana e buone pratiche open data. Non esiste un unico documento che li raccoglie tutti.

| Check | Cosa verifica | Riferimento | Tipo |
|-------|--------------|-------------|------|
| S1–S6 | Struttura CSV: separatore, intestazioni, colonne | [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180) | Standard formale |
| S7 | Dimensione file | Nessuno standard normativo definisce un limite — check informativo con soglia pragmatica (5 MB) | Info |
| S8 | Caratteri illeggibili nel file | RFC 4180 § 2 • Unicode Standard | Standard formale |
| S9 | Lettere accentate corrotte (Windows-1252 letto come UTF-8) | RFC 4180 • Unicode Standard | Standard formale |
| S10 | Marcatore BOM | [W3C CSVW](https://www.w3.org/TR/tabular-data-primer/) — raccomanda UTF-8 senza BOM | Buona pratica |
| S11 | Caratteri di controllo nascosti | RFC 4180 | Standard formale |
| S12 | Righe vuote interne | RFC 4180 | Standard formale |
| C1 | Righe duplicate | [ISO/IEC 25012](https://www.iso.org/standard/35736.html) — dimensione Unicità | Standard formale |
| C2 | Celle vuote (percentuale) | ISO/IEC 25012 — dimensione Completezza | Standard formale |
| C3 | Colonna identificatore univoco | Buona pratica per interoperabilità e Linked Data | Buona pratica |
| C4 | Coerenza tipi per colonna | ISO/IEC 25012 — dimensione Consistenza | Buona pratica |
| C5 | Date in formato YYYY-MM-DD | [ISO 8601:2019](https://www.iso.org/iso-8601-date-and-time-format.html) | Standard formale |
| C6 | Separatore decimale (punto, non virgola) | [W3C CSVW](https://www.w3.org/TR/tabular-data-primer/) — xsd:decimal usa il punto | Standard formale |
| C7 | Valori molto distanti dalla media della colonna | ISO/IEC 25012 — dimensione Accuratezza | Buona pratica |
| C8 | Celle molto lunghe (> 500 caratteri) | Nessuno standard — segnale di dati non normalizzati | Scelta pragmatica |
| O1–O2 | Numero minimo di righe e colonne | [LG AGID Open Data v1.0 (2024)](https://www.agid.gov.it/sites/agid/files/2024-05/lg-open-data_v.1.0_1.pdf) | Linee guida |
| O3 | Intestazioni descrittive | LG AGID Open Data v1.0 (2024) | Linee guida |
| O4 | Intestazioni: spazi/trattini (warn), maiuscole (info) | LG AGID Open Data v1.0 — raccomandazione, non obbligo normativo | Linee guida |
| O5 | Caratteri speciali nelle intestazioni | [W3C CSVW](https://www.w3.org/TR/tabular-data-primer/) | Buona pratica |
| O6 | URI o URL nei valori | [W3C Best Practices for Publishing Linked Data](https://www.w3.org/TR/ld-bp/) | Buona pratica |
| O7 | Colonne booleane (coerenza true/false vs 0/1) | W3C CSVW | Buona pratica |
| O8 | Righe commento in fondo al file | RFC 4180 | Standard formale |
| L1 | Identificatori UUID | W3C Best Practices for Publishing Linked Data | Buona pratica |
| L2 | Mapping colonne a ontologie PA italiane | [dati-semantic-assets](https://github.com/italia/dati-semantic-assets) • [schema.gov.it](https://schema.gov.it) | Standard formale |
| L3 | Codici ISTAT per territori | Vocabolari controllati ISTAT — schema.gov.it | Standard formale |
| L4 | CIG e CUP negli appalti pubblici | [D.Lgs. 36/2023](https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2023-03-31;36) • ANAC | Normativa italiana |
| L5 | URI di ontologie note nei valori | W3C Best Practices for Publishing Linked Data | Buona pratica |
| L6 | Potenziale 5 stelle Open Data | [Modello 5 stelle — Tim Berners-Lee / W3C](https://5stardata.info/en/) | Standard formale |

> **Nota sui check informativi:** S7 è sempre `info` — non esiste uno standard che definisca una dimensione massima per i CSV. I check O1–O2 usano soglie pragmatiche (min 10 righe, min 3 colonne) derivate dall'esperienza pratica con dataset PA italiani. Il check C7 segnala valori numerici molto distanti dalla media della colonna (oltre 4 deviazioni standard): mostra il valore anomalo e la media per consentire la verifica.

> **Check rimossi rispetto a versioni precedenti:** la presenza di colonne geografiche (lat/lon) e temporali (data) non è un requisito per la validazione del CSV — dipende dal tipo di dataset. Questi check sono stati rimossi per evitare falsi avvisi su dataset legittimamente privi di dimensione geografica o temporale (es. bilanci, atti amministrativi).

---

## Uso con GitHub Actions

Puoi eseguire l'audit direttamente su GitHub senza installare nulla in locale.

### Setup

1. **Fork** questo repository
2. Vai su **Actions** → **Audit Qualità Open Data**
3. Clicca **Run workflow**
4. Compila i campi:
   - **URL catalogo CKAN** (obbligatorio)
   - **Slug organizzazione/i** (opzionale — es. `comune-di-matera` oppure `comune-di-lecce,comune-di-montemesola`)
   - Limit, concurrency, formato
5. Attendi il completamento del run (icona verde ✅)
6. Clicca sul run completato → sezione **Artifacts** → scarica `report-qualita-N`

> **Nota**: il report non è disponibile durante l'esecuzione. Bisogna attendere il completamento, tornare all'elenco dei run e riaprire il run completato per trovare gli Artifacts.

### Audit schedulato

Per eseguire l'audit automaticamente ogni settimana:

1. Vai su **Settings** → **Variables** → **Actions**
2. Crea una variabile `CATALOG_URL` con l'URL del tuo catalogo
3. Nel file `.github/workflows/audit.yml`, decommenta la riga `schedule`

---

## Uso locale

### Prerequisiti

> ⚠️ **Node.js >= 18 obbligatorio.** Verifica con `node --version`. Se necessario aggiorna con:
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
# Audit base — tutto il catalogo (prime 100 risorse CSV)
node src/auditor.js --url https://dati.comune.milano.it

# Solo una organizzazione
node src/auditor.js --url https://dati.gov.it --org comune-di-matera

# Più organizzazioni in un unico audit
node src/auditor.js --url https://dati.gov.it --org comune-di-lecce,comune-di-montemesola,comune-di-taranto

# Con tutte le opzioni
node src/auditor.js \
  --url https://opendata.regione.toscana.it \
  --limit 200 \
  --concurrency 5 \
  --format html \
  --output ./mio-report

# Aiuto
node src/auditor.js --help
```

### Come funziona il filtro per organizzazione

Il parametro `--org` accetta uno o più slug CKAN separati da virgola. Lo slug si trova nell'URL della pagina organizzazione del catalogo:
```
https://dati.gov.it/organization/comune-di-matera
                                 ^^^^^^^^^^^^^^^^
                                 questo è lo slug
```

La query inviata alle API CKAN è:
```
# Singola organizzazione
fq=res_format:CSV+AND+organization:(comune-di-matera)

# Organizzazioni multiple — Solr syntax con OR
fq=res_format:CSV+AND+organization:(comune-di-lecce+OR+comune-di-montemesola)
```

I filtri multipli vengono combinati in un **unico parametro `fq`** con sintassi Solr — non due `fq` separati, che alcuni middleware CKAN sovrascrivono.

### Opzioni

| Opzione | Default | Descrizione |
|---------|---------|-------------|
| `--url` | — | URL base del catalogo CKAN (**obbligatorio**) |
| `--org` | — | Slug organizzazione/i CKAN, separati da virgola (opzionale) |
| `--limit` | 100 | Numero massimo di risorse CSV (nessun limite in locale; max 5000 su GitHub Actions) |
| `--concurrency` | 5 | Richieste parallele (max 10) |
| `--format` | all | Formato output: `all`, `csv`, `json`, `html` |
| `--output` | output | Directory di output |

### Output

Nella directory `output/` vengono generati:

- `report.csv` — tabella completa dei risultati
- `report.json` — dati strutturati con sommario e dettaglio check
- `report.html` — report visuale con tabella interattiva e check più violati

---

## Limiti e protezioni

- **Massimo 5000 risorse** per run su GitHub Actions; nessun limite in locale
- **Timeout 15s** per singolo download CSV
- **Dimensione massima 5 MB** per file CSV (check informativo, non bloccante)
- **Concorrenza massima 10** richieste parallele
- Blocco automatico di risorse HTML, ZIP, PDF dichiarate come CSV

---

## Progetti collegati

- [SIMBA](https://github.com/piersoft/ckan-mcp-server-docker-ollama) — chatbot per ricerca, validazione e arricchimento semantico dei dataset PA
- [CSV-to-RDF](https://github.com/piersoft/CSV-to-RDF) — conversione CSV in RDF Linked Data con ontologie italiane
- [Validatore CSV standalone](https://piersoft.github.io/CSV-to-RDF/validatore-csv-pa.html) — validazione di singoli file CSV via browser

---

## Licenza

MIT — Piersoft

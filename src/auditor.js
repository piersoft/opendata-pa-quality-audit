#!/usr/bin/env node
// opendata-pa-quality-audit — auditor.js
// Valida in batch i CSV di un catalogo CKAN PA italiana
// Uso: node src/auditor.js --url https://dati.comune.example.it [--limit 100] [--concurrency 5]

import { parseArgs } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { validateCSV, detectSep, parseCSV } from "./validator.js";

// ── Parametri CLI ─────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    url:         { type: "string" },
    org:         { type: "string" },               // slug organizzazione CKAN (es. comune-di-matera)
    limit:       { type: "string", default: "100" },
    concurrency: { type: "string", default: "5" },
    format:      { type: "string", default: "all" }, // all | csv | json | html
    output:      { type: "string", default: "output" },
    help:        { type: "boolean", default: false },
  },
  strict: false,
});

if (args.help || !args.url) {
  console.log(`
opendata-pa-quality-audit — Validazione batch CSV di cataloghi CKAN PA

USO:
  node src/auditor.js --url <endpoint_ckan> [opzioni]

OPZIONI:
  --url          URL base del catalogo CKAN (es. https://dati.comune.milano.it)
  --limit        Numero massimo di dataset da analizzare (default: 100, max: 500)
  --concurrency  Richieste parallele (default: 5, max: 10)
  --org          Slug organizzazione CKAN (es. comune-di-matera) — se omesso analizza tutto il catalogo
  --format       Formato output: all | csv | json | html (default: all)
  --output       Directory output (default: ./output)
  --help         Mostra questo messaggio

ESEMPI:
  node src/auditor.js --url https://dati.comune.milano.it
  node src/auditor.js --url https://opendata.regione.toscana.it --limit 50
  node src/auditor.js --url https://dati.gov.it --limit 200 --format html
`);
  process.exit(0);
}

const CKAN_URL   = args.url.replace(/\/$/, "");
const ORG        = (args.org || "").trim().toLowerCase();  // slug org, es. "comune-di-matera"
const IS_CI      = !!process.env.GITHUB_ACTIONS;
const MAX_LIMIT  = IS_CI ? 5000 : Infinity;
const LIMIT      = Math.min(parseInt(args.limit) || 100, MAX_LIMIT);
const POOL_SIZE  = Math.min(parseInt(args.concurrency) || 5, 10);
const OUTPUT_DIR = args.output;
const FORMAT     = args.format;

const FETCH_TIMEOUT = 15_000;  // 15s per download CSV
const MAX_CSV_SIZE  = 5 * 1024 * 1024; // 5MB

// ── Utility ───────────────────────────────────────────────────────────────────
function log(msg)  { process.stdout.write(`${msg}\n`); }
function warn(msg) { process.stderr.write(`⚠️  ${msg}\n`); }

async function fetchWithTimeout(url, opts = {}, timeout = FETCH_TIMEOUT) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    return r;
  } finally {
    clearTimeout(timer);
  }
}

// ── Step 1: discovery risorse CSV dal catalogo CKAN ───────────────────────────
async function discoverCsvResources() {
  log(`\n🔍 Connessione a ${CKAN_URL}...`);
  const resources = [];
  let start = 0;
  const pageSize = 100;

  while (resources.length < LIMIT) {
    const apiUrl = `${CKAN_URL}/api/3/action/package_search?` +
      `fq=res_format:CSV${ORG ? "&fq=organization:" + encodeURIComponent(ORG) : ""}&rows=${pageSize}&start=${start}&sort=metadata_modified+desc`;
    let data;
    try {
      const r = await fetchWithTimeout(apiUrl, {
        headers: { "User-Agent": "opendata-pa-quality-audit/1.0" }
      }, 10_000);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      data = await r.json();
    } catch (e) {
      warn(`Errore API CKAN: ${e.message}`);
      break;
    }

    const results = data?.result?.results ?? [];
    if (!results.length) break;

    for (const pkg of results) {
      for (const res of (pkg.resources ?? [])) {
        if ((res.format || "").toUpperCase() === "CSV" && res.url) {
          resources.push({
            dataset_id:    pkg.id,
            dataset_name:  pkg.name,
            dataset_title: pkg.title || pkg.name,
            resource_id:   res.id,
            resource_name: res.name || res.id,
            resource_url:  res.url,
            modified:      res.last_modified || pkg.metadata_modified,
          });
          if (resources.length >= LIMIT) break;
        }
      }
      if (resources.length >= LIMIT) break;
    }
    start += pageSize;
    if (start >= (data?.result?.count ?? 0)) break;
  }

  const total = (await fetchWithTimeout(
    `${CKAN_URL}/api/3/action/package_search?fq=res_format:CSV${ORG ? "&fq=organization:" + encodeURIComponent(ORG) : ""}&rows=0`,
    { headers: { "User-Agent": "opendata-pa-quality-audit/1.0" } }, 8_000
  ).then(r => r.json()).catch(() => ({ result: { count: "?" } })))?.result?.count;

  log(`📦 Trovate ${resources.length} risorse CSV in ${total} dataset con almeno una risorsa CSV`);
  if (resources.length >= LIMIT) {
    log(`   (Limite raggiunto: ${LIMIT} — usa --limit per aumentare)`);
  }
  return resources;
}

// ── Step 2: download e validazione singola risorsa ────────────────────────────
async function validateResource(res) {
  const result = {
    dataset_title: res.dataset_title,
    dataset_id:    res.dataset_id,
    resource_name: res.resource_name,
    resource_url:  res.resource_url,
    modified:      res.modified,
    status:        "error",
    error:         null,
    score:         null,
    verdict:       null,
    checks_pass:   0,
    checks_warn:   0,
    checks_fail:   0,
    checks_info:   0,
    top_issues:    [],
  };

  try {
    // HEAD request per verificare Content-Type
    let ct = "";
    try {
      const head = await fetchWithTimeout(res.resource_url, { method: "HEAD" }, 8_000);
      ct = (head.headers.get("content-type") || "").toLowerCase();
    } catch {}

    const isHtml = ct.includes("text/html");
    const isZip  = ct.includes("zip") || res.resource_url.toLowerCase().endsWith(".zip");
    const isPdf  = ct.includes("pdf") || res.resource_url.toLowerCase().endsWith(".pdf");

    if (isHtml) { result.error = "URL punta a pagina HTML, non al file CSV diretto"; return result; }
    if (isZip)  { result.error = "Risorsa è un archivio ZIP"; return result; }
    if (isPdf)  { result.error = "Risorsa è un PDF"; return result; }

    // Download CSV
    const r = await fetchWithTimeout(res.resource_url, {
      headers: { "User-Agent": "opendata-pa-quality-audit/1.0" }
    });
    if (!r.ok) { result.error = `HTTP ${r.status}`; return result; }

    // Controlla dimensione
    const contentLength = parseInt(r.headers.get("content-length") || "0");
    if (contentLength > MAX_CSV_SIZE) {
      result.error = `File troppo grande (${(contentLength/1024/1024).toFixed(1)} MB > 5 MB)`;
      return result;
    }

    const raw = await r.text();
    if (raw.trimStart().startsWith("<")) {
      result.error = "Contenuto HTML ricevuto invece di CSV";
      return result;
    }
    if (raw.length > MAX_CSV_SIZE) {
      result.error = `Contenuto troppo grande (${(raw.length/1024/1024).toFixed(1)} MB)`;
      return result;
    }

    // Validazione
    const report = validateCSV(raw);
    result.status       = "validated";
    result.score        = report.score;
    result.verdict      = report.verdict;
    result.checks_pass  = report.summary.pass;
    result.checks_warn  = report.summary.warn;
    result.checks_fail  = report.summary.fail;
    result.checks_info  = report.summary.info ?? 0;
    result.top_issues   = Object.values(report.checks).flat()
      .filter(c => c.status === "fail" || c.status === "warn")
      .slice(0, 3)
      .map(c => `${c.id}: ${c.title}`);

  } catch (e) {
    result.error = e.name === "AbortError" ? "Timeout" : e.message.slice(0, 100);
  }

  return result;
}

// ── Step 3: pool di concorrenza ───────────────────────────────────────────────
async function runPool(resources) {
  const results = [];
  let done = 0;

  for (let i = 0; i < resources.length; i += POOL_SIZE) {
    const batch = resources.slice(i, i + POOL_SIZE);
    const batchResults = await Promise.all(batch.map(validateResource));
    results.push(...batchResults);
    done += batch.length;

    const pct = Math.round(done / resources.length * 100);
    const ok   = results.filter(r => r.verdict === "buona_qualita").length;
    const warn = results.filter(r => r.verdict === "accettabile_con_riserva").length;
    const fail = results.filter(r => r.verdict === "non_accettabile" || r.error).length;
    process.stdout.write(`\r   [${pct}%] ${done}/${resources.length} — ✅ ${ok} ⚠️ ${warn} ❌ ${fail}  `);
  }
  process.stdout.write("\n");
  return results;
}

// ── Step 4: output ────────────────────────────────────────────────────────────
function buildSummary(results) {
  const validated = results.filter(r => r.status === "validated");
  const errors    = results.filter(r => r.status === "error");
  const ok        = validated.filter(r => r.verdict === "buona_qualita");
  const warn      = validated.filter(r => r.verdict === "accettabile_con_riserva");
  const fail      = validated.filter(r => r.verdict === "non_accettabile");
  const avgScore  = validated.length
    ? Math.round(validated.reduce((s, r) => s + r.score, 0) / validated.length)
    : 0;

  // Check più violati
  const issueCount = {};
  for (const r of validated) {
    for (const issue of r.top_issues) {
      issueCount[issue] = (issueCount[issue] || 0) + 1;
    }
  }
  const topIssues = Object.entries(issueCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 10);

  return { validated, errors, ok, warn, fail, avgScore, topIssues };
}

function writeCsv(results, dir) {
  const header = "dataset_title,dataset_id,resource_name,resource_url,status,score,verdict,checks_pass,checks_warn,checks_fail,error,top_issues";
  const rows = results.map(r => [
    `"${(r.dataset_title || "").replace(/"/g, "'")}"`,
    r.dataset_id,
    `"${(r.resource_name || "").replace(/"/g, "'")}"`,
    r.resource_url,
    r.status,
    r.score ?? "",
    r.verdict ?? "",
    r.checks_pass ?? "",
    r.checks_warn ?? "",
    r.checks_fail ?? "",
    `"${(r.error || "").replace(/"/g, "'")}"`,
    `"${(r.top_issues || []).join(" | ").replace(/"/g, "'")}"`,
  ].join(","));
  const content = [header, ...rows].join("\n");
  const path = join(dir, "report.csv");
  writeFileSync(path, content, "utf-8");
  return path;
}

function writeJson(results, summary, dir) {
  const path = join(dir, "report.json");
  writeFileSync(path, JSON.stringify({ summary: {
    total: results.length,
    validated: summary.validated.length,
    errors: summary.errors.length,
    ok: summary.ok.length,
    warn: summary.warn.length,
    fail: summary.fail.length,
    avg_score: summary.avgScore,
    top_issues: summary.topIssues,
  }, results }, null, 2), "utf-8");
  return path;
}

function writeHtml(results, summary, dir, catalogUrl, org = "") {
  const ts = new Date().toLocaleString("it-IT");
  const orgLabel = org ? ` — Organizzazione: <strong>${escHtml(org)}</strong>` : "";
  const scoreColor = s => s >= 90 ? "#1a6b35" : s >= 60 ? "#f07b05" : "#b00020";
  const verdictEmoji = v => v === "buona_qualita" ? "✅" : v === "accettabile_con_riserva" ? "⚠️" : v ? "❌" : "—";

  const rows = results.map(r => `
    <tr>
      <td><a href="${r.resource_url}" target="_blank" rel="noopener">${escHtml(r.dataset_title)}</a></td>
      <td>${escHtml(r.resource_name)}</td>
      <td>${r.status === "validated"
        ? `<span style="color:${scoreColor(r.score)};font-weight:700">${r.score}/100</span>`
        : `<span style="color:#b00020">Errore</span>`}</td>
      <td>${verdictEmoji(r.verdict)}</td>
      <td style="color:#b00020">${r.checks_fail ?? ""}</td>
      <td style="color:#f07b05">${r.checks_warn ?? ""}</td>
      <td style="color:#1a6b35">${r.checks_pass ?? ""}</td>
      <td style="font-size:11px;color:#5c6f82">${escHtml((r.error || r.top_issues?.join(", ") || ""))}</td>
    </tr>`).join("");

  const topIssuesHtml = summary.topIssues.map(([issue, count]) =>
    `<tr><td>${escHtml(issue)}</td><td style="font-weight:700;color:#b00020">${count}</td></tr>`
  ).join("");

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Report Qualità Open Data — ${escHtml(catalogUrl)}</title>
<link href="https://fonts.googleapis.com/css2?family=Titillium+Web:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Titillium Web',sans-serif;background:#f0f4f8;color:#1a1a2e;font-size:15px}
header{background:#0066cc;color:#fff;padding:20px 32px}
header h1{font-size:22px;font-weight:700}
header p{font-size:13px;opacity:.85;margin-top:4px}
.container{max-width:1200px;margin:0 auto;padding:24px 20px}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px}
.stat{background:#fff;border-radius:6px;padding:16px;text-align:center;border:1px solid #dce3ea}
.stat-num{font-size:28px;font-weight:700}
.stat-label{font-size:11px;color:#5c6f82;text-transform:uppercase;letter-spacing:.05em;margin-top:4px}
.ok{color:#1a6b35}.warn{color:#f07b05}.fail{color:#b00020}.blue{color:#0066cc}
.card{background:#fff;border-radius:6px;border:1px solid #dce3ea;margin-bottom:20px;overflow:hidden}
.card-header{background:#f5f7fa;border-bottom:1px solid #dce3ea;padding:10px 20px;font-size:13px;font-weight:700;color:#0066cc;text-transform:uppercase;letter-spacing:.05em}
.card-body{padding:0}
table{width:100%;border-collapse:collapse;font-size:13px}
th{background:#f5f7fa;padding:8px 12px;text-align:left;border-bottom:2px solid #dce3ea;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#5c6f82;position:sticky;top:0}
td{padding:7px 12px;border-bottom:1px solid #f0f4f8;vertical-align:top}
tr:hover td{background:#f8fafc}
a{color:#0066cc;text-decoration:none}
a:hover{text-decoration:underline}
footer{text-align:center;padding:20px;font-size:12px;color:#8898a9}
</style>
</head>
<body>
<header>
  <h1>Report Qualità Open Data</h1>
  <p>Catalogo: <strong>${escHtml(catalogUrl)}</strong>${orgLabel} — Generato il ${ts} — opendata-pa-quality-audit</p>
</header>
<div class="container">
  <div class="summary">
    <div class="stat"><span class="stat-num blue">${results.length}</span><div class="stat-label">Risorse analizzate</div></div>
    <div class="stat"><span class="stat-num ok">${summary.ok.length}</span><div class="stat-label">Ottima qualità</div></div>
    <div class="stat"><span class="stat-num warn">${summary.warn.length}</span><div class="stat-label">Con riserva</div></div>
    <div class="stat"><span class="stat-num fail">${summary.fail.length + summary.errors.length}</span><div class="stat-label">Non accettabili / Errori</div></div>
    <div class="stat"><span class="stat-num blue">${summary.avgScore}/100</span><div class="stat-label">Score medio</div></div>
  </div>

  ${summary.topIssues.length ? `
  <div class="card">
    <div class="card-header">Check più violati</div>
    <div class="card-body">
      <table>
        <thead><tr><th>Check</th><th>Occorrenze</th></tr></thead>
        <tbody>${topIssuesHtml}</tbody>
      </table>
    </div>
  </div>` : ""}

  <div class="card">
    <div class="card-header">Dettaglio risorse (${results.length})</div>
    <div class="card-body" style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th>Dataset</th><th>Risorsa</th><th>Score</th><th>Verdict</th>
            <th>❌</th><th>⚠️</th><th>✅</th><th>Note</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>
</div>
<footer>opendata-pa-quality-audit • <a href="https://github.com/piersoft/opendata-pa-quality-audit" target="_blank">GitHub</a></footer>
</body>
</html>`;

  const path = join(dir, "report.html");
  writeFileSync(path, html, "utf-8");
  return path;
}

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log(`\n🦁 opendata-pa-quality-audit`);
  log(`   Catalogo: ${CKAN_URL}`);
  if (ORG) log(`   Organizzazione: ${ORG}`);
  log(`   Limite: ${LIMIT} risorse | Concorrenza: ${POOL_SIZE}`);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const resources = await discoverCsvResources();
  if (!resources.length) {
    warn("Nessuna risorsa CSV trovata. Verifica l'URL del catalogo.");
    process.exit(1);
  }

  log(`\n⚙️  Validazione in corso...`);
  const results = await runPool(resources);
  const summary = buildSummary(results);

  log(`\n📊 Risultati:`);
  log(`   ✅ Ottima qualità:      ${summary.ok.length}`);
  log(`   ⚠️  Con riserva:        ${summary.warn.length}`);
  log(`   ❌ Non accettabili:     ${summary.fail.length}`);
  log(`   💥 Errori di accesso:   ${summary.errors.length}`);
  log(`   📈 Score medio:         ${summary.avgScore}/100`);

  if (summary.topIssues.length) {
    log(`\n🔝 Check più violati:`);
    summary.topIssues.slice(0, 5).forEach(([issue, count]) => {
      log(`   ${count}x — ${issue}`);
    });
  }

  log(`\n💾 Salvataggio report...`);
  const files = [];
  if (FORMAT === "all" || FORMAT === "csv")  files.push(writeCsv(results, OUTPUT_DIR));
  if (FORMAT === "all" || FORMAT === "json") files.push(writeJson(results, summary, OUTPUT_DIR));
  if (FORMAT === "all" || FORMAT === "html") files.push(writeHtml(results, summary, OUTPUT_DIR, CKAN_URL, ORG));
  files.forEach(f => log(`   📄 ${f}`));

  log(`\n✅ Audit completato.\n`);
}

main().catch(e => { console.error(e); process.exit(1); });

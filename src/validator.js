// validator.js — logica estratta da validatore-csv-pa.html (v2026.04.22.01)
// Portata in ES module Node.js: zero dipendenze esterne.
// Allineata a validatore-csv-pa.html v2026.04.17.12

// ─── Rilevamento separatore ───────────────────────────────────────────────────
export function detectSep(raw) {
  const line = raw.split('\n')[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  for (const ch of line) if (ch in counts) counts[ch]++;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

// ─── Parser CSV minimale robusto ──────────────────────────────────────────────
export function parseCSV(raw, sep) {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === sep && !inQ) {
        fields.push(cur); cur = '';
      } else cur += c;
    }
    fields.push(cur);
    rows.push(fields);
  }
  return rows;
}

// ─── Normalizza header ────────────────────────────────────────────────────────
function normHeader(h) {
  return h.trim().toLowerCase().replace(/[\s\-]/g, '_').replace(/[^a-z0-9_]/g, '');
}

// ─── CHECK: Struttura ─────────────────────────────────────────────────────────
export function checksStruttura(raw, rows, sep, headers) {
  const results = [];
  const push = (id, title, detail, status) => results.push({ id, title, detail, status });

  if (!raw || raw.trim().length === 0) {
    push('S1', 'File vuoto', 'Il CSV non contiene dati.', 'fail');
    return results;
  }
  push('S1', 'File non vuoto', `${raw.trim().length} caratteri totali.`, 'pass');

  const sepNames = { ',': 'virgola (,)', ';': 'punto e virgola (;)', '\t': 'tabulazione', '|': 'pipe (|)' };
  push('S2', 'Separatore rilevato', `Rilevato: ${sepNames[sep] || sep}`, 'pass');

  if (headers.length === 0) {
    push('S3', 'Intestazione assente', 'Prima riga vuota o non rilevata.', 'fail');
    return results;
  }
  push('S3', 'Intestazione presente', `${headers.length} colonne rilevate.`, 'pass');

  const hSet = new Set(headers);
  if (hSet.size < headers.length) {
    const dupes = headers.filter((h, i) => headers.indexOf(h) !== i);
    push('S4', 'Intestazioni duplicate', `Colonne duplicate: ${dupes.join(', ')}`, 'fail');
  } else push('S4', 'Intestazioni univoche', 'Nessuna colonna duplicata.', 'pass');

  const emptyHdr = headers.filter(h => !h.trim());
  if (emptyHdr.length) push('S5', 'Intestazioni vuote', `${emptyHdr.length} colonne senza nome.`, 'warn');
  else push('S5', 'Tutte le intestazioni nominate', 'Nessuna colonna anonima.', 'pass');

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    push('S6', 'Nessuna riga dati', "Il CSV ha solo l'intestazione.", 'warn');
  } else {
    const irregular = dataRows.filter(r => r.length !== headers.length);
    if (irregular.length > 0) {
      push('S6', 'Numero colonne inconsistente', `${irregular.length} righe con numero di campi diverso dall'intestazione (${headers.length} attese).`, 'fail');
    } else push('S6', 'Numero colonne consistente', `Tutte le ${dataRows.length} righe hanno ${headers.length} colonne.`, 'pass');
  }

  // S7 — informativo, nessuno standard formale definisce un limite di dimensione
  const kb = Buffer.byteLength(raw, 'utf8') / 1024;
  const kbStr = kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb.toFixed(1) + ' KB';
  if (kb > 5120) push('S7', 'File di grandi dimensioni', `${kbStr} — file molto grandi possono rallentare il caricamento. Non esiste un limite formale: valutare la suddivisione per comodità d'uso.`, 'info');
  else push('S7', 'Dimensione nella norma', `${kbStr} — nessun problema di dimensione rilevato.`, 'info');

  // S8 — caratteri illeggibili (segnale sicuro di encoding sbagliato)
  const hasReplacement = raw.includes('\uFFFD');
  if (hasReplacement) push('S8', 'Caratteri illeggibili nel file (errore di codifica)', "Il file contiene caratteri non leggibili: probabilmente salvato in Windows-1252 ma aperto come UTF-8. Riaprire e risalvare come CSV UTF-8.", 'fail');
  else push('S8', 'Nessun carattere illeggibile rilevato', 'La codifica del file sembra corretta.', 'pass');

  // S9 — doppia codifica Windows-1252: accentate italiane corrotte
  const win1252seqs = ['\u00c3\u00a0', '\u00c3\u00a8', '\u00c3\u00a9', '\u00c3\u00b2', '\u00c3\u00b9', '\u00c3\u00ac', '\u00c3\u0080', '\u00e2\u0080\u0099', '\u00e2\u0080\u009c', '\u00e2\u0080\u009d'];
  const corruptFound = win1252seqs.filter(p => raw.includes(p));
  if (corruptFound.length > 0) push('S9', 'Lettere accentate corrotte (encoding errato)', "Il file sembra salvato in Windows-1252 ma letto come UTF-8: le lettere accentate italiane (à, è, ò…) appaiono storpiate. Riaprire e risalvare come UTF-8 senza BOM.", 'fail');
  else push('S9', 'Lettere accentate nella norma', 'Nessuna lettera accentata corrotta rilevata.', 'pass');

  // S10 — BOM
  if (raw.charCodeAt(0) === 0xFEFF) push('S10', 'Marcatore BOM presente', "Il file inizia con un marcatore BOM invisibile. Preferibile risalvare come UTF-8 senza BOM.", 'warn');
  else push('S10', 'Nessun marcatore BOM', 'Struttura corretta.', 'pass');

  // S11 — caratteri di controllo non visibili
  const ctrlRe = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;
  const ctrlLines = raw.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => ctrlRe.test(l));
  if (ctrlLines.length > 0) push('S11', 'Caratteri nascosti nel file', `Trovati caratteri non visibili alla riga ${ctrlLines.slice(0, 3).map(([i]) => i).join(', ')}. Aprire con un editor di testo e rimuoverli.`, 'warn');
  else push('S11', 'Nessun carattere nascosto', 'Il file non contiene caratteri non visibili.', 'pass');

  // S12 — righe vuote interne
  const blankInternal = dataRows.filter(r => r.every(c => !c.trim()));
  if (blankInternal.length) push('S12', 'Righe completamente vuote', `${blankInternal.length} righe interne vuote (da rimuovere).`, 'warn');
  else push('S12', 'Nessuna riga vuota interna', 'Struttura pulita.', 'pass');

  return results;
}

// ─── CHECK: Contenuto ─────────────────────────────────────────────────────────
export function checksContenuto(rows, headers) {
  const results = [];
  const push = (id, title, detail, status) => results.push({ id, title, detail, status });
  const dataRows = rows.slice(1);
  if (dataRows.length === 0) { push('C0', 'Nessun dato', '', 'skip'); return results; }
  const normH = headers.map(normHeader);

  // C1 — righe duplicate
  const seen = new Set(), dupeRows = [];
  dataRows.forEach((r, i) => { const k = r.join('|'); if (seen.has(k)) dupeRows.push(i + 2); else seen.add(k); });
  if (dupeRows.length) push('C1', 'Righe duplicate', `${dupeRows.length} righe duplicate (es. riga ${dupeRows.slice(0, 3).join(', ')}).`, 'warn');
  else push('C1', 'Nessuna riga duplicata', 'Tutte le righe sono uniche.', 'pass');

  // C2 — celle vuote (linguaggio semplice, senza "valori mancanti")
  const totalCells = dataRows.length * headers.length;
  const missingCells = dataRows.reduce((s, r) => s + r.filter(c => !c.trim()).length, 0);
  const missingPct = (missingCells / totalCells * 100).toFixed(1);
  if (missingPct > 30) push('C2', 'Troppe celle vuote nel file', `Il ${missingPct}% delle celle non contiene alcun valore (più di 3 su 10). Il dataset risulta incompleto e poco utilizzabile.`, 'fail');
  else if (missingPct > 10) push('C2', 'Alcune celle vuote', `Il ${missingPct}% delle celle non contiene alcun valore. Verificare se le informazioni mancanti sono recuperabili.`, 'warn');
  else push('C2', 'Celle vuote nella norma', `Solo il ${missingPct}% delle celle è vuoto: il dataset appare completo.`, 'pass');

  // C3 — colonna ID univoca
  const idCols = normH.filter(h => ['id', 'codice', 'cod', 'identifier', 'identificativo'].some(k => h.includes(k)));
  if (idCols.length > 0) {
    const colIdx = normH.indexOf(idCols[0]);
    const ids = dataRows.map(r => r[colIdx] || '').filter(v => v.trim());
    const uniqIds = new Set(ids);
    if (uniqIds.size < ids.length * 0.98) push('C3', 'Colonna ID con duplicati', `"${headers[colIdx]}" ha valori ripetuti.`, 'warn');
    else push('C3', 'Colonna ID univoca', `"${headers[colIdx]}" ha valori univoci.`, 'pass');
  } else push('C3', 'Nessuna colonna ID', 'Aggiungere un identificatore univoco (es. colonna "id").', 'warn');

  // C4 — coerenza tipi per colonna
  const typeIssues = [];
  headers.forEach((h, ci) => {
    const vals = dataRows.map(r => (r[ci] || '').trim()).filter(v => v);
    if (vals.length < 3) return;
    const numCount = vals.filter(v => /^-?\d+([.,]\d+)?$/.test(v)).length;
    const pct = numCount / vals.length;
    if (pct > 0.5 && pct < 0.9) typeIssues.push(`"${h}" (${(pct * 100).toFixed(0)}% numerico)`);
  });
  if (typeIssues.length) push('C4', 'Colonne a tipo misto', `${typeIssues.join('; ')}.`, 'warn');
  else push('C4', 'Tipi colonna omogenei', 'Nessuna colonna con valori misti rilevata.', 'pass');

  // C5 — date ISO 8601
  const dateCols = normH.map((h, i) => [h, i]).filter(([h]) => /data|date|anno|year|timestamp/.test(h));
  if (dateCols.length > 0) {
    const badDates = [];
    dateCols.forEach(([, ci]) => {
      const vals = dataRows.map(r => (r[ci] || '').trim()).filter(v => v);
      const nonIso = vals.filter(v => !/^\d{4}-\d{2}-\d{2}(T[\d:Z.+-]+)?$/.test(v) && !/^\d{4}$/.test(v));
      if (nonIso.length > 0) badDates.push(`"${headers[ci]}" (es: ${nonIso[0]})`);
    });
    if (badDates.length) push('C5', 'Date non in formato standard', `${badDates.join('; ')}. Usare il formato YYYY-MM-DD (es. 2024-03-15).`, 'warn');
    else push('C5', 'Date in formato corretto (YYYY-MM-DD)', '', 'pass');
  } else push('C5', 'Nessuna colonna data rilevata', '', 'info');

  // C6 — separatore decimale
  const numColsIdx = headers.map((_, ci) => {
    const vals = dataRows.map(r => (r[ci] || '').trim()).filter(v => v);
    const pct = vals.filter(v => /^-?\d+([.,]\d+)?$/.test(v)).length / (vals.length || 1);
    return pct > 0.7 ? ci : -1;
  }).filter(i => i >= 0);
  if (numColsIdx.length) {
    const commaDecimal = numColsIdx.filter(ci => {
      const vals = dataRows.map(r => (r[ci] || '').trim()).filter(v => v);
      return vals.some(v => /\d,\d/.test(v));
    });
    if (commaDecimal.length) push('C6', 'Decimali con virgola in colonne numeriche', `Colonne: ${commaDecimal.map(i => '"' + headers[i] + '"').join(', ')}. Usare il punto come separatore decimale (es. 1.50 non 1,50).`, 'warn');
    else push('C6', 'Separatore decimale corretto', 'Colonne numeriche usano il punto come separatore.', 'pass');
  } else push('C6', 'Nessuna colonna numerica rilevata', '', 'info');

  // C7 — valori molto distanti dalla media
  const outRange = [];
  numColsIdx.forEach(ci => {
    const vals = dataRows.map(r => parseFloat((r[ci] || '').replace(',', '.'))).filter(v => !isNaN(v));
    if (!vals.length) return;
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    const anomali = vals.filter(v => Math.abs(v - mean) > 4 * std);
    if (anomali.length > 0) {
      const esempi = anomali.slice(0, 2).map(v => v.toLocaleString('it-IT')).join(', ');
      const mediaFmt = mean.toLocaleString('it-IT', { maximumFractionDigits: 1 });
      outRange.push(`"${headers[ci]}": valore${anomali.length > 1 ? 'i' : ''} ${esempi} molto distante${anomali.length > 1 ? 'i' : ''} dalla media (${mediaFmt})`);
    }
  });
  if (outRange.length) push('C7', 'Valori molto distanti dalla media', `${outRange.join('; ')}. Potrebbe essere un errore di inserimento, verificare.`, 'warn');
  else push('C7', 'Nessun valore fuori scala rilevato', 'Tutti i valori numerici rientrano in un intervallo coerente.', 'pass');

  // C8 — celle molto lunghe
  const longCells = [];
  headers.forEach((h, ci) => {
    const max = Math.max(...dataRows.map(r => (r[ci] || '').length));
    if (max > 500) longCells.push(`"${h}" (max ${max} caratteri)`);
  });
  if (longCells.length) push('C8', 'Celle molto lunghe', `${longCells.join(', ')} — potrebbe indicare dati non normalizzati.`, 'warn');
  else push('C8', 'Lunghezza celle nella norma', '', 'pass');

  return results;
}

// ─── CHECK: Qualità Open Data ─────────────────────────────────────────────────
export function checksOpendata(rows, headers, raw = '') {
  const results = [];
  const push = (id, title, detail, status) => results.push({ id, title, detail, status });
  const dataRows = rows.slice(1);

  // O1 — numero minimo righe
  if (dataRows.length < 10) push('O1', 'Dataset molto piccolo', `${dataRows.length} righe: un dataset di qualità dovrebbe avere almeno 10 record.`, 'warn');
  else push('O1', 'Numero righe sufficiente', `${dataRows.length} righe.`, 'pass');

  // O2 — numero colonne
  if (headers.length < 3) push('O2', 'Poche colonne', `${headers.length} colonne: dataset molto sparso.`, 'warn');
  else push('O2', 'Numero colonne adeguato', `${headers.length} colonne.`, 'pass');

  // O3 — intestazioni descrittive
  const cryptic = headers.filter(h => /^col\d+$|^campo\d+$|^field\d+$|^[a-z]$/i.test(h.trim()));
  if (cryptic.length) push('O3', 'Intestazioni non descrittive', `Colonne con nomi generici: ${cryptic.map(h => '"' + h + '"').join(', ')}.`, 'warn');
  else push('O3', 'Intestazioni descrittive', 'Tutti i nomi di colonna sembrano significativi.', 'pass');

  // O4 — formato intestazioni: spazi/trattini=warn (problema tecnico), maiuscole=info (raccomandazione non obbligo)
  const withSpaces = headers.filter(h => /[\s\-]/.test(h.trim()));
  const withUpper  = headers.filter(h => !/[\s\-]/.test(h.trim()) && /[A-Z]/.test(h));
  if (withSpaces.length) push('O4', 'Intestazioni con spazi o trattini',
    `${withSpaces.map(h => '"' + h + '"').join(', ')} — usare underscore al posto di spazi (es. "data_apertura").`, 'info');
  if (withUpper.length) push('O4', 'Intestazioni con lettere maiuscole',
    `${withUpper.map(h => '"' + h + '"').join(', ')} — le LG AGID Open Data raccomandano il minuscolo, ma molti dataset PA usano maiuscolo per convenzione. Non è un requisito normativo bloccante.`, 'info');
  if (!withSpaces.length && !withUpper.length) push('O4', 'Intestazioni in formato ottimale', 'Minuscolo con underscore: formato raccomandato dalle LG AGID Open Data v1.0 (2024).', 'pass');

  // O5 — caratteri speciali in intestazioni
  const specialHdr = headers.filter(h => /[^\w\s\-\u00C0-\u017E]/.test(h));
  if (specialHdr.length) push('O5', 'Caratteri speciali in intestazioni', `${specialHdr.map(h => '"' + h + '"').join(', ')}.`, 'warn');
  else push('O5', 'Nessun carattere speciale nelle intestazioni', '', 'pass');

  // O6 — URI o URL nei dati
  const colsWithUri = headers.filter((_, ci) => {
    const vals = dataRows.slice(0, 20).map(r => (r[ci] || '').trim());
    return vals.some(v => /^https?:\/\//.test(v));
  });
  if (colsWithUri.length) push('O6', 'URI/URL rilevati nei dati', `Colonne con URI: ${colsWithUri.map(h => '"' + h + '"').join(', ')} — ottimo per Linked Data.`, 'pass');
  else push('O6', 'Nessun URI nei dati', "Aggiungere URI di riferimento migliora l'interoperabilità.", 'info');

  // O7 — colonne booleane
  const boolCols = headers.filter((_, ci) => {
    const vals = dataRows.slice(0, 30).map(r => (r[ci] || '').trim().toLowerCase()).filter(v => v);
    const boolSet = new Set(['0', '1', 'true', 'false', 'si', 'no', 's', 'n', 'y', 'yes', 'vero', 'falso']);
    return vals.length > 0 && vals.every(v => boolSet.has(v));
  });
  if (boolCols.length) push('O7', 'Colonne booleane rilevate', `${boolCols.map(h => '"' + h + '"').join(', ')} — usare true/false o 0/1 in modo coerente.`, 'info');
  else push('O7', 'Nessuna colonna booleana rilevata', '', 'pass');

  // O8 — commenti in coda
  const lastLines = raw.trim().split('\n').slice(-3);
  const hasComment = lastLines.some(l => l.startsWith('#'));
  if (hasComment) push('O8', 'Righe commento in fondo al file', 'Righe che iniziano con "#" in fondo — rimuoverle per massima compatibilità.', 'warn');
  else push('O8', 'Nessuna riga commento in coda', '', 'pass');

  return results;
}

// ─── CHECK: Linked Data ───────────────────────────────────────────────────────
export function checksLinkeddata(rows, headers) {
  const results = [];
  const push = (id, title, detail, status) => results.push({ id, title, detail, status });
  const normH = headers.map(normHeader);
  const dataRows = rows.slice(1);

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const idCandidates = normH.map((h, i) => [h, i]).filter(([h]) => /^id$|_id$|^codice|^cod_|^identifier|^uuid/.test(h));
  let hasUUID = false;
  idCandidates.forEach(([, ci]) => {
    if (dataRows.some(r => uuidRe.test((r[ci] || '').trim()))) hasUUID = true;
  });
  if (hasUUID) push('L1', 'UUID come identificatore', 'Ottimo per la generazione di URI stabili.', 'pass');
  else if (idCandidates.length) push('L1', 'Identificatore non UUID', 'Preferire UUID o IRI per URI stabili in RDF.', 'info');
  else push('L1', 'Nessun identificatore univoco', 'Aggiungere una colonna "id" per generare URI corretti in RDF.', 'warn');

  const onto_map = {
    'lat': 'CLV (Geolocation)', 'lon': 'CLV', 'latitude': 'CLV', 'longitude': 'CLV',
    'indirizzo': 'CLV (Address)', 'cap': 'CLV', 'comune': 'CLV/ISTAT', 'codice_istat': 'CLV',
    'importo': 'PC (PublicContract)', 'cig': 'PC', 'cup': 'PC',
    'data_inizio': 'TI (TimeInterval)', 'data_fine': 'TI', 'data_apertura': 'TI',
    'quantita': 'QB (DataCube)', 'valore': 'QB', 'misura': 'QB/MU',
    'nome': 'CPV (Person)', 'cognome': 'CPV', 'cf': 'CPV',
    'azienda': 'COV (Organization)', 'impresa': 'COV', 'ragione_sociale': 'COV',
    'titolo': 'Cultural-ON / ACCO', 'descrizione': 'dct:description',
    'sesso': 'CPV/Vocabolario sex', 'forma_giuridica': 'Vocabolario legal-status',
    'codice_ateco': 'Vocabolario ATECO', 'licenza': 'Vocabolario licences',
  };
  const matched = [];
  normH.forEach(h => {
    for (const [key, onto] of Object.entries(onto_map)) {
      if (h.includes(key) && !matched.find(m => m.col === h)) {
        matched.push({ col: headers[normH.indexOf(h)], onto });
        break;
      }
    }
  });
  if (matched.length > 0) push('L2', 'Colonne mappabili a ontologie italiane', matched.map(m => `"${m.col}" → ${m.onto}`).join('; '), 'pass');
  else push('L2', 'Nessuna colonna riconosciuta dalle ontologie', 'Verificare le convenzioni di denominazione delle colonne.', 'warn');

  const istatCols = normH.map((h, i) => [h, i]).filter(([h]) => /istat|cod_comune|codice_comune|pro_com/.test(h));
  if (istatCols.length) push('L3', 'Codici ISTAT rilevati', 'Ottimo per il collegamento ai vocabolari controllati ISTAT.', 'pass');
  else push('L3', 'Nessun codice ISTAT', 'I codici ISTAT migliorano il collegamento ai Linked Data PA.', 'info');

  const cigRe = /^[0-9A-Z]{10}$/;
  const cupRe = /^[A-Z]\d{2}[A-Z]\d{11}$/;
  const hasCIG = normH.some((h, ci) => /cig/.test(h) && dataRows.slice(0, 10).some(r => cigRe.test((r[ci] || '').trim())));
  const hasCUP = normH.some((h, ci) => /cup/.test(h) && dataRows.slice(0, 10).some(r => cupRe.test((r[ci] || '').trim())));
  if (hasCIG || hasCUP) push('L4', 'CIG/CUP rilevati', "Collegamento all'ontologia PublicContract e OpenCUP/BDAP.", 'pass');
  else push('L4', 'Nessun CIG/CUP rilevato', '', 'info');

  const linkedVals = dataRows.slice(0, 30).flat().filter(v => /^https?:\/\/(schema\.gov\.it|w3\.org|data\.europa\.eu|dati\.gov\.it)/.test((v || '').trim()));
  if (linkedVals.length > 0) push('L5', 'URI di ontologie note nei valori', `${linkedVals.length} valori con URI schema.gov.it / w3.org / dati.gov.it.`, 'pass');
  else push('L5', 'Nessun URI di ontologia nei valori', "Considerare l'uso di URI da schema.gov.it per i valori codificati.", 'info');

  if (matched.length >= 2 && headers.length >= 5) push('L6', 'Potenziale 5 stelle Open Data', 'Dataset sufficientemente ricco e mappabile per la conversione RDF Linked Data.', 'pass');
  else push('L6', 'Dataset da arricchire per 5 stelle', 'Servono almeno 5 colonne ben nominate e mappabili alle ontologie italiane.', 'info');

  return results;
}

// ─── Score & verdict ──────────────────────────────────────────────────────────
export function computeScore(allChecks) {
  const weights = { pass: 1, warn: 0.5, fail: 0, info: 1, skip: 1 };
  const total = allChecks.filter(c => c.status !== 'skip').length;
  const score = allChecks.reduce((s, c) => s + (weights[c.status] || 0), 0);
  return total ? Math.round(score / total * 100) : 0;
}

export function isCriticalFail(allChecks) {
  return allChecks.some(c => ['S1', 'S3', 'S6'].includes(c.id) && c.status === 'fail');
}

// ─── Entry point principale ───────────────────────────────────────────────────
export function validateCSV(raw) {
  const sep = detectSep(raw);
  const rows = parseCSV(raw, sep);
  const headers = rows[0] || [];

  const strChecks  = checksStruttura(raw, rows, sep, headers);
  const contChecks = checksContenuto(rows, headers);
  const odChecks   = checksOpendata(rows, headers, raw);
  const ldChecks   = checksLinkeddata(rows, headers);

  const allChecks = [...strChecks, ...contChecks, ...odChecks, ...ldChecks];
  const score     = computeScore(allChecks);
  const critFail  = isCriticalFail(allChecks);

  const failCount = allChecks.filter(c => c.status === 'fail').length;
  const warnCount = allChecks.filter(c => c.status === 'warn').length;
  const passCount = allChecks.filter(c => c.status === 'pass').length;

  let verdict;
  if (critFail || failCount > 3) verdict = 'non_accettabile';
  else if (failCount > 0 || warnCount > 5) verdict = 'accettabile_con_riserva';
  else verdict = 'buona_qualita';

  return {
    score, verdict,
    criticalFail: critFail,
    summary: { pass: passCount, warn: warnCount, fail: failCount, rows: rows.length - 1, columns: headers.length },
    checks: { struttura: strChecks, contenuto: contChecks, opendata: odChecks, linkeddata: ldChecks },
    separator: sep,
    headers,
  };
}

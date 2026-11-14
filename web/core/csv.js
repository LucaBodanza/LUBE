// ELSAP DSGN — CSV del Listino: separatore ; , o tab (si riconosce da solo), numeri all'italiana (1.234,56), titoli di colonna flessibili.
// Nessun accesso al browser qui dentro: si può provare con node (sorgenti/test/t_csv.mjs).

export const COLONNE = [`codice`, `marchio`, `acquisto`, `vendita`, `moq`, `tempi_giorni`, `giacenza`];
const ALIAS = {
  codice: [`code`, `articolo`, `cod`, `codice articolo`, `item`, `art`],
  marchio: [`fornitore`, `brand`, `costruttore`, `produttore`],
  acquisto: [`costo`, `prezzo acquisto`, `prezzo di acquisto`, `netto acquisto`],
  vendita: [`prezzo`, `prezzo vendita`, `prezzo di vendita`, `listino`, `prezzo listino`],
  moq: [`lotto`, `lotto minimo`, `multiplo`],
  tempi_giorni: [`tempi`, `giorni`, `lead time`, `consegna`, `tempi consegna`],
  giacenza: [`stock`, `disponibilita`, `magazzino`, `qta`, `quantita`],
};
const norm = s => String(s ?? ``).trim().toLowerCase().normalize(`NFD`).replace(/[̀-ͯ]/g, ``).replace(/[_\-]+/g, ` `).replace(/\s+/g, ` `);
const MAPPA = new Map();
for (const [k, v] of Object.entries(ALIAS)) for (const a of [k, ...v]) MAPPA.set(norm(a), k);

// "1.234,56" · "1234,56" · "1234.56" · "1,234.56" · "12 €"  →  numero; vuoto → null; illeggibile → NaN
export function numero(s) {
  let t = String(s ?? ``).replace(/[€\s ]/g, ``).replace(/eur$/i, ``);
  if (t === ``) return null;
  if (t.includes(`,`) && t.includes(`.`)) t = t.lastIndexOf(`.`) > t.lastIndexOf(`,`) ? t.replace(/,/g, ``) : t.replace(/\./g, ``).replace(`,`, `.`);
  else if (t.includes(`,`)) t = t.replace(`,`, `.`);
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ``);
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

function dividi(testo) {
  const t = testo.replace(/^﻿/, ``);
  const prima = t.split(/\r?\n/, 1)[0] ?? ``;
  const sep = [`;`, `\t`, `,`].map(c => [c, prima.split(c).length - 1]).sort((a, b) => b[1] - a[1])[0];
  const D = sep[1] ? sep[0] : `;`;
  const righe = [];
  let riga = [], cella = ``, dentro = false;
  const chiudi = () => { riga.push(cella); cella = ``; if (riga.some(x => x.trim() !== ``)) righe.push(riga); riga = []; };
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dentro) { if (c === `"`) { if (t[i + 1] === `"`) { cella += `"`; i++; } else dentro = false; } else cella += c; }
    else if (c === `"`) dentro = true;
    else if (c === D) { riga.push(cella); cella = ``; }
    else if (c === `\n` || c === `\r`) { if (c === `\r` && t[i + 1] === `\n`) i++; chiudi(); }
    else cella += c;
  }
  if (cella !== `` || riga.length) chiudi();
  return righe;
}

export function leggiCsv(testo) {
  const celle = dividi(String(testo));
  const vuoto = { righe: [], scartate: [], riconosciute: [], ignorate: [], duplicati: 0 };
  if (!celle.length) return { ...vuoto, errore: `Il file è vuoto.` };
  const intest = celle[0].map(h => MAPPA.get(norm(h)) || null);
  const riconosciute = [...new Set(intest.filter(Boolean))];
  const ignorate = celle[0].filter((h, i) => !intest[i] && h.trim()).map(h => h.trim());
  if (!riconosciute.includes(`codice`)) return { ...vuoto, riconosciute, ignorate, errore: `Manca la colonna "codice" nella prima riga del file.` };
  const per = new Map(), scartate = [];
  let duplicati = 0;
  celle.slice(1).forEach((r, k) => {
    const o = {};
    let errore = ``;
    intest.forEach((campo, i) => {
      if (!campo || errore) return;
      const v = (r[i] ?? ``).trim();
      if (v === ``) return;
      if (campo === `codice` || campo === `marchio`) { o[campo] = v; return; }
      const n = numero(v);
      if (!Number.isFinite(n) || n < 0) errore = `${campo.replace(`_`, ` `)} non valido (${v})`;
      else o[campo] = campo === `acquisto` || campo === `vendita` ? n : Math.round(n);
    });
    if (!errore && !o.codice) errore = `codice mancante`;
    if (errore) { scartate.push({ riga: k + 2, motivo: errore }); return; }
    const id = o.codice.toUpperCase();
    if (per.has(id)) duplicati++;
    per.set(id, { ...(per.get(id) || {}), ...o });
  });
  return { righe: [...per.values()], scartate, riconosciute, ignorate, duplicati };
}

const cella = v => {
  const s = v == null ? `` : typeof v === `number` ? String(v).replace(`.`, `,`) : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, `""`)}"` : s;
};
// acquisto: false → la colonna dei prezzi di acquisto non esce (per i ruoli che non la vedono)
export function scriviCsv(righe, { acquisto = false } = {}) {
  const col = COLONNE.filter(c => acquisto || c !== `acquisto`);
  return `﻿` + [col.join(`;`), ...righe.map(r => col.map(c => cella(r[c])).join(`;`))].join(`\r\n`) + `\r\n`;
}

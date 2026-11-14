// ELSAP DSGN — Offerte: regole di calcolo, numerazione e stati. Solo funzioni pure: si provano con node (sorgenti/test/t_offerte.mjs).
// Forma dei dati: schemi/offerte_ordini.json. Importi in euro, IVA esclusa.

export const STATI = [`Bozza`, `Inviata`, `In revisione`, `Accettata`, `Rifiutata`, `Scaduta`];
// Si può modificare solo in Bozza e In revisione; da Inviata in poi l'offerta è «congelata».
export const MODIFICABILI = new Set([`Bozza`, `In revisione`]);
// Da quale stato si può passare a quale (modificare qui per cambiare le regole)
export const SUCCESSIVI = {
  'Bozza': [`Inviata`],
  'Inviata': [`In revisione`, `Accettata`, `Rifiutata`],
  'In revisione': [`Inviata`, `Rifiutata`],
  'Accettata': [],
  'Rifiutata': [`In revisione`],
  'Scaduta': [`In revisione`],
};

const arr = n => Math.round((n + Number.EPSILON) * 100) / 100;
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const nettoRiga = r => arr(num(r.qta) * num(r.prezzo) * (1 - num(r.sconto) / 100));

// lordo = somma delle righe già scontate; imponibile = lordo meno lo sconto sul totale.
// Margine solo sulle righe che hanno il prezzo di acquisto; «parziale» se ne manca qualcuna.
export function totali(off) {
  const righe = off.righe || [], st = num(off.sconto_totale);
  const lordo = arr(righe.reduce((s, r) => s + nettoRiga(r), 0));
  const imponibile = arr(lordo * (1 - st / 100));
  const conAcq = righe.filter(r => r.acquisto != null && r.acquisto !== ``);
  let margine = null, marginePerc = null;
  if (conAcq.length) {
    const ricavo = conAcq.reduce((s, r) => s + nettoRiga(r) * (1 - st / 100), 0);
    const costo = conAcq.reduce((s, r) => s + num(r.qta) * num(r.acquisto), 0);
    margine = arr(ricavo - costo);
    marginePerc = ricavo > 0 ? arr((ricavo - costo) / ricavo * 100) : null;
  }
  return { lordo, scontoTotale: arr(lordo - imponibile), imponibile, margine, marginePerc, parziale: conAcq.length > 0 && conAcq.length < righe.length };
}

export function prossimoNumero(offerte, anno = new Date().getFullYear()) {
  let max = 0;
  for (const o of offerte) { const m = /^OFF-(\d{4})-(\d+)$/.exec(o.id); if (m && Number(m[1]) === anno) max = Math.max(max, Number(m[2])); }
  return `OFF-${anno}-${String(max + 1).padStart(4, `0`)}`;
}

export const giorno = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, `0`)}-${String(d.getDate()).padStart(2, `0`)}`;
export const traGiorni = (n, da = new Date()) => { const d = new Date(da); d.setDate(d.getDate() + n); return giorno(d); };

// Inviata o In revisione con la data di validità passata → Scaduta (le Bozze no: non sono ancora partite)
export const scaduta = (off, oggi = new Date()) => (off.stato === `Inviata` || off.stato === `In revisione`) && !!off.valida_fino && off.valida_fino < giorno(oggi);

// Riga d'offerta da una riga di listino. L'acquisto si copia solo se chi lavora può vederlo.
export function rigaDaListino(l, ind, scontoCliente, conAcquisto) {
  return { codice: l.codice, descrizione: ind?.descr || ``, qta: l.moq || 1, prezzo: l.vendita ?? 0,
    ...(conAcquisto && l.acquisto != null ? { acquisto: l.acquisto } : {}),
    sconto: scontoCliente || 0, consegna_giorni: l.tempi_giorni ?? null, note: `` };
}

// Controlli prima di mandarla al cliente: un testo per ogni problema (vuoto = ok)
export function problemiInvio(off) {
  const p = [];
  if (!off.cliente_id) p.push(`scegli il cliente`);
  if (!(off.righe || []).length) p.push(`aggiungi almeno una riga`);
  if ((off.righe || []).some(r => !(num(r.qta) > 0))) p.push(`ci sono righe senza quantità`);
  if ((off.righe || []).some(r => !(num(r.prezzo) > 0))) p.push(`ci sono righe senza prezzo`);
  if (!off.valida_fino) p.push(`imposta la validità`);
  return p;
}

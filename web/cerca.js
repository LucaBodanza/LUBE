// ELSAP DSGN — Cerca codice (filtri su tutte le caratteristiche) e Interrogatore (dalle parole al prodotto)
// Tutto gira sul dispositivo: il database dei prodotti (prodotti.json) arriva con i dati dei cataloghi.

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = t => String(t).toUpperCase().replace(/[\s.\-_/–,+]/g, '');
const senzaAccenti = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------------------------------------------------------------- caratteristiche
export const FACCETTE = [
  { k: 'tipo', nome: 'Tipo' }, { k: 'formato', nome: 'Formato' }, { k: 'codifica', nome: 'Codifica' }, { k: 'poli', nome: 'Poli', numerica: true },
  { k: 'genere', nome: 'Genere' }, { k: 'uscita', nome: 'Uscita' }, { k: 'schermo', nome: 'Schermatura' }, { k: 'conn', nome: 'Connessione' },
  { k: 'ip', nome: 'Grado IP' }, { k: 'v', nome: 'Tensione', numerica: true }, { k: 'a', nome: 'Corrente', numerica: true },
  { k: 'lung', nome: 'Lunghezza cavo', numerica: true }, { k: 'mat', nome: 'Materiale' }, { k: 'proto', nome: 'Protocollo' },
  { k: 'marchio', nome: 'Marchio' }, { k: 'cat', nome: 'Catalogo' },
];
const NOME_F = Object.fromEntries(FACCETTE.map(f => [f.k, f.nome]));
const numero = v => { const m = /-?\d+(?:[.,]\d+)?/.exec(String(v)); return m ? parseFloat(m[0].replace(',', '.')) : Infinity; };

const D = { pronti: false, carico: null, P: [], cat: {}, ctx: null };

async function prendiProdotti() {
  const url = D.ctx.WEB ? 'dati/prodotti.json' : '/api/prodotti';
  let ultimo = null;
  for (let giro = 0; giro < 3; giro++) {          // un paio di tentativi: su computer lenti la prima richiesta può cadere
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) {
        let msg = `Il database dei prodotti non è nei dati installati (risposta ${r.status}).`;
        try { const j = await r.json(); if (j.errore) msg = j.errore; } catch (e) { /* risposta senza testo */ }
        const err = new Error(msg); err.definitivo = true; throw err;
      }
      return await r.json();
    } catch (e) {
      if (e.definitivo) throw e;
      ultimo = e;
      await new Promise(ok => setTimeout(ok, 500 + giro * 700));
    }
  }
  throw new Error(`Non riesco a leggere il database dei prodotti (${ultimo?.message || 'errore sconosciuto'}). Chiudi e riapri l'app; se continua, ricarica il file dei dati dalla pagina "Dati".`);
}
async function carica() {
  if (D.pronti) return;
  if (!D.carico) D.carico = (async () => {
    const j = await prendiProdotti();
    for (const c of D.ctx.S.cataloghi) if (c.manifest) D.cat[c.numero] = c;
    D.P = j.prodotti.filter(o => D.cat[o.n]);
    for (const o of D.P) {
      o.f.cat = `${String(o.n).padStart(2, '0')} · ${D.cat[o.n].nome}`;
      o._x = norm(o.c) + ' ' + o.a.map(norm).join(' ');
      o._w = senzaAccenti([o.c, o.a.join(' '), o.t, o.b, o.d, o.s.join(' '), Object.values(o.f).join(' ')].join(' '));
    }
    D.pronti = true;
  })().catch(e => { D.carico = null; throw e; });       // la prossima volta si riprova
  return D.carico;
}
const avvisoDati = e => `<div class="vuoto"><b>${esc(e.message)}</b>${D.ctx.WEB ? '' : '<a class="btn" href="/dati">Apri la pagina dei dati</a>'}</div>`;

// prodotto → va bene per i filtri? filtri = { chiave: Set(valori) }, saltando eventualmente una chiave (per i conteggi)
function passa(o, filtri, salta) {
  for (const k in filtri) {
    if (k === salta || !filtri[k].size) continue;
    if (!filtri[k].has(o.f[k])) return false;
  }
  return true;
}
function punteggioTesto(o, q) {            // q = { codice, parole[] }
  let p = 0;
  if (q.codice) {
    const c = norm(o.c);
    if (c === q.codice) p += 1000; else if (c.startsWith(q.codice)) p += 600; else if (o._x.includes(q.codice)) p += 400;
  }
  let trovate = 0;
  for (const w of q.parole) if (o._w.includes(w)) { trovate++; p += 30 + w.length; }
  if (q.parole.length && trovate === q.parole.length) p += 120;
  return { p, trovate };
}
function interrogaTesto(testo) {
  const t = testo.trim();
  const parole = senzaAccenti(t).split(/[\s,;]+/).filter(w => w.length >= 2);
  const unico = !/\s/.test(t) && /\d/.test(t) && t.length >= 3;
  return { codice: unico ? norm(t) : '', parole: unico ? [senzaAccenti(t)] : parole, vuoto: !t };
}

// ---------------------------------------------------------------- scheda PDF: le pagine del prodotto estratte dal catalogo
let pdfLib = null;
const DOC = new Map();                      // gli ultimi PDF aperti restano in memoria per le schede successive
function fonte(o) {                         // il file più piccolo che contiene la pagina
  const m = D.cat[o.n].manifest;
  const s = m.sotto.find(x => x.pagina_catalogo && o.p >= x.pagina_catalogo && o.p < x.pagina_catalogo + x.pagine);
  const base = `cat/${encodeURI(m.slug)}/`;
  return s ? { url: base + encodeURI(s.file), p: o.p - s.pagina_catalogo + 1, n: s.pagine } : { url: base + encodeURI(m.file), p: o.p, n: m.pagine };
}
async function documento(url) {
  if (!pdfLib) pdfLib = await import('./vendor/pdf-lib.esm.min.js');
  if (!DOC.has(url)) {
    if (DOC.size >= 2) DOC.delete(DOC.keys().next().value);
    DOC.set(url, (async () => pdfLib.PDFDocument.load(await (await fetch(url)).arrayBuffer(), { updateMetadata: false }))());
  }
  return DOC.get(url);
}
export async function schedaPdf(prodotti, nomeFile) {
  const { toast } = D.ctx;
  toast(prodotti.length > 1 ? `Preparo ${prodotti.length} schede…` : 'Preparo la scheda…');
  try {
    if (!pdfLib) pdfLib = await import('./vendor/pdf-lib.esm.min.js');
    const out = await pdfLib.PDFDocument.create();
    const fatte = new Set();
    for (const o of prodotti) {
      const f = fonte(o), doc = await documento(f.url);
      const idx = [];
      for (let i = 0; i < (o.k || 1); i++) { const p = f.p + i; if (p <= f.n && !fatte.has(f.url + '#' + p)) { fatte.add(f.url + '#' + p); idx.push(p - 1); } }
      if (idx.length) (await out.copyPages(doc, idx)).forEach(pg => out.addPage(pg));
    }
    if (!out.getPageCount()) throw new Error('nessuna pagina');
    out.setTitle(prodotti.length === 1 ? `${prodotti[0].c} — scheda tecnica ELSAP` : 'Schede tecniche ELSAP');
    out.setProducer('ELSAP DSGN');
    const blob = new Blob([await out.save()], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nomeFile || `ELSAP_${prodotti[0].c.replace(/[^\w.-]+/g, '_')}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    toast(`Scheda pronta · ${out.getPageCount()} ${out.getPageCount() === 1 ? 'pagina' : 'pagine'}`);
  } catch (e) { toast('Scheda non riuscita: ' + e.message); }
}
function apriNelCatalogo(o) {
  const c = D.cat[o.n], m = c.manifest;
  D.ctx.S.cur = c;
  D.ctx.sfoglia({ url: `cat/${encodeURI(m.slug)}/${encodeURI(m.file)}`, titolo: c.nome, pagina: o.p });
}

// ================================================================ CERCA CODICE
const C = { filtri: {}, testo: '', lista: [], mostrati: 0, scelti: new Map(), aperte: new Set(), pagina: null };
const PASSO = 60;

function descr(o) { return o.d || o.b || o.t || o.s[o.s.length - 1] || ''; }
function etichette(o, max = 7) {
  const out = [];
  for (const k of ['tipo', 'formato', 'codifica', 'poli', 'genere', 'uscita', 'schermo', 'ip', 'v', 'a', 'lung', 'conn']) {
    const v = o.f[k]; if (!v) continue;
    out.push(`<span class="et">${k === 'poli' ? esc(v) + ' poli' : (k === 'codifica' ? 'cod. ' + esc(v) : esc(v))}</span>`);
    if (out.length >= max) break;
  }
  return out.join('');
}
function rigaProdotto(o, i) {
  const sel = C.scelti.has(o.c + '|' + o.n);
  return `<div class="pr ${sel ? 'sel' : ''}" data-i="${i}">
    <button class="spunta" data-a="sel" title="Aggiungi alle schede da scaricare" aria-pressed="${sel}"></button>
    <div class="pc"><div class="cod">${esc(o.c)}${o.a.length ? `<span>${esc(o.a.slice(0, 2).join(' · '))}</span>` : ''}</div>
      <div class="ds">${esc(descr(o))}</div><div class="ets">${etichette(o)}</div></div>
    <div class="pd"><div class="dove">${esc(o.f.cat)}<span>pag. ${o.p}</span></div>
      <div class="az"><button data-a="pdf" class="pri">Scheda PDF</button><button data-a="cat">Apri nel catalogo</button></div></div></div>`;
}
function calcola() {
  const q = interrogaTesto(C.testo);
  let L = D.P.filter(o => passa(o, C.filtri) && (C.pagina ? (o.n === C.pagina.n && o.p === C.pagina.p) : true));
  if (!q.vuoto) {
    const P = [];
    for (const o of L) { const s = punteggioTesto(o, q); if (s.p > 0 && (q.codice || s.trovate === q.parole.length)) { o._p = s.p; P.push(o); } }
    P.sort((a, b) => b._p - a._p || a.n - b.n || a.p - b.p);
    L = P;
  }
  C.lista = L; C.mostrati = 0;
  return q;
}
function disegnaFiltri(q) {
  // per ogni caratteristica: i valori disponibili con gli altri filtri attivi
  const base = D.P.filter(o => (C.pagina ? (o.n === C.pagina.n && o.p === C.pagina.p) : true) && (q.vuoto || (s => s.p > 0 && (q.codice || s.trovate === q.parole.length))(punteggioTesto(o, q))));
  const html = [];
  for (const f of FACCETTE) {
    const conta = new Map();
    for (const o of base) if (passa(o, C.filtri, f.k)) { const v = o.f[f.k]; if (v) conta.set(v, (conta.get(v) || 0) + 1); }
    const attivi = C.filtri[f.k] || new Set();
    for (const v of attivi) if (!conta.has(v)) conta.set(v, 0);
    if (conta.size < 2 && !attivi.size) continue;
    let V = [...conta.entries()];
    V.sort(f.numerica ? ((a, b) => numero(a[0]) - numero(b[0]) || a[0].localeCompare(b[0])) : ((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
    const tutte = C.aperte.has(f.k), LIM = 10;
    const vis = tutte ? V : V.filter((x, i) => i < LIM || attivi.has(x[0]));
    html.push(`<div class="fac"><div class="fn">${f.nome}${attivi.size ? `<button data-azz="${f.k}">azzera</button>` : ''}</div><div class="fv">` +
      vis.map(([v, n]) => `<button class="fc ${attivi.has(v) ? 'on' : ''} ${n ? '' : 'zero'}" data-k="${f.k}" data-v="${esc(v)}">${esc(v)}<i>${n}</i></button>`).join('') +
      (V.length > vis.length ? `<button class="fc piu" data-piu="${f.k}">+${V.length - vis.length}</button>` : (tutte && V.length > LIM ? `<button class="fc piu" data-piu="${f.k}">meno</button>` : '')) + '</div></div>');
  }
  $('#ccFiltri').innerHTML = html.join('') || '<p class="muted">Nessun filtro disponibile.</p>';
}
function disegnaLista(aggiungi = false) {
  const el = $('#ccLista');
  const da = aggiungi ? C.mostrati : 0, a = Math.min(C.lista.length, da + PASSO);
  const html = C.lista.slice(da, a).map((o, i) => rigaProdotto(o, da + i)).join('');
  if (aggiungi) { el.querySelector('.altri')?.remove(); el.insertAdjacentHTML('beforeend', html); } else { el.innerHTML = html; el.scrollTop = 0; }
  C.mostrati = a;
  if (!C.lista.length) el.innerHTML = '<div class="vuoto">Nessun prodotto con questi filtri. Togli un filtro o cambia le parole.</div>';
  else if (a < C.lista.length) el.insertAdjacentHTML('beforeend', `<button class="altri" data-a="altri">Mostra altri ${Math.min(PASSO, C.lista.length - a)} · ${C.lista.length - a} rimasti</button>`);
}
function barraScelti() {
  const n = C.scelti.size, b = $('#ccScelti');
  b.classList.toggle('su', n > 0);
  b.innerHTML = n ? `<b>${n}</b> ${n === 1 ? 'scheda selezionata' : 'schede selezionate'}<button class="btn" data-a="unisci">Scarica in un unico PDF</button><button class="btn ghost" data-a="svuota">Deseleziona</button>` : '';
}
function aggiornaCerca() {
  const q = calcola();
  const nf = Object.values(C.filtri).reduce((s, x) => s + x.size, 0);
  $('#ccConta').innerHTML = `<b>${C.lista.length.toLocaleString('it-IT')}</b> ${C.lista.length === 1 ? 'codice' : 'codici'}` +
    (C.pagina ? ` · <button class="lnk" data-azz="pagina">pagina ${C.pagina.p} del catalogo ${String(C.pagina.n).padStart(2, '0')} ✕</button>` : '') +
    (nf ? ` · <button class="lnk" data-azz="tutti">azzera ${nf} ${nf === 1 ? 'filtro' : 'filtri'}</button>` : '');
  disegnaFiltri(q); disegnaLista(); barraScelti();
}
export async function apriCerca(stato) {
  const { vai, toast } = D.ctx;
  vai('cerca');
  if (stato) { C.filtri = {}; for (const k in stato.filtri || {}) C.filtri[k] = new Set(stato.filtri[k]); C.testo = stato.testo || ''; C.pagina = stato.pagina || null; }
  $('#ccTesto').value = C.testo;
  if (!D.pronti) $('#ccLista').innerHTML = '<div class="vuoto"><div class="spinner"></div>Carico il database dei prodotti…</div>';
  try { await carica(); } catch (e) { $('#ccLista').innerHTML = avvisoDati(e); return; }
  aggiornaCerca();
  if (!matchMedia('(pointer: coarse)').matches) $('#ccTesto').focus();
}
function eventiCerca() {
  let t = 0;
  $('#ccTesto').addEventListener('input', e => { C.testo = e.target.value; clearTimeout(t); t = setTimeout(aggiornaCerca, 140); });
  $('#ccFiltri').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.piu) { C.aperte.has(b.dataset.piu) ? C.aperte.delete(b.dataset.piu) : C.aperte.add(b.dataset.piu); return aggiornaCerca(); }
    if (b.dataset.azz) { delete C.filtri[b.dataset.azz]; return aggiornaCerca(); }
    const { k, v } = b.dataset; if (!k) return;
    const s = C.filtri[k] || (C.filtri[k] = new Set());
    s.has(v) ? s.delete(v) : s.add(v);
    aggiornaCerca();
  });
  $('#ccConta').addEventListener('click', e => {
    const a = e.target.closest('[data-azz]')?.dataset.azz; if (!a) return;
    if (a === 'pagina') C.pagina = null; else { C.filtri = {}; }
    aggiornaCerca();
  });
  $('#ccLista').addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'altri') return disegnaLista(true);
    const r = e.target.closest('.pr'); if (!r) return;
    const o = C.lista[+r.dataset.i]; if (!o) return;
    if (a === 'pdf') return schedaPdf([o]);
    if (a === 'cat') return apriNelCatalogo(o);
    const id = o.c + '|' + o.n;                    // clic sulla riga o sulla spunta: seleziona
    C.scelti.has(id) ? C.scelti.delete(id) : C.scelti.set(id, o);
    r.classList.toggle('sel', C.scelti.has(id)); r.querySelector('.spunta').setAttribute('aria-pressed', C.scelti.has(id));
    barraScelti();
  });
  $('#ccScelti').addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'svuota') { C.scelti.clear(); aggiornaCerca(); }
    if (a === 'unisci') { const L = [...C.scelti.values()].sort((x, y) => x.n - y.n || x.p - y.p); schedaPdf(L, L.length === 1 ? null : `ELSAP_schede_${L.length}_codici.pdf`); }
  });
}

// ================================================================ INTERROGATORE
// Dalle parole alle caratteristiche. Ogni concetto: come si dice (in italiano e in inglese) → caratteristica e valori.
// 'alt' = più strade equivalenti (basta una); 'peso' serve a decidere cosa togliere per ultimo se non si trova niente.
const CONCETTI = [
  // tipo
  { rx: /\b(a|da) cablare\b|\bcablare\b|\bcablabil\w*|da montare|da assemblare|field (attachable|installable)|volante|sfus[oi]\b|senza cavo/, k: 'tipo', v: ['A cablare'], dico: 'a cablare (si monta sul cavo)' },
  { rx: /\bcon cavo\b|precablat\w*|pre-?assemblat\w*|sovrastampat\w*|costampat\w*|moldizzat\w*|cordset|prolunga|\bcavett[oi]\b|cavo gia|patch/, k: 'tipo', v: ['Con cavo', 'Cavo con due connettori'], dico: 'già con cavo' },
  { rx: /\bcav[oi]\b/, k: 'tipo', v: ['Con cavo', 'Cavo con due connettori'], dico: 'con cavo' },
  { rx: /due connettori|doppio connettore|maschio[- ]femmina|double[- ]ended|da entrambi i lati|prolunga/, k: 'tipo', v: ['Cavo con due connettori'], dico: 'cavo con due connettori' },
  { rx: /\bpannello\b|da incasso|incasso|flangia\w*|passaparete|\bpcb\b|circuito stampato|scheda elettronica|da scheda|receptacle|presa da quadro|a quadro|retro ?quadro/, k: 'tipo', v: ['Da pannello / PCB'], dico: 'da pannello o da scheda' },
  { rx: /adattator\w*|sdoppiator\w*|splitter|derivazione a t|\ba t\b/, k: 'tipo', v: ['Adattatore'], dico: 'adattatore' },
  { rx: /modul[oi] (i\/?o|di ingress\w+|remot\w+)|\bi\/o\b|ingressi e uscite|io-?link master|\bmaster\b/, k: 'tipo', v: ['Modulo I/O'], dico: 'modulo I/O' },
  { rx: /distributor\w*|ripartitor\w*|scatola di derivazione|box passiv\w*|multipresa/, k: 'tipo', v: ['Distributore'], dico: 'distributore passivo' },
  { rx: /accessori\w*|tapp[oi]\b|guarnizion\w*|cappucci\w*|ricambi\w*/, k: 'tipo', v: ['Accessori'], dico: 'accessori' },
  // formato
  { rx: /\bm ?(5|8|12|16|23|40)\b/, k: 'formato', v: m => ['M' + m[1]], dico: m => 'M' + m[1] },
  { rx: /7\/8/, k: 'formato', v: ['7/8"'], dico: '7/8"' },
  { rx: /\brj ?45\b/, k: 'formato', v: ['RJ45'], dico: 'RJ45' },
  { rx: /\b(forma|form|tipo|type) ([abc])\b/, k: 'formato', v: m => ['Forma ' + m[2].toUpperCase()], dico: m => 'forma ' + m[2].toUpperCase() },
  { rx: /x-?lok/, k: 'cat', v: () => catPerNumero(15), dico: 'X-Lok' },
  { rx: /\b(large|standard|middle|mini|micro) size\b/, k: 'formato', v: m => ['X-Lok ' + m[1][0].toUpperCase() + m[1].slice(1)], dico: m => 'X-Lok ' + m[1] },
  // codifica
  { rx: /\b([abdxlykst])[- ]?(cod\w*|codifica)\b|\bcodifica ([abdxlykst])\b/, k: 'codifica', v: m => [(m[1] || m[3]).toUpperCase()], dico: m => 'codifica ' + (m[1] || m[3]).toUpperCase() },
  // poli
  { rx: /\b(\d{1,2})\s?(poli|pin|contatti|vie|pol\b|pos\w*|fili|conduttori)\b|\b(poli|pin|contatti) (\d{1,2})\b/, k: 'poli', v: m => { const n = String(+(m[1] || m[4])); return [n, n + '+PE', (n - 1) + '+PE']; }, dico: m => (m[1] || m[4]) + ' poli' },
  // genere
  { rx: /\bfemmin\w*|\bfemale\b|\bpresa\b|con (i )?fori|bussol\w*/, k: 'genere', v: ['Femmina', 'Maschio + Femmina'], dico: 'femmina' },
  { rx: /\bmaschi\w*|\bmale\b|\bspina\b|spinott\w*|con (i )?pin\b/, k: 'genere', v: ['Maschio', 'Maschio + Femmina'], dico: 'maschio' },
  // uscita
  { rx: /90 ?°|90 gradi|\bangol\w*|a squadra|a gomito|\ba l\b|piegat\w*/, k: 'uscita', v: ['90°'], dico: 'uscita a 90°' },
  { rx: /\bdiritt\w*|\bdritt\w*|assial\w*|\blinear\w*|straight/, k: 'uscita', v: ['Diritto'], dico: 'uscita diritta' },
  // schermatura
  { rx: /non schermat\w*|senza scherm\w*|unshielded/, k: 'schermo', v: ['Non schermato'], dico: 'non schermato' },
  { rx: /schermat\w*|shielded|\bemc\b|disturbi (elettromagnetici|elettrici)|interferenz\w*/, k: 'schermo', v: ['Schermato'], dico: 'schermato' },
  // connessione
  { rx: /\ba vite\b|\bvite\b|morsett\w* a vite|screw/, k: 'conn', v: ['Vite'], dico: 'connessione a vite' },
  { rx: /\bcrimp\w*|a crimpare/, k: 'conn', v: ['Crimp'], dico: 'a crimpare' },
  { rx: /a saldare|saldatur\w*|\bsolder\w*/, k: 'conn', v: ['A saldare'], dico: 'a saldare' },
  { rx: /a molla|push-?in|senza attrezzi|innesto rapido dei fili/, k: 'conn', v: ['A molla', 'IDC'], dico: 'a molla / senza attrezzi' },
  { rx: /\bidc\b|perforazione/, k: 'conn', v: ['IDC'], dico: 'IDC' },
  // IP
  { rx: /\bip ?(\d{2}k?)\b/, k: 'ip', v: m => valoriCon('ip', 'IP' + m[1].toUpperCase()), dico: m => 'IP' + m[1].toUpperCase() },
  { rx: /lavaggi\w*|alta pressione|idropulitric\w*|alimentare|food|washdown/, k: 'ip', v: () => valoriCon('ip', 'IP69K'), dico: 'lavaggi ad alta pressione (IP69K)' },
  { rx: /imper?meabil\w*|stagn\w*|\bacqua\b|umid\w*|all'?aperto|esterno|pioggia|immersion\w*/, k: 'ip', v: () => [...valoriCon('ip', 'IP67'), ...valoriCon('ip', 'IP68'), ...valoriCon('ip', 'IP69K')], dico: 'protetto da acqua (IP67 o più)' },
  // materiale
  { rx: /\binox\b|acciaio inox|inossidabile/, k: 'mat', v: ['Inox'], dico: 'inox' },
  { rx: /metall\w*|ghiera metall\w*|\bottone\b/, k: 'mat', v: ['Metallo'], dico: 'metallo' },
  { rx: /plastic\w*/, k: 'mat', v: ['Plastica'], dico: 'plastica' },
  // tensione, corrente, lunghezza
  { rx: /\b(\d{2,4})\s?v(olt|ac|dc|cc|ca)?\b/, k: 'v', v: m => valoriNum('v', +m[1], 'min'), dico: m => `almeno ${m[1]} V` },
  { rx: /\b(\d{1,3}(?:[.,]\d)?)(a\b|\s?amp\w*)/, k: 'a', v: m => valoriNum('a', parseFloat(m[1].replace(',', '.')), 'min'), dico: m => `almeno ${m[1]} A` },
  { rx: /\b(\d{1,3}(?:[.,]\d+)?)\s?(m|mt|metri|metro)\b/, k: 'lung', v: m => valoriNum('lung', parseFloat(m[1].replace(',', '.')), 'uguale'), dico: m => `cavo da ${m[1]} m` },
  // protocolli e mondi applicativi
  { rx: /profibus/, alt: [{ k: 'proto', v: ['PROFIBUS'] }, { k: 'codifica', v: ['B'] }], dico: 'Profibus (codifica B)' },
  { rx: /profinet|ethercat|ethernet\/?ip|industrial ethernet/, alt: [{ k: 'proto', v: ['PROFINET', 'EtherCAT', 'EtherNet/IP', 'Ethernet', 'Ethernet Cat.5e', 'Ethernet Cat.6A', 'Ethernet Cat.6'] }, { k: 'codifica', v: ['D', 'X'] }, { k: 'formato', v: ['RJ45'] }], dico: 'Ethernet industriale' },
  { rx: /\bethernet\b|\bdati\b|\brete\b|\blan\b|trasmissione dati|\bcat\.? ?(5e?|6a?|7)\b|gigabit/, alt: [{ k: 'proto', v: ['Ethernet', 'Ethernet Cat.5e', 'Ethernet Cat.6A', 'Ethernet Cat.6', 'PROFINET', 'EtherCAT', 'EtherNet/IP', 'Single Pair Ethernet'] }, { k: 'codifica', v: ['D', 'X'] }, { k: 'formato', v: ['RJ45'] }], dico: 'dati / Ethernet' },
  { rx: /single pair|\bspe\b|monocoppia|una coppia/, alt: [{ k: 'proto', v: ['Single Pair Ethernet'] }, { k: 'cat', v: () => catPerNumero(9) }], dico: 'Single Pair Ethernet' },
  { rx: /io-?link/, alt: [{ k: 'proto', v: ['IO-Link'] }], dico: 'IO-Link' },
  { rx: /canopen|devicenet|\bcan\b/, alt: [{ k: 'proto', v: ['CANopen', 'DeviceNet'] }, { k: 'codifica', v: ['A'] }], dico: 'CAN / DeviceNet' },
  { rx: /\busb\b/, alt: [{ k: 'proto', v: ['USB'] }, { k: 'formato', v: ['USB'] }], dico: 'USB' },
  { rx: /alimentazion\w*|\bpotenza\b|\bpower\b|\bmotor\w*|azionament\w*|inverter|carico elettrico|forza motrice/, alt: [{ k: 'cat', v: () => catPerNumero(3) }, { k: 'codifica', v: ['L', 'K', 'S', 'T'] }, { k: 'formato', v: ['7/8"', 'RD24', 'M23', 'M40'] }], dico: 'alimentazione / potenza' },
  { rx: /sensor\w*|attuator\w*|fotocellul\w*|prossimit\w*|finecorsa|trasduttor\w*|encoder/, alt: [{ k: 'codifica', v: ['A'] }, { k: 'cat', v: () => [...catPerNumero(1), ...catPerNumero(8)] }], dico: 'sensori e attuatori' },
  { rx: /elettrovalvol\w*|valvol\w*|solenoid\w*|pneumatic\w*|idraulic\w*|oleodinamic\w*|bobin\w*/, alt: [{ k: 'cat', v: () => catPerNumero(7) }], dico: 'elettrovalvole' },
  { rx: /ferrovi\w*|\btren[oi]\b|rotabil\w*|railway|metropolitan\w*|\btram\b/, alt: [{ k: 'cat', v: () => catPerNumero(13) }], dico: 'ferroviario' },
  { rx: /sicurezza|safety|emergenza/, alt: [{ k: 'cat', v: () => catPerNumero(6) }], dico: 'sicurezza (Safety)' },
  { rx: /push-?pull|innesto rapido|aggancio rapido|sgancio rapido|senza avvitare|quick ?lock|baionetta/, alt: [{ k: 'cat', v: () => [...catPerNumero(14), ...catPerNumero(11), ...catPerNumero(15)] }], dico: 'innesto rapido' },
  { rx: /mpronto|m-?pronto/, alt: [{ k: 'cat', v: () => catPerNumero(14) }], dico: 'MPronto' },
  { rx: /quicklock/, alt: [{ k: 'cat', v: () => catPerNumero(11) }], dico: 'Quicklock' },
  { rx: /agricol\w*|movimento terra|macchine da cantiere|trattor\w*/, alt: [{ k: 'cat', v: () => catPerNumero(4) }], dico: 'macchine agricole e da cantiere' },
];
// parole che non dicono niente sul prodotto
const VUOTE = new Set('un uno una il lo la i gli le di del dello della dei degli delle a ad al allo alla ai agli alle da dal dalla in nel nella con su per tra fra e ed o che mi ci si serve servono cerco cercando vorrei voglio devo bisogno ho abbiamo avrei necessito trovare comprare acquistare ordinare tipo specifico specifica giusto giusti giusta adatto adatta adatti buono qualcosa prodotto prodotti articolo codice connettore connettori connessione connessioni applicazione applicazioni industriale industriali impianto impianti elettrico elettrici elettrica macchina macchine macchinario macchinari uso utilizzo sistema sistemi the for and with of to mio nostra nostro molto piu come quale quali essere deve devono sia sono anche ma se non'.split(' '));

function catPerNumero(n) { return D.cat[n] ? [`${String(n).padStart(2, '0')} · ${D.cat[n].nome}`] : []; }
const VAL = {};
function valori(k) { if (!VAL[k]) { const s = new Set(); for (const o of D.P) if (o.f[k]) s.add(o.f[k]); VAL[k] = [...s]; } return VAL[k]; }
function valoriCon(k, pezzo) { return valori(k).filter(v => v.includes(pezzo)); }
function valoriNum(k, x, modo) { return valori(k).filter(v => { const n = numero(v); return modo === 'min' ? n >= x && n < x * 40 : Math.abs(n - x) < 0.001; }); }

function interpreta(frase) {
  let t = ' ' + senzaAccenti(frase).replace(/["“”]/g, '"') + ' ';
  const vincoli = [];
  for (const c of CONCETTI) {
    const m = c.rx.exec(t);
    if (!m) continue;
    const alt = (c.alt || [{ k: c.k, v: c.v }]).map(a => ({ k: a.k, v: new Set(typeof a.v === 'function' ? a.v(m) : a.v) })).filter(a => a.v.size);
    t = t.replace(m[0], ' ');
    if (!alt.length) continue;
    const gia = vincoli.find(v => !c.alt && v.alt.length === 1 && v.alt[0].k === c.k && !v.multi);
    if (gia) { for (const x of alt[0].v) gia.alt[0].v.add(x); gia.dico += ' o ' + (typeof c.dico === 'function' ? c.dico(m) : c.dico); continue; }
    vincoli.push({ alt, dico: typeof c.dico === 'function' ? c.dico(m) : c.dico, largo: !!c.alt });
  }
  const resto = t.split(/[^a-z0-9/"-]+/).filter(w => w.length >= 3 && !VUOTE.has(w) && !/^\d+$/.test(w));
  return { vincoli, resto };
}
const vaBene = (o, v) => v.alt.some(a => a.v.has(o.f[a.k]));

const A = { frase: '', vincoli: [], resto: [], tolti: [], lista: [], gruppi: [], saltate: new Set() };
const AIUTO_CAT = { 1: 'connettori circolari M8 e M12 per sensori, attuatori e bus di campo', 2: 'connettori e cavi per reti dati: RJ45, patch cord', 3: 'connettori di alimentazione e potenza', 4: 'macchine agricole e da cantiere',
  5: 'moduli I/O, IO-Link e distributori', 6: 'moduli I/O di sicurezza', 7: 'connettori per elettrovalvole', 8: 'connettori da scheda e da pannello per sensori', 9: 'Ethernet a una sola coppia',
  11: 'connettori a innesto rapido', 13: 'connettori per il settore ferroviario', 14: 'M12 push-pull, si innesta senza avvitare', 15: 'connettori push-lock in sei taglie' };
const DOMANDE = [
  { k: 'cat', q: 'In quale famiglia di prodotti cerchi?', aiuto: v => AIUTO_CAT[parseInt(v, 10)] },
  { k: 'tipo', q: 'Come ti serve?', aiuto: { 'A cablare': 'lo monti tu sul cavo', 'Con cavo': 'già pronto, con il cavo attaccato', 'Cavo con due connettori': 'prolunga con un connettore per lato', 'Da pannello / PCB': 'si fissa sulla macchina, sul quadro o sulla scheda', 'Adattatore': 'collega due connettori diversi', 'Modulo I/O': 'raccoglie i segnali e li porta alla rete', 'Distributore': 'una scatola con più prese', 'Accessori': 'tappi, guarnizioni, ricambi' } },
  { k: 'formato', q: 'Che formato ha il connettore?', aiuto: { M8: 'piccolo, filetto da 8 mm', M12: 'il più diffuso, filetto da 12 mm', 'RJ45': 'la presa di rete classica', '7/8"': 'grosso, per alimentazione' } },
  { k: 'codifica', q: 'Che codifica (la forma dell\'innesto)?', aiuto: { A: 'sensori e attuatori', B: 'Profibus', D: 'Ethernet fino a 100 Mbit', X: 'Ethernet veloce, fino a 10 Gbit', L: 'alimentazione in continua', K: 'alimentazione in alternata', S: 'alimentazione in alternata', T: 'alimentazione in continua', Y: 'dati e alimentazione insieme' } },
  { k: 'poli', q: 'Quanti poli (contatti)?', numerica: true },
  { k: 'genere', q: 'Maschio o femmina?', aiuto: { Maschio: 'con i pin', Femmina: 'con i fori' } },
  { k: 'uscita', q: 'Uscita del cavo?', aiuto: { Diritto: 'in linea con il connettore', '90°': 'a squadra, occupa meno spazio davanti' } },
  { k: 'schermo', q: 'Serve la schermatura?', aiuto: { Schermato: 'protetto dai disturbi elettrici', 'Non schermato': 'per segnali normali' } },
  { k: 'lung', q: 'Che lunghezza di cavo?', numerica: true },
  { k: 'ip', q: 'Che grado di protezione?' },
];

function risolvi() {
  A.tolti = [];
  let V = [...A.vincoli];
  const filtra = () => D.P.filter(o => V.every(v => vaBene(o, v)));
  let L = filtra();
  // niente con tutte le richieste: tolgo una richiesta alla volta, partendo dalle più generiche
  while (!L.length && V.length > 1) {
    let migliore = null;
    for (const v of V) {
      const prova = D.P.filter(o => V.every(x => x === v || vaBene(o, x)));
      if (prova.length && (!migliore || (v.largo && !migliore.v.largo) || (v.largo === migliore.v.largo && prova.length > migliore.L.length))) migliore = { v, L: prova };
    }
    if (!migliore) { const v = V.find(x => x.largo) || V[V.length - 1]; A.tolti.push(v); V = V.filter(x => x !== v); L = filtra(); continue; }
    A.tolti.push(migliore.v); V = V.filter(x => x !== migliore.v); L = migliore.L;
  }
  // le parole non capite: se si trovano nei testi dei prodotti servono a ordinare (e a filtrare, se bastano)
  const trovabili = A.resto.filter(w => L.some(o => o._w.includes(w)));
  if (trovabili.length) {
    for (const o of L) { o._p = 0; for (const w of trovabili) if (o._w.includes(w)) o._p += 1; }
    const tutti = L.filter(o => o._p === trovabili.length);
    if (tutti.length >= 1 && V.length) L = tutti; else if (!V.length) L = L.filter(o => o._p > 0);
    L.sort((a, b) => b._p - a._p || a.n - b.n || a.p - b.p);
  }
  A.guidato = !V.length && !trovabili.length;       // niente di riconosciuto: si parte dalle domande, su tutti i prodotti
  A.usate = trovabili; A.attivi = V; A.lista = L;
  // raggruppo per scheda (catalogo + pagina + blocco)
  const G = new Map();
  for (const o of L) {
    const id = `${o.n}|${o.p}|${o.b}`;
    if (!G.has(id)) G.set(id, { o, lista: [] });
    G.get(id).lista.push(o);
  }
  A.gruppi = [...G.values()];
}
const aiuto = (d, v) => typeof d.aiuto === 'function' ? d.aiuto(v) : d.aiuto?.[v];
function domanda() {
  if (A.lista.length < 4) return null;
  for (const d of DOMANDE) {
    if (A.saltate.has(d.k) || A.attivi.some(v => v.alt.some(a => a.k === d.k) && !v.largo)) continue;
    const conta = new Map();
    for (const o of A.lista) { const v = o.f[d.k]; if (v) conta.set(v, (conta.get(v) || 0) + 1); }
    const copre = [...conta.values()].reduce((s, x) => s + x, 0) / A.lista.length;
    if (conta.size < 2 || copre < 0.5 || Math.max(...conta.values()) / A.lista.length > 0.97) continue;
    let V = [...conta.entries()];
    V.sort(d.numerica ? ((a, b) => numero(a[0]) - numero(b[0])) : ((a, b) => b[1] - a[1]));
    return { ...d, valori: V.slice(0, 14) };
  }
  return null;
}
function disegnaAI() {
  const el = $('#aiEsito');
  if (!A.frase.trim()) { el.innerHTML = ''; $('#aiEsempi').style.display = ''; return; }
  $('#aiEsempi').style.display = 'none';
  risolvi();
  const capito = A.vincoli.map((v, i) => `<button class="cap ${A.tolti.includes(v) ? 'tolto' : ''}" data-togli="${i}" title="Togli questa richiesta">${esc(v.dico)}<i>✕</i></button>`).join('');
  const nonCapite = A.resto.filter(w => !A.usate.includes(w));
  let h = `<div class="ai-capito"><span class="lab">Ho capito</span>${capito || '<span class="muted">nessuna caratteristica precisa</span>'}` +
    (A.usate.length ? `<span class="lab" style="margin-left:14px">cerco anche</span>${A.usate.map(w => `<span class="cap testo">${esc(w)}</span>`).join('')}` : '') + '</div>';
  if (nonCapite.length) h += `<div class="ai-nota">Non ho usato: ${nonCapite.map(esc).join(', ')} — nei cataloghi non trovo queste parole. Prova a dirlo in un altro modo o rispondi alle domande qui sotto.</div>`;
  if (A.tolti.length) h += `<div class="ai-nota forte">Nessun prodotto ha tutte le caratteristiche insieme: ho messo da parte «${A.tolti.map(v => esc(v.dico)).join('», «')}».</div>`;
  if (A.guidato) h += '<div class="ai-nota forte">Da queste parole non riconosco caratteristiche precise del prodotto. Nessun problema: rispondi alle domande qui sotto e ci arriviamo insieme.</div>';
  if (!A.lista.length) {
    h += '<div class="vuoto">Non trovo prodotti per questa richiesta. Prova con parole più semplici: che cosa devi collegare, quanti poli, con o senza cavo.</div>';
    el.innerHTML = h; return;
  }
  const d = domanda();
  if (d) h += `<div class="ai-domanda"><div class="q">${esc(d.q)}<button class="lnk" data-salta="${d.k}">non lo so, salta</button></div><div class="ops">` +
    d.valori.map(([v, n]) => `<button data-k="${d.k}" data-v="${esc(v)}"><b>${esc(d.k === 'poli' ? v + ' poli' : v)}</b>${aiuto(d, v) ? `<span>${esc(aiuto(d, v))}</span>` : ''}<i>${n}</i></button>`).join('') + '</div></div>';
  if (A.guidato && A.lista.length > 600) { el.innerHTML = h; return; }
  h += `<div class="ai-testa"><b>${A.lista.length.toLocaleString('it-IT')}</b> ${A.lista.length === 1 ? 'codice' : 'codici'} in <b>${A.gruppi.length}</b> ${A.gruppi.length === 1 ? 'scheda' : 'schede'}<button class="btn ghost" data-a="tutti">Apri tutti in Cerca codice →</button></div><div class="ai-griglia">`;
  h += A.gruppi.slice(0, 48).map((g, i) => {
    const o = g.o;
    return `<div class="fam" data-g="${i}"><div class="fs">${esc(o.f.cat)} · pag. ${o.p}</div>
      <h4>${esc(o.b || o.t || o.s[o.s.length - 1] || o.c)}</h4><p>${esc(o.s.slice(-2).join(' › '))}${o.d && g.lista.length === 1 ? ' — ' + esc(o.d) : ''}</p>
      <div class="ets">${etichette(o, 6)}</div>
      <div class="cods">${g.lista.slice(0, 3).map(x => `<span>${esc(x.c)}</span>`).join('')}${g.lista.length > 3 ? `<span class="piu">+${g.lista.length - 3}</span>` : ''}</div>
      <div class="az"><button data-a="pdf" class="pri">Scheda PDF</button><button data-a="codici">${g.lista.length === 1 ? 'Vedi il codice' : `Vedi i ${g.lista.length} codici`}</button><button data-a="cat">Catalogo</button></div></div>`;
  }).join('') + '</div>';
  if (A.gruppi.length > 48) h += `<p class="muted" style="margin:14px 2px 30px">Mostro le prime 48 schede: rispondi alle domande sopra per restringere, oppure apri tutto in Cerca codice.</p>`;
  el.innerHTML = h;
}
function chiedi(frase) {
  A.frase = frase; A.saltate.clear();
  const i = interpreta(frase);
  A.vincoli = i.vincoli; A.resto = i.resto;
  disegnaAI();
}
export async function apriAI() {
  const { vai, toast } = D.ctx;
  vai('ai');
  try { await carica(); } catch (e) { $('#aiEsito').innerHTML = avvisoDati(e); return; }
  if (!matchMedia('(pointer: coarse)').matches) $('#aiTesto').focus();
}
function filtriDaVincoli() {                 // per passare a Cerca codice: solo le richieste a una sola caratteristica
  const f = {};
  for (const v of A.attivi) if (v.alt.length === 1) f[v.alt[0].k] = [...v.alt[0].v];
  return f;
}
function eventiAI() {
  const invia = () => chiedi($('#aiTesto').value);
  $('#aiVai').onclick = invia;
  $('#aiTesto').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); invia(); } });
  $('#aiEsempi').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $('#aiTesto').value = b.textContent; invia(); });
  $('#aiEsito').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.togli != null) { A.vincoli.splice(+b.dataset.togli, 1); return disegnaAI(); }
    if (b.dataset.salta) { A.saltate.add(b.dataset.salta); return disegnaAI(); }
    if (b.dataset.k) {
      const d = DOMANDE.find(x => x.k === b.dataset.k), v = b.dataset.v;
      A.vincoli.push({ alt: [{ k: d.k, v: new Set([v]) }], dico: d.k === 'poli' ? v + ' poli' : (d.k === 'cat' ? v.replace(/^\d+ · /, '') : v), largo: false });
      return disegnaAI();
    }
    if (b.dataset.a === 'tutti') return apriCerca({ filtri: filtriDaVincoli(), testo: A.attivi.some(v => v.alt.length > 1) ? '' : A.usate.join(' ') });
    const g = A.gruppi[+b.closest('.fam')?.dataset.g]; if (!g) return;
    if (b.dataset.a === 'pdf') return schedaPdf([g.o]);
    if (b.dataset.a === 'cat') return apriNelCatalogo(g.o);
    if (b.dataset.a === 'codici') return apriCerca({ filtri: {}, testo: '', pagina: { n: g.o.n, p: g.o.p } });
  });
}

export function avviaCerca(ctx) {
  D.ctx = ctx;
  eventiCerca(); eventiAI();
}

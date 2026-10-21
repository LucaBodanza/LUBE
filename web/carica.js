// ELSAP DSGN — pannello "Carica catalogo" (solo Admin DEV, versione web riservata)
// 1) trascini il PDF finito → qui si legge (pagine, segnalibri, sezioni, codici, marchio, copertina)
// 2) a destra i dati del catalogo, già compilati dal nome del file e dal contenuto
// 3) Pubblica → il PDF viene CIFRATO qui e caricato su GitHub in _carica/; GitHub Actions (_strumenti/carica.py) fa il resto
//    con gli stessi programmi del Mac: catalogo, sotto-cataloghi, ricerca codici, database, cifratura, sito online.
import * as pdfjs from './vendor/pdf.min.mjs';
import { COMPARTI, compartoDi } from './comparti.js';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;

const REPO = 'LucaBodanza/LUBE', RAMO = 'main', MAX_MB = 95;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const b64 = u => { let s = ''; const a = new Uint8Array(u); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };
const ub64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const TE = new TextEncoder(), TD = new TextDecoder();
const pulito = t => String(t).replace(/[^\p{L}\p{N}.-]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 70) || 'catalogo';
const MARCHI = ['Amphenol Tuchel', 'Amphenol', 'Lumberg Automation', 'Belden', 'Hirschmann', 'CONEC', 'HELUKABEL', 'Murrelektronik', 'binder', 'Phoenix Contact', 'HARTING', 'Weidmüller', 'LAPP', 'TE Connectivity', 'Molex', 'ESCHA', 'Turck'];
const ICO = {
  su: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M24 38V11M12 22l12-12 12 12"/></svg>',
  gh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.2 11 15.8 7M8.2 13l7.6 4"/></svg>',
  lucc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
  srv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 10 12 4l8 6v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M9.5 20v-5h5v5"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
};

let S = null, ACC = null, F = null, CAT = [], LETTO = null;

// ---------------------------------------------------------------- token GitHub: solo su questo dispositivo, cifrato con la chiave dei dati
async function token() {
  try { const t = JSON.parse(localStorage.getItem('elsap.gh') || 'null'); if (!t) return null; return TD.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ub64(t.v) }, S.chiave, ub64(t.w))); } catch (e) { return null; }
}
async function salvaToken(t) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  localStorage.setItem('elsap.gh', JSON.stringify({ v: b64(iv), w: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, S.scrivi, TE.encode(t))) }));
}
async function gh(u, o = {}) {
  const t = await token();
  const r = await fetch(u.startsWith('http') ? u : `https://api.github.com/repos/${REPO}/${u}`, { ...o, headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}), Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${j.message || ''}`);
  return j;
}

// ---------------------------------------------------------------- cifratura ELSAPEC1 (stesso formato di build_pwa.py)
async function cifra(dati, avanza) {
  const C = 1 << 18, nonce = crypto.getRandomValues(new Uint8Array(8)), n = Math.ceil(dati.length / C);
  const out = new Uint8Array(32 + dati.length + 16 * n);
  out.set(TE.encode('ELSAPEC1')); const dv = new DataView(out.buffer);
  dv.setUint32(8, C); dv.setUint32(12, Math.floor(dati.length / 4294967296)); dv.setUint32(16, dati.length >>> 0); out.set(nonce, 20);
  let p = 32;
  for (let i = 0; i < n; i++) {
    const iv = new Uint8Array(12); iv.set(nonce); new DataView(iv.buffer).setUint32(8, i);
    const b = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, S.scrivi, dati.subarray(i * C, (i + 1) * C)));
    out.set(b, p); p += b.length;
    if (i % 8 === 0) avanza?.(i / n);
  }
  return out;
}

// ---------------------------------------------------------------- lettura del PDF (solo per mostrare e precompilare: il lavoro vero lo fa il server)
function dalNome(nome) {
  const base = nome.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim();
  const m = /^(\d{1,3})\s*[-·.]?\s*(.*)$/.exec(base);
  let num = m ? +m[1] : null, resto = (m ? m[2] : base).replace(/\b(catalogo|catalog|serie|series)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  resto = resto.replace(/\b(v\d+|def|definitivo|finale|final)\b/gi, '').trim();
  return { num, nome: resto };
}
async function leggiPdf(file, ui) {
  const dati = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: dati.slice() }).promise;
  ui.voce('pagine', `${doc.numPages} pagine`);
  // segnalibri → [{titolo, pagina, livello}]
  const seg = [];
  async function giro(voci, liv) {
    for (const v of voci || []) {
      try {
        let d = v.dest; if (typeof d === 'string') d = await doc.getDestination(d);
        if (Array.isArray(d)) seg.push({ titolo: v.title.replace(/\s+/g, ' ').trim(), pagina: (await doc.getPageIndex(d[0])) + 1, livello: liv });
      } catch (e) { /* segnalibro senza destinazione */ }
      await giro(v.items, liv + 1);
    }
  }
  await giro(await doc.getOutline(), 1);
  ui.voce('seg', seg.length ? `${seg.length} segnalibri` : 'nessun segnalibro (niente sotto-cataloghi automatici)', !seg.length);
  // copertina
  const p1 = await doc.getPage(1), vp = p1.getViewport({ scale: 1 }), sc = 420 / vp.width, cv = document.createElement('canvas');
  cv.width = 420; cv.height = Math.round(vp.height * sc);
  await p1.render({ canvasContext: cv.getContext('2d'), viewport: p1.getViewport({ scale: sc }) }).promise;
  ui.copertina(cv.toDataURL('image/jpeg', .85));
  // testo: codici e marchio
  const codici = new Set(), marchi = new Map();
  for (let i = 1; i <= doc.numPages; i++) {
    const t = (await (await doc.getPage(i)).getTextContent()).items.map(x => x.str).join(' ');
    for (const m of t.matchAll(/\b([A-Z]\d{3}) (\d{2}[A-Z]\d{3}) (\d{3}) (\d{2})\b/g)) codici.add(m.slice(1).join(''));
    for (const w of t.split(/\s+/)) { const x = w.replace(/^[.,;:()[\]•·|]+|[.,;:()[\]•·|]+$/g, ''); if (/^[A-Z0-9][A-Z0-9\-_./+]{5,39}$/.test(x) && /\d/.test(x) && /[A-Z]/.test(x) && !/^(IP\d|M\d|ISO|EN\d|IEC|UL\d|AWG)/.test(x)) codici.add(x); }
    for (const mc of MARCHI) { const n = t.split(mc).length - 1; if (n) marchi.set(mc, (marchi.get(mc) || 0) + n); }
    if (i % 4 === 0 || i === doc.numPages) ui.avanza(i / doc.numPages, `Leggo il testo · pagina ${i}/${doc.numPages}`);
  }
  ui.voce('cod', `circa ${codici.size} codici articolo`);
  const marchio = [...marchi].sort((a, b) => b[1] - a[1]).map(x => x[0]).find((x, i, a) => !(x === 'Amphenol' && a.includes('Amphenol Tuchel')));
  ui.voce('marchio', marchio ? `marchio: ${marchio}` : 'marchio non trovato nel testo', !marchio);
  return { dati, pagine: doc.numPages, seg, marchio };
}

// ---------------------------------------------------------------- interfaccia
export async function apri(sess, acc) {
  S = sess; ACC = acc;
  document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="web/carica.css">');
  let el = $('#carica'); el?.remove();
  el = document.createElement('section'); el.id = 'carica';
  el.innerHTML = `
  <div class="cg-bolle"><i></i><i></i><i></i></div>
  <div class="cg-vetro cg-main">
    <button class="cg-x" title="Chiudi">✕</button>
    <div class="cg-testa"><span class="cg-logo"></span><div><b>Carica catalogo</b><span class="lab">Admin DEV · ELSAP DSGN</span></div></div>
    <div class="cg-corpo">
      <div class="cg-sx">
        <label class="cg-drop" tabindex="0"><input type="file" accept="application/pdf" hidden>
          <span class="cg-freccia">${ICO.su}</span>
          <b>Trascina qui il PDF del catalogo</b><span class="lab">oppure clicca · PDF finito, max ${MAX_MB} MB</span>
        </label>
        <div class="cg-lettura" hidden>
          <div class="cg-file"><img class="cg-cop" alt=""><div><b class="cg-nome"></b><span class="lab cg-peso"></span></div></div>
          <div class="cg-barra"><i></i></div><div class="lab cg-stato"></div>
          <ul class="cg-voci"></ul>
        </div>
      </div>
      <form class="cg-dx cg-vetro" hidden></form>
    </div>
    <div class="cg-orbs">
      <button class="cg-orb blu" data-o="gh" title="GitHub">${ICO.gh}</button>
      <button class="cg-orb rosso" data-o="key" title="Cifratura">${ICO.lucc}</button>
      <button class="cg-orb giallo" data-o="srv" title="Server di elaborazione">${ICO.srv}</button>
    </div>
    <div class="cg-orb-info lab"></div>
  </div>`;
  document.body.appendChild(el);
  $('.cg-logo', el).innerHTML = await fetch('web/img/logo.svg').then(r => r.text()).catch(() => '');
  requestAnimationFrame(() => el.classList.add('su'));
  $('.cg-x', el).onclick = () => { el.classList.remove('su'); setTimeout(() => el.remove(), 500); };
  try { CAT = await fetch('dati/cataloghi.json').then(r => r.json()); } catch (e) { CAT = []; }
  stati();
  const drop = $('.cg-drop', el), inp = $('input', drop);
  inp.onchange = () => inp.files[0] && scelto(inp.files[0]);
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('su'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('su'); }));
  drop.addEventListener('drop', e => { const f = [...e.dataTransfer.files].find(x => /\.pdf$/i.test(x.name)); if (f) scelto(f); });
  el.querySelectorAll('.cg-orb').forEach(b => b.onclick = () => orb(b.dataset.o));
}

async function stati() {
  const el = $('#carica'), t = await token();
  const set = (o, ok, msg) => { const b = $(`.cg-orb[data-o="${o}"]`, el); b.classList.toggle('ok', ok); b.classList.toggle('no', !ok); b.dataset.msg = msg; };
  set('key', !!S.scrivi, S.scrivi ? 'Cifratura pronta su questo dispositivo' : 'Esci e rientra con la password per attivare la cifratura');
  set('gh', !!t, t ? 'Token GitHub salvato (cifrato) su questo dispositivo' : 'Manca il token GitHub: clicca il cerchio blu');
  let srv = false;
  try { const w = await gh('actions/workflows'); srv = (w.workflows || []).some(x => /carica/i.test(x.path)); } catch (e) { /* senza token o senza rete */ }
  set('srv', srv, srv ? 'Elaborazione su GitHub pronta' : 'Elaborazione non raggiungibile (manca il token o il file .github/workflows/carica.yml)');
  $('.cg-orb-info', el).textContent = ['gh', 'key', 'srv'].every(o => $(`.cg-orb[data-o="${o}"]`, el).classList.contains('ok')) ? 'Tutto pronto' : 'Tocca un cerchio per i dettagli';
}
async function orb(o) {
  const el = $('#carica'), b = $(`.cg-orb[data-o="${o}"]`, el), info = $('.cg-orb-info', el);
  info.textContent = b.dataset.msg || '';
  if (o === 'gh' && S.scrivi) {
    const t = prompt('Token GitHub (fine-grained, solo repository LUBE · Contents: Read and write · Actions: Read). Resta solo su questo dispositivo, cifrato.');
    if (t && t.trim()) { await salvaToken(t.trim()); await stati(); }
  }
}

function uiLettura(file) {
  const el = $('#carica');
  $('.cg-drop', el).hidden = true; $('.cg-lettura', el).hidden = false;
  $('.cg-nome', el).textContent = file.name; $('.cg-peso', el).textContent = `${(file.size / 1048576).toFixed(1)} MB`;
  $('.cg-voci', el).innerHTML = ''; el.classList.add('aperto');
  return {
    voce(k, t, avviso) { $('.cg-voci', el).insertAdjacentHTML('beforeend', `<li class="${avviso ? 'avv' : ''}" style="--d:${$('.cg-voci', el).children.length * 60}ms"><span>${avviso ? '!' : ICO.ok}</span>${esc(t)}</li>`); },
    avanza(f, t) { $('.cg-barra i', el).style.width = `${Math.round(f * 100)}%`; if (t) $('.cg-stato', el).textContent = t; },
    copertina(u) { $('.cg-cop', el).src = u; },
  };
}

async function scelto(file) {
  if (!S.scrivi) return alert('Esci e rientra con la password: serve per attivare la cifratura su questo dispositivo.');
  F = file;
  const ui = uiLettura(file);
  if (file.size > MAX_MB * 1048576) ui.voce('peso', `File di ${(file.size / 1048576).toFixed(0)} MB: GitHub accetta al massimo 100 MB. Riesporta compresso.`, true);
  ui.avanza(.02, 'Apro il PDF…');
  try { LETTO = await leggiPdf(file, ui); } catch (e) { ui.voce('err', 'PDF non leggibile: ' + e.message, true); return; }
  ui.avanza(1, 'Lettura completata');
  modulo(file);
}

function modulo(file) {
  const el = $('#carica'), f = $('.cg-dx', el), dn = dalNome(file.name), L = LETTO;
  const es = dn.num != null ? CAT.find(c => c.numero === dn.num) : null;
  const num = dn.num ?? (Math.max(0, ...CAT.map(c => c.numero)) + 1);
  const nome = es && (!dn.nome || dn.nome.toLowerCase().replace(/[^a-z0-9]/g, '') === es.nome.toLowerCase().replace(/[^a-z0-9]/g, '')) ? es.nome : (dn.nome || es?.nome || '');
  const capi = L.seg.filter(s => s.livello === 1 && !/^(indice|index|sommario|contents?)$/i.test(s.titolo));
  const sottot = [...new Set(capi.map(s => s.titolo === s.titolo.toUpperCase() ? s.titolo.toLowerCase().replace(/(^|[\s-])\p{L}/gu, x => x.toUpperCase()) : s.titolo))].join(' · ').slice(0, 140);
  const marchi = (es?.marchi?.length ? es.marchi : (L.marchio ? [L.marchio] : [])).join(', ');
  const tutti = [...new Set([...MARCHI, ...CAT.flatMap(c => c.marchi || [])])];
  f.innerHTML = `
    <div class="cg-dove lab"></div>
    <div class="cg-r2"><label>Numero<input name="numero" type="number" min="1" max="99" value="${num}" required></label>
      <label class="lungo">Nome del catalogo<input name="nome" value="${esc(nome)}" required></label></div>
    <label>Comparto<select name="comparto">${COMPARTI.map(c => `<option value="${c.id}" ${c.id === compartoDi(es) ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
    <label>Sottotitolo <span class="lab">(vuoto = dalle sezioni del PDF)</span><input name="sottotitolo" value="${esc(es?.sottotitolo && es.sottotitolo !== sottot ? es.sottotitolo : '')}" placeholder="${esc(sottot)}"></label>
    <label>Marchio<input name="marchi" value="${esc(marchi)}" list="cgMarchi" placeholder="es. Amphenol Tuchel"><datalist id="cgMarchi">${tutti.map(m => `<option value="${esc(m)}">`).join('')}</datalist></label>
    <div class="cg-r2 due"><label>Sotto-cataloghi dai segnalibri<select name="livello"><option value="1">livello 1 (${capi.length} sezioni)</option><option value="2">livello 2 (${L.seg.filter(s => s.livello === 2).length})</option><option value="0">nessuno</option></select></label>
      <label>Foto della sezione<select name="foto_dopo"><option value="1">pagina dopo il divisorio</option><option value="0">prima pagina della sezione</option></select></label></div>
    <label class="cg-ck"><input type="checkbox" name="provvisoria"> Versione provvisoria (bollino sul catalogo)</label>
    <div class="cg-sezioni">${capi.map(s => `<span>${esc(s.titolo)} <i>p.${s.pagina}</i></span>`).join('')}</div>
    <div class="cg-azioni"><button type="button" class="btn ghost cg-altro">Altro file</button><button class="btn cg-pub">Pubblica sul sito →</button></div>
    <div class="cg-passi" hidden></div>`;
  f.hidden = false;
  const dove = () => {
    const n = +f.numero.value, x = CAT.find(c => c.numero === n), prima = CAT.filter(c => c.numero < n).pop();
    if (x) f.comparto.value = compartoDi(x);
    $('.cg-dove', f).innerHTML = x ? `Sostituisce <b>${String(n).padStart(2, '0')} · ${esc(x.nome)}</b>` : `Nuovo catalogo <b>${String(n).padStart(2, '0')}</b>${prima ? ` · va dopo ${String(prima.numero).padStart(2, '0')} · ${esc(prima.nome)}` : ''}`;
  };
  f.numero.oninput = dove; dove();
  $('.cg-altro', f).onclick = () => apri(S, ACC);
  f.onsubmit = e => { e.preventDefault(); pubblica(f); };
}

// ---------------------------------------------------------------- pubblicazione
async function pubblica(f) {
  const passi = $('.cg-passi', f), btn = $('.cg-pub', f);
  if (!(await token())) return alert('Prima salva il token GitHub (cerchio blu).');
  if (F.size > MAX_MB * 1048576) return alert('Il PDF supera il limite di GitHub (100 MB).');
  const n = +f.numero.value, x = CAT.find(c => c.numero === n), nome = f.nome.value.trim();
  const slug = x ? x.slug : `${String(n).padStart(2, '0')}_${pulito(nome)}`;
  const liv = +f.livello.value;
  const scheda = { numero: n, slug, nome, comparto: f.comparto.value, sottotitolo: f.sottotitolo.value.trim(), marchi: f.marchi.value.split(',').map(s => s.trim()).filter(Boolean),
    provvisoria: f.provvisoria.checked, ...(liv ? { sotto: { tipo: 'segnalibri', livello: liv, nome: 'sezioni', foto_dopo: +f.foto_dopo.value } } : {}),
    file_originale: F.name, caricato: new Date().toISOString() };
  btn.disabled = true; f.classList.add('lavora'); passi.hidden = false;
  const P = [['cifra', 'Cifro il PDF su questo dispositivo'], ['invia', 'Invio a GitHub'], ['srv', 'Elaborazione sul server'], ['web', 'Il sito si aggiorna']];
  passi.innerHTML = P.map(([k, t]) => `<div class="cg-p" data-k="${k}"><span class="pt"></span><b>${t}</b><i></i><div class="sub"></div></div>`).join('');
  const st = (k, s, sub, pc) => { const p = $(`.cg-p[data-k="${k}"]`, passi); p.className = `cg-p ${s}`; if (sub != null) $('.sub', p).innerHTML = sub; if (pc != null) $('i', p).style.width = `${pc}%`; };
  try {
    st('cifra', 'va', '', 0);
    const enc = await cifra(LETTO.dati, q => st('cifra', 'va', null, q * 100));
    st('cifra', 'ok', `${(enc.length / 1048576).toFixed(1)} MB cifrati`, 100);
    st('invia', 'va', 'carico il file…', 20);
    const ref = await gh(`git/ref/heads/${RAMO}`), base = await gh(`git/commits/${ref.object.sha}`);
    const blob = await gh('git/blobs', { method: 'POST', body: JSON.stringify({ content: b64(enc), encoding: 'base64' }) });
    st('invia', 'va', 'scheda del catalogo…', 75);
    const bj = await gh('git/blobs', { method: 'POST', body: JSON.stringify({ content: b64(TE.encode(JSON.stringify(scheda, null, 1))), encoding: 'base64' }) });
    const tree = await gh('git/trees', { method: 'POST', body: JSON.stringify({ base_tree: base.tree.sha, tree: [
      { path: `_carica/${slug}.pdf.enc`, mode: '100644', type: 'blob', sha: blob.sha }, { path: `_carica/${slug}.json`, mode: '100644', type: 'blob', sha: bj.sha }] }) });
    const c = await gh('git/commits', { method: 'POST', body: JSON.stringify({ message: `Carica ${String(n).padStart(2, '0')} ${nome}`, tree: tree.sha, parents: [ref.object.sha] }) });
    await gh(`git/refs/heads/${RAMO}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
    st('invia', 'ok', `commit ${c.sha.slice(0, 7)}`, 100);
    // elaborazione: si seguono i passi del workflow
    st('srv', 'va', 'in coda…', 3);
    let run = null;
    for (let i = 0; i < 400; i++) {
      await new Promise(r => setTimeout(r, run ? 3000 : 4000));
      if (!run) { const rr = await gh(`actions/runs?head_sha=${c.sha}`); run = (rr.workflow_runs || []).find(r => /carica/i.test(r.name) || /carica/i.test(r.path || '')); if (!run) continue; }
      const jj = await gh(`actions/runs/${run.id}/jobs`), job = (jj.jobs || [])[0];
      const steps = (job?.steps || []).filter(s => !/^(Set up job|Post |Complete job)/.test(s.name));
      const fatti = steps.filter(s => s.status === 'completed').length, ora = steps.find(s => s.status === 'in_progress');
      st('srv', 'va', steps.map(s => `<span class="${s.conclusion === 'success' ? 'ok' : s.status === 'in_progress' ? 'va' : s.conclusion ? 'ko' : ''}">${esc(s.name)}</span>`).join(''), steps.length ? Math.max(5, fatti / steps.length * 100) : 5);
      if (job?.status === 'completed') {
        if (job.conclusion !== 'success') throw new Error(`il server si è fermato a "${(steps.find(s => s.conclusion === 'failure') || {}).name || 'un passo'}" · dettagli su GitHub → Actions`);
        break;
      }
    }
    st('srv', 'ok', null, 100);
    st('web', 'va', 'GitHub Pages pubblica la nuova versione…', 30);
    const t0 = Date.now();
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const rr = await gh('actions/runs?per_page=5');
      const pg = (rr.workflow_runs || []).find(r => /pages/i.test(r.name) && Date.parse(r.created_at) >= t0 - 120000);
      if (pg) { st('web', 'va', `GitHub Pages: ${pg.status === 'completed' ? 'fatto' : 'in corso'}`, pg.status === 'completed' ? 100 : 60); if (pg.status === 'completed') break; }
    }
    st('web', 'ok', 'Online ✓ · ricarica il sito (2 volte) per vederlo', 100);
    btn.textContent = 'Pubblicato ✓';
  } catch (e) {
    const k = [...passi.querySelectorAll('.cg-p')].find(p => p.classList.contains('va'))?.dataset.k || 'invia';
    st(k, 'ko', esc(e.message));
    btn.disabled = false; btn.textContent = 'Riprova';
  }
  f.classList.remove('lavora');
}

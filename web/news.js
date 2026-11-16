// ELSAP DSGN — News dai produttori (idea di Michele, 21/10/2026)
// I dati li prepara GitHub Actions ogni ora (_strumenti/news.py → dati/news.json, cifrato come gli altri dati).
// Qui: un riquadro per marchio con le novità divise per tipo, collegate ai cataloghi ELSAP; pallino con le novità non ancora viste.
import { trovaComparto, compartoDi, stileComparto, nn2 } from './comparti.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nn = n => String(n).padStart(2, '0');
const slug = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const TIPI = {
  nuovo: { nome: 'Nuovo prodotto', gruppo: 'nuovi', colore: '#57C38A' },
  tolto: { nome: 'Non più a catalogo', gruppo: 'cambi', colore: '#F0605D' },
  cambiato: { nome: 'Famiglia rinominata', gruppo: 'cambi', colore: '#F2A33A' },
  famiglia: { nome: 'Pagina famiglia', gruppo: 'cambi', colore: '#F0605D' },
  comunicato: { nome: 'Comunicato', gruppo: 'comunicati', colore: '#6CC0F5' },
  fonte: { nome: 'Fonte', gruppo: 'stato', colore: '#66788B' },
};
const FILTRI = [['tutto', 'Tutto'], ['comunicato', 'Comunicati'], ['nuovo', 'Nuovi'], ['tolto', 'Tolti'], ['cambiato', 'Rinominati'], ['famiglia', 'Famiglie']];   // un filtro per tipo di evento
// Elenco ufficiale dei brand per sezione + loghi: web/schemi/marchi.json (loghi in web/img/marchi/<slug>.png).
// Per sostituire un logo con uno migliore: stesso nome file (anche .svg: cambiare l'estensione in `logo` del brand).
let REG = null;
const leggiMarchi = async () => { try { REG = await (await fetch('web/schemi/marchi.json')).json(); } catch (e) { REG = null; } };
const PERIODI = [['30', '30 giorni'], ['90', '3 mesi'], ['180', '6 mesi'], ['365', '12 mesi']];     // quanto indietro si guarda (il bot conserva 12 mesi)
const leggiPeriodo = () => { try { const v = localStorage.getItem('elsap.news.periodo'); return PERIODI.some(x => x[0] === v) ? +v : 90; } catch (e) { return 90; } };
const iniziali = t => String(t).split(/\s+/).filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase();

let X = null;
const N = { dati: null, filtro: 'tutto', aperto: new Set(), soloNuove: false, visto: null, periodo: leggiPeriodo() };
const eff = e => e.data || e.quando;                                    // data della notizia, o di quando l'abbiamo vista
const nelPeriodo = e => (Date.now() - Date.parse(eff(e))) / 864e5 <= N.periodo;
const leggiVisto = () => { try { return localStorage.getItem('elsap.news.visto') || ''; } catch (e) { return ''; } };
const salvaVisto = v => { try { localStorage.setItem('elsap.news.visto', v); } catch (e) { /* non salvato */ } };
const nuovo = e => !e.iniziale && e.tipo !== 'fonte' && e.quando > (N.visto || '');
const quando = (iso, breve) => {
  if (!iso) return 'già pubblicata';
  const d = new Date(iso), ore = (Date.now() - d) / 36e5;
  if (ore < 1) return 'meno di un\'ora fa';
  if (ore < 24) return `${Math.floor(ore)} ${Math.floor(ore) === 1 ? 'ora' : 'ore'} fa`;
  return d.toLocaleDateString('it-IT', breve ? { day: '2-digit', month: 'short' } : { day: '2-digit', month: 'short', year: 'numeric' });
};

// ---- stato del controllo automatico (letto da GitHub, repo pubblico) e pulsante «Cerca ora» (solo dove c'è il token GitHub salvato)
const API = 'https://api.github.com/repos/LucaBodanza/LUBE/actions/workflows/news.yml';
const attesa = ms => new Promise(r => setTimeout(r, ms));
async function gh(url, o = {}, conToken = false) {
  const t = conToken ? await window.elsapToken?.() : null;
  const r = await fetch(url, { ...o, headers: { Accept: 'application/vnd.github+json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(o.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.message || r.status); e.stato = r.status; throw e; }
  return j;
}
const fa = iso => { const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 6e4)); return m < 2 ? 'adesso' : m < 90 ? `${m} min fa` : `${Math.round(m / 60)} ore fa`; };
async function statoGiri(msg = '') {
  const box = $('#nwStato'); if (!box) return;
  let L = [];
  try { L = (await gh(`${API}/runs?per_page=10`)).workflow_runs || []; } catch (e) { box.innerHTML = ''; return; }   // GitHub non raggiungibile o limite richieste: nessun avviso
  const fin = L.find(x => x.status === 'completed'), corso = L.find(x => x.status !== 'completed');
  const ore = fin ? (Date.now() - Date.parse(fin.updated_at)) / 36e5 : Infinity;
  const bene = fin && fin.conclusion === 'success' && ore < 2;       // il giro è ogni 30 min: oltre 2 ore qualcosa non va
  const tok = !!(await window.elsapToken?.());
  box.innerHTML = (bene ? `<span class="nw-ok">Ultimo controllo ${fa(fin.updated_at)}</span>`
      : `<span class="nw-err">${fin ? `Il controllo automatico non risulta in funzione (ultimo: ${fa(fin.updated_at)}${fin.conclusion !== 'success' ? ', con errore' : ''})` : 'Nessun controllo eseguito finora'}</span>`)
    + (corso ? '<span>· un giro è in corso</span>' : '')
    + `<span class="nw-msg">${esc(msg)}</span>`
    + (tok ? '<button class="btn ghost" data-cerca="orario">Cerca ora</button><button class="btn ghost" data-cerca="notte" title="Entra in tutte le famiglie: dura circa un quarto d\'ora">Ricerca profonda</button>'
           : '<span class="muted">· prossimo controllo automatico entro 30 minuti</span>');
}
async function cercaOra(modo) {
  const box = $('#nwStato'), msg = t => { const m = $('.nw-msg', box); if (m) m.textContent = t; };
  box.querySelectorAll('button').forEach(b => b.disabled = true);
  const t0 = Date.now(), prima = N.dati?.aggiornato || '', n0 = N.dati?.eventi.length || 0;
  try { await gh(`${API}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main', inputs: { modo } }) }, true); }
  catch (e) { return statoGiri([401, 403, 404].includes(e.stato) ? 'Il token non può avviare i controlli: serve il permesso «Actions: Read and write».' : 'Non riesco ad avviare il controllo: ' + e.message); }
  msg('Controllo avviato…');
  let run = null;
  for (let i = 0; i < 120 && !(run && run.status === 'completed'); i++) {            // fino a ~15 minuti (la ricerca profonda è lunga)
    await attesa(i < 3 ? 4000 : 8000);
    try { run = ((await gh(`${API}/runs?event=workflow_dispatch&per_page=5`, {}, true)).workflow_runs || []).find(x => Date.parse(x.created_at) >= t0 - 15000) || run; } catch (e) { /* riprovo */ }
    if (run) msg(run.status === 'completed' ? 'Giro concluso…' : run.status === 'queued' ? 'In coda (un altro giro è in corso)…' : 'Sto leggendo i siti dei produttori…');
  }
  if (!run || run.status !== 'completed') return statoGiri('Il controllo sta durando più del previsto: riprova tra poco.');
  if (run.conclusion !== 'success') return statoGiri('Il giro è finito con un errore (vedi Actions su GitHub).');
  msg('Aspetto la pubblicazione sul sito…');
  for (let i = 0; i < 24; i++) {                                                      // il sito si aggiorna 1-2 minuti dopo il giro
    await carica();
    if (N.dati && (N.dati.aggiornato !== prima || N.dati.eventi.length !== n0)) { disegna(); return statoGiri(`Aggiornato: ${Math.max(0, N.dati.eventi.length - n0)} novità.`); }
    await attesa(10000);
  }
  statoGiri('Controllo fatto: nessuna novità.');
}

async function carica() {
  try {
    const r = await fetch('dati/news.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    N.dati = await r.json();
  } catch (e) { N.dati = null; }
  pallino();
}
function pallino() {
  const n = N.dati ? N.dati.eventi.filter(nuovo).length : 0;
  document.querySelectorAll('.nw-n').forEach(b => { b.textContent = n > 99 ? '99+' : n; b.hidden = !n; });
}

function marchio(m) {
  return m.slug ? `<span class="nw-lg"><img class="nw-logo" src="web/img/marchi/${m.slug}.png" alt="${esc(m.nome)}"></span>`
                : `<span class="nw-ini" aria-hidden="true">${esc(iniziali(m.nome))}</span><span class="nw-wm">${esc(m.nome)}</span>`;
}
function riga(e, m) {
  const t = TIPI[e.tipo] || TIPI.fonte, c = e.cat && X.S.cataloghi.find(x => x.numero === e.cat);
  const cp = c ? trovaComparto(compartoDi(c)) : null;
  const dove = [e.marchio !== m.nome ? e.marchio : '', c ? `${nn2(c)} · ${c.nome}` : '', e.da ? `prima: «${e.da}»` : '', e.testo || ''].filter(Boolean).join(' · ');
  return `<div class="nw-r ${nuovo(e) ? 'nuova' : ''}" style="--t:${t.colore}">
    <span class="nw-pt"></span>
    <div class="nw-tx"><span class="nw-tipo">${t.nome}${nuovo(e) ? '<b>nuova</b>' : ''}</span>
      <b>${esc(e.titolo)}</b>${dove ? `<span class="nw-dove">${esc(dove)}</span>` : ''}</div>
    <div class="nw-az"><span class="nw-q">${quando(e.data || (e.iniziale ? null : e.quando), true)}</span>
      ${c ? `<button class="nw-cat" data-cat="${c.numero}" style="${stileComparto(cp)}" title="Apri il catalogo ELSAP collegato">Catalogo ${nn2(c)}</button>` : ''}
      ${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer" title="Apri sul sito del produttore">↗</a>` : ''}</div></div>`;
}
function disegna() {
  const el = $('#nwCorpo');
  if (!N.dati) {
    el.innerHTML = `<div class="nw-vuoto"><span class="pill cool">In arrivo</span><h3>Le News si stanno preparando</h3>
      <p class="muted">Il controllo automatico dei siti dei produttori parte a breve: ogni 30 minuti la piattaforma guarda notizie, prodotti nuovi e famiglie cambiate.</p></div>`;
    $('#nwInfo').textContent = ''; return;
  }
  const D = N.dati, delFiltro = (e, k) => k === 'tutto' ? e.tipo !== 'fonte' : e.tipo === k, ok = e => delFiltro(e, N.filtro) && nelPeriodo(e) && (!N.soloNuove || nuovo(e));
  const fonti = D.fonti || [], err = fonti.filter(f => f.errore).length, perNome = new Map();
  $('#nwInfo').innerHTML = `Controllo automatico ogni 30 minuti · ${fonti.length} pagine sorvegliate${err ? ` · <span class="nw-err">${err} non raggiungibil${err === 1 ? 'e' : 'i'}</span>` : ''}${D.aggiornato ? ` · ultima novità ${quando(D.aggiornato)}` : ''}`;
  $('#nwFiltri').innerHTML = FILTRI.map(([k, t]) => {
    const n = D.eventi.filter(e => delFiltro(e, k) && nuovo(e)).length;
    return `<button data-f="${k}" class="${N.filtro === k ? 'on' : ''}">${t}${n ? ` <b>${n}</b>` : ''}</button>`;
  }).join('') + `<label class="nw-solo" title="Quanto indietro mostrare: il sistema conserva 12 mesi">periodo <select data-periodo>${PERIODI.map(([v, t]) => `<option value="${v}" ${+v === N.periodo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`
    + `<label class="nw-solo"><input type="checkbox" ${N.soloNuove ? 'checked' : ''}> solo da leggere</label>`;
  // brand = elenco ufficiale (marchi.json) + eventuali marchi delle fonti che lì non compaiono ("Altri")
  const reg = (REG?.marchi || []).map(m => ({ ...m, nomi: new Set([m.nome, ...(m.alias || [])].map(x => x.toLowerCase())) }));
  const noto = n => reg.some(m => m.nomi.has(String(n).toLowerCase()));
  const altri = (D.marchi || []).filter(m => !noto(m.nome)).map(m => ({ nome: m.nome, slug: '', comparto: 'altri', alias: [], nomi: new Set([m.nome.toLowerCase()]) }));
  let k = 0;
  const scheda = m => {
    const mio = e => m.nomi.has(String(e.marchio).toLowerCase()), fM = fonti.filter(f => m.nomi.has(String(f.marchio).toLowerCase()));
    const L = D.eventi.filter(e => mio(e) && ok(e)), nuove = D.eventi.filter(e => mio(e) && nuovo(e)).length;
    const aperto = N.aperto.has(m.nome), vis = aperto ? L : L.slice(0, 4), sito = (D.marchi || []).find(x => m.nomi.has(x.nome.toLowerCase()))?.sito;
    const cats = [...new Set(fM.map(f => f.cat).filter(Boolean))].sort((a, b) => a - b), inErr = fM.filter(f => f.errore).length;
    return `<section class="nw-card ${aperto ? 'aperta' : ''} ${fM.length ? '' : 'senza'}" style="animation-delay:${(k++ % 12) * .04}s">
      <header><div class="nw-m">${marchio(m)}</div>${nuove ? `<span class="nw-badge">${nuove} nuov${nuove === 1 ? 'a' : 'e'}</span>` : ''}
        ${sito ? `<a class="nw-sito" href="${esc(sito)}" target="_blank" rel="noopener noreferrer">${esc(sito.replace(/^https?:\/\/(www\.)?/, ''))} ↗</a>` : ''}</header>
      <div class="nw-sub">${fM.length ? `${fM.length} pagin${fM.length === 1 ? 'a' : 'e'} sorvegliat${fM.length === 1 ? 'a' : 'e'}${cats.length ? ` · cataloghi ${cats.map(nn).join(', ')}` : ''}${inErr ? ` · <span class="nw-err">${inErr} non raggiungibil${inErr === 1 ? 'e' : 'i'}</span>` : ''}` : 'Fonte non ancora collegata'}</div>
      <div class="nw-lista">${fM.length ? (vis.length ? vis.map(e => riga(e, m)).join('') : `<div class="nw-nulla">Nessuna novità${N.filtro !== 'tutto' || N.soloNuove ? ' con questo filtro' : ''} negli ultimi ${PERIODI.find(x => +x[0] === N.periodo)?.[1] || N.periodo + ' giorni'}.</div>`)
                                : '<div class="nw-nulla">Le novità di questo brand non vengono ancora controllate.</div>'}</div>
      ${L.length > 4 ? `<button class="nw-piu" data-m="${esc(m.nome)}">${aperto ? 'Mostra meno' : `Tutte (${L.length})`}</button>` : ''}
    </section>`;
  };
  const sezioni = [...(REG?.comparti || []).map(c => ({ ...c, brand: reg.filter(m => m.comparto === c.id) })), ...(altri.length ? [{ id: 'altri', nome: 'Altri marchi', colore: '#66788B', brand: altri }] : [])].filter(s => s.brand.length);
  el.innerHTML = sezioni.map(s => `<div class="nw-sez" style="--c:${s.colore}"><h3><i></i>${esc(s.nome)}<span>${s.brand.length} brand · ${s.brand.filter(m => fonti.some(f => m.nomi.has(String(f.marchio).toLowerCase()))).length} con fonti collegate</span></h3>
    <div class="nw-griglia">${s.brand.map(scheda).join('')}</div></div>`).join('');
}
export async function apriNews() {
  N.visto = leggiVisto();                 // le "nuove" restano evidenziate per tutta la visita
  X.vai('news');
  $('#nwCorpo').innerHTML = '<div class="nw-vuoto"><div class="spinner"></div></div>';
  await Promise.all([carica(), REG ? 0 : leggiMarchi()]);
  disegna();
  statoGiri();
  if (N.dati) salvaVisto(new Date().toISOString().replace(/\.\d+Z$/, '+00:00'));
  setTimeout(() => { N.visto = leggiVisto(); pallino(); }, 400);
}
export function avviaNews(ctx) {
  X = ctx;
  if (!X.WEB) return;                     // solo versione web riservata (4 account)
  document.querySelectorAll('[data-news]').forEach(b => b.onclick = apriNews);
  const st = document.createElement('div'); st.id = 'nwStato'; st.className = 'nw-stato';
  $('#nwInfo').insertAdjacentElement('afterend', st);
  st.addEventListener('click', e => { const b = e.target.closest('[data-cerca]'); if (b && !b.disabled) cercaOra(b.dataset.cerca); });
  $('#nwFiltri').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { N.filtro = b.dataset.f; disegna(); } });
  $('#nwFiltri').addEventListener('change', e => {
    if (e.target.matches('[data-periodo]')) { N.periodo = +e.target.value; try { localStorage.setItem('elsap.news.periodo', e.target.value); } catch (x) { /* non salvato */ } }
    else N.soloNuove = e.target.checked;
    disegna();
  });
  $('#nwCorpo').addEventListener('click', e => {
    const p = e.target.closest('.nw-piu'); if (p) { const m = p.dataset.m; N.aperto.has(m) ? N.aperto.delete(m) : N.aperto.add(m); return disegna(); }
    const c = e.target.closest('[data-cat]'); if (c) X.vaiA({ n: +c.dataset.cat });
  });
  N.visto = leggiVisto();
  // Finché il controllo automatico non ha prodotto dati/news.json, la sezione resta nascosta (nessun pulsante vuoto).
  const mostra = () => document.body.classList.toggle('con-news', !!N.dati);
  carica().then(mostra);
  setInterval(() => carica().then(mostra), 30 * 60 * 1000);    // il pallino si aggiorna anche con la pagina aperta
}

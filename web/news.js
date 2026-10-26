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
const FILTRI = [['tutto', 'Tutto'], ['nuovi', 'Nuovi prodotti'], ['cambi', 'Cambiati o tolti'], ['comunicati', 'Comunicati']];
// loghi dei marchi: web/img/marchi/<slug>.svg (da Luca). Finché manca il file si mostra il nome come marchio testuale.
const LOGHI = new Set([]);

let X = null;
const N = { dati: null, filtro: 'tutto', aperto: new Set(), soloNuove: false, visto: null };
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

function marchio(nome) {
  const s = slug(nome);
  return LOGHI.has(s) ? `<img class="nw-logo" src="web/img/marchi/${s}.svg" alt="${esc(nome)}">` : `<span class="nw-wm">${esc(nome)}</span>`;
}
function riga(e) {
  const t = TIPI[e.tipo] || TIPI.fonte, c = e.cat && X.S.cataloghi.find(x => x.numero === e.cat);
  const cp = c ? trovaComparto(compartoDi(c)) : null;
  const dove = [c ? `${nn2(c)} · ${c.nome}` : '', e.da ? `prima: «${e.da}»` : '', e.testo || ''].filter(Boolean).join(' · ');
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
      <p class="muted">Il controllo automatico dei siti dei produttori parte a breve: ogni ora la piattaforma guarda notizie, prodotti nuovi e famiglie cambiate.</p></div>`;
    $('#nwInfo').textContent = ''; return;
  }
  const D = N.dati, ok = e => (N.filtro === 'tutto' ? e.tipo !== 'fonte' : TIPI[e.tipo]?.gruppo === N.filtro) && (!N.soloNuove || nuovo(e));
  const fonti = D.fonti || [], err = fonti.filter(f => f.errore).length;
  $('#nwInfo').innerHTML = `Controllo automatico ogni ora · ${fonti.length} pagine sorvegliate${err ? ` · <span class="nw-err">${err} non raggiungibil${err === 1 ? 'e' : 'i'}</span>` : ''}${D.aggiornato ? ` · ultima novità ${quando(D.aggiornato)}` : ''}`;
  $('#nwFiltri').innerHTML = FILTRI.map(([k, t]) => {
    const n = D.eventi.filter(e => (k === 'tutto' ? e.tipo !== 'fonte' : TIPI[e.tipo]?.gruppo === k) && nuovo(e)).length;
    return `<button data-f="${k}" class="${N.filtro === k ? 'on' : ''}">${t}${n ? ` <b>${n}</b>` : ''}</button>`;
  }).join('') + `<label class="nw-solo"><input type="checkbox" ${N.soloNuove ? 'checked' : ''}> solo da leggere</label>`;
  el.innerHTML = `<div class="nw-griglia">${D.marchi.map((m, i) => {
    const L = D.eventi.filter(e => e.marchio === m.nome && ok(e)), nuove = D.eventi.filter(e => e.marchio === m.nome && nuovo(e)).length;
    const aperto = N.aperto.has(m.nome), vis = aperto ? L : L.slice(0, 4);
    const fM = fonti.filter(f => f.marchio === m.nome), cats = [...new Set(fM.map(f => f.cat).filter(Boolean))].sort((a, b) => a - b);
    return `<section class="nw-card ${aperto ? 'aperta' : ''}" style="animation-delay:${i * .05}s">
      <header><div class="nw-m">${marchio(m.nome)}</div>${nuove ? `<span class="nw-badge">${nuove} nuov${nuove === 1 ? 'a' : 'e'}</span>` : ''}
        <a class="nw-sito" href="${esc(m.sito)}" target="_blank" rel="noopener noreferrer">${esc(m.sito.replace(/^https?:\/\/(www\.)?/, ''))} ↗</a></header>
      <div class="nw-sub">${fM.length} pagin${fM.length === 1 ? 'a' : 'e'} sorvegliat${fM.length === 1 ? 'a' : 'e'}${cats.length ? ` · cataloghi ${cats.map(nn).join(', ')}` : ''}${m.in_errore ? ` · <span class="nw-err">${m.in_errore} non raggiungibil${m.in_errore === 1 ? 'e' : 'i'}</span>` : ''}</div>
      <div class="nw-lista">${vis.length ? vis.map(riga).join('') : `<div class="nw-nulla">Nessuna novità${N.filtro !== 'tutto' || N.soloNuove ? ' con questo filtro' : ' finora'}.</div>`}</div>
      ${L.length > 4 ? `<button class="nw-piu" data-m="${esc(m.nome)}">${aperto ? 'Mostra meno' : `Tutte (${L.length})`}</button>` : ''}
    </section>`;
  }).join('')}</div>`;
}
export async function apriNews() {
  N.visto = leggiVisto();                 // le "nuove" restano evidenziate per tutta la visita
  X.vai('news');
  $('#nwCorpo').innerHTML = '<div class="nw-vuoto"><div class="spinner"></div></div>';
  await carica();
  disegna();
  if (N.dati) salvaVisto(new Date().toISOString().replace(/\.\d+Z$/, '+00:00'));
  setTimeout(() => { N.visto = leggiVisto(); pallino(); }, 400);
}
export function avviaNews(ctx) {
  X = ctx;
  if (!X.WEB) return;                     // solo versione web riservata (4 account)
  document.querySelectorAll('[data-news]').forEach(b => b.onclick = apriNews);
  $('#nwFiltri').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { N.filtro = b.dataset.f; disegna(); } });
  $('#nwFiltri').addEventListener('change', e => { N.soloNuove = e.target.checked; disegna(); });
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

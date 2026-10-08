// ELSAP DSGN — logica dell'interfaccia: intro, libreria, scheda catalogo, sfoglia, sotto-cataloghi
import { avviaScena } from './scena.js';
import { Libro } from './libro.js';
import { avviaCerca, apriCerca, apriAI } from './cerca.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
// Versione web / tablet (window.ELSAP_WEB): nessun server dietro, i dati sono file statici accanto alla pagina
const WEB = !!window.ELSAP_WEB;
async function apiWeb(u, body) {
  if (u === '/api/cataloghi') return (await fetch('dati/cataloghi.json')).json();
  if (u === '/api/stato') return { app: 'ELSAP DSGN', web: true, pacchetto: true, versione: window.ELSAP_WEB.versione, dati: window.ELSAP_WEB.dati, db: true };
  throw new Error('Disponibile solo nell\'app da scrivania');
}
const api = async (u, body) => {
  if (WEB) return apiWeb(u, body);
  const r = await fetch(u, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json(); if (!r.ok) throw new Error(j.errore || r.status); return j;
};
const SVG = {};
async function svg(nome) { if (!SVG[nome]) SVG[nome] = await (await fetch(`web/img/${nome}.svg`)).text(); return SVG[nome]; }
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('su'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('su'), 2600); }
const ICON = {
  libro: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7c4-2 8-2 12 1v18c-4-3-8-3-12-1z"/><path d="M28 7c-4-2-8-2-12 1v18c4-3 8-3 12-1z"/></svg>',
  griglia: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="4" width="10" height="10" rx="2"/><rect x="18" y="4" width="10" height="10" rx="2"/><rect x="4" y="18" width="10" height="10" rx="2"/><rect x="18" y="18" width="10" height="10" rx="2"/></svg>',
};

const S = { cataloghi: [], cur: null, vista: 'intro', storia: [], libro: null, sfFonte: null, gruppo: 'tutti', ricerca: {} };
let scena = null;

// ================================================================ viste
function vai(v, { push = true } = {}) {
  if (push && S.vista !== v && S.vista !== 'intro') S.storia.push(S.vista);
  document.querySelectorAll('.vista').forEach(el => el.classList.toggle('attiva', el.id === v));
  S.vista = v; scena?.modo(v);
  document.body.classList.toggle('dentro', v !== 'intro');
  document.body.className = document.body.className.replace(/\bv-\S+/g, '').trim() + ` v-${v}`;
  briciole();
  if (v !== 'sfoglia') S.libro?.chiudi();
}
function indietro() {
  const v = S.storia.pop() || 'home';
  if (v === 'sfoglia') return indietro();
  vai(v, { push: false });
}
function briciole() {
  const b = $('#briciole'), c = S.cur;
  const p = [];
  if (S.vista !== 'home' && S.vista !== 'intro') p.push('<span>Libreria</span>');
  if (c && ['catalogo', 'sfoglia', 'sotto'].includes(S.vista)) p.push(`<b>${esc(String(c.numero).padStart(2, '0'))} · ${esc(c.nome)}</b>`);
  if (S.vista === 'sfoglia') p.push(`<span>${S.sfFonte?.sotto ? esc(S.sfFonte.sotto) : 'Catalogo completo'}</span>`);
  if (S.vista === 'sotto') p.push('<span>Sotto-cataloghi</span>');
  if (S.vista === 'cerca') p.push('<b>Cerca codice</b>');
  if (S.vista === 'ai') p.push('<b>Interrogatore</b>');
  b.innerHTML = p.join('<span class="muted">/</span>');
}

// ================================================================ intro
function intro() {
  const t = 'ELSAP DSGN';
  $('#introTit').innerHTML = [...t].map((ch, i) => `<span class="${i > 5 ? 'a' : ''}" style="animation-delay:${0.9 + i * 0.07}s">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
  const entra = () => { if (S.vista === 'intro') vai('home', { push: false }); };
  $('#salta').onclick = entra;
  $('#intro').addEventListener('click', entra);
  addEventListener('keydown', e => { if (S.vista === 'intro') entra(); }, { once: true });
  setTimeout(entra, 4300);
}

// ================================================================ libreria
function copertinaDisegnata(c, logo, picto) {
  return `<div class="cov"><div class="p">${picto}</div>
    <div class="n">${String(c.numero).padStart(2, '0')}</div><div class="t">${esc(c.nome)}</div><div class="s">${esc(c.sottotitolo || '')}</div></div>`;
}
function libro3d(c, logo, picto, i = 0, grande = false) {
  const m = c.manifest;
  const img = m && m.pronto ? `<img src="cat/${encodeURI(m.slug)}/${m.copertina}?v=${encodeURIComponent(m.generato)}" alt="">` : copertinaDisegnata(c, logo, picto);
  const badge = c.stato === 'pronto' ? '' : `<span class="pill ${c.stato === 'da generare' ? 'acc' : ''} badge">${esc(c.stato)}</span>`;
  const meta = grande ? '' : `<div class="meta"><b>${esc(c.nome)}</b>${c.stato === 'pronto' ? `${m.pagine} pagine${m.sotto.length ? ` · ${m.sotto.length} sotto-cataloghi` : ''}` : esc(c.stato)}</div>`;
  return `<div class="libro3d ${grande ? 'grande' : ''} ${c.stato === 'in arrivo' ? 'spento' : ''}" tabindex="0" data-n="${c.numero}" style="animation-delay:${0.08 * i}s">
    <div class="fr">${img}</div><div class="dorso">${String(c.numero).padStart(2, '0')} · ${esc(c.nome)}</div><div class="tg"></div><div class="rt"></div>
    ${badge}<div class="ombra"></div>${meta}</div>`;
}
async function libreria() {
  S.cataloghi = await api('/api/cataloghi');
  const [logo, picto] = await Promise.all([svg('logo'), svg('pittogramma')]);
  const sc = $('#scaffale');
  sc.innerHTML = S.cataloghi.map((c, i) => libro3d(c, logo, picto, i)).join('');
  sc.querySelectorAll('.libro3d').forEach(el => {
    const apri = () => apriCatalogo(+el.dataset.n, el);
    el.addEventListener('click', apri);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') apri(); });
  });
  const pronti = S.cataloghi.filter(c => c.stato === 'pronto').length;
  const conf = S.cataloghi.reduce((a, c) => a + (c.manifest?.sotto?.length || 0), 0);
  const pag = S.cataloghi.reduce((a, c) => a + (c.manifest?.pagine || 0), 0);
  $('#numeri').innerHTML = `<div><b>${S.cataloghi.length}</b><span>serie · series</span></div><div><b>${pronti}</b><span>cataloghi pronti</span></div>
    <div><b>${conf}</b><span>sotto-cataloghi</span></div><div><b>${pag.toLocaleString('it-IT')}</b><span>pagine · pages</span></div>`;
  $('#scaffaleInfo').textContent = `${pronti} pronti · ${S.cataloghi.filter(c => c.stato !== 'pronto').length} in arrivo`;
  $('#scSx').onclick = () => sc.scrollBy({ left: -560, behavior: 'smooth' });
  $('#scDx').onclick = () => sc.scrollBy({ left: 560, behavior: 'smooth' });
  sc.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { sc.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
}

// volo del libro dalla libreria alla scheda (FLIP)
function volo(daEl, aEl) {
  if (!daEl || !aEl) return;
  const a = daEl.getBoundingClientRect(), b = aEl.getBoundingClientRect();
  const clone = daEl.cloneNode(true);
  clone.classList.add('volo'); clone.style.animation = 'none'; clone.style.opacity = 1;
  Object.assign(clone.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: 0 });
  clone.querySelector('.meta')?.remove();
  document.body.appendChild(clone);
  aEl.style.opacity = 0;
  const sx = b.width / a.width;
  clone.animate([
    { transform: 'rotateY(-18deg) rotateX(4deg)' },
    { transform: `translate(${(b.left - a.left) * .5}px, ${(b.top - a.top) * .5 - 80}px) scale(${(1 + sx) / 2}) rotateY(-200deg) rotateX(10deg)`, offset: .55 },
    { transform: `translate(${b.left - a.left + (b.width - a.width) / 2}px, ${b.top - a.top + (b.height - a.height) / 2}px) scale(${sx}) rotateY(-382deg) rotateX(6deg)` }
  ], { duration: 1100, easing: 'cubic-bezier(.6,.05,.25,1)', fill: 'forwards' }).finished.then(() => {
    aEl.style.transition = 'opacity .25s'; aEl.style.opacity = 1; setTimeout(() => clone.remove(), 260);
  });
}

// ================================================================ scheda catalogo
async function apriCatalogo(n, daEl) {
  const c = S.cataloghi.find(x => x.numero === n);
  if (!c) return;
  if (c.stato !== 'pronto') { toast(`${c.nome}: catalogo in arrivo.`); return; }
  S.cur = c;
  const [logo, picto] = await Promise.all([svg('logo'), svg('pittogramma')]);
  const lg = $('#libroGrande');
  lg.outerHTML = libro3d(c, logo, picto, 0, true).replace('class="libro3d', 'id="libroGrande" class="libro3d');
  schedaInfo();
  vai('catalogo');
  volo(daEl, $('#libroGrande'));
}
function schedaInfo() {
  const c = S.cur, m = c.manifest;
  const marchi = (m.marchi || []).filter(Boolean).map(g => `<span class="pill gas">${esc(g)}</span>`).join('');
  const data = new Date(m.generato).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
  const haSotto = m.sotto.length > 0;
  const corpo = `<div class="stat"><div><b>${m.pagine}</b><span>pagine · pages</span></div><div><b>${haSotto ? m.sotto.length : m.indice.length}</b><span>${haSotto ? 'sotto-cataloghi' : 'sezioni'}</span></div>
      <div><b>${(m.codici || 0).toLocaleString('it-IT')}</b><span>codici ricercabili</span></div><div><b>${m.pdf_mb ?? '—'}</b><span>MB · ${data}</span></div></div>
      <div class="azioni">
        <button class="tile" id="aSfoglia"><span class="ic">${ICON.libro}</span><span class="go">→</span><h3>Sfoglia il catalogo</h3><p>${m.pagine} pagine · sfoglio a libro, indice, ricerca per codice</p></button>
        ${haSotto ? `<button class="tile" id="aSotto"><span class="ic">${ICON.griglia}</span><span class="go">→</span><h3>Sotto-cataloghi</h3><p>${m.sotto.length} ${esc(m.sotto_nome || 'sezioni')}, ognuna in PDF</p></button>` : ''}
      </div>
      <div class="secondarie"><a class="btn ghost" href="cat/${encodeURI(m.slug)}/${encodeURI(m.file)}" target="_blank">Apri PDF ↗</a>
        ${WEB ? '<button class="btn ghost" id="aOffline">Offline…</button>' : '<button class="btn ghost" id="aCartella">Mostra nella cartella</button>'}</div>
      ${m.provvisoria ? `<div class="avviso">• ${esc(m.provvisoria === true ? 'Catalogo in lavorazione' : m.provvisoria)}</div>` : ''}`;
  $('#catInfo').innerHTML = `<div class="num">${String(c.numero).padStart(2, '0')}</div>
    <h2>${esc(c.nome)}</h2>
    <p class="sub">${esc(m.sottotitolo || c.sottotitolo || '')}</p>
    <div class="chips">${marchi}</div>${corpo}`;
  $('#aSfoglia')?.addEventListener('click', () => sfoglia({ url: `cat/${encodeURI(m.slug)}/${encodeURI(m.file)}`, titolo: c.nome }));
  $('#aSotto')?.addEventListener('click', sotto);
  $('#aCartella')?.addEventListener('click', () => api('/api/apri', { percorso: `${m.slug}/${m.file}` }).catch(e => toast(e.message)));
  if (WEB) offline(c);
}

// ================================================================ uso senza rete (solo versione web / tablet)
// Il catalogo scelto viene salvato sul dispositivo: PDF completo, copertina e immagini delle schede; i sotto-cataloghi a richiesta.
const CACHE_CAT = 'elsap-cat-v1';
async function offline(c) {
  const b = $('#aOffline'), m = c.manifest;
  if (!b) return;
  if (!('caches' in window) || !navigator.serviceWorker) { b.style.display = 'none'; return; }
  const base = new URL(`cat/${encodeURI(m.slug)}/`, location.href).href;
  const principali = [m.file, m.copertina, 'ricerca.json', ...new Set(m.sotto.map(x => x.foto ? 'html/' + x.foto : null).filter(Boolean))].map(f => base + encodeURI(f));
  const sottoPdf = m.sotto.map(x => base + encodeURI(x.file));
  const cache = await caches.open(CACHE_CAT);
  const haTutti = async L => (await Promise.all(L.map(u => cache.match(u)))).every(Boolean);
  const aggiorna = async () => {
    const p = await haTutti([principali[0]]), s = p && await haTutti(sottoPdf);
    b.dataset.stato = s ? 'tutto' : (p ? 'catalogo' : 'no');
    b.textContent = s ? 'Offline ✓ · rimuovi' : (p ? 'Offline ✓ · aggiungi sotto-cataloghi' : 'Scarica per uso offline');
  };
  const scarica = async L => {
    let fatti = 0;
    for (const u of L) {
      if (!(await cache.match(u))) { const r = await fetch(u, { headers: { 'x-elsap-grezzo': '1' } }); if (!r.ok) throw new Error(`scaricamento non riuscito (${r.status})`); await cache.put(u, r); }
      b.textContent = `Scarico… ${Math.round(++fatti / L.length * 100)}%`;
    }
  };
  b.onclick = async () => {
    if (b.disabled) return;
    b.disabled = true;
    try {
      if (b.dataset.stato === 'tutto') { for (const u of [...principali, ...sottoPdf]) await cache.delete(u); toast('Catalogo rimosso dal dispositivo'); }
      else {
        try { await navigator.storage?.persist?.(); } catch (e) { /* facoltativo */ }
        await scarica(b.dataset.stato === 'catalogo' ? sottoPdf : principali);
        toast(b.dataset.stato === 'catalogo' ? 'Sotto-cataloghi salvati sul dispositivo' : 'Catalogo salvato: si apre anche senza rete');
      }
    } catch (e) { toast('Non riuscito: ' + e.message); }
    b.disabled = false; aggiorna();
  };
  aggiorna();
}

// ================================================================ sfoglia
async function sfoglia({ url, titolo, sotto = null, pagina = 1, file = null }) {
  S.sfFonte = { url, titolo, sotto, file }; S.sfUltima = null;
  vai('sfoglia');
  const m = S.cur.manifest;
  $('#sfTit').innerHTML = `${esc(titolo)}<span>${sotto ? 'sotto-catalogo' : 'catalogo completo'}</span>`;
  $('#sfPdf').href = url; $('#sfCerca').value = '';
  $('#sfCarica').classList.remove('via');
  const sel = $('#sfIndice');
  sel.innerHTML = sotto ? `<option value="">Sotto-catalogo ${esc(sotto)}</option>` :
    '<option value="">Vai alla sezione…</option>' + m.indice.filter(x => x.pagina).map(x => `<option value="${x.pagina}">${String(x.pagina).padStart(4, '0')} · ${'\u00a0\u00a0\u00a0'.repeat(Math.max(0, (x.livello || 1) - 1))}${esc(x.titolo)}</option>`).join('');
  sel.disabled = !!sotto;
  if (!S.libro) S.libro = new Libro($('#libro'), { onCambio: aggiornaSf });
  try {
    const n = await S.libro.apri(url);
    $('#sfScorri').max = S.libro.ultima;
    if (pagina > 1) await S.libro.vaiPagina(pagina);
    $('#sfCarica').classList.add('via');
    toast(matchMedia('(pointer: coarse)').matches ? `${n} pagine · scorri con il dito o tocca i bordi` : `${n} pagine · usa ← → o clicca sui bordi`);
  } catch (e) { $('#sfCarica').innerHTML = `<span>Impossibile aprire il PDF: ${esc(e.message)}</span>`; }
}
function aggiornaSf(s) {
  const txt = !s.a ? `${String(s.b).padStart(3, '0')}` : (!s.b ? `${String(s.a).padStart(3, '0')}` : `${String(s.a).padStart(3, '0')}–${String(s.b).padStart(3, '0')}`);
  $('#sfPag').textContent = `${txt} / ${s.n}`;
  $('#sfPrev').disabled = s.prima; $('#sfNext').disabled = s.fine;
  if (s.ultima != null) $('#sfScorri').max = s.ultima;
  $('#sfScorri').value = s.k;
  const m = S.cur?.manifest;
  if (m && !S.sfFonte?.sotto) {
    const p = s.a || s.b;
    const sez = [...m.indice].filter(x => x.pagina && x.pagina <= p).pop();
    $('#sfScorriLab').textContent = sez ? sez.titolo : 'Copertina';
  } else $('#sfScorriLab').textContent = S.sfFonte?.sotto || '';
}
// Ricerca per codice: ogni catalogo ha un indice (ricerca.json) codice → pagine, per il PDF completo e per ogni sotto-catalogo
async function cerca(q) {
  const m = S.cur.manifest, slug = m.slug;
  if (!S.ricerca[slug]) { try { S.ricerca[slug] = await (await fetch(`cat/${encodeURI(slug)}/ricerca.json`)).json(); } catch (e) { S.ricerca[slug] = {}; } }
  const file = S.sfFonte?.file || m.file, idx = S.ricerca[slug][file] || {};
  const norm = t => t.replace(/[\s.\-_/]/g, '');
  const qn = norm(q);
  if (qn.length < 3) return [];
  const out = new Set();
  if (idx[q]) idx[q].forEach(p => out.add(p));
  else for (const k in idx) if (norm(k).includes(qn)) idx[k].forEach(p => out.add(p));
  return [...out].sort((a, b) => a - b);
}
function sfogliaEventi() {
  $('#sfPrev').onclick = () => S.libro.gira(-1);
  $('#sfNext').onclick = () => S.libro.gira(1);
  $('#sfIndietro').onclick = indietro;
  $('#libro').addEventListener('click', e => {
    if (performance.now() - (S.libro._striscio || 0) < 400) return;        // era uno striscio, non un tocco
    const r = $('#libro').getBoundingClientRect(); S.libro.gira(e.clientX > r.left + r.width / 2 ? 1 : -1);
  });
  $('#sfIndice').onchange = e => { if (e.target.value) S.libro.vaiPagina(+e.target.value); e.target.value = ''; };
  $('#sfScorri').oninput = e => { const k = +e.target.value, [a, b] = S.libro.pagine(k); aggiornaSf({ ...S.libro.stato(), k, a, b }); };
  $('#sfScorri').onchange = e => { const [a, b] = S.libro.pagine(+e.target.value); S.libro.vaiPagina(a || b || 1); };
  // dito: scorri a sinistra / destra per girare pagina
  let tx = null, ty = 0;
  $('#libro').addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { tx = e.clientX; ty = e.clientY; } });
  $('#libro').addEventListener('pointerup', e => {
    if (tx === null) return;
    const dx = e.clientX - tx, dy = e.clientY - ty; tx = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) { S.libro._striscio = performance.now(); S.libro.gira(dx < 0 ? 1 : -1); }
  });
  $('#sfCerca').onkeydown = async e => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim().toUpperCase().replace(/\s+/g, ' '); if (!q) return;
    if (/^\d{1,4}$/.test(q)) return S.libro.vaiPagina(+q);
    const pagine = await cerca(q);
    if (!pagine.length) return toast('Nessun risultato in questo catalogo');
    const cur = S.libro.stato(), ora = Math.max(cur.a || 0, cur.b || 0);
    const stessa = S.sfUltima === q;
    const prossima = (stessa ? pagine.find(p => p > ora) : pagine.find(p => p >= 1)) ?? pagine[0];
    S.sfUltima = q;
    S.libro.vaiPagina(prossima);
    toast(`${q} · pagina ${prossima}${pagine.length > 1 ? ` (${pagine.indexOf(prossima) + 1} di ${pagine.length} · Invio per la successiva)` : ''}`);
  };
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && S.vista !== 'home' && S.vista !== 'intro') { e.target.blur?.(); return indietro(); }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (S.vista === 'sfoglia') {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); S.libro.gira(1); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); S.libro.gira(-1); }
      if (e.key === 'Home') S.libro.vaiPagina(1);
      if (e.key === 'End') S.libro.vaiPagina(S.libro.n);
    }
  });
}

// ================================================================ sotto-cataloghi
function sotto() {
  const c = S.cur, m = c.manifest;
  $('#soTit').textContent = c.nome;
  $('#soSub').textContent = `${m.sotto.length} ${m.sotto_nome || 'sezioni'} · ognuna è un PDF a sé`;
  const gruppi = [...new Set(m.sotto.map(x => x.gruppo).filter(Boolean))];
  if (!gruppi.includes(S.gruppo)) S.gruppo = 'tutti';
  $('#soGas').innerHTML = gruppi.length > 1 ? ['tutti', ...gruppi].map(g => `<button data-g="${esc(g)}" class="${g === S.gruppo ? 'on' : ''}">${g === 'tutti' ? 'Tutti' : esc(g)}</button>`).join('') : '';
  $('#soGas').querySelectorAll('button').forEach(b => b.onclick = () => { S.gruppo = b.dataset.g; sotto(); });
  $('#soCerca').oninput = disegnaGriglia; $('#soOrd').onchange = disegnaGriglia;
  disegnaGriglia();
  if (S.vista !== 'sotto') vai('sotto');
}
function disegnaGriglia() {
  const m = S.cur.manifest, q = $('#soCerca').value.trim().toLowerCase(), ord = $('#soOrd').value;
  let L = m.sotto.map((x, i) => ({ ...x, i })).filter(x => (S.gruppo === 'tutti' || x.gruppo === S.gruppo));
  if (q) L = L.filter(x => (x.codice + ' ' + (x.descrizione || '') + ' ' + (x.gruppo || '')).toLowerCase().includes(q));
  L.sort({ ord: (a, b) => a.i - b.i, nome: (a, b) => a.codice.localeCompare(b.codice, 'it', { numeric: true }), pag: (a, b) => b.pagine - a.pagine }[ord] || ((a, b) => a.i - b.i));
  const base = `cat/${encodeURI(m.slug)}`;
  $('#soGriglia').innerHTML = L.length ? L.map((x, i) => `<div class="carta" data-i="${x.i}" style="animation-delay:${Math.min(i, 24) * 0.025}s">
      ${x.gruppo ? `<span class="pill gas gp">${esc(x.gruppo)}</span>` : ''}
      <div class="ft pag">${x.foto ? `<img src="${base}/html/${encodeURI(x.foto)}" alt="" loading="lazy">` : ''}</div>
      <div class="cp"><div class="cd">${esc(x.codice)}</div>
        <div class="rg"><span>${x.descrizione ? esc(x.descrizione) + ' · ' : ''}${x.pagine} pag.</span></div></div>
      <div class="az"><button data-a="sf">Sfoglia</button><a href="${base}/${encodeURI(x.file)}" target="_blank">PDF</a>${x.pagina_catalogo ? `<button data-a="cat">p. ${x.pagina_catalogo}</button>` : ''}</div>
    </div>`).join('') : '<div class="vuoto">Nessun sotto-catalogo con questi filtri.</div>';
  $('#soGriglia').querySelectorAll('.carta').forEach(el => {
    const x = m.sotto[+el.dataset.i];
    el.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (e.target.closest('a')) return;
      if (a === 'cat') return sfoglia({ url: `${base}/${encodeURI(m.file)}`, titolo: S.cur.nome, pagina: x.pagina_catalogo });
      sfoglia({ url: `${base}/${encodeURI(x.file)}`, titolo: x.codice, sotto: x.codice, file: x.file });
    });
  });
}

// ================================================================ qualità grafica (automatica / leggera / piena)
// Leggera = niente sfocature e grana, scena 3D a densità e ritmo ridotti, pagine meno dense: per i computer con scheda grafica integrata.
function grafica() {
  const leggi = () => { try { return localStorage.getItem('elsap.grafica') || 'auto'; } catch (e) { return 'auto'; } };
  let scelta = leggi(), lenta = false;
  const applica = () => {
    const leggera = scelta === 'leggera' || (scelta === 'auto' && (lenta || !scena || scena.gpuDebole));
    document.body.classList.toggle('leggero', leggera);
    scena?.leggero(leggera);
    $('#grafica').textContent = 'grafica ' + (scelta === 'auto' ? `auto · ${leggera ? 'leggera' : 'piena'}` : scelta);
  };
  scena?.seLenta(() => { lenta = true; if (scelta === 'auto') applica(); });
  $('#grafica').onclick = () => {
    scelta = { auto: 'leggera', leggera: 'piena', piena: 'auto' }[scelta];
    try { localStorage.setItem('elsap.grafica', scelta); } catch (e) { /* preferenza non salvata */ }
    applica(); toast('Grafica: ' + scelta);
  };
  applica();
}

// ================================================================ avvio
async function stato() {
  try {
    const s = await api('/api/stato');
    $('#statoDb').className = 'chip ' + (s.db ? 'ok' : ''); $('#statoDb').textContent = s.pacchetto ? `versione ${s.versione}` : (s.db ? 'database collegato' : 'database non trovato');
    document.body.classList.toggle('pacchetto', !!s.pacchetto);   // app installata: niente rigenerazione
    if (s.web) { document.body.classList.add('web'); $('#statoDb').textContent = `cataloghi ${s.dati}`; }
    else if (s.pacchetto) {                                        // i cataloghi sono un pacchetto di dati a parte: versione e aggiornamenti
      const c = $('#statoDb'); c.textContent = s.aggiornamento ? `nuovi dati ${s.aggiornamento} · aggiorna` : `app ${s.versione} · dati ${s.dati}`;
      c.style.cursor = 'pointer'; c.title = 'Dati dei cataloghi: versione e aggiornamento'; c.onclick = () => { location.href = '/dati'; };
      if (s.prodotti === false) { c.classList.add('acc'); c.textContent = `dati ${s.dati} · da aggiornare`; toast('I dati installati sono vecchi: per Cerca codice e Interrogatore carica il file dei dati più recente'); }
      if (s.aggiornamento) { c.classList.add('acc'); toast(`Sono disponibili cataloghi aggiornati (${s.aggiornamento})`); }
    }
  } catch (e) { $('#statoDb').textContent = 'server non raggiungibile'; }
}
function orologio() { $('#orologio').textContent = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); }
function vita() {   // la finestra-app tiene acceso il server; alla chiusura lo spegne
  if (WEB) return;
  setInterval(() => fetch('/api/ping').catch(() => {}), 20000);
  addEventListener('pagehide', () => navigator.sendBeacon('/api/chiudi', '{}'));
}

(async function main() {
  intro();
  try { scena = await avviaScena($('#scena')); window.elsapScena = scena; scena.modo(S.vista); } catch (e) { console.warn('scena 3D non disponibile', e); }
  grafica();
  $('#vaiHome').onclick = () => { S.storia = []; vai('home', { push: false }); };
  document.querySelector('[data-svg="logo"]').innerHTML = await svg('logo');
  avviaCerca({ S, WEB, toast, vai, sfoglia });
  for (const id of ['#hCerca', '#nCerca']) $(id).onclick = () => apriCerca();
  for (const id of ['#hAI', '#nAI']) $(id).onclick = () => apriAI();
  sfogliaEventi(); stato(); orologio(); setInterval(orologio, 30000); vita();
  await libreria();
})();

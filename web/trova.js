// ELSAP DSGN — orientarsi senza conoscere ELSAP (idea di Michele, 21/10/2026)
// TROVA: una sola casella (stile Spotlight, ⌘K / Ctrl K o inizia a scrivere dalla Home) che cerca insieme
//        comparti, cataloghi, sezioni e codici, e per ogni risultato mostra DOVE si trova (Comparto › Catalogo › Sezione).
// MAPPA: tutti i comparti, i cataloghi e le sezioni su una pagina sola, da sfogliare a colpo d'occhio.
import { COMPARTI, stileComparto, compartoDi, trovaComparto, iconaComparto } from './comparti.js';
import { trovaProdotti } from './cerca.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const piano = t => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-_/.,·]+/g, ' ');
const nn = n => String(n).padStart(2, '0');
const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
// parole comuni → comparto (per chi scrive "alimentatore" o "luce forno" senza sapere dove guardare)
const PAROLE = {
  'connessione': 'connettore connettori cavo cavi cablaggio cablare presa spina m8 m12 m16 m23 7/8 rj45 ethernet usb d sub circolare pannello pcb morsetto bus profinet ip67 elettrovalvola sensore attuatore',
  'elettronica-industriale': 'alimentatore alimentatori alimentazione power supply psu adattatore caricatore caricabatterie batteria batterie medicale medicali usb switching trasformatore tensione 12v 24v 5v ventola encoder sensore interruttore pulsante rf',
  'sistemi-elettromeccanici': 'illuminazione luce luci lampada lampade led forno forni frigorifero frigo cappa lavatrice lavastoviglie elettrodomestico elettrodomestici riscaldamento termostato pompa motore rele relè valvola attuatore hmi resistenza',
};
const ICO = {
  libro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 5.5c3-1.5 6-1.5 9 .8v13c-3-2.3-6-2.3-9-.8zM21 5.5c-3-1.5-6-1.5-9 .8v13c3-2.3 6-2.3 9-.8z"/></svg>',
  sezione: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/></svg>',
  codice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 5v14M7.5 5v14M11 5v14M15 5v14M17.5 5v14M20 5v14" stroke-width="1.4"/><path d="M4 5v14M11 5v14M17.5 5v14" stroke-width="2.4"/></svg>',
  ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg>',
  mappa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
  lente: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/></svg>',
  tutti: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 7h16M7 12h10M10 17h4"/></svg>',
};

let X = null;             // { S, vaiA, apriCerca, apriAI, vai, toast }
let IDX = [];             // voci cercabili
const T = { aperto: false, q: '', righe: [], sel: 0, giro: 0 };

// ---------------------------------------------------------------- indice di comparti, cataloghi e sezioni
export function indicizza() {
  IDX = [];
  for (const cp of COMPARTI) {
    const L = X.S.cataloghi.filter(c => compartoDi(c) === cp.id);
    const k = L.filter(c => c.stato === 'pronto').length;
    IDX.push({ tipo: 'comparto', id: cp.id, cp, titolo: cp.nome, dove: `${k ? `${k} catalogh${k === 1 ? 'o' : 'i'}` : 'cataloghi in preparazione'} · ${cp.en}`,
      t: piano(cp.nome), x: piano([cp.en, cp.aree.join(' '), PAROLE[cp.id] || ''].join(' ')) });
  }
  for (const c of X.S.cataloghi) {
    const cp = trovaComparto(compartoDi(c)), m = c.manifest;
    IDX.push({ tipo: 'catalogo', n: c.numero, cp, titolo: `${nn(c.numero)} · ${c.nome}`, dove: `${cp.nome}${m ? ` · ${m.pagine} pagine` : ' · in arrivo'}`, pronto: c.stato === 'pronto',
      t: piano(c.nome), x: piano([nn(c.numero), c.numero, c.sottotitolo, (c.marchi || []).join(' '), m?.marchi?.join(' ')].join(' ')) });
    if (!m) continue;
    const viste = new Set();
    for (const s of m.sotto || []) {
      const k = piano(s.codice); viste.add(k);
      IDX.push({ tipo: 'sezione', n: c.numero, cp, titolo: s.codice, pagina: s.pagina_catalogo || 1, dove: `${cp.nome} › ${nn(c.numero)} ${c.nome}${s.pagina_catalogo ? ` · p. ${s.pagina_catalogo}` : ''}`,
        t: k, x: piano([s.descrizione, s.gruppo].join(' ')) });
    }
    for (const s of m.indice || []) {
      const k = piano(s.titolo);
      if (!s.pagina || (s.livello || 1) > 2 || viste.has(k) || /^(indice|index|sommario|contents?)$/.test(k)) continue;
      viste.add(k);
      IDX.push({ tipo: 'sezione', n: c.numero, cp, titolo: s.titolo, pagina: s.pagina, dove: `${cp.nome} › ${nn(c.numero)} ${c.nome} · p. ${s.pagina}`, t: k, x: '' });
    }
  }
}
function cercaIndice(q) {
  const p = piano(q).split(/\s+/).filter(Boolean);
  if (!p.length) return [];
  const pesi = { comparto: 40, catalogo: 30, sezione: 10 };
  const out = [];
  for (const v of IDX) {
    let s = 0, ok = true;
    for (const w of p) {
      if (v.t.startsWith(w) || v.t.includes(' ' + w)) s += 30; else if (v.t.includes(w)) s += 18;
      else if (v.x.includes(w)) s += v.tipo === 'comparto' ? 14 : 8; else { ok = false; break; }
    }
    if (!ok) continue;
    if (v.t === piano(q)) s += 60;
    if (v.tipo === 'catalogo' && !v.pronto) s -= 15;
    out.push([s + pesi[v.tipo], v]);
  }
  return out.sort((a, b) => b[0] - a[0]).map(x => x[1]);
}
function evidenzia(t, q) {
  let h = esc(t);
  for (const w of piano(q).split(/\s+/).filter(x => x.length > 1).sort((a, b) => b.length - a.length)) {
    const r = new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
    h = h.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, tx) => tag || tx.replace(r, '<mark>$1</mark>'));
  }
  return h;
}

// ---------------------------------------------------------------- righe dei risultati
const icoRiga = v => v.tipo === 'comparto' ? `<span class="tv-ic cp-mini" style="${stileComparto(v.cp)}">${iconaComparto(v.cp)}</span>`
  : `<span class="tv-ic" style="${v.cp ? stileComparto(v.cp) : '--cp:var(--accent);--cpt:var(--accent)'}">${ICO[v.ico || (v.tipo === 'catalogo' ? 'libro' : v.tipo === 'sezione' ? 'sezione' : 'codice')]}</span>`;
function riga(v, i, q) {
  return `<button class="tv-r ${i === T.sel ? 'on' : ''}" data-i="${i}" role="option">${icoRiga(v)}
    <span class="tv-tx"><b>${evidenzia(v.titolo, q)}</b><span>${esc(v.dove)}</span></span><span class="tv-va">${v.va || 'Apri'} ↵</span></button>`;
}
function disegna() {
  const el = $('#tvRis'), q = T.q.trim();
  let h = '';
  T.righe = [];
  const gruppo = (nome, L, extra = '') => {
    if (!L.length) return;
    h += `<div class="tv-g"><span class="lab">${nome}</span>${extra}</div>`;
    for (const v of L) { h += riga(v, T.righe.length, q); T.righe.push(v); }
  };
  if (!q) {
    gruppo('Da dove iniziare · i tre comparti', IDX.filter(v => v.tipo === 'comparto'));
    gruppo('Orientarsi', [
      { tipo: 'azione', ico: 'mappa', titolo: 'Mappa dei cataloghi', dove: 'Tutti i comparti, i cataloghi e le sezioni su una pagina', fai: () => apriMappa() },
      { tipo: 'azione', ico: 'ai', titolo: 'Non conosci il codice? Descrivi il prodotto', dove: 'Interrogatore · es. "connettore M12 femmina a 90°"', va: 'Vai', fai: () => X.apriAI() },
      { tipo: 'azione', ico: 'codice', titolo: 'Cerca codice con i filtri', dove: 'Tutti i codici di tutti i cataloghi, con le caratteristiche', va: 'Vai', fai: () => X.apriCerca() },
    ]);
    h += `<div class="tv-esempi"><span class="lab">Prova a scrivere</span>${['M12', 'Ethernet', 'elettrovalvola', 'Railway', 'alimentatore', 'luce forno'].map(e => `<button data-es="${esc(e)}">${esc(e)}</button>`).join('')}</div>`;
  } else {
    const R = cercaIndice(q);
    const cp = R.filter(v => v.tipo === 'comparto').slice(0, 3);
    gruppo('Comparti', cp);
    gruppo('Cataloghi', R.filter(v => v.tipo === 'catalogo').slice(0, 5));
    gruppo('Sezioni dei cataloghi', R.filter(v => v.tipo === 'sezione').slice(0, 6));
    if (T.prodotti?.q === q && T.prodotti.lista.length) {
      gruppo('Codici', T.prodotti.lista.map(p => ({ tipo: 'prodotto', cp: trovaComparto(compartoDi(p.cat)), titolo: p.codice,
        dove: `${trovaComparto(compartoDi(p.cat)).nome} › ${nn(p.n)} ${p.cat.nome} · p. ${p.p}${p.descr ? ' · ' + p.descr : ''}`, prodotto: p })),
        T.prodotti.tot > T.prodotti.lista.length ? `<span class="lab muted">${T.prodotti.tot.toLocaleString('it-IT')} in tutto</span>` : '');
    } else if (T.prodotti?.q !== q) h += '<div class="tv-g"><span class="lab">Codici</span><span class="lab muted">cerco…</span></div>';
    gruppo('Altre strade', [
      ...(T.prodotti?.q === q && T.prodotti.tot ? [{ tipo: 'azione', ico: 'tutti', titolo: `Tutti i ${T.prodotti.tot.toLocaleString('it-IT')} codici per «${q}»`, dove: 'Cerca codice · con filtri e schede PDF', va: 'Vai', fai: () => X.apriCerca({ testo: q, filtri: {} }) }] : []),
      { tipo: 'azione', ico: 'ai', titolo: `Chiedi all'Interrogatore: «${q}»`, dove: 'Ti fa le domande giuste per arrivare al prodotto', va: 'Chiedi', fai: () => X.apriAI(q) },
    ]);
    if (!R.length && T.prodotti?.q === q && !T.prodotti.tot) h = `<div class="tv-nulla">Nessun catalogo, sezione o codice contiene «${esc(q)}».<br><span class="muted">Prova con parole diverse o chiedi all'Interrogatore qui sotto.</span></div>` + h.slice(h.indexOf('<div class="tv-g"><span class="lab">Altre strade'));
  }
  if (T.sel >= T.righe.length) T.sel = Math.max(0, T.righe.length - 1);
  el.innerHTML = h;
  el.querySelectorAll('.tv-r').forEach((b, i) => { b.classList.toggle('on', i === T.sel); });
}
async function aggiornaProdotti() {
  const q = T.q.trim(), giro = ++T.giro;
  if (!q || q.length < 2) return;
  try { const r = await trovaProdotti(q, 5); if (giro !== T.giro) return; T.prodotti = { q, ...r }; }
  catch (e) { if (giro !== T.giro) return; T.prodotti = { q, lista: [], tot: 0 }; }
  if (T.aperto) disegna();
}
function scegli(i) {
  const v = T.righe[i]; if (!v) return;
  chiudiTrova(true);
  if (v.tipo === 'comparto') return X.vaiA({ comparto: v.id });
  if (v.tipo === 'catalogo') return v.pronto ? X.vaiA({ n: v.n }) : X.toast(`${v.titolo}: catalogo in arrivo`);
  if (v.tipo === 'sezione') return X.vaiA({ n: v.n, pagina: v.pagina });
  if (v.tipo === 'prodotto') return X.vaiA({ n: v.prodotto.n, pagina: v.prodotto.p });
  v.fai?.();
}

// ---------------------------------------------------------------- pannello
export function apriTrova(iniziale = '') {
  if (!IDX.length) indicizza();
  const el = $('#trova');
  T.aperto = true; T.q = iniziale; T.sel = 0;
  el.hidden = false; requestAnimationFrame(() => el.classList.add('su'));
  const inp = $('#tvTesto'); inp.value = iniziale; inp.focus();
  disegna(); aggiornaProdotti();
}
export function chiudiTrova(subito) {
  if (!T.aperto) return;
  T.aperto = false;
  const el = $('#trova'); el.classList.remove('su');
  setTimeout(() => { if (!T.aperto) el.hidden = true; }, subito ? 0 : 220);
}
function eventi() {
  const inp = $('#tvTesto');
  let t = 0;
  inp.addEventListener('input', () => { T.q = inp.value; T.sel = 0; disegna(); clearTimeout(t); t = setTimeout(aggiornaProdotti, 160); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); return chiudiTrova(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (!T.righe.length) return;
      T.sel = (T.sel + (e.key === 'ArrowDown' ? 1 : -1) + T.righe.length) % T.righe.length;
      $('#tvRis').querySelectorAll('.tv-r').forEach((b, i) => b.classList.toggle('on', i === T.sel));
      $('#tvRis .tv-r.on')?.scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter') { e.preventDefault(); scegli(T.sel); }
  });
  $('#tvRis').addEventListener('click', e => {
    const es = e.target.closest('[data-es]'); if (es) { inp.value = T.q = es.dataset.es; disegna(); aggiornaProdotti(); return inp.focus(); }
    const b = e.target.closest('.tv-r'); if (b) scegli(+b.dataset.i);
  });
  $('#tvRis').addEventListener('pointermove', e => {
    const b = e.target.closest('.tv-r'); if (!b || +b.dataset.i === T.sel) return;
    T.sel = +b.dataset.i; $('#tvRis').querySelectorAll('.tv-r').forEach((x, i) => x.classList.toggle('on', i === T.sel));
  });
  $('#trova .tv-velo').addEventListener('click', () => chiudiTrova());
  // ⌘K / Ctrl K ovunque; dalla Home, dalla libreria o dalla mappa basta iniziare a scrivere
  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return T.aperto ? chiudiTrova() : apriTrova(); }
    if (T.aperto || e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1 || /\s/.test(e.key)) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || !['home', 'libreria'].includes(X.S.vista)) return;
    if (document.querySelector('#carica:not([hidden])')) return;
    e.preventDefault(); apriTrova(e.key);
  });
}

// ---------------------------------------------------------------- mappa
const M = { aperti: new Set(), filtro: '' };
export function apriMappa() {
  chiudiTrova(true);
  disegnaMappa();
  X.vai('mappa');
}
function sezioniDi(c) {
  const m = c.manifest; if (!m) return [];
  if (m.sotto?.length) return m.sotto.map(s => ({ t: s.codice, d: s.descrizione || s.gruppo || '', p: s.pagina_catalogo || 1 }));
  return (m.indice || []).filter(s => s.pagina && (s.livello || 1) === 1 && !/^(indice|index|sommario)$/i.test(s.titolo)).map(s => ({ t: s.titolo, d: '', p: s.pagina }));
}
function disegnaMappa() {
  const f = piano(M.filtro.trim());
  const ok = t => !f || f.split(/\s+/).every(w => piano(t).includes(w));
  $('#mpColonne').innerHTML = COMPARTI.map(cp => {
    const L = X.S.cataloghi.filter(c => compartoDi(c) === cp.id);
    const righe = L.map(c => {
      const sz = sezioniDi(c), szOk = sz.filter(s => ok(`${s.t} ${s.d}`));
      const catOk = ok(`${c.nome} ${c.sottotitolo || ''} ${nn(c.numero)} ${cp.nome}`);
      if (f && !catOk && !szOk.length) return '';
      const aperto = M.aperti.has(c.numero) || (f && szOk.length && !catOk);
      const mostra = f && !catOk ? szOk : sz;
      return `<div class="mp-cat ${c.stato !== 'pronto' ? 'spento' : ''} ${aperto ? 'aperto' : ''}" data-n="${c.numero}">
        <div class="mp-cr"><button class="mp-apri" data-a="cat"><span class="mp-n">${nn(c.numero)}</span><span class="mp-nm">${esc(c.nome)}</span>
          <span class="mp-pg">${c.stato === 'pronto' ? `${c.manifest.pagine} p.` : 'in arrivo'}</span></button>
          ${sz.length ? `<button class="mp-giu" data-a="giu" aria-label="Mostra sezioni" title="${sz.length} sezioni">${sz.length}<i></i></button>` : ''}</div>
        ${sz.length ? `<div class="mp-sz">${mostra.map(s => `<button data-p="${s.p}"><span>${esc(s.t)}</span>${s.d ? `<em>${esc(s.d)}</em>` : ''}<i>p. ${s.p}</i></button>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
    const pronti = L.filter(c => c.stato === 'pronto').length;
    return `<section class="mp-col" style="${stileComparto(cp)}">
      <button class="mp-ct" data-cp="${cp.id}"><span class="mp-ic">${iconaComparto(cp)}</span><span><b>${esc(cp.nome)}</b><span class="lab">${pronti ? `${pronti} cataloghi` : 'in preparazione'}</span></span><span class="mp-va">→</span></button>
      <div class="mp-lista">${righe || (L.length ? '<div class="mp-vuoto muted">Niente con questo filtro</div>'
        : `<div class="mp-vuoto"><span class="muted">I cataloghi sono in preparazione. Conterrà:</span><div class="ets">${cp.aree.map(a => `<span class="et">${esc(a)}</span>`).join('')}</div></div>`)}</div>
    </section>`;
  }).join('');
}
function eventiMappa() {
  $('#mpFiltro').addEventListener('input', e => { M.filtro = e.target.value; disegnaMappa(); });
  $('#mpColonne').addEventListener('click', e => {
    const t = e.target.closest('[data-cp]'); if (t) return X.vaiA({ comparto: t.dataset.cp });
    const cat = e.target.closest('.mp-cat'); if (!cat) return;
    const n = +cat.dataset.n, a = e.target.closest('[data-a]')?.dataset.a, sz = e.target.closest('[data-p]');
    if (sz) return X.vaiA({ n, pagina: +sz.dataset.p });
    if (a === 'giu') { M.aperti.has(n) ? M.aperti.delete(n) : M.aperti.add(n); return cat.classList.toggle('aperto'); }
    if (a === 'cat') { const c = X.S.cataloghi.find(x => x.numero === n); return c?.stato === 'pronto' ? X.vaiA({ n }) : X.toast(`${c?.nome}: catalogo in arrivo`); }
  });
}

export function avviaTrova(ctx) {
  X = ctx;
  document.querySelectorAll('#tvTasto, .tv-k').forEach(k => k.textContent = MAC ? '⌘K' : 'Ctrl K');
  document.querySelectorAll('[data-trova]').forEach(b => b.onclick = () => apriTrova());
  document.querySelectorAll('[data-mappa]').forEach(b => b.onclick = () => apriMappa());
  eventi(); eventiMappa();
}

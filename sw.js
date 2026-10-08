// ELSAP DSGN — versione web: funziona anche senza rete.
// - l'interfaccia viene salvata alla prima apertura
// - i cataloghi vengono salvati solo quando l'utente preme "Scarica per uso offline" (lo fa la pagina, nella cache CAT)
// - pdf.js legge i PDF a pezzi: qui i pezzi vengono ritagliati
// - VERSIONE RISERVATA (true): tutto ciò che sta in cat/ e dati/ è cifrato (AES-256-GCM a blocchi da 256 KB).
//   Qui si decifra al volo con la chiave messa nel dispositivo dall'accesso (IndexedDB). Nelle cache resta tutto cifrato.
const VERSIONE = '1.1.1-2026.10.2-6acf536702';
const CIFRATA = true;
const GUSCIO = 'elsap-guscio-' + VERSIONE, CAT = 'elsap-cat-v1';
const FILE = ["index.html", "manifest.webmanifest", "dati/cataloghi.json", "dati/prodotti.json", "web/accesso.css", "web/accesso.js", "web/accesso.json", "web/app.css", "web/app.js", "web/cerca.js", "web/font/Doto-Bold.ttf", "web/font/IBMPlexMono-Medium.woff2", "web/font/IBMPlexMono-Regular.woff2", "web/font/Inter-Regular.ttf", "web/font/Inter-SemiBold.ttf", "web/img/icona_192.png", "web/img/icona_512.png", "web/img/logo.svg", "web/img/pittogramma.svg", "web/index.html", "web/libro.js", "web/scena.js", "web/vendor/RoomEnvironment.js", "web/vendor/SVGLoader.js", "web/vendor/pdf-lib.esm.min.js", "web/vendor/pdf.min.mjs", "web/vendor/pdf.worker.min.mjs", "web/vendor/three.module.min.js"];
const TIPI = { pdf: 'application/pdf', json: 'application/json', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp' };

self.addEventListener('install', e => { e.waitUntil(caches.open(GUSCIO).then(c => c.addAll(FILE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('elsap-guscio-') && k !== GUSCIO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// ---------------------------------------------------------------- chiave
let CHIAVE = null;
function sessione() {
  return new Promise(ok => {
    const r = indexedDB.open('elsap-accesso', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('k');
    r.onerror = () => ok(null);
    r.onsuccess = () => { try { const q = r.result.transaction('k').objectStore('k').get('sessione'); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); } catch (e) { ok(null); } };
  });
}
async function chiave() { if (!CHIAVE) { const s = await sessione(); CHIAVE = s && s.chiave || null; } return CHIAVE; }
self.addEventListener('message', e => { if (e.data && (e.data.tipo === 'esci' || e.data.tipo === 'entra')) { CHIAVE = null; INFO.clear(); } });

// ---------------------------------------------------------------- formato: "ELSAPEC1" | blocco u32 | lunghezza u64 | nonce 8 | 4 vuoti | blocchi (cifrato + 16 di tag)
const TESTA = 32, INFO = new Map();
function leggiTesta(buf) {
  const u = new Uint8Array(buf), v = new DataView(buf);
  if (buf.byteLength < TESTA || String.fromCharCode(...u.slice(0, 8)) !== 'ELSAPEC1') throw new Error('file non cifrato o rovinato');
  const C = v.getUint32(8), size = v.getUint32(12) * 4294967296 + v.getUint32(16);
  return { C, size, n: Math.ceil(size / C), nonce: u.slice(20, 28) };
}
const posBlocco = (I, i) => TESTA + i * (I.C + 16);
const lunBlocco = (I, i) => Math.min(I.C, I.size - i * I.C) + 16;
async function apriBlocco(k, I, i, dati) {
  const iv = new Uint8Array(12); iv.set(I.nonce); new DataView(iv.buffer).setUint32(8, i);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, dati));
}
async function apriBlocchi(k, I, i0, i1, buf) {        // buf = byte cifrati dei blocchi i0..i1 di fila
  const out = new Uint8Array(Math.min(I.size, (i1 + 1) * I.C) - i0 * I.C);
  let p = 0;
  for (let i = i0; i <= i1; i++) {
    const l = lunBlocco(I, i), d = await apriBlocco(k, I, i, buf.slice(p, p + l));
    out.set(d, (i - i0) * I.C); p += l;
  }
  return out;
}

// sorgente: (a, b) → byte cifrati [a, b) — dalla copia salvata o dalla rete (a pezzi, con Range)
const daBlob = blob => (a, b) => blob.slice(a, b).arrayBuffer();
function daRete(url) {
  let intero = null;
  return async (a, b) => {
    if (intero) return intero.slice(a, b).arrayBuffer();
    const r = await fetch(url, { headers: { Range: `bytes=${a}-${b - 1}` } });
    if (r.status === 206) return r.arrayBuffer();
    if (!r.ok) throw new Error('rete ' + r.status);
    intero = await r.blob();                              // lo spazio web non dà i pezzi: si tiene il file intero
    return intero.slice(a, b).arrayBuffer();
  };
}
async function testa(url, src) {
  if (!INFO.has(url)) INFO.set(url, src(0, TESTA).then(leggiTesta).catch(e => { INFO.delete(url); throw e; }));
  return INFO.get(url);
}

async function servi(req, url, rel) {
  if (req.headers.get('x-elsap-grezzo')) return fetch(url);   // la pagina salva il catalogo per l'uso offline: resta cifrato
  const k = await chiave();
  if (!k) return new Response(JSON.stringify({ errore: 'Accesso richiesto' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  const tipo = TIPI[(rel.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
  let salvato = await (await caches.open(CAT)).match(url);
  if (!salvato && rel.startsWith('dati/')) salvato = await (await caches.open(GUSCIO)).match(rel);
  try {
    if (tipo !== 'application/pdf') {                         // file piccoli: tutto in una volta
      const r = salvato || await fetch(url);
      if (!r.ok) return r;
      const buf = await r.arrayBuffer(), I = leggiTesta(buf.slice(0, TESTA));
      const out = I.n ? await apriBlocchi(k, I, 0, I.n - 1, buf.slice(TESTA)) : new Uint8Array(0);
      return new Response(out, { headers: { 'Content-Type': tipo, 'Content-Length': out.length } });
    }
    const src = salvato ? daBlob(await salvato.blob()) : daRete(url);
    const I = await testa(url, src);
    const range = req.headers.get('range');
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m && (m[1] || m[2])) {
      const a = m[1] ? parseInt(m[1], 10) : Math.max(0, I.size - parseInt(m[2], 10));
      const b = m[1] && m[2] ? Math.min(parseInt(m[2], 10), I.size - 1) : I.size - 1;
      if (a > b || a >= I.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${I.size}` } });
      const i0 = Math.floor(a / I.C), i1 = Math.floor(b / I.C);
      const buf = await src(posBlocco(I, i0), posBlocco(I, i1) + lunBlocco(I, i1));
      const out = (await apriBlocchi(k, I, i0, i1, buf)).subarray(a - i0 * I.C, b - i0 * I.C + 1);
      return new Response(out, { status: 206, headers: { 'Content-Type': tipo, 'Content-Range': `bytes ${a}-${b}/${I.size}`, 'Content-Length': out.length, 'Accept-Ranges': 'bytes' } });
    }
    // file intero, a flusso: 16 blocchi (4 MB) per volta
    let i = 0;
    const corpo = new ReadableStream({
      async pull(ctl) {
        if (i >= I.n) { ctl.close(); return; }
        const j = Math.min(I.n - 1, i + 15);
        const buf = await src(posBlocco(I, i), posBlocco(I, j) + lunBlocco(I, j));
        ctl.enqueue(await apriBlocchi(k, I, i, j, buf)); i = j + 1;
      },
    });
    return new Response(corpo, { status: 200, headers: { 'Content-Type': tipo, 'Content-Length': I.size, 'Accept-Ranges': 'bytes' } });
  } catch (e) {
    return new Response(JSON.stringify({ errore: 'Non riesco ad aprire il file: ' + e.message }), { status: e.name === 'OperationError' ? 403 : 502, headers: { 'Content-Type': 'application/json' } });
  }
}

async function pezzo(risposta, range) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range);
  const blob = await risposta.blob(), size = blob.size;
  if (!m || (!m[1] && !m[2])) return new Response(blob, { status: 200, headers: { 'Content-Type': risposta.headers.get('Content-Type') || 'application/pdf', 'Accept-Ranges': 'bytes', 'Content-Length': size } });
  const a = m[1] ? parseInt(m[1], 10) : Math.max(0, size - parseInt(m[2], 10));
  const b = m[1] && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
  if (a > b || a >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(blob.slice(a, b + 1), { status: 206, headers: { 'Content-Type': risposta.headers.get('Content-Type') || 'application/pdf',
    'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1, 'Accept-Ranges': 'bytes' } });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin) return;
  const rel = decodeURI(u.pathname.slice(new URL(self.registration.scope).pathname.length));
  if (CIFRATA && (rel.startsWith('cat/') || rel.startsWith('dati/'))) { e.respondWith(servi(req, u.origin + u.pathname, rel)); return; }
  if (rel.startsWith('cat/')) {
    e.respondWith((async () => {
      const salvato = await (await caches.open(CAT)).match(u.origin + u.pathname);
      if (salvato) return req.headers.has('range') ? pezzo(salvato, req.headers.get('range')) : salvato;
      return fetch(req);
    })());
    return;
  }
  // interfaccia: prima la copia salvata (veloce, anche senza rete), intanto si aggiorna in sottofondo
  e.respondWith((async () => {
    const c = await caches.open(GUSCIO);
    const chiave = rel === '' ? 'index.html' : rel;
    const salvato = await c.match(chiave, { ignoreSearch: true });
    const rete = fetch(req).then(r => { if (r.ok) c.put(chiave, r.clone()); return r; }).catch(() => null);
    return salvato || (await rete) || new Response('Senza rete', { status: 503 });
  })());
});

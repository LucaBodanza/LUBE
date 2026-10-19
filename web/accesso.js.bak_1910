// ELSAP DSGN — accesso riservato (solo versione web).
// I cataloghi e il database sul sito sono cifrati (AES-256-GCM). La chiave dei dati è chiusa una volta per ogni account
// con la sua password (PBKDF2-SHA-256): senza password giusta non si apre niente. Le password non stanno da nessuna parte.
// Dopo l'accesso la chiave resta sul dispositivo (IndexedDB, non esportabile) finché non si preme "Esci";
// il service worker (sw.js) la usa per decifrare al volo PDF, immagini e dati.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const DB = 'elsap-accesso', ST = 'k', VOCE = 'sessione';

function idb() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST);
    r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
  });
}
async function sessione(v) {            // sessione() legge, sessione(x) scrive, sessione(null) cancella
  const db = await idb();
  return new Promise((ok, ko) => {
    const t = db.transaction(ST, v === undefined ? 'readonly' : 'readwrite'), s = t.objectStore(ST);
    const r = v === undefined ? s.get(VOCE) : (v === null ? s.delete(VOCE) : s.put(v, VOCE));
    r.onsuccess = () => ok(v === undefined ? (r.result || null) : true); r.onerror = () => ko(r.error);
  });
}

async function apri(acc, pw) {           // password giusta → chiave dei dati; sbagliata → errore
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  const kek = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(acc.s), iterations: acc.it, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const grezza = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(acc.v) }, kek, b64(acc.w));
  return crypto.subtle.importKey('raw', grezza, { name: 'AES-GCM' }, false, ['decrypt']);
}

const SVG = {};
const svg = async n => (SVG[n] ??= fetch(`web/img/${n}.svg`).then(r => r.text()).catch(() => ''));
const metti = async root => { const t = await svg('pittogramma'); root.querySelectorAll('.ac-pit').forEach(x => { x.innerHTML = t; }); };
const avatar = (a, i) => `<span class="ac-av t${i % 4}"><span class="ac-in">${esc(a.i)}</span><span class="ac-pit"></span></span>`;

async function schermata(ACC) {
  const el = document.createElement('section');
  el.id = 'accesso';
  el.innerHTML = `
    <div class="ac-marchio"><span class="logo" data-ac="logo"></span><span class="sep"></span><span class="app">ELSAP DSGN</span></div>
    <div class="ac-scelta">
      <h1>Chi sta usando <span class="acc">ELSAP DSGN</span>?</h1>
      <p class="lab">Accesso riservato · Who's using ELSAP DSGN?</p>
      <div class="ac-profili">${ACC.map((a, i) => `<button class="ac-p" data-i="${i}" style="--d:${i * 90}ms">${avatar(a, i)}<b>${esc(a.n)}</b><span class="lab">${esc(a.r)}</span></button>`).join('')}</div>
    </div>
    <form class="ac-pw" autocomplete="on">
      <div class="ac-chi"></div>
      <label class="lab" for="acPw">Password</label>
      <div class="ac-campo"><input id="acPw" type="password" autocomplete="current-password" spellcheck="false" required>
        <button type="button" class="ac-occhio" title="Mostra / nascondi">◉</button></div>
      <input type="text" name="username" autocomplete="username" class="ac-nascosto" tabindex="-1" aria-hidden="true">
      <div class="ac-err" role="alert"></div>
      <div class="ac-az"><button type="button" class="btn ghost ac-indietro">← Cambia profilo</button><button class="btn ac-entra">Entra →</button></div>
    </form>
    <p class="ac-piede lab">Cataloghi e database cifrati · si aprono solo con un account autorizzato</p>`;
  document.body.appendChild(el);
  el.querySelector('[data-ac="logo"]').innerHTML = await svg('logo');
  await metti(el);
  requestAnimationFrame(() => el.classList.add('su'));
  return new Promise(fine => {
    let scelto = null;
    const pw = el.querySelector('#acPw'), err = el.querySelector('.ac-err'), entra = el.querySelector('.ac-entra');
    el.querySelectorAll('.ac-p').forEach(b => b.onclick = () => {
      scelto = +b.dataset.i; const a = ACC[scelto];
      el.querySelector('.ac-chi').innerHTML = `${avatar(a, scelto)}<div><b>${esc(a.n)}</b><span class="lab">${esc(a.r)}</span></div>`;
      metti(el.querySelector('.ac-chi'));
      el.querySelector('.ac-nascosto').value = a.n;
      err.textContent = ''; pw.value = ''; el.classList.add('pw');
      setTimeout(() => pw.focus(), 350);
    });
    el.querySelector('.ac-indietro').onclick = () => { el.classList.remove('pw'); scelto = null; };
    el.querySelector('.ac-occhio').onclick = () => { pw.type = pw.type === 'password' ? 'text' : 'password'; pw.focus(); };
    addEventListener('keydown', e => { if (e.key === 'Escape' && el.classList.contains('pw')) el.classList.remove('pw'); });
    el.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      if (scelto == null || entra.disabled) return;
      entra.disabled = true; entra.textContent = 'Verifico…'; err.textContent = '';
      try {
        const chiave = await apri(ACC[scelto], pw.value);
        await sessione({ chiave, profilo: scelto, nome: ACC[scelto].n, ruolo: ACC[scelto].r, quando: Date.now() });
        el.classList.add('via'); setTimeout(() => el.remove(), 700);
        fine(scelto);
      } catch (x) {
        err.textContent = x && x.name === 'OperationError' ? 'Password non corretta' : 'Accesso non riuscito: ' + (x.message || x);
        el.querySelector('.ac-pw').classList.remove('scuoti'); void el.offsetWidth; el.querySelector('.ac-pw').classList.add('scuoti');
        pw.select();
      }
      entra.disabled = false; entra.textContent = 'Entra →';
    };
  });
}

async function swPronto() {              // la pagina deve passare dal service worker, se no i dati arrivano ancora cifrati
  const sw = navigator.serviceWorker;
  await sw.ready;
  if (!sw.controller) await new Promise(r => { sw.addEventListener('controllerchange', r, { once: true }); setTimeout(r, 5000); });
  if (!sw.controller) {                  // es. ricarica forzata (Maiusc+F5): una ricarica normale lo rimette in mezzo
    let giaFatto = false; try { giaFatto = sessionStorage.getItem('elsap-ricarica') === '1'; sessionStorage.setItem('elsap-ricarica', '1'); } catch (e) { /* niente */ }
    if (!giaFatto) { location.reload(); await new Promise(() => {}); }
    throw new Error('il browser non fa passare la pagina dal suo service worker');
  }
  try { sessionStorage.removeItem('elsap-ricarica'); } catch (e) { /* niente */ }
}

function profiloInBarra(s, ACC) {
  const dx = $('#barra .dx'); if (!dx) return;
  let k = ACC.findIndex(x => x.n === s.nome); if (k < 0) k = 0;          // per nome: l'ordine dei profili può cambiare
  const a = ACC.find(x => x.n === s.nome) || { n: s.nome, r: s.ruolo, i: (s.nome || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2) };
  const b = document.createElement('div');
  b.className = 'ac-menu';
  b.innerHTML = `<button class="ac-mini" title="${esc(a.n)} · ${esc(a.r)}">${avatar(a, k)}</button>
    <div class="ac-tendina"><div class="ac-chi">${avatar(a, k)}<div><b>${esc(a.n)}</b><span class="lab">${esc(a.r)}</span></div></div>
      <button data-a="cambia">Cambia profilo</button><button data-a="esci">Esci</button></div>`;
  dx.appendChild(b);
  metti(b);
  b.querySelector('.ac-mini').onclick = e => { e.stopPropagation(); b.classList.toggle('aperto'); };
  addEventListener('click', () => b.classList.remove('aperto'));
  b.querySelectorAll('[data-a]').forEach(x => x.onclick = esci);
}
async function esci() {
  try { await sessione(null); } catch (e) { /* niente */ }
  try { navigator.serviceWorker.controller?.postMessage({ tipo: 'esci' }); } catch (e) { /* niente */ }
  location.reload();
}

function blocco(msg) {
  document.body.insertAdjacentHTML('beforeend', `<section id="accesso" class="su"><div class="ac-scelta"><h1>ELSAP <span class="acc">DSGN</span></h1>
    <p class="ac-err">${esc(msg)}</p><p class="lab">Apri il sito con Chrome, Edge o Safari aggiornati, non in finestra anonima.</p></div></section>`);
}

(async function avvio() {
  if (!('serviceWorker' in navigator) || !window.crypto?.subtle || !window.indexedDB) return blocco('Questo browser non può aprire i cataloghi riservati.');
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('service worker', e));
  let ACC;
  try { ACC = await (await fetch('web/accesso.json', { cache: 'no-cache' })).json(); } catch (e) { return blocco('Non riesco a leggere gli account: controlla la connessione e ricarica.'); }
  let s = null;
  try { s = await sessione(); } catch (e) { return blocco('Il browser non permette di salvare l\'accesso (finestra anonima?).'); }
  if (!s || !s.chiave) { await schermata(ACC); s = await sessione(); }
  try { await swPronto(); } catch (e) { return blocco('Accesso fatto, ma ' + e.message + '. Ricarica la pagina.'); }
  navigator.serviceWorker.controller.postMessage({ tipo: 'entra' });
  await import('./app.js');
  const attendi = setInterval(() => { if (document.querySelector('#barra .logo svg')) { clearInterval(attendi); profiloInBarra(s, ACC); } }, 200);
})();

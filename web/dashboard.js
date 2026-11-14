// ELSAP DSGN — Dashboard a 3 Box (Libreria · Commerciale · Operations) e pagina «In preparazione» dei moduli.
// I moduli stanno in schemi/moduli.json. Il Box 1 apre la Home dei comparti (invariata).
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATO = { 'attivo': 'Attivo', 'in-costruzione': 'In costruzione', 'in-preparazione': 'In preparazione' };
const $ = s => document.querySelector(s);

export async function avviaDashboard({ S, vai, toast, azioni = {} }) {   // azioni: { idSezione: () => apri } per le sezioni già attive
  const radice = $('#dashboard'), pagina = $('#modulo');
  radice.innerHTML = '<div class="db-vuoto">Carico i moduli…</div>';
  let moduli = [];
  try {
    const r = await fetch(new URL('schemi/moduli.json', import.meta.url));
    if (!r.ok) throw new Error(r.status);
    moduli = (await r.json()).moduli;
  } catch (e) {
    console.warn('moduli.json non disponibile', e);
    radice.innerHTML = '<div class="db-vuoto">Moduli non disponibili.<br><button class="btn" data-libreria>Apri la Libreria</button></div>';
    radice.querySelector('[data-libreria]').onclick = () => vai('home');
    return;
  }
  S.moduli = moduli;

  const apri = m => {
    if (m.id === 'libreria') return vai('home');
    S.modulo = m; disegnaModulo(m); vai('modulo');
  };

  radice.innerHTML = `
    <div class="db-testa">
      <span class="pill cool">Moduli · Modules</span>
      <h2>Che cosa vuoi fare?</h2>
      <p class="muted">Tre aree di lavoro. Premi 1, 2 o 3 per aprirle.</p>
    </div>
    <div class="db-box">${moduli.map((m, i) => `
      <button class="db-card ${m.stato === 'attivo' ? 'attivo' : ''}" data-id="${esc(m.id)}" style="--bx:${esc(m.colore)}" aria-label="${esc(m.nome)}">
        <span class="db-n mono">0${m.numero ?? i + 1}</span>
        <h3>${esc(m.nome)}</h3>
        <span class="en">${esc(m.en)}</span>
        <p>${esc(m.descrizione)}</p>
        <ul>${m.sezioni.map(s => `<li>${esc(s.nome)}</li>`).join('')}</ul>
        <span class="db-stato">${esc(STATO[m.stato] || m.stato)}</span>
      </button>`).join('')}
    </div>`;
  radice.querySelectorAll('.db-card').forEach(b => b.onclick = () => apri(moduli.find(m => m.id === b.dataset.id)));

  addEventListener('keydown', e => {
    if (S.vista !== 'dashboard' || e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const m = moduli[Number(e.key) - 1];
    if (m) apri(m);
  });

  function disegnaModulo(m) {
    pagina.style.setProperty('--bx', m.colore);
    pagina.innerHTML = `
      <div class="md-testa">
        <button class="btn ghost" data-moduli>← Moduli</button>
        <span class="pill">${esc(STATO[m.stato] || m.stato)}</span>
        <h2>${esc(m.nome)}</h2>
        <span class="en">${esc(m.en)}</span>
        <p class="muted">${esc(m.descrizione)}</p>
      </div>
      <div class="md-sez">${m.sezioni.map(s => (s.stato === 'attivo' && azioni[s.id])
        ? `<button class="md-tessera attiva" data-s="${esc(s.id)}"><span class="md-nome">${esc(s.nome)}</span><span class="lab">${esc(STATO[s.stato])} · apri →</span></button>`
        : `<div class="md-tessera"><span class="md-nome">${esc(s.nome)}</span><span class="lab">${esc(STATO[s.stato] || s.stato)}</span></div>`).join('')}
      </div>
      <p class="md-nota muted">Questa area è in costruzione: arriva un pezzo alla volta.</p>`;
    pagina.querySelector('[data-moduli]').onclick = () => { S.storia = []; vai('dashboard', { push: false }); };   // dalla Dashboard non si «torna» a una pagina vecchia
    pagina.querySelectorAll('[data-s]').forEach(b => { b.onclick = () => azioni[b.dataset.s](); });
  }
}

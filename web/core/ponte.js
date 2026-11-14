// ELSAP DSGN — ponte fra i 3 Box (flusso dati: Libreria → Listino → Offerta).
// Qualunque schermata chiama inviaAOfferta(); il Box Commerciale ascolta con suOfferta().
const bus = new EventTarget();
export const inviaAOfferta = (codice, qta = 1, extra = {}) =>
  bus.dispatchEvent(new CustomEvent('aggiungi-offerta', { detail: { codice: String(codice), qta, ...extra } }));
export const suOfferta = fn => { const h = e => fn(e.detail); bus.addEventListener('aggiungi-offerta', h); return () => bus.removeEventListener('aggiungi-offerta', h); };

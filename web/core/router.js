// ELSAP DSGN — registro dei moduli (Box). La Dashboard (Fase 3) legge da qui quale modulo aprire.
const registro = new Map();
let corrente = null;
export const registra = modulo => { registro.set(modulo.ID, modulo); return modulo; };
export const elenco = () => [...registro.values()];
export const moduloAttivo = () => corrente;
export async function apriModulo(id, contenitore) {
  const m = registro.get(id);
  if (!m) throw new Error('Modulo sconosciuto: ' + id);
  if (corrente && corrente.chiudi) corrente.chiudi();
  corrente = m;
  await m.monta(contenitore);
  document.dispatchEvent(new CustomEvent('modulo', { detail: { id } }));
}

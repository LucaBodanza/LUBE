// ELSAP DSGN — archivio locale dei moduli (IndexedDB). I dati reali restano nel browser di ognuno.
// Collezioni: listini, clienti, lead, offerte, ordini. Ogni documento ha un campo "id".
// Backup: esporta()/importa() lavorano su JSON semplice; la cifratura con la chiave ELSAP arriva con il Box 3 (Listino).

const DB = 'elsap-moduli', VERSIONE = 1;
export const COLLEZIONI = ['listini', 'clienti', 'lead', 'offerte', 'ordini'];

let _db = null;
function apri() {
  if (_db) return _db;
  _db = new Promise((ok, no) => {
    const r = indexedDB.open(DB, VERSIONE);
    r.onupgradeneeded = () => { for (const c of COLLEZIONI) if (!r.result.objectStoreNames.contains(c)) r.result.createObjectStore(c, { keyPath: 'id' }); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { _db = null; no(r.error); };
  });
  return _db;
}
async function tx(coll, modo, fn) {
  const db = await apri();
  return new Promise((ok, no) => {
    const t = db.transaction(coll, modo), s = t.objectStore(coll), r = fn(s);
    t.oncomplete = () => ok(r && 'result' in r ? r.result : undefined);
    t.onerror = t.onabort = () => no(t.error);
  });
}
export const tutti = coll => tx(coll, 'readonly', s => s.getAll());
export const leggi = (coll, id) => tx(coll, 'readonly', s => s.get(id));
export const scrivi = (coll, doc) => tx(coll, 'readwrite', s => s.put(doc));
export const elimina = (coll, id) => tx(coll, 'readwrite', s => s.delete(id));
// molte righe in una sola transazione (import di migliaia di codici: una per riga sarebbe lentissimo)
export async function scriviMolti(coll, docs) {
  const db = await apri();
  return new Promise((ok, no) => {
    const t = db.transaction(coll, 'readwrite'), s = t.objectStore(coll);
    for (const d of docs) s.put(d);
    t.oncomplete = () => ok(docs.length);
    t.onerror = t.onabort = () => no(t.error);
  });
}

export async function esporta() {
  const dati = {};
  for (const c of COLLEZIONI) dati[c] = await tutti(c);
  return { app: 'ELSAP DSGN', versione: VERSIONE, esportato: new Date().toISOString(), dati };
}
export async function importa(backup) {
  if (!backup || backup.app !== 'ELSAP DSGN' || typeof backup.dati !== 'object') throw new Error('Backup non valido');
  for (const c of COLLEZIONI) for (const doc of backup.dati[c] || []) await scrivi(c, doc);
}

// ELSAP DSGN — permessi di interfaccia per ruolo (il ruolo è il campo "r" di accesso.json).
// Attenzione: nasconde i prezzi nella schermata, non protegge i dati. La protezione vera è la cifratura.

// Ruoli esistenti: vedi web/schemi/ruoli.json.
// Il prezzo di VENDITA lo vede chiunque abbia fatto l'accesso.
export const vedeVendita = ruolo => Boolean(ruolo);

// Il prezzo di ACQUISTO (e quindi i margini) è riservato.
// Lista esplicita (nomi esatti come in schemi/ruoli.json): per cambiare chi vede gli acquisti basta modificare questa lista.
const RUOLI_ACQUISTO = ['CEO - Commerciale', 'CO-CEO - Commerciale'];
export const vedeAcquisto = ruolo => RUOLI_ACQUISTO.includes(ruolo);

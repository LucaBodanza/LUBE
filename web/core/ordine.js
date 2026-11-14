// ELSAP DSGN — Conferme d'ordine: nascono da un'offerta Accettata e «bloccano» le condizioni pattuite. Funzioni pure (test: sorgenti/test/t_ordini.mjs).
import { totali, prossimoNumero } from './offerta.js';

export const STATI_ORDINE = [`Confermato`, `In acquisto`, `In spedizione`, `Evaso`, `Fatturato`];
// Da quale stato a quale (modificare qui per cambiare il percorso): dal magazzino si può spedire senza passare dall'acquisto
export const SUCCESSIVI_ORDINE = {
  'Confermato': [`In acquisto`, `In spedizione`],
  'In acquisto': [`In spedizione`],
  'In spedizione': [`Evaso`],
  'Evaso': [`Fatturato`],
  'Fatturato': [],
};

// Un'offerta genera UN solo ordine, e solo da Accettata
export const puoCreareOrdine = (off, ordini) => off.stato === `Accettata` && !ordini.some(o => o.offerta_id === off.id);

export function creaOrdine(off, cliente, ordini, adesso = new Date()) {
  const iso = adesso.toISOString();
  const copia = JSON.parse(JSON.stringify(off));
  return {
    id: prossimoNumero(ordini, adesso.getFullYear(), `ORD`), offerta_id: off.id, stato: `Confermato`, creato: iso,
    rif_cliente: ``, consegna_richiesta: ``, note: ``, storico: [{ stato: `Confermato`, quando: iso }],
    condizioni_bloccate: {
      cliente: { id: off.cliente_id, nome: cliente?.ragione_sociale || ``, piva: cliente?.piva || ``, sede_legale: cliente?.sede_legale || ``, sede_spedizione: cliente?.sede_spedizione || `` },
      pagamento: copia.condizioni?.pagamento || ``, resa: copia.condizioni?.resa || ``,
      righe: copia.righe || [], sconto_totale: copia.sconto_totale || 0, note_tecniche: copia.note_tecniche || ``,
      imponibile: totali(copia).imponibile, bloccate_il: iso,
    },
  };
}

export function cambiaStatoOrdine(ordine, nuovo, adesso = new Date()) {
  if (!(SUCCESSIVI_ORDINE[ordine.stato] || []).includes(nuovo)) throw new Error(`Da «${ordine.stato}» non si può passare a «${nuovo}»`);
  return { ...ordine, stato: nuovo, storico: [...(ordine.storico || []), { stato: nuovo, quando: adesso.toISOString() }] };
}

// Foglio della conferma: stesso formato dell'offerta, con i dati bloccati
export function comeOfferta(ordine) {
  const c = ordine.condizioni_bloccate;
  return { id: ordine.id, creata: ordine.creato, valida_fino: null, righe: c.righe, sconto_totale: c.sconto_totale,
    condizioni: { pagamento: c.pagamento, resa: c.resa }, note_tecniche: c.note_tecniche };
}

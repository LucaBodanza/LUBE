// ELSAP DSGN — foglio dell'offerta per la stampa / PDF (A4). Mai prezzi di acquisto né margini: solo ciò che vede il cliente.
import { nettoRiga, totali } from '../core/offerta.js';

const esc = s => String(s ?? ``).replace(/[&<>"']/g, c => ({ '&': `&amp;`, '<': `&lt;`, '>': `&gt;`, '"': `&quot;`, "'": `&#39;` }[c]));
const EUR = new Intl.NumberFormat(`it-IT`, { style: `currency`, currency: `EUR` });
const dataIt = d => (d ? new Date(String(d).length === 10 ? `${d}T00:00:00` : d).toLocaleDateString(`it-IT`) : `—`);

export function htmlOfferta(o, cliente) {
  const T = totali(o), cond = o.condizioni || {};
  const righe = (o.righe || []).map((r, i) => `<tr><td class="n">${i + 1}</td><td class="c">${esc(r.codice)}</td>
    <td>${esc(r.descrizione)}${r.note ? `<div class="nota">${esc(r.note)}</div>` : ``}</td><td class="r">${esc(r.qta)}</td><td class="r">${EUR.format(Number(r.prezzo) || 0)}</td>
    <td class="r">${r.sconto ? `${String(r.sconto).replace(`.`, `,`)} %` : ``}</td><td class="r">${EUR.format(nettoRiga(r))}</td><td class="r">${r.consegna_giorni != null ? `${esc(r.consegna_giorni)} gg` : ``}</td></tr>`).join(``);
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(o.id)}</title><style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; } body { font: 11px/1.45 "Helvetica Neue", Arial, sans-serif; color: #111; margin: 0; }
    .testa { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 10px; }
    .marchio { font-size: 26px; font-weight: 700; letter-spacing: -.02em; } .marchio span { color: #2A9BE3; }
    .num { text-align: right; } .num b { font-size: 16px; display: block; }
    .blocchi { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 16px 0; }
    .blocchi h4 { margin: 0 0 4px; font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { text-align: left; font-size: 9px; letter-spacing: .06em; text-transform: uppercase; color: #555; border-bottom: 1px solid #111; padding: 6px 5px; }
    td { padding: 6px 5px; border-bottom: 1px solid #ddd; vertical-align: top; }
    .r { text-align: right; white-space: nowrap; } .n { color: #888; width: 22px; } .c { font-family: Menlo, monospace; white-space: nowrap; }
    .nota { color: #666; font-size: 10px; }
    .totali { margin: 14px 0 0 auto; width: 240px; } .totali div { display: flex; justify-content: space-between; padding: 3px 0; }
    .totali .tot { border-top: 2px solid #111; margin-top: 4px; padding-top: 6px; font-size: 14px; font-weight: 700; }
    .note { margin-top: 16px; white-space: pre-wrap; } .piede { margin-top: 18px; color: #555; font-size: 10px; }
    tr { page-break-inside: avoid; }
  </style></head><body>
    <div class="testa"><div class="marchio">ELSAP <span>DSGN</span></div><div class="num"><b>Offerta ${esc(o.id)}</b>del ${dataIt(o.creata)}</div></div>
    <div class="blocchi">
      <div><h4>Cliente</h4><b>${esc(cliente?.ragione_sociale || `—`)}</b>${cliente?.piva ? `<br>P.IVA ${esc(cliente.piva)}` : ``}${cliente?.sede_legale ? `<br>${esc(cliente.sede_legale)}` : ``}</div>
      <div><h4>Condizioni</h4>Pagamento: ${esc(cond.pagamento || `—`)}<br>Resa: ${esc(cond.resa || `—`)}<br>Valida fino al ${dataIt(o.valida_fino)}</div>
    </div>
    <table><thead><tr><th>#</th><th>Codice</th><th>Descrizione</th><th class="r">Q.tà</th><th class="r">Prezzo</th><th class="r">Sconto</th><th class="r">Totale</th><th class="r">Consegna</th></tr></thead><tbody>${righe}</tbody></table>
    <div class="totali">
      <div><span>Totale righe</span><span>${EUR.format(T.lordo)}</span></div>
      ${T.scontoTotale ? `<div><span>Sconto ${String(o.sconto_totale).replace(`.`, `,`)} %</span><span>−${EUR.format(T.scontoTotale)}</span></div>` : ``}
      <div class="tot"><span>Imponibile</span><span>${EUR.format(T.imponibile)}</span></div>
      <div style="color:#666;font-size:10px"><span>IVA esclusa</span><span></span></div>
    </div>
    ${o.note_tecniche ? `<div class="note"><b>Note tecniche</b><br>${esc(o.note_tecniche)}</div>` : ``}
    <div class="piede">Offerta valida fino al ${dataIt(o.valida_fino)}. Prezzi in euro, IVA esclusa.</div>
  </body></html>`;
}

// ELSAP DSGN — Conferme d'ordine (Box 2): nascono da un'offerta Accettata, con condizioni bloccate; poi seguono gli stati fino a Fatturato.
// Solo nel browser di chi le crea (IndexedDB, collezione "ordini"). Regole in core/ordine.js. Alimenteranno Acquisti, Logistica e Venduto (Box 3).
import { tutti, scrivi, elimina } from '../core/store.js';
import { vedeAcquisto, vedeVendita } from '../core/permessi.js';
import { totali, nettoRiga } from '../core/offerta.js';
import { STATI_ORDINE, SUCCESSIVI_ORDINE, creaOrdine, cambiaStatoOrdine, comeOfferta } from '../core/ordine.js';
import { htmlOfferta } from './offerta-stampa.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? ``).replace(/[&<>"']/g, c => ({ '&': `&amp;`, '<': `&lt;`, '>': `&gt;`, '"': `&quot;`, "'": `&#39;` }[c]));
const EUR = new Intl.NumberFormat(`it-IT`, { style: `currency`, currency: `EUR` });
const dataIt = d => (d ? new Date(String(d).length === 10 ? `${d}T00:00:00` : d).toLocaleDateString(`it-IT`) : `—`);
const oraIt = d => new Date(d).toLocaleString(`it-IT`, { day: `2-digit`, month: `2-digit`, year: `numeric`, hour: `2-digit`, minute: `2-digit` });
const perc = n => `${String(n).replace(`.`, `,`)} %`;

export function avviaOrdini({ S, vai, toast, indietro }) {
  const radiceL = $(`#ordini`), radiceD = $(`#ordine`);
  let ordini = [], corrente = null, filtroStato = `Tutti`, filtro = ``, timer = null;
  const ruolo = () => window.elsapRuolo;
  const vediA = () => vedeAcquisto(ruolo());

  async function carica() { ordini = (await tutti(`ordini`)).sort((a, b) => b.id.localeCompare(a.id)); }

  // ------------------------------------------------------------------ elenco
  function disegnaLista() {
    radiceL.innerHTML = `
      <div class="ls-testa">
        <button class="btn ghost" data-indietro>← Commerciale &amp; Offerte</button>
        <span class="pill cool">Box 2 · Commerciale</span>
        <h2>Conferme d'ordine <span class="en">Order confirmations</span></h2>
        <p class="muted" id="orInfo"></p>
        <div class="ls-az"><div class="seg" id="orSeg"></div><input type="search" id="orFiltro" placeholder="Cerca numero, cliente, offerta…" autocomplete="off"></div>
      </div>
      <div class="ls-avviso">Un'offerta Accettata diventa conferma d'ordine con il pulsante «Crea conferma d'ordine» nella scheda dell'offerta. Le condizioni si bloccano in quel momento.</div>
      <div class="ls-tab" id="orLista"></div>`;
    radiceL.querySelector(`[data-indietro]`).onclick = () => indietro();
    radiceL.querySelector(`#orFiltro`).oninput = e => { filtro = e.target.value; lista(); };
    $(`#orLista`).onclick = e => { const r = e.target.closest(`[data-apri]`); if (r) apriId(r.dataset.apri); };
  }
  function lista() {
    if (!$(`#orLista`)) return;
    const conta = s => ordini.filter(o => s === `Tutti` || o.stato === s).length;
    $(`#orSeg`).innerHTML = [`Tutti`, ...STATI_ORDINE].map(s => `<button data-s="${esc(s)}" class="${s === filtroStato ? `on` : ``}">${esc(s)} ${conta(s)}</button>`).join(``);
    $(`#orSeg`).querySelectorAll(`button`).forEach(b => { b.onclick = () => { filtroStato = b.dataset.s; lista(); }; });
    $(`#orInfo`).textContent = `${ordini.length} ordini`;
    const q = filtro.trim().toLowerCase();
    const L = ordini.filter(o => (filtroStato === `Tutti` || o.stato === filtroStato) && (!q || `${o.id} ${o.offerta_id} ${o.condizioni_bloccate.cliente.nome} ${o.rif_cliente || ``}`.toLowerCase().includes(q)));
    $(`#orLista`).innerHTML = !L.length
      ? `<div class="ls-vuoto">${ordini.length ? `Nessun ordine trovato.` : `Non ci sono ancora conferme d'ordine.<br><span class="muted">Accetta un'offerta e creane la conferma dalla sua scheda.</span>`}</div>`
      : `<table class="ls-t"><thead><tr><th>Numero</th><th>Cliente</th><th>Offerta</th><th>Stato</th><th class="num">Imponibile</th><th class="num">Confermato</th><th class="num">Consegna richiesta</th></tr></thead><tbody>
        ${L.map(o => `<tr class="ls-riga" data-apri="${esc(o.id)}"><td class="cod">${esc(o.id)}</td><td>${esc(o.condizioni_bloccate.cliente.nome || `—`)}</td><td class="cod">${esc(o.offerta_id)}</td>
          <td><span class="pill ${o.stato === `Fatturato` ? `cool` : ``}">${esc(o.stato)}</span></td><td class="num">${EUR.format(o.condizioni_bloccate.imponibile)}</td>
          <td class="num">${dataIt(o.creato)}</td><td class="num">${dataIt(o.consegna_richiesta)}</td></tr>`).join(``)}</tbody></table>`;
  }

  // ------------------------------------------------------------------ scheda
  async function apriId(id) {
    corrente = ordini.find(o => o.id === id);
    if (!corrente) { await carica(); corrente = ordini.find(o => o.id === id); }
    if (!corrente) return toast(`Ordine ${id} non trovato`);
    S.ordineId = id; scheda(); vai(`ordine`);
  }
  function scheda() {
    const o = corrente, c = o.condizioni_bloccate, cl = c.cliente, A = vediA(), T = totali({ righe: c.righe, sconto_totale: c.sconto_totale });
    const sola = (et, v, cls = ``) => `<label class="${cls}">${et}<input value="${esc(v)}" readonly></label>`;
    radiceD.innerHTML = `
      <div class="ls-testa">
        <button class="btn ghost" data-indietro>← Indietro</button>
        <span class="pill cool">Box 2 · Commerciale</span>
        <h2>${esc(o.id)} <span class="pill ${o.stato === `Fatturato` ? `cool` : ``}">${esc(o.stato)}</span></h2>
        <p class="muted" id="orSalva">Da offerta ${esc(o.offerta_id)} · confermata il ${dataIt(o.creato)}</p>
        <div class="ls-az">
          <button class="btn ghost" data-stampa>Stampa / PDF</button>
          ${o.stato === `Confermato` ? `<button class="btn ghost" data-elimina>Elimina</button>` : ``}<span class="sp"></span>
          ${SUCCESSIVI_ORDINE[o.stato].map(s => `<button class="btn ${s === `Fatturato` || s === `Evaso` ? `` : `ghost`}" data-stato="${esc(s)}">→ ${esc(s)}</button>`).join(``)}
        </div>
      </div>
      <div class="ls-avviso">Condizioni bloccate il ${oraIt(c.bloccate_il)}: righe, prezzi e sconti non si modificano. Per cambiarli serve una nuova offerta.</div>
      <div class="of-meta">
        ${sola(`Cliente`, cl.nome || `—`, `largo2`)}${sola(`P.IVA`, cl.piva || `—`)}${sola(`Offerta`, o.offerta_id)}
        ${sola(`Sede legale`, cl.sede_legale || `—`, `largo2`)}${sola(`Pagamento`, c.pagamento || `—`)}${sola(`Resa / trasporto`, c.resa || `—`)}
        <label>Rif. ordine del cliente<input data-f="rif_cliente" value="${esc(o.rif_cliente)}"></label>
        <label>Consegna richiesta<input type="date" data-f="consegna_richiesta" value="${esc(o.consegna_richiesta)}"></label>
        <label class="largo">Note interne<textarea data-f="note" rows="2">${esc(o.note)}</textarea></label>
      </div>
      <div class="of-righe"><table class="ls-t of-t"><thead><tr><th>#</th><th>Codice</th><th>Descrizione</th><th class="num">Q.tà</th><th class="num">Prezzo</th><th class="num">Sconto</th><th class="num">Totale</th><th class="num">Consegna</th>${A ? `<th class="num">Acquisto</th>` : ``}</tr></thead><tbody>
        ${c.righe.map((r, i) => `<tr><td class="num">${i + 1}</td><td class="cod">${esc(r.codice)}</td><td>${esc(r.descrizione)}${r.note ? `<div class="muted">${esc(r.note)}</div>` : ``}</td>
          <td class="num">${esc(r.qta)}</td><td class="num">${EUR.format(Number(r.prezzo) || 0)}</td><td class="num">${r.sconto ? perc(r.sconto) : `—`}</td><td class="num">${EUR.format(nettoRiga(r))}</td>
          <td class="num">${r.consegna_giorni != null ? `${esc(r.consegna_giorni)} gg` : `—`}</td>${A ? `<td class="num">${r.acquisto != null ? EUR.format(r.acquisto) : `—`}</td>` : ``}</tr>`).join(``)}</tbody></table></div>
      <div class="of-tot"><dl><dt>Totale righe</dt><dd>${EUR.format(T.lordo)}</dd>${T.scontoTotale ? `<dt>Sconto ${perc(c.sconto_totale)}</dt><dd>−${EUR.format(T.scontoTotale)}</dd>` : ``}
        <dt class="gr">Imponibile</dt><dd class="gr">${EUR.format(T.imponibile)}</dd>
        ${A && T.margine != null ? `<dt class="mg">Margine${T.parziale ? ` (parziale)` : ``}</dt><dd class="mg">${EUR.format(T.margine)}${T.marginePerc != null ? ` · ${perc(T.marginePerc)}` : ``}</dd>` : ``}</dl></div>
      ${c.note_tecniche ? `<div class="or-note"><span class="lab">Note tecniche dell'offerta</span><p>${esc(c.note_tecniche)}</p></div>` : ``}
      <div class="or-storico"><span class="lab">Storico</span><ul>${o.storico.map(s => `<li><b>${esc(s.stato)}</b><span class="muted">${oraIt(s.quando)}</span></li>`).join(``)}</ul></div>`;
  }

  function salva() { clearTimeout(timer); const s = $(`#orSalva`); if (s) s.textContent = `Modifiche in corso…`; timer = setTimeout(salvaSubito, 400); }
  async function salvaSubito() {
    clearTimeout(timer); timer = null;
    if (!corrente) return;
    await scrivi(`ordini`, corrente);
    const s = $(`#orSalva`); if (s) s.textContent = `Salvato · ${new Date().toLocaleTimeString(`it-IT`, { hour: `2-digit`, minute: `2-digit` })}`;
  }
  async function cambia(nuovo) {
    await salvaSubito();
    try { corrente = cambiaStatoOrdine(corrente, nuovo); } catch (e) { return toast(e.message); }
    ordini = ordini.map(o => (o.id === corrente.id ? corrente : o));
    await scrivi(`ordini`, corrente); scheda(); toast(`${corrente.id}: ${nuovo}`);
  }
  async function eliminaOrdine() {
    if (!confirm(`Eliminare la conferma ${corrente.id}? L'offerta ${corrente.offerta_id} resta Accettata e se ne potrà creare un'altra.`)) return;
    await elimina(`ordini`, corrente.id); ordini = ordini.filter(o => o.id !== corrente.id); corrente = null; lista(); toast(`Conferma eliminata`); indietro();
  }
  function stampa() {
    const c = corrente.condizioni_bloccate, f = document.createElement(`iframe`);
    f.style.cssText = `position:fixed;right:0;bottom:0;width:0;height:0;border:0`;
    f.onload = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); };
    document.body.appendChild(f);
    f.srcdoc = htmlOfferta(comeOfferta(corrente), { ragione_sociale: c.cliente.nome, piva: c.cliente.piva, sede_legale: c.cliente.sede_legale },
      { titolo: `Conferma d'ordine`, riferimento: `Offerta ${corrente.offerta_id}${corrente.rif_cliente ? ` · Rif. cliente ${corrente.rif_cliente}` : ``}`, consegna: corrente.consegna_richiesta });
  }

  radiceD.addEventListener(`input`, e => { const f = e.target.dataset.f; if (f && corrente) { corrente[f] = e.target.value; salva(); } });
  radiceD.addEventListener(`change`, () => { if (timer) salvaSubito(); });
  radiceD.addEventListener(`click`, async e => {
    const b = e.target.closest(`button`); if (!b) return;
    if (b.dataset.stato) return cambia(b.dataset.stato);
    if (b.dataset.stampa !== undefined) { await salvaSubito(); return stampa(); }
    if (b.dataset.elimina !== undefined) return eliminaOrdine();
    if (b.dataset.indietro !== undefined) { await salvaSubito(); lista(); indietro(); }
  });
  document.addEventListener(`vista`, e => { if (e.detail === `ordini`) lista(); });

  return {
    async apri() {
      if (!vedeVendita(ruolo())) return toast(`Il tuo ruolo non vede i prezzi: le conferme d'ordine non sono disponibili`);
      try { await carica(); } catch (e) { console.warn(`ordini`, e); return toast(`Il browser non permette di salvare le conferme (finestra anonima?)`); }
      filtroStato = `Tutti`; filtro = ``; disegnaLista(); lista(); vai(`ordini`);
    },
    apriId,
    // Dall'offerta Accettata: crea la conferma con le condizioni bloccate e la apre
    async creaDaOfferta(off) {
      await carica();
      const gia = ordini.find(o => o.offerta_id === off.id);
      if (gia) { toast(`Per ${off.id} c'è già ${gia.id}`); return apriId(gia.id); }
      const [clienti, lead] = await Promise.all([tutti(`clienti`), tutti(`lead`)]);
      const cl = clienti.find(c => c.id === off.cliente_id) || lead.find(l => l.id === off.cliente_id);
      const o = creaOrdine(off, cl, ordini);
      await scrivi(`ordini`, o); ordini.unshift(o);
      toast(lead.some(l => l.id === off.cliente_id) ? `Creata ${o.id}. Il cliente è ancora un lead: convertilo nell'Anagrafica.` : `Creata ${o.id}`);
      return apriId(o.id);
    },
  };
}

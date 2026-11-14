// ELSAP DSGN — Offerte (Box 2): elenco, editor con righe dal Listino, sconti del cliente, margini (solo per chi li vede), stati, stampa/PDF.
// Solo nel browser di chi le scrive (IndexedDB, collezione "offerte"). Regole di calcolo e di stato in core/offerta.js.
import { tutti, scrivi, elimina } from '../core/store.js';
import { numero } from '../core/csv.js';
import { vedeAcquisto, vedeVendita } from '../core/permessi.js';
import { STATI, MODIFICABILI, SUCCESSIVI, nettoRiga, totali, prossimoNumero, scaduta, giorno, traGiorni, rigaDaListino, problemiInvio } from '../core/offerta.js';
import { compartoDi } from '../comparti.js';
import { htmlOfferta } from './offerta-stampa.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? ``).replace(/[&<>"']/g, c => ({ '&': `&amp;`, '<': `&lt;`, '>': `&gt;`, '"': `&quot;`, "'": `&#39;` }[c]));
const EUR = new Intl.NumberFormat(`it-IT`, { style: `currency`, currency: `EUR` });
const dataIt = d => (d ? new Date(String(d).length === 10 ? `${d}T00:00:00` : d).toLocaleDateString(`it-IT`) : `—`);
const perc = n => `${String(n).replace(`.`, `,`)} %`;

export function avviaOfferte({ S, vai, toast, indiceCodici, indietro, creaOrdine, apriOrdine }) {
  const radiceL = $(`#offerte`), radiceE = $(`#offerta`);
  let offerte = [], clienti = [], lead = [], listino = [], ordini = [], indice = new Map(), indicePronto = null;
  const ordineDi = o => ordini.find(x => x.offerta_id === o.id);
  let corrente = null, filtroStato = `Tutte`, filtro = ``, timer = null;
  const ruolo = () => window.elsapRuolo;
  const vediA = () => vedeAcquisto(ruolo());
  const nomeCliente = id => (clienti.find(c => c.id === id) || lead.find(l => l.id === id))?.ragione_sociale || `—`;

  async function carica() {
    [offerte, clienti, lead, listino, ordini] = await Promise.all([tutti(`offerte`), tutti(`clienti`), tutti(`lead`), tutti(`listini`), tutti(`ordini`)]);
    const oggi = new Date();
    for (const o of offerte) if (scaduta(o, oggi)) { o.stato = `Scaduta`; o.aggiornato = new Date().toISOString(); await scrivi(`offerte`, o); }
    offerte.sort((a, b) => b.id.localeCompare(a.id));
  }

  // ------------------------------------------------------------------ elenco
  function disegnaLista() {
    radiceL.innerHTML = `
      <div class="ls-testa">
        <button class="btn ghost" data-indietro>← Commerciale &amp; Offerte</button>
        <span class="pill cool">Box 2 · Commerciale</span>
        <h2>Offerte <span class="en">Quotes</span></h2>
        <p class="muted" id="ofInfo"></p>
        <div class="ls-az">
          <div class="seg" id="ofSeg"></div>
          <input type="search" id="ofFiltro" placeholder="Cerca numero o cliente…" autocomplete="off">
          <button class="btn" data-nuova>+ Nuova offerta</button>
        </div>
      </div>
      <div class="ls-avviso">Le offerte restano solo in questo browser. Il PDF non contiene mai prezzi di acquisto né margini.</div>
      <div class="ls-tab" id="ofLista"></div>`;
    radiceL.querySelector(`[data-indietro]`).onclick = () => indietro();
    radiceL.querySelector(`#ofFiltro`).oninput = e => { filtro = e.target.value; lista(); };
    radiceL.querySelector(`[data-nuova]`).onclick = nuova;
    $(`#ofLista`).onclick = e => { const r = e.target.closest(`[data-apri]`); if (r) apriEditor(r.dataset.apri); };
  }
  function lista() {
    if (!$(`#ofLista`)) return;
    const conta = s => offerte.filter(o => s === `Tutte` || o.stato === s).length;
    $(`#ofSeg`).innerHTML = [`Tutte`, ...STATI].map(s => `<button data-s="${esc(s)}" class="${s === filtroStato ? `on` : ``}">${esc(s)} ${conta(s)}</button>`).join(``);
    $(`#ofSeg`).querySelectorAll(`button`).forEach(b => { b.onclick = () => { filtroStato = b.dataset.s; lista(); }; });
    $(`#ofInfo`).textContent = `${offerte.length} offerte`;
    const q = filtro.trim().toLowerCase();
    const L = offerte.filter(o => (filtroStato === `Tutte` || o.stato === filtroStato) && (!q || `${o.id} ${nomeCliente(o.cliente_id)}`.toLowerCase().includes(q)));
    $(`#ofLista`).innerHTML = !L.length
      ? `<div class="ls-vuoto">${offerte.length ? `Nessuna offerta trovata.` : `Non ci sono ancora offerte.<br><span class="muted">Crea la prima con «Nuova offerta».</span>`}</div>`
      : `<table class="ls-t"><thead><tr><th>Numero</th><th>Cliente</th><th>Stato</th><th class="num">Imponibile</th><th class="num">Creata</th><th class="num">Valida fino</th></tr></thead><tbody>
        ${L.map(o => `<tr class="ls-riga" data-apri="${esc(o.id)}"><td class="cod">${esc(o.id)}</td><td>${esc(nomeCliente(o.cliente_id))}</td>
          <td><span class="pill ${o.stato === `Accettata` ? `cool` : ``}">${esc(o.stato)}</span></td><td class="num">${EUR.format(totali(o).imponibile)}</td>
          <td class="num">${dataIt(o.creata)}</td><td class="num">${dataIt(o.valida_fino)}</td></tr>`).join(``)}</tbody></table>`;
  }

  async function nuova() {
    const o = { id: prossimoNumero(offerte), cliente_id: ``, stato: `Bozza`, righe: [], sconto_totale: 0, note_tecniche: ``,
      condizioni: { pagamento: ``, resa: `` }, creata: new Date().toISOString(), valida_fino: traGiorni(30), revisione_di: null };
    await scrivi(`offerte`, o); offerte.unshift(o); apriEditor(o.id);
  }

  // ------------------------------------------------------------------ editor
  function apriEditor(id) {
    corrente = offerte.find(o => o.id === id); if (!corrente) return;
    S.offertaId = id; editor(); vai(`offerta`);
  }

  function editor() {
    const o = corrente, mod = MODIFICABILI.has(o.stato), dis = mod ? `` : `disabled`;
    const opzCliente = `<option value="">— scegli —</option>
      ${clienti.length ? `<optgroup label="Clienti">${clienti.map(c => `<option value="${esc(c.id)}" ${c.id === o.cliente_id ? `selected` : ``}>${esc(c.ragione_sociale)}</option>`).join(``)}</optgroup>` : ``}
      ${lead.length ? `<optgroup label="Lead">${lead.map(l => `<option value="${esc(l.id)}" ${l.id === o.cliente_id ? `selected` : ``}>${esc(l.ragione_sociale)}</option>`).join(``)}</optgroup>` : ``}`;
    radiceE.innerHTML = `
      <div class="ls-testa">
        <button class="btn ghost" data-indietro>← Offerte</button>
        <span class="pill cool">Box 2 · Commerciale</span>
        <h2>${esc(o.id)} <span class="pill ${o.stato === `Accettata` ? `cool` : ``}">${esc(o.stato)}</span></h2>
        <p class="muted" id="ofSalva">${o.revisione_di ? `Duplicata da ${esc(o.revisione_di)} · ` : ``}Creata il ${dataIt(o.creata)}</p>
        <div class="ls-az">
          <button class="btn ghost" data-stampa>Stampa / PDF</button><button class="btn ghost" data-duplica>Duplica</button>
          ${o.stato === `Bozza` ? `<button class="btn ghost" data-elimina>Elimina</button>` : ``}<span class="sp"></span>
          ${o.stato === `Accettata` ? (ordineDi(o) ? `<button class="btn" data-ordine="${esc(ordineDi(o).id)}">Conferma ${esc(ordineDi(o).id)} →</button>` : `<button class="btn" data-crea-ordine>Crea conferma d'ordine</button>`) : ``}
          ${SUCCESSIVI[o.stato].map(s => `<button class="btn ${s === `Inviata` || s === `Accettata` ? `` : `ghost`}" data-stato="${esc(s)}">${s === `Inviata` ? `Segna come inviata` : s === `Accettata` ? `Segna come accettata` : `→ ${esc(s)}`}</button>`).join(``)}
        </div>
      </div>
      ${mod ? `` : `<div class="ls-avviso">Offerta «${esc(o.stato)}»: non si modifica. Per cambiarla usa «→ In revisione» (oppure Duplica per farne una nuova).</div>`}
      <div class="of-meta">
        <label class="largo2">Cliente / Lead<select data-f="cliente_id" ${dis}>${opzCliente}</select></label>
        <label>Valida fino al<input type="date" data-f="valida_fino" value="${esc(o.valida_fino || ``)}" ${dis}></label>
        <label>Sconto sul totale (%)<input data-f="sconto_totale" inputmode="decimal" value="${o.sconto_totale ? String(o.sconto_totale).replace(`.`, `,`) : ``}" ${dis}></label>
        <label>Pagamento<input data-f="pagamento" value="${esc(o.condizioni?.pagamento)}" ${dis}></label>
        <label>Resa / trasporto<input data-f="resa" value="${esc(o.condizioni?.resa)}" ${dis}></label>
        <label class="largo">Note tecniche<textarea data-f="note_tecniche" rows="2" ${dis}>${esc(o.note_tecniche)}</textarea></label>
      </div>
      <div class="of-righe" id="ofRighe">${righeHtml()}</div>
      ${mod ? `<div class="of-agg"><div class="of-cerca"><input type="search" id="ofCerca" placeholder="Aggiungi dal listino: codice, marchio, descrizione…" autocomplete="off"><div class="of-ris" id="ofRis" hidden></div></div>
        <button class="btn ghost" data-libera>+ Riga libera</button></div>` : ``}
      <div class="of-tot" id="ofTot">${totaliHtml()}</div>`;
  }

  const margineRiga = r => {
    const n = nettoRiga(r);
    return r.acquisto != null && n > 0 ? perc(((n - (Number(r.qta) || 0) * r.acquisto) / n * 100).toFixed(1)) : `—`;
  };
  function righeHtml() {
    const o = corrente, mod = MODIFICABILI.has(o.stato), dis = mod ? `` : `disabled`, A = vediA();
    if (!o.righe.length) return `<div class="ls-vuoto">Nessuna riga.${mod ? `<br><span class="muted">Cerca un codice qui sotto oppure aggiungi una riga libera.</span>` : ``}</div>`;
    const n = (i, k, v) => `<td class="num"><input class="n" data-i="${i}" data-k="${k}" inputmode="decimal" value="${v == null ? `` : String(v).replace(`.`, `,`)}" ${dis}></td>`;
    return `<table class="ls-t of-t"><thead><tr><th>#</th><th>Codice</th><th>Descrizione</th><th class="num">Q.tà</th><th class="num">Prezzo</th><th class="num">Sconto %</th><th class="num">Totale</th><th class="num">Consegna gg</th>
      ${A ? `<th class="num">Acquisto</th><th class="num">Margine</th>` : ``}<th></th></tr></thead><tbody>
      ${o.righe.map((r, i) => `<tr><td class="num">${i + 1}</td>
        <td><input class="cod" data-i="${i}" data-k="codice" value="${esc(r.codice)}" ${dis}></td>
        <td><input data-i="${i}" data-k="descrizione" value="${esc(r.descrizione)}" ${dis}><input class="nota" data-i="${i}" data-k="note" placeholder="nota sulla riga" value="${esc(r.note)}" ${dis}></td>
        ${n(i, `qta`, r.qta)}${n(i, `prezzo`, r.prezzo)}${n(i, `sconto`, r.sconto || ``)}<td class="num" data-tot="${i}">${EUR.format(nettoRiga(r))}</td>${n(i, `consegna_giorni`, r.consegna_giorni)}
        ${A ? `<td class="num">${r.acquisto != null ? EUR.format(r.acquisto) : `—`}</td><td class="num" data-mar="${i}">${margineRiga(r)}</td>` : ``}
        <td class="num">${mod ? `<button class="ls-mod" data-del="${i}" aria-label="Togli la riga ${i + 1}">✕</button>` : ``}</td></tr>`).join(``)}</tbody></table>`;
  }
  function totaliHtml() {
    const T = totali(corrente), A = vediA();
    return `<dl><dt>Totale righe</dt><dd>${EUR.format(T.lordo)}</dd>
      ${T.scontoTotale ? `<dt>Sconto ${perc(corrente.sconto_totale)}</dt><dd>−${EUR.format(T.scontoTotale)}</dd>` : ``}
      <dt class="gr">Imponibile</dt><dd class="gr">${EUR.format(T.imponibile)}</dd>
      ${A && T.margine != null ? `<dt class="mg">Margine${T.parziale ? ` (parziale)` : ``}</dt><dd class="mg">${EUR.format(T.margine)}${T.marginePerc != null ? ` · ${perc(T.marginePerc)}` : ``}</dd>` : ``}</dl>`;
  }
  function aggiornaTotali(i) {
    $(`#ofTot`).innerHTML = totaliHtml();
    if (i == null) return;
    const r = corrente.righe[i];
    const t = radiceE.querySelector(`[data-tot="${i}"]`), m = radiceE.querySelector(`[data-mar="${i}"]`);
    if (t) t.textContent = EUR.format(nettoRiga(r));
    if (m) m.textContent = margineRiga(r);
  }
  const ridisegnaRighe = () => { $(`#ofRighe`).innerHTML = righeHtml(); aggiornaTotali(); };

  function risultati(q) {
    const box = $(`#ofRis`), t = q.trim().toLowerCase();
    if (!t) return void (box.hidden = true);
    const L = listino.filter(l => `${l.codice} ${l.marchio || ``} ${indice.get(l.id)?.descr || ``}`.toLowerCase().includes(t)).slice(0, 8);
    box.hidden = false;
    box.innerHTML = !listino.length ? `<div class="vuoto-ris">Il listino è vuoto: importa i prezzi in Operations &amp; Admin → Listino.</div>`
      : !L.length ? `<div class="vuoto-ris">Nessun codice nel listino. Usa «+ Riga libera».</div>`
      : L.map(l => `<button data-add="${esc(l.id)}"><b>${esc(l.codice)}</b><span>${esc(indice.get(l.id)?.descr || ``)}</span><i>${l.vendita != null ? EUR.format(l.vendita) : `senza prezzo`}</i></button>`).join(``);
  }
  async function aggiungi(id) {
    const l = listino.find(x => x.id === id); if (!l) return;
    if (indicePronto) await indicePronto;
    const ind = indice.get(l.id), cl = clienti.find(c => c.id === corrente.cliente_id);
    let sconto = 0;
    if (cl && ind) { const cat = S.cataloghi.find(c => c.numero === ind.n); if (cat) sconto = cl.condizioni?.sconti?.[compartoDi(cat)] || 0; }
    corrente.righe.push(rigaDaListino(l, ind, sconto, vediA()));
    $(`#ofCerca`).value = ``; $(`#ofRis`).hidden = true; ridisegnaRighe(); salvaSubito();
    if (l.vendita == null) toast(`${l.codice}: nel listino non c'è il prezzo di vendita`);
  }

  // ------------------------------------------------------------------ salvataggio e azioni
  function salva() { clearTimeout(timer); const s = $(`#ofSalva`); if (s) s.textContent = `Modifiche in corso…`; timer = setTimeout(salvaSubito, 400); }
  async function salvaSubito() {
    clearTimeout(timer); timer = null;
    if (!corrente) return;
    corrente.aggiornato = new Date().toISOString();
    await scrivi(`offerte`, corrente);
    const s = $(`#ofSalva`); if (s) s.textContent = `Salvato · ${new Date().toLocaleTimeString(`it-IT`, { hour: `2-digit`, minute: `2-digit` })}`;
  }

  async function cambiaStato(nuovo) {
    if (nuovo === `Inviata`) { const p = problemiInvio(corrente); if (p.length) return toast(`Non si può segnare come inviata: ${p.join(`, `)}`); }
    if (nuovo === `In revisione` && (!corrente.valida_fino || corrente.valida_fino < giorno())) corrente.valida_fino = traGiorni(30);
    corrente.stato = nuovo; await salvaSubito(); editor();
    toast(nuovo === `Accettata` ? `Offerta accettata: ora puoi creare la conferma d'ordine.` : `${corrente.id}: ${nuovo}`);
  }
  async function duplica() {
    await salvaSubito();
    const c = JSON.parse(JSON.stringify(corrente));
    const o = { ...c, id: prossimoNumero(offerte), stato: `Bozza`, creata: new Date().toISOString(), valida_fino: traGiorni(30), revisione_di: corrente.id };
    delete o.aggiornato;
    await scrivi(`offerte`, o); offerte.unshift(o); toast(`Creata ${o.id}`); apriEditor(o.id);
  }
  async function eliminaOfferta() {
    if (!confirm(`Eliminare la bozza ${corrente.id}? Non si può annullare.`)) return;
    await elimina(`offerte`, corrente.id); offerte = offerte.filter(o => o.id !== corrente.id); corrente = null;
    lista(); toast(`Bozza eliminata`); indietro();
  }
  function stampa() {
    const cl = clienti.find(c => c.id === corrente.cliente_id) || lead.find(l => l.id === corrente.cliente_id);
    const f = document.createElement(`iframe`);
    f.style.cssText = `position:fixed;right:0;bottom:0;width:0;height:0;border:0`;
    f.onload = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); };
    document.body.appendChild(f);
    f.srcdoc = htmlOfferta(corrente, cl);
  }

  function colega() {
    radiceE.addEventListener(`input`, e => {
      const t = e.target;
      if (t.dataset.k !== undefined) {                       // una cella di una riga
        const r = corrente.righe[Number(t.dataset.i)], k = t.dataset.k;
        if (k === `codice` || k === `descrizione` || k === `note`) r[k] = t.value;
        else if (t.value.trim() === ``) r[k] = k === `consegna_giorni` ? null : 0;
        else { const n = numero(t.value); if (!Number.isFinite(n) || n < 0 || (k === `sconto` && n > 100)) return; r[k] = n; }
        aggiornaTotali(Number(t.dataset.i)); salva();
      } else if (t.dataset.f) {                              // un campo dell'intestazione
        const f = t.dataset.f;
        if (f === `sconto_totale`) { const n = numero(t.value); corrente.sconto_totale = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0; aggiornaTotali(); }
        else if (f === `pagamento` || f === `resa`) corrente.condizioni = { ...corrente.condizioni, [f]: t.value };
        else corrente[f] = t.value;
        if (f === `cliente_id`) {                            // condizioni del cliente, se non ne ho già scritte
          const cl = clienti.find(c => c.id === t.value);
          for (const k of [`pagamento`, `resa`]) if (cl?.condizioni?.[k] && !corrente.condizioni?.[k]) { corrente.condizioni = { ...corrente.condizioni, [k]: cl.condizioni[k] }; radiceE.querySelector(`[data-f="${k}"]`).value = cl.condizioni[k]; }
        }
        salva();
      } else if (t.id === `ofCerca`) risultati(t.value);
    });
    radiceE.addEventListener(`change`, () => { if (timer) salvaSubito(); });
    radiceE.addEventListener(`keydown`, e => {
      if (e.key === `Enter` && e.target.id === `ofCerca`) { e.preventDefault(); const p = $(`#ofRis [data-add]`); if (p) aggiungi(p.dataset.add); }
    });
    radiceE.addEventListener(`click`, async e => {
      const b = e.target.closest(`button`); if (!b) return;
      if (b.dataset.add) return aggiungi(b.dataset.add);
      if (b.dataset.del !== undefined) { corrente.righe.splice(Number(b.dataset.del), 1); ridisegnaRighe(); return salvaSubito(); }
      if (b.dataset.libera !== undefined) { corrente.righe.push({ codice: ``, descrizione: ``, qta: 1, prezzo: 0, sconto: 0, consegna_giorni: null, note: `` }); ridisegnaRighe(); return salvaSubito(); }
      if (b.dataset.creaOrdine !== undefined) { await salvaSubito(); return creaOrdine(corrente); }
      if (b.dataset.ordine) return apriOrdine(b.dataset.ordine);
      if (b.dataset.stato) return cambiaStato(b.dataset.stato);
      if (b.dataset.stampa !== undefined) { await salvaSubito(); return stampa(); }
      if (b.dataset.duplica !== undefined) return duplica();
      if (b.dataset.elimina !== undefined) return eliminaOfferta();
      if (b.dataset.indietro !== undefined) { await salvaSubito(); lista(); indietro(); }
    });
    document.addEventListener(`vista`, e => {
      if (e.detail === `offerte`) lista();
      if (e.detail === `offerta` && corrente) tutti(`ordini`).then(o => { ordini = o; editor(); });   // tornando dalla conferma, il pulsante diventa «Conferma ORD-… →»
    });
  }
  colega();

  return {
    async apri() {
      if (!vedeVendita(ruolo())) return toast(`Il tuo ruolo non vede i prezzi: le offerte non sono disponibili`);
      try { await carica(); } catch (e) { console.warn(`offerte`, e); return toast(`Il browser non permette di salvare le offerte (finestra anonima?)`); }
      indicePronto = indiceCodici().then(m => { indice = m; }).catch(e => console.warn(`indice codici`, e));
      filtroStato = `Tutte`; filtro = ``; disegnaLista(); lista(); vai(`offerte`);
    },
  };
}

// ELSAP DSGN — Anagrafica (Box 2): Clienti (con condizioni di fornitura) e Lead, con conversione Lead → Cliente.
// Solo nel browser di chi li inserisce (IndexedDB, collezioni "clienti" e "lead"): mai su GitHub. Forma dei dati: schemi/clienti_lead.json.
import { tutti, scrivi, elimina } from '../core/store.js';
import { numero } from '../core/csv.js';
import { COMPARTI } from '../comparti.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? ``).replace(/[&<>"']/g, c => ({ '&': `&amp;`, '<': `&lt;`, '>': `&gt;`, '"': `&quot;`, "'": `&#39;` }[c]));
const nuovoId = p => `${p}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
const adesso = () => new Date().toISOString();
const dataIt = iso => (iso ? new Date(iso).toLocaleDateString(`it-IT`) : `—`);

export function avviaAnagrafica({ S, vai, toast }) {
  const radice = $(`#anagrafica`);
  let tab = `clienti`, clienti = [], lead = [], filtro = ``, K = null;

  async function opzioni() {   // elenchi (stati, pagamenti, rese) da schemi/clienti_lead.json
    if (!K) { const r = await fetch(new URL(`../schemi/clienti_lead.json`, import.meta.url)); if (!r.ok) throw new Error(r.status); K = await r.json(); }
    return K;
  }
  async function carica() {
    clienti = (await tutti(`clienti`)).sort((a, b) => a.ragione_sociale.localeCompare(b.ragione_sociale, `it`));
    lead = (await tutti(`lead`)).sort((a, b) => String(b.creato).localeCompare(String(a.creato)));
  }

  function disegna() {
    radice.innerHTML = `
      <div class="ls-testa">
        <button class="btn ghost" data-indietro>← Commerciale &amp; Offerte</button>
        <span class="pill cool">Box 2 · Commerciale</span>
        <h2>Anagrafica <span class="en">Customers &amp; leads</span></h2>
        <p class="muted" id="anInfo"></p>
        <div class="ls-az">
          <div class="seg" id="anTab"><button data-t="clienti">Clienti</button><button data-t="lead">Lead</button></div>
          <input type="search" id="anCerca" placeholder="Cerca nome, P.IVA, referente…" autocomplete="off">
          <button class="btn" data-nuovo></button>
        </div>
      </div>
      <div class="ls-avviso">Questi dati restano solo in questo browser. Non vanno su GitHub, Drive o NAS pubblici.</div>
      <div class="ls-tab" id="anLista"></div>
      <dialog id="anDlg"></dialog>`;
    radice.querySelector(`[data-indietro]`).onclick = () => vai(`modulo`);
    radice.querySelector(`#anCerca`).oninput = e => { filtro = e.target.value; lista(); };
    radice.querySelector(`[data-nuovo]`).onclick = () => (tab === `clienti` ? modificaCliente() : modificaLead());
    radice.querySelectorAll(`#anTab button`).forEach(b => { b.onclick = () => { tab = b.dataset.t; filtro = ``; $(`#anCerca`).value = ``; lista(); }; });
    $(`#anLista`).onclick = e => {
      const m = e.target.closest(`[data-mod]`), c = e.target.closest(`[data-conv]`);
      if (m) return tab === `clienti` ? modificaCliente(clienti.find(x => x.id === m.dataset.mod)) : modificaLead(lead.find(x => x.id === m.dataset.mod));
      if (c) converti(lead.find(x => x.id === c.dataset.conv));
    };
  }

  const trova = (L, campi) => {
    const q = filtro.trim().toLowerCase();
    return q ? L.filter(o => campi(o).toLowerCase().includes(q)) : L;
  };

  function lista() {
    radice.querySelectorAll(`#anTab button`).forEach(b => b.classList.toggle(`on`, b.dataset.t === tab));
    radice.querySelector(`[data-nuovo]`).textContent = tab === `clienti` ? `+ Cliente` : `+ Lead`;
    $(`#anInfo`).textContent = `${clienti.length} clienti · ${lead.length} lead`;
    const cont = $(`#anLista`);
    if (tab === `clienti`) {
      const L = trova(clienti, c => `${c.ragione_sociale} ${c.piva || ``} ${c.codice_fiscale || ``} ${c.sede_legale || ``}`);
      if (!L.length) return void (cont.innerHTML = `<div class="ls-vuoto">${clienti.length ? `Nessun cliente trovato.` : `Non ci sono ancora clienti.<br><span class="muted">Aggiungi un cliente, oppure converti un lead.</span>`}</div>`);
      cont.innerHTML = `<table class="ls-t"><thead><tr><th>Ragione sociale</th><th>P.IVA</th><th>Sede legale</th><th>Pagamento</th><th>Resa</th><th>Sconti C / EI / SE</th><th></th></tr></thead><tbody>
        ${L.map(c => { const s = c.condizioni?.sconti || {}; return `<tr><td><b>${esc(c.ragione_sociale)}</b></td><td class="cod">${esc(c.piva || `—`)}</td><td>${esc(c.sede_legale || `—`)}</td>
          <td>${esc(c.condizioni?.pagamento || `—`)}</td><td>${esc(c.condizioni?.resa || `—`)}</td>
          <td class="num">${COMPARTI.map(p => (s[p.id] != null ? `${String(s[p.id]).replace(`.`, `,`)} %` : `—`)).join(` / `)}</td>
          <td class="num"><button class="ls-mod" data-mod="${esc(c.id)}">Modifica</button></td></tr>`; }).join(``)}</tbody></table>`;
    } else {
      const L = trova(lead, l => `${l.ragione_sociale} ${l.referente || ``} ${l.settore || ``} ${l.fonte || ``} ${l.stato || ``}`);
      if (!L.length) return void (cont.innerHTML = `<div class="ls-vuoto">${lead.length ? `Nessun lead trovato.` : `Non ci sono ancora lead.<br><span class="muted">Qui finiscono contatti da fiere, web o passaparola.</span>`}</div>`);
      cont.innerHTML = `<table class="ls-t"><thead><tr><th>Ragione sociale</th><th>Referente</th><th>Settore</th><th>Fonte</th><th>Stato</th><th>Creato</th><th></th></tr></thead><tbody>
        ${L.map(l => `<tr><td><b>${esc(l.ragione_sociale)}</b></td><td>${esc(l.referente || `—`)}</td><td>${esc(l.settore || `—`)}</td><td>${esc(l.fonte || `—`)}</td>
          <td><span class="pill ${l.stato === `Convertito` ? `cool` : ``}">${esc(l.stato || `—`)}</span></td><td class="num">${dataIt(l.creato)}</td>
          <td class="num">${l.stato === `Convertito` && clienti.some(c => c.da_lead === l.id) ? `` : `<button class="ls-pag" data-conv="${esc(l.id)}">→ Cliente</button>`}<button class="ls-mod" data-mod="${esc(l.id)}">Modifica</button></td></tr>`).join(``)}</tbody></table>`;
    }
  }

  const dialogo = html => { const d = $(`#anDlg`); d.innerHTML = html; if (!d.open) d.showModal(); return d; };
  const campo = (n, et, v, extra = ``, largo = false) => `<label class="${largo ? `largo` : ``}">${et}<input name="${n}" value="${esc(v ?? ``)}" ${extra}></label>`;
  const scelta = (n, et, voci, v) => `<label>${et}<select name="${n}"><option value="">—</option>${voci.map(x => `<option ${x === v ? `selected` : ``}>${esc(x)}</option>`).join(``)}</select></label>`;
  const testo = (f, k) => String(f.get(k) ?? ``).trim();

  async function modificaCliente(c) {
    const nuovo = !c; c = c || {};
    let O; try { O = await opzioni(); } catch (e) { return toast(`Non riesco a leggere gli elenchi (pagamenti, rese)`); }
    const s = c.condizioni?.sconti || {}, k = c.contatti || {};
    const d = dialogo(`<form class="ls-form" novalidate>
      <h3>${nuovo ? `Nuovo cliente` : esc(c.ragione_sociale)}${c.da_lead ? ` <span class="pill cool">da lead</span>` : ``}</h3>
      <div class="an-griglia">
        ${campo(`ragione_sociale`, `Ragione sociale`, c.ragione_sociale, `required`, true)}
        ${campo(`piva`, `P.IVA`, c.piva)}${campo(`codice_fiscale`, `Codice fiscale`, c.codice_fiscale)}
        ${campo(`sede_legale`, `Sede legale`, c.sede_legale, ``, true)}${campo(`sede_spedizione`, `Sede di spedizione (se diversa)`, c.sede_spedizione, ``, true)}
        ${campo(`c_amm`, `Contatto amministrativo`, k.amministrativo)}${campo(`c_tec`, `Contatto tecnico`, k.tecnico)}
        ${scelta(`pagamento`, `Pagamento`, O.pagamenti, c.condizioni?.pagamento)}${scelta(`resa`, `Resa / trasporto`, O.rese, c.condizioni?.resa)}
        <div class="largo an-sconti"><span class="lab">Sconto per linea di prodotto (%)</span>
          <div class="an-3">${COMPARTI.map(p => campo(`sc_${p.id}`, esc(p.nome), s[p.id], `inputmode="decimal"`)).join(``)}</div></div>
        ${campo(`note`, `Note`, c.note, ``, true)}
      </div>
      <div class="ls-form-az">${nuovo ? `` : `<button type="button" class="btn ghost" data-elimina>Elimina</button>`}<span class="sp"></span>
        <button type="button" class="btn ghost" data-annulla>Annulla</button><button class="btn">Salva</button></div></form>`);
    d.querySelector(`[data-annulla]`).onclick = () => d.close();
    d.querySelector(`[data-elimina]`)?.addEventListener(`click`, async () => {
      if (!confirm(`Eliminare il cliente ${c.ragione_sociale}? Non si può annullare.`)) return;
      await elimina(`clienti`, c.id); await carica(); lista(); d.close(); toast(`Cliente eliminato`);
    });
    d.querySelector(`form`).onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target), nome = testo(f, `ragione_sociale`), piva = testo(f, `piva`).replace(/\s+/g, ``);
      if (!nome) return toast(`Serve la ragione sociale`);
      const doppio = piva && clienti.find(x => x.piva === piva && x.id !== c.id);
      if (doppio) return toast(`La P.IVA ${piva} è già di ${doppio.ragione_sociale}`);
      const sconti = {};
      for (const p of COMPARTI) {
        const g = testo(f, `sc_${p.id}`); if (g === ``) continue;
        const n = numero(g);
        if (!Number.isFinite(n) || n < 0 || n > 100) return toast(`Sconto ${p.nome}: serve un numero fra 0 e 100`);
        sconti[p.id] = n;
      }
      const doc = { ...c, id: c.id || nuovoId(`C`), ragione_sociale: nome, piva, codice_fiscale: testo(f, `codice_fiscale`).toUpperCase(),
        sede_legale: testo(f, `sede_legale`), sede_spedizione: testo(f, `sede_spedizione`), contatti: { amministrativo: testo(f, `c_amm`), tecnico: testo(f, `c_tec`) },
        condizioni: { sconti, pagamento: testo(f, `pagamento`), resa: testo(f, `resa`) }, note: testo(f, `note`), creato: c.creato || adesso(), aggiornato: adesso() };
      await scrivi(`clienti`, doc); await carica(); tab = `clienti`; lista(); d.close(); toast(`${nome} salvato`);
    };
  }

  async function modificaLead(l) {
    const nuovo = !l; l = l || {};
    let O; try { O = await opzioni(); } catch (e) { return toast(`Non riesco a leggere gli elenchi (stati)`); }
    const d = dialogo(`<form class="ls-form" novalidate>
      <h3>${nuovo ? `Nuovo lead` : esc(l.ragione_sociale)}</h3>
      <div class="an-griglia">
        ${campo(`ragione_sociale`, `Ragione sociale`, l.ragione_sociale, `required`, true)}
        ${campo(`referente`, `Referente`, l.referente)}${campo(`settore`, `Settore`, l.settore)}
        ${campo(`fonte`, `Fonte (fiera, web, passaparola…)`, l.fonte)}
        <label>Stato<select name="stato">${O.stati_lead.map(x => `<option ${x === (l.stato || O.stati_lead[0]) ? `selected` : ``}>${esc(x)}</option>`).join(``)}</select></label>
        ${campo(`note`, `Note`, l.note, ``, true)}
      </div>
      <div class="ls-form-az">${nuovo ? `` : `<button type="button" class="btn ghost" data-elimina>Elimina</button>`}<span class="sp"></span>
        <button type="button" class="btn ghost" data-annulla>Annulla</button><button class="btn">Salva</button></div></form>`);
    d.querySelector(`[data-annulla]`).onclick = () => d.close();
    d.querySelector(`[data-elimina]`)?.addEventListener(`click`, async () => {
      if (!confirm(`Eliminare il lead ${l.ragione_sociale}? Non si può annullare.`)) return;
      await elimina(`lead`, l.id); await carica(); lista(); d.close(); toast(`Lead eliminato`);
    });
    d.querySelector(`form`).onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target), nome = testo(f, `ragione_sociale`);
      if (!nome) return toast(`Serve la ragione sociale`);
      const doc = { ...l, id: l.id || nuovoId(`L`), ragione_sociale: nome, referente: testo(f, `referente`), settore: testo(f, `settore`), fonte: testo(f, `fonte`),
        stato: testo(f, `stato`), note: testo(f, `note`), creato: l.creato || adesso(), aggiornato: adesso() };
      await scrivi(`lead`, doc); await carica(); tab = `lead`; lista(); d.close(); toast(`${nome} salvato`);
    };
  }

  // Lead → Cliente con un clic: crea il cliente (con i dati del lead), segna il lead «Convertito» e apre la scheda per completarla
  async function converti(l) {
    if (!l) return;
    const gia = clienti.find(c => c.da_lead === l.id);
    tab = `clienti`;
    if (gia) { lista(); toast(`${l.ragione_sociale} è già cliente`); return modificaCliente(gia); }
    const c = { id: nuovoId(`C`), ragione_sociale: l.ragione_sociale, da_lead: l.id, piva: ``, codice_fiscale: ``, sede_legale: ``, sede_spedizione: ``,
      contatti: { amministrativo: ``, tecnico: l.referente || `` }, condizioni: { sconti: {}, pagamento: ``, resa: `` }, note: l.note || ``, creato: adesso(), aggiornato: adesso() };
    await scrivi(`clienti`, c); await scrivi(`lead`, { ...l, stato: `Convertito`, aggiornato: adesso() });
    await carica(); lista(); toast(`${l.ragione_sociale} ora è cliente: completa la scheda`);
    modificaCliente(c);
  }

  return {
    async apri() {
      try { await carica(); } catch (e) { console.warn(`anagrafica`, e); return toast(`Il browser non permette di salvare i dati (finestra anonima?)`); }
      filtro = ``; disegna(); lista(); vai(`anagrafica`);
    },
  };
}

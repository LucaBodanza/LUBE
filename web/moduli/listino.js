// ELSAP DSGN — Listino (Box 3): prezzo di vendita e di acquisto per codice, import/export CSV.
// I prezzi restano SOLO nel browser di chi li inserisce (IndexedDB, collezione "listini"): mai su GitHub.
// Chi non ha il permesso (core/permessi.js) non vede gli acquisti né i margini; resta un controllo di interfaccia.
import { tutti, scrivi, scriviMolti, elimina } from '../core/store.js';
import { leggiCsv, scriviCsv, numero } from '../core/csv.js';
import { vedeAcquisto, vedeVendita } from '../core/permessi.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? ``).replace(/[&<>"']/g, c => ({ '&': `&amp;`, '<': `&lt;`, '>': `&gt;`, '"': `&quot;`, "'": `&#39;` }[c]));
const EUR = new Intl.NumberFormat(`it-IT`, { style: `currency`, currency: `EUR` });
const PASSO = 100;
const idDi = codice => String(codice).trim().toUpperCase();

export function avviaListino({ S, vai, vaiA, toast, indiceCodici, indietro }) {
  const radice = $(`#listino`);
  let righe = [], indice = new Map(), filtro = ``, limite = PASSO;
  const ruolo = () => window.elsapRuolo;
  const vediV = () => vedeVendita(ruolo()), vediA = () => vedeAcquisto(ruolo());
  const prezzo = n => (n == null ? `—` : EUR.format(n));

  async function carica() {
    righe = (await tutti(`listini`)).sort((a, b) => a.codice.localeCompare(b.codice, `it`, { numeric: true }));
  }

  function disegna() {
    radice.innerHTML = `
      <div class="ls-testa">
        <button class="btn ghost" data-indietro>← Operations &amp; Admin</button>
        <span class="pill cool">Box 3 · Operations</span>
        <h2>Listino <span class="en">Price list</span></h2>
        <p class="muted" id="lsInfo"></p>
        <div class="ls-az">
          <input type="search" id="lsCerca" placeholder="Cerca codice, marchio, descrizione…" autocomplete="off">
          <button class="btn" data-nuovo>+ Riga</button>
          <button class="btn ghost" data-importa>Importa CSV</button>
          <button class="btn ghost" data-esporta>Esporta CSV</button>
          <button class="btn ghost" data-modello>Modello CSV</button>
          <input type="file" id="lsFile" accept=".csv,.txt,text/csv" hidden>
        </div>
      </div>
      <div class="ls-avviso">I prezzi restano solo in questo browser. Il file CSV esportato contiene prezzi veri: non metterlo su GitHub, Drive o NAS pubblici.</div>
      <div class="ls-tab" id="lsTab"></div>
      <dialog id="lsDlg"></dialog>`;
    radice.querySelector(`[data-indietro]`).onclick = () => indietro();
    radice.querySelector(`#lsCerca`).oninput = e => { filtro = e.target.value; limite = PASSO; tabella(); };
    radice.querySelector(`[data-nuovo]`).onclick = () => modifica();
    radice.querySelector(`[data-importa]`).onclick = () => $(`#lsFile`).click();
    radice.querySelector(`[data-esporta]`).onclick = esporta;
    radice.querySelector(`[data-modello]`).onclick = () => scarica(scriviCsv([], { acquisto: vediA() }), `modello_listino.csv`);
    $(`#lsFile`).onchange = e => { const f = e.target.files[0]; e.target.value = ``; if (f) importa(f); };
    $(`#lsTab`).onclick = e => {
      if (e.target.closest(`[data-altri]`)) { limite += PASSO; return tabella(); }
      const pag = e.target.closest(`.ls-pag`);
      if (pag) return vaiA({ n: Number(pag.dataset.n), pagina: Number(pag.dataset.p) });
      const mod = e.target.closest(`[data-mod]`);
      if (mod) modifica(righe.find(r => r.id === mod.dataset.mod));
    };
  }

  const visibili = () => {
    const q = filtro.trim().toLowerCase();
    if (!q) return righe;
    return righe.filter(r => `${r.codice} ${r.marchio || ``} ${indice.get(r.id)?.descr || ``}`.toLowerCase().includes(q));
  };

  function riga(r, V, A) {
    const ind = indice.get(r.id);
    const desc = ind
      ? `${esc(ind.descr)}${ind.n != null ? ` <button class="ls-pag" data-n="${ind.n}" data-p="${ind.p}" title="${esc(ind.cat?.nome || ``)}">pag. ${ind.p}</button>` : ``}`
      : indice.size ? `<span class="muted">non presente nei cataloghi</span>` : `<span class="muted">…</span>`;
    const margine = r.acquisto > 0 && r.vendita > 0 ? `${((r.vendita - r.acquisto) / r.vendita * 100).toFixed(1).replace(`.`, `,`)} %` : `—`;
    return `<tr>
      <td class="cod">${esc(r.codice)}</td><td>${desc}</td><td>${esc(r.marchio || ``)}</td>
      ${V ? `<td class="num">${prezzo(r.vendita)}</td>` : ``}
      ${A ? `<td class="num">${prezzo(r.acquisto)}</td><td class="num">${margine}</td>` : ``}
      <td class="num">${r.moq ?? `—`}</td><td class="num">${r.tempi_giorni != null ? `${r.tempi_giorni} gg` : `—`}</td><td class="num">${r.giacenza ?? `—`}</td>
      <td class="num"><button class="ls-mod" data-mod="${esc(r.id)}" aria-label="Modifica ${esc(r.codice)}">Modifica</button></td></tr>`;
  }

  function tabella() {
    const L = visibili(), V = vediV(), A = vediA();
    $(`#lsInfo`).textContent = righe.length ? `${righe.length} codici in listino${L.length !== righe.length ? ` · ${L.length} trovati` : ``}` : ``;
    if (!righe.length) {
      $(`#lsTab`).innerHTML = `<div class="ls-vuoto"><b>Il listino è vuoto.</b><br>Importa un file CSV (basta la colonna codice e il prezzo di vendita) oppure aggiungi una riga.<br>
        <span class="muted">Colonne: codice; marchio; ${A ? `acquisto; ` : ``}vendita; moq; tempi_giorni; giacenza. Scarica il modello CSV qui sopra.</span></div>`;
      return;
    }
    const mostra = L.slice(0, limite);
    $(`#lsTab`).innerHTML = `<table class="ls-t"><thead><tr><th>Codice</th><th>Descrizione</th><th>Marchio</th>
      ${V ? `<th class="num">Vendita</th>` : ``}${A ? `<th class="num">Acquisto</th><th class="num">Margine</th>` : ``}
      <th class="num">MOQ</th><th class="num">Tempi</th><th class="num">Giacenza</th><th></th></tr></thead>
      <tbody>${mostra.map(r => riga(r, V, A)).join(``)}</tbody></table>
      ${L.length > limite ? `<button class="btn ghost ls-altri" data-altri>Mostra altri ${Math.min(PASSO, L.length - limite)} (restano ${L.length - limite})</button>` : ``}
      ${!L.length ? `<div class="ls-vuoto">Nessun codice trovato.</div>` : ``}`;
  }

  function dialogo(html) { const d = $(`#lsDlg`); d.innerHTML = html; if (!d.open) d.showModal(); return d; }

  function modifica(r) {
    const nuovo = !r;
    r = r || {};
    const A = vediA();
    const campo = (n, et, v, extra = ``) => `<label>${et}<input name="${n}" value="${esc(v ?? ``)}" ${extra}></label>`;
    const d = dialogo(`<form class="ls-form" novalidate>
      <h3>${nuovo ? `Nuova riga` : `Modifica ${esc(r.codice)}`}</h3>
      ${campo(`codice`, `Codice`, r.codice, nuovo ? `required` : `readonly`)}
      ${campo(`marchio`, `Marchio`, r.marchio)}
      ${campo(`vendita`, `Vendita (€)`, r.vendita, `inputmode="decimal"`)}
      ${A ? campo(`acquisto`, `Acquisto (€)`, r.acquisto, `inputmode="decimal"`) : ``}
      ${campo(`moq`, `MOQ (lotto minimo)`, r.moq, `inputmode="numeric"`)}
      ${campo(`tempi_giorni`, `Tempi (giorni)`, r.tempi_giorni, `inputmode="numeric"`)}
      ${campo(`giacenza`, `Giacenza (pezzi)`, r.giacenza, `inputmode="numeric"`)}
      <div class="ls-form-az">
        ${nuovo ? `` : `<button type="button" class="btn ghost" data-elimina>Elimina</button>`}<span class="sp"></span>
        <button type="button" class="btn ghost" data-annulla>Annulla</button><button class="btn">Salva</button></div></form>`);
    d.querySelector(`[data-annulla]`).onclick = () => d.close();
    d.querySelector(`[data-elimina]`)?.addEventListener(`click`, async () => {
      if (!confirm(`Eliminare ${r.codice} dal listino?`)) return;
      await elimina(`listini`, r.id); await carica(); tabella(); d.close(); toast(`${r.codice} eliminato`);
    });
    d.querySelector(`form`).onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target), codice = String(f.get(`codice`) || ``).trim();
      if (!codice) return toast(`Serve il codice`);
      const doc = { ...r, id: idDi(codice), codice, aggiornato: new Date().toISOString() };
      const marchio = String(f.get(`marchio`) || ``).trim();
      if (marchio) doc.marchio = marchio; else delete doc.marchio;
      for (const k of [`vendita`, ...(A ? [`acquisto`] : []), `moq`, `tempi_giorni`, `giacenza`]) {
        const grezzo = String(f.get(k) ?? ``).trim();
        if (grezzo === ``) { delete doc[k]; continue; }
        const n = numero(grezzo);
        if (!Number.isFinite(n) || n < 0) return toast(`${k.replace(`_`, ` `)}: valore non valido`);
        doc[k] = k === `vendita` || k === `acquisto` ? n : Math.round(n);
      }
      await scrivi(`listini`, doc); await carica(); tabella(); d.close(); toast(`${codice} salvato`);
    };
  }

  async function importa(file) {
    let R;
    try { R = leggiCsv(await file.text()); } catch (e) { return toast(`Non riesco a leggere il file`); }
    if (R.errore) return toast(R.errore);
    const senzaAcq = !vediA() && R.riconosciute.includes(`acquisto`);
    const d = dialogo(`<div class="ls-form">
      <h3>Importa ${esc(file.name)}</h3>
      <p><b>${R.righe.length}</b> righe valide${R.scartate.length ? ` · <b>${R.scartate.length}</b> scartate` : ``}${R.duplicati ? ` · ${R.duplicati} codici ripetuti nel file (vale l'ultimo)` : ``}.</p>
      <p class="muted">Colonne riconosciute: ${esc(R.riconosciute.join(`, `))}${R.ignorate.length ? ` · ignorate: ${esc(R.ignorate.join(`, `))}` : ``}</p>
      ${senzaAcq ? `<p class="ls-nota">Il tuo ruolo non gestisce i prezzi di acquisto: quella colonna viene ignorata.</p>` : ``}
      <p class="muted">I codici già nel listino si aggiornano solo nei campi presenti nel file; gli altri restano come sono.</p>
      ${R.scartate.length ? `<ul class="ls-err">${R.scartate.slice(0, 5).map(s => `<li>Riga ${s.riga}: ${esc(s.motivo)}</li>`).join(``)}${R.scartate.length > 5 ? `<li>…e altre ${R.scartate.length - 5}</li>` : ``}</ul>` : ``}
      <div class="ls-form-az"><span class="sp"></span><button class="btn ghost" data-annulla>Annulla</button><button class="btn" data-ok ${R.righe.length ? `` : `disabled`}>Importa ${R.righe.length}</button></div></div>`);
    d.querySelector(`[data-annulla]`).onclick = () => d.close();
    d.querySelector(`[data-ok]`).onclick = async () => {
      const esistenti = new Map(righe.map(r => [r.id, r])), adesso = new Date().toISOString();
      const docs = R.righe.map(n => {
        const { acquisto, ...senza } = n;
        const dati = vediA() ? n : senza;
        return { ...(esistenti.get(idDi(n.codice)) || {}), ...dati, id: idDi(n.codice), aggiornato: adesso };
      });
      await scriviMolti(`listini`, docs); await carica(); limite = PASSO; tabella(); d.close();
      toast(`Importate ${docs.length} righe`);
    };
  }

  function scarica(testo, nome) {
    const a = document.createElement(`a`);
    a.href = URL.createObjectURL(new Blob([testo], { type: `text/csv;charset=utf-8` }));
    a.download = nome; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function esporta() {
    if (!righe.length) return toast(`Il listino è vuoto`);
    if (!vediV()) return toast(`Il tuo ruolo non può esportare il listino`);
    scarica(scriviCsv(righe, { acquisto: vediA() }), `listino_ELSAP_${new Date().toISOString().slice(0, 10)}.csv`);
  }

  return {
    async apri() {
      try { await carica(); } catch (e) { console.warn(`listino`, e); return toast(`Il browser non permette di salvare il listino (finestra anonima?)`); }
      filtro = ``; limite = PASSO; disegna(); tabella(); vai(`listino`);
      indiceCodici().then(m => { indice = m; tabella(); }).catch(e => console.warn(`indice codici`, e));
    },
  };
}

// ELSAP DSGN — comparti della libreria (Home): Connessione · Elettronica Industriale · Sistemi Elettromeccanici
// Ogni catalogo ha "comparto" nei dati; se manca vale "connessione" (i cataloghi 01–16 non vanno ricostruiti).
// Colori: HEX ufficiali di Luca (Codici ELSAP_icone.txt, 21/10/2026). Simboli: SVG ufficiali di Luca (Share · Chip Socket PC · Home with start).
// La cartella 3D è disegnata qui in SVG con il colore e il simbolo del comparto. In alternativa a un PNG: web/img/comparti/<id>.png e png: true.

export const COMPARTO_BASE = 'connessione';
export const COMPARTI = [
  { id: 'connessione', nome: 'Connessione', en: 'Connection', colore: '#004F9F', png: false, simbolo: 'share',
    aree: ['A cablare', 'A pannello', 'Bordo scheda', 'Moldizzati', 'Sistemi di distribuzione', 'Attrezzature'] },
  { id: 'elettronica-industriale', nome: 'Elettronica Industriale', en: 'Industrial electronics', colore: '#E4032E', png: false, simbolo: 'chip',
    aree: ['Alimentatori', 'Caricabatterie e batterie', 'Trasformatori', 'Sensori', 'Interruttori e pulsanti', 'Encoder'] },
  { id: 'sistemi-elettromeccanici', nome: 'Sistemi Elettromeccanici', en: 'Electromechanical systems', colore: '#FBBA00', png: false, simbolo: 'casa',
    aree: ['Illuminazione', 'Riscaldamento e termoregolazione', 'Pompe e motori', 'Relé', 'HMI', 'Attuatori'] },
];
export const compartoDi = c => (c && COMPARTI.some(x => x.id === c.comparto)) ? c.comparto : COMPARTO_BASE;
export const trovaComparto = id => COMPARTI.find(x => x.id === id) || COMPARTI[0];

// ---------------------------------------------------------------- icona provvisoria: cartella 3D tinta + simbolo del comparto
const SIMBOLI = {"share":{"vb":[964.61,1024.0],"d":["M783.61,662.01c-62.2,0-117.05,31.38-149.63,79.16l-280.02-148.89c5.21-16.89,8.02-34.82,8.02-53.42,0-22.77-4.24-44.53-11.92-64.6l292.45-182.74c32.81,40.46,82.89,66.35,139.05,66.35,98.83,0,178.94-80.11,178.94-178.94S880.39,0,781.56,0s-178.94,80.11-178.94,178.94c0,22.84,4.33,44.66,12.13,64.74l-292.14,182.55c-33.16-41.64-84.25-68.35-141.62-68.35C81.03,357.88,0,438.91,0,538.87s81.03,180.99,180.99,180.99c61.62,0,116.02-30.82,148.7-77.86l280.5,149.15c-4.91,16.43-7.58,33.83-7.58,51.85,0,99.96,81.03,180.99,180.99,180.99s180.99-81.03,180.99-180.99-81.03-180.99-180.99-180.99Z"]},"chip":{"vb":[1024.0,1024.0],"d":["M776.96,252.7H251.68v523.08h525.29V252.7ZM606.97,617.59h-185.3c-6.52,0-11.8-5.28-11.8-11.8v-183.1c0-6.52,5.28-11.8,11.8-11.8h185.3c6.52,0,11.8,5.28,11.8,11.8v183.1c0,6.52-5.28,11.8-11.8,11.8Z","M842.91,418.54h161.28c9.8,0,18.73-7.05,19.71-16.8,1.12-11.21-7.66-20.66-18.64-20.66h-162.35s0,0-.01,0v-74.85s0,0,.01,0h161.28c9.8,0,18.73-7.05,19.71-16.8,1.12-11.21-7.66-20.66-18.64-20.66h-162.35s0,0-.01,0v-82h-87.66s0,0,0,0V19.81c0-9.8-7.05-18.73-16.79-19.71-11.21-1.13-20.67,7.65-20.67,18.64v168.02s0,0,0,0h-74.77s0,0,0,0V19.81c0-9.8-7.05-18.73-16.79-19.71-11.21-1.13-20.67,7.65-20.67,18.64v168.02s0,0,0,0h-74.76s0,0,0,0V19.81c0-9.8-7.05-18.73-16.79-19.71-11.21-1.13-20.67,7.65-20.67,18.64v168.02s0,0,0,0h-74.77s0,0,0,0V19.81c0-9.8-7.05-18.73-16.79-19.71-11.21-1.13-20.67,7.65-20.67,18.64v168.02s0,0,0,0h-74.84s0,0,0,0V19.81c0-9.8-7.05-18.73-16.79-19.71-11.21-1.13-20.67,7.65-20.67,18.64v168.02s0,0,0,0h-80.84v82s0,0,0,0H19.8c-9.8,0-18.73,7.05-19.71,16.8-1.12,11.21,7.66,20.66,18.64,20.66h169.18s0,0,0,0v74.85s0,0,0,0H19.8c-9.8,0-18.73,7.05-19.71,16.8-1.12,11.21,7.66,20.66,18.64,20.66h169.18s0,0,0,0v74.77s0,0,0,0H19.8c-9.8,0-18.73,7.05-19.71,16.8-1.12,11.21,7.66,20.66,18.64,20.66h169.18s0,0,0,0v74.77s0,0,0,0H19.8c-9.8,0-18.73,7.05-19.71,16.8-1.12,11.21,7.66,20.66,18.64,20.66h169.18s0,0,0,0v74.77s0,0,0,0H19.8c-9.8,0-18.73,7.05-19.71,16.8-1.12,11.21,7.66,20.66,18.64,20.66h169.18s0,0,0,0v86.5h80.84s0,0,0,.01v162.45c0,9.8,7.05,18.73,16.79,19.71,11.21,1.13,20.67-7.65,20.67-18.64v-163.52s0,0,0-.01h74.85s0,0,0,.01v162.45c0,9.8,7.05,18.73,16.79,19.71,11.21,1.13,20.67-7.65,20.67-18.64v-163.52s0,0,0-.01h74.77s0,0,0,.01v162.45c0,9.8,7.05,18.73,16.79,19.71,11.21,1.13,20.67-7.65,20.67-18.64v-163.52s0,0,0-.01h74.76s0,0,0,.01v162.45c0,9.8,7.05,18.73,16.79,19.71,11.21,1.13,20.67-7.65,20.67-18.64v-163.52s0,0,0-.01h74.77s0,0,0,.01v162.45c0,9.8,7.05,18.73,16.79,19.71,11.21,1.13,20.67-7.65,20.67-18.64v-163.52s0,0,0-.01h87.66v-86.5s0,0,.01,0h161.28c9.8,0,18.73-7.05,19.71-16.8,1.12-11.21-7.66-20.66-18.64-20.66h-162.35s0,0-.01,0v-74.77s0,0,.01,0h161.28c9.8,0,18.73-7.05,19.71-16.8,1.12-11.21-7.66-20.66-18.64-20.66h-162.35s0,0-.01,0v-74.77s0,0,.01,0h161.28c9.8,0,18.73-7.05,19.71-16.8,1.12-11.21-7.66-20.66-18.64-20.66h-162.35s0,0-.01,0v-74.77s0,0,.01,0ZM805.43,804.27H225.39V224.22h580.04v580.04Z"]},"casa":{"vb":[1017.04,1024.0],"d":["M1002.6,470.51l-102.26-100.36L533.67,10.28c-13.97-13.71-36.33-13.71-50.3,0L117.21,369.65,14.44,470.51c-30.59,30.03-9.33,82.04,33.53,82.04h69.24v363.73c0,59.49,48.23,107.72,107.72,107.72h567.7c59.49,0,107.72-48.23,107.72-107.72v-363.73h68.73c42.87,0,64.13-52.02,33.53-82.04ZM468.87,437.75c0-20.99,17.01-38,38-38s38,17.01,38,38v179.68c0,20.99-17.01,38-38,38s-38-17.01-38-38v-179.68ZM478.16,863.94c-106.92-11.9-192.4-98.85-202.7-205.93-8.35-86.79,31.57-164.9,96.03-210.59,13.78-9.77,33.06-5.15,41.46,9.5l.02.04c7.47,13.04,3.54,29.38-8.68,38.14-43.65,31.29-72.01,82.46-71.92,140.23.14,90.4,72.6,166.91,162.88,171.66,99.31,5.23,181.48-73.77,181.48-171.94,0-55-25.74-103.96-65.86-135.43-11.46-8.98-14.9-24.8-7.65-37.43h0c8.8-15.33,29.13-19.19,43.06-8.31,53.88,42.1,88.47,107.72,88.47,181.33,0,135.87-117.7,244.18-256.59,228.72Z"]}};
function tinta(hex, k) {   // k > 0 schiarisce, k < 0 scurisce
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
  return '#' + c.map(v => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)).toString(16).padStart(2, '0')).join('');
}
// simbolo ufficiale inciso sul davanti della cartella: bianco pieno con un'ombra interna leggera (effetto stampato)
function simbolo(cp, cx, cy, h) {
  const S = SIMBOLI[cp.simbolo]; if (!S) return '';
  const [w, H] = S.vb, k = h / H, x = cx - w * k / 2, y = cy - h / 2, d = S.d.map(p => `<path d="${p}"/>`).join('');
  return `<g transform="translate(${x.toFixed(2)} ${(y + 1.1).toFixed(2)}) scale(${k.toFixed(5)})" fill="${tinta(cp.colore, -.55)}" opacity=".35">${d}</g>
    <g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(5)})" fill="#fff" opacity=".96">${d}</g>`;
}
// colore per scritte e linee sottili sul fondo scuro: stessa tinta, schiarita finché si legge (contrasto ≥ 4.5)
function luce(hex) { return [0, 2, 4].map(i => { const v = parseInt(hex.slice(1 + i, 3 + i), 16) / 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0); }
function leggibile(hex) { let k = 0, t = hex; while (k < .9 && (luce(t) + .05) / (luce('#0A1017') + .05) < 4.5) { k += .05; t = tinta(hex, k); } return t; }
for (const cp of COMPARTI) cp.testo = leggibile(cp.colore);
export const stileComparto = cp => `--cp:${cp.colore};--cpt:${cp.testo}`;
export function iconaComparto(cp) {
  if (cp.png) return `<img class="cp-png" src="web/img/comparti/${cp.id}.png" alt="" draggable="false">`;
  const c = cp.colore, id = cp.id;
  return `<svg class="cp-svg" viewBox="0 0 120 100" aria-hidden="true">
    <defs>
      <linearGradient id="dt-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tinta(c, -.18)}"/><stop offset="1" stop-color="${tinta(c, -.42)}"/></linearGradient>
      <linearGradient id="fr-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tinta(c, .32)}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${tinta(c, -.2)}"/></linearGradient>
      <linearGradient id="lu-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>
    </defs>
    <g class="dietro"><path d="M10 14a6 6 0 0 1 6-6h28l8 8h52a6 6 0 0 1 6 6v62a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6z" fill="url(#dt-${id})"/>
      <rect x="18" y="20" width="84" height="56" rx="3" fill="#F3F7FA" opacity=".9"/><rect x="22" y="16" width="76" height="56" rx="3" fill="#fff" opacity=".55"/></g>
    <g class="davanti"><path d="M8 32a6 6 0 0 1 6-6h92a6 6 0 0 1 6 6v54a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6z" fill="url(#fr-${id})"/>
      <path d="M8 32a6 6 0 0 1 6-6h92a6 6 0 0 1 6 6v6H8z" fill="url(#lu-${id})"/>
      <path d="M14 26.6h92" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/>
      ${simbolo(cp, 60, 60, 36)}</g>
  </svg>`;
}

// ---------------------------------------------------------------- apertura / chiusura stile macOS
// La finestra del comparto nasce dall'icona (zoom + angoli che si aprono), la cartella si apre;
// alla chiusura si richiude dentro la stessa icona.
const EASE_APRI = 'cubic-bezier(.2,.95,.25,1.04)', EASE_CHIUDI = 'cubic-bezier(.55,0,.75,.2)';
function geometria(daEl) {
  const r = daEl.getBoundingClientRect(), W = innerWidth, H = innerHeight;
  const s = Math.max(r.width / W, r.height / H) * .9;
  return { dx: r.left + r.width / 2 - W / 2, dy: r.top + r.height / 2 - H / 2, s };
}
const fermo = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const leggero = () => document.body.classList.contains('leggero');
// grafica leggera: stesso zoom dall'icona, senza sfocatura e senza angoli (sono le parti che pesano sulle schede grafiche integrate)
const kf = L => leggero() ? L.map(({ filter, clipPath, ...k }) => k) : L;

export function animaApri(daEl, vista) {
  if (!daEl || fermo()) return Promise.resolve();
  const { dx, dy, s } = geometria(daEl);
  daEl.classList.add('aperta'); vista.classList.add('volo');
  const a = vista.animate(kf([
    { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0, clipPath: 'inset(0 round 160px)', filter: 'blur(6px)' },
    { opacity: 1, offset: .35 },
    { transform: 'none', opacity: 1, clipPath: 'inset(0 round 0px)', filter: 'blur(0)' },
  ]), { duration: 720, easing: EASE_APRI });
  return a.finished.catch(() => {}).finally(() => { vista.classList.remove('volo'); setTimeout(() => daEl.classList.remove('aperta'), 300); });
}
export function animaChiudi(versoEl, vista) {
  if (!versoEl || fermo()) return Promise.resolve();
  const { dx, dy, s } = geometria(versoEl);
  versoEl.classList.add('aperta');
  vista.style.pointerEvents = 'none'; vista.classList.add('volo');
  const a = vista.animate(kf([
    { transform: 'none', opacity: 1, clipPath: 'inset(0 round 0px)', filter: 'blur(0)' },
    { opacity: 1, offset: .7 },
    { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0, clipPath: 'inset(0 round 160px)', filter: 'blur(4px)' },
  ]), { duration: 520, easing: EASE_CHIUDI, fill: 'forwards' });
  return a.finished.catch(() => {}).finally(() => {
    a.cancel(); vista.style.pointerEvents = ''; vista.classList.remove('volo');
    setTimeout(() => versoEl.classList.remove('aperta'), 120);
    versoEl.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.3,1.6,.5,1)' });
  });
}

// inclinazione 3D dell'icona che segue il puntatore
export function inclinazione(el) {
  const ic = el.querySelector('.cp-ic');
  el.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    ic.style.setProperty('--ry', `${x * 22}deg`); ic.style.setProperty('--rx', `${-y * 18}deg`);
    ic.style.setProperty('--lx', `${(x + .5) * 100}%`); ic.style.setProperty('--ly', `${(y + .5) * 100}%`);
  });
  el.addEventListener('pointerleave', () => { ic.style.setProperty('--ry', '0deg'); ic.style.setProperty('--rx', '0deg'); });
}

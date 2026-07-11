// ── ORION su misura: motore del TEMA ────────────────────────────────────────
// L'utente chiede a voce ("mettimi ORION rosso Ferrari", "tema tramonto") e il
// modello sceglie i colori; qui quei 1-3 hex diventano l'INTERA interfaccia:
//
// · Tailwind v4 compila le utility su variabili CSS (--color-cyan-400 → var()),
//   quindi ridefinendo la famiglia "cyan" (l'accento del brand) a runtime si
//   ricolora TUTTO — testi, bordi, bagliori — senza toccare i componenti.
// · Il nucleo, l'alone e le sfumature dello sfondo hanno variabili dedicate
//   (--nuc-*, --alone, --sfondo-*) definite in globals.css con default ciano.
// · Il cambio è scenografico: un'onda di colore si espande dal centro (dal
//   nucleo) mentre tutti i colori scivolano verso il nuovo tema (.tema-morph).
// · Persistenza: le variabili GIÀ CALCOLATE finiscono in localStorage, così un
//   micro-script inline in <head> le riapplica prima del primo paint (niente
//   lampo ciano al riavvio); il tema vero vive nelle preferenze utente sul
//   server e segue l'account su ogni dispositivo.

export type Tema = {
  accento: string; // hex #rrggbb — colore principale dell'interfaccia
  nucleo?: string | null; // hex — colore della sfera (default: accento)
  sfondo?: string | null; // hex — tinta delle sfumature di sfondo (default: accento)
  nome?: string | null; // nome evocativo scelto dal modello ("Rosso Marte")
};

const CHIAVE_VARS = "orion-tema-vars"; // mappa {variabile: valore} già calcolata

// ── Colore: hex → HSL e ritorno ──────────────────────────────────────────────
function hexRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}
function hslCss(h: number, s: number, l: number) {
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}
function hslRgbTriplet(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `${Math.round((r + m) * 255)} ${Math.round((g + m) * 255)} ${Math.round((b + m) * 255)}`;
}

// ── La scala: da UN colore, tutta la famiglia (come i gradini di Tailwind) ───
// Luminosità per gradino ricalcata sulla scala "cyan" originale; la saturazione
// resta quella dell'accento (un tema grigio-argento resta argento).
const GRADINI: [number, number][] = [
  [50, 0.96], [100, 0.92], [200, 0.84], [300, 0.73], [400, 0.6], [500, 0.5],
  [600, 0.42], [700, 0.35], [800, 0.29], [900, 0.24], [950, 0.15],
];

// Calcola TUTTE le variabili CSS del tema. Esportata per i test.
export function variabiliTema(tema: Tema): Record<string, string> {
  const acc = hexRgb(tema.accento);
  if (!acc) return {};
  const [h, s] = rgbHsl(...acc);
  const vars: Record<string, string> = {};
  for (const [gradino, lum] of GRADINI) vars[`--color-cyan-${gradino}`] = hslCss(h, s, lum);

  // Nucleo: quattro fermate del gradiente + alone, dal colore dedicato (o accento).
  const nuc = hexRgb(tema.nucleo || tema.accento) ?? acc;
  const [nh, ns] = rgbHsl(...nuc);
  vars["--nuc-chiaro"] = hslCss(nh, ns, 0.8);
  vars["--nuc-vivo"] = hslCss(nh, ns, 0.6);
  vars["--nuc-fondo"] = hslCss(nh, Math.min(1, ns * 0.9), 0.3);
  vars["--nuc-buio"] = hslCss(nh, Math.min(1, ns * 0.85), 0.13);
  vars["--alone"] = hslRgbTriplet(nh, ns, 0.6);

  // Sfondo: due tinte tenui — la principale (o il colore scelto) e una sorella
  // spostata di tono, per la stessa profondità del ciano+indaco originale.
  const sf = hexRgb(tema.sfondo || tema.accento) ?? acc;
  const [sh, ss] = rgbHsl(...sf);
  vars["--sfondo-tinta"] = hslRgbTriplet(sh, ss, 0.56);
  vars["--sfondo-tinta2"] = hslRgbTriplet((sh + 40) % 360, ss, 0.56);
  return vars;
}

let variabiliAttive: string[] = [];

// Applica (o toglie, con null) il tema. morph=true per la transizione scenica.
export function applicaTema(tema: Tema | null, opz: { morph?: boolean } = {}) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const vars = tema ? variabiliTema(tema) : {};

  if (opz.morph) {
    // Tutti i colori scivolano insieme…
    root.classList.add("tema-morph");
    window.setTimeout(() => root.classList.remove("tema-morph"), 1400);
    // …mentre un'onda del nuovo colore si espande dal centro (dal nucleo).
    const onda = document.createElement("div");
    onda.className = "tema-onda";
    if (tema) onda.style.setProperty("--onda", vars["--alone"] ?? "56 232 255");
    document.body.appendChild(onda);
    onda.addEventListener("animationend", () => onda.remove());
    window.setTimeout(() => onda.remove(), 2600); // rete di sicurezza
  }

  for (const nome of variabiliAttive) root.style.removeProperty(nome);
  for (const [nome, valore] of Object.entries(vars)) root.style.setProperty(nome, valore);
  variabiliAttive = Object.keys(vars);

  try {
    if (tema) localStorage.setItem(CHIAVE_VARS, JSON.stringify(vars));
    else localStorage.removeItem(CHIAVE_VARS);
  } catch {
    /* modalità privata: pazienza, il tema arriva comunque dal server */
  }
}

// Script inline per <head>: riapplica le variabili salvate PRIMA del primo
// paint, così al riavvio non c'è nessun lampo del ciano di default.
export const SCRIPT_BOOT_TEMA = `try{var v=JSON.parse(localStorage.getItem(${JSON.stringify(
  CHIAVE_VARS
)})||"null");if(v)for(var k in v)document.documentElement.style.setProperty(k,v[k])}catch(e){}`;

import { test } from "node:test";
import assert from "node:assert/strict";
import { variabiliTema } from "../tema";

// ORION su misura: da UN colore accento nasce l'intera scala dell'interfaccia
// (le --color-cyan-* di Tailwind), il gradiente del nucleo e le tinte di sfondo.

test("un accento genera tutta la scala Tailwind + nucleo + sfondo", () => {
  const vars = variabiliTema({ accento: "#ff2d55" });
  for (const g of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
    assert.ok(vars[`--color-cyan-${g}`]?.startsWith("hsl("), `manca il gradino ${g}`);
  }
  // Il rosso resta rosso: tonalità del gradino vivo vicina a 349°.
  assert.match(vars["--color-cyan-400"], /^hsl\(34[5-9]|^hsl\(35[0-3]/);
  // I gradini chiari sono più luminosi di quelli scuri.
  assert.ok(vars["--color-cyan-50"].includes("96%"));
  assert.ok(vars["--color-cyan-950"].includes("15%"));
  // Nucleo: quattro fermate + alone in tripletta "R G B" (per usarlo con alpha).
  for (const n of ["--nuc-chiaro", "--nuc-vivo", "--nuc-fondo", "--nuc-buio"]) assert.ok(vars[n]);
  assert.match(vars["--alone"], /^\d{1,3} \d{1,3} \d{1,3}$/);
  assert.match(vars["--sfondo-tinta"], /^\d{1,3} \d{1,3} \d{1,3}$/);
});

test("nucleo e sfondo dedicati vincono sull'accento; hex invalidi = nessun tema", () => {
  const base = variabiliTema({ accento: "#ff2d55" });
  const mix = variabiliTema({ accento: "#ff2d55", nucleo: "#ffd700", sfondo: "#1e90ff" });
  assert.notEqual(mix["--nuc-vivo"], base["--nuc-vivo"]);
  assert.notEqual(mix["--sfondo-tinta"], base["--sfondo-tinta"]);
  assert.equal(mix["--color-cyan-400"], base["--color-cyan-400"]); // l'interfaccia resta dall'accento
  assert.deepEqual(variabiliTema({ accento: "rosso" }), {});
  assert.deepEqual(variabiliTema({ accento: "#12345" }), {});
});

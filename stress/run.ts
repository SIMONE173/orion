// ──────────────────────────────────────────────────────────────────────────
// STRESS TEST — IL RUNNER.
//   npx tsx stress/run.ts                       → tutti i lotti in ordine
//   npx tsx stress/run.ts --lotti azienda       → solo alcuni (virgole)
//   npx tsx stress/run.ts --budget 8            → stop di spesa in euro
//   npx tsx stress/run.ts --fumo                → solo la chiamata di fumo
// Richiede il server locale acceso (npm run dev su :3000).
// ──────────────────────────────────────────────────────────────────────────
import { spesa, budgetSuperato, esiti, rapportoFinale, apriTrascrizione, annota, creaAccount, dice, BASE } from "./motore";
import { lottoFondamenta, lottoAzienda, lottoGestionale, lottoTappeto, lottoCentralino } from "./scenari";

const LOTTI: Record<string, () => Promise<void>> = {
  fondamenta: lottoFondamenta,
  azienda: lottoAzienda,
  gestionale: lottoGestionale,
  tappeto: lottoTappeto,
  centralino: lottoCentralino,
};

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Chiamata di FUMO: un turno minimo per verificare crediti + caching dal vivo.
async function fumo(): Promise<boolean> {
  console.log("— Chiamata di fumo (verifica crediti + cache) —");
  const p = await creaAccount("stress-fumo@test.orion", "Fumo");
  const r = await dice(p, "Ciao, rispondimi solo 'pronto'.");
  if (r.errore) {
    console.error(`✗ FUMO FALLITO: errore='${r.errore}' — ${r.testo}`);
    return false;
  }
  const c = r.consumo;
  console.log(`✓ risposta: "${r.testo.slice(0, 60)}"`);
  if (c) {
    console.log(
      `  consumo: ${c.chiamate} chiamate · input ${c.input} · output ${c.output} · cache scritti ${c.cacheScrittura} · cache LETTI ${c.cacheLettura}`
    );
    console.log(
      c.cacheLettura + c.cacheScrittura > 0
        ? "  ✓ PROMPT CACHING ATTIVO (il blocco fisso non si ripaga)"
        : "  ⚠ cache a zero: prima chiamata assoluta (scrittura) o cache freddo — riguardare al secondo giro"
    );
  }
  console.log(`  spesa del fumo: €${spesa.euro.toFixed(3)}\n`);
  return true;
}

(async () => {
  spesa.budgetEuro = Number(arg("budget") || 8);
  const richiesti = (arg("lotti") ?? Object.keys(LOTTI).join(",")).split(",").map((s) => s.trim()).filter(Boolean);

  console.log(`ORION STRESS — server ${BASE} — budget €${spesa.budgetEuro} — lotti: ${richiesti.join(", ")}\n`);
  apriTrascrizione("giro-totale");
  annota(`Server: ${BASE} — budget €${spesa.budgetEuro} — lotti: ${richiesti.join(", ")}`);

  if (!(await fumo())) {
    console.error("Mi fermo: sistemare crediti/chiave e rilanciare.");
    process.exit(2);
  }
  if (process.argv.includes("--fumo")) process.exit(0);

  for (const nome of richiesti) {
    const lotto = LOTTI[nome];
    if (!lotto) {
      console.error(`lotto sconosciuto: ${nome}`);
      continue;
    }
    if (budgetSuperato()) {
      console.log(`⛔ BUDGET RAGGIUNTO (€${spesa.euro.toFixed(2)}): salto '${nome}' e chiudo il rapporto.`);
      break;
    }
    console.log(`\n═══ LOTTO: ${nome.toUpperCase()} ═══`);
    try {
      await lotto();
    } catch (e) {
      console.error(`✗ lotto '${nome}' interrotto:`, e instanceof Error ? e.message : e);
      esiti.push({ scenario: nome, passo: "esecuzione del lotto", ok: false, dettaglio: String(e) });
    }
  }

  const { falliti } = rapportoFinale();
  process.exit(falliti ? 1 : 0);
})();

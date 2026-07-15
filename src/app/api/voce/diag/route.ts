import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DIAGNOSTICO TEMPORANEO: verifica che la chiave ElevenLabs sia valida, senza
// generare audio (nessun consumo di crediti TTS). Non espone la chiave.
// DA RIMUOVERE dopo la diagnosi.
export async function GET() {
  const KEY = (process.env.ELEVENLABS_API_KEY || "").trim();
  const VOICE = (process.env.ELEVENLABS_VOICE_ID || "kAzI34nYjizE0zON6rXv").trim();
  const MODEL = (process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5").trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any = { configurata: Boolean(KEY), keyLen: KEY.length, keyPrefix: KEY.slice(0, 3), voiceId: VOICE, model: MODEL };
  if (!KEY) return NextResponse.json(out);

  try {
    const u = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": KEY }, signal: AbortSignal.timeout(10_000) });
    out.userStatus = u.status;
    if (!u.ok) out.userBody = (await u.text().catch(() => "")).slice(0, 200);
  } catch (e) {
    out.userError = e instanceof Error ? e.message : String(e);
  }

  try {
    const v = await fetch(`https://api.elevenlabs.io/v1/voices/${VOICE}`, { headers: { "xi-api-key": KEY }, signal: AbortSignal.timeout(10_000) });
    out.voiceStatus = v.status;
    if (!v.ok) out.voiceBody = (await v.text().catch(() => "")).slice(0, 200);
  } catch (e) {
    out.voiceError = e instanceof Error ? e.message : String(e);
  }

  // Test permesso Text-to-Speech con una voce "premade" (Rachel) che esiste in
  // ogni account: se 200 la chiave PUÒ generare audio (manca solo la voce scelta);
  // se 401 "missing permission" la chiave non ha lo scope TTS.
  try {
    const t = await fetch("https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM?output_format=mp3_44100_128", {
      method: "POST",
      headers: { "xi-api-key": KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: "ok", model_id: MODEL }),
      signal: AbortSignal.timeout(15_000),
    });
    out.ttsStatus = t.status;
    if (!t.ok) out.ttsBody = (await t.text().catch(() => "")).slice(0, 200);
    else out.ttsBytes = (await t.arrayBuffer()).byteLength;
  } catch (e) {
    out.ttsError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}

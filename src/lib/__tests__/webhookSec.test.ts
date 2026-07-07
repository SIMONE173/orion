import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verificaFirmaTwilioRaw, verificaFirmaMeta } from "../webhookSec";

// Firme dei webhook: se questi test passano, solo Twilio e Meta possono
// parlare con ORION. Un webhook aperto = prenotazioni e conferme false.

const AUTH_TOKEN = "token-twilio-di-test";

function firmaTwilio(url: string, params: Record<string, string>): string {
  let payload = url;
  for (const k of Object.keys(params).sort()) payload += k + params[k];
  return crypto.createHmac("sha1", AUTH_TOKEN).update(payload, "utf8").digest("base64");
}

test("Twilio: firma corretta accettata (parametri ordinati per chiave)", () => {
  const url = "https://orion.example.com/api/telefono/webhook?vuoti=0";
  const params = { CallSid: "CA123", From: "+393331234567", SpeechResult: "vorrei un appuntamento" };
  const r = verificaFirmaTwilioRaw(AUTH_TOKEN, url, params, firmaTwilio(url, params));
  assert.equal(r.ok, true);
});

test("Twilio: parametro manomesso → rifiutata", () => {
  const url = "https://orion.example.com/api/telefono/webhook";
  const params = { CallSid: "CA123", From: "+393331234567" };
  const firma = firmaTwilio(url, params);
  const r = verificaFirmaTwilioRaw(AUTH_TOKEN, url, { ...params, From: "+390000000000" }, firma);
  assert.equal(r.ok, false);
});

test("Twilio: URL diverso (proxy/porta sbagliata) → rifiutata", () => {
  const params = { CallSid: "CA123" };
  const firma = firmaTwilio("https://orion.example.com/api/telefono/webhook", params);
  const r = verificaFirmaTwilioRaw(AUTH_TOKEN, "http://orion.example.com/api/telefono/webhook", params, firma);
  assert.equal(r.ok, false);
});

test("Twilio: firma assente → rifiutata", () => {
  const r = verificaFirmaTwilioRaw(AUTH_TOKEN, "https://x", {}, null);
  assert.equal(r.ok, false);
});

test("Meta: firma sha256 corretta accettata, corpo manomesso rifiutato", () => {
  process.env.META_APP_SECRET = "segreto-meta-di-test";
  const corpo = JSON.stringify({ entry: [{ changes: [{ value: { messages: [] } }] }] });
  const firma = "sha256=" + crypto.createHmac("sha256", "segreto-meta-di-test").update(corpo, "utf8").digest("hex");
  assert.equal(verificaFirmaMeta(corpo, firma).ok, true);
  assert.equal(verificaFirmaMeta(corpo + " ", firma).ok, false);
  assert.equal(verificaFirmaMeta(corpo, null).ok, false);
  delete process.env.META_APP_SECRET;
});

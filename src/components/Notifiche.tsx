"use client";

import { useEffect, useState } from "react";
import { IconBell } from "./icons";

type Stato = "check" | "unsupported" | "off" | "on" | "denied" | "loading";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function Notifiche() {
  const [stato, setStato] = useState<Stato>("check");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStato("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStato("denied");
      return;
    }
    navigator.serviceWorker
      .getRegistration()
      .then(async (reg) => {
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        setStato(sub ? "on" : "off");
      })
      .catch(() => setStato("off"));
  }, []);

  const attiva = async () => {
    try {
      setStato("loading");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStato(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await fetch("/api/push/key").then((r) => r.json());
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub),
      });
      setStato("on");
      // Notifica di conferma immediata.
      fetch("/api/push/test", { method: "POST" }).catch(() => {});
    } catch (e) {
      console.error("[notifiche]", e);
      setStato("off");
    }
  };

  if (stato === "unsupported" || stato === "check") return null;

  const attive = stato === "on";
  const title =
    stato === "on"
      ? "Notifiche attive"
      : stato === "denied"
        ? "Notifiche bloccate: sbloccale dalle impostazioni del browser"
        : stato === "loading"
          ? "Attivazione…"
          : "Attiva le notifiche";

  return (
    <button
      onClick={() => stato === "off" && attiva()}
      disabled={attive || stato === "loading" || stato === "denied"}
      title={title}
      aria-label={title}
      className={`grid size-9 place-items-center rounded-lg border transition ${
        attive
          ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-200"
          : stato === "denied"
            ? "border-white/10 bg-white/5 text-slate-600"
            : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
      }`}
    >
      <IconBell className={`h-4 w-4 ${stato === "loading" ? "animate-pulse" : ""}`} />
    </button>
  );
}

export function ora(iso: string): string {
  // "YYYY-MM-DDTHH:MM" → "HH:MM"
  const t = iso.includes("T") ? iso.split("T")[1] : iso;
  return t.slice(0, 5);
}

export function euro(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

const MESI = [
  "gen", "feb", "mar", "apr", "mag", "giu",
  "lug", "ago", "set", "ott", "nov", "dic",
];

export function dataBreve(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00` : iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MESI[d.getMonth()]}`;
}

export function etichettaMetodo(m: string): string {
  return (
    { contanti: "Contanti", pos: "POS", bonifico: "Bonifico", link: "Link di pagamento" }[m] ?? m
  );
}

export function etichettaStato(s: string): string {
  return (
    {
      confermato: "Confermato",
      da_confermare: "Da confermare",
      cancellato: "Cancellato",
      incassato: "Incassato",
      da_incassare: "Da incassare",
    }[s] ?? s
  );
}

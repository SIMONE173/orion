"use client";

import { euro } from "./format";
import type { Vista } from "@/lib/orion/views";

// pdf-lib è pesante: lo importiamo on-demand (solo al click su "Scarica PDF").

function base64ToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const m = dataUrl.match(/^data:(.+?);base64,(.*)$/);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime: m[1] };
}

function wrap(text: string, font: import("pdf-lib").PDFFont, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const paragrafo of text.split("\n")) {
    if (paragrafo.trim() === "") {
      out.push("");
      continue;
    }
    let riga = "";
    for (const parola of paragrafo.split(/\s+/)) {
      const prova = riga ? `${riga} ${parola}` : parola;
      if (font.widthOfTextAtSize(prova, size) > maxW && riga) {
        out.push(riga);
        riga = parola;
      } else {
        riga = prova;
      }
    }
    if (riga) out.push(riga);
  }
  return out;
}

function scarica(bytes: Uint8Array, nomeFile: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeFile;
  a.click();
  URL.revokeObjectURL(url);
}

const A4 = { w: 595, h: 842 };
const MARGIN = 56;

export async function scaricaDocumentoPdf(doc: Extract<Vista, { tipo: "documento" }>["dati"]["documento"]) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - MARGIN;

  page.drawText(doc.titolo, { x: MARGIN, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.12) });
  y -= 24;
  page.drawText(`${doc.tipo}${doc.cliente_nome ? ` · ${doc.cliente_nome}` : ""}`, {
    x: MARGIN,
    y,
    size: 10,
    font,
    color: rgb(0.4, 0.4, 0.45),
  });
  y -= 28;

  // Immagine acquisita (se presente)
  if (doc.immagine) {
    const img = base64ToBytes(doc.immagine);
    if (img) {
      try {
        const embedded = img.mime.includes("png")
          ? await pdf.embedPng(img.bytes)
          : await pdf.embedJpg(img.bytes);
        const maxW = A4.w - MARGIN * 2;
        const maxH = 260;
        const scala = Math.min(maxW / embedded.width, maxH / embedded.height, 1);
        const w = embedded.width * scala;
        const h = embedded.height * scala;
        page.drawImage(embedded, { x: MARGIN, y: y - h, width: w, height: h });
        y -= h + 24;
      } catch {
        /* immagine non incorporabile, si prosegue col testo */
      }
    }
  }

  const size = 11;
  const lineH = 16;
  for (const riga of wrap(doc.testo ?? "", font, size, A4.w - MARGIN * 2)) {
    if (y < MARGIN) {
      page = pdf.addPage([A4.w, A4.h]);
      y = A4.h - MARGIN;
    }
    page.drawText(riga, { x: MARGIN, y, size, font, color: rgb(0.15, 0.15, 0.18) });
    y -= lineH;
  }

  scarica(await pdf.save(), `${doc.titolo.replace(/\s+/g, "_")}.pdf`);
}

export async function scaricaFatturaPdf(f: Extract<Vista, { tipo: "fattura" }>["dati"]) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - MARGIN;

  page.drawText(`Fattura n. ${f.numero}`, { x: MARGIN, y, size: 20, font: bold });
  page.drawText(f.data, { x: A4.w - MARGIN - 80, y, size: 11, font });
  y -= 40;

  const colR = A4.w / 2 + 10;
  page.drawText("EMITTENTE", { x: MARGIN, y, size: 9, font: bold, color: rgb(0.4, 0.4, 0.45) });
  page.drawText("CLIENTE", { x: colR, y, size: 9, font: bold, color: rgb(0.4, 0.4, 0.45) });
  y -= 16;

  const blocco = (x: number, righe: string[]) => {
    let yy = y;
    for (const r of righe) {
      if (!r) continue;
      page.drawText(r, { x, y: yy, size: 10, font, color: rgb(0.15, 0.15, 0.18) });
      yy -= 14;
    }
    return yy;
  };

  const yE = blocco(MARGIN, [
    f.emittente.nome ?? "—",
    f.emittente.indirizzo ?? "",
    f.emittente.piva ? `P.IVA ${f.emittente.piva}` : "",
    f.emittente.regime_fiscale ?? "",
    f.emittente.pec ? `PEC ${f.emittente.pec}` : "",
    f.emittente.sdi ? `SDI ${f.emittente.sdi}` : "",
  ]);
  const yC = blocco(colR, [
    f.cliente.nome,
    f.cliente.indirizzo ?? "",
    f.cliente.piva ? `P.IVA ${f.cliente.piva}` : f.cliente.codice_fiscale ? `CF ${f.cliente.codice_fiscale}` : "",
  ]);
  y = Math.min(yE, yC) - 24;

  page.drawLine({ start: { x: MARGIN, y }, end: { x: A4.w - MARGIN, y }, color: rgb(0.85, 0.85, 0.88) });
  y -= 24;
  page.drawText(f.descrizione ?? "Prestazione professionale", { x: MARGIN, y, size: 12, font });
  page.drawText(euro(f.importo), { x: A4.w - MARGIN - 90, y, size: 14, font: bold });

  scarica(await pdf.save(), `Fattura_${f.numero.replace(/\//g, "-")}.pdf`);
}

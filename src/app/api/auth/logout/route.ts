import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eliminaSessione } from "@/lib/auth";
import { COOKIE_SESSIONE } from "@/lib/sessione";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const store = await cookies();
  const token = store.get(COOKIE_SESSIONE)?.value;
  if (token) eliminaSessione(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESSIONE, "", { path: "/", maxAge: 0 });
  return res;
}

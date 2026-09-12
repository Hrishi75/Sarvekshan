import { NextResponse } from "next/server";
import { z } from "zod";
import { q1 } from "@/lib/db";
import { SESSION_COOKIE, devSignInEnabled } from "@/lib/session";

export async function POST(req: Request) {
  if (!devSignInEnabled()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const fd = await req.formData();
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  // Issue a session only for a user that actually exists and is active. Without
  // this the cookie is whatever the client typed.
  const user = await q1<{ id: string }>(
    `SELECT id FROM users WHERE id = $1 AND active`,
    [id.data]
  );
  if (!user) return NextResponse.json({ error: "bad payload" }, { status: 400 });

  const res = NextResponse.redirect(new URL("/", req.url), { status: 303 });
  res.cookies.set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}

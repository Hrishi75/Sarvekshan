import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(req: Request) {
  const fd = await req.formData();
  const id = String(fd.get("id") ?? "");
  const res = NextResponse.redirect(new URL("/", req.url), { status: 303 });
  if (id) {
    res.cookies.set(SESSION_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
  }
  return res;
}

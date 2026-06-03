import { NextResponse } from "next/server";
import { AUTH_COOKIE, authPassword, authUsername, createSessionCookie, sessionMaxAge } from "@/lib/auth";

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));

  if (username !== authUsername() || password !== authPassword()) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "1");
    loginUrl.searchParams.set("next", next);
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  const response = NextResponse.redirect(new URL(next, request.url), { status: 303 });
  response.cookies.set({
    name: AUTH_COOKIE,
    value: createSessionCookie(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAge(),
  });
  return response;
}

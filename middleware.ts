import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, verifySessionCookie } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

function isPublicAsset(pathname: string): boolean {
  return pathname.startsWith("/_next/")
    || pathname === "/favicon.ico"
    || pathname === "/robots.txt"
    || pathname === "/sitemap.xml";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicAsset(pathname)) return NextResponse.next();

  const isAuthenticated = verifySessionCookie(request.cookies.get(AUTH_COOKIE)?.value);

  if (pathname === "/login" && isAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();
  if (isAuthenticated) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

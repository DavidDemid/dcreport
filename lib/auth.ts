export const AUTH_COOKIE = "dc_reports_session";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function authUsername() {
  return process.env.AUTH_USERNAME || "dc";
}

export function authPassword() {
  return process.env.AUTH_PASSWORD || "dc-reports-2026";
}

export function authSessionToken() {
  return process.env.AUTH_SESSION_TOKEN || process.env.AUTH_SECRET || "local-development-session-token";
}

export function createSessionCookie(): string {
  return authSessionToken();
}

export function verifySessionCookie(token: string | undefined): boolean {
  return Boolean(token) && token === authSessionToken();
}

export function sessionMaxAge() {
  return SESSION_TTL_SECONDS;
}

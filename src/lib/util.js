// Small shared helpers for the community API (Workers runtime: Web Crypto,
// Fetch, URL all available globally).

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

export function clean(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function normalizeEmail(value) {
  return clean(value, 200).toLowerCase();
}

export function nowISO() {
  return new Date().toISOString();
}

export function isoIn(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

// Prefixed, collision-resistant id.
export function id(prefix = "id") {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

// Hex-encoded cryptographically-random token.
export function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function serializeCookie(name, value, opts = {}) {
  let s = `${name}=${encodeURIComponent(value)}`;
  if (opts.maxAge != null) s += `; Max-Age=${Math.floor(opts.maxAge)}`;
  s += `; Path=${opts.path || "/"}`;
  if (opts.httpOnly) s += "; HttpOnly";
  if (opts.secure) s += "; Secure";
  if (opts.sameSite) s += `; SameSite=${opts.sameSite}`;
  return s;
}

export function originMatchesHost(origin, host) {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// CSRF/defense-in-depth guard for state-changing requests. With SameSite=Lax
// cookies this blocks cross-site form posts; we additionally verify Origin
// (or Referer) matches Host.
export function sameOrigin(request) {
  const host = request.headers.get("Host");
  const origin = request.headers.get("Origin");
  if (origin) return originMatchesHost(origin, host);
  const ref = request.headers.get("Referer");
  if (ref) return originMatchesHost(ref, host);
  return true;
}

// Base URL for building links in emails. Prefer the configured SITE_URL; fall
// back to the request's own origin.
export function siteBase(env, request) {
  const configured = clean(env && env.SITE_URL, 300).replace(/\/+$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
}

// Accounts & sessions: passwordless magic-link sign-in (via Resend), with
// @nmu.edu self-serve plus leader-issued invites for everyone else.
import {
  json, clean, isEmail, normalizeEmail, randomToken, sha256hex, isoIn,
  parseCookies, serializeCookie, sameOrigin, siteBase,
} from "./util.js";

const SESSION_COOKIE = "iv_sess";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
const TOKEN_TTL = 60 * 15;             // 15 minutes
const INVITE_TTL = 60 * 60 * 24 * 14;  // 14 days
const NAME_MIN = 2;
const NAME_MAX = 50;

export function leaderEmails(env) {
  return new Set(
    clean(env && env.LEADER_EMAILS, 4000)
      .toLowerCase()
      .split(/[,\s]+/)
      .filter(Boolean)
  );
}

// The session user, or null. Banned users are treated as signed-out.
export async function currentUser(request, env, db) {
  const sid = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE];
  if (!sid) return null;
  const session = await db.getSession(sid);
  if (!session) return null;
  const user = await db.getUserById(session.user_id);
  if (!user || user.banned_at) return null;
  user._sid = sid;
  return user;
}

// Shape we expose to the client for the signed-in user (their own record).
export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name || null,
    role: user.role,
    dm_opt_in: !!user.dm_opt_in,
    needs_name: !user.display_name,
  };
}

function setSessionHeaders(request, sid, maxAge) {
  const secure = new URL(request.url).protocol === "https:";
  return {
    "Set-Cookie": serializeCookie(SESSION_COOKIE, sid, {
      path: "/", httpOnly: true, secure, sameSite: "Lax", maxAge,
    }),
  };
}

function magicLink(env, request, token) {
  return `${siteBase(env, request)}/api/community/auth/verify?token=${token}`;
}

async function deliverLink(env, ctx, { to, subject, intro, link }) {
  const text =
    `${intro}\n\n${link}\n\n` +
    `This link expires soon and can only be used once. ` +
    `If you didn't request it, you can ignore this email.`;
  if (env.RESEND_API_KEY && env.COMMUNITY_FROM) {
    const send = fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.COMMUNITY_FROM, to: [to], subject, text }),
    }).then(async (r) => {
      if (!r.ok) console.error("Resend send failed", r.status, await r.text());
    }).catch((e) => console.error("Resend error", e));
    if (ctx && ctx.waitUntil) ctx.waitUntil(send);
    else await send;
    return { viaEmail: true };
  }
  // No email configured (local/dev): surface the link so flows are testable.
  console.log(`[community] magic link for ${to}: ${link}`);
  return { viaEmail: false };
}

/* ------------------------------- handlers ------------------------------- */

// POST /auth/start { email } — send a sign-in link if the address is eligible.
export async function authStart(request, env, db, ctx) {
  if (!sameOrigin(request)) return json({ error: "Bad origin." }, 403);
  let data;
  try { data = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const email = normalizeEmail(data.email);
  if (!isEmail(email)) return json({ error: "Please enter a valid email.", fields: { email: true } }, 422);

  const existing = await db.getUserByEmail(email);
  if (existing && existing.banned_at) {
    // Don't hint that an account exists; generic refusal.
    return json({ ok: true, eligible: false, message: "That email can't sign in right now." });
  }
  const eligible = email.endsWith("@nmu.edu") || !!existing || !!(await db.pendingInvite(email));
  if (!eligible) {
    return json({
      ok: true, eligible: false,
      message: "That email isn't on the list yet. Ask a chapter leader to send you an invite.",
    });
  }

  const token = randomToken(32);
  await db.createLoginToken({ email, token_hash: await sha256hex(token), kind: "login", expires_at: isoIn(TOKEN_TTL) });
  const link = magicLink(env, request, token);
  const sent = await deliverLink(env, ctx, {
    to: email,
    subject: "Your InterVarsity at NMU sign-in link",
    intro: "Tap the link below to sign in to the InterVarsity at NMU community:",
    link,
  });

  const resp = { ok: true, eligible: true, message: "Check your inbox for a sign-in link." };
  if (!sent.viaEmail) { resp.dev = true; resp.link = link; resp.note = "Email isn't configured, so here's the link directly (dev mode)."; }
  return json(resp);
}

// GET /auth/verify?token=... — consume the token, set a session, redirect in.
export async function authVerify(request, env, db) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const base = siteBase(env, request);
  const fail = (reason) =>
    new Response(null, { status: 302, headers: { Location: `${base}/community?error=${reason}` } });

  if (!token) return fail("link");
  const rec = await db.findValidToken(await sha256hex(token));
  if (!rec) return fail("expired");
  await db.useToken(rec.id);

  const email = rec.email;
  const leaders = leaderEmails(env);
  let user = await db.getUserByEmail(email);
  if (user && user.banned_at) return fail("banned");
  if (!user) {
    user = await db.createUser({ email, role: leaders.has(email) ? "leader" : "member" });
    await db.useInvitesFor(email);
  } else if (leaders.has(email) && user.role !== "leader") {
    await db.setUserRole(user.id, "leader");
  }

  const sid = await db.createSession(user.id, isoIn(SESSION_TTL));
  return new Response(null, {
    status: 302,
    headers: { Location: `${base}/community`, ...setSessionHeaders(request, sid, SESSION_TTL) },
  });
}

// POST /auth/logout
export async function authLogout(request, env, db) {
  if (!sameOrigin(request)) return json({ error: "Bad origin." }, 403);
  const sid = parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE];
  if (sid) await db.deleteSession(sid);
  return json({ ok: true }, 200, setSessionHeaders(request, "", 0));
}

// POST /me { display_name, dm_opt_in } — required display name + DM preference.
export async function meUpdate(request, env, db, user) {
  if (!sameOrigin(request)) return json({ error: "Bad origin." }, 403);
  let data;
  try { data = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }

  const name = clean(data.display_name, NAME_MAX);
  if (name.length < NAME_MIN) return json({ error: "Please use a name of at least 2 characters.", fields: { display_name: true } }, 422);
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .'\-]*$/u.test(name)) {
    return json({ error: "Names can use letters, numbers, spaces, apostrophes, periods, and hyphens.", fields: { display_name: true } }, 422);
  }
  const updated = await db.updateProfile(user.id, { display_name: name, dm_opt_in: !!data.dm_opt_in });
  return json({ ok: true, user: publicUser(updated) });
}

// POST /invites { email } — leaders invite someone outside @nmu.edu.
export async function createInviteHandler(request, env, db, ctx, actor) {
  if (!sameOrigin(request)) return json({ error: "Bad origin." }, 403);
  let data;
  try { data = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const email = normalizeEmail(data.email);
  if (!isEmail(email)) return json({ error: "Please enter a valid email.", fields: { email: true } }, 422);

  await db.createInvite({ email, invited_by: actor.id, expires_at: isoIn(INVITE_TTL) });
  const token = randomToken(32);
  await db.createLoginToken({ email, token_hash: await sha256hex(token), kind: "invite", expires_at: isoIn(INVITE_TTL) });
  const link = magicLink(env, request, token);
  const sent = await deliverLink(env, ctx, {
    to: email,
    subject: `${actor.display_name || "A leader"} invited you to the InterVarsity at NMU community`,
    intro: "You've been invited to join the InterVarsity at NMU community. Tap the link below to set up your account:",
    link,
  });

  const resp = { ok: true, message: `Invite sent to ${email}.` };
  if (!sent.viaEmail) { resp.dev = true; resp.link = link; }
  return json(resp);
}

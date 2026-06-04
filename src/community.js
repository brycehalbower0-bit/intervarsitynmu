// Router for /api/community/* — maps paths to the auth/events/threads/moderation
// handlers, loads the session user, and enforces member/leader access.
import { Db } from "./lib/db.js";
import { json } from "./lib/util.js";
import * as auth from "./lib/auth.js";
import * as events from "./lib/events.js";
import * as threads from "./lib/threads.js";
import * as mod from "./lib/moderation.js";

export async function handleCommunity(request, env, ctx) {
  if (!env.DB) return json({ error: "Community isn't configured (no database bound)." }, 503);

  const db = new Db(env.DB);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/community/, "") || "/";
  const seg = path.split("/").filter(Boolean);
  const method = request.method;
  const is = (p, m) => path === p && method === m;

  // --- public auth endpoints ---
  if (is("/auth/start", "POST")) return auth.authStart(request, env, db, ctx);
  if (is("/auth/verify", "GET")) return auth.authVerify(request, env, db);
  if (is("/auth/logout", "POST")) return auth.authLogout(request, env, db);

  // Load the session user once (null if signed out / banned).
  const user = await auth.currentUser(request, env, db);
  const requireUser = (fn) => (user ? fn() : json({ error: "Sign in first." }, 401));
  const requireLeader = (fn) =>
    user && user.role === "leader" ? fn() : json({ error: user ? "Leaders only." : "Sign in first." }, user ? 403 : 401);

  if (is("/me", "GET")) return json({ user: auth.publicUser(user) });
  if (is("/me", "POST")) return requireUser(() => auth.meUpdate(request, env, db, user));

  // --- public calendar / events ---
  if (is("/events", "GET")) return events.listEvents(request, env, db);
  if (seg[0] === "events" && seg.length === 2 && method === "GET") return events.getEvent(request, env, db, seg[1], user);

  // --- leader event management (same paths, mutating methods) ---
  if (is("/events", "POST")) return requireLeader(() => events.createEvent(request, env, db, user));
  if (seg[0] === "events" && seg.length === 2 && (method === "PATCH" || method === "PUT"))
    return requireLeader(() => events.updateEvent(request, env, db, seg[1], user));
  if (seg[0] === "events" && seg.length === 2 && method === "DELETE")
    return requireLeader(() => events.deleteEvent(request, env, db, seg[1], user));

  // --- threads + posts (members) ---
  if (seg[0] === "events" && seg.length === 3 && seg[2] === "thread" && method === "POST")
    return requireUser(() => threads.startThread(request, env, db, seg[1], user));
  if (seg[0] === "threads" && seg.length === 2 && method === "GET")
    return requireUser(() => threads.getThread(request, env, db, seg[1], user));
  if (seg[0] === "threads" && seg.length === 3 && seg[2] === "posts" && method === "POST")
    return requireUser(() => threads.createPost(request, env, db, seg[1], user));

  if (is("/reports", "POST")) return requireUser(() => mod.createReport(request, env, db, user));

  // --- leader moderation ---
  if (is("/invites", "POST")) return requireLeader(() => auth.createInviteHandler(request, env, db, ctx, user));
  if (is("/mod/queue", "GET")) return requireLeader(() => mod.queue(request, env, db));
  if (seg[0] === "mod" && seg[1] === "posts" && seg.length === 4 && seg[3] === "approve" && method === "POST")
    return requireLeader(() => mod.approve(request, env, db, seg[2], user));
  if (seg[0] === "mod" && seg[1] === "posts" && seg.length === 4 && seg[3] === "reject" && method === "POST")
    return requireLeader(() => mod.reject(request, env, db, seg[2], user));
  if (is("/mod/terms", "GET")) return requireLeader(() => mod.listTerms(env, db));
  if (is("/mod/terms", "POST")) return requireLeader(() => mod.addTerm(request, env, db, user));
  if (seg[0] === "mod" && seg[1] === "terms" && seg.length === 3 && method === "DELETE")
    return requireLeader(() => mod.deleteTerm(request, env, db, seg[2], user));
  if (seg[0] === "mod" && seg[1] === "users" && seg.length === 4 && seg[3] === "ban" && method === "POST")
    return requireLeader(() => mod.banUser(request, env, db, seg[2], user));

  return json({ error: "Not found." }, 404);
}

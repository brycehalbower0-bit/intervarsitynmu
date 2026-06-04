// Integration test for the community API. Runs the real Worker handler against
// a SQLite-backed D1 adapter loaded with the actual migrations.
//   npm test   (node --experimental-sqlite test/run.mjs)
import { readFileSync } from "node:fs";
import { makeD1 } from "./d1-adapter.mjs";
import { handleCommunity } from "../src/community.js";

const ORIGIN = "https://nmu.example";
const sql = (f) => readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8");
const DB = makeD1([sql("0001_init.sql"), sql("0002_seed.sql")]);
const env = { DB, LEADER_EMAILS: "leader@nmu.edu", SITE_URL: ORIGIN };

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error("  ✗ " + msg); }
}
function section(name) { console.log("\n• " + name); }

async function call(method, path, { body, cookie } = {}) {
  const headers = { Origin: ORIGIN, Host: "nmu.example" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers["Cookie"] = cookie;
  const req = new Request(ORIGIN + "/api/community" + path, {
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const res = await handleCommunity(req, env, { waitUntil() {} });
  const setCookie = res.headers.get("Set-Cookie");
  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { /* redirect/no body */ }
  return { status: res.status, json, location: res.headers.get("Location"), setCookie };
}

// Sign in end-to-end via the dev magic link, returning the session cookie.
async function signIn(email) {
  const start = await call("POST", "/auth/start", { body: { email } });
  if (!start.json || !start.json.link) throw new Error(`no dev link for ${email}: ${JSON.stringify(start.json)}`);
  const token = new URL(start.json.link).searchParams.get("token");
  const verify = await call("GET", `/auth/verify?token=${token}`);
  const m = /iv_sess=([^;]+)/.exec(verify.setCookie || "");
  if (!m) throw new Error(`no session cookie for ${email}`);
  return `iv_sess=${m[1]}`;
}

(async () => {
  section("signed-out state");
  ok((await call("GET", "/me")).json.user === null, "GET /me is null when signed out");
  ok((await call("GET", "/mod/queue")).status === 401, "leader route 401 when signed out");

  section("eligibility");
  const notEligible = await call("POST", "/auth/start", { body: { email: "random@gmail.com" } });
  ok(notEligible.json.eligible === false, "non-@nmu.edu without invite is not eligible");
  const eligible = await call("POST", "/auth/start", { body: { email: "student@nmu.edu" } });
  ok(eligible.json.eligible === true && eligible.json.link, "@nmu.edu gets a sign-in link");

  section("sign-in + profile");
  const student = await signIn("student@nmu.edu");
  const me1 = await call("GET", "/me", { cookie: student });
  ok(me1.json.user && me1.json.user.role === "member", "student signed in as member");
  ok(me1.json.user.needs_name === true, "new user needs a display name");
  ok((await call("POST", "/me", { cookie: student, body: { display_name: "x" } })).status === 422, "rejects too-short name");
  const named = await call("POST", "/me", { cookie: student, body: { display_name: "Sam Student" } });
  ok(named.status === 200 && named.json.user.needs_name === false, "sets display name");

  section("calendar + events (public)");
  const list = await call("GET", "/events");
  ok(list.json.events.length >= 5, "seeded events are listed");
  const range = await call("GET", "/events?from=2026-06-01T00:00:00Z&to=2026-07-01T00:00:00Z");
  ok(range.json.events.some((e) => e.slug === "summer-bonfire") && !range.json.events.some((e) => e.slug === "worship-night"),
    "date range filters events");
  const detail = await call("GET", "/events/welcome-week-cookout");
  ok(detail.json.event && detail.json.thread === null, "event detail has no thread yet");

  section("threads + posting");
  const thread = await call("POST", "/events/welcome-week-cookout/thread", { cookie: student });
  ok(thread.status === 200 && thread.json.thread.id, "member starts a thread");
  const tid = thread.json.thread.id;
  const again = await call("POST", "/events/welcome-week-cookout/thread", { cookie: student });
  ok(again.json.thread.id === tid, "starting again returns the same thread");
  const clean = await call("POST", `/threads/${tid}/posts`, { cookie: student, body: { body: "So excited for this!" } });
  ok(clean.json.pending === false, "clean post publishes immediately");
  const flagged = await call("POST", `/threads/${tid}/posts`, { cookie: student, body: { body: "this is shit honestly" } });
  ok(flagged.json.pending === true, "post with a banned word is held pending");
  const asAuthor = await call("GET", `/threads/${tid}`, { cookie: student });
  ok(asAuthor.json.posts.length === 2, "author sees their own pending post");

  section("event detail reflects published count");
  const detail2 = await call("GET", "/events/welcome-week-cookout", { cookie: student });
  ok(detail2.json.thread && detail2.json.posts_count === 1, "only the published post counts");

  section("leader moderation");
  const leader = await signIn("leader@nmu.edu");
  ok((await call("GET", "/me", { cookie: leader })).json.user.role === "leader", "LEADER_EMAILS grants leader role");
  const queue = await call("GET", "/mod/queue", { cookie: leader });
  ok(queue.json.items.length === 1 && queue.json.items[0].flagged_terms.includes("shit"), "pending post is in the queue with the term");
  const pendingId = queue.json.items[0].id;
  ok((await call("POST", `/mod/posts/${pendingId}/reject`, { cookie: leader, body: { reason: "language" } })).status === 200, "leader rejects the post");
  ok((await call("GET", "/mod/queue", { cookie: leader })).json.items.length === 0, "queue is empty after reject");

  section("banned-term management");
  ok((await call("POST", "/mod/terms", { cookie: leader, body: { term: "darn" } })).status === 200, "leader adds a term");
  const newFlag = await call("POST", `/threads/${tid}/posts`, { cookie: student, body: { body: "well darn it" } });
  ok(newFlag.json.pending === true, "newly-banned term flags posts");
  const q2 = await call("GET", "/mod/queue", { cookie: leader });
  ok((await call("POST", `/mod/posts/${q2.json.items[0].id}/approve`, { cookie: leader })).status === 200, "leader approves a post");
  ok((await call("GET", `/threads/${tid}`, { cookie: student })).json.posts.filter((p) => p.status === "published").length === 2,
    "approved post is now published");

  section("access control");
  ok((await call("GET", "/mod/queue", { cookie: student })).status === 403, "members can't see the mod queue");
  ok((await call("POST", "/events", { cookie: student, body: { title: "X", starts_at: "2026-08-01T00:00:00Z" } })).status === 403, "members can't create events");

  section("leader invites + event creation");
  const invite = await call("POST", "/invites", { cookie: leader, body: { email: "friend@gmail.com" } });
  ok(invite.json.link, "invite produces a magic link");
  const friend = await signIn("friend@gmail.com");
  ok((await call("GET", "/me", { cookie: friend })).json.user.role === "member", "invited outsider can sign in");
  const created = await call("POST", "/events", { cookie: leader, body: { title: "Test Night", starts_at: "2026-07-04T19:00:00Z", location: "The Quad" } });
  ok(created.status === 200 && created.json.event.slug === "test-night", "leader creates an event");

  section("banning");
  const sid = me1.json.user.id;
  ok((await call("POST", `/mod/users/${sid}/ban`, { cookie: leader })).status === 200, "leader bans a user");
  ok((await call("GET", "/me", { cookie: student })).json.user === null, "banned user is signed out");
  ok((await call("POST", `/threads/${tid}/posts`, { cookie: student, body: { body: "hi" } })).status === 401, "banned user can't post");

  console.log(`\n${fail ? "✗" : "✓"} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

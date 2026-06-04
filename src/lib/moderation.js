// Moderation: a banned-word gate that routes flagged content to a leaders-only
// review queue, plus the leader actions (approve / reject / terms / ban).
import { json, clean, sameOrigin } from "./util.js";

const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i" };

// Fold leetspeak and strip non-alphanumerics so simple evasions still match.
function normalize(text) {
  const lowered = (text || "").toLowerCase().replace(/[0134578@$!]/g, (c) => LEET[c] || c);
  return lowered.replace(/[^a-z0-9]+/g, ""); // spaceless: catches "f u c k", "f.u.c.k"
}

export function normalizeTerm(term) {
  return normalize(term);
}

// Returns the list of original banned terms found in the text.
export function scanText(text, terms) {
  const haystack = normalize(text);
  if (!haystack) return [];
  const hits = [];
  for (const t of terms) {
    const needle = normalize(t.term);
    if (needle.length >= 3 && haystack.includes(needle)) hits.push(t.term);
  }
  return hits;
}

/* ------------------------------- leader actions ------------------------------- */

// GET /mod/queue
export async function queue(request, env, db) {
  const items = await db.pendingQueue();
  return json({
    items: items.map((p) => ({
      id: p.id,
      body: p.body,
      flagged_terms: p.flagged_terms ? p.flagged_terms.split(",") : [],
      created_at: p.created_at,
      author_name: p.author_name,
      author_id: p.author_id,
      event_slug: p.event_slug,
      event_title: p.event_title,
    })),
  });
}

// POST /mod/posts/:id/approve
export async function approve(request, env, db, postId, actor) {
  if (!sameOrigin(request)) return json({ error: "Bad origin." }, 403);
  const post = await db.getPostById(postId);
  if (!post) return json({ error: "Not found." }, 404);
  if (post.status !== "pending") return json({ error: "That post isn't pending." }, 409);
  await db.approvePost(post.id);
  await db.logMod({ target_type: "post", target_id: post.id, action: "approve", moderator_id: actor.id });
  return json({ ok: true });
}

// POST /mod/posts/:id/reject { reason }
export async function reject(request, env, db, postId, actor) {
  if (!sameOrigin(request)) return json({ error: "Bad origin." }, 403);
  let data = {};
  try { data = await request.json(); } catch { /* reason optional */ }
  const post = await db.getPostById(postId);
  if (!post) return json({ error: "Not found." }, 404);
  await db.rejectPost(post, actor.id);
  await db.logMod({ target_type: "post", target_id: post.id, action: "reject", moderator_id: actor.id, reason: clean(data.reason, 500) });
  return json({ ok: true });
}

// GET /mod/terms
export async function listTerms(env, db) {
  const terms = await db.listTerms();
  return json({ terms: terms.map((t) => ({ id: t.id, term: t.term })) });
}

// POST /mod/terms { term }
export async function addTerm(request, env, db, actor) {
  if (!sameOrigin(request)) return json({ error: "Bad origin." }, 403);
  let data;
  try { data = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const term = clean(data.term, 60).toLowerCase();
  if (!term) return json({ error: "Enter a word to ban." }, 422);
  const tid = await db.addTerm(term, actor.id);
  await db.logMod({ target_type: "term", target_id: tid, action: "term_add", moderator_id: actor.id, reason: term });
  return json({ ok: true });
}

// DELETE /mod/terms/:id
export async function deleteTerm(request, env, db, termId, actor) {
  if (!sameOrigin(request)) return json({ error: "Bad origin." }, 403);
  await db.deleteTerm(termId);
  await db.logMod({ target_type: "term", target_id: termId, action: "term_remove", moderator_id: actor.id });
  return json({ ok: true });
}

// POST /mod/users/:id/ban
export async function banUser(request, env, db, userId, actor) {
  if (!sameOrigin(request)) return json({ error: "Bad origin." }, 403);
  if (userId === actor.id) return json({ error: "You can't ban yourself." }, 422);
  const target = await db.getUserById(userId);
  if (!target) return json({ error: "Not found." }, 404);
  await db.banUser(userId, actor.id);
  await db.logMod({ target_type: "user", target_id: userId, action: "ban", moderator_id: actor.id });
  return json({ ok: true });
}

// POST /reports { target_type, target_id, reason } — any signed-in member.
export async function createReport(request, env, db, user) {
  if (!sameOrigin(request)) return json({ error: "Bad origin." }, 403);
  let data;
  try { data = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const target_type = clean(data.target_type, 20) || "post";
  const target_id = clean(data.target_id, 80);
  if (!target_id) return json({ error: "Nothing to report." }, 422);
  await db.createReport({ reporter_id: user.id, target_type, target_id, reason: clean(data.reason, 500) });
  return json({ ok: true, message: "Thanks — a leader will take a look." });
}

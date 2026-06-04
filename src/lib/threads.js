// Event discussion: one thread per event (started on demand by any member),
// with posts that pass through the banned-word gate.
import { json, clean, sameOrigin, isoIn } from "./util.js";
import { scanText } from "./moderation.js";

const POST_MAX = 4000;
const RATE_WINDOW = 60;   // seconds
const RATE_MAX = 6;       // posts per window

function postView(p, viewer, isLeader) {
  return {
    id: p.id,
    body: p.body,
    status: p.status,
    created_at: p.created_at,
    author_name: p.author_name,
    author_role: p.author_role,
    is_mine: p.author_id === viewer.id,
  };
}

// POST /events/:slug/thread — start (or return) the event's thread.
export async function startThread(request, env, db, slug, user) {
  if (!sameOrigin(request)) return json({ error: "Bad origin." }, 403);
  const event = await db.getEventBySlug(slug);
  if (!event) return json({ error: "Event not found." }, 404);
  let thread = await db.getThreadByEvent(event.id);
  if (!thread) thread = await db.createThread(event.id, user.id);
  return json({ ok: true, thread: { id: thread.id } });
}

// GET /threads/:id — the thread's posts (published for all; own pending for the
// author; everything for leaders).
export async function getThread(request, env, db, threadId, user) {
  const thread = await db.getThreadById(threadId);
  if (!thread) return json({ error: "Thread not found." }, 404);
  const event = await db.getEventById(thread.event_id);
  const isLeader = user.role === "leader";
  const all = await db.listThreadPosts(threadId);
  const visible = all.filter((p) => p.status === "published" || isLeader || p.author_id === user.id);
  return json({
    thread: { id: thread.id },
    event: event ? { slug: event.slug, title: event.title, starts_at: event.starts_at, location: event.location } : null,
    posts: visible.map((p) => postView(p, user, isLeader)),
  });
}

// POST /threads/:id/posts { body }
export async function createPost(request, env, db, threadId, user) {
  if (!sameOrigin(request)) return json({ error: "Bad origin." }, 403);
  const thread = await db.getThreadById(threadId);
  if (!thread) return json({ error: "Thread not found." }, 404);

  let data;
  try { data = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const body = clean(data.body, POST_MAX);
  if (!body) return json({ error: "Write something first.", fields: { body: true } }, 422);

  // Light rate limit.
  const recent = await db.countRecentPosts(user.id, isoIn(-RATE_WINDOW));
  if (recent >= RATE_MAX) return json({ error: "You're posting quickly — give it a moment." }, 429);

  const terms = await db.listTerms();
  const hits = scanText(body, terms);
  const status = hits.length ? "pending" : "published";
  const post = await db.createPost({
    thread_id: threadId,
    author_id: user.id,
    body,
    status,
    flagged_terms: hits.length ? hits.join(",") : null,
  });

  return json({
    ok: true,
    pending: status === "pending",
    message: status === "pending"
      ? "Thanks! A leader will review this before it appears."
      : "Posted.",
    post: { id: post.id, body: post.body, status: post.status, created_at: post.created_at, author_name: user.display_name, author_role: user.role, is_mine: true },
  });
}

// Calendar events: public reads (power the calendar grid + detail), plus
// leader-only create/edit/delete.
import { json, clean, sameOrigin, id } from "./util.js";

function publicEvent(e) {
  return {
    slug: e.slug,
    title: e.title,
    description: e.description || null,
    location: e.location || null,
    url: e.url || null,
    starts_at: e.starts_at,
    ends_at: e.ends_at || null,
    all_day: !!e.all_day,
  };
}

function slugify(s) {
  return clean(s, 80).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function validDate(s) {
  return typeof s === "string" && s.length > 0 && !Number.isNaN(Date.parse(s));
}

// GET /events?from=ISO&to=ISO  (public)
export async function listEvents(request, env, db) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const range = validDate(from) && validDate(to) ? { from, to } : {};
  const events = await db.listEvents(range);
  return json({ events: events.map(publicEvent) });
}

// GET /events/:slug  (public) — includes whether a discussion thread exists.
export async function getEvent(request, env, db, slug, user) {
  const e = await db.getEventBySlug(slug);
  if (!e) return json({ error: "Event not found." }, 404);
  const thread = await db.getThreadByEvent(e.id);
  const posts_count = thread ? await db.countPublishedPosts(thread.id) : 0;
  return json({
    event: publicEvent(e),
    thread: thread ? { id: thread.id } : null,
    posts_count,
    can_discuss: !!user,
  });
}

/* ------------------------------- leader CRUD ------------------------------- */

// POST /events { title, starts_at, ... }
export async function createEvent(request, env, db, actor) {
  if (!sameOrigin(request)) return json({ error: "Bad origin." }, 403);
  let data;
  try { data = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }

  const title = clean(data.title, 120);
  if (!title) return json({ error: "A title is required.", fields: { title: true } }, 422);
  if (!validDate(data.starts_at)) return json({ error: "A valid start date/time is required.", fields: { starts_at: true } }, 422);
  if (data.ends_at && !validDate(data.ends_at)) return json({ error: "End date/time is invalid.", fields: { ends_at: true } }, 422);

  let slug = data.slug ? slugify(data.slug) : slugify(title);
  if (!slug) slug = "event";
  if (await db.getEventBySlug(slug)) slug = `${slug}-${id("x").slice(2, 8)}`;

  const event = await db.createEvent({
    slug,
    title,
    description: clean(data.description, 4000) || null,
    location: clean(data.location, 200) || null,
    url: clean(data.url, 400) || null,
    starts_at: data.starts_at,
    ends_at: data.ends_at || null,
    all_day: !!data.all_day,
    created_by: actor.id,
  });
  return json({ ok: true, event: publicEvent(event) });
}

// PATCH /events/:slug
export async function updateEvent(request, env, db, slug, actor) {
  if (!sameOrigin(request)) return json({ error: "Bad origin." }, 403);
  const existing = await db.getEventBySlug(slug);
  if (!existing) return json({ error: "Event not found." }, 404);
  let data;
  try { data = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }

  const fields = {};
  if (data.title !== undefined) {
    const t = clean(data.title, 120);
    if (!t) return json({ error: "Title can't be empty." }, 422);
    fields.title = t;
  }
  if (data.description !== undefined) fields.description = clean(data.description, 4000) || null;
  if (data.location !== undefined) fields.location = clean(data.location, 200) || null;
  if (data.url !== undefined) fields.url = clean(data.url, 400) || null;
  if (data.starts_at !== undefined) {
    if (!validDate(data.starts_at)) return json({ error: "Start date/time is invalid." }, 422);
    fields.starts_at = data.starts_at;
  }
  if (data.ends_at !== undefined) {
    if (data.ends_at && !validDate(data.ends_at)) return json({ error: "End date/time is invalid." }, 422);
    fields.ends_at = data.ends_at || null;
  }
  if (data.all_day !== undefined) fields.all_day = !!data.all_day;

  const event = await db.updateEvent(slug, fields);
  return json({ ok: true, event: publicEvent(event) });
}

// DELETE /events/:slug
export async function deleteEvent(request, env, db, slug, actor) {
  if (!sameOrigin(request)) return json({ error: "Bad origin." }, 403);
  const ok = await db.deleteEvent(slug);
  if (!ok) return json({ error: "Event not found." }, 404);
  return json({ ok: true });
}

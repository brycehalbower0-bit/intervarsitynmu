# Plan: Event discussion forum + direct messages

A design plan for adding a community space to the InterVarsity at NMU site where
students can **talk about events** and **DM each other** if they want. This is a
much bigger build than the current static site + Resend, so this document lays
out the architecture, the safety/moderation requirements, and a phased path
before any code is written.

> Status: **proposal — not yet built.** A few decisions (below) need your input
> first. Nothing here changes the live site.

---

## 1. Why this is a big step (and what changes)

Today the site is **static assets + a tiny Worker API** (contact + newsletter).
It has no users, no database, and no persistent state beyond optional KV logging.

A forum with DMs is a small **social application**. It needs, at minimum:

- **Identity** — accounts so posts/messages belong to someone.
- **A database** — to store users, posts, comments, and messages.
- **Authorization** — who can read, post, and DM whom.
- **Moderation & safety** — reporting, blocking, admin tools, rate limits.
- **(For live DMs) realtime** — websockets so messages arrive without refresh.

The good news: all of this fits on the **Cloudflare stack** you already deploy
to, so we stay in one platform and one `wrangler deploy`.

---

## 2. Proposed architecture (Cloudflare-native)

| Concern | Proposed tool | Notes |
| --- | --- | --- |
| App/API | **Workers** (extend `src/index.js`, or split into modules) | Same project. |
| Auth | **Magic-link email** via Resend + signed session cookies | Passwordless; reuses Resend. No passwords to store. |
| Database | **Cloudflare D1** (SQLite) | Users, posts, comments, reports, conversations, messages. |
| Live DMs | **Durable Objects** (one per conversation) + WebSocket | Add in a later phase; start with simple polling. |
| Rate limiting | **KV** or a Durable Object counter | Anti-spam/abuse. |
| Media (optional) | **R2** | Defer — text-only first. |
| Email notifications | **Resend** | "New reply", "new DM", weekly digest. |

Why magic-link instead of passwords: no password storage/reset flows, low
friction for students, and it naturally verifies the email. We can optionally
**restrict sign-up to `@nmu.edu`** addresses to keep the space to the campus
community. (Alternative: Google sign-in / Cloudflare Access — see decisions.)

### Sketch data model (D1)

```sql
users(id, email, display_name, created_at, role,           -- role: member | leader | admin
      dm_opt_in, banned_at)
sessions(id, user_id, created_at, expires_at, ip_hash)
posts(id, author_id, event_key, title, body, created_at,   -- event_key ties a thread to an event
      hidden_at)
comments(id, post_id, author_id, body, created_at, hidden_at)
reports(id, reporter_id, target_type, target_id, reason, created_at, resolved_at)
blocks(blocker_id, blocked_id, created_at)                 -- for DMs
conversations(id, user_a, user_b, created_at)              -- 1:1 DM
messages(id, conversation_id, sender_id, body, created_at, read_at)
```

---

## 3. Safety & moderation (non-negotiable)

A student community with public posts **and private DMs** carries real
responsibility. Before launch we need:

- **Roles** — `member`, `leader`, `admin`. Leaders/admins can hide posts,
  remove comments, and resolve reports.
- **Reporting** — every post, comment, and DM has a "report" action that lands
  in a moderation queue.
- **Blocking** — users can block another user; blocks prevent DMs and hide
  content both ways.
- **DMs are opt-in** — users choose whether they're reachable by DM, and from
  whom (e.g. "anyone" vs "leaders only"). Default to a conservative setting.
- **Rate limits** — per-user posting/messaging caps to stop spam and abuse.
- **Email verification** — guaranteed by magic-link sign-in.
- **Audit log** — record moderation actions.
- **Consent & privacy** — a short community-guidelines + privacy notice at
  sign-up; the ability to delete your account and data; never expose emails to
  other users. Confirm any **safeguarding** requirements with InterVarsity
  staff, especially if any participants may be minors.
- **Abuse tooling for DMs specifically** — report + block are the front line;
  consider keeping a minimal retention window so reported messages can be
  reviewed.

These requirements are a big part of why this is "plan first."

---

## 4. Phased delivery

Each phase is shippable on its own; we stop/adjust between phases.

- **Phase 0 — Decisions & scaffolding.** Settle the open questions below; add D1
  + a `/api` module structure; community guidelines + privacy copy.
- **Phase 1 — Accounts.** Magic-link sign-in (Resend), sessions, profile
  (display name, DM opt-in). No content yet.
- **Phase 2 — Event discussion.** Threads tied to events (`event_key`), posts +
  comments, with moderation basics: roles, report, hide/remove, rate limits.
  This delivers the "talk about events" goal first.
- **Phase 3 — Direct messages.** 1:1 DMs with block + report. Start with
  request/response (poll for new messages), then upgrade to **Durable Object
  WebSockets** for live delivery.
- **Phase 4 — Polish.** Email notifications/digests (Resend), optional images
  (R2), search, and a leader moderation dashboard.

Rough effort: Phases 1–2 are the bulk of a forum; Phase 3 (esp. realtime) and
Phase 4 add meaningful additional work. We can scope tighter once decisions are
locked.

---

## 5. Open decisions (need your input)

1. **Who can join / post?** Anyone with an email, or **restrict to `@nmu.edu`**?
2. **Sign-in method:** magic-link email (recommended), Google sign-in, or
   Cloudflare Access?
3. **DM scope:** everyone-to-everyone (opt-in), **mutual-connection only**, or
   "students can DM leaders" to start?
4. **Who moderates?** Which staff/student leaders own the moderation queue?
5. **Anonymity:** real display names required, or pseudonyms allowed?
6. **Data retention:** how long do we keep DMs / removed content for safety
   review?
7. **Start scope:** ship **Phase 2 (event discussion) first** and treat DMs as a
   follow-up? (Recommended — delivers value fast and keeps the risky realtime +
   private-messaging work as a deliberate second step.)

Once you've weighed in on these, I'll turn the chosen path into a concrete
implementation plan (schema migrations, endpoints, UI) and we can start Phase 1.

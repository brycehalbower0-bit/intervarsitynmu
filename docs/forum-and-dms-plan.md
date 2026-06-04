# Plan: Event discussion forum + direct messages

A design + implementation plan for a community space on the InterVarsity at NMU
site where students **talk about events** and (later) **DM each other**. This is
a much bigger build than the current static site + Resend, so this document is
the source of truth before code is written.

> Status: **decisions locked (see §1). Not yet built.** Event discussion is the
> priority; DMs are a deliberate later phase.

---

## 1. Decisions (locked in)

| Question | Decision |
| --- | --- |
| **Who can join/post** | Restricted to **`@nmu.edu`** (self-serve). Outsiders can join **only via a magic-link invite issued by a leader**. |
| **Sign-in** | **Magic-link email** (passwordless), sent via Resend. Same mechanism powers leader invites. |
| **DMs** | Everyone-to-everyone, **opt-in**. Low priority, minimal UI — a later phase, not a headline feature. |
| **Moderation** | **Staff leaders** own the queue, backed by a **banned-word list**. |
| **Display names** | **Real display names required** (no pseudonyms). |
| **Flagged content** | If a post/comment hits the word list it goes into a **pending state visible only to leaders**. Leader **approves** → it publishes. Leader **rejects** → it's **archived (off the live site) and removed**. |
| **Events & calendar** | A new **Calendar** nav page shows chapter events as a month grid; clicking an event opens its details + a link to its thread (or to start one). Events are leader-managed (seeded from the current Events section). |
| **Threads** | **One thread per event, started on demand by any signed-in member;** others read and reply once it exists. |
| **Start scope** | **Calendar + event discussion first.** DMs follow later. |

---

## 2. Architecture (Cloudflare-native)

Stays in your existing project — one `wrangler deploy`.

| Concern | Tool | Notes |
| --- | --- | --- |
| App/API | **Workers** — new `/api/community/*` routes (split `src/` into modules) | Same project. |
| Auth | **Magic-link email** (Resend) + signed **HttpOnly** session cookie | No passwords. Email is verified by construction. |
| Database | **Cloudflare D1** (SQLite) | Users, sessions, invites, posts, comments, moderation. |
| Anti-spam / token + session cleanup | **Workers Cron Trigger** | Purge expired tokens/sessions. |
| Live DMs (Phase 3) | Start with **polling** (usage is low); upgrade to Durable Objects only if needed | Avoid realtime complexity up front. |
| Media (optional, later) | **R2** | Text-only to start. |

### Bindings / secrets to add (when we build)

- `DB` — D1 database binding.
- `SESSION_SECRET` — HMAC key for signing session cookies (`wrangler secret put`).
- `RESEND_API_KEY` — already used; also sends magic links.
- `COMMUNITY_FROM` — verified Resend sender (e.g. `community@…`).
- `SITE_URL` — base URL for building magic links.
- `LEADER_EMAILS` — comma-separated bootstrap leaders (auto-granted `leader` on
  first sign-in; they can then promote others).

---

## 3. Auth & membership flow

**Sign in (magic link):**
1. User enters their email on the community sign-in.
2. Worker accepts it **only if** the address ends in `@nmu.edu` **or** there is a
   valid, unexpired **invite** for it. Otherwise: "Ask a chapter leader for an
   invite."
3. Worker stores a hashed one-time token (`login_tokens`) and emails a link:
   `…/api/community/auth/verify?token=…` (15-min expiry, single use).
4. Clicking it verifies the token, creates/loads the `users` row, sets a signed
   session cookie (HttpOnly, Secure, SameSite=Lax, ~30-day sliding), and
   redirects in.
5. **First sign-in requires setting a display name** before posting.

**Leader invites (outsiders):** a leader enters an email → Worker writes an
`invites` row and emails that person a magic link. That address is now allowed
to sign in. Invites expire and are single-use.

**Roles:** `member` (default) and `leader`. Leaders moderate, manage the word
list, issue invites, and ban users. `LEADER_EMAILS` seeds the first leaders.

---

## 4. Data model (D1)

```sql
users(id, email UNIQUE, display_name, role,            -- role: member | leader
      dm_opt_in, created_at, banned_at, banned_by)
login_tokens(id, email, token_hash, created_at, expires_at, used_at)
invites(id, email, token_hash, invited_by, created_at, expires_at, used_at)
sessions(id, user_id, created_at, expires_at)

events(id, slug UNIQUE, title, description, location, url,        -- the chapter calendar
       starts_at, ends_at, all_day, created_by, created_at)      -- leader-managed
threads(id, event_id UNIQUE, started_by, created_at)             -- one per event, on demand
posts(id, thread_id, author_id, body, status,                    -- status: published | pending
      flagged_terms, created_at)

banned_terms(id, term UNIQUE, created_by, created_at)
moderation_log(id, target_type, target_id, action,     -- action: approve | reject | ban | …
               moderator_id, reason, created_at)
archived_content(id, original_type, original_id, author_id, body,
                 flagged_terms, rejected_by, rejected_at)   -- rejected items, off the live site
reports(id, reporter_id, target_type, target_id, reason, created_at, resolved_at, resolved_by)
```

*Events source:* `events` is leader-managed, seeded from the current Events
section, and is the single source for the **Calendar** page. A **thread** is
created the first time a member starts discussing an event (one per event);
replies are `posts`. (The static homepage Events section can later read from the
same table — optional.)

---

## 5. Moderation (word-list → leader review)

1. **On submit**, the server normalizes the text (lowercase, collapse
   punctuation/spacing, basic leet folding) and scans for `banned_terms`.
2. **Match → `status = pending`**, `flagged_terms` recorded. The author sees
   "pending review"; everyone else doesn't see it. It appears in the leaders'
   queue.
3. **No match → `status = published`** immediately.
4. **Leader queue:** approve → `published`; reject → copy to `archived_content`,
   delete from `posts`/`comments` (off the live site), and log the action.
5. **Reports** (user-flagged content) land in the same queue — planned as a fast
   follow once event discussion is live.

The word list is a blunt tool (false positives/evasion), which is exactly why
flagged items go to **human review** rather than auto-deleting, and why a report
button is the planned backstop.

---

## 6. Endpoints (`/api/community/*`)

Public/auth:
- `POST /auth/start` `{ email }` → validate eligibility, email magic link.
- `GET  /auth/verify?token=…` → set session, redirect.
- `POST /auth/logout`.
- `GET  /me` → current user; `POST /me` `{ display_name, dm_opt_in }`.

Calendar & events (public read):
- `GET  /events?from=…&to=…` → events in a date range (powers the calendar grid).
- `GET  /events/:slug` → one event's details (+ whether a thread exists).

Event discussion (auth):
- `POST /events/:slug/thread` → start the event's thread (idempotent — returns
  the existing one if a member already started it).
- `GET  /threads/:id` → the thread's published posts (+ the viewer's own pending).
- `POST /threads/:id/posts` `{ body }` → reply (word-list gate).
- `POST /reports` `{ target_type, target_id, reason }` → flag (fast follow).

Leader-only:
- `POST /invites` `{ email }` → invite an outsider.
- `GET  /mod/queue` → pending posts (+ reports).
- `POST /mod/:type/:id/approve` · `POST /mod/:type/:id/reject` `{ reason }`.
- `GET/POST/DELETE /mod/terms` → manage the banned-word list.
- `POST /mod/users/:id/ban`.
- `POST/PATCH/DELETE /events` → create/edit/remove calendar events.

All authenticated routes check the session cookie; leader routes additionally
require `role = leader`. Posting/messaging is rate-limited per user.

---

## 7. UI

A new community area styled with the existing `main.css` tokens/components
(vanilla JS, no framework — consistent with the current site):

- **Sign-in** — email field → "check your inbox" state.
- **Profile** — set/edit display name; DM opt-in toggle (off by default).
- **Calendar** (new nav entry, public) — a month-grid calendar of chapter events
  with prev/next navigation. Click an event → details.
- **Event details** — date/time, location, description, and either "Join the
  discussion" (opens the thread) or "Start the discussion" if none exists yet.
- **Thread** — the event's posts/replies, with a composer and a "pending review"
  affordance for flagged content.
- **Profile** — set/edit display name; DM opt-in toggle (off by default).
- **Leader area** — event management, invite form, moderation queue
  (approve/reject), word-list editor, ban control. Visible only to leaders.
- Nav entries: **"Calendar"** (public) and **"Community"** (prompts sign-in when
  logged out). The calendar is viewable by anyone; starting/replying to a thread
  requires an account.

DMs (Phase 3) get a small, deliberately minimal "Messages" entry — opt-in, 1:1,
with report/block and the same word-list gate.

---

## 8. Build order

- **Phase 1 — Accounts & auth.** D1 schema + migrations; magic-link sign-in
  (`@nmu.edu` + invites); sessions; required display name; `LEADER_EMAILS`
  bootstrap; leader invite endpoint; sign-in + profile UI; cron cleanup.
- **Phase 2 — Calendar + event discussion + moderation (the priority).** The
  public **Calendar** page and event details; leader event management (seeded
  from the current Events); on-demand **threads** (any member starts one per
  event) with posts; word-list gate → pending/leader-only; leader queue
  (approve / reject→archive); banned-terms management; ban. The calendar +
  event details are public and can land first; threads/moderation need accounts.
  Add the report button here or immediately after.
- **Phase 3 — DMs (minimal).** Opt-in 1:1 messages via polling; report/block;
  word-list gate; small UI. Only if/when wanted.

Each phase ships on its own; we review between phases.

---

## 9. Risks & notes

- **Email deliverability** — Resend domain verification is required for magic
  links to land (and not spam-folder).
- **Word-list limits** — expect false positives (handled by leader approval) and
  evasion (handled by the report backstop); not a content-safety guarantee.
- **Safeguarding** — confirm any InterVarsity policy needs with staff,
  especially if minors may participate, before enabling DMs.
- **Scope** — Phases 1–2 are the bulk of a real forum; this is multi-session
  work, but it's all on the Cloudflare stack you already deploy to.

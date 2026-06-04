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
| **Start scope** | **Event discussion first.** DMs follow later. |

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

events(id, slug UNIQUE, title, starts_at, location, created_at)  -- threads attach here
posts(id, event_id, author_id, body, status,           -- status: published | pending
      flagged_terms, created_at)
comments(id, post_id, author_id, body, status, flagged_terms, created_at)

banned_terms(id, term UNIQUE, created_by, created_at)
moderation_log(id, target_type, target_id, action,     -- action: approve | reject | ban | …
               moderator_id, reason, created_at)
archived_content(id, original_type, original_id, author_id, body,
                 flagged_terms, rejected_by, rejected_at)   -- rejected items, off the live site
reports(id, reporter_id, target_type, target_id, reason, created_at, resolved_at, resolved_by)
```

*Events source:* seed `events` from the current static Events section and let
leaders add/edit them, so each discussion thread has a stable `slug`. (Default
unless you'd rather make the public Events section fully dynamic too.)

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

Event discussion:
- `GET  /events` → events + thread/post counts.
- `GET  /events/:slug/posts` → published posts (+ the viewer's own pending).
- `POST /events/:slug/posts` `{ body }` → create (word-list gate).
- `POST /posts/:id/comments` `{ body }` → create comment (word-list gate).
- `POST /reports` `{ target_type, target_id, reason }` → flag (fast follow).

Leader-only:
- `POST /invites` `{ email }` → invite an outsider.
- `GET  /mod/queue` → pending posts/comments (+ reports).
- `POST /mod/:type/:id/approve` · `POST /mod/:type/:id/reject` `{ reason }`.
- `GET/POST/DELETE /mod/terms` → manage the banned-word list.
- `POST /mod/users/:id/ban`.

All authenticated routes check the session cookie; leader routes additionally
require `role = leader`. Posting/messaging is rate-limited per user.

---

## 7. UI

A new community area styled with the existing `main.css` tokens/components
(vanilla JS, no framework — consistent with the current site):

- **Sign-in** — email field → "check your inbox" state.
- **Profile** — set/edit display name; DM opt-in toggle (off by default).
- **Events list** — cards linking into each event's thread.
- **Thread** — posts + comments, composer with a "pending review" affordance.
- **Leader area** — invite form, moderation queue (approve/reject), word-list
  editor, ban control. Visible only to leaders.
- A **"Community"** nav entry (prompts sign-in when logged out).

DMs (Phase 3) get a small, deliberately minimal "Messages" entry — opt-in, 1:1,
with report/block and the same word-list gate.

---

## 8. Build order

- **Phase 1 — Accounts & auth.** D1 schema + migrations; magic-link sign-in
  (`@nmu.edu` + invites); sessions; required display name; `LEADER_EMAILS`
  bootstrap; leader invite endpoint; sign-in + profile UI; cron cleanup.
- **Phase 2 — Event discussion + moderation (the priority).** Events, posts,
  comments; word-list gate → pending/leader-only; leader queue
  (approve / reject→archive); banned-terms management; ban; thread UI. Add the
  report button here or immediately after.
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

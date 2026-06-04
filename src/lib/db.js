// D1 data-access layer. Every query the community API needs lives here, so the
// handlers stay readable and the SQL is testable in one place.
import { id, nowISO, randomToken } from "./util.js";

export class Db {
  constructor(d1) {
    this.d1 = d1;
  }

  /* ----------------------------- users ----------------------------- */
  getUserByEmail(email) {
    return this.d1.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  }
  getUserById(uid) {
    return this.d1.prepare("SELECT * FROM users WHERE id = ?").bind(uid).first();
  }
  async createUser({ email, role = "member" }) {
    const uid = id("usr");
    await this.d1
      .prepare("INSERT INTO users (id,email,display_name,role,dm_opt_in,created_at) VALUES (?,?,?,?,0,?)")
      .bind(uid, email, null, role, nowISO())
      .run();
    return this.getUserById(uid);
  }
  async setUserRole(uid, role) {
    await this.d1.prepare("UPDATE users SET role=? WHERE id=?").bind(role, uid).run();
  }
  async updateProfile(uid, { display_name, dm_opt_in }) {
    await this.d1
      .prepare("UPDATE users SET display_name=?, dm_opt_in=? WHERE id=?")
      .bind(display_name, dm_opt_in ? 1 : 0, uid)
      .run();
    return this.getUserById(uid);
  }
  async banUser(uid, byId) {
    await this.d1.prepare("UPDATE users SET banned_at=?, banned_by=? WHERE id=?").bind(nowISO(), byId, uid).run();
  }

  /* ----------------------------- tokens ----------------------------- */
  async createLoginToken({ email, token_hash, kind = "login", expires_at }) {
    const tid = id("tok");
    await this.d1
      .prepare("INSERT INTO login_tokens (id,email,token_hash,kind,created_at,expires_at) VALUES (?,?,?,?,?,?)")
      .bind(tid, email, token_hash, kind, nowISO(), expires_at)
      .run();
    return tid;
  }
  findValidToken(token_hash) {
    return this.d1
      .prepare("SELECT * FROM login_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at > ? LIMIT 1")
      .bind(token_hash, nowISO())
      .first();
  }
  async useToken(tid) {
    await this.d1.prepare("UPDATE login_tokens SET used_at=? WHERE id=?").bind(nowISO(), tid).run();
  }

  /* ----------------------------- invites ----------------------------- */
  async createInvite({ email, invited_by, expires_at }) {
    const iid = id("inv");
    await this.d1
      .prepare("INSERT INTO invites (id,email,invited_by,created_at,expires_at) VALUES (?,?,?,?,?)")
      .bind(iid, email, invited_by, nowISO(), expires_at)
      .run();
    return iid;
  }
  pendingInvite(email) {
    return this.d1
      .prepare("SELECT * FROM invites WHERE email=? AND used_at IS NULL AND expires_at > ? LIMIT 1")
      .bind(email, nowISO())
      .first();
  }
  async useInvitesFor(email) {
    await this.d1.prepare("UPDATE invites SET used_at=? WHERE email=? AND used_at IS NULL").bind(nowISO(), email).run();
  }

  /* ----------------------------- sessions ----------------------------- */
  async createSession(user_id, expires_at) {
    const sid = randomToken(32);
    await this.d1
      .prepare("INSERT INTO sessions (id,user_id,created_at,expires_at) VALUES (?,?,?,?)")
      .bind(sid, user_id, nowISO(), expires_at)
      .run();
    return sid;
  }
  getSession(sid) {
    return this.d1.prepare("SELECT * FROM sessions WHERE id=? AND expires_at > ?").bind(sid, nowISO()).first();
  }
  async deleteSession(sid) {
    await this.d1.prepare("DELETE FROM sessions WHERE id=?").bind(sid).run();
  }

  /* ----------------------------- events ----------------------------- */
  async listEvents({ from, to } = {}) {
    let res;
    if (from && to) {
      // Events overlapping [from, to).
      res = await this.d1
        .prepare("SELECT * FROM events WHERE starts_at < ? AND COALESCE(ends_at, starts_at) >= ? ORDER BY starts_at ASC")
        .bind(to, from)
        .all();
    } else {
      res = await this.d1.prepare("SELECT * FROM events ORDER BY starts_at ASC").all();
    }
    return res.results || [];
  }
  getEventBySlug(slug) {
    return this.d1.prepare("SELECT * FROM events WHERE slug=?").bind(slug).first();
  }
  getEventById(eid) {
    return this.d1.prepare("SELECT * FROM events WHERE id=?").bind(eid).first();
  }
  async createEvent(e) {
    const eid = id("evt");
    await this.d1
      .prepare(
        "INSERT INTO events (id,slug,title,description,location,url,starts_at,ends_at,all_day,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
      )
      .bind(
        eid, e.slug, e.title, e.description || null, e.location || null, e.url || null,
        e.starts_at, e.ends_at || null, e.all_day ? 1 : 0, e.created_by || null, nowISO()
      )
      .run();
    return this.getEventById(eid);
  }
  async updateEvent(slug, fields) {
    const allowed = ["title", "description", "location", "url", "starts_at", "ends_at", "all_day"];
    const sets = [];
    const vals = [];
    for (const k of allowed) {
      if (fields[k] !== undefined) {
        sets.push(`${k}=?`);
        vals.push(k === "all_day" ? (fields[k] ? 1 : 0) : fields[k]);
      }
    }
    if (sets.length) {
      vals.push(slug);
      await this.d1.prepare(`UPDATE events SET ${sets.join(", ")} WHERE slug=?`).bind(...vals).run();
    }
    return this.getEventBySlug(slug);
  }
  async deleteEvent(slug) {
    const e = await this.getEventBySlug(slug);
    if (!e) return false;
    const t = await this.getThreadByEvent(e.id);
    if (t) {
      await this.d1.prepare("DELETE FROM posts WHERE thread_id=?").bind(t.id).run();
      await this.d1.prepare("DELETE FROM threads WHERE id=?").bind(t.id).run();
    }
    await this.d1.prepare("DELETE FROM events WHERE id=?").bind(e.id).run();
    return true;
  }

  /* ----------------------------- threads ----------------------------- */
  getThreadByEvent(event_id) {
    return this.d1.prepare("SELECT * FROM threads WHERE event_id=?").bind(event_id).first();
  }
  getThreadById(tid) {
    return this.d1.prepare("SELECT * FROM threads WHERE id=?").bind(tid).first();
  }
  async createThread(event_id, started_by) {
    const tid = id("thr");
    await this.d1
      .prepare("INSERT INTO threads (id,event_id,started_by,created_at) VALUES (?,?,?,?)")
      .bind(tid, event_id, started_by, nowISO())
      .run();
    return this.getThreadById(tid);
  }

  /* ----------------------------- posts ----------------------------- */
  async createPost({ thread_id, author_id, body, status, flagged_terms }) {
    const pid = id("pst");
    await this.d1
      .prepare("INSERT INTO posts (id,thread_id,author_id,body,status,flagged_terms,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(pid, thread_id, author_id, body, status, flagged_terms || null, nowISO())
      .run();
    return this.getPostById(pid);
  }
  getPostById(pid) {
    return this.d1.prepare("SELECT * FROM posts WHERE id=?").bind(pid).first();
  }
  async listThreadPosts(thread_id) {
    const res = await this.d1
      .prepare(
        `SELECT p.id, p.thread_id, p.author_id, p.body, p.status, p.created_at,
                u.display_name AS author_name, u.role AS author_role
         FROM posts p JOIN users u ON u.id = p.author_id
         WHERE p.thread_id = ? ORDER BY p.created_at ASC`
      )
      .bind(thread_id)
      .all();
    return res.results || [];
  }
  async countPublishedPosts(thread_id) {
    const r = await this.d1
      .prepare("SELECT COUNT(*) AS n FROM posts WHERE thread_id=? AND status='published'")
      .bind(thread_id)
      .first();
    return r ? r.n : 0;
  }
  async countRecentPosts(author_id, sinceISO) {
    const r = await this.d1
      .prepare("SELECT COUNT(*) AS n FROM posts WHERE author_id=? AND created_at > ?")
      .bind(author_id, sinceISO)
      .first();
    return r ? r.n : 0;
  }
  async approvePost(pid) {
    await this.d1.prepare("UPDATE posts SET status='published', flagged_terms=NULL WHERE id=?").bind(pid).run();
  }
  async rejectPost(post, byId) {
    await this.d1
      .prepare(
        "INSERT INTO archived_content (id,original_type,original_id,author_id,body,flagged_terms,rejected_by,rejected_at) VALUES (?,?,?,?,?,?,?,?)"
      )
      .bind(id("arc"), "post", post.id, post.author_id, post.body, post.flagged_terms || null, byId, nowISO())
      .run();
    await this.d1.prepare("DELETE FROM posts WHERE id=?").bind(post.id).run();
  }
  async pendingQueue() {
    const res = await this.d1
      .prepare(
        `SELECT p.id, p.body, p.flagged_terms, p.created_at, p.thread_id,
                u.display_name AS author_name, u.id AS author_id,
                e.slug AS event_slug, e.title AS event_title
         FROM posts p
         JOIN users u ON u.id = p.author_id
         JOIN threads t ON t.id = p.thread_id
         JOIN events e ON e.id = t.event_id
         WHERE p.status='pending' ORDER BY p.created_at ASC`
      )
      .all();
    return res.results || [];
  }

  /* ----------------------------- banned terms ----------------------------- */
  async listTerms() {
    const res = await this.d1.prepare("SELECT * FROM banned_terms ORDER BY term ASC").all();
    return res.results || [];
  }
  async addTerm(term, byId) {
    const tid = id("trm");
    await this.d1
      .prepare("INSERT OR IGNORE INTO banned_terms (id,term,created_by,created_at) VALUES (?,?,?,?)")
      .bind(tid, term, byId || null, nowISO())
      .run();
    return tid;
  }
  async deleteTerm(tid) {
    await this.d1.prepare("DELETE FROM banned_terms WHERE id=?").bind(tid).run();
  }

  /* ----------------------------- moderation / reports ----------------------------- */
  async logMod({ target_type, target_id, action, moderator_id, reason }) {
    await this.d1
      .prepare("INSERT INTO moderation_log (id,target_type,target_id,action,moderator_id,reason,created_at) VALUES (?,?,?,?,?,?,?)")
      .bind(id("mlg"), target_type, target_id, action, moderator_id || null, reason || null, nowISO())
      .run();
  }
  async createReport({ reporter_id, target_type, target_id, reason }) {
    await this.d1
      .prepare("INSERT INTO reports (id,reporter_id,target_type,target_id,reason,created_at) VALUES (?,?,?,?,?,?)")
      .bind(id("rpt"), reporter_id, target_type, target_id, reason || null, nowISO())
      .run();
  }

  /* ----------------------------- maintenance ----------------------------- */
  async cleanupExpired() {
    const t = nowISO();
    await this.d1.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(t).run();
    await this.d1.prepare("DELETE FROM login_tokens WHERE expires_at <= ?").bind(t).run();
  }
}

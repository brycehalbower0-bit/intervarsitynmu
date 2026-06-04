/* Community app: magic-link sign-in, event discussions, profile, and the leader
   console. Vanilla JS; talks to /api/community. */
(function () {
  "use strict";

  var API = "/api/community";
  var app = document.getElementById("app");
  var userArea = document.getElementById("user-area");
  var modalRoot = document.getElementById("modal-root");

  var state = { me: null, view: "discussions", events: null, thread: null, pendingEvent: null };

  /* ----------------------------- helpers ----------------------------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  async function api(method, path, body) {
    var res = await fetch(API + path, {
      method: method,
      headers: body !== undefined ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    var json = {};
    try { json = await res.json(); } catch (e) {}
    return { status: res.status, ok: res.ok, json: json };
  }
  function mount(html) { app.innerHTML = html; }
  function spinner() { mount('<div class="spinner" role="status" aria-label="Loading"></div>'); }
  function fmtDate(iso, withTime) {
    var d = new Date(iso);
    var o = { weekday: "short", month: "short", day: "numeric" };
    var s = d.toLocaleDateString(undefined, o);
    if (withTime) s += " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return s;
  }
  function monthDay(iso) {
    var d = new Date(iso);
    return { mo: d.toLocaleDateString(undefined, { month: "short" }), day: d.getDate() };
  }
  function roleBadge(role) { return role === "leader" ? '<span class="role-badge leader">Leader</span>' : ""; }
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "notice info";
    t.style.cssText = "position:fixed;left:50%;bottom:1.4rem;transform:translateX(-50%);z-index:300;box-shadow:var(--shadow-md)";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  /* ----------------------------- header chip ----------------------------- */
  function renderUserArea() {
    if (state.me && !state.me.needs_name) {
      userArea.innerHTML =
        '<span class="who">' + esc(state.me.display_name) + "</span>" + roleBadge(state.me.role) +
        ' <button class="inline-link" data-action="signout">Sign out</button>';
    } else {
      userArea.innerHTML = "";
    }
  }

  /* ----------------------------- routing ----------------------------- */
  async function loadMe() {
    var r = await api("GET", "/me");
    state.me = r.json.user;
    renderUserArea();
  }
  function route() {
    if (!state.me) return renderAuth();
    if (state.me.needs_name) return renderOnboard();
    if (state.pendingEvent) { var slug = state.pendingEvent; state.pendingEvent = null; state.view = "discussions"; return openThread(slug); }
    if (state.view === "profile") return renderProfile();
    if (state.view === "leaders") return renderLeaders();
    return renderDiscussions();
  }
  function shell(inner) {
    var tabs =
      '<div class="tabs" role="tablist">' +
      tab("discussions", "Discussions") +
      tab("profile", "Profile") +
      (state.me.role === "leader" ? tab("leaders", "Leader tools") : "") +
      "</div>";
    return tabs + '<div id="view">' + inner + "</div>";
  }
  function tab(id, label) {
    return '<button class="tab' + (state.view === id ? " active" : "") + '" data-action="tab" data-tab="' + id + '" role="tab">' + label + "</button>";
  }

  /* ----------------------------- auth view ----------------------------- */
  function renderAuth() {
    mount(
      '<div class="page-head"><p class="eyebrow">You belong here</p><h1>Join the conversation</h1>' +
      "<p>Sign in to talk about events, ask questions, and stay connected with the chapter. " +
      "Use your <strong>@nmu.edu</strong> email — or the invite link a leader sent you.</p></div>" +
      '<div class="center-narrow"><div class="form-card"><form data-form="auth" novalidate>' +
      '<div class="field"><label for="auth-email">Email</label>' +
      '<input id="auth-email" name="email" type="email" autocomplete="email" required placeholder="you@nmu.edu" /></div>' +
      '<button class="btn btn--orange" type="submit" style="width:100%;justify-content:center">Send me a sign-in link</button>' +
      '<div id="form-status" style="margin-top:1rem"></div>' +
      "</form></div></div>"
    );
  }

  /* ----------------------------- onboarding ----------------------------- */
  function renderOnboard() {
    mount(
      '<div class="page-head"><p class="eyebrow">One quick thing</p><h1>Choose your display name</h1>' +
      "<p>This is how you'll show up in discussions. Real names keep things friendly and accountable.</p></div>" +
      '<div class="center-narrow"><div class="form-card"><form data-form="onboard" novalidate>' +
      '<div class="field"><label for="ob-name">Display name</label>' +
      '<input id="ob-name" name="display_name" type="text" required maxlength="50" placeholder="e.g. Sam Rivera" /></div>' +
      '<button class="btn btn--orange" type="submit" style="width:100%;justify-content:center">Continue</button>' +
      '<div id="form-status" style="margin-top:1rem"></div>' +
      "</form></div></div>"
    );
  }

  /* ----------------------------- discussions ----------------------------- */
  async function renderDiscussions() {
    if (state.thread) return renderThread();
    spinnerShell();
    if (!state.events) { var r = await api("GET", "/events"); state.events = (r.json.events || []); }
    var now = Date.now();
    var sorted = state.events.slice().sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
    var upcoming = sorted.filter(function (e) { return new Date(e.ends_at || e.starts_at) >= now; });
    var list = (upcoming.length ? upcoming : sorted);
    var rows = list.map(function (e) {
      var md = monthDay(e.starts_at);
      return '<div class="event-row">' +
        '<div class="date-chip"><span class="mo">' + esc(md.mo) + '</span><span class="day">' + md.day + "</span></div>" +
        "<div><h3>" + esc(e.title) + '</h3><p class="where">' + fmtDate(e.starts_at, !e.all_day) + (e.location ? " · " + esc(e.location) : "") + "</p></div>" +
        '<div><button class="btn btn--blue btn--sm" data-action="open-thread" data-slug="' + esc(e.slug) + '">Open discussion</button></div>' +
        "</div>";
    }).join("");
    var inner =
      '<div class="row-between" style="margin-bottom:1rem"><div><h2 style="font-size:1.3rem">Event discussions</h2>' +
      '<p class="muted">Pick an event to read or start the conversation.</p></div>' +
      '<a class="btn btn--ghost btn--sm" href="/calendar">View calendar</a></div>' +
      (rows ? '<div class="event-list">' + rows + "</div>" : '<div class="empty">No events yet.</div>');
    mount(shell(inner));
  }
  function spinnerShell() { mount(shell('<div class="spinner" role="status" aria-label="Loading"></div>')); }

  async function openThread(slug) {
    spinner();
    var started = await api("POST", "/events/" + encodeURIComponent(slug) + "/thread");
    if (!started.ok) { toast(started.json.error || "Couldn't open that discussion."); state.view = "discussions"; return route(); }
    await loadThread(started.json.thread.id);
  }
  async function loadThread(tid) {
    var r = await api("GET", "/threads/" + encodeURIComponent(tid));
    if (!r.ok) { toast(r.json.error || "Couldn't load the thread."); state.thread = null; return renderDiscussions(); }
    state.thread = { id: tid, event: r.json.event, posts: r.json.posts };
    renderThread();
  }
  function renderThread() {
    var t = state.thread, ev = t.event || {};
    var posts = t.posts.map(function (p) {
      return '<div class="post' + (p.status === "pending" ? " is-pending" : "") + '">' +
        '<div class="post-meta"><span class="author">' + esc(p.author_name || "Member") + "</span>" + roleBadge(p.author_role) +
        '<span class="when">' + fmtDate(p.created_at, true) + "</span>" +
        (p.status === "pending" ? ' <span class="badge pending">Pending review</span>' : "") + "</div>" +
        '<div class="post-body">' + esc(p.body) + "</div>" +
        (!p.is_mine ? '<div class="post-foot"><button class="inline-link" data-action="report" data-id="' + esc(p.id) + '">Report</button></div>' : "") +
        "</div>";
    }).join("");
    var inner =
      '<div class="thread-head"><div><button class="inline-link" data-action="back">← All discussions</button>' +
      "<h2 style=\"font-size:1.4rem;margin-top:.3rem\">" + esc(ev.title || "Discussion") + "</h2>" +
      '<p class="muted">' + (ev.starts_at ? fmtDate(ev.starts_at, true) : "") + (ev.location ? " · " + esc(ev.location) : "") + "</p></div></div>" +
      '<div class="posts">' + (posts || '<div class="empty">No messages yet — be the first to say something.</div>') + "</div>" +
      '<div class="composer"><form data-form="post" novalidate>' +
      '<div class="field"><label for="post-body">Add to the conversation</label>' +
      '<textarea id="post-body" name="body" required maxlength="4000" placeholder="Share a thought, a question, or a ride offer…"></textarea></div>' +
      '<div class="row-between"><p class="form-note" style="margin:0">Be kind. Posts flagged by our filter wait for a leader\'s review.</p>' +
      '<button class="btn btn--orange btn--sm" type="submit">Post</button></div>' +
      '<div id="form-status" style="margin-top:.6rem"></div></form></div>';
    mount(shell(inner));
  }

  /* ----------------------------- profile ----------------------------- */
  function renderProfile() {
    var me = state.me;
    mount(shell(
      '<div class="subpanel" style="max-width:34rem">' +
      '<h2>Your profile</h2>' +
      '<form data-form="profile" novalidate><div class="stack">' +
      '<div class="field"><label for="pf-name">Display name</label>' +
      '<input id="pf-name" name="display_name" type="text" required maxlength="50" value="' + esc(me.display_name) + '" /></div>' +
      '<label style="display:flex;gap:.6rem;align-items:center;font-weight:600;color:var(--faithful-navy)">' +
      '<input type="checkbox" name="dm_opt_in" ' + (me.dm_opt_in ? "checked" : "") + ' style="width:auto" /> ' +
      "Let other members message me directly</label>" +
      '<p class="muted" style="font-size:.85rem;margin:0">Signed in as ' + esc(me.email) + " " + roleBadge(me.role) + "</p>" +
      '<div class="row-between"><button class="btn btn--orange btn--sm" type="submit">Save</button>' +
      '<button class="btn btn--ghost btn--sm" type="button" data-action="signout">Sign out</button></div>' +
      '<div id="form-status"></div>' +
      "</div></form></div>"
    ));
  }

  /* ----------------------------- leader console ----------------------------- */
  async function renderLeaders() {
    spinnerShell();
    var q = await api("GET", "/mod/queue");
    var terms = await api("GET", "/mod/terms");
    var queue = (q.json.items || []).map(function (it) {
      var flags = it.flagged_terms.map(function (t) { return '<span class="badge">' + esc(t) + "</span>"; }).join(" ");
      return '<div class="queue-item">' +
        '<div class="post-meta"><span class="author">' + esc(it.author_name || "Member") + "</span>" +
        '<span class="when">' + fmtDate(it.created_at, true) + '</span><span class="muted" style="font-size:.82rem">· ' + esc(it.event_title || "") + "</span></div>" +
        '<div class="post-body">' + esc(it.body) + "</div>" +
        '<div class="flag-terms">' + flags + "</div>" +
        '<div class="queue-actions">' +
        '<button class="btn btn--green btn--sm" data-action="approve" data-id="' + esc(it.id) + '">Approve</button>' +
        '<button class="btn btn--danger btn--sm" data-action="reject" data-id="' + esc(it.id) + '">Reject &amp; archive</button>' +
        '<button class="btn btn--ghost btn--sm" data-action="ban" data-id="' + esc(it.author_id) + '">Ban author</button>' +
        "</div></div>";
    }).join("");
    var termChips = (terms.json.terms || []).map(function (t) {
      return '<span class="term-chip">' + esc(t.term) + '<button data-action="del-term" data-id="' + esc(t.id) + '" aria-label="Remove ' + esc(t.term) + '">✕</button></span>';
    }).join("");
    mount(shell(
      '<div class="subpanel"><h2>Moderation queue</h2>' +
      (queue || '<p class="muted">Nothing waiting — you\'re all caught up. 🎉</p>') + "</div>" +

      '<div class="subpanel"><h2>Banned words</h2>' +
      '<p class="muted" style="margin-bottom:.6rem">Posts containing these are held for review before they appear.</p>' +
      '<form data-form="add-term" style="display:flex;gap:.5rem;flex-wrap:wrap"><input name="term" type="text" maxlength="60" placeholder="add a word" style="flex:1 1 12rem;padding:.6rem .8rem;border:1.5px solid var(--gray-line);border-radius:10px" required />' +
      '<button class="btn btn--blue btn--sm" type="submit">Add</button></form>' +
      '<div class="term-list">' + (termChips || '<span class="muted">No words yet.</span>') + "</div></div>" +

      '<div class="subpanel"><h2>Invite someone</h2>' +
      '<p class="muted" style="margin-bottom:.6rem">For people without an @nmu.edu address. They\'ll get a magic link to join.</p>' +
      '<form data-form="invite" style="display:flex;gap:.5rem;flex-wrap:wrap"><input name="email" type="email" placeholder="friend@example.com" style="flex:1 1 14rem;padding:.6rem .8rem;border:1.5px solid var(--gray-line);border-radius:10px" required />' +
      '<button class="btn btn--blue btn--sm" type="submit">Send invite</button></form><div id="invite-status" style="margin-top:.6rem"></div></div>' +

      '<div class="subpanel"><h2>Add a calendar event</h2>' +
      '<form data-form="create-event"><div class="form-grid">' +
      '<div class="field full"><label for="ev-title">Title</label><input id="ev-title" name="title" type="text" maxlength="120" required /></div>' +
      '<div class="field"><label for="ev-start">Starts</label><input id="ev-start" name="starts_at" type="datetime-local" required /></div>' +
      '<div class="field"><label for="ev-end">Ends (optional)</label><input id="ev-end" name="ends_at" type="datetime-local" /></div>' +
      '<div class="field full"><label for="ev-loc">Location</label><input id="ev-loc" name="location" type="text" maxlength="200" /></div>' +
      '<div class="field full"><label for="ev-desc">Description</label><textarea id="ev-desc" name="description" maxlength="4000"></textarea></div>' +
      '</div><div class="row-between" style="margin-top:.8rem"><div id="event-status"></div>' +
      '<button class="btn btn--orange btn--sm" type="submit">Create event</button></div></form></div>'
    ));
  }

  /* ----------------------------- click handling ----------------------------- */
  app.addEventListener("click", function (e) {
    var a = e.target.closest("[data-action]");
    if (!a) return;
    var action = a.getAttribute("data-action");
    if (action === "tab") { state.view = a.getAttribute("data-tab"); state.thread = null; return route(); }
    if (action === "open-thread") return openThread(a.getAttribute("data-slug"));
    if (action === "back") { state.thread = null; return renderDiscussions(); }
    if (action === "signout") return doSignout();
    if (action === "approve") return modAction(a, "/mod/posts/" + a.getAttribute("data-id") + "/approve", "Approved.");
    if (action === "reject") return modAction(a, "/mod/posts/" + a.getAttribute("data-id") + "/reject", "Rejected and archived.", { reason: "" });
    if (action === "ban") return doBan(a.getAttribute("data-id"));
    if (action === "del-term") return delTerm(a.getAttribute("data-id"));
    if (action === "report") return doReport(a.getAttribute("data-id"));
  });
  userArea.addEventListener("click", function (e) {
    if (e.target.closest('[data-action="signout"]')) doSignout();
  });

  async function modAction(btn, path, okMsg, body) {
    btn.disabled = true;
    var r = await api("POST", path, body || {});
    if (r.ok) { toast(okMsg); renderLeaders(); }
    else { btn.disabled = false; toast(r.json.error || "That didn't work."); }
  }
  async function doBan(uid) {
    if (!confirm("Ban this member? They'll be signed out and unable to post.")) return;
    var r = await api("POST", "/mod/users/" + uid + "/ban");
    if (r.ok) { toast("Member banned."); renderLeaders(); } else toast(r.json.error || "Couldn't ban.");
  }
  async function delTerm(id) {
    var r = await api("DELETE", "/mod/terms/" + id);
    if (r.ok) renderLeaders(); else toast(r.json.error || "Couldn't remove.");
  }
  async function doReport(id) {
    var r = await api("POST", "/reports", { target_type: "post", target_id: id });
    toast(r.ok ? (r.json.message || "Reported.") : (r.json.error || "Couldn't report."));
  }
  async function doSignout() {
    await api("POST", "/auth/logout");
    state.me = null; state.thread = null; state.events = null; state.view = "discussions";
    renderUserArea();
    route();
  }

  /* ----------------------------- form handling ----------------------------- */
  app.addEventListener("submit", function (e) {
    var form = e.target.closest("[data-form]");
    if (!form) return;
    e.preventDefault();
    if (form.checkValidity && !form.checkValidity()) { form.reportValidity(); return; }
    handleForm(form.getAttribute("data-form"), form);
  });

  function statusEl(form, id) { return form.querySelector("#" + (id || "form-status")); }
  function setStatus(node, kind, msg) { if (node) { node.className = "notice " + kind; node.innerHTML = msg; } }

  async function handleForm(kind, form) {
    var btn = form.querySelector('button[type="submit"]');
    var orig = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    try {
      if (kind === "auth") {
        var r = await api("POST", "/auth/start", { email: form.email.value.trim() });
        var s = statusEl(form);
        if (!r.ok) setStatus(s, "warn", esc(r.json.error || "Something went wrong."));
        else if (r.json.eligible === false) setStatus(s, "warn", esc(r.json.message));
        else {
          var html = "✅ " + esc(r.json.message);
          if (r.json.dev && r.json.link) html += '<br><span class="devlink">Dev link: <a href="' + esc(r.json.link) + '">' + esc(r.json.link) + "</a></span>";
          setStatus(s, "info", html);
          form.reset();
        }
      } else if (kind === "onboard" || kind === "profile") {
        var body = { display_name: form.display_name.value.trim(), dm_opt_in: form.dm_opt_in ? form.dm_opt_in.checked : false };
        var pr = await api("POST", "/me", body);
        if (pr.ok) { state.me = pr.json.user; renderUserArea(); if (kind === "onboard") route(); else { toast("Saved."); } }
        else setStatus(statusEl(form), "warn", esc(pr.json.error || "Couldn't save."));
      } else if (kind === "post") {
        var pp = await api("POST", "/threads/" + state.thread.id + "/posts", { body: form.body.value.trim() });
        if (pp.ok) { form.reset(); if (pp.json.pending) toast(pp.json.message); await loadThread(state.thread.id); }
        else setStatus(statusEl(form), "warn", esc(pp.json.error || "Couldn't post."));
      } else if (kind === "invite") {
        var iv = await api("POST", "/invites", { email: form.email.value.trim() });
        var is = statusEl(form, "invite-status");
        if (iv.ok) { var m = "✅ " + esc(iv.json.message); if (iv.json.dev && iv.json.link) m += '<br><span class="devlink">Dev link: <a href="' + esc(iv.json.link) + '">' + esc(iv.json.link) + "</a></span>"; setStatus(is, "info", m); form.reset(); }
        else setStatus(is, "warn", esc(iv.json.error || "Couldn't send invite."));
      } else if (kind === "add-term") {
        var at = await api("POST", "/mod/terms", { term: form.term.value.trim() });
        if (at.ok) renderLeaders(); else toast(at.json.error || "Couldn't add.");
      } else if (kind === "create-event") {
        var ce = await api("POST", "/events", {
          title: form.title.value.trim(),
          starts_at: form.starts_at.value,
          ends_at: form.ends_at.value || null,
          location: form.location.value.trim(),
          description: form.description.value.trim(),
        });
        var es = statusEl(form, "event-status");
        if (ce.ok) { setStatus(es, "info", "✅ Event created."); form.reset(); state.events = null; }
        else setStatus(es, "warn", esc(ce.json.error || "Couldn't create event."));
      }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }
  }

  /* ----------------------------- boot ----------------------------- */
  (function init() {
    var params = new URLSearchParams(location.search);
    if (params.get("event")) state.pendingEvent = params.get("event");
    if (params.get("error")) toastError(params.get("error"));
    loadMe().then(route);
  })();
  function toastError(code) {
    var map = { link: "That sign-in link was invalid.", expired: "That sign-in link expired — request a new one.", banned: "That account can't sign in." };
    setTimeout(function () { toast(map[code] || "Sign-in link problem."); }, 300);
  }
})();

/* Public chapter calendar. Fetches events from /api/community/events and renders
   a month grid (or an agenda list on small screens). No sign-in required. */
(function () {
  "use strict";

  var API = "/api/community";
  var root = document.getElementById("cal-root");
  var titleEl = document.getElementById("cal-title");
  var modalRoot = document.getElementById("modal-root");
  var WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  var view = new Date();
  view.setDate(1);
  var events = [];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function dayKey(d) { return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); }
  function sameYMD(a, b) { return dayKey(a) === dayKey(b); }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

  function fmtTime(ev) {
    var s = new Date(ev.starts_at);
    if (ev.all_day) {
      var opts = { weekday: "long", month: "long", day: "numeric", year: "numeric" };
      var out = s.toLocaleDateString(undefined, opts);
      if (ev.ends_at) out += " – " + new Date(ev.ends_at).toLocaleDateString(undefined, opts);
      return out + " · all day";
    }
    var date = s.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    var time = s.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (ev.ends_at) {
      var e = new Date(ev.ends_at);
      if (sameYMD(s, e)) return date + " · " + time + "–" + e.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      return date + " " + time + " → " + e.toLocaleDateString(undefined, { month: "long", day: "numeric" });
    }
    return date + " · " + time;
  }

  function eventCovers(ev, day) {
    var start = startOfDay(new Date(ev.starts_at));
    var end = ev.ends_at ? startOfDay(new Date(ev.ends_at)) : start;
    var d = startOfDay(day);
    return d >= start && d <= end;
  }
  function isMultiDay(ev) {
    if (!ev.ends_at) return false;
    return !sameYMD(new Date(ev.starts_at), new Date(ev.ends_at));
  }

  function gridBounds() {
    var first = new Date(view.getFullYear(), view.getMonth(), 1);
    var start = new Date(first);
    start.setDate(1 - first.getDay());            // back to Sunday
    var end = new Date(start);
    end.setDate(start.getDate() + 42);            // 6 weeks
    return { start: start, end: end };
  }

  function fetchMonth() {
    var b = gridBounds();
    return fetch(API + "/events?from=" + encodeURIComponent(b.start.toISOString()) + "&to=" + encodeURIComponent(b.end.toISOString()))
      .then(function (r) { return r.json(); })
      .then(function (j) { events = (j && j.events) || []; })
      .catch(function () { events = []; });
  }

  function render() {
    titleEl.textContent = view.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (window.matchMedia("(max-width: 719px)").matches) renderAgenda();
    else renderGrid();
  }

  function renderGrid() {
    var b = gridBounds();
    var today = new Date();
    var html = '<div class="cal-grid" role="grid">';
    for (var i = 0; i < 7; i++) html += '<div class="cal-dow" role="columnheader">' + WEEK[i] + "</div>";
    var d = new Date(b.start);
    for (var c = 0; c < 42; c++) {
      var outside = d.getMonth() !== view.getMonth();
      var cls = "cal-cell" + (outside ? " is-outside" : "") + (sameYMD(d, today) ? " is-today" : "");
      html += '<div class="' + cls + '" role="gridcell">';
      html += '<span class="cal-day-num">' + d.getDate() + "</span>";
      var dayEvents = events.filter(function (ev) { return eventCovers(ev, this); }, d);
      for (var k = 0; k < dayEvents.length; k++) {
        var ev = dayEvents[k];
        html += '<button class="cal-event' + (isMultiDay(ev) ? " multi" : "") + '" data-slug="' + esc(ev.slug) + '" title="' + esc(ev.title) + '">' + esc(ev.title) + "</button>";
      }
      html += "</div>";
      d = new Date(d); d.setDate(d.getDate() + 1);
    }
    html += "</div>";
    root.innerHTML = html;
  }

  function renderAgenda() {
    var monthEvents = events
      .filter(function (ev) { return new Date(ev.starts_at).getMonth() === view.getMonth() && new Date(ev.starts_at).getFullYear() === view.getFullYear(); })
      .sort(function (a, b) { return new Date(a.starts_at) - new Date(b.starts_at); });
    if (!monthEvents.length) { root.innerHTML = '<div class="empty">No events this month. Check back soon!</div>'; return; }
    var html = '<div class="agenda">';
    var lastDay = "";
    monthEvents.forEach(function (ev) {
      var s = new Date(ev.starts_at);
      var dayLabel = s.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
      if (dayLabel !== lastDay) { html += '<div class="agenda-day">' + esc(dayLabel) + "</div>"; lastDay = dayLabel; }
      html += '<button class="event-row" data-slug="' + esc(ev.slug) + '" style="cursor:pointer;text-align:left;border:1px solid var(--gray-line)">' +
        '<div><h3>' + esc(ev.title) + "</h3>" +
        '<p class="where">' + (ev.all_day ? "All day" : esc(s.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }))) +
        (ev.location ? " · " + esc(ev.location) : "") + "</p></div></button>";
    });
    html += "</div>";
    root.innerHTML = html;
  }

  /* ----- Event detail modal ----- */
  function openModal(slug) {
    fetch(API + "/events/" + encodeURIComponent(slug))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.event) return;
        var ev = j.event;
        var hasThread = !!j.thread;
        var discussLabel = hasThread ? "View the discussion (" + j.posts_count + ")" : "Start a discussion";
        var html =
          '<div class="modal-backdrop" data-close="1">' +
          '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(ev.title) + '">' +
          '<div class="modal-top"><p class="eyebrow">Event</p><h2>' + esc(ev.title) + "</h2>" +
          '<button class="modal-close" data-close="1" aria-label="Close">✕</button></div>' +
          '<div class="modal-body">' +
          '<div class="meta-line"><b>When</b><span>' + esc(fmtTime(ev)) + "</span></div>" +
          (ev.location ? '<div class="meta-line"><b>Where</b><span>' + esc(ev.location) + "</span></div>" : "") +
          (ev.description ? '<p>' + esc(ev.description) + "</p>" : "") +
          '<div class="modal-actions">' +
          '<a class="btn btn--orange" href="/community?event=' + encodeURIComponent(ev.slug) + '">' + discussLabel + ' <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></a>' +
          (ev.url ? '<a class="btn btn--ghost" href="' + esc(ev.url) + '" target="_blank" rel="noopener">More info</a>' : "") +
          "</div></div></div></div>";
        modalRoot.innerHTML = html;
        var closeBtn = modalRoot.querySelector(".modal-close");
        if (closeBtn) closeBtn.focus();
      });
  }
  function closeModal() { modalRoot.innerHTML = ""; }

  /* ----- Events ----- */
  document.getElementById("cal-prev").addEventListener("click", function () { view.setMonth(view.getMonth() - 1); reload(); });
  document.getElementById("cal-next").addEventListener("click", function () { view.setMonth(view.getMonth() + 1); reload(); });
  document.getElementById("cal-today").addEventListener("click", function () { view = new Date(); view.setDate(1); reload(); });

  root.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-slug]");
    if (btn) openModal(btn.getAttribute("data-slug"));
  });
  modalRoot.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  var resizeTimer;
  window.addEventListener("resize", function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); });

  function reload() { root.innerHTML = '<div class="spinner" role="status" aria-label="Loading"></div>'; fetchMonth().then(render); }
  reload();
})();

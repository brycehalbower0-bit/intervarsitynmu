/* InterVarsity at NMU — front-end interactions
   Vanilla JS, no dependencies. Progressive enhancement: the page works
   without this file; these touches just make it nicer. */
(function () {
  "use strict";

  var header = document.querySelector(".site-header");
  var toggle = document.querySelector(".nav-toggle");
  var navLinks = document.getElementById("nav-links");

  /* ----- Sticky header shadow on scroll ----- */
  function onScroll() {
    if (window.scrollY > 8) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ----- Mobile nav ----- */
  function closeNav() {
    navLinks.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
  }
  function openNav() {
    navLinks.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close menu");
  }
  if (toggle) {
    toggle.addEventListener("click", function () {
      if (navLinks.classList.contains("open")) closeNav();
      else openNav();
    });
  }
  // Close the menu after tapping a link, or pressing Escape.
  navLinks.addEventListener("click", function (e) {
    if (e.target.closest("a")) closeNav();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && navLinks.classList.contains("open")) {
      closeNav();
      toggle.focus();
    }
  });

  /* ----- Active link highlighting via IntersectionObserver ----- */
  var sections = Array.prototype.slice.call(document.querySelectorAll("main section[id]"));
  var linkFor = {};
  document.querySelectorAll('.nav-links a[href^="#"]').forEach(function (a) {
    linkFor[a.getAttribute("href").slice(1)] = a;
  });
  if ("IntersectionObserver" in window && sections.length) {
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var link = linkFor[entry.target.id];
          if (!link) return;
          if (entry.isIntersecting) {
            Object.keys(linkFor).forEach(function (id) { linkFor[id].classList.remove("active"); });
            link.classList.add("active");
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ----- Reveal-on-scroll ----- */
  var reveals = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("in"); });
  } else {
    var ro = new IntersectionObserver(
      function (entries, obs) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            obs.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 }
    );
    reveals.forEach(function (el) { ro.observe(el); });
  }

  /* ----- Footer year ----- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ----- Async form submit helper (contact + newsletter) ----- */
  function showStatusOn(statusEl, kind, msg) {
    statusEl.textContent = msg;
    statusEl.className = "form-status show " + kind;
  }

  function submitForm(opts) {
    var btn = opts.btnEl;
    var statusEl = opts.statusEl;
    var original = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.textContent = "Sending…";
    statusEl.className = "form-status";

    return fetch(opts.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(opts.data)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { ok: res.ok, status: res.status, body: body };
        });
      })
      .then(function (r) {
        if (r.ok) {
          opts.form.reset();
          showStatusOn(statusEl, "ok", (r.body && r.body.message) || opts.okFallback);
        } else {
          showStatusOn(statusEl, "err", (r.body && r.body.error) || "Hmm, that didn't go through. Please try again, or email nmu@intervarsity.org.");
        }
      })
      .catch(function () {
        showStatusOn(statusEl, "err", "Network hiccup. Please try again, or email nmu@intervarsity.org.");
      })
      .then(function () {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        btn.innerHTML = original;
      });
  }

  /* ----- Contact form → POST /api/contact ----- */
  var form = document.getElementById("contact-form");
  if (form) {
    var contactStatus = document.getElementById("form-status");
    var contactBtn = document.getElementById("submit-btn");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      submitForm({
        form: form,
        endpoint: "/api/contact",
        statusEl: contactStatus,
        btnEl: contactBtn,
        okFallback: "Thanks! We got your message and will be in touch soon. 🎉",
        data: {
          name: form.name.value.trim(),
          email: form.email.value.trim(),
          interest: form.interest.value,
          message: form.message.value.trim(),
          company: form.company.value // honeypot — must stay empty
        }
      });
    });
  }

  /* ----- Newsletter form → POST /api/subscribe ----- */
  var nlForm = document.getElementById("newsletter-form");
  if (nlForm) {
    var nlStatus = document.getElementById("nl-status");
    var nlBtn = document.getElementById("nl-submit");
    nlForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!nlForm.checkValidity()) { nlForm.reportValidity(); return; }
      submitForm({
        form: nlForm,
        endpoint: "/api/subscribe",
        statusEl: nlStatus,
        btnEl: nlBtn,
        okFallback: "You're on the list! Watch your inbox. 🎉",
        data: {
          email: nlForm.email.value.trim(),
          company: nlForm.company.value // honeypot — must stay empty
        }
      });
    });
  }
})();

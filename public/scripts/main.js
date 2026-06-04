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

  /* ----- Contact form → POST /api/contact ----- */
  var form = document.getElementById("contact-form");
  var status = document.getElementById("form-status");
  var submitBtn = document.getElementById("submit-btn");

  function showStatus(kind, msg) {
    status.textContent = msg;
    status.className = "form-status show " + kind;
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      // Native validation first.
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var data = {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        interest: form.interest.value,
        message: form.message.value.trim(),
        company: form.company.value // honeypot — must stay empty
      };

      var original = submitBtn.innerHTML;
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";
      status.className = "form-status";

      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(data)
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            return { ok: res.ok, status: res.status, body: body };
          });
        })
        .then(function (r) {
          if (r.ok) {
            form.reset();
            showStatus("ok", (r.body && r.body.message) || "Thanks! We got your message and will be in touch soon. 🎉");
          } else {
            showStatus("err", (r.body && r.body.error) || "Hmm, that didn't go through. Please try again, or email nmu@intervarsity.org.");
          }
        })
        .catch(function () {
          showStatus("err", "Network hiccup. Please try again, or email nmu@intervarsity.org.");
        })
        .then(function () {
          submitBtn.disabled = false;
          submitBtn.innerHTML = original;
        });
    });
  }
})();

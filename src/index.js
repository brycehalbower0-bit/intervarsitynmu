/**
 * InterVarsity at NMU — Cloudflare Worker
 *
 * This Worker fronts the static site (served from /public via the ASSETS
 * binding) and adds a small JSON API:
 *
 *   GET  /api/health   → service heartbeat
 *   POST /api/contact  → handle "get connected" form submissions
 *
 * Everything else falls through to the static assets. See wrangler.jsonc:
 * `assets.run_worker_first` routes only /api/* through this Worker; static
 * files are served directly by Cloudflare's edge.
 */

export default {
  /**
   * @param {Request} request
   * @param {{ ASSETS: Fetcher, SUBMISSIONS?: KVNamespace, NOTIFY_EMAIL?: string, RESEND_API_KEY?: string }} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "intervarsity-nmu", time: new Date().toISOString() });
    }

    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, 405, { Allow: "POST" });
      }
      return handleContact(request, env, ctx);
    }

    // Not an API route — serve the static site.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};

/* ----------------------------- handlers ----------------------------- */

async function handleContact(request, env, ctx) {
  // Basic same-origin guard (defense in depth; tighten if you embed elsewhere).
  const origin = request.headers.get("Origin");
  const host = request.headers.get("Host");
  if (origin && host && !originMatchesHost(origin, host)) {
    return json({ error: "Cross-origin requests are not allowed." }, 403);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: "Please send valid JSON." }, 400);
  }

  // Honeypot: real users never fill the hidden "company" field.
  if (typeof data.company === "string" && data.company.trim() !== "") {
    // Pretend success so bots don't learn anything.
    return json({ ok: true, message: "Thanks! We'll be in touch soon." });
  }

  const name = clean(data.name, 120);
  const email = clean(data.email, 200);
  const interest = clean(data.interest, 60) || "other";
  const message = clean(data.message, 4000);

  const errors = {};
  if (!name) errors.name = "Please tell us your name.";
  if (!email || !isEmail(email)) errors.email = "Please enter a valid email.";
  if (Object.keys(errors).length) {
    return json({ error: "Please check the highlighted fields.", fields: errors }, 422);
  }

  const submission = {
    name,
    email,
    interest,
    message,
    at: new Date().toISOString(),
    ua: request.headers.get("User-Agent") || "",
    country: request.cf && request.cf.country ? request.cf.country : "",
  };

  // Always log to the Worker tail (visible via `wrangler tail`).
  console.log("contact submission", JSON.stringify(submission));

  // OPTIONAL: persist to KV if a SUBMISSIONS namespace is bound.
  if (env.SUBMISSIONS) {
    try {
      const key = `contact:${submission.at}:${crypto.randomUUID()}`;
      await env.SUBMISSIONS.put(key, JSON.stringify(submission));
    } catch (err) {
      console.error("KV put failed", err);
    }
  }

  // OPTIONAL: email a notification via Resend if configured.
  // Set NOTIFY_EMAIL + RESEND_API_KEY as secrets (`wrangler secret put ...`).
  if (env.RESEND_API_KEY && env.NOTIFY_EMAIL) {
    ctx.waitUntil(sendNotification(env, submission));
  }

  return json({ ok: true, message: "Thanks! We got your message and will be in touch soon." });
}

async function sendNotification(env, s) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "InterVarsity NMU <onboarding@resend.dev>",
        to: [env.NOTIFY_EMAIL],
        reply_to: s.email,
        subject: `New connection: ${s.name} (${s.interest})`,
        text:
          `Name: ${s.name}\nEmail: ${s.email}\nInterested in: ${s.interest}\n` +
          `When: ${s.at}\nCountry: ${s.country}\n\nMessage:\n${s.message || "(none)"}`,
      }),
    });
    if (!res.ok) console.error("Resend error", res.status, await res.text());
  } catch (err) {
    console.error("Notification failed", err);
  }
}

/* ----------------------------- helpers ----------------------------- */

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function clean(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function isEmail(value) {
  // Pragmatic, not RFC-exhaustive.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function originMatchesHost(origin, host) {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

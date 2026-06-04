# InterVarsity at NMU — website mock-up

A brand-aligned website **mock-up** for the InterVarsity Christian Fellowship
chapter at **Northern Michigan University**, built to run as a **Cloudflare
Workers + static assets** project (what the dashboard calls "Workers & Pages").

It's a single, polished long-scroll homepage with a working "get connected"
form backed by a small Worker API. Colors, type, voice, and the open-book mark
all follow the [InterVarsity Brand Book (2026)](https://intervarsity.org/brand-glance).

> **This is a mock-up.** Names, dates, meeting times, social links, and the logo
> are **placeholders**. See [Make it yours](#make-it-yours) before launching.

---

## Quick start

```bash
npm install
npm run dev      # local dev at http://localhost:8787  (wrangler dev)
```

Deploy to Cloudflare:

```bash
npm run deploy   # wrangler deploy  (needs `npx wrangler login` once)
```

> Requires Node 18+ and a Cloudflare account. Wrangler is installed as a dev
> dependency, so `npx wrangler ...` works without a global install.

---

## What's inside

```
intervarsitynmu/
├── public/                 # static site (served from Cloudflare's edge)
│   ├── index.html          # the whole homepage (all sections)
│   ├── 404.html            # branded not-found page
│   ├── robots.txt, sitemap.xml
│   ├── styles/main.css     # brand design system (colors, type, components)
│   ├── scripts/main.js     # nav, scroll reveals, contact-form submit
│   └── assets/
│       ├── logos/          # official InterVarsity logos + cropped mark + favicons
│       ├── icons/          # official 2024 icon set (the ones the page uses)
│       ├── brand/          # concentric-circle motifs
│       └── og.png          # social share image (1200×630)
├── brand-assets/           # full official brand pack (NOT deployed) — see its README
├── tools/build-og.py       # regenerates og.png from the official logo
├── src/index.js            # Worker: serves assets + /api/contact, /api/health
├── wrangler.jsonc          # Cloudflare config (assets + worker + optional KV/email)
├── package.json
├── .dev.vars.example       # template for local secrets (copy to .dev.vars)
└── README.md
```

### How the Worker + assets fit together

- Static files in `public/` are served directly by Cloudflare's edge.
- `wrangler.jsonc` routes only `/api/*` through the Worker
  (`assets.run_worker_first`), so the marketing pages stay fast.
- The Worker exposes:
  - `GET  /api/health` — heartbeat (`{ ok: true, ... }`)
  - `POST /api/contact` — validates the form, logs it, and (optionally) saves
    to KV and/or emails you. By default it just logs to `wrangler tail`.
  - `POST /api/subscribe` — the President's newsletter opt-in. Validates the
    email and logs it (and saves to KV if bound). Set `RESEND_AUDIENCE_ID` to
    also add subscribers to a Resend audience.

---

## The brand system

Pulled straight from the Brand Book and encoded as CSS variables in
`public/styles/main.css`:

| Role | Name | Hex |
| --- | --- | --- |
| Primary | Revival Orange | `#E76127` |
| Primary | Missional Blue | `#006880` |
| Primary | Text Gray | `#333333` |
| Secondary | Fiya Gold | `#FFC60B` |
| Secondary | New Life Green | `#95C93D` |
| Secondary | Hopeful Blue | `#48C1E1` |
| Secondary | Manuscript Pink | `#D41A69` |
| Secondary | Faithful Navy | `#0B3C61` |

- **Type:** Montserrat (display — an Avenir-like geometric sans), Mulish (body),
  Zilla Slab (the "InterVarsity" wordmark, echoing the brand's Gaspo slab serif).
  Swap in licensed **Avenir LT Std** if your chapter has access.
- **Motifs:** the **"divot"** bottom border (the orange notch under the hero) and
  the **concentric circles** (community) come straight from the brand's visual
  assets.
- **Voice:** copy is conversational, hopeful, and specific, per the editorial
  guidelines (active voice, serial commas, no Christianese).

### Brand-compliance checklist (chapter website requirements, Brand Book p. 63)

- ✅ Chapter logo appears in the top four inches (header, upper-left).
- ✅ Footer contains **"InterVarsity Christian Fellowship/USA"** linking to
  [intervarsity.org](https://intervarsity.org).
- ✅ Primary colors lead; secondary colors are accents only.
- ✅ Gradients are linear with light moving up/right.
- ✅ Uses the **official** InterVarsity logos + 2024 icon set.
- ⚠️ For production, generate the **chapter lockup** ("InterVarsity | Northern
  Michigan University") from the official chapter logo generator and drop it in.
- ⚠️ Register the live site through the Staff Portal so it's listed at
  `intervarsity.org/chapters`.

---

## Make it yours

Search the project for these and replace with real chapter info:

1. **Logo** — the site uses the official horizontal logo
   (`public/assets/logos/`). To use the NMU chapter lockup, drop the generated
   files into `public/assets/logos/` (keep the filenames) and re-run
   `npm run build:og` to refresh the social image.
2. **Meeting time & place** — `Jamrich Hall 1100`, `Thursdays · 7:00 PM`
   (hero, "Thursdays" section, contact, FAQ).
3. **Small groups** — the six cards in the `#small-groups` section.
4. **Events** — the four cards in `#events` (dates are illustrative).
5. **Team** — names/roles/initials in `#team`.
6. **Contact** — `nmu@intervarsity.org`, the Instagram/TikTok links, and the
   address.
7. **Domain** — update the URLs in `index.html` (`canonical`, Open Graph,
   JSON-LD), `robots.txt`, and `sitemap.xml`.

### Wire up the contact form (optional)

By default submissions are logged (`npm run tail`). To do more:

- **Store them:** create a KV namespace and uncomment `kv_namespaces` in
  `wrangler.jsonc`:
  ```bash
  npx wrangler kv namespace create SUBMISSIONS
  ```
- **Get emailed:** set secrets and the Worker will notify you via
  [Resend](https://resend.com):
  ```bash
  npx wrangler secret put RESEND_API_KEY
  npx wrangler secret put NOTIFY_EMAIL
  ```

---

## Notes & credits

- This site uses the chapter's **official** InterVarsity logos, icon set, and
  visual assets (provided by the chapter; full pack in `brand-assets/`).
- "InterVarsity," "InterVarsity Christian Fellowship/USA," and the InterVarsity
  logo are trademarks of InterVarsity Christian Fellowship/USA.

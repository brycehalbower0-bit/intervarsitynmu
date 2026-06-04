# Project guide for Claude

Website mock-up for **InterVarsity Christian Fellowship at Northern Michigan
University**, deployed as a **Cloudflare Workers + static assets** project.

## Architecture
- Static site lives in `public/` (single-page `index.html` + `404.html`).
- `src/index.js` is the Worker: serves assets via the `ASSETS` binding and
  handles `GET /api/health` and `POST /api/contact`.
- `wrangler.jsonc` routes only `/api/*` through the Worker
  (`assets.run_worker_first`); everything else is served statically.
- No build step for the site. Only `og.png` is generated from `og.svg`
  (`npm run build:og`, needs `rsvg-convert`).

## Commands
- `npm run dev` → `wrangler dev` (local)
- `npm run deploy` → `wrangler deploy`
- `npm run tail` → stream Worker logs (see contact submissions)

## Brand rules (InterVarsity Brand Book 2026)
- Primary colors lead: Revival Orange `#E76127`, Missional Blue `#006880`,
  Text Gray `#333333`. Secondary colors are accents only. All tokens are CSS
  variables at the top of `public/styles/main.css`.
- Gradients must be linear (light moving up/right).
- Fonts: Montserrat (display), Mulish (body), Zilla Slab (wordmark).
- The footer MUST keep "InterVarsity Christian Fellowship/USA" linking to
  intervarsity.org. The chapter logo must stay in the top of the page.

## Important
- The logo (`public/assets/*.svg`) is an **original placeholder**. The real
  chapter logo must come from InterVarsity's official chapter logo generator.
- Content (names, times, events, socials) is placeholder — see "Make it yours"
  in `README.md`.

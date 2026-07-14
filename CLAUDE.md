# node-analytics — "Audience Signal" (the reference GROUNDED Node)

A Node on **Grounded** (newsroom-owned AI by Develop AI). Reads a newsroom's
published-story performance matrix and shows what their audience actually rewards
(engagement *rate*, not raw reach). This is the canonical Node — copy its shape
when building new ones.

**`WORKING.md` is the spec-vs-reality ledger** — what each feature is meant to do
vs what was last verified working, dated. Update it after meaningful changes.

**Claude-only (since 2026-07-14).** The runtime is provider-flexible, but both
entrypoints pin `process.env.AI_PROVIDER = "anthropic"` so a stray `OPENAI_API_KEY`
in the environment is never auto-picked. Setup accepts only `sk-ant-` keys and
clears legacy OpenAI keys from `.env` on save.

## Two entrypoints, same handlers
- **`index.js`** (LOCAL): `createLiteHost` + `createServer({ slug:"analytics", host, handlers })` from `@developai/grounded-node-runtime`. Storage = JSON files, the user's own AI key.
- **`server-hosted.js`** (ONLINE): `await createHostedServer({ slug:"analytics", productName:"Audience Signal", handlers, ensureSchema, staticDir })`. ~25 lines — all auth/host/routes/chrome come from the runtime. Runs on the box as pm2 `audience-signal` on :3002, reached at `/nodes/analytics/app/`.

The handlers (`lib/handlers.js`, `lib/ingest.js`, `lib/analytics.js`, `lib/beats.js`) are written ONLY against the host interface, so they're identical in both modes. Don't put `fs`/`pg`/`express` in them.

## Key pieces
- **`lib/ingest.js`** — `ingestMatrix` is format-aware (`lib/extract.js` magic-byte detect): `.docx` → free regex table parse; `.doc`/PDF → text extracted (`pdf-parse`/`word-extractor`, lazy) then structured by the AI (`lib/ai-extract.js`, TSV output). `.doc`/PDF therefore need an AI key; `.docx` is free.
- **`lib/beats.js`** — the beat taxonomy. `DEFAULT_BEATS` is **generic** (works for any newsroom); `EXAMPLE_BEATS_ZAMBIA` is the old hand-tuned MakanDay set, kept as a reference. `tagBeats`/`enrich`/`fullReport` all take an optional taxonomy arg; `byBeat`/`risingFading` derive beat names from the tagged rows, so they're taxonomy-agnostic.
- **`lib/ai-beats.js`** — opt-in "fit beats to my coverage": an AI reads the newsroom's headlines and proposes a taxonomy (TSV → `{name, keywords[]}`), `compileBeats` turns it into the `{name: RegExp}` shape, and it's stored via `host.store` (collection `config`, key `beats`). Triggered through `GET /api/report?fit=1` (the runtime only exposes query params on that route); `fit=0` reverts to the default. Applied by `getReport`/`postBrief` via `loadBeats`.
- **Analytics depth (all pure, free, offline — `fullReport` assembles them):**
  - **`lib/stats.js`** — Wilson score interval (per-story rate CI + `wlb` lower bound used to RANK signal leaders within the reach floor) and `mannWhitney` (rank test on per-story rates; the ★ significance flag on beats/format/headline/words/sentiment). NB: significance is over STORY COUNT, not impressions — using reach as n is pseudoreplication and flags everything.
  - **`lib/text.js`** — tokenizer + compact stop-word list + uni/bigram extraction.
  - **`lib/wordsignal.js`** — `wordSignal`: which words/phrases lift vs drag engagement rate (median with vs without, min-occurrence guarded, significance-flagged). Report section `wordSignal{lifters,draggers}`.
  - **`lib/sentiment.js`** + **`lib/data/afinn-165.json`** — offline AFINN-165 (MIT, vendored, see `AFINN-165.LICENSE.md`) headline valence → `sentiment{groups,negativeVsPositive}`.
  - **`lib/compare.js`** — `compareReports(current, baseline)`: period-over-period diff. Triggered via `GET /api/report?baseline=<source>` (rides the existing route, like `fit`).
- **Data input beyond Word/PDF:** **`lib/csv.js`** parses CSV/TSV (Google Sheet exports, spreadsheet uploads) with fuzzy column mapping; `extract.js` `detectFormat` returns `csv` for delimited text. The dashboard's "Link a Google Sheet" box fetches the sheet's CSV export client-side and posts it through the normal `/api/ingest` path.
- **Forward-looking analysis (pure, in `fullReport`):** **`lib/insights.js`** — `byWeekday` (day-of-week resonance, TZ-proof date parsing), `quadrants` (reach×rate → hidden gems / boosted duds), `performanceOutliers` (vs each beat's median). **`lib/scorer.js`** — `scoreHeadline(draft, report, beats)` predicts a draft's rate additively from the newsroom's own history (beats + shape + words + sentiment), triggered via `GET /api/report?score=<draft>`.
- **GOTCHA (fixed in runtime v0.12.2):** the route wrapper used `req.body || req.query`, and Express sets `req.body` to `{}` for GET, so every GET query param (`source`/`fit`/`baseline`/`score`) was silently dropped. v0.12.2 merges them. This Node now pins `#v0.14.0`; a box deploy MUST refresh the runtime (`rm -rf node_modules/@developai && npm install`) or these features stay broken.
- **AI editorial features (all in `lib/handlers.js`, all through `host.ai.chat`):** `postBrief` (POST `/api/brief` — the editorial read-out), `recommend` (POST `/api/recommend` — strategy: where to put resources), and `storyIdeas` (POST `/api/ideas` — pitches 3–10 NEW commissionable stories, each traceable to past winners / rising beats / lifting words; count clamped, grounded in `getContext`). All three take `{ source }`; ideas also takes `{ count }`. Prompt grounding is pinned by `tests/ideas.test.js`.
- **`lib/schema.js`** — the hosted Postgres tables (`node_analytics_stories`, `node_analytics_quality`). The generic `node_analytics_activity` + `node_analytics_store` tables are the runtime's.
- **`lib/beacon.js`** — opt-OUT local-install telemetry (ON by default; `GROUNDED_TELEMETRY=off` to disable). Sends only counts/version/OS/newsroom name, never story content. Shows in the tracker's Nodes admin.
- **`public/`** — the dashboard. Uses RELATIVE `api/...` + asset paths so it works at `/` (local) and under `/nodes/analytics/app/` (hosted). Don't hardcode leading-slash API paths.
- **`install.sh` / `install.ps1`** — one-command installers. bash-3.2 GOTCHA: use ASCII `...` never `…` (a multibyte char right after `$var` crashes macOS bash).

## Deps
`@developai/grounded-node-runtime` (pinned to a tag, currently `#v0.14.0`) + dotenv + pdf-parse + word-extractor. The runtime brings express/multer/mammoth/anthropic + lazy pg/cookie-parser/jsonwebtoken — don't re-declare them here.

## Deploy (box)
`cd /home/ubuntu/node-analytics && git pull && npm install && pm2 restart audience-signal`.
If hosted code looks stale after a runtime bump: `rm -rf node_modules/@developai && npm install` (npm github-dep cache). `.env` must hold a real `sk-ant-` `ANTHROPIC_API_KEY` (it was once a placeholder → 401s) + `JWT_SECRET` matching the tracker.

See the tracker repo's `CLAUDE.md` for the system map; `pauldevelopai/nodes` → `ADD_A_NODE.md` to add a new Node.

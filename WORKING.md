# WORKING.md — what this app is meant to do vs what it actually does

> **The convention (copy this file's shape to every Grounded repo):** the *Meant to*
> column is the spec — pulled from `CLAUDE.md`, `README.md`, and `docs/`. The
> *Status* column is only ever ✅ when someone actually exercised the behavior and
> saw it work (not "the code looks right"), with the date. When the app drifts
> from the spec — or the spec from the app — this file is where it shows up first.
> Re-verify after any meaningful change and update the dates.

## What this app is (the intent)

**Audience Signal** — the reference Grounded Node. A newsroom uploads its
published-story performance matrix (Word/PDF/CSV/Google Sheet of headlines,
reach, engagement) and the app shows what its audience actually rewards —
**engagement rate** (engagement ÷ reach), not raw reach, which boosting and the
algorithm inflate. On top of the free offline analytics sit four Claude-powered
features: extraction from `.doc`/PDF, the editorial brief, strategy
recommendations, and story ideas. Same handler code runs two ways: local
single-newsroom (`index.js`, JSON files, the newsroom's own key) and hosted
multi-tenant (`server-hosted.js`, Postgres, tracker JWT auth, shared key).

**Policy decisions in force:**
- **Claude-only** (since 2026-07-14). The runtime is provider-flexible, but both
  entrypoints pin `AI_PROVIDER=anthropic`; setup accepts only `sk-ant-` keys and
  clears legacy `OPENAI_API_KEY`s on save.
- **No fake data, ever.** Real data or honest empty states.
- Runtime pinned to `github:…grounded-node-runtime#v0.14.0` (box deploys must
  refresh it: `rm -rf node_modules/@developai && npm install`).

## The contract, feature by feature

Status: ✅ verified working · 🧪 unit-tested only (not exercised live) · ❌ broken/missing

### Boot & modes

| Feature | Meant to | Verified behavior | Status | Last checked |
|---|---|---|---|---|
| Local entry (`index.js`) | Boot on :3000 with lite host, JSON storage, newsroom branding | Boots clean, MakanDay branding, runtime v0.14.0 in footer | ✅ | 2026-07-14 |
| Hosted entry (`server-hosted.js`) | ~25-line boot via `createHostedServer`; Postgres schema ensured; tracker-JWT auth | Booted against local tracker DB (:5433); schema ensured; unauthenticated → 302/401 to login; signed JWT → per-tenant empty state | ✅ | 2026-07-14 |
| Three UI states | setup → empty → dashboard, driven by `GET /api/setup` | All three render correctly (setup shows when no `sk-ant-` key) | ✅ | 2026-07-14 |
| Claude-only pinning | Inherited/stray `OPENAI_API_KEY` must never be used | With only an OpenAI key in the env: `configured:false`, AI calls refuse with a clear "ANTHROPIC_API_KEY is not set" error | ✅ | 2026-07-14 |

### Getting data in

| Feature | Meant to | Verified behavior | Status | Last checked |
|---|---|---|---|---|
| `.docx` ingest | Free regex table parse, no AI key needed | (not re-checked this pass — covered by `tests/ingest.test.js`) | 🧪 | 2026-07-14 |
| `.doc` / PDF ingest | Text extracted, structured by Claude (needs key) | Real MakanDay `.doc` → 120 stories, 0 errors, quality report populated | ✅ | 2026-07-14 |
| CSV/TSV + Google Sheet | Fuzzy column mapping; sheet fetched client-side → normal ingest; refreshable | (not exercised live this pass — covered by `tests/csv.test.js`) | 🧪 | 2026-07-14 |
| Multiple sources | All uploads kept, switchable, deletable; sheets refreshable | Sources tab lists uploads with view/refresh/delete | ✅ | 2026-07-14 |
| Story links + scrape | Attach URLs to stories; scrape article text as newsroom learning | Links table renders (121 rows); scrape not exercised live | 🧪 | 2026-07-14 |
| Data quality report | Per-row errors/warnings/uncategorised from ingest | 54 rows of real issues rendered for the MakanDay matrix | ✅ | 2026-07-14 |

### Free offline analytics (`fullReport` — no AI key)

| Feature | Meant to | Verified behavior | Status | Last checked |
|---|---|---|---|---|
| Beats | Median rate per beat, Wilson/Mann-Whitney ★ significance | 15 beats ranked, ★ flags shown | ✅ | 2026-07-14 |
| Signal leaders / reach giants | Rate leaders above a reach floor (no tiny-sample flukes) vs loud-but-weak | Both tables populate with real stories | ✅ | 2026-07-14 |
| Rising/fading, format, headline shape, timeline | Period + format + hed-feature signals | All render | ✅ | 2026-07-14 |
| Word signal | Words/phrases that lift or drag rate, min-occurrence guarded | Lifters + draggers populated (22 rows) | ✅ | 2026-07-14 |
| Sentiment (AFINN-165, offline) | Negative vs positive framing comparison | Renders with significance callout | ✅ | 2026-07-14 |
| Hidden gems / boosted duds | Reach×rate quadrants → what to re-promote | Quadrant counts + both tables populate | ✅ | 2026-07-14 |
| Best day / over-under performers | Day-of-week medians; stories vs their beat's norm | Both render | ✅ | 2026-07-14 |
| Headline scorer (`?score=`) | Predict a draft's rate from own history, factors shown | Scored a draft 2.99% with factor breakdown, via UI | ✅ | 2026-07-14 |
| Compare (`?baseline=`) | Period-over-period diff between two uploads | `comparison` block returned (beats/formats/topline) | ✅ | 2026-07-14 |

### Claude features (need an `sk-ant-` key)

| Feature | Meant to | Verified behavior | Status | Last checked |
|---|---|---|---|---|
| AI brief (`POST /api/brief`) | Decisive editorial read-out grounded in the report + newsroom context | Generated, grounded in real numbers | ✅ | 2026-07-14 * |
| Recommendations (`POST /api/recommend`) | Strategy: where to put resources, tied to evidence | Generated, cites real beats/rates | ✅ | 2026-07-14 * |
| **Story ideas (`POST /api/ideas`)** | Pitch N (3–10, default 6) NEW commissionable stories, each traceable to past winners / rising beats / lifting words; fits newsroom context | Route + UI wired and verified; prompt grounding, count clamping, and empty-data refusal pinned by `tests/ideas.test.js`. Live generation not yet run with a real key | 🧪 | 2026-07-14 |
| Fit beats (`?fit=1` / `fit=0`) | AI proposes newsroom-specific taxonomy; revert to default | Proposed MakanDay-specific beats; `fit=0` reverted | ✅ | 2026-07-14 * |
| In-app key setup | Local: validate + save `sk-ant-` key to `.env`, live-check against Anthropic, never throws. Hosted: refuse (key is central) | Wrong provider / non-`sk-ant` / short keys all refused with clear messages; hosted refusal pinned by tests | ✅ | 2026-07-14 |

\* generated on 2026-07-14 while the environment still supplied an OpenAI key
(pre-Claude-only). The prompts/plumbing are identical; regenerate once an
Anthropic key is pasted to re-confirm end-to-end on Claude.

### Cross-cutting

| Feature | Meant to | Verified behavior | Status | Last checked |
|---|---|---|---|---|
| Newsroom context | PUT/GET, whitelisted fields, feeds every AI prompt, syncs to shared profile (hosted) | Round-trips; unknown fields correctly dropped | ✅ | 2026-07-14 |
| Activity log | Every op logged with prompt+response, capped at 200, local file / Postgres | Renders; caps pinned by tests | ✅ | 2026-07-14 |
| Telemetry beacon | Opt-out counts-only ping, never story content | Fires on boot (log line visible); content not re-inspected | 🧪 | 2026-07-14 |
| Tests | `npm test` green | **64/64 pass** | ✅ | 2026-07-14 |

## Known gaps / next comparisons

- **Story ideas end-to-end on a real key** — run once after pasting an
  `sk-ant-` key locally (Story Ideas tab → Generate) and flip its row to ✅.
- **Local machine consequence of Claude-only:** this Mac's environment carries
  an OpenAI key that the app previously auto-used. It is now correctly ignored —
  so the welcome screen shows until an Anthropic key is pasted. Intended.
- `.docx` and Google Sheet ingest haven't been exercised live recently (unit
  coverage only).
- Box deploy of the Claude-only change requires the box `.env` to hold a real
  `sk-ant-` key (it already should) — `AI_PROVIDER` is now forced in code.

## How to re-verify (the 5-minute pass)

```bash
npm test                                  # 64 tests, all green
npm start                                 # → http://localhost:3000
curl -s localhost:3000/api/setup          # configured true only with sk-ant- key
curl -s localhost:3000/api/report | head  # topline + all sections
# then in the browser: upload data/raw/*.doc, click through the tabs,
# Score a headline, and generate Brief / Recommendations / Story Ideas.
```

Hosted smoke test (needs local tracker Postgres on :5433):

```bash
PORT=3999 DATABASE_URL="postgres://localhost:5433/tracker" JWT_SECRET=test node server-hosted.js
curl -s localhost:3999/api/report        # → 401 Not signed in (auth gate works)
```

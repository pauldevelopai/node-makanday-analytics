# For Paul — operational playbook for this Node and the Nodes system

Everything in this file is for you (Develop AI), not for newsrooms. The
newsroom-facing doc is `README.md`. This one is yours.

## Two repositories to publish on GitHub

The Nodes system needs two public repos on your account:

### 1. `pauldevelopai/grounded-node-runtime`
The shared scaffolding. Every Node depends on this. Apache-2.0.

```bash
# In /home/claude/grounded-node-runtime
git init && git add . && git commit -m "v0.1.0: initial runtime"
gh repo create pauldevelopai/grounded-node-runtime --public --source=. --push
```

After it's pushed, switch every Node's `package.json` dependency from the
local `file:` path to:

```json
"@developai/grounded-node-runtime": "github:pauldevelopai/grounded-node-runtime#main"
```

(Or publish to npm under your scope if you want a versioned release —
totally optional for the pilot.)

### 2. `pauldevelopai/node-analytics`
The first Node. Apache-2.0. This is the one newsrooms fork.

```bash
# In /home/claude/node-analytics
git init && git add . && git commit -m "v0.1.0: first Node"
gh repo create pauldevelopai/node-analytics --public --source=. --push
```

Subsequent Nodes follow the same pattern: `pauldevelopai/node-<slug>`.

## How a newsroom joins (and how you stay in)

1. They follow the `README.md` and end up on your `node-analytics`
   repo page. They click **Fork**.
2. They now own e.g. `makandaymedia/node-analytics`.
3. **Crucial onboarding step** — built into your first call with them:
   they go to *their* fork's **Settings → Collaborators → Add people**
   and add `pauldevelopai`. From this moment you can push directly to
   their fork.
4. Their `.env` (their Anthropic key) is gitignored — your commits never
   touch it. Their `data/` is committed — you can pull it any time.

The "add Paul as collaborator" step is one click for them. Put it in the
newsroom onboarding call as a non-negotiable. After it's done, you have
full collaborator access to every Node fork you've onboarded — equivalent
to having local working copies on every newsroom laptop.

## Your four operating modes

Once collaborator access is set up, every situation you'll hit maps to
one of four moves:

**Improving something for everyone.** Edit upstream
`pauldevelopai/node-analytics`. Push. Tell newsrooms (or set up
a Slack/WhatsApp broadcast) that an update is available. They sync their
fork and pull (their README walks them through it).

**Helping one newsroom unstick something.** Clone their fork (you're a
collaborator):
```bash
git clone https://github.com/<their-org>/node-analytics.git
cd node-analytics
# open in Claude Code, fix, commit, push
```
They restart their app and pick it up.

**Lifting a newsroom's good change back upstream.** They open a PR back
to your repo. Or — more realistically for non-technical newsrooms — they
email saying "this works", you cherry-pick onto upstream yourself with
credit in the commit message.

**Live mentoring.** Both of you have the fork open. You push small
commits; they pull. The Node's dev server hot-reloads (`npm run dev`) so
iteration is fast. This is the move for live training sessions.

## Pulling newsroom activity for cohort visibility

Per the "data is shared" decision, each Node logs every operation (ingest,
brief, error) — with full prompt and response text for briefs — to
`data/processed/node_<slug>_activity.json`, committed to the newsroom's
fork. The newsroom can see their own history in the **Activity** tab of
their dashboard; you pull the cohort-wide view.

The harvest script lives in its own repo: `grounded-cohort-harvest`. Set
it up once on your Mac:

```bash
cd /Users/paulmcnally/Downloads/grounded-cohort-harvest
chmod +x harvest.mjs
# Edit forks.json to add newsrooms as they onboard
./harvest.mjs
```

Output lands in `./harvest/<timestamp>/`:
- `summary.txt` — read in two minutes (totals, provider mix, most recent
  activity per newsroom)
- `cohort-activity.json` — every event, every newsroom, sorted by time

Run weekly during pilot, daily during active onboarding. The script uses
`gh` to fetch only the activity file from each fork (no full clone), so
it's fast even with a dozen newsrooms.

When to graduate this: at 5+ Nodes across a dozen newsrooms, move
harvested events into a Postgres table. When GROUNDED is on Lightsail,
flip to the push model — Nodes POST events to a telemetry endpoint and
the harvest script becomes a backup channel. Node code doesn't change;
only `host.log` swaps implementation.

## Graduation: when a Node folds into GROUNDED proper

The graduation criteria for `analytics` are in the Node's
manifest (when we finalise it for GROUNDED side): ≥3 newsrooms running,
≥50 generated briefs, ≥60% accept rate. When met:

1. In the GROUNDED monorepo, create `lib/nodes/analytics/` and
   `app/nodes/analytics/` matching the layout we designed in the
   earlier `grounded-playground.zip` deliverable (the host facade,
   route helper, Next.js routes are already drafted).
2. Copy the Node's `lib/analytics.js`, `lib/beats.js`, `lib/ingest.js`,
   `lib/handlers.js` into `lib/nodes/analytics/`. No code
   changes — only the host implementation underneath swaps.
3. Write the Postgres migration `001_stories.sql` (already drafted in
   the earlier deliverable — `pg_analytics_*` → renamed
   `node_analytics_*`).
4. Add the thin Next.js route handlers under `app/nodes/.../api/`.
5. Drop the `@developai/grounded-node-runtime` dependency from this Node.
6. Run the GROUNDED integration steps (the `INTEGRATION.md` deliverable).

The application code (`analytics.js` + `handlers.js`) is identical in
both worlds — that's the whole point of having designed the host
interface. The standalone Node and the integrated Node are the same code,
two implementations underneath.

## Provider flexibility (Anthropic + OpenAI) is standalone-only

Runtime v0.2.0 supports both Anthropic and OpenAI as AI providers, auto-
detecting from whichever API key is in the newsroom's `.env`. Default
models are deliberately cheap (`claude-haiku-4-5` for Anthropic,
`gpt-5.4-mini` for OpenAI). Both overridable via `MODEL=` env var; OpenAI
calls additionally accept `OPENAI_BASE_URL=` so a newsroom can route
through OpenRouter, Groq, or local Ollama if they prefer.

**This is standalone-only**. GROUNDED's locked rule #1 (Haiku-only,
hardcoded in `lib/claude.js`) still stands — when this Node graduates
into the GROUNDED monorepo, the OpenAI path *is dropped* and the Node
uses GROUNDED's Haiku-only wrapper. The dual-provider host-lite is a
laptop-friendly convenience for the pilot, not a forever capability.

If you ever want to relax locked rule #1 for OpenAI support in GROUNDED
proper, that's a separate, bigger conversation. I'd push back on it —
the locked rule has cost-control reasoning behind it that I'd want to
preserve.

## What's intentionally NOT here yet (and when to add it)

- **npm publishing of the runtime.** Currently dist via GitHub URL is fine
  for the pilot. If a Node ever needs a pinned version of the runtime
  (because a runtime change broke it), publish to npm under
  `@developai/grounded-node-runtime` and pin per-Node. Wait for the first
  breakage before doing this.
- **Telemetry back to GROUNDED for graduation evidence.** Right now
  `host.log` prints to console in standalone mode. Once you have GROUNDED
  on Lightsail, add an opt-in POST to a GROUNDED endpoint so brief
  generation events accumulate in Observatory without manual harvest.
  Defer this until GROUNDED is hosted.
- **Multi-Node-per-fork option.** If a newsroom builds several Nodes,
  they currently have several forks. Fine for now. If it gets annoying,
  introduce a `nodes-monorepo` template.
- **GitHub Desktop guidance in the README.** I went with raw "Download
  ZIP" because it's the most universally simple. If a newsroom dev is
  comfortable, GitHub Desktop is much better for keeping a fork in sync.
  Add a "for the more adventurous" section to the README once a newsroom
  asks.

## What you should test before sending the README to MakanDay

Do the README's setup *yourself* on a fresh laptop (or a fresh VM) end-
to-end, with no shortcuts. Time it. Write down anywhere you hesitated
or had to think — that's a sentence to add to the README. Newsroom
onboarding succeeds or fails on whether the first hour feels
non-frustrating.

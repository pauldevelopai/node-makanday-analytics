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

## How a newsroom joins

There are two tiers, and **the default is central — no fork, no GitHub
account.**

**Central (default, for non-technical newsrooms).** They run the one-command
installer from the `README.md` (`grounded.developai.co.za/nodes/analytics/{mac,windows}`,
which redirect to `install.sh` / `install.ps1`). It downloads the app from
`pauldevelopai/node-analytics` over plain HTTPS — no fork, no git, no Node or
VS Code to install by hand. To update, they re-run the same command; it always
pulls the latest. You ship fixes by pushing to `main`. Their data stays entirely
on their own machine, and the runtime has no outbound telemetry — so a central
install sends nothing back to you (see *Cohort visibility* below).

**Fork (optional, for technically comfortable newsrooms).** Documented in the
README's "Advanced" section. They fork `pauldevelopai/node-analytics`, then —
the one step that matters — add `pauldevelopai` as a collaborator on *their*
fork (**Settings → Collaborators → Add people**). From then you can push fixes
directly to their fork. Their `data/` and `.env` are gitignored — they live only
on the newsroom's machine and never reach GitHub, so your commits never touch
them (and there's nothing of theirs to pull from the fork).

Reach for the fork tier only when a newsroom wants to customise the code, or
you specifically want direct push access to their copy. For everyone else,
central is simpler on both sides.

**A fork doubles as a newsroom's identity** — there's no login system in the
Node, so a newsroom's GitHub fork *is* their "account": their adapted **code**
lives there, and it's theirs forever. **Data never travels with the code** —
`data/` is gitignored, so it stays on each newsroom's own machine; upstream and
every fork are data-free, and a fresh clone / fork / install starts empty.
MakanDay's data now lives only in their own install, never in a repo. The
newsroom-facing adapt-and-contribute-back flow is in `docs/MAKE_IT_YOUR_OWN.md`.
A real multi-tenant login/accounts model is a later, hosted-GROUNDED concern.

## Your operating modes

**Improving something for everyone.** Edit upstream
`pauldevelopai/node-analytics`, push to `main`. Central-install newsrooms get
it automatically the next time they run the command; fork-tier newsrooms sync
their fork and pull (their README walks them through it). A Slack/WhatsApp
broadcast to say "an update's ready" is enough.

The remaining moves apply to **fork-tier** newsrooms, where you hold
collaborator access:

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

## Cohort visibility (and why there isn't any yet)

Each Node logs every operation (ingest, brief, error — with full prompt and
response text for briefs) to `data/processed/node_<slug>_activity.json`. But
that file is **gitignored like the rest of `data/`**, so it stays on the
newsroom's own machine. They see their own history in the **Activity** tab;
nothing leaves their computer.

So **there is no automatic cohort view today.** The old model committed the
activity file to each fork and harvested it with `gh` — that's retired now that
data never touches a repo (that privacy guarantee is the whole point). The
runtime also has no outbound telemetry: nothing phones home.

To get cohort visibility back, build an **opt-in telemetry beacon**: the Node
POSTs a *minimal, consented* event (e.g. "brief generated", counts, model,
accept/reject — **not** story text or matrices) to a GROUNDED endpoint the
newsroom can see and switch off. Do this once GROUNDED is hosted. Until then,
ask newsrooms directly or have them screenshot their Activity tab. Whatever you
build, keep the rule the data model now enforces: **a newsroom's content stays
on the newsroom's machine unless they explicitly choose to share it.**

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

## Provider policy: Claude-only (OpenAI removed 2026-07-14)

The runtime remains provider-flexible (it can drive Anthropic or OpenAI),
but this Node is **Claude-only** by decision: Grounded is newsroom-owned
AI on Anthropic. Both entrypoints pin `process.env.AI_PROVIDER =
"anthropic"` at boot so the runtime can never auto-pick OpenAI from a
stray `OPENAI_API_KEY` in the environment; the setup screen accepts only
an `sk-ant-` key; saving a key actively clears any legacy
`OPENAI_API_KEY` from `.env`. Default model stays the cheap
`claude-haiku-4-5`, overridable via `MODEL=`.

(History: runtime v0.2.0 onwards supported dual providers as a
standalone-pilot convenience, with `gpt-5.4-mini` as the OpenAI default
and `OPENAI_BASE_URL` routing. That path was removed from this Node —
see the git history if it ever needs resurrecting.)

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

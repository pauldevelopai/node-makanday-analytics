# Make this Node your own

The one-command install gets you running in minutes, and for most newsrooms
that's all you'll ever need. But this Node is **open** — you can keep your own
copy, change how it works, and (if you want) share improvements back so other
newsrooms benefit. This guide walks through that.

You don't need to be a developer. The hardest part is the first setup; after
that it's a few clicks.

---

## Your fork is your copy — and your identity

On GitHub, your **fork** is your own copy of the Node under your account. It's
the closest thing to a "login" for a Node:

- Your **changes** to the code live in your fork.
- Your **data** — the matrices you upload and the results — is committed to
  your fork too.
- It's **yours forever.** Even if Develop AI disappears tomorrow, your fork
  keeps working.

A brand-new newsroom forks the clean template and starts empty. You, having
used it, have your stories already loaded in *your* fork. Same Node, different
copies — that's the whole idea.

---

## One-time setup

**1. Fork it.** Sign in at github.com, open
https://github.com/pauldevelopai/node-analytics, click **Fork**, then
**Create fork**. You now own `your-name/node-analytics`.

**2. Add Paul as a collaborator** *(optional but recommended).* On *your* fork:
**Settings → Collaborators → Add people** → add `pauldevelopai`. This lets him
push fixes straight to you and help when you're stuck.

**3. Get it onto your computer.** Install **GitHub Desktop**
(desktop.github.com), sign in, and **Clone** your fork — one click, no command
line.

---

## Changing it

Open the folder in any editor (VS Code is free and common). The most useful
things to edit are written to be edited:

- `lib/beats.js` — your beat taxonomy (the keywords that sort stories into
  beats). Make it match how *your* newsroom thinks about its coverage.
- `lib/analytics.js` — how the numbers are computed.
- `public/` — the dashboard itself.

Run the Node and refresh to see your change. (If you installed via the one
command, you can also just re-run that command after editing your local copy —
but for active editing, GitHub Desktop + a local run is smoother.)

---

## Saving and sharing your changes

**Save your changes (= "upload" to your fork).** In GitHub Desktop, your edits
show up as changes. Write a short summary, click **Commit**, then **Push
origin**. Your changes are now safe in your fork on GitHub.

**Share an improvement back to everyone.** Two ways, easiest first:

- **Email Paul.** Tell him what you changed and why. He'll pull it from your
  fork (he's a collaborator) and, if it's good for everyone, fold it into the
  shared version with credit to your newsroom. This is the normal path.
- **Open a Pull Request.** On your fork's GitHub page, click **Contribute →
  Open pull request**. This proposes your change to the shared Node for Paul
  to review.

Either way, once it's merged into the shared version, **every other newsroom
can pull it in** — so the Node grows from real newsroom experience, and you all
build on each other's work.

**Get other newsrooms' improvements.** On your fork's GitHub page click
**Sync fork**, then in GitHub Desktop click **Pull origin**. Your own changes
and data are kept.

---

## A note on your data

Your uploaded matrices and results live in your copy's `data/` folder, and they
**stay on your computer.** `data/` is gitignored, so your data is never
committed, never pushed to GitHub, and never travels with the code — not even
when you push code changes to your fork. And it works the other way too: when
you fork or download the Node, **no one else's data comes with it** — you always
start with a blank slate and add your own. Develop AI can't see your stories
unless you deliberately choose to share them.

---

Stuck anywhere? Email Paul at Develop AI with what you were doing and a
screenshot. Adapting a Node is meant to be part of owning it — questions are
expected.

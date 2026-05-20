# MakanDay Audience Signal — your Node

This is your newsroom's audience-analytics app. It reads a Word document of
your published stories and their Facebook reach + engagement, and tells you
what your audience actually rewards. It runs on your own computer. Your data
stays on your computer (and in your GitHub copy of this app, which you
control).

This guide gets it running. **No prior coding experience is needed.** If you
can install Microsoft Word, you can do this. Set aside about 45 minutes the
first time. After that, opening the app is one double-click.

If you get stuck on any step, that's normal. Email Paul at Develop AI and
tell him exactly which step you're on and what your screen looks like —
he'll get you unstuck. He's already done this dozens of times.

---

## What you need before you start

You need four things. Don't worry if you don't have them yet — the steps
below set them up.

- **A computer.** A Mac or a Windows laptop, made in the last 5 years or so.
- **Internet.** Just to download things at the start. Once everything is
  installed, the app runs offline (except for the AI brief, which needs the
  internet to ask Claude a question).
- **About £5 (or $5, or €5).** This is for an API account with **either
  Anthropic (Claude) or OpenAI (GPT)** — whichever you prefer. The app
  works with both. You'll add money to your chosen account once, and a
  typical week of using this app costs a few cents. We'll set this up
  in Part 3.
- **About 45 minutes** the first time. Make a cup of tea. You've got this.

---

## A quick map of what we're about to do

We'll do five things. Each one is small. After each, the app gets a bit
closer to running.

1. **Install two free programs** on your computer (Node.js and VS Code).
   These are the tools the app uses.
2. **Get a copy of the app** onto your computer. We do this through GitHub.
3. **Get an AI key** so the app can ask Claude questions.
4. **Run the app for the first time.** A few commands typed into VS Code.
5. **Open the app in your web browser** and upload your matrix.

Ready? Let's go.

---

## Part 1 — Install Node.js (the engine that runs the app)

1. Open your web browser (Chrome, Safari, Firefox, Edge — any).
2. In the address bar at the top, type: `nodejs.org` — then press Enter.
3. You'll see a page with two big green buttons. Click the one on the left,
   labelled **"LTS"** (it stands for "Long-Term Support" — the stable
   version everyone uses).
4. A file downloads. When it finishes, find it in your Downloads folder.
5. Double-click that file to open the installer. Click **Continue / Next**
   on every screen, accept the agreement, and click **Install**. You may
   need to type your computer password.
6. When it says "Installation Successful" or similar, click **Close**.

**You won't see any new app icon.** That's normal. Node.js works behind the
scenes — we'll prove it's installed in a later step.

---

## Part 2 — Install VS Code (where you'll type commands)

VS Code is a free app from Microsoft. It's what we'll use to look at the
app's code and to type the few commands needed to start it.

1. In your browser, go to: `code.visualstudio.com`
2. Click the big blue **Download** button. The site will pick the right
   version for your computer.
3. Open the downloaded file and follow the installer. Accept the defaults.
4. When it's installed, open VS Code. You should see a welcome screen with
   "Get Started" written on it. Close that tab — we'll come back here in
   a moment.

---

## Part 3 — Get your AI key

The "AI brief" feature in this app asks an AI to summarise what your data
is telling you. The app works with **either** Claude (from Anthropic) or
GPT (from OpenAI) — you only need an account with **one** of them.

**If you already have one of these accounts**, use it. Skip the other
section. **If you have neither**, pick whichever feels easier — both
work just as well for this app. Anthropic Claude is what GROUNDED uses
under the hood; OpenAI's cheapest tier (GPT-5.4 Mini) is actually a
fraction cheaper. The bill is a few cents per AI brief on either.

### Option A — Anthropic (Claude)

1. In your browser, go to: `console.anthropic.com`
2. Click **Sign up** (or **Sign in** if you already have an account).
   Use your work email and pick a password.
3. Once signed in, look on the left side of the screen for a section
   called **API Keys**. Click it.
4. Click **Create Key**. Give it any name (e.g. "MakanDay Analytics").
   Click **Create**.
5. You'll see a long string of characters starting with `sk-ant-`.
   **Copy it now and paste it somewhere safe** — Anthropic won't show
   it to you again. (If you lose it, you just make a new one. No harm.)
6. Click your name in the top-right, go to **Billing**, and add £5 or
   $5 to your account. That's enough for many weeks of use.

You're done with Part 3. Skip Option B and go to Part 4.

### Option B — OpenAI (GPT)

1. In your browser, go to: `platform.openai.com`
2. Click **Sign up** (or **Sign in**). Use your work email.
3. Once signed in, click the gear icon (top right) for **Settings**,
   then **API keys** in the left sidebar. (Or go straight to
   `platform.openai.com/api-keys`.)
4. Click **Create new secret key**. Give it any name. Click **Create**.
5. You'll see a long string starting with `sk-...`. **Copy it now** —
   OpenAI won't show it again. (If you lose it, make a new one.)
6. In **Settings → Billing**, add £5 or $5 of credit. That covers many
   weeks of use.

**Keep your key private.** Don't email it, don't share it, don't put it
in a public document. The next step shows you exactly where to paste it.

---

## Part 4 — Get the app onto your computer

This is the GitHub bit. GitHub is a website where the code for this app
lives. You'll make your own personal copy of it on GitHub (called a
**fork**), and then download that copy onto your computer. Your copy is
yours forever — even if Develop AI disappears tomorrow, your copy keeps
working.

### Step 4a — Make a GitHub account (if you don't have one)

1. Go to: `github.com`
2. Click **Sign up** and follow the steps. Use your work email.

### Step 4b — Fork the app to your own account

1. Once signed in to GitHub, go to:
   `https://github.com/pauldevelopai/node-makanday-analytics`
   (Paul will give you this exact link.)
2. In the top-right of that page, click the button labelled **Fork**.
3. On the next screen, click the green **Create fork** button. (You can
   leave all the settings as they are.)
4. After a moment, GitHub shows you a copy of the project — but this time
   under **your** username. Look at the top-left to confirm: it should say
   *your-username* / **node-makanday-analytics**.

You now own a copy. Keep this browser tab open — we'll need it.

### Step 4c — Download your copy to your computer

1. On your fork's page, find the green **Code** button (above the file
   list). Click it.
2. In the menu that drops down, click **Download ZIP**.
3. The ZIP file lands in your Downloads folder.
4. **Unzip it** (double-click on Mac; right-click → Extract All on Windows).
   You'll get a folder called something like `node-makanday-analytics-main`.
5. **Move that folder somewhere sensible.** Drag it into your Documents
   folder. Rename it if you want — `MakanDay Analytics` is fine.

### Step 4d — Open the folder in VS Code

1. Open VS Code (the app you installed in Part 2).
2. In the top menu, click **File → Open Folder…**
3. Choose the folder you just moved (`MakanDay Analytics` or whatever you
   called it). Click **Open** / **Select Folder**.
4. VS Code may ask "Do you trust the authors of the files in this folder?"
   Click **Yes, I trust the authors**.
5. On the left side of VS Code you should now see a list of file names
   and folders: `data`, `lib`, `public`, `tests`, `index.js`,
   `package.json`, and so on. That's the app.

### Step 4e — Save your AI key

1. In VS Code's file list on the left, find a file called `.env.example`.
   Click it once to open it.
2. In the top menu of VS Code: **File → Save As…**
3. In the "Save As" box, **change the name from `.env.example` to just
   `.env`** (with the dot at the start, no `.example`). Save it in the
   same folder.
4. Now you have a new file `.env` open. It looks like:

   ```
   ANTHROPIC_API_KEY=
   OPENAI_API_KEY=
   ```

5. Paste your key from Part 3 after the **=** sign of whichever line
   matches your provider. Leave the other line empty.

   - If you did **Option A (Anthropic)**: paste after `ANTHROPIC_API_KEY=`
     so the line reads `ANTHROPIC_API_KEY=sk-ant-api03-xxxx...`
   - If you did **Option B (OpenAI)**: paste after `OPENAI_API_KEY=`
     so the line reads `OPENAI_API_KEY=sk-xxxx...`

6. Save the file (**Cmd+S** on Mac, **Ctrl+S** on Windows).

The app figures out which provider to use automatically based on which
key you filled in. No other setting needed.

**The `.env` file stays on your computer.** It is deliberately not part
of what gets shared on GitHub. Your key stays private.

---

## Part 5 — Run the app for the first time

We're nearly there. Two commands to type, then the app opens.

### Step 5a — Open VS Code's terminal

1. In VS Code, in the top menu, click **View → Terminal**.
2. A new panel opens at the bottom of VS Code with a white prompt. This is
   the **terminal** — where we type commands.
3. You should see something like `your-name@computer MakanDay Analytics %`
   or `PS C:\Users\your-name\Documents\MakanDay Analytics>` at the prompt.
   The important thing: the prompt should mention your folder name.

### Step 5b — Install the app's parts

1. Click in the terminal so it's focused. Type exactly this and press Enter:

   ```
   npm install
   ```

2. Lots of text scrolls by. This takes 30–60 seconds. It's downloading the
   pieces the app needs.
3. When it finishes, you'll see a fresh prompt (the line waiting for your
   next command). No big "Success!" message — silence means success.

**If you see an error** that says `command not found: npm`, Node.js
didn't install correctly. Quit VS Code, restart your computer, and try
Step 5b again from a fresh VS Code window. If still broken, go back to
Part 1.

### Step 5c — Start the app

1. In the same terminal, type:

   ```
   npm start
   ```

2. After a moment, you'll see:

   ```
   ✓ MakanDay Audience Signal is running.
   ✓ Open this in your web browser:  http://localhost:3000

     Press Ctrl+C in this window to stop it.
   ```

3. **Leave this terminal window open.** As long as it says "is running",
   the app is alive. If you close it, the app stops.

---

## Part 6 — Open the app and upload your matrix

1. Open your web browser. In the address bar, type: `localhost:3000` then
   press Enter.
2. You should see the **MakanDay Audience Signal** dashboard with a big
   "Upload your matrix to get started" box in the middle.
3. Drag your **Stories Produced 2025 Social Media Matrix** Word file
   directly into that box. (Or click "Choose Word file" and pick it.)
4. After a few seconds, the dashboard appears with your data — beats,
   signal leaders, format, timeline, all of it.
5. Click the **AI Brief** tab, then **Generate brief**. After 15–30
   seconds, Claude returns the editorial read-out.

**That's it.** You're running.

---

## Using the app after the first time

You don't have to repeat the setup. From now on:

- **On a Mac**: double-click `Start.command` in your MakanDay Analytics
  folder. (The first time, your Mac may say "cannot verify the developer".
  Right-click the file → **Open** → click **Open** in the dialog. After
  that, double-clicking works normally.)
- **On Windows**: double-click `Start.bat` in your MakanDay Analytics
  folder.
- The terminal window opens, the server starts, and your browser opens
  automatically to the dashboard.
- To stop the app: close the terminal window (or press **Ctrl+C** in it).

---

## Getting updates from Develop AI

Paul will improve the Node over time. To get the latest version:

1. Go to your fork on GitHub in your browser (same place as Step 4c).
2. If updates are available, GitHub shows a notice near the top: *"This
   branch is N commits behind pauldevelopai:main"* with a **Sync fork**
   button. Click it, then click **Update branch**.
3. Now download a fresh ZIP (Step 4c) and unzip it.
4. **Important**: before replacing your folder, copy your `.env` file and
   your `data/` folder out to keep them safe.
5. Replace the old folder with the new one. Put `.env` and `data/` back in.
6. Open the new folder in VS Code, open the terminal, run `npm install`
   once to pick up any new pieces.

If this feels fiddly, ask Paul — there are friendlier ways once you're
comfortable (GitHub Desktop, or learning two `git` commands).

---

## Changing things in your Node

This Node is **yours**. You're allowed (and encouraged) to change it. The
files most worth understanding:

- **`lib/beats.js`** — the list of beat keywords. If your newsroom covers
  topics that aren't in the list, add them. The file has comments showing
  you how.
- **`lib/analytics.js`** — the maths behind the dashboard (engagement
  rate, rising/fading beats, etc.). Read-only at first, but you can tweak.
- **`public/index.html`** — the dashboard layout.
- **`public/app.js`** — the dashboard's interactive bits.

After changing any file, the app re-reads it automatically if you start it
with `npm run dev` instead of `npm start`. (Or just stop the app with
Ctrl+C and run `npm start` again.)

When you've made a change you're proud of, you can share it back to
Develop AI through GitHub (a "pull request"). Email Paul; he'll walk you
through it the first time.

---

## When something goes wrong

### "command not found: npm" or "node"
Node.js isn't installed correctly. Quit VS Code, restart your computer,
and re-do Part 1.

### "EADDRINUSE: address already in use :::3000"
The app is already running in another terminal window. Close that other
terminal first. Or change the port: in your `.env` file add a line
`PORT=3001` and try again.

### "ANTHROPIC_API_KEY is not set" or "OPENAI_API_KEY is not set"
Your `.env` file is missing or doesn't have your key in the right place.
Re-do Step 4e — make sure your key is on the correct line (Anthropic key
goes after `ANTHROPIC_API_KEY=`, OpenAI key goes after `OPENAI_API_KEY=`).

### Browser shows "This site can't be reached"
The app isn't running. Look at the terminal — does it still say "is
running"? If not, run `npm start` again.

### The AI brief says "Brief unavailable"
Most often, your provider account has run out of credit. Top it up in
your provider's Billing page. Or your key is wrong — check `.env`.

### Something else
Email Paul with: (a) which step you're on, (b) what command you typed,
(c) the exact text of any error message. A screenshot helps.

---

## What's shared on GitHub vs. what stays on your computer

Be clear about this — it matters.

| What | Where it lives | Why |
|---|---|---|
| The app's code | Your GitHub fork (committed) | So you can update it, change it, and Paul can help. |
| Your uploaded Word matrices (`data/raw/`) | Your GitHub fork (committed) | So Develop AI can use anonymised data to improve GROUNDED. |
| Your processed stories + quality reports (`data/processed/`) | Your GitHub fork (committed) | Same reason. |
| Your **activity log** (`data/processed/node_makanday_analytics_activity.json`) | Your GitHub fork (committed) | A record of every ingest and every AI brief you've generated. You can see your own history any time in the **Activity** tab of the dashboard. Develop AI uses these to understand what's working across the cohort and to train future versions of GROUNDED. |
| **Your Anthropic / OpenAI API key** (`.env`) | **Your computer only** | This is private. Never gets shared. The `.gitignore` file ensures it's excluded. |

If you ever want to use this Node for confidential material (e.g.
unpublished sources), talk to Paul first — the setup needs adjusting so
that data doesn't leave your machine.

---

## Glossary

- **Terminal** — a window where you type commands instead of clicking.
  Don't be intimidated; it's just text in, text out.
- **npm** — "Node Package Manager". The program that downloads the pieces
  this app needs. Comes with Node.js.
- **GitHub** — a website that stores code and tracks changes to it.
- **Fork** — your personal copy of someone else's GitHub project.
- **Node (capital N, this app's kind)** — a newsroom-owned app on
  GROUNDED. This whole project is a Node.
- **Node.js (with the .js)** — the engine that runs the app. Different
  from a Node.
- **GROUNDED** — the bigger AI infrastructure that Develop AI is building
  for African newsrooms. This Node lives inside GROUNDED's family of apps.
- **Engagement rate** — engagement divided by reach, as a percentage.
  The signal this app cares about. (Raw reach is misleading because
  paid boosting and the algorithm can inflate it.)

---

## Getting help

Email Paul at Develop AI. Include:

1. What step you were on.
2. What you expected to happen.
3. What actually happened (paste any error messages exactly).
4. A screenshot if you can.

You're not bothering him by asking. Setup questions are normal. The point
of the Nodes system is that newsrooms own their tools — and that means
the first hour of figuring it out is part of the job, for him too.

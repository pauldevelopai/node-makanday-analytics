**Audience Signal**
https://github.com/pauldevelopai/node-analytics/

This is your newsroom’s audience-analytics app. It reads a Word document of your published stories and their Facebook reach + engagement, and tells you what your audience actually rewards.

Getting it running takes **one command** and a couple of minutes. You don’t install anything by hand, and no prior coding experience is needed.

If you get stuck on any step, that’s normal. Email Paul at Develop AI and tell him exactly what your screen looks like — he’ll get you unstuck. He’s already done this dozens of times.

---

**Before you start: have an AI key ready**

The app uses **Claude** (by Anthropic) to write a short editorial read-out of your data. You need one Anthropic API key.

- **Easiest:** Paul gives you a key on your onboarding call. Have it pasted somewhere handy (a note, an email to yourself). Skip ahead to “Get it running”.
- **Or sign up yourself:** go to console.anthropic.com → Sign up → API Keys → Create Key → copy the key (starts with `sk-ant-`). Then your name (top-right) → Billing → add £5/$5 of credit. That lasts weeks.

Keep your key private — don’t share it or put it in a public document. The app saves it in a file on your own computer that never leaves your machine.

---

**Get it running (one command)**

You’ll use the terminal app that’s **already on your computer** — nothing to download. Open it, paste one line, press Enter. The command sets up everything it needs (the first time it takes a minute or two), then your web browser opens to the dashboard automatically.

**On a Mac**
1. Press **Cmd + Space**, type **Terminal**, press **Enter**. A small window opens.
2. Copy the line below, paste it into that window (Cmd + V), and press **Enter**:

```
curl -fsSL https://grounded.developai.co.za/nodes/analytics/mac | bash
```

**On Windows**
1. Click the **Start** menu, type **PowerShell**, press **Enter**. A blue window opens.
2. Copy the line below, paste it into that window (right-click, or Ctrl + V), and press **Enter**:

```
irm https://grounded.developai.co.za/nodes/analytics/windows | iex
```

That’s it. Watch the messages scroll by. When it’s done you’ll see “**is running**” and your browser will open at `http://localhost:3000`.

> **Keep that terminal window open** while you use the app. As long as it says “is running”, the app is alive. To stop the app, close the window (or press **Ctrl + C** in it).

---

**First time in the app**

1. The very first time, the app shows a welcome screen asking for your Anthropic API key. Paste it into the box and click **Save and continue**.
2. Next you’ll see the dashboard with a big “**Upload your matrix to get started**” box. Drag your *Stories Produced 2025 Social Media Matrix* Word file into that box (or click **Choose Word file**).
3. After a few seconds the dashboard fills in — beats, signal leaders, format, timeline, all of it.
4. Click the **AI Brief** tab, then **Generate brief**. After 15–30 seconds you get the editorial read-out.

You’re running. If you ever need to change your key, click **change api key** in the top-right.

---

**Using it again, and getting updates**

There’s nothing new to learn. **Any day you want to use the app — or to get the latest improvements from Develop AI — just open the terminal and paste the same command again.**

- The first time, it installs everything. Every time after, it just launches.
- It always brings down the latest version, so you’re never out of date.
- **Your AI key and your uploaded data are always kept** — updating never wipes them.

---

**When something goes wrong**

**“This site can’t be reached” in the browser**
The app isn’t running. Look at the terminal window — does it still say “is running”? If you closed it, just paste the command again.

**The welcome screen won’t accept my key**
Make sure you copied the *whole* key (it’s a long string starting `sk-ant-…`). If you’re sure it’s right, your Anthropic account may need credit added in its Billing section.

**The AI brief says “Brief unavailable”**
Usually your provider account is out of credit — top it up in its Billing page. Or your key is wrong — click **change api key** top-right and re-enter it.

**The command seems blocked, or nothing happens**
Some work computers are locked down by an IT department and block this kind of setup. Email Paul — he has a backup method that works on restricted machines.

**Anything else**
Email Paul with: what you were doing, what you expected, what actually happened (paste any error text exactly), and a screenshot if you can.

**Your data stays on your computer.** The matrices you upload and the results live only in this Node's `data/` folder on your machine — nothing is uploaded, committed, or shared anywhere. (Working with especially sensitive sources? Nothing changes by default — but feel free to flag it to Paul if you want a second look at the setup.)

---

**Glossary**

- **Terminal / PowerShell** — a window where you type a command instead of clicking. It comes built into your computer. Don’t be intimidated; it’s just text in, text out.
- **Node (capital N, this app’s kind)** — a newsroom-owned app on GROUNDED. This whole project is a Node.
- **GROUNDED** — the bigger AI infrastructure Develop AI is building for African newsrooms. This Node lives inside GROUNDED’s family of apps.
- **Engagement rate** — engagement divided by reach, as a percentage. The signal this app cares about. (Raw reach is misleading because paid boosting and the algorithm can inflate it.)

---

**Getting help**

Email Paul at Develop AI. Include what step you were on, what you expected, what actually happened (paste any error messages exactly), and a screenshot if you can. You’re not bothering him — setup questions are normal.

---
---

## Advanced — keep your own copy on GitHub (optional)

*Most newsrooms can ignore this section.* The one command above is all you need. This is for newsrooms comfortable with GitHub who want their **own forked copy** of the code — to make their own changes, share improvements back, or have Develop AI push fixes directly to them. Your fork is your own version of the Node, and good changes can flow back so every newsroom benefits. Full walkthrough: [docs/MAKE_IT_YOUR_OWN.md](docs/MAKE_IT_YOUR_OWN.md).

1. **Fork the app.** Sign in at github.com, go to https://github.com/pauldevelopai/node-analytics, click **Fork**, then **Create fork**. You now own a copy under your username.
2. **Add Develop AI as a collaborator** (optional - lets Paul push fixes straight to your fork): on *your* fork, go to **Settings → Collaborators → Add people** and add `pauldevelopai`.
3. **Get it onto your computer.** Easiest is **GitHub Desktop** (desktop.github.com) — install it, sign in, and clone your fork with one click. No command line needed.
4. **Run it.** Double-click `Start.command` (Mac) or `Start.bat` (Windows) in the folder. The first launch may need Node.js installed from nodejs.org.
5. **Update it.** On your fork’s GitHub page click **Sync fork**, then in GitHub Desktop click **Pull origin**. (Or double-click `Update.command` / `Update.bat`.) Your settings, data, and any edits you’ve made are preserved.
6. **Change it and share it back.** Your fork is yours to edit — the beat taxonomy, the dashboard, anything. When you make something good, email Paul (or open a pull request) and he'll fold it into the shared version with credit, so other newsrooms get it too. See [docs/MAKE_IT_YOUR_OWN.md](docs/MAKE_IT_YOUR_OWN.md) for the step-by-step.

If an update ever says it “couldn’t apply automatically” (because you edited a file Paul also changed), email Paul a screenshot — nothing is lost.

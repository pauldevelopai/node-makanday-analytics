**MakanDay Audience Signal**
https://github.com/pauldevelopai/node-makanday-analytics/

This is your newsroom’s audience-analytics app. It reads a Word document of your published stories and their Facebook reach + engagement, and tells you what your audience actually rewards. 
The app will initially run locally on one laptop and the code adjusted and developed by you (the process on how to do this is described below), and then it will be uploaded to being live on the web once ready.

This guide gets it running. No prior coding experience is needed.

If you get stuck on any step, that’s normal. Email Paul at Develop AI and tell him exactly which step you’re on and what your screen looks like — he’ll get you unstuck. He’s already done this dozens of times.

**A quick map of what we’re about to do**

We’ll do five things. Each one is small. After each, the app gets a bit closer to running.
1) Install two free programs on your computer (Node.js and VS Code). These are the tools the app uses.
2) Sign up with an AI provider (Anthropic or OpenAI) so the app can ask AI questions. You’ll add the key inside the app later.
3) Get a copy of the app onto your computer. We do this through GitHub.
4) Run the app for the first time and add your AI key on the welcome screen.
5) Upload your matrix and see the dashboard.

Ready? Let’s go.

**Part 1 — Install Node.js (the engine that runs the app)**
Open your web browser (Chrome, Safari, Firefox, Edge — any).
In the address bar at the top, type: nodejs.org — then press Enter.
You’ll see a page with two big green buttons. Click the one on the left, labelled “LTS” (it stands for “Long-Term Support” — the stable version everyone uses).
A file downloads. When it finishes, find it in your Downloads folder.
Double-click that file to open the installer. Click Continue / Next on every screen, accept the agreement, and click Install. You may need to type your computer password.
When it says “Installation Successful” or similar, click Close.
You won’t see any new app icon. That’s normal. Node.js works behind the scenes — we’ll prove it’s installed in a later step.

**Part 2 — Install VS Code (where you’ll type commands)**
VS Code is a free app from Microsoft. It’s what we’ll use to look at the app’s code and to type the few commands needed to start it.
In your browser, go to: code.visualstudio.com
Click the big blue Download button. The site will pick the right version for your computer.
Open the downloaded file and follow the installer. Accept the defaults.
When it’s installed, open VS Code. You should see a welcome screen with “Get Started” written on it. Close that tab — we’ll come back here in a moment.

**Part 3 — You’ll add your AI key inside the app**
The “AI brief” feature in this app asks an AI to summarise what your data is telling you. The app works with either Claude (from Anthropic) or GPT (from OpenAI) — you only need an account with one of them.
You’ll add your key inside the app itself in Part 5, through a simple form. Nothing to do at this stage in the README — just have an account ready. If you don’t have either yet, pick one and sign up now:
Anthropic (Claude): go to console.anthropic.com, click Sign up, use your work email. Once signed in, click API Keys in the left sidebar, click Create Key, copy the key (starts with sk-ant-), paste it somewhere safe. Then click your name top-right → Billing and add £5 or $5 of credit. That covers many weeks of use.
OpenAI (GPT): go to platform.openai.com/api-keys, sign up, click Create new secret key, copy the key (starts with sk-), paste it somewhere safe. Then go to Settings → Billing and add £5 or $5 of credit.
Keep your key private — don’t email it, don’t share it, don’t put it in a public document. In Part 5 the app will save it in a file on your own computer that never gets uploaded to GitHub.

Part 4 — Get the app onto your computer
This is the GitHub bit. GitHub is a website where the app's code lives. You'll make your own personal copy of it on GitHub (called a fork), then download that copy onto your computer.
Your copy is yours forever — even if Develop AI disappears tomorrow, your copy keeps working.

**Step 4a — Make a GitHub account**
Skip this step if you already have one.

Go to github.com
Click Sign up
Follow the steps using your work email

**Step 4b — Fork the app to your own account**

Sign in to GitHub
Go to https://github.com/pauldevelopai/node-makanday-analytics
In the top-right of the page, click Fork
On the next screen, click the green Create fork button (leave all settings as they are)

After a moment, you'll see a copy of the project under your username. Check the top-left — it should read:
your-username / node-makanday-analytics
You now own a copy. Keep this browser tab open — you'll need it for the next step.

**Step 4c — Download your copy to your computer**

On your fork's page, find the green Code button (above the file list) and click it
In the dropdown menu, click Download ZIP
The ZIP file lands in your Downloads folder
Unzip it:

Mac: double-click the ZIP
Windows: right-click → Extract All

You'll get a folder called something like node-makanday-analytics-main
Drag that folder into your Documents folder
Rename it to something cleaner — MakanDay Analytics works well

**Step 4d — Open the folder in VS Code**

Open VS Code (the app you installed in Part 2)
In the top menu, click File → Open Folder…
Choose the folder you just moved (MakanDay Analytics)
Click Open (Mac) or Select Folder (Windows)
If VS Code asks "Do you trust the authors of the files in this folder?", click Yes, I trust the authors

On the left side of VS Code you should now see a list of files and folders:
data
lib
public
tests
index.js
package.json
That's the app.

**Part 5 — Run the app for the first time**
You're nearly there. Two commands to type, then the app opens.

**Step 5a — Open VS Code's terminal**

In VS Code, click View → Terminal in the top menu
A new panel opens at the bottom of VS Code with a prompt

This is the terminal — where you type commands.
You should see something like:
your-name@computer MakanDay Analytics %
Or on Windows:
PS C:\Users\your-name\Documents\MakanDay Analytics>
The important thing: the prompt should mention your folder name.

**Step 5b — Install the app's parts**

Click inside the terminal so it's focused
Type this exactly and press Enter:

npm install
Lots of text scrolls by. This takes 30–60 seconds — it's downloading the pieces the app needs.
When it finishes, you'll see a fresh prompt (an empty line waiting for your next command). There's no big "Success!" message — silence means success.

If you see an error saying command not found: npm: Node.js didn't install correctly. Quit VS Code, restart your computer, and try Step 5b again from a fresh VS Code window. If it's still broken, go back to Part 1.

**Step 5c — Start the app**
In the same terminal, type:
npm start
After a moment, you'll see:
✓ MakanDay Audience Signal is running.
✓ Open this in your web browser: http://localhost:3000

Press Ctrl+C in this window to stop it.
Leave this terminal window open. As long as it says "is running", the app is alive. If you close the terminal, the app stops.

**Part 6 — Open the app, add your key, upload your matrix**
Open your web browser. In the address bar, type: localhost:3000 then press Enter.
The very first time you open the app, you’ll see a welcome screen asking which AI provider you want to use.
Click Anthropic or OpenAI (whichever you signed up with in Part 3), paste your API key into the box, and click Save and continue. The app stores your key on your own computer — it never gets uploaded to GitHub.
Next you’ll see the dashboard with a big “Upload your matrix to get started” box. Drag your Stories Produced 2025 Social Media Matrix Word file directly into that box. (Or click “Choose Word file” and pick it.)
After a few seconds, the dashboard appears with your data — beats, signal leaders, format, timeline, all of it.
Click the AI Brief tab, then Generate brief. After 15–30 seconds, your AI returns the editorial read-out.
That’s it. You’re running.
If you ever need to change your API key (e.g. you switch providers, or your key expires), click change api key in the top-right of the dashboard. You’ll see the welcome screen again.

**Using the app after the again**
You don’t have to repeat the setup. From now on:
On a Mac: double-click Start.command in your MakanDay Analytics folder. (The first time, your Mac may say “cannot verify the developer”. Right-click the file → Open → click Open in the dialog. After that, double-clicking works normally.)
On Windows: double-click Start.bat in your MakanDay Analytics folder.
The terminal window opens, the server starts, and your browser opens automatically to the dashboard.
To stop the app: close the terminal window (or press Ctrl+C in it).

**Getting updates from Develop AI**
Develop AI will improve the Node over time. Getting the latest version is one double-click:
On a Mac: double-click Update.command in your MakanDay Analytics folder.
On Windows: double-click Update.bat.
A terminal window opens, downloads the latest version, and applies it. Your settings, your data, and any changes you’ve made to the code are preserved automatically. When it says “Update complete”, close the window and double-click Start again.
The first time you run Update, your computer may say it needs a tool called git. The Update window tells you exactly what to do:
Mac: you’ll be prompted to install Apple’s Command Line Tools. Click Install on the pop-up. It takes about 5 minutes. Then double-click Update.command again.
Windows: open the link the window gives you, download the Git installer, click Next on every screen, restart, then double-click Update.bat again.
This is a one-time install. After that, updates are always one double-click.
If the Update window ever says it couldn’t apply the update automatically (because you edited a file that the new version also changed), it’ll tell you to email Paul. Send him a screenshot of the window; he’ll help. Nothing is lost — your edits are still where you left them.

**When something goes wrong**

**“command not found: npm” or “node”**
Node.js isn’t installed correctly. Quit VS Code, restart your computer, and re-do Part 1.
“EADDRINUSE: address already in use :::3000”
The app is already running in another terminal window. Close that other terminal first.

**The welcome screen won’t accept my key**
Make sure you copied the whole key — it’s a long string. For Anthropic it starts with sk-ant-; for OpenAI it starts with sk-. If you’re sure the key is right, your provider account may need credit added in its Billing section.

**Browser shows “This site can’t be reached”**
The app isn’t running. Look at the terminal — does it still say “is running”? If not, run npm start again.

**The AI brief says “Brief unavailable”**
Most often, your provider account has run out of credit. Top it up in your provider’s Billing page. Or your key is wrong — click change api key top-right and re-enter it.

**Update.command / Update.bat says “couldn’t apply the update”**
You edited a file that Paul also changed in the new version. Email Paul with a screenshot of the window; he’ll help. Nothing is lost.
Something else
Email Paul with: (a) which step you’re on, (b) what command you typed, (c) the exact text of any error message. A screenshot helps.

If you ever want to use this Node for confidential material (e.g. unpublished sources), talk to Paul first — the setup needs adjusting so that data doesn’t leave your machine.

**Glossary**
Terminal — a window where you type commands instead of clicking. Don’t be intimidated; it’s just text in, text out.
npm — “Node Package Manager”. The program that downloads the pieces this app needs. Comes with Node.js.
GitHub — a website that stores code and tracks changes to it.
Fork — your personal copy of someone else’s GitHub project.
git — the tool the Update script uses to fetch the latest version. Comes free with Mac (via Apple’s Command Line Tools) and Windows (via Git for Windows).
Node (capital N, this app’s kind) — a newsroom-owned app on GROUNDED. This whole project is a Node.
Node.js (with the .js) — the engine that runs the app. Different from a Node.
GROUNDED — the bigger AI infrastructure that Develop AI is building for African newsrooms. This Node lives inside GROUNDED’s family of apps.
Engagement rate — engagement divided by reach, as a percentage. The signal this app cares about. (Raw reach is misleading because paid boosting and the algorithm can inflate it.)

**Getting help**
Email Paul at Develop AI. Include:
What step you were on.
What you expected to happen.
What actually happened (paste any error messages exactly).
A screenshot if you can.
You’re not bothering him by asking. Setup questions are normal. The point of the Nodes system is that newsrooms own their tools — and that means the first hour of figuring it out is part of the job, for him too.



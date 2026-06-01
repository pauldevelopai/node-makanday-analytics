// public/app.js
const $ = s => document.querySelector(s);
const fmt = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(Math.round(n));

let REPORT = null, CURRENT = null, ALL_SOURCES = [];

// Newsroom-driven branding — fills the masthead, title and footer from
// whatever /api/setup reports (NEWSROOM env / saved meta). No name is baked
// into the HTML; this is the single place the dashboard learns who it's for.
function applyBrand(setup) {
  const product = setup.productName || "Audience Signal";
  const nr = setup.newsroom;
  const full = nr ? `${nr} ${product}` : product;
  document.title = full;
  const k = $("#brand-kicker");   if (k) k.textContent = `${nr ? nr + " · " : ""}${product} Node · running locally`;
  const h = $("#brand-h1");       if (h) h.innerHTML = `${nr ? escapeHtml(nr) + " " : ""}<span>${escapeHtml(product)}</span>`;
  const f = $("#brand-foot");     if (f) f.textContent = `${full} — a Node on GROUNDED, running on your computer`;
  const af = $("#activity-file"); if (af && setup.activityFile) af.textContent = setup.activityFile;
}

async function boot() {
  // Three states: setup → empty → dashboard.
  const setup = await fetch("api/setup").then(r => r.json()).catch(() => ({ configured: false }));
  applyBrand(setup);
  if (!setup.configured) { showSetup(); return; }
  $("#open-setup").style.display = "inline-block";

  const sources = await fetch("api/sources").then(r => r.json()).catch(() => []);
  ALL_SOURCES = sources;
  if (!sources.length) { showEmpty(); return; }
  const picker = $("#picker");
  picker.innerHTML = sources.map(s => `<option value="${s.source_label}">${s.source_label} · ${s.n}</option>`).join("");
  picker.style.display = "inline-block";
  $("#upload-more").style.display = "inline-block";
  picker.onchange = () => load(picker.value);
  $("#upload-more").onclick = () => showEmpty();
  load(sources[0].source_label);
}

function showSetup() {
  $("#setup").style.display = "block";
  $("#empty").style.display = "none";
  $("#dash").style.display = "none";
}
function showEmpty() {
  $("#setup").style.display = "none";
  $("#empty").style.display = "block";
  $("#dash").style.display = "none";
  if (typeof resetUpload === "function") resetUpload();
}
function showDash() {
  $("#setup").style.display = "none";
  $("#empty").style.display = "none";
  $("#dash").style.display = "block";
}

// ── Setup form ──────────────────────────────────────────────────────────────
let chosenProvider = "anthropic";
document.querySelectorAll(".setup-opt").forEach(el => {
  el.addEventListener("click", () => {
    document.querySelectorAll(".setup-opt").forEach(x => x.classList.remove("on"));
    el.classList.add("on");
    chosenProvider = el.dataset.provider;
  });
});

$("#open-setup")?.addEventListener("click", e => {
  e.preventDefault();
  $("#setup-err").classList.remove("on");
  $("#setup-key-input").value = "";
  showSetup();
});

$("#setup-save")?.addEventListener("click", async () => {
  const errBox = $("#setup-err");
  errBox.classList.remove("on");
  const apiKey = $("#setup-key-input").value.trim();
  if (!apiKey) { errBox.textContent = "Paste your API key first."; errBox.classList.add("on"); return; }
  const btn = $("#setup-save"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    const res = await fetch("api/setup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: chosenProvider, apiKey })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Save failed");
    await boot();
  } catch (e) {
    errBox.textContent = e.message; errBox.classList.add("on");
  } finally {
    btn.disabled = false; btn.textContent = "Save and continue";
  }
});

async function load(source, fit) {
  CURRENT = source;
  let url = `api/report?source=${encodeURIComponent(source)}`;
  if (fit !== undefined) url += `&fit=${fit}`;
  REPORT = await fetch(url).then(r => r.json());
  if (REPORT.empty) { showEmpty(); return; }
  showDash();
  $("#m-n").textContent = REPORT.topline.stories;
  renderTopline(); renderBeats(); renderBeatsControls(); renderSignal("rate");
  renderTrend(); renderFormat(); renderHeadline(); renderTimeline();
  renderWords(); renderSentiment(); renderComparePicker();
  renderQuality();
  renderActivity();
  $("#ai-out").className = "placeholder";
  $("#ai-out").textContent = "No brief yet. Press “Generate brief”.";
  $("#gen").textContent = "Generate brief";
}

function bars(el, rows, label, valOf, fmtVal, mutedBelow = 0.55) {
  const m = Math.max(...rows.map(valOf), 0.01);
  el.innerHTML = rows.map(r => {
    const v = valOf(r);
    return `<div class="barrow">
      <div class="barlbl"><b>${label(r)}</b><span class="n">${r._meta || ""}</span></div>
      <div class="track"><div class="fill${v < m * mutedBelow ? " muted" : ""}" style="width:${(v / m * 100).toFixed(1)}%"></div></div>
      <div class="barval">${fmtVal(v, r)}</div></div>`;
  }).join("");
}

function renderTopline() {
  const t = REPORT.topline;
  const cells = [
    ["Stories tracked", t.stories, ""],
    ["Total reach", fmt(t.totalReach), " FB"],
    ["Median reach", fmt(t.medianReach), ""],
    ["Median eng. rate", t.medianRate.toFixed(2), "%"]
  ];
  $("#topline").innerHTML = cells.map(c =>
    `<div class="stat"><div class="l">${c[0]}</div><div class="v">${c[1]}<small>${c[2]}</small></div></div>`).join("");
}

function renderBeats() {
  const rows = REPORT.byBeat.map(b => ({ ...b, _meta: `[${b.n}]${b.significant ? " ★" : ""}` }));
  bars($("#beats"), rows, r => r.beat, r => r.medianRate, v => v.toFixed(2) + "%");
}

// Beat-taxonomy status + the "fit to my coverage" control.
function renderBeatsControls() {
  const status = $("#beats-status"), reset = $("#reset-beats"), err = $("#beats-err");
  if (err) { err.style.display = "none"; err.textContent = ""; }
  const ai = REPORT.beatsSource === "ai";
  if (status) {
    status.textContent = ai
      ? `Beats fitted to your coverage (${(REPORT.beatNames || []).length})`
      : "Using the generic default beats";
  }
  if (reset) reset.style.display = ai ? "inline" : "none";
  if (REPORT.beatsError && err) { err.textContent = REPORT.beatsError; err.style.display = "block"; }
}

$("#fit-beats")?.addEventListener("click", async function () {
  if (!CURRENT) return;
  const btn = this; btn.disabled = true; btn.textContent = "Reading your coverage…";
  try { await load(CURRENT, 1); } finally { btn.disabled = false; btn.textContent = "Fit beats to my coverage"; }
});

$("#reset-beats")?.addEventListener("click", async function (e) {
  e.preventDefault();
  if (CURRENT) await load(CURRENT, 0);
});

function renderSignal(mode) {
  const rows = mode === "reach" ? REPORT.reachGiants : REPORT.signalLeaders;
  const note = $("#signal-note");
  if (note) {
    note.textContent = mode === "reach" || !REPORT.reachFloor
      ? ""
      : `Ranked among stories that reached at least ${fmt(REPORT.reachFloor)} people — so a lucky tiny post can’t crowd out real wins.`;
  }
  $("#signal-tb").innerHTML = rows.map(d => {
    const cls = d.rate >= 2 ? "hi" : d.rate < 1 ? "lo" : "";
    const bcls = d.band === "exceptional" ? "exceptional" : d.band === "low" ? "low" : "";
    return `<tr>
      <td class="tt">${escapeHtml(d.title)} <span class="dim mono">· ${d.month}</span></td>
      <td><span class="pill">${d.beats[0]}</span></td>
      <td><span class="pill ${bcls}">${d.band}</span></td>
      <td class="r mono">${d.reach.toLocaleString()}</td>
      <td class="r mono">${d.engagement}</td>
      <td class="r rate ${cls}" title="95% confidence: ${d.ciLo}–${d.ciHi}%">${d.rate.toFixed(2)}%</td></tr>`;
  }).join("");
}
$("#sg-rate").onclick = function () { this.classList.add("on"); $("#sg-reach").classList.remove("on"); renderSignal("rate"); };
$("#sg-reach").onclick = function () { this.classList.add("on"); $("#sg-rate").classList.remove("on"); renderSignal("reach"); };

function renderTrend() {
  $("#trend-tb").innerHTML = REPORT.risingFading.map(x => {
    const up = x.delta >= 0;
    return `<tr>
      <td class="tt">${x.beat}</td>
      <td class="r mono">${x.earlyRate.toFixed(2)}%</td>
      <td class="r mono">${x.lateRate.toFixed(2)}%</td>
      <td class="r delta ${up ? "up" : "down"}">${up ? "+" : ""}${x.delta.toFixed(2)}</td>
      <td><span class="pill ${up ? "exceptional" : "low"}">${x.direction}</span></td></tr>`;
  }).join("") || `<tr><td colspan="5" class="dim">Not enough stories per beat in both halves.</td></tr>`;
}

function renderFormat() {
  const rows = REPORT.byFormat.map(f => ({ ...f, _meta: `[${f.n}]${f.significant ? " ★" : ""} · med reach ${fmt(f.medianReach)}` }));
  bars($("#format"), rows, r => r.type, r => r.medianRate, v => v.toFixed(2) + "%", 0.6);
}

function renderHeadline() {
  const lbl = { hasQuestion: "Question (?)", hasQuote: "Quote", hasColon: "Colon (:)", hasNumber: "Number", isShouty: "ALL-CAPS heavy" };
  $("#hl-tb").innerHTML = REPORT.headlineSignal.map(h => {
    const d = +(h.withRate - h.withoutRate).toFixed(2);
    return `<tr>
      <td class="tt">${lbl[h.feature] || h.feature}</td>
      <td class="r mono">${h.withN}</td>
      <td class="r mono">${h.withRate.toFixed(2)}%</td>
      <td class="r mono">${h.withoutRate.toFixed(2)}%</td>
      <td class="r delta ${d >= 0 ? "up" : "down"}">${d >= 0 ? "+" : ""}${d.toFixed(2)}</td>
      <td class="mono">${h.significant ? "★" : "—"}</td></tr>`;
  }).join("");
}

function renderTimeline() {
  const rows = REPORT.timeline.map(m => ({ ...m, _meta: `[${m.n}] · rate ${m.medianRate.toFixed(2)}%` }));
  bars($("#timeline"), rows, r => r.label || r.month, r => r.medianReach, v => fmt(v), 0);
}

// ── Words: which terms move engagement ───────────────────────────────────────
function wordRows(list) {
  if (!list || !list.length) return `<tr><td colspan="6" class="dim">Not enough repeated terms yet — needs more stories.</td></tr>`;
  return list.map(t => `<tr>
    <td class="tt">${escapeHtml(t.term)}${t.type === "phrase" ? ' <span class="dim mono">· phrase</span>' : ""}</td>
    <td class="r mono">${t.n}</td>
    <td class="r mono">${t.withRate.toFixed(2)}%</td>
    <td class="r mono">${t.withoutRate.toFixed(2)}%</td>
    <td class="r delta ${t.lift >= 0 ? "up" : "down"}">${t.lift >= 0 ? "+" : ""}${t.lift.toFixed(2)}</td>
    <td class="mono">${t.significant ? "★" : ""}</td></tr>`).join("");
}
function renderWords() {
  const w = REPORT.wordSignal || { lifters: [], draggers: [] };
  $("#words-up").innerHTML = wordRows(w.lifters);
  $("#words-down").innerHTML = wordRows(w.draggers);
}

// ── Sentiment: headline emotion vs resonance ─────────────────────────────────
function renderSentiment() {
  const s = REPORT.sentiment || { groups: [] };
  const labelMap = { negative: "Negative framing", neutral: "Neutral", positive: "Positive framing" };
  const rows = s.groups.map(g => ({ ...g, label2: labelMap[g.label] || g.label, _meta: `[${g.n}] · med reach ${fmt(g.medianReach)}` }));
  bars($("#sentiment"), rows, r => r.label2, r => r.medianRate, v => v.toFixed(2) + "%", 0.6);
  const c = $("#sentiment-callout");
  const nv = s.negativeVsPositive;
  if (!nv) { c.innerHTML = ""; return; }
  const winner = nv.negRate >= nv.posRate ? "Negative" : "Positive";
  const hi = Math.max(nv.negRate, nv.posRate).toFixed(2), lo = Math.min(nv.negRate, nv.posRate).toFixed(2);
  c.innerHTML = nv.significant
    ? `<b>${winner}-framed headlines convert better</b> — ${hi}% vs ${lo}%, and the gap is statistically significant. ★`
    : `Negative ${nv.negRate}% vs positive ${nv.posRate}% — the difference isn’t statistically significant (could be chance).`;
}

// ── Compare: period-over-period ──────────────────────────────────────────────
const signedPct = v => (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
const signedInt = v => (v >= 0 ? "+" : "−") + fmt(Math.abs(v));

function renderComparePicker() {
  const pick = $("#cmp-pick");
  if (!pick) return;
  const others = (ALL_SOURCES || []).filter(s => s.source_label !== CURRENT);
  $("#cmp-empty").style.display = "block";
  $("#cmp-out").style.display = "none";
  if (!others.length) {
    pick.innerHTML = `<option value="">(no other uploads)</option>`;
    pick.disabled = true;
    $("#cmp-empty").textContent = "You need at least two uploads to compare. Upload another matrix to use this.";
    return;
  }
  pick.disabled = false;
  pick.innerHTML = `<option value="">— choose an upload —</option>` +
    others.map(s => `<option value="${escapeHtml(s.source_label)}">${escapeHtml(s.source_label)} · ${s.n}</option>`).join("");
  pick.onchange = async () => {
    const base = pick.value;
    if (!base) { $("#cmp-empty").style.display = "block"; $("#cmp-out").style.display = "none"; return; }
    const rep = await fetch(`api/report?source=${encodeURIComponent(CURRENT)}&baseline=${encodeURIComponent(base)}`)
      .then(r => r.json()).catch(() => ({}));
    renderComparison(rep.comparison);
  };
}

function cmpRows(list) {
  if (!list || !list.length) return `<tr><td colspan="5" class="dim">No overlap to compare.</td></tr>`;
  return list.map(x => {
    const pill = x.status === "new" ? `<span class="pill exceptional">new</span>`
      : x.status === "gone" ? `<span class="pill low">gone</span>`
      : `<span class="pill ${x.delta >= 0 ? "exceptional" : "low"}">${x.status}</span>`;
    return `<tr>
      <td class="tt">${escapeHtml(x.name)}</td>
      <td class="r mono">${x.currentRate == null ? "—" : x.currentRate.toFixed(2) + "%"}</td>
      <td class="r mono">${x.baselineRate == null ? "—" : x.baselineRate.toFixed(2) + "%"}</td>
      <td class="r delta ${x.delta >= 0 ? "up" : "down"}">${x.delta == null ? "—" : (x.delta >= 0 ? "+" : "") + x.delta.toFixed(2)}</td>
      <td>${pill}</td></tr>`;
  }).join("");
}

function renderComparison(cmp) {
  if (!cmp) { $("#cmp-empty").style.display = "block"; $("#cmp-out").style.display = "none"; return; }
  $("#cmp-empty").style.display = "none";
  $("#cmp-out").style.display = "block";
  const t = cmp.topline;
  const cells = [
    ["Median eng. rate", t.current.medianRate.toFixed(2) + "%", signedPct(t.rateDelta)],
    ["Median reach", fmt(t.current.medianReach), signedInt(t.reachDelta)],
    ["Stories", t.current.stories, signedInt(t.storiesDelta)]
  ];
  $("#cmp-topline").innerHTML = cells.map(c =>
    `<div class="stat"><div class="l">${c[0]} <span class="dim">vs ${escapeHtml(cmp.labels.baseline)}</span></div><div class="v">${c[1]} <small>${c[2]}</small></div></div>`).join("");
  $("#cmp-beats").innerHTML = cmpRows(cmp.beats);
  $("#cmp-formats").innerHTML = cmpRows(cmp.formats);
}

async function renderQuality() {
  const q = await fetch(`api/quality?source=${encodeURIComponent(CURRENT)}`).then(r => r.json()).catch(() => null);
  if (!q || q.empty) { $("#q-grid").innerHTML = ""; $("#q-tb").innerHTML = `<tr><td colspan="4" class="dim">No quality report.</td></tr>`; return; }
  const cells = [
    ["Stories kept", q.story_count, "ok"],
    ["Errors", q.errors, q.errors ? "err" : "ok"],
    ["Warnings", q.warnings, ""],
    ["Uncategorised", q.uncategorised, ""]
  ];
  $("#q-grid").innerHTML = cells.map(c =>
    `<div class="stat"><div class="l">${c[0]}</div><div class="v ${c[2]}">${c[1]}</div></div>`).join("");
  const issues = q.issues || [];
  $("#q-tb").innerHTML = issues.map(i =>
    `<tr><td class="mono">${i.n}</td><td><span class="pill ${i.level === "error" ? "low" : ""}">${i.level}</span></td>
     <td class="mono dim">${i.field}</td><td>${escapeHtml(i.msg)}</td></tr>`).join("")
    || `<tr><td colspan="4" class="dim">No issues — clean ingest.</td></tr>`;
}

async function renderActivity() {
  const data = await fetch("api/activity").then(r => r.json()).catch(() => ({ activity: [] }));
  const rows = (data.activity || []).slice().reverse();   // newest first
  if (!rows.length) {
    $("#activity-tb").innerHTML = `<tr><td colspan="6" class="dim">No activity yet — upload a matrix or generate a brief.</td></tr>`;
    return;
  }
  const note = data.truncated
    ? `<tr><td colspan="6" class="dim">Showing the most recent ${rows.length} entries — older activity stays in the log file.</td></tr>`
    : "";
  $("#activity-tb").innerHTML = note + rows.map(r => {
    const when = (r.ts || "").replace("T", " ").slice(0, 19);
    const op = r.op || r.kind || "—";
    const src = r.source || r.source_label || "—";
    const pm = r.provider ? `${r.provider} / ${r.model || "?"}` : "—";
    const dur = r.duration_ms ? `${r.duration_ms} ms` : "—";
    let detail = "";
    if (r.op === "ingest" && r.success) {
      detail = `${r.story_count} stories · ${r.warnings || 0} warnings · ${r.errors || 0} errors`;
    } else if (r.op === "brief" && r.success) {
      detail = `<details><summary>view brief (${(r.response || "").length} chars)</summary>` +
        `<pre style="white-space:pre-wrap;font-family:var(--mono);font-size:12px;margin:6px 0;color:var(--paper-dim)">${escapeHtml(r.response || "")}</pre></details>`;
    } else if (r.success === false) {
      detail = `<span style="color:var(--alert)">error: ${escapeHtml(r.error || "unknown")}</span>`;
    }
    return `<tr>
      <td class="mono dim" style="white-space:nowrap">${when}</td>
      <td><span class="pill">${op}</span></td>
      <td class="mono">${src}</td>
      <td class="mono dim">${pm}</td>
      <td class="r mono">${dur}</td>
      <td>${detail}</td></tr>`;
  }).join("");
}

document.querySelector(".tabs")?.addEventListener("click", e => {
  const t = e.target.closest(".tab[data-v]"); if (!t) return;
  document.querySelectorAll(".tab[data-v]").forEach(x => x.classList.remove("on"));
  document.querySelectorAll(".view").forEach(x => x.classList.remove("on"));
  t.classList.add("on"); $("#v-" + t.dataset.v).classList.add("on");
});

$("#gen").addEventListener("click", async function () {
  const btn = this, out = $("#ai-out");
  btn.disabled = true; btn.textContent = "Reading signal…";
  out.className = ""; out.innerHTML = '<span class="spin"></span><span class="placeholder">Claude is reading the signal…</span>';
  try {
    const data = await fetch("api/brief", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: CURRENT })
    }).then(r => r.json());
    if (data.error) throw new Error(data.error);
    let html = (data.brief || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/^## (.+)$/gm, "<h3>$1</h3>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    const lines = html.split("\n"); let buf = "", inList = false;
    for (let ln of lines) {
      ln = ln.trim();
      if (ln.startsWith("- ")) { if (!inList) { buf += "<ul>"; inList = true; } buf += "<li>" + ln.slice(2) + "</li>"; continue; }
      if (inList) { buf += "</ul>"; inList = false; }
      if (ln.startsWith("<h3>")) buf += ln; else if (ln) buf += "<p>" + ln + "</p>";
    }
    if (inList) buf += "</ul>";
    out.innerHTML = buf; btn.textContent = "Regenerate";
  } catch (e) {
    out.innerHTML = `<p style="color:var(--alert)"><strong>Brief unavailable.</strong> ${e.message}. Check your ANTHROPIC_API_KEY in .env, then retry.</p>`;
    btn.textContent = "Retry";
  }
  btn.disabled = false;
});

// ── Upload: choose/drop → stage → explicit Run → process ────────────────────
const empty = $("#empty"), input = $("#file-input"), errBox = $("#upload-error");
const chooseBox = $("#choose"), stagedBox = $("#staged"), processingBox = $("#processing");
const stagedNameEl = $("#staged-name"), runBtn = $("#run-btn");
let stagedFile = null;

function showUploadError(msg) { errBox.textContent = msg; errBox.style.display = "block"; }
function clearUploadError() { errBox.textContent = ""; errBox.style.display = "none"; }

// Reset the empty state back to the "choose a file" step.
function resetUpload() {
  stagedFile = null;
  if (input) input.value = "";
  if (chooseBox) chooseBox.style.display = "block";
  if (stagedBox) stagedBox.style.display = "none";
  if (processingBox) processingBox.style.display = "none";
  empty.classList.remove("busy");
  clearUploadError();
}

// A file was picked/dropped — hold it and show the Run button (don't upload yet).
function stageFile(file) {
  if (!file) return;
  stagedFile = file;
  clearUploadError();
  stagedNameEl.textContent = file.name;
  chooseBox.style.display = "none";
  processingBox.style.display = "none";
  stagedBox.style.display = "block";
}

// Run button — now (and only now) do the upload, with a visible processing state.
async function runUpload() {
  if (!stagedFile) return;
  clearUploadError();
  stagedBox.style.display = "none";
  processingBox.style.display = "block";
  empty.classList.add("busy");
  const fd = new FormData();
  fd.append("file", stagedFile);
  fd.append("sourceLabel", stagedFile.name.replace(/\.[^.]+$/, ""));
  try {
    const res = await fetch("api/ingest", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Upload failed");
    await boot();
  } catch (e) {
    showUploadError(e.message);
    // Back to the staged step so they can retry without re-choosing the file.
    processingBox.style.display = "none";
    stagedBox.style.display = "block";
    empty.classList.remove("busy");
  }
}

input.addEventListener("change", () => stageFile(input.files[0]));
runBtn.addEventListener("click", runUpload);
$("#choose-different").addEventListener("click", e => { e.preventDefault(); resetUpload(); });
;["dragenter", "dragover"].forEach(ev => empty.addEventListener(ev, e => { e.preventDefault(); empty.classList.add("over"); }));
;["dragleave", "drop"].forEach(ev => empty.addEventListener(ev, e => { e.preventDefault(); empty.classList.remove("over"); }));
empty.addEventListener("drop", e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) stageFile(f); });

function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

boot();

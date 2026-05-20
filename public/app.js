// public/app.js
const $ = s => document.querySelector(s);
const fmt = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(Math.round(n));

let REPORT = null, CURRENT = null;

async function boot() {
  const sources = await fetch("/api/sources").then(r => r.json()).catch(() => []);
  if (!sources.length) { showEmpty(); return; }
  const picker = $("#picker");
  picker.innerHTML = sources.map(s => `<option value="${s.source_label}">${s.source_label} · ${s.n}</option>`).join("");
  picker.style.display = "inline-block";
  $("#upload-more").style.display = "inline-block";
  picker.onchange = () => load(picker.value);
  $("#upload-more").onclick = () => showEmpty();
  load(sources[0].source_label);
}

function showEmpty() {
  $("#empty").style.display = "block";
  $("#dash").style.display = "none";
}
function showDash() {
  $("#empty").style.display = "none";
  $("#dash").style.display = "block";
}

async function load(source) {
  CURRENT = source;
  REPORT = await fetch(`/api/report?source=${encodeURIComponent(source)}`).then(r => r.json());
  if (REPORT.empty) { showEmpty(); return; }
  showDash();
  $("#m-n").textContent = REPORT.topline.stories;
  renderTopline(); renderBeats(); renderSignal("rate");
  renderTrend(); renderFormat(); renderHeadline(); renderTimeline();
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
  const rows = REPORT.byBeat.map(b => ({ ...b, _meta: `[${b.n}]` }));
  bars($("#beats"), rows, r => r.beat, r => r.medianRate, v => v.toFixed(2) + "%");
}

function renderSignal(mode) {
  const rows = mode === "reach" ? REPORT.reachGiants : REPORT.signalLeaders;
  $("#signal-tb").innerHTML = rows.map(d => {
    const cls = d.rate >= 2 ? "hi" : d.rate < 1 ? "lo" : "";
    const bcls = d.band === "exceptional" ? "exceptional" : d.band === "low" ? "low" : "";
    return `<tr>
      <td class="tt">${escapeHtml(d.title)} <span class="dim mono">· ${d.month}</span></td>
      <td><span class="pill">${d.beats[0]}</span></td>
      <td><span class="pill ${bcls}">${d.band}</span></td>
      <td class="r mono">${d.reach.toLocaleString()}</td>
      <td class="r mono">${d.engagement}</td>
      <td class="r rate ${cls}">${d.rate.toFixed(2)}%</td></tr>`;
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
  const rows = REPORT.byFormat.map(f => ({ ...f, _meta: `[${f.n}] · med reach ${fmt(f.medianReach)}` }));
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
      <td class="r delta ${d >= 0 ? "up" : "down"}">${d >= 0 ? "+" : ""}${d.toFixed(2)}</td></tr>`;
  }).join("");
}

function renderTimeline() {
  const rows = REPORT.timeline.map(m => ({ ...m, _meta: `[${m.n}] · rate ${m.medianRate.toFixed(2)}%` }));
  bars($("#timeline"), rows, r => r.month, r => r.medianReach, v => fmt(v), 0);
}

async function renderQuality() {
  const q = await fetch(`/api/quality?source=${encodeURIComponent(CURRENT)}`).then(r => r.json()).catch(() => null);
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
  const data = await fetch("/api/activity").then(r => r.json()).catch(() => ({ activity: [] }));
  const rows = (data.activity || []).slice().reverse();   // newest first
  if (!rows.length) {
    $("#activity-tb").innerHTML = `<tr><td colspan="6" class="dim">No activity yet — upload a matrix or generate a brief.</td></tr>`;
    return;
  }
  $("#activity-tb").innerHTML = rows.map(r => {
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
    const data = await fetch("/api/brief", {
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

// ── Upload (empty-state + "upload another") ─────────────────────────────────
const empty = $("#empty"), input = $("#file-input"), errBox = $("#upload-error");
function showUploadError(msg) { errBox.textContent = msg; errBox.style.display = "block"; }
function clearUploadError() { errBox.textContent = ""; errBox.style.display = "none"; }
async function upload(file) {
  if (!file) return;
  clearUploadError();
  empty.classList.add("busy");
  const fd = new FormData(); fd.append("file", file); fd.append("sourceLabel", file.name.replace(/\.[^.]+$/, ""));
  try {
    const res = await fetch("/api/ingest", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Upload failed");
    await boot();
  } catch (e) { showUploadError(e.message); empty.classList.remove("busy"); }
}
input.addEventListener("change", () => upload(input.files[0]));
;["dragenter", "dragover"].forEach(ev => empty.addEventListener(ev, e => { e.preventDefault(); empty.classList.add("over"); }));
;["dragleave", "drop"].forEach(ev => empty.addEventListener(ev, e => { e.preventDefault(); empty.classList.remove("over"); }));
empty.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) upload(f); });

function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

boot();

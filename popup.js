/* Extensor popup logic */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const LS_QUICK = "extensor:quickSlots";
const LS_CUSTOM = "extensor:customShortcuts";
const selfId = chrome.runtime.id;

if (new URLSearchParams(location.search).get("fullpage")) document.body.classList.add("fullpage");

let ALL = [];
let COMMANDS = [];
let recording = false;

const status = (msg, ms = 2200) => {
  const el = $("#status");
  el.textContent = msg;
  if (msg && ms) setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, ms);
};

// ---------- Tabs ----------
$$(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    ["extensions", "shortcuts", "custom"].forEach((k) => {
      $("#tab-" + k).hidden = k !== t.dataset.tab;
    });
    if (t.dataset.tab === "shortcuts") renderShortcuts();
    if (t.dataset.tab === "custom") renderCustom();
  })
);

// ---------- Extensions ----------
async function loadExtensions() {
  ALL = await chrome.management.getAll();
  // hide self from bulk-disable danger? keep visible but flag it
  paintStats();
  paintList();
  fillTargetSelects();
}

function paintStats() {
  const on = ALL.filter((e) => e.enabled).length;
  $("#statTotal").textContent = ALL.length;
  $("#statOn").textContent = on;
  $("#statOff").textContent = ALL.length - on;
}

function filtered() {
  const q = $("#search").value.trim().toLowerCase();
  const f = $("#filter").value;
  const s = $("#sort").value;
  let list = ALL.filter((e) => {
    if (q && !(e.name + " " + (e.description || "") + " " + e.id).toLowerCase().includes(q)) return false;
    if (f === "enabled" && !e.enabled) return false;
    if (f === "disabled" && e.enabled) return false;
    if (f === "app" && !(e.launchType || e.isApp)) return false;
    if (f === "theme" && e.type !== "theme") return false;
    return true;
  });
  list.sort((a, b) =>
    s === "name" ? a.name.localeCompare(b.name)
    : s === "enabled-first" ? Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name)
    : Number(a.enabled) - Number(b.enabled) || a.name.localeCompare(b.name)
  );
  // self first so user sees it
  list.sort((a, b) => (b.id === selfId) - (a.id === selfId));
  return list;
}

function iconFor(e, size = 28) {
  const ic = (e.icons || []).sort((a, b) => a.size - b.size).pop();
  if (ic) return ic.url;
  return "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" rx="6" fill="#39414f"/><text x="50%" y="62%" text-anchor="middle" fill="#9aa4b5" font-size="14">◧</text></svg>`);
}

function paintList() {
  const list = filtered();
  const box = $("#list");
  box.innerHTML = "";
  $("#empty").hidden = list.length > 0;
  for (const e of list) {
    const card = document.createElement("div");
    card.className = "card";
    const isSelf = e.id === selfId;
    card.innerHTML = `
      <img src="${iconFor(e)}" alt="" />
      <div class="meta">
        <div class="name">${escapeHtml(e.name)} <span class="v">${escapeHtml(e.version || "")}</span>
          ${e.launchType || e.isApp ? '<span class="badge app">app</span>' : ""}
          ${e.type === "theme" ? '<span class="badge theme">theme</span>' : ""}
          ${isSelf ? '<span class="badge">this manager</span>' : ""}
        </div>
        <div class="desc" title="${escapeHtml(e.description || "")}">${escapeHtml(e.description || "(no description)")}</div>
        <div class="id">${e.id}</div>
        <div class="rowbtns">
          ${e.optionsUrl ? '<button data-act="options">Options</button>' : ""}
          ${(e.launchType || e.isApp) && e.enabled ? '<button data-act="launch">Launch</button>' : ""}
          <button data-act="shortcuts" title="Open Chrome shortcut editor">⌨ Keys</button>
          ${isSelf ? "" : '<button data-act="uninstall" class="danger">Uninstall</button>'}
        </div>
      </div>
      <label class="switch" title="${e.enabled ? "Disable" : "Enable"}">
        <input type="checkbox" ${e.enabled ? "checked" : ""} ${isSelf ? "disabled" : ""} />
        <span class="slider"></span>
      </label>`;
    const toggle = card.querySelector("input");
    toggle.addEventListener("change", async () => {
      try {
        await chrome.management.setEnabled(e.id, toggle.checked);
        e.enabled = toggle.checked;
        chrome.storage.sync.set({ "extensor:lastToggled": e.id });
        paintStats();
        status(`${e.name} ${toggle.checked ? "enabled" : "disabled"}`);
      } catch (err) {
        toggle.checked = !toggle.checked;
        status("Failed: " + err.message);
      }
    });
    card.querySelectorAll("[data-act]").forEach((b) =>
      b.addEventListener("click", async () => {
        const act = b.dataset.act;
        if (act === "options") chrome.tabs.create({ url: e.optionsUrl });
        else if (act === "launch") { try { await chrome.management.launchApp(e.id); } catch (err) { status("Launch failed: " + err.message); } }
        else if (act === "shortcuts") chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
        else if (act === "uninstall") {
          if (confirm(`Uninstall "${e.name}"?`)) {
            try { await chrome.management.uninstall(e.id); ALL = ALL.filter((x) => x.id !== e.id); paintStats(); paintList(); }
            catch (err) { status("Uninstall failed: " + err.message); }
          }
        }
      })
    );
    box.appendChild(card);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

$("#search").addEventListener("input", paintList);
$("#filter").addEventListener("change", paintList);
$("#sort").addEventListener("change", paintList);

$("#bulkOff").addEventListener("click", async () => {
  if (!confirm("Disable all extensions except this manager?")) return;
  for (const e of ALL) {
    if (e.id === selfId || !e.enabled || e.type === "theme") continue;
    try { await chrome.management.setEnabled(e.id, false); e.enabled = false; } catch {}
  }
  paintStats(); paintList(); status("All extensions disabled (except this one)");
});
$("#bulkOn").addEventListener("click", async () => {
  for (const e of ALL) {
    if (e.enabled) continue;
    try { await chrome.management.setEnabled(e.id, true); e.enabled = true; } catch {}
  }
  paintStats(); paintList(); status("All extensions enabled");
});

// ---------- Shortcuts tab (native chrome.commands) ----------
async function renderShortcuts() {
  try { COMMANDS = await chrome.commands.getAll(); } catch { COMMANDS = []; }
  const box = $("#cmdList");
  box.innerHTML = COMMANDS.length ? "" : '<p class="hint">No commands declared.</p>';
  for (const c of COMMANDS) {
    const div = document.createElement("div");
    div.className = "cmd";
    div.innerHTML = `<div class="k"><b>${escapeHtml(c.description || c.name)}</b><span>${escapeHtml(c.name)}</span></div>
      ${c.shortcut ? `<kbd>${escapeHtml(c.shortcut)}</kbd>` : `<kbd class="none">not set</kbd>`}`;
    box.appendChild(div);
  }
  // quick slots
  const { [LS_QUICK]: slots } = await chrome.storage.sync.get(LS_QUICK);
  const cur = slots || {};
  const wrap = $("#slots");
  wrap.innerHTML = "";
  ["launch-quick-1", "launch-quick-2", "launch-quick-3"].forEach((slot, i) => {
    const div = document.createElement("div");
    div.className = "cmd slots";
    const sel = document.createElement("select");
    sel.innerHTML = `<option value="">— none —</option>` + ALL
      .filter((e) => (e.launchType || e.isApp) && e.enabled)
      .map((e) => `<option value="${e.id}" ${cur[slot] === e.id ? "selected" : ""}>${escapeHtml(e.name)}</option>`).join("");
    sel.addEventListener("change", async () => {
      const s = (await chrome.storage.sync.get(LS_QUICK))[LS_QUICK] || {};
      if (sel.value) s[slot] = sel.value; else delete s[slot];
      await chrome.storage.sync.set({ [LS_QUICK]: s });
      status(`Slot ${i + 1} saved`);
    });
    const found = COMMANDS.find((c) => c.name === slot);
    const keyLabel = found?.shortcut || (i < 2 ? `Alt+Shift+${i + 1}` : "assign manually");
    div.innerHTML = `<div class="k"><b>${escapeHtml(keyLabel)}</b><span>${slot}</span></div>`;
    div.appendChild(sel);
    wrap.appendChild(div);
  });
}

// ---------- Custom keys tab ----------
function fillTargetSelects() {
  const sel = $("#ctarget");
  sel.innerHTML = ALL.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}${e.enabled ? "" : " (disabled)"}</option>`).join("");
}

function normalizeCombo(parts) { return parts.join("+"); }

function recordCombo(input) {
  return new Promise((resolve) => {
    recording = true;
    $("#btnRecord").classList.add("rec");
    $("#btnRecord").textContent = "Press keys… (Esc cancels)";
    const handler = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Escape") { cleanup(); resolve(null); return; }
      const parts = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      if (e.metaKey) parts.push("Meta");
      const k = e.key;
      if (["Control", "Alt", "Shift", "Meta"].includes(k)) return; // wait for real key
      let key = k === " " ? "Space" : k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1);
      parts.push(key);
      cleanup();
      resolve(normalizeCombo(parts));
    };
    const cleanup = () => {
      recording = false;
      $("#btnRecord").classList.remove("rec");
      $("#btnRecord").textContent = "● Record";
      window.removeEventListener("keydown", handler, true);
    };
    window.addEventListener("keydown", handler, true);
  });
}

$("#btnRecord").addEventListener("click", async () => {
  if (recording) return;
  const combo = await recordCombo();
  if (combo) { $("#combo").value = combo; checkConflict(combo); }
});

$("#combo").addEventListener("input", (e) => checkConflict(e.target.value));
$("#ckind").addEventListener("change", () => {
  const k = $("#ckind").value;
  $("#urlWrap").hidden = k !== "open-url";
  $("#targetWrap").style.display = k === "open-url" ? "none" : "";
});

async function checkConflict(combo) {
  const w = $("#conflict");
  if (!combo) { w.hidden = true; return; }
  const native = COMMANDS.find((c) => c.shortcut && c.shortcut.toLowerCase() === combo.toLowerCase());
  const { [LS_CUSTOM]: list } = await chrome.storage.sync.get(LS_CUSTOM);
  const dup = (list || []).find((s) => s.combo.toLowerCase() === combo.toLowerCase());
  const msgs = [];
  if (native) msgs.push(`Conflicts with native command "${native.name}" (${native.shortcut}).`);
  if (dup) msgs.push(`Already assigned to "${dup.label || dup.action.kind}". Saving will overwrite.`);
  w.hidden = !msgs.length;
  w.textContent = msgs.join(" ");
}

$("#customForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const combo = $("#combo").value.trim();
  if (!combo) return status("Record a key combo first");
  const kind = $("#ckind").value;
  const action = kind === "open-url"
    ? { kind, url: $("#curl").value.trim() }
    : { kind, targetId: $("#ctarget").value };
  if (kind === "open-url" && !/^https?:\/\//i.test(action.url)) return status("URL must start with http(s)://");
  const label = $("#clabel").value.trim() || `${kind} (${combo})`;
  const store = await chrome.storage.sync.get(LS_CUSTOM);
  const list = (store[LS_CUSTOM] || []).filter((s) => s.combo.toLowerCase() !== combo.toLowerCase());
  list.push({ id: "c" + Date.now(), combo, action, label });
  await chrome.storage.sync.set({ [LS_CUSTOM]: list });
  $("#combo").value = ""; $("#clabel").value = ""; $("#curl").value = "";
  status(`Saved ${combo} → ${label}`);
  renderCustom();
});

async function renderCustom() {
  const { [LS_CUSTOM]: list } = await chrome.storage.sync.get(LS_CUSTOM);
  const box = $("#customList");
  box.innerHTML = "";
  if (!list?.length) { box.innerHTML = '<p class="hint">No custom shortcuts yet. Record one above.</p>'; return; }
  // resolve names
  const byId = Object.fromEntries(ALL.map((e) => [e.id, e.name]));
  for (const s of list) {
    const div = document.createElement("div");
    div.className = "cmd";
    const target = s.action.targetId ? ` → ${escapeHtml(byId[s.action.targetId] || s.action.targetId)}`
      : s.action.url ? ` → ${escapeHtml(s.action.url)}` : "";
    div.innerHTML = `<kbd>${escapeHtml(s.combo)}</kbd>
      <div class="k"><b>${escapeHtml(s.label)}</b><span>${escapeHtml(s.action.kind)}${target}</span></div>`;
    const test = document.createElement("button");
    test.textContent = "Test";
    test.addEventListener("click", () => chrome.runtime.sendMessage({ type: "EXECUTE_ACTION", action: s.action }, (r) => status(r?.ok ? "OK" : "Failed: " + (r?.error || "?"))));
    const del = document.createElement("button");
    del.textContent = "✕"; del.className = "danger";
    del.addEventListener("click", async () => {
      const d = (await chrome.storage.sync.get(LS_CUSTOM))[LS_CUSTOM] || [];
      await chrome.storage.sync.set({ [LS_CUSTOM]: d.filter((x) => x.id !== s.id) });
      renderCustom();
    });
    div.appendChild(test); div.appendChild(del);
    box.appendChild(div);
  }
}

// ---------- Header buttons ----------
$("#btnShortcutsPage").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));
$("#btnOpenShortcuts").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));
$("#btnOpenManager").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/" }));
$("#btnFull").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?fullpage=1") }));

// keep list fresh
chrome.management.onEnabled.addListener(loadExtensions);
chrome.management.onDisabled.addListener(loadExtensions);
chrome.management.onInstalled.addListener(loadExtensions);
chrome.management.onUninstalled.addListener(loadExtensions);

loadExtensions();

// Extensor background service worker (MV3)
const LS_LAST = "extensor:lastToggled";
const LS_QUICK = "extensor:quickSlots"; // { "launch-quick-1": extensionId, ... }
const LS_CUSTOM = "extensor:customShortcuts"; // [{id, combo, action:{kind,targetId,url}, label}]

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get([LS_QUICK, LS_CUSTOM], (d) => {
    if (!d[LS_QUICK]) chrome.storage.sync.set({ [LS_QUICK]: {} });
    if (!d[LS_CUSTOM]) chrome.storage.sync.set({ [LS_CUSTOM]: [] });
  });
  injectIntoOpenTabs();
});
chrome.runtime.onStartup.addListener(() => injectIntoOpenTabs());

// Content scripts only auto-attach to pages loaded AFTER install/update,
// so inject into already-open http(s) tabs (guard in the script prevents doubles).
async function injectIntoOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    for (const t of tabs) {
      if (!t.id) continue;
      try {
        await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ["content-shortcuts.js"] });
      } catch { /* e.g. tab closing, restricted page */ }
    }
  } catch { /* scripting unavailable */ }
}

// Execute an action: toggle / launch / open-url / open-options / open-shortcuts-page
async function executeAction(action) {
  if (!action) return { ok: false, error: "empty action" };
  try {
    if (action.kind === "toggle") {
      const ext = await chrome.management.get(action.targetId);
      const next = !ext.enabled;
      await chrome.management.setEnabled(action.targetId, next);
      await chrome.storage.sync.set({ [LS_LAST]: action.targetId });
      return { ok: true, enabled: next };
    }
    if (action.kind === "launch") {
      await chrome.management.launchApp(action.targetId);
      return { ok: true };
    }
    if (action.kind === "options") {
      const ext = await chrome.management.get(action.targetId);
      if (ext.optionsUrl) {
        await chrome.tabs.create({ url: ext.optionsUrl });
        return { ok: true };
      }
      return { ok: false, error: "No options page" };
    }
    if (action.kind === "open-url") {
      await chrome.tabs.create({ url: action.url });
      return { ok: true };
    }
    if (action.kind === "open-shortcuts") {
      await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
      return { ok: true };
    }
    if (action.kind === "open-manager") {
      await chrome.tabs.create({ url: "chrome://extensions/" });
      return { ok: true };
    }
    return { ok: false, error: "unknown kind" };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// Native chrome.commands (editable only on chrome://extensions/shortcuts)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-last") {
    const { [LS_LAST]: id } = await chrome.storage.sync.get(LS_LAST);
    if (id) executeAction({ kind: "toggle", targetId: id });
    return;
  }
  if (command.startsWith("launch-quick-")) {
    const { [LS_QUICK]: slots } = await chrome.storage.sync.get(LS_QUICK);
    const targetId = slots?.[command];
    if (targetId) executeAction({ kind: "launch", targetId });
    else chrome.runtime.openOptionsPage?.();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "EXECUTE_ACTION") {
      sendResponse(await executeAction(msg.action));
    } else if (msg?.type === "GET_CUSTOM_SHORTCUTS") {
      const { [LS_CUSTOM]: list } = await chrome.storage.sync.get(LS_CUSTOM);
      sendResponse({ ok: true, list: list || [] });
    } else if (msg?.type === "PING") {
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: "unknown message" });
    }
  })();
  return true; // async response
});

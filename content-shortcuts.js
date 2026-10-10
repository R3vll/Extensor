// Runs on every page. Matches user-defined combos and asks background to act.
// Chrome content scripts cannot use chrome.management, so we delegate.
(function () {
  if (globalThis.__extensorInjected) return; // avoid double listeners on re-inject
  globalThis.__extensorInjected = true;
  const LS_CUSTOM = "extensor:customShortcuts";
  let shortcuts = [];

  async function load() {
    try {
      const { [LS_CUSTOM]: list } = await chrome.storage.sync.get(LS_CUSTOM);
      shortcuts = Array.isArray(list) ? list : [];
    } catch { /* storage may be unavailable briefly */ }
  }
  load();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes[LS_CUSTOM]) {
      shortcuts = changes[LS_CUSTOM].newValue || [];
    }
  });

  function eventToCombo(e) {
    const parts = [];
    if (e.ctrlKey) parts.push("ctrl");
    if (e.altKey) parts.push("alt");
    if (e.shiftKey) parts.push("shift");
    if (e.metaKey) parts.push("meta");
    let key = e.key?.toLowerCase() ?? "";
    // Normalize
    if (key === " ") key = "space";
    if (key === "control" || key === "alt" || key === "shift" || key === "meta") return null; // modifier-only
    if (key.length === 1) key = key.toUpperCase(); // display as upper
    else if (key.length > 1) key = key[0].toUpperCase() + key.slice(1);
    parts.push(key);
    return parts.join("+");
  }

  function comboEquals(a, b) {
    return String(a).toLowerCase() === String(b).toLowerCase();
  }

  document.addEventListener(
    "keydown",
    (e) => {
      // Don't hijack typing in inputs unless Alt is involved
      const t = e.target;
      const typing =
        t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const combo = eventToCombo(e);
      if (!combo) return;
      const hit = shortcuts.find((s) => comboEquals(s.combo, combo));
      if (!hit) return;
      // Let plain typing through in inputs/textareas/editors, but always
      // fire combos with Ctrl/Alt/Meta (they're never normal text input).
      const hasMod = e.ctrlKey || e.altKey || e.metaKey;
      if (typing && !hasMod) return;
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: "EXECUTE_ACTION", action: hit.action });
    },
    true
  );
})();

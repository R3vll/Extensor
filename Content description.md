# Extensor — Extension & Shortcut Manager (Chrome MV3)

One popup to manage **all extensions** and **keyboard shortcuts** inside the browser.

## Features

**Extensions tab**
- List every extension/app/theme with icon, version, description, ID
- Search, filter (All / Enabled / Disabled / Apps / Themes), sort
- Toggle enable/disable inline (this manager is pinned on so you can't break it)
- Buttons per item: Options, Launch (apps), Shortcut editor, Uninstall
- Stats bar + bulk Enable-all / Disable-all
- Live refresh on install/uninstall/enable/disable

**Shortcuts tab**
- Shows this extension's own `chrome.commands` bindings (Chrome only lets an
  extension read its *own* shortcuts — platform privacy restriction)
- One-click open of `chrome://extensions/shortcuts` (native editor for ALL extensions)
- Quick-launch slots: bind `Alt+Shift+1/2/3` to launch an app/extension

**Custom keys tab**
- Define your own in-page combos (e.g. `Alt+Shift+X` → toggle ad-blocker,
  open URL, open options page, launch app)
- Key recorder with conflict detection (native + existing custom)
- Test / delete per entry; enforced by a `<all_urls>` content script that
  delegates to the background worker (`content scripts can't use management API`)

## Install (unpacked)

1. Open `chrome://extensions/`, enable **Developer mode**.
2. **Load unpacked** → select this folder (`chrome-ext-manager`).
3. Pin **Extensor**, press `Ctrl+Shift+E` (or click the icon).

## Files

| File | Purpose |
|---|---|
| `manifest.json` | MV3 manifest, `management/storage/tabs/favicon` + 5 `commands` |
| `popup.html/css/js` | Manager UI (also used as `options_page` full-tab view) |
| `background.js` | Service worker: executes toggle/launch/options/open-url, handles `chrome.commands` |
| `content-shortcuts.js` | In-page key listener, matches `chrome.storage.sync` combos |
| `icons/` | Extension icons |

## Notes / limits

- `chrome://` pages can't be scripted or embedded — hence the deep-link buttons.
- Custom shortcuts work on normal `http(s)` pages, not on `chrome://`, Chrome Web
  Store, or `chrome-extension://` pages (Chrome restriction on content scripts).
- `management.launchApp` only works for apps / launchable extensions.

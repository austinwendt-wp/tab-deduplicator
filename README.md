# Tab Deduplicator

A lightweight Chrome extension (Manifest V3) that finds and closes duplicate tabs across all open windows. No build step, no dependencies — load it straight into Chrome.

## What it does

- Displays a **live badge** on the extension icon showing your total tab count across every window.
- Detects **duplicate tabs** by normalizing URLs (strips tracking params and hash fragments) so minor URL variations don't hide real duplicates.
- Shows a **popup** listing every duplicate group with per-tab close buttons, a one-click "Keep 1" per group, and a global "Deduplicate All" button. **Deduplicate All** closes every redundant tab across all groups in a single batch — keeping the most recently active tab in each group and closing the rest simultaneously. A confirmation dialog lists the tabs that will be closed (up to 10, with a count of any beyond that) before anything is removed.
- Each tab row shows **how long ago it was last active** (e.g. `2h ago`, `4d ago`). Ages over 24 hours are highlighted in amber. Hovering the label shows the exact datetime.
- Within each duplicate group, tabs are **sorted freshest-first** so "Keep 1" always preserves the most recently active copy and closes the stale ones.
- Clicking any tab row **focuses that tab** and brings its window to the front.

## How URL normalization works

Two tabs are considered duplicates when their **normalized URLs** match. Normalization:

1. Strips the hash fragment (`#section`, `#heading=h.abc`) — so two tabs open to the same Google Doc at different headings are still duplicates.
2. Removes known **tracking-only query params** (`utm_*`, `fbclid`, `gclid`, `msclkid`, and others) while keeping semantic params like `q=` (search queries), `id=`, `page=`, etc.
3. Sorts remaining query params into canonical order so `?a=1&b=2` and `?b=2&a=1` resolve to the same key.
4. Strips trailing slashes from the path.

This means `https://example.com/page?utm_source=email` and `https://example.com/page` are duplicates, but `https://google.com/search?q=cats` and `https://google.com/search?q=dogs` are not.

## Repo structure

```
tab-deduplicator/
├── manifest.json    # MV3 manifest — declares permissions and entry points
├── background.js    # Service worker — updates the badge count on tab events
├── popup.html       # Popup shell — header, stats, group list container
├── popup.js         # All popup logic — normalization, grouping, rendering, tab actions
└── styles.css       # Minimal CSS — supports system light/dark mode automatically
```

### File responsibilities

**`manifest.json`**
Declares `tabs` and `storage` permissions, registers `background.js` as the service worker, and points the action to `popup.html`.

**`background.js`**
Listens to `chrome.tabs.onCreated`, `onRemoved`, `onUpdated`, `onAttached`, and `onDetached` to keep the badge count accurate in real time. Runs as a MV3 service worker (no persistent background page).

**`popup.js`**
Contains all logic:
- `normalizeUrl(rawUrl)` — strips hash, removes tracking params, sorts remaining params
- `buildDuplicateGroups(tabs)` — groups tabs by normalized URL, filters to groups with ≥ 2 tabs; sorts each group freshest-first using `tab.lastAccessed`
- `buildWindowLabels(tabs)` — assigns stable "Window 1 / 2 / …" labels by first-seen order
- `formatAge(lastAccessed)` — converts a millisecond timestamp to a compact relative string (`5m ago`, `3h ago`, `2d ago`)
- `render()` — queries all tabs, builds the DOM, wires up close/focus/dedup actions
- DOM is built with a minimal `el()` helper (no framework)

**`styles.css`**
Uses CSS custom properties for theming. Responds to `prefers-color-scheme: dark` automatically. No external fonts or assets.

## Loading into Chrome

1. Clone or download this repo.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `tab-deduplicator` folder.
5. The extension icon appears in the toolbar with a live tab count badge.

To pick up any code changes, click the **refresh icon** on the extension card in `chrome://extensions` (or use the Extensions menu → Manage Extensions).

## Permissions used

| Permission | Why |
|---|---|
| `tabs` | Read tab URLs, titles, and window IDs; close and focus tabs |
| `storage` | Reserved for future preference persistence (not yet used) |

No network requests are made. All processing is local.

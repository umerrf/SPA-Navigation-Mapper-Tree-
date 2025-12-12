# SPA Navigation Mapper (Chrome Extension)
Capture SPA route navigation and show a parent→child tree based on actual clicks/navigation.

A lightweight Chrome extension that maps navigation flows in **Single Page Applications (SPAs)** by recording real user transitions and rendering them as a nested tree.

Instead of guessing hierarchy from URL structures (which breaks quickly in modern apps), this tool captures what actually happened:

**Parent page** = the page you were on  
**Child page** = the page that opened next

This makes it useful for:
- product inventory / screen audits
- UX flow mapping
- onboarding documentation
- converting real navigation into flowcharts

---

## Features

- ✅ Captures SPA route changes (History API-based navigation)
- ✅ Records `from → to` transitions and builds a **tree view**
- ✅ Supports **n-level nesting**
- ✅ Per-click behavior controls:
  - Nest new pages under the clicked page, or
  - Promote new pages up by N levels (for cases where “click ≠ hierarchy”)
- ✅ Uses readable labels:
  - `{Page Title} - {URL Path}`
  - No domain included
  - Hash fragments removed
  - URL truncated for readability

---

## How it works

1. A content script injects a small hook into the page (MAIN world).
2. The hook listens for SPA route changes (e.g., `history.pushState`, `replaceState`, and `popstate`).
3. Each navigation event is reported to the background service worker.
4. The background stores:
   - visited nodes (URL + title)
   - transitions (`from → to`)
   - per-click capture mode (nesting on/off + back-step value at that moment)
5. The popup renders a tree from recorded transitions.

---

## Installation (Developer Mode)

1. Download or clone this repository
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the project folder

---

## Using the Extension

1. Navigate your SPA normally (click through menus/pages)
2. Open the extension popup to see the tree
3. Optional controls (in popup):
   - **Nesting ON**: child is nested under the page where the click happened
   - **Nesting OFF**: new child is promoted up by N levels (you choose N)

The nesting toggle affects **only future transitions**, not previously captured ones.

---

## Exporting / Flowcharts

The captured transitions form a graph/tree that can be exported (or copied) and converted into flowcharts using tools like:
- Mermaid
- draw.io
- Lucidchart
- Figma

(If you want an automated exporter, open an issue or PR.)

---

## Limitations

This tool captures navigation based on route changes. It will not record everything in every app.

Known limitations:
- **No route change, no capture**  
  If an app changes content without updating URL / History API (e.g., purely internal tabs, modals, drawers), it won’t be recorded.
- **Role/permission visibility**  
  Only pages accessible to the logged-in user can be captured.
- **Graph vs. tree reality**  
  A page can be opened from multiple places, so it may appear under multiple parents in the tree.
- **Highly dynamic routes**  
  Some apps embed large encoded data in the URL. The UI truncates long paths for readability.

---

## Privacy

This extension stores captured navigation data **locally in your browser** using `chrome.storage.local`.  
It does not send captured URLs/titles to any server.

(If you fork and change that, be honest about it.)

---

## Contributing

PRs are welcome. If you’re making changes, please keep the tool:
- generic (no app-specific hardcoding)
- privacy-respecting
- stable across MV3 Chrome extensions

---

## License

MIT License. See `LICENSE`.

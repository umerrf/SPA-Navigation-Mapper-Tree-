// background.js (MV3 service worker)
// Generic: works on any http(s) SPA. No product-specific domains/branding.

const STORAGE_KEY = "sitemapGraph";
const SETTINGS_KEY = "navTreeSettings";

const DEFAULT_SETTINGS = { nestingEnabled: true, backSteps: 1 };

async function getGraph() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || { nodes: {}, edges: {}, transitions: [] };
}

async function saveGraph(graph) {
  await chrome.storage.local.set({ [STORAGE_KEY]: graph });
}

async function clearGraph() {
  await chrome.storage.local.remove(STORAGE_KEY);
}

async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
}

// Strip "Brand | Page" -> "Page" to avoid leaking product names in titles.
// If you want to keep full document.title, just return `t` as-is.
function normalizeTitle(rawTitle = "") {
  const t = String(rawTitle || "").trim();
  if (!t) return "";
  return t.replace(/^[^|]{2,}\|\s*/i, "").trim();
}

function isGenericTitle(t = "") {
  const s = String(t || "").trim().toLowerCase();
  return !s || s === "home" || s === "dashboard";
}

async function handleRouteChange({ from, to, title }) {
  if (!to) return;

  const graph = await getGraph();
  const now = Date.now();
  const cleanTitle = normalizeTitle(title);

  // Nodes
  if (!graph.nodes[to]) {
    graph.nodes[to] = {
      url: to,
      title: cleanTitle || "",
      firstSeen: now,
      lastSeen: now,
      visitCount: 1,
    };
  } else {
    const node = graph.nodes[to];
    node.lastSeen = now;
    node.visitCount = (node.visitCount || 0) + 1;

    if (cleanTitle) {
      const existing = String(node.title || "").trim();
      const shouldReplace =
        !existing || isGenericTitle(existing) || cleanTitle.length > existing.length;
      if (shouldReplace) node.title = cleanTitle;
    }
  }

  // Edges + transitions
  if (from && from !== to) {
    if (!graph.edges[from]) graph.edges[from] = {};
    graph.edges[from][to] = (graph.edges[from][to] || 0) + 1;

    // Snapshot settings per click/navigation so future toggles don't rewrite history.
    const settings = await getSettings();
    if (!Array.isArray(graph.transitions)) graph.transitions = [];
    graph.transitions.push({
      from,
      to,
      at: now,
      nestingEnabled: !!settings.nestingEnabled,
      backSteps: Math.max(1, Number(settings.backSteps) || 1),
    });
  }

  await saveGraph(graph);
}

// Messaging
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case "ROUTE_CHANGE":
          await handleRouteChange(message.payload || {});
          sendResponse({ status: "ok" });
          break;
        case "GET_GRAPH":
          sendResponse({ status: "ok", graph: await getGraph() });
          break;
        case "CLEAR_GRAPH":
          await clearGraph();
          sendResponse({ status: "ok" });
          break;
        default:
          sendResponse({ status: "unknown_message_type" });
      }
    } catch (e) {
      sendResponse({ status: "error", error: String(e) });
    }
  })();

  return true; // keep message channel open for async sendResponse
});

// -------------------------
// Generic SPA injection
// -------------------------
// We inject pageHook.js into http(s) tabs to hook SPA routing (history API).
// contentScript.js (isolated world) forwards postMessage events to background.

function shouldInject(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

async function injectPageHook(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["pageHook.js"],
      world: "MAIN",
    });
  } catch {
    // ignore injection failures (CSP, restricted pages, etc.)
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab?.url && shouldInject(tab.url)) {
    injectPageHook(tabId);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab?.url && shouldInject(tab.url)) injectPageHook(tabId);
  } catch {
    // ignore
  }
});

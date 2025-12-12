
const STORAGE_KEY = "sitemapGraph";
const SETTINGS_KEY = "navTreeSettings";

const DEFAULT_SETTINGS = {
  nestingEnabled: true,
  backSteps: 1,
};

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = ""; // remove #fragment
    return u.toString();
  } catch {
    return url || "";
  }
}

function pathAfterSlash(url) {
  try {
    const u = new URL(url);
    return u.pathname + (u.search || "");
  } catch {
    const s = url || "";
    const i = s.indexOf("/", 8);
    return i >= 0 ? s.slice(i) : s;
  }
}

function truncate(s, max = 80) {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

function labelFor(url, nodes) {
  const clean = normalizeUrl(url);
  const node = nodes?.[url] || nodes?.[clean];
  const pageTitle = (node?.title || "Untitled Page").trim();
  const path = truncate(pathAfterSlash(clean), 80);
  return `${pageTitle} - ${path}`;
}

async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

/**
 * Build a nested tree using the "straight method":
 * parent = page where click happened (from)
 * child  = page that opened (to)
 *
 * Twist: settings are snapshotted PER CLICK in graph.transitions, so toggles
 * only affect new clicks, not old ones.
 *
 * If nestingEnabled=false on an event, we "promote" the child by attaching it
 * to an ancestor of the clicked page, backSteps levels up in the CURRENT tree.
 */
function buildTreeFromTransitions(graph) {
  const nodes = graph.nodes || {};
  const transitions = Array.isArray(graph.transitions) ? graph.transitions : [];

  // childrenMap[parentUrl] = Set(childUrl)
  const childrenMap = new Map();
  // parentOf[url] = parentUrl (latest assignment)
  const parentOf = new Map();
  // roots set
  const roots = new Set();

  function setParent(child, parent) {
    // remove from old parent's children
    const oldParent = parentOf.get(child);
    if (oldParent && childrenMap.has(oldParent)) {
      childrenMap.get(oldParent).delete(child);
    } else if (oldParent === null) {
      roots.delete(child);
    }

    if (parent === null) {
      parentOf.set(child, null);
      roots.add(child);
      return;
    }

    parentOf.set(child, parent);
    if (!childrenMap.has(parent)) childrenMap.set(parent, new Set());
    childrenMap.get(parent).add(child);
    roots.delete(child);
  }

  function getAncestor(url, steps) {
    let current = url;
    for (let i = 0; i < steps; i++) {
      const p = parentOf.get(current);
      if (!p) return null; // null or undefined means root
      current = p;
    }
    return current;
  }

  // Seed: any node ever seen can be a root until linked
  for (const u of Object.keys(nodes)) roots.add(normalizeUrl(u));

  // Sort transitions by time if present
  const sorted = transitions.slice().sort((a, b) => (a.at || 0) - (b.at || 0));

  for (const t of sorted) {
    const from = normalizeUrl(t.from);
    const to = normalizeUrl(t.to);
    if (!from || !to) continue;
    if (from === to) continue;

    // Ensure known in roots initially
    if (!parentOf.has(from)) setParent(from, null);
    if (!parentOf.has(to)) setParent(to, null);

    const nestingEnabled = !!t.nestingEnabled;
    const backSteps = Math.max(0, Number(t.backSteps) || 0);

    let attachParent = from;

    if (!nestingEnabled) {
      // Move "up" from the clicked page, not from the child.
      const ancestor = getAncestor(from, backSteps);
      attachParent = ancestor; // can be null (root)
    }

    // Cycle guard: don't create immediate cycle (attach parent under child)
    if (attachParent === to) continue;

    // Attach child
    if (attachParent === null) {
      setParent(to, null);
    } else {
      setParent(to, attachParent);
    }
  }

  // Clean up: remove roots that are actually children
  for (const [p, kids] of childrenMap.entries()) {
    for (const c of kids) roots.delete(c);
  }

  // If we somehow lost all roots (pure cycle), fall back to any parent keys
  if (roots.size === 0) {
    for (const p of childrenMap.keys()) roots.add(p);
  }

  return { roots: Array.from(roots), childrenMap, nodes };
}

function renderTree(container, tree) {
  container.innerHTML = "";

  const { roots, childrenMap, nodes } = tree;

  function renderNode(url, visited) {
    const li = document.createElement("li");
    li.textContent = labelFor(url, nodes);
    li.title = url;

    if (visited.has(url)) return li; // cycle guard
    visited.add(url);

    const kids = childrenMap.get(url);
    if (kids && kids.size > 0) {
      const ul = document.createElement("ul");
      const sortedKids = Array.from(kids).sort((a, b) => labelFor(a, nodes).localeCompare(labelFor(b, nodes)));
      for (const child of sortedKids) {
        ul.appendChild(renderNode(child, new Set(visited)));
      }
      li.appendChild(ul);
    }
    return li;
  }

  const topUl = document.createElement("ul");
  const sortedRoots = roots.slice().sort((a, b) => labelFor(a, nodes).localeCompare(labelFor(b, nodes)));
  for (const r of sortedRoots) {
    topUl.appendChild(renderNode(r, new Set()));
  }
  container.appendChild(topUl);
}

function refresh() {
  chrome.runtime.sendMessage({ type: "GET_GRAPH" }, (resp) => {
    if (!resp || resp.status !== "ok") return;
    const graph = resp.graph || { nodes: {}, edges: {}, transitions: [] };

    const countNodes = Object.keys(graph.nodes || {}).length;
    const countTrans = Array.isArray(graph.transitions) ? graph.transitions.length : 0;
    const meta = document.getElementById("meta");
    if (meta) meta.textContent = `Captured pages: ${countNodes} | Click transitions: ${countTrans}`;

    const tree = buildTreeFromTransitions(graph);
    renderTree(document.getElementById("tree"), tree);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const nestingToggle = document.getElementById("nestingToggle");
  const backStepsWrap = document.getElementById("backStepsWrap");
  const backStepsInput = document.getElementById("backSteps");
  if (!nestingToggle || !backStepsInput) {
    // Popup DOM mismatch; abort quietly
    return;
  }


  const settings = await getSettings();
  nestingToggle.checked = !!settings.nestingEnabled;
  backStepsInput.value = String(settings.backSteps || 1);

  function syncEnabledState() {
    const off = !nestingToggle.checked;
    backStepsInput.disabled = nestingToggle.checked;
    if (backStepsWrap) backStepsWrap.style.display = off ? "block" : "none";
  }
  syncEnabledState();

  nestingToggle.addEventListener("change", async () => {
    const newSettings = await getSettings();
    newSettings.nestingEnabled = nestingToggle.checked;
    await saveSettings(newSettings);
    syncEnabledState();
  });

  backStepsInput.addEventListener("change", async () => {
    const newSettings = await getSettings();
    newSettings.backSteps = Math.max(1, Number(backStepsInput.value) || 1);
    backStepsInput.value = String(newSettings.backSteps);
    await saveSettings(newSettings);
  });

  document.getElementById("refresh").addEventListener("click", refresh);
  document.getElementById("clear").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "CLEAR_GRAPH" }, () => refresh());
  });

  refresh();
});

// contentScript.js - bridge postMessage from pageHook.js to background
(() => {
  if (window.__saasSitemapBridgeLoaded) return;
  window.__saasSitemapBridgeLoaded = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__SAAS_SITEMAP__ !== true) return;
    if (data.type !== "ROUTE_CHANGE") return;

    chrome.runtime.sendMessage({ type: "ROUTE_CHANGE", payload: data.payload }, () => void chrome.runtime.lastError);
  });
})();

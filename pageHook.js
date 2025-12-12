// pageHook.js - runs in MAIN world (injected via chrome.scripting.executeScript)
(() => {
  if (window.__saasSitemapPageHooked) return;
  window.__saasSitemapPageHooked = true;

  const getUrl = () => location.origin + location.pathname + location.search + location.hash;

  const emit = (from, to) => {
    setTimeout(() => {
      window.postMessage(
        {
          __SAAS_SITEMAP__: true,
          type: "ROUTE_CHANGE",
          payload: {
            from: from || null,
            to: to || getUrl(),
            title: document.title || ""
          }
        },
        "*"
      );
    }, 150);
  };

  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;

  history.pushState = function (...args) {
    const from = getUrl();
    const ret = origPushState.apply(this, args);
    emit(from, getUrl());
    return ret;
  };

  history.replaceState = function (...args) {
    const from = getUrl();
    const ret = origReplaceState.apply(this, args);
    emit(from, getUrl());
    return ret;
  };

  window.addEventListener("popstate", () => emit(null, getUrl()));
  window.addEventListener("hashchange", () => emit(null, getUrl()));

  emit(null, getUrl());
})();

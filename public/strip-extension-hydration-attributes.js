(() => {
  const attributeName = "bis_skin_checked";
  const strip = (root) => {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll("[" + attributeName + "]").forEach((element) => {
      element.removeAttribute(attributeName);
    });
  };

  strip(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === attributeName) {
        mutation.target.removeAttribute(attributeName);
      }

      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        if (node.hasAttribute?.(attributeName)) {
          node.removeAttribute(attributeName);
        }
        strip(node);
      });
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [attributeName],
    childList: true,
    subtree: true,
  });

  window.addEventListener(
    "load",
    () => {
      strip(document);
      window.setTimeout(() => observer.disconnect(), 1000);
    },
    { once: true },
  );
})();

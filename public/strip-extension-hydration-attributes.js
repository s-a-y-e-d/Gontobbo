(() => {
  const attributeNames = [
    "bis_skin_checked",
    "bis_use",
    "data-bis-config",
    "data-dynamic-id"
  ];

  const strip = (root) => {
    if (!root || !root.querySelectorAll) return;
    attributeNames.forEach((attr) => {
      root.querySelectorAll("[" + attr + "]").forEach((element) => {
        element.removeAttribute(attr);
      });
    });
  };

  strip(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && attributeNames.includes(mutation.attributeName)) {
        mutation.target.removeAttribute(mutation.attributeName);
      }

      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        attributeNames.forEach((attr) => {
          if (node.hasAttribute?.(attr)) {
            node.removeAttribute(attr);
          }
        });
        strip(node);
      });
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: attributeNames,
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

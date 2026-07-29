import { t } from "../../lib/i18n.svelte.js";

const INJECTED_ATTR = "data-bds-share-warning";

export function injectShareDialogWarning() {
  const dialogs = document.querySelectorAll(
    `.ds-modal-content--dialog:not([${INJECTED_ATTR}])`
  );

  for (const dialog of dialogs) {
    if (!isShareDialog(dialog)) continue;

    dialog.setAttribute(INJECTED_ATTR, "1");

    const main = dialog.querySelector(".ds-modal-content__main");
    if (!main) continue;

    const warning = document.createElement("div");
    warning.className = "bds-share-warning";
    warning.textContent = t("shareModal.searchEngineWarning");
    main.appendChild(warning);
  }
}

function isShareDialog(dialog) {
  return !!dialog.querySelector(".ds-modal-content__footer .ds-button--primary");
}

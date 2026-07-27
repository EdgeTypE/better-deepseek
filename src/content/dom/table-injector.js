import { devLog } from "../../lib/dev-log.js";
import { i18n } from "../../lib/i18n.svelte.js";

const ENHANCED_ATTR = "data-bds-table-enhanced";
const HIDDEN_COL_ATTR = "data-bds-col-hidden";
const HIDDEN_ROW_ATTR = "data-bds-row-hidden";
const SORT_ATTR = "data-bds-sort";
const ORIG_ROW_ATTR = "data-bds-orig-order";
const DRAG_COL_ATTR = "data-bds-col-index";
const TAG = "TableDnD";

export function injectDynamicTableFeatures(rootNode) {
  if (!rootNode || rootNode.nodeType !== 1) return;
  const tables = rootNode.querySelectorAll(`table:not([${ENHANCED_ATTR}])`);
  for (const table of tables) {
    if (table.closest("#bds-root")) continue;
    table.setAttribute(ENHANCED_ATTR, "1");
    enhanceTable(table);
  }
}

function enhanceTable(table) {
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  if (!thead || !tbody) return;

  const headerCells = Array.from(thead.querySelectorAll(":scope > tr > th"));
  if (headerCells.length === 0) return;

  const scrollArea = table.closest(".ds-scroll-area");
  devLog(TAG, "enhanceTable", {
    colCount: headerCells.length,
    tableWidth: table.offsetWidth,
    scrollArea: scrollArea ? {
      scrollWidth: scrollArea.scrollWidth,
      clientWidth: scrollArea.clientWidth,
      isScrollable: scrollArea.scrollWidth > scrollArea.clientWidth,
      classes: scrollArea.className,
    } : null,
    tableParent: table.parentElement?.tagName,
    tableParentClass: table.parentElement?.className,
  });

  const rows = Array.from(tbody.querySelectorAll(":scope > tr"));
  rows.forEach((row, i) => row.setAttribute(ORIG_ROW_ATTR, String(i)));
  headerCells.forEach((th, i) => th.setAttribute(DRAG_COL_ATTR, String(i)));

  for (let i = 0; i < headerCells.length; i++) {
    const th = headerCells[i];
    wrapHeaderText(th);

    const sortIcon = document.createElement("span");
    sortIcon.className = "bds-sort-icon";
    sortIcon.textContent = " \u2195";
    th.appendChild(sortIcon);

    const menuBtn = document.createElement("span");
    menuBtn.className = "bds-col-menu-btn";
    menuBtn.textContent = "\u25BE";
    menuBtn.title = i18n.t("tableInjector.columnOptions");
    th.appendChild(menuBtn);

    th.addEventListener("click", (e) => {
      if (e.target.closest(".bds-col-menu-btn")) return;
      const colIndex = parseInt(th.getAttribute(DRAG_COL_ATTR), 10);
      cycleSort(table, colIndex);
    });

    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const colIndex = parseInt(th.getAttribute(DRAG_COL_ATTR), 10);
      showColumnDropdown(e, table, colIndex, menuBtn);
    });

    th.draggable = true;
    th.addEventListener("dragstart", onDragStart);
    th.addEventListener("dragover", onDragOver);
    th.addEventListener("drop", onDrop);
    th.addEventListener("dragend", onDragEnd);
    th.addEventListener("dragenter", onDragEnter);
    th.addEventListener("dragleave", onDragLeave);
  }

  // ─── Catch-all: thead-level dragover + drop ──────────────────────────────
  // When the cursor lands on the border between th cells (on tr/thead itself),
  // dragover fires on those elements — they don't call preventDefault(), so the
  // browser marks the position as an invalid drop zone and fires dragend instead
  // of drop. This thead listener is the safety net.
  thead.addEventListener("dragover", (e) => {
    if (dragSourceCol === null) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    devLog(TAG, "dragover (thead catch-all)", {
      rawTarget: elPath(e.target),
      resolvedTh: elPath(e.target.closest?.("th")),
    });
  });

  thead.addEventListener("drop", (e) => {
    devLog(TAG, "drop (thead catch-all)", {
      rawTarget: elPath(e.target),
      resolvedTh: elPath(e.target.closest?.("th")),
      dragSourceCol,
    });
    onDrop(e);
  });

  // ─── Catch-all: ds-scroll-area container ─────────────────────────────────
  // Large tables are wrapped in a div.ds-scroll-area that has a sticky
  // ds-scroll-area__gutters overlay positioned on top of the thead. When the
  // user releases the drag over that overlay, `drop` fires on the gutter element
  // and bubbles to ds-scroll-area — it never reaches thead or th because the
  // gutter is NOT a descendant of thead. Registering dragover+drop on the
  // scroll-area container catches these escaped drops.
  if (scrollArea) {
    scrollArea.addEventListener("dragover", (e) => {
      if (dragSourceCol === null) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      devLog(TAG, "dragover (scroll-area catch-all)", {
        rawTarget: elPath(e.target),
        resolvedTh: elPath(e.target.closest?.("th")),
      });
    });

    scrollArea.addEventListener("drop", (e) => {
      devLog(TAG, "drop (scroll-area catch-all)", {
        rawTarget: elPath(e.target),
        resolvedTh: elPath(e.target.closest?.("th")),
        dragSourceCol,
      });
      // Only handle if drop landed outside the table's own listeners
      // (i.e. on the gutter overlay). If it landed on a th, onDrop
      // will already have been called via the th/thead listeners.
      if (dragSourceCol !== null) {
        onDrop(e);
      }
    });
  }

  for (const row of rows) {
    const cell = row.querySelector("td, th");
    if (!cell) continue;
    const hideBtn = document.createElement("span");
    hideBtn.className = "bds-row-hide-btn";
    hideBtn.textContent = "\u2212";
    hideBtn.title = i18n.t("tableInjector.hideRow");
    hideBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      row.setAttribute(HIDDEN_ROW_ATTR, "");
    });
    cell.insertBefore(hideBtn, cell.firstChild);
  }

  const gearBtn = document.createElement("span");
  gearBtn.className = "bds-table-gear";
  gearBtn.textContent = "\u2699";
  gearBtn.title = i18n.t("tableInjector.manageColumnsRows");
  table.classList.add("bds-table-enhanced");
  gearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showManagePopover(e, table, gearBtn);
  });
  table.appendChild(gearBtn);
}

function wrapHeaderText(th) {
  const textNodes = [];
  const walk = document.createTreeWalker(th, NodeFilter.SHOW_TEXT, null, false);
  while (walk.nextNode()) {
    const t = walk.currentNode;
    if (t.textContent.trim()) textNodes.push(t);
  }
  if (textNodes.length === 0) return;
  const span = document.createElement("span");
  span.className = "bds-th-text";
  for (const t of textNodes) {
    span.appendChild(t.cloneNode(false));
  }
  for (const t of textNodes) {
    t.remove();
  }
  if (th.firstChild) {
    th.insertBefore(span, th.firstChild);
  } else {
    th.appendChild(span);
  }
}

function syncColIndexes(table) {
  const thead = table.querySelector("thead");
  if (!thead) return;
  // Use :scope > tr > th to avoid picking up th's from nested tables inside cells
  const ths = Array.from(thead.querySelectorAll(":scope > tr > th"));
  ths.forEach((th, i) => th.setAttribute(DRAG_COL_ATTR, String(i)));
}

function getVisibleRows(tbody) {
  const rows = Array.from(tbody.querySelectorAll(":scope > tr"));
  return rows.filter((r) => !r.hasAttribute(HIDDEN_ROW_ATTR));
}

function setSortDirection(th, dir) {
  if (dir) {
    th.setAttribute(SORT_ATTR, dir);
  } else {
    th.removeAttribute(SORT_ATTR);
  }
}

function sortTableByColumn(table, colIndex, direction) {
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  if (!thead || !tbody) return;

  const ths = Array.from(thead.querySelectorAll(":scope > tr > th"));
  const th = ths[colIndex];
  if (!th) return;

  // Clear all headers, set only the target one
  for (const h of ths) h.removeAttribute(SORT_ATTR);

  if (!direction) {
    // Reset to original order
    const rows = Array.from(tbody.querySelectorAll(":scope > tr"));
    rows.sort((a, b) => {
      const ai = parseInt(a.getAttribute(ORIG_ROW_ATTR) || "0", 10);
      const bi = parseInt(b.getAttribute(ORIG_ROW_ATTR) || "0", 10);
      return ai - bi;
    });
    for (const r of rows) tbody.appendChild(r);
    return;
  }

  setSortDirection(th, direction);

  const rows = getVisibleRows(tbody);
  rows.sort(makeComparator(colIndex, direction));

  const allRows = Array.from(tbody.querySelectorAll(":scope > tr"));
  const hiddenRows = allRows.filter((r) => r.hasAttribute(HIDDEN_ROW_ATTR));
  for (const r of rows) tbody.appendChild(r);
  for (const r of hiddenRows) tbody.appendChild(r);
}

function makeComparator(colIndex, direction) {
  return (a, b) => {
    const aCells = a.querySelectorAll(":scope > td, :scope > th");
    const bCells = b.querySelectorAll(":scope > td, :scope > th");
    const aVal = aCells[colIndex]?.textContent.trim() || "";
    const bVal = bCells[colIndex]?.textContent.trim() || "";
    const aNum = parseFloat(aVal.replace(/[^0-9.\-]/g, ""));
    const bNum = parseFloat(bVal.replace(/[^0-9.\-]/g, ""));
    const cmp = (!isNaN(aNum) && !isNaN(bNum)) ? aNum - bNum : aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: "base" });
    return direction === "asc" ? cmp : -cmp;
  };
}

function cycleSort(table, colIndex) {
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  if (!thead || !tbody) return;

  const ths = Array.from(thead.querySelectorAll(":scope > tr > th"));
  const th = ths[colIndex];
  if (!th) return;

  const current = th.getAttribute(SORT_ATTR) || "";
  const next = current === "" ? "asc" : current === "asc" ? "desc" : "";

  sortTableByColumn(table, colIndex, next);
}

function showColumnDropdown(event, table, colIndex, btn) {
  closeAllDropdowns();

  const thead = table.querySelector("thead");
  const ths = Array.from(thead.querySelectorAll(":scope > tr > th"));
  const th = ths[colIndex];
  if (!th) return;

  const dropdown = document.createElement("div");
  dropdown.className = "bds-col-dropdown";

  const sortAsc = document.createElement("div");
  sortAsc.className = "bds-col-dropdown-item";
  sortAsc.textContent = i18n.t("tableInjector.sortAsc");
  sortAsc.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.remove();
    for (const h of ths) h.removeAttribute(SORT_ATTR);
    sortTableByColumn(table, colIndex, "asc");
  });
  dropdown.appendChild(sortAsc);

  const sortDesc = document.createElement("div");
  sortDesc.className = "bds-col-dropdown-item";
  sortDesc.textContent = i18n.t("tableInjector.sortDesc");
  sortDesc.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.remove();
    for (const h of ths) h.removeAttribute(SORT_ATTR);
    sortTableByColumn(table, colIndex, "desc");
  });
  dropdown.appendChild(sortDesc);

  const divider = document.createElement("div");
  divider.className = "bds-col-dropdown-divider";
  dropdown.appendChild(divider);

  const isHidden = th.hasAttribute(HIDDEN_COL_ATTR);
  const hideItem = document.createElement("div");
  hideItem.className = "bds-col-dropdown-item";
  hideItem.textContent = isHidden ? i18n.t("tableInjector.showColumn") : i18n.t("tableInjector.hideColumn");
  hideItem.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.remove();
    toggleColumnHidden(table, colIndex, !isHidden);
  });
  dropdown.appendChild(hideItem);

  const rect = btn.getBoundingClientRect();
  dropdown.style.position = "fixed";
  dropdown.style.left = rect.left + "px";
  dropdown.style.top = rect.bottom + 4 + "px";

  document.body.appendChild(dropdown);

  const closer = (e2) => {
    if (!dropdown.contains(e2.target)) {
      dropdown.remove();
      document.removeEventListener("click", closer, true);
    }
  };
  setTimeout(() => document.addEventListener("click", closer, true), 0);
}

function toggleColumnHidden(table, colIndex, hidden) {
  const thead = table.querySelector("thead");
  const ths = Array.from(thead.querySelectorAll(":scope > tr > th"));
  const th = ths[colIndex];
  if (!th) return;

  if (hidden) {
    th.setAttribute(HIDDEN_COL_ATTR, "");
  } else {
    th.removeAttribute(HIDDEN_COL_ATTR);
  }

  // Use thead and tbody separately to avoid descending into nested tables
  const theadRows = thead.querySelectorAll(":scope > tr");
  for (const row of theadRows) {
    const cells = row.querySelectorAll(":scope > td, :scope > th");
    const cell = cells[colIndex];
    if (!cell) continue;
    if (hidden) cell.setAttribute(HIDDEN_COL_ATTR, "");
    else cell.removeAttribute(HIDDEN_COL_ATTR);
  }
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  const tbodyRows = tbody.querySelectorAll(":scope > tr");
  for (const row of tbodyRows) {
    const cells = row.querySelectorAll(":scope > td, :scope > th");
    const cell = cells[colIndex];
    if (!cell) continue;
    if (hidden) cell.setAttribute(HIDDEN_COL_ATTR, "");
    else cell.removeAttribute(HIDDEN_COL_ATTR);
  }
}

function showManagePopover(event, table, gearBtn) {
  closeAllDropdowns();

  const popover = document.createElement("div");
  popover.className = "bds-manage-popover";

  const colSection = document.createElement("div");
  colSection.className = "bds-manage-section";
  const colTitle = document.createElement("div");
  colTitle.className = "bds-manage-section-title";
  colTitle.textContent = i18n.t("tableInjector.columns");
  colSection.appendChild(colTitle);

  const thead = table.querySelector("thead");
  const ths = thead ? Array.from(thead.querySelectorAll(":scope > tr > th")) : [];

  for (let i = 0; i < ths.length; i++) {
    const th = ths[i];
    const label = th.textContent.trim().replace(/[\u2195\u25BE\u2699]/g, "").trim() || i18n.t("tableInjector.columnLabel", { n: i + 1 });
    const row = document.createElement("label");
    row.className = "bds-manage-row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !th.hasAttribute(HIDDEN_COL_ATTR);
    cb.addEventListener("change", () => {
      toggleColumnHidden(table, i, !cb.checked);
    });
    const span = document.createElement("span");
    span.textContent = label;
    row.appendChild(cb);
    row.appendChild(span);
    colSection.appendChild(row);
  }
  popover.appendChild(colSection);

  const tbody = table.querySelector("tbody");
  const hiddenRows = tbody ? Array.from(tbody.querySelectorAll(":scope > tr[" + HIDDEN_ROW_ATTR + "]")) : [];

  if (hiddenRows.length > 0) {
    const div = document.createElement("div");
    div.className = "bds-manage-divider";
    popover.appendChild(div);

    const rowSection = document.createElement("div");
    rowSection.className = "bds-manage-section";
    const rowTitle = document.createElement("div");
    rowTitle.className = "bds-manage-section-title";
    rowTitle.textContent = i18n.t("tableInjector.hiddenRows", { count: hiddenRows.length });
    rowSection.appendChild(rowTitle);

    for (const hr of hiddenRows) {
      const firstCell = hr.querySelector("td, th");
      const label = firstCell ? firstCell.textContent.trim().slice(0, 40) : "Row";
      const r = document.createElement("div");
      r.className = "bds-manage-row";
      r.textContent = "\u21A9 " + label;
      r.addEventListener("click", () => {
        hr.removeAttribute(HIDDEN_ROW_ATTR);
        popover.remove();
      });
      rowSection.appendChild(r);
    }
    popover.appendChild(rowSection);
  }

  const showAll = document.createElement("div");
  showAll.className = "bds-manage-show-all";
  showAll.textContent = i18n.t("tableInjector.showAll");
  showAll.addEventListener("click", () => {
    const allCells = table.querySelectorAll("[" + HIDDEN_COL_ATTR + "]");
    for (const c of allCells) c.removeAttribute(HIDDEN_COL_ATTR);
    const allHRows = table.querySelectorAll("[" + HIDDEN_ROW_ATTR + "]");
    for (const r of allHRows) r.removeAttribute(HIDDEN_ROW_ATTR);
    popover.remove();
  });
  popover.appendChild(showAll);

  const rect = gearBtn.getBoundingClientRect();
  popover.style.position = "fixed";
  popover.style.left = Math.max(4, rect.right - 190) + "px";
  popover.style.top = rect.bottom + 4 + "px";

  document.body.appendChild(popover);

  const closer = (e2) => {
    if (!popover.contains(e2.target) && e2.target !== gearBtn) {
      popover.remove();
      document.removeEventListener("click", closer, true);
    }
  };
  setTimeout(() => document.addEventListener("click", closer, true), 0);
}

function closeAllDropdowns() {
  for (const el of document.querySelectorAll(".bds-col-dropdown, .bds-manage-popover")) {
    el.remove();
  }
}

let dragSourceCol = null;
let activeTable = null;

function globalDragOver(e) {
  if (dragSourceCol === null) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
}

function globalDrop(e) {
  if (dragSourceCol === null) return;
  devLog(TAG, "globalDrop captured", { rawTarget: elPath(e.target) });
  onDrop(e);
}

// Helper: build a short readable path of an element for logging
function elPath(el) {
  if (!el) return "null";
  const tag = el.tagName?.toLowerCase() ?? "?";
  const cls = el.className ? "." + String(el.className).trim().split(/\s+/).slice(0, 3).join(".") : "";
  const col = el.getAttribute?.(DRAG_COL_ATTR);
  return tag + cls + (col !== null ? `[col=${col}]` : "");
}

function onDragStart(e) {
  const th = e.target.closest("th");

  devLog(TAG, "dragstart →", {
    rawTarget: elPath(e.target),
    resolvedTh: elPath(th),
    inThead: !!th?.parentElement?.closest("thead"),
    colAttr: th?.getAttribute(DRAG_COL_ATTR),
    draggable: th?.draggable,
  });

  if (!th || !th.parentElement?.closest("thead")) { e.preventDefault(); return; }
  dragSourceCol = parseInt(th.getAttribute(DRAG_COL_ATTR), 10);
  activeTable = th.closest("table");
  if (activeTable) {
    activeTable.classList.add("bds-table-dragging");
  }

  window.addEventListener("dragover", globalDragOver, true);
  window.addEventListener("drop", globalDrop, true);

  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", String(dragSourceCol));
  th.classList.add("bds-col-dragging");

  devLog(TAG, "dragstart ✓ dragSourceCol =", dragSourceCol);
}

// Throttle dragover logs to avoid flooding the console
let _lastDragOverLog = 0;

function onDragOver(e) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

  const th = e.target.closest("th");

  // Log only every 300 ms to avoid spam
  const now = Date.now();
  if (now - _lastDragOverLog > 300) {
    _lastDragOverLog = now;

    // Walk up from e.target to find relevant ancestors
    const ancestors = [];
    let el = e.target;
    for (let i = 0; i < 6 && el; i++) {
      ancestors.push(elPath(el));
      el = el.parentElement;
    }

    const scrollContainerDebug = th
      ? th.closest(".ds-scroll-area")
      : e.target.closest?.(".ds-scroll-area");

    devLog(TAG, "dragover", {
      rawTarget: elPath(e.target),
      resolvedTh: elPath(th),
      inThead: !!th?.parentElement?.closest("thead"),
      dragSourceCol,
      targetAncestors: ancestors,
      scrollContainer: scrollContainerDebug ? {
        scrollLeft: scrollContainerDebug.scrollLeft,
        scrollWidth: scrollContainerDebug.scrollWidth,
        clientWidth: scrollContainerDebug.clientWidth,
        rect: (() => {
          const r = scrollContainerDebug.getBoundingClientRect();
          return { left: Math.round(r.left), right: Math.round(r.right) };
        })(),
      } : null,
      pointerEvents: th ? window.getComputedStyle(th).pointerEvents : null,
    });
  }

  // Find target table or active table
  const table = th?.closest("table") || activeTable;
  if (!table) return;

  // Auto-scroll when dragging near the edges of a scroll container
  const scrollContainer = table.closest(".ds-scroll-area");
  if (scrollContainer) {
    const rect = scrollContainer.getBoundingClientRect();
    const edgeThreshold = 80;
    if (e.clientX > rect.right - edgeThreshold) {
      scrollContainer.scrollLeft += 15;
    } else if (e.clientX < rect.left + edgeThreshold) {
      scrollContainer.scrollLeft -= 15;
    }
  }

  // Determine overCol either from target th or by horizontal clientX position
  let targetTh = th;
  if (!targetTh || !targetTh.parentElement?.closest("thead")) {
    const ths = Array.from(table.querySelectorAll("thead > tr > th"));
    for (const t of ths) {
      const r = t.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right) {
        targetTh = t;
        break;
      }
    }
  }

  if (!targetTh) return;

  const overCol = parseInt(targetTh.getAttribute(DRAG_COL_ATTR), 10);
  if (isNaN(overCol) || overCol === dragSourceCol) return;
  const rect = targetTh.getBoundingClientRect();
  const midX = rect.left + rect.width / 2;
  const isRight = e.clientX > midX;
  for (const h of table.querySelectorAll(":scope > thead > tr > th")) {
    h.classList.remove("bds-col-drop-left", "bds-col-drop-right");
  }
  targetTh.classList.add(isRight ? "bds-col-drop-right" : "bds-col-drop-left");
}

function onDragEnter(e) {
  e.preventDefault();
  devLog(TAG, "dragenter →", elPath(e.target), "| th:", elPath(e.target.closest?.("th")));
}

function onDragLeave(e) {
  const th = e.target.closest("th");
  if (th) th.classList.remove("bds-col-drop-left", "bds-col-drop-right");
  devLog(TAG, "dragleave ←", elPath(e.target));
}

function onDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  if (dragSourceCol === null) return;

  let targetTh = e.target.closest("th");
  const table = targetTh?.closest("table") || activeTable || e.target.closest?.(".ds-scroll-area")?.querySelector("table") || e.target.closest?.("table");

  // If drop landed outside <th> (e.g., overlay / sticky gutters / child element),
  // resolve targetTh using clientX position across the header cells.
  if ((!targetTh || !targetTh.parentElement?.closest("thead")) && table) {
    const ths = Array.from(table.querySelectorAll("thead > tr > th"));
    for (const th of ths) {
      const rect = th.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right) {
        targetTh = th;
        break;
      }
    }
  }

  devLog(TAG, "drop fired", {
    rawTarget: elPath(e.target),
    resolvedTargetTh: elPath(targetTh),
    inThead: !!targetTh?.parentElement?.closest("thead"),
    dragSourceCol,
    targetColAttr: targetTh?.getAttribute(DRAG_COL_ATTR),
  });

  if (!targetTh || !targetTh.parentElement?.closest("thead")) {
    devLog(TAG, "drop ABORTED — targetTh not in thead");
    cleanupDragState();
    return;
  }

  const fromCol = dragSourceCol;
  const toCol = parseInt(targetTh.getAttribute(DRAG_COL_ATTR), 10);

  devLog(TAG, "drop cols", { fromCol, toCol });

  if (isNaN(fromCol) || isNaN(toCol) || fromCol === toCol) {
    devLog(TAG, "drop SKIPPED — same col or invalid source");
    cleanupDragState();
    return;
  }

  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  if (!thead || !tbody) {
    devLog(TAG, "drop ABORTED — no thead/tbody");
    cleanupDragState();
    return;
  }

  // Use :scope > tr > th to avoid matching th's inside nested tables within cells
  const ths = Array.from(thead.querySelectorAll(":scope > tr > th"));
  const fromTh = ths[fromCol];
  const toTh = ths[toCol];

  devLog(TAG, "drop header resolution", {
    thsCount: ths.length,
    fromTh: elPath(fromTh),
    toTh: elPath(toTh),
  });

  if (!fromTh || !toTh) {
    devLog(TAG, "drop ABORTED — fromTh or toTh not found");
    cleanupDragState();
    return;
  }

  const rect = targetTh.getBoundingClientRect();
  const midX = rect.left + rect.width / 2;
  const insertAfter = e.clientX > midX;

  devLog(TAG, "drop insertAfter =", insertAfter);

  const headerRow = fromTh.parentElement;
  if (insertAfter) {
    if (toTh.nextElementSibling) {
      headerRow.insertBefore(fromTh, toTh.nextElementSibling);
    } else {
      headerRow.appendChild(fromTh);
    }
  } else {
    headerRow.insertBefore(fromTh, toTh);
  }

  // Use :scope > tr to avoid picking up rows from nested tables inside cells
  const tbodyRows = tbody.querySelectorAll(":scope > tr");
  let rowsProcessed = 0;
  let rowsSkipped = 0;

  for (const row of tbodyRows) {
    const cells = Array.from(row.querySelectorAll(":scope > td, :scope > th"));
    if (cells.length <= Math.max(fromCol, toCol)) {
      devLog(TAG, "drop row SKIPPED (not enough cells)", {
        cellCount: cells.length,
        needed: Math.max(fromCol, toCol) + 1,
      });
      rowsSkipped++;
      continue;
    }
    const fromCell = cells[fromCol];
    const toCell = cells[toCol];
    if (!fromCell || !toCell) { rowsSkipped++; continue; }

    if (insertAfter) {
      if (toCell.nextElementSibling) {
        row.insertBefore(fromCell, toCell.nextElementSibling);
      } else {
        row.appendChild(fromCell);
      }
    } else {
      row.insertBefore(fromCell, toCell);
    }
    rowsProcessed++;
  }

  devLog(TAG, "drop body rows", { rowsProcessed, rowsSkipped });

  syncColIndexes(table);
  cleanupDragState();
  devLog(TAG, "drop DONE ✓");
}

function cleanupDragState() {
  window.removeEventListener("dragover", globalDragOver, true);
  window.removeEventListener("drop", globalDrop, true);

  if (activeTable) {
    activeTable.classList.remove("bds-table-dragging");
    for (const h of activeTable.querySelectorAll(":scope > thead > tr > th")) {
      h.classList.remove("bds-col-drop-left", "bds-col-drop-right", "bds-col-dragging");
    }
  }
  dragSourceCol = null;
  activeTable = null;
}

function onDragEnd(e) {
  devLog(TAG, "dragend", { dragSourceCol });
  cleanupDragState();
}

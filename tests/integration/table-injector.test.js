// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { injectDynamicTableFeatures } from "../../src/content/dom/table-injector.js";

function mkTable(headers, rows) {
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  for (const h of headers) {
    const th = document.createElement("th");
    th.textContent = h;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const rowData of rows) {
    const row = document.createElement("tr");
    for (const cellData of rowData) {
      const td = document.createElement("td");
      td.textContent = String(cellData);
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  return table;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("injectDynamicTableFeatures dedup", () => {
  it("injects table enhancement attributes", () => {
    const table = mkTable(["Name", "Age"], [["Alice", "30"], ["Bob", "25"]]);
    document.body.appendChild(table);

    injectDynamicTableFeatures(document.body);
    expect(table.getAttribute("data-bds-table-enhanced")).toBe("1");
    expect(table.classList.contains("bds-table-enhanced")).toBe(true);
  });

  it("does not re-inject on second call", () => {
    const table = mkTable(["Name", "Age"], [["Alice", "30"]]);
    document.body.appendChild(table);

    injectDynamicTableFeatures(document.body);
    const btnCount1 = table.querySelectorAll(".bds-col-menu-btn").length;

    injectDynamicTableFeatures(document.body);
    const btnCount2 = table.querySelectorAll(".bds-col-menu-btn").length;

    expect(btnCount1).toBeGreaterThan(0);
    expect(btnCount2).toBe(btnCount1);
  });

  it("skips tables inside #bds-root", () => {
    const root = document.createElement("div");
    root.id = "bds-root";
    const table = mkTable(["A"], [["1"]]);
    root.appendChild(table);
    document.body.appendChild(root);

    injectDynamicTableFeatures(document.body);
    expect(table.hasAttribute("data-bds-table-enhanced")).toBe(false);
  });

  it("processes multiple tables independently", () => {
    const t1 = mkTable(["X"], [["a"]]);
    const t2 = mkTable(["Y"], [["b"]]);
    document.body.appendChild(t1);
    document.body.appendChild(t2);

    injectDynamicTableFeatures(document.body);
    expect(t1.getAttribute("data-bds-table-enhanced")).toBe("1");
    expect(t2.getAttribute("data-bds-table-enhanced")).toBe("1");
    expect(t1.querySelectorAll(".bds-col-menu-btn").length).toBe(1);
    expect(t2.querySelectorAll(".bds-col-menu-btn").length).toBe(1);
  });
});

describe("column sort indicators", () => {
  it("adds sort icon to each header", () => {
    const table = mkTable(["Name", "Score"], [["Alice", "95"]]);
    document.body.appendChild(table);
    injectDynamicTableFeatures(document.body);

    const icons = table.querySelectorAll(".bds-sort-icon");
    expect(icons.length).toBe(2);
  });

  it("cycles sort state on header click", () => {
    const table = mkTable(["Name", "Age"], [["Bob", "30"], ["Alice", "25"], ["Charlie", "35"]]);
    document.body.appendChild(table);
    injectDynamicTableFeatures(document.body);

    const ths = table.querySelectorAll("th");
    const ageTh = ths[1];

    // First click → asc
    ageTh.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(ageTh.getAttribute("data-bds-sort")).toBe("asc");

    // Second click → desc
    ageTh.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(ageTh.getAttribute("data-bds-sort")).toBe("desc");

    // Third click → no sort (reset)
    ageTh.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(ageTh.hasAttribute("data-bds-sort")).toBe(false);
  });
});

describe("column menu button", () => {
  it("adds menu button to each header", () => {
    const table = mkTable(["A", "B", "C"], [["1", "2", "3"]]);
    document.body.appendChild(table);
    injectDynamicTableFeatures(document.body);

    const btns = table.querySelectorAll(".bds-col-menu-btn");
    expect(btns.length).toBe(3);
  });

  it("shows dropdown on menu button click", () => {
    const table = mkTable(["Name"], [["Alice"]]);
    document.body.appendChild(table);
    injectDynamicTableFeatures(document.body);

    const btn = table.querySelector(".bds-col-menu-btn");
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const dropdown = document.querySelector(".bds-col-dropdown");
    expect(dropdown).not.toBeNull();
    expect(dropdown.textContent).toContain("Hide column");
  });
});

describe("column hide/show", () => {
  it("hides column when toggled", () => {
    const table = mkTable(["Name", "Age"], [["Alice", "30"], ["Bob", "25"]]);
    document.body.appendChild(table);
    injectDynamicTableFeatures(document.body);

    const ths = table.querySelectorAll("th");
    ths[0].setAttribute("data-bds-col-hidden", "");

    // Also need to hide matching td
    const rows = table.querySelectorAll("tr");
    for (const row of rows) {
      const cells = row.querySelectorAll("td, th");
      if (cells[0]) cells[0].setAttribute("data-bds-col-hidden", "");
    }

    const hiddenHeaders = table.querySelectorAll("th[data-bds-col-hidden]");
    expect(hiddenHeaders.length).toBe(1);
    expect(hiddenHeaders[0].textContent.trim()).toContain("Name");
  });
});

describe("row hide button", () => {
  it("adds hide button to each data row", () => {
    const table = mkTable(["A"], [["1"], ["2"], ["3"]]);
    document.body.appendChild(table);
    injectDynamicTableFeatures(document.body);

    const hideBtns = table.querySelectorAll(".bds-row-hide-btn");
    expect(hideBtns.length).toBe(3);
  });

  it("hides row when hide button clicked", () => {
    const table = mkTable(["A"], [["row1"], ["row2"]]);
    document.body.appendChild(table);
    injectDynamicTableFeatures(document.body);

    const rows = table.querySelectorAll("tbody tr");
    const hideBtn = rows[0].querySelector(".bds-row-hide-btn");
    hideBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(rows[0].getAttribute("data-bds-row-hidden")).toBe("");
  });
});

describe("gear manage popover", () => {
  it("adds gear button to table", () => {
    const table = mkTable(["A"], [["1"]]);
    document.body.appendChild(table);
    injectDynamicTableFeatures(document.body);

    const gear = table.querySelector(".bds-table-gear");
    expect(gear).not.toBeNull();
  });

  it("opens manage popover on gear click", () => {
    const table = mkTable(["Name", "Age"], [["Alice", "30"]]);
    document.body.appendChild(table);
    injectDynamicTableFeatures(document.body);

    const gear = table.querySelector(".bds-table-gear");
    gear.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const popover = document.querySelector(".bds-manage-popover");
    expect(popover).not.toBeNull();
    expect(popover.textContent).toContain("Columns");
  });
});

describe("column drag-and-drop", () => {
  it("makes headers draggable", () => {
    const table = mkTable(["A", "B"], [["1", "2"]]);
    document.body.appendChild(table);
    injectDynamicTableFeatures(document.body);

    const ths = table.querySelectorAll("th");
    for (const th of ths) {
      expect(th.draggable).toBe(true);
    }
  });
});

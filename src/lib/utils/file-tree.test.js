import { describe, expect, it } from "vitest";
import { buildTreeRows } from "./file-tree.js";

describe("buildTreeRows", () => {
  it("returns an empty list for no paths", () => {
    expect(buildTreeRows([])).toEqual([]);
  });

  it("builds a flat single-file tree", () => {
    expect(buildTreeRows(["main.rs"])).toEqual([
      { name: "main.rs", depth: 0, dir: false },
    ]);
  });

  it("builds nested paths with depth and folders-first ordering", () => {
    expect(
      buildTreeRows(["src/main.rs", "src/lib/util.rs", "Cargo.toml", "src/lib/mod.rs"]),
    ).toEqual([
      { name: "src", depth: 0, dir: true },
      { name: "lib", depth: 1, dir: true },
      { name: "mod.rs", depth: 2, dir: false },
      { name: "util.rs", depth: 2, dir: false },
      { name: "main.rs", depth: 1, dir: false },
      { name: "Cargo.toml", depth: 0, dir: false },
    ]);
  });

  it("sorts alphabetically and folders before files at each level", () => {
    expect(buildTreeRows(["b.txt", "a.txt", "zdir/x", "adir/y"])).toEqual([
      { name: "adir", depth: 0, dir: true },
      { name: "y", depth: 1, dir: false },
      { name: "zdir", depth: 0, dir: true },
      { name: "x", depth: 1, dir: false },
      { name: "a.txt", depth: 0, dir: false },
      { name: "b.txt", depth: 0, dir: false },
    ]);
  });

  it("ignores empty path segments", () => {
    expect(buildTreeRows(["src//main.rs", "/root/file.txt"])).toEqual([
      { name: "root", depth: 0, dir: true },
      { name: "file.txt", depth: 1, dir: false },
      { name: "src", depth: 0, dir: true },
      { name: "main.rs", depth: 1, dir: false },
    ]);
  });
});
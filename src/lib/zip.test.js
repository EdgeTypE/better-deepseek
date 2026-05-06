import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { buildZip } from "./zip.js";

describe("buildZip", () => {
  it("builds a readable zip blob from file entries", async () => {
    const blob = buildZip([
      { path: "src/app.js", content: "console.log('hi');" },
      { fileName: "README.md", content: "# Hello" },
    ]);

    expect(blob.type).toBe("application/zip");

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const files = unzipSync(bytes);

    expect(strFromU8(files["src/app.js"])).toBe("console.log('hi');");
    expect(strFromU8(files["README.md"])).toBe("# Hello");
  });

  it("normalizes unsafe paths inside the archive", async () => {
    const blob = buildZip([{ path: "C:\\tmp\\..\\safe\\file.txt", content: "ok" }]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const files = unzipSync(bytes);

    expect(Object.keys(files)).toEqual(["tmp/safe/file.txt"]);
  });

  it("throws for an empty file list", () => {
    expect(() => buildZip([])).toThrow("buildZip expects a non-empty files array.");
  });
});

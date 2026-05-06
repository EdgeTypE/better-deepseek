// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { projectFilesToFile } from "./project-file-builder.js";

describe("projectFilesToFile", () => {
  it("returns null for an empty file list", () => {
    expect(projectFilesToFile([], "Demo")).toBeNull();
  });

  it("concatenates project files into a single attachment", async () => {
    const file = projectFilesToFile(
      [
        { name: "src/app.js", content: "console.log('hi');" },
        { name: "README.md", content: "# Demo" },
      ],
      "My Project",
    );

    expect(file.name).toBe("my_project_context.txt");
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(file);
    });
    expect(text).toContain("Project: My Project");
    expect(text).toContain("--- [FILE: src/app.js] ---");
    expect(text).toContain("# Demo");
  });
});

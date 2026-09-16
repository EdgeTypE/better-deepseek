import { describe, expect, it } from "vitest";

import { parseBdsMessage } from "../../src/content/parser/index.js";

/**
 * End-to-end proof that an attribute value may contain `>`.
 *
 * The scanner unit tests in src/content/parser/tag-scanner.test.js cover the
 * mechanism; these go through parseBdsMessage so a future change that
 * reintroduces a `[^>]*` capture somewhere in the pipeline is caught.
 */
describe("attribute values containing >", () => {
  it("keeps a > in a self-closing IMAGE caption", () => {
    const result = parseBdsMessage(
      '<BDS:IMAGE src="a.png" caption="Revenue > Costs" />'
    );

    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].attrs).toMatchObject({
      src: "a.png",
      caption: "Revenue > Costs",
    });
  });

  it("keeps a > in a self-closing memory_write value", () => {
    const result = parseBdsMessage(
      '<BDS:memory_write key="threshold" value="warn when > 80" />'
    );

    expect(result.memoryWrites).toHaveLength(1);
    expect(result.memoryWrites[0]).toMatchObject({
      key: "threshold",
      value: "warn when > 80",
    });
  });

  it("keeps a > in a paired tag's attributes", () => {
    const result = parseBdsMessage(
      '<BDS:HTML title="a > b">```html\n<p>hi</p>\n```</BDS:HTML>'
    );

    const html = result.renderableBlocks.find((b) => b.name === "html");
    expect(html.attrs.title).toBe("a > b");
  });

  it("keeps a > in the body of a paired tag", () => {
    const result = parseBdsMessage(
      '<BDS:create_file fileName="x.py">```python\nif a > b: pass\n```</BDS:create_file>'
    );

    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe("if a > b: pass\n");
  });

  it("keeps a payload quote inside a quoted value", () => {
    // `src` is required for the image card to render at all.
    const result = parseBdsMessage('<BDS:IMAGE src="a.png" caption="a "b" c" />');

    expect(result.renderableBlocks[0].attrs.caption).toBe('a "b" c');
  });

  it("still accepts a self-closing AUTO request", () => {
    const result = parseBdsMessage(
      'Inspect: <BDS:AUTO:FILE_READ path="src/index.js"/>'
    );

    expect(result.autoRequests.fileRead).toEqual(["src/index.js"]);
  });

  it("still accepts a stray attribute after the last quoted value", () => {
    const result = parseBdsMessage(
      '<BDS:create_file fileName="test.py" extra>```\nx = 1\n```</BDS:create_file>'
    );

    expect(result.createFiles).toHaveLength(1);
    expect(result.createFiles[0].content).toBe("x = 1\n");
  });
});

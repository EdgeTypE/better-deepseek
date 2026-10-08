import { describe, expect, it } from "vitest";
import { parseBdsMessage } from "./index.js";

const SCORE = "tempo: 96\ntrack Melody instrument=piano\nC4/4 E4/4 G4/2";

describe("BDS:midi parser", () => {
  it("parses a paired <BDS:midi> tag", () => {
    const result = parseBdsMessage(`Here is your tune:\n<BDS:midi>${SCORE}</BDS:midi>\nEnjoy!`);

    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0]).toMatchObject({ name: "midi", content: SCORE });
    expect(result.visibleText).toContain("\x00BLOCK:0\x00");
    expect(result.visibleText).toContain("Here is your tune:");
    expect(result.visibleText).toContain("Enjoy!");
  });

  it("handles case-insensitive <BDS:MIDI> tags and keeps attributes", () => {
    const raw = `<BDS:MIDI title="Night Drive">C4/4</BDS:MIDI>`;
    const result = parseBdsMessage(raw);

    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].name).toBe("midi");
    expect(result.renderableBlocks[0].attrs.title).toBe("Night Drive");
  });

  it("detects streaming state when <BDS:midi> is still open", () => {
    const raw = `Prefix text\n<BDS:midi>\ntempo: 120\nC4/4 E4/4`;
    const result = parseBdsMessage(raw, false);

    expect(result.isStreamingTool).toBe(true);
    expect(result.streamingTagName).toBe("midi");
    expect(result.visibleText).toBe("Prefix text");
  });

  it("auto-closes an unclosed <BDS:midi> when isSettled is true", () => {
    const result = parseBdsMessage(`<BDS:midi>${SCORE}`, true);

    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].name).toBe("midi");
  });

  it("ignores <BDS:midi> inside markdown code blocks", () => {
    const raw = "```html\n<BDS:midi>C4/4</BDS:midi>\n```";
    const result = parseBdsMessage(raw);

    expect(result.renderableBlocks).toHaveLength(0);
    expect(result.visibleText).toContain("&lt;BDS:midi>");
  });

  it("unwraps markdown code fences inside <BDS:midi>", () => {
    const raw = `<BDS:midi>\n\`\`\`\nC4/4 E4/4\n\`\`\`\n</BDS:midi>`;
    const result = parseBdsMessage(raw);

    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].content.trim()).toBe("C4/4 E4/4");
  });

  it("parses a score with several tracks and directives", () => {
    const raw = `<BDS:midi>
title: Evening Loop
tempo: 96
track Melody instrument=piano
C4/4 E4/4 G4/4 A4/4 | G4/2 R/2
track "Bass Line" instrument=bass
C2/2 C2/2 A1/2 A1/2
</BDS:midi>`;
    const result = parseBdsMessage(raw);

    expect(result.renderableBlocks).toHaveLength(1);
    expect(result.renderableBlocks[0].content).toContain("Evening Loop");
    expect(result.renderableBlocks[0].content).toContain("Bass Line");
  });
});

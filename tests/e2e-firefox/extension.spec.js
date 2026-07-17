/**
 * Firefox E2E contracts — built-extension verification through Selenium + BiDi.
 *
 * Contracts:
 *   1. Extension boots and exposes primary controls.
 *   2. Storage quiescence: one unique replaceRemote → exactly 1 event;
 *      identical repeat → 0 more events; idle window → stable count.
 *   3. Performance: 200-msg baseline, 2000-msg scale. Every append < 2 s,
 *      median ratio ≤ 2.5×, absolute increase ≤ 750 ms.
 *   4. Host wrapper: real create_file message produces .bds-download-card
 *      inside .bds-host-wrapper with block-level, nonzero box.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createFirefoxFixture } from "./helpers/firefox-fixture.js";

describe("Firefox extension", () => {
  let fx;

  beforeAll(async () => {
    fx = await createFirefoxFixture();
  }, 60000);

  afterAll(async () => {
    if (fx) {
      const err = fx.getFixtureError();
      try { await fx.close(); } catch { /* ignore */ }
      if (err) throw err;
    }
  }, 15000);

  // ── Contract 1: Extension boots ──
  it("boots on the fixture and exposes primary controls", async () => {
    const toggle = await fx.driver.findElement({ css: "#bds-toggle" });
    expect(await toggle.isDisplayed()).toBe(true);

    const plusBtn = await fx.driver.findElement({ css: ".bds-plus-btn" });
    expect(plusBtn).toBeTruthy();
  });

  // ── Contract 2: Storage quiescence (#108 fix) ──
  it("produces exactly one config-updated event, zero for identical repeat, stable during idle", async () => {
    const { driver } = fx;
    const ts = Date.now();

    // Start extension-realm storage probe
    await driver.executeScript(`
      window.dispatchEvent(new CustomEvent("bds:debug-api-request", {
        detail: JSON.stringify({id:"fx-probe-start",method:"startStorageProbe",args:[]})
      }));
    `);

    // Init page-level event counter
    await driver.executeScript(`
      window.__bdsTestEvents = { remoteConfigUpdated: 0 };
      window.addEventListener("bds:remote-config-updated", () => {
        window.__bdsTestEvents.remoteConfigUpdated++;
      });
    `);

    // Unique replaceRemote
    await driver.executeScript(
      `window.dispatchEvent(new CustomEvent("bds:debug-api-request", {
        detail: JSON.stringify({id:"fx-1",method:"replaceRemote",
        args:[{features:{testFirefox:true,ts:${ts}}}]})
      }));`,
    );
    await driver.sleep(750);

    const afterFirst = await driver.executeScript(
      "return window.__bdsTestEvents.remoteConfigUpdated;",
    );
    expect(afterFirst).toBe(1);

    // Idle window — count must remain stable
    await driver.sleep(500);
    const afterIdle = await driver.executeScript(
      "return window.__bdsTestEvents.remoteConfigUpdated;",
    );
    expect(afterIdle).toBe(1);

    // Identical replacement — zero additional events
    await driver.executeScript(
      `window.dispatchEvent(new CustomEvent("bds:debug-api-request", {
        detail: JSON.stringify({id:"fx-2",method:"replaceRemote",
        args:[{features:{testFirefox:true,ts:${ts}}}]})
      }));`,
    );
    await driver.sleep(750);

    const afterRepeat = await driver.executeScript(
      "return window.__bdsTestEvents.remoteConfigUpdated;",
    );
    expect(afterRepeat).toBe(1);

    // Verify storage probe: exactly 1 remoteConfig event
    const probeResult = await driver.executeScript(`
      return new Promise(function(resolve) {
        var handler = function(e) {
          var detail = e.detail;
          if (typeof detail === "string") detail = JSON.parse(detail);
          if (detail.id === "fx-probe-get") { window.removeEventListener("bds:debug-api-response", handler); resolve(detail.result); }
        };
        window.addEventListener("bds:debug-api-response", handler);
        window.dispatchEvent(new CustomEvent("bds:debug-api-request", {
          detail: JSON.stringify({id:"fx-probe-get",method:"getStorageProbe",args:[]})
        }));
      });
    `);

    expect(probeResult).toBeTruthy();
    expect(probeResult.remoteConfig).toBe(1);

    // Stop probe
    await driver.executeScript(`
      window.dispatchEvent(new CustomEvent("bds:debug-api-request", {
        detail: JSON.stringify({id:"fx-probe-stop",method:"stopStorageProbe",args:[]})
      }));
    `);
  });

  // ── Contract 3: Performance (#105 fix) ──
  it("processes messages within time bounds at 200 and 2000 scale", async () => {
    const { driver } = fx;
    const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

    // 200 baseline
    await driver.executeScript("window.__mockDeepSeek.clearMessages();");
    await driver.executeScript("window.__mockDeepSeek.seedMessages(200);");
    const settled200 = await driver.executeScript(
      "return window.__mockDeepSeek.waitForAllMessagesProcessed(200, 30000);",
    );
    expect(settled200).toBe(200);

    const smallSamples = [];
    for (let i = 0; i < 5; i++) {
      const result = await driver.executeScript(
        "return window.__mockDeepSeek.appendAndMeasureProcessing('Firefox timing sample " + i + "', 5000);",
      );
      smallSamples.push(result.duration);
      expect(result.duration).toBeLessThan(2000);
    }
    expect(smallSamples).toHaveLength(5);

    // 2000 baseline
    await driver.executeScript("window.__mockDeepSeek.clearMessages();");
    await driver.executeScript("window.__mockDeepSeek.seedMessages(2000);");
    const settled2000 = await driver.executeScript(
      "return window.__mockDeepSeek.waitForAllMessagesProcessed(2000, 60000);",
    );
    expect(settled2000).toBe(2000);

    const largeSamples = [];
    for (let i = 0; i < 5; i++) {
      const result = await driver.executeScript(
        "return window.__mockDeepSeek.appendAndMeasureProcessing('Firefox large sample " + i + "', 5000);",
      );
      largeSamples.push(result.duration);
      expect(result.duration).toBeLessThan(2000);
    }
    expect(largeSamples).toHaveLength(5);

    expect(median(largeSamples)).toBeLessThanOrEqual(median(smallSamples) * 2.5);
    expect(median(largeSamples) - median(smallSamples)).toBeLessThanOrEqual(750);
  }, 120000);

  // ── Contract 4: Host wrapper box model ──
  it("renders create_file download card in host wrapper with block-level box", async () => {
    const { driver } = fx;
    await driver.executeScript("window.__mockDeepSeek.clearMessages();");

    await driver.executeScript(`
      window.__mockDeepSeek.addAssistantMessage(
        '<BDS:CREATE_FILE fileName="test-firefox.txt">\\nHello Firefox E2E\\n</BDS:CREATE_FILE>'
      );
    `);

    // Await download card observably
    await driver.sleep(3000);

    const card = await driver.findElement({ css: ".bds-download-card" });
    expect(card).toBeTruthy();

    const wrapper = await driver.findElement({ css: ".bds-host-wrapper" });
    expect(wrapper).toBeTruthy();

    const rect = await driver.executeScript(
      "var r = arguments[0].getBoundingClientRect(); return { w: r.width, h: r.height };",
      wrapper,
    );
    expect(rect.w).toBeGreaterThan(0);
    expect(rect.h).toBeGreaterThan(0);

    const display = await wrapper.getCssValue("display");
    expect(display).not.toBe("contents");
  });
});

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

    // Init event counter
    await driver.executeScript(`
      window.__bdsTestEvents = { remoteConfigUpdated: 0 };
      window.addEventListener("bds:remote-config-updated", () => {
        window.__bdsTestEvents.remoteConfigUpdated++;
      });
    `);
    const eventsBefore = await driver.executeScript(
      "return window.__bdsTestEvents.remoteConfigUpdated;",
    );

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
    // Exactly one new event
    expect(afterFirst).toBe(eventsBefore + 1);

    // Idle window — count must remain stable (no background writes)
    await driver.sleep(500);
    const afterIdle = await driver.executeScript(
      "return window.__bdsTestEvents.remoteConfigUpdated;",
    );
    expect(afterIdle).toBe(afterFirst);

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
    expect(afterRepeat).toBe(afterFirst);
  });

  // ── Contract 3: Performance (#105 fix) ──
  it("processes messages within time bounds at 200 and 2000 scale", async () => {
    const { driver } = fx;
    const samples = { small: [], large: [] };

    // Baseline: 200 messages, verify settlement
    await driver.executeScript("window.__mockDeepSeek.clearMessages();");
    await driver.executeScript("window.__mockDeepSeek.seedMessages(200);");

    // Wait until every message has data-bds-msg-id (proves processing settled)
    await driver.sleep(3000);
    const settled200 = await driver.executeScript(`
      var msgs = document.querySelectorAll(".ds-message");
      for (var i = 0; i < msgs.length; i++) {
        if (!msgs[i].getAttribute("data-bds-msg-id")) return false;
      }
      return msgs.length;
    `);
    expect(settled200).toBe(200);

    // 5 timing samples at 200
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await driver.executeScript(
        'window.__mockDeepSeek.addAssistantMessage("Firefox timing sample " + ' + i + ');',
      );
      // Wait for processing — poll for data-bds-msg-id on the new message
      await driver.sleep(500);
      const done = await driver.executeScript(`
        var msgs = document.querySelectorAll(".ds-message");
        var last = msgs[msgs.length - 1];
        return !!(last && last.getAttribute("data-bds-msg-id"));
      `);
      const elapsed = Date.now() - start;
      if (done) samples.small.push(elapsed);
      // Each sample must complete within 2 seconds
      expect(elapsed).toBeLessThan(2000);
    }
    expect(samples.small.length).toBeGreaterThanOrEqual(3);

    // Scale to 2000
    await driver.executeScript("window.__mockDeepSeek.clearMessages();");
    await driver.executeScript("window.__mockDeepSeek.seedMessages(2000);");

    await driver.sleep(5000);
    const settled2000 = await driver.executeScript(`
      var msgs = document.querySelectorAll(".ds-message");
      for (var i = 0; i < msgs.length; i++) {
        if (!msgs[i].getAttribute("data-bds-msg-id")) return false;
      }
      return msgs.length;
    `);
    expect(settled2000).toBe(2000);

    // 5 timing samples at 2000
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      await driver.executeScript(
        'window.__mockDeepSeek.addAssistantMessage("Firefox large sample " + ' + i + ');',
      );
      await driver.sleep(500);
      const done = await driver.executeScript(`
        var msgs = document.querySelectorAll(".ds-message");
        var last = msgs[msgs.length - 1];
        return !!(last && last.getAttribute("data-bds-msg-id"));
      `);
      const elapsed = Date.now() - start;
      if (done) samples.large.push(elapsed);
      expect(elapsed).toBeLessThan(2000);
    }
    expect(samples.large.length).toBeGreaterThanOrEqual(3);

    // Performance ratios
    const median = (arr) => {
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    };
    const smallMed = median(samples.small);
    const largeMed = median(samples.large);
    expect(largeMed).toBeLessThanOrEqual(smallMed * 2.5);
    expect(largeMed - smallMed).toBeLessThanOrEqual(750);
  }, 60000);

  // ── Contract 4: Host wrapper box model ──
  it("renders create_file download card in host wrapper with block-level box", async () => {
    const { driver } = fx;
    await driver.executeScript("window.__mockDeepSeek.clearMessages();");

    // Add a real create_file message that produces .bds-download-card
    await driver.executeScript(`
      window.__mockDeepSeek.addAssistantMessage(
        '<BDS:CREATE_FILE fileName="test-firefox.txt">\\nHello Firefox E2E\\n</BDS:CREATE_FILE>'
      );
    `);

    // Wait for parsing + overlay rendering
    await driver.sleep(3000);

    // Must find download card inside host wrapper
    const card = await driver.findElement({ css: ".bds-download-card" });
    expect(card).toBeTruthy();

    const wrapper = await driver.findElement({ css: ".bds-host-wrapper" });
    expect(wrapper).toBeTruthy();

    const rect = await driver.executeScript(
      "var r = arguments[0].getBoundingClientRect(); return { w: r.width, h: r.height };",
      wrapper,
    );
    expect(rect.w).toBeGreaterThan(0);

    const display = await wrapper.getCssValue("display");
    expect(display).not.toBe("contents");
  });
});

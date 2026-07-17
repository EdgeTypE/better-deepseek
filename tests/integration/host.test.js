// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  getOrCreateWrapper,
  getOrCreateHost,
  removeMessageHost,
  removeAllMessageHosts,
} from "../../src/content/dom/host.js";

describe("host wrapper", () => {
  let msg;

  beforeEach(() => {
    document.body.innerHTML = "";
    msg = document.createElement("div");
    msg.className = "ds-message _63c77b1";
    document.body.appendChild(msg);
  });

  it("repeated wrapper creation for one message returns same wrapper", () => {
    const w1 = getOrCreateWrapper(msg);
    const w2 = getOrCreateWrapper(msg);
    expect(w1).toBe(w2);
    expect(w1.className).toBe("bds-host-wrapper");
    // Wrapper inserted after the message
    expect(msg.nextElementSibling).toBe(w1);
  });

  it("multiple feature hosts share same wrapper", () => {
    const hostA = getOrCreateHost(msg, "bds-overlay-host");
    const hostB = getOrCreateHost(msg, "bds-file-host");
    const wrapper = getOrCreateWrapper(msg);

    expect(hostA.parentElement).toBe(wrapper);
    expect(hostB.parentElement).toBe(wrapper);
    expect(wrapper.childElementCount).toBe(2);
  });

  it("repeated host creation for same class deduplicates", () => {
    const host1 = getOrCreateHost(msg, "bds-overlay-host");
    const host2 = getOrCreateHost(msg, "bds-overlay-host");
    expect(host1).toBe(host2);
    expect(getOrCreateWrapper(msg).childElementCount).toBe(1);
  });

  it("removing one feature host preserves sibling and unknown hosts", () => {
    const hostA = getOrCreateHost(msg, "bds-overlay-host");
    const hostB = getOrCreateHost(msg, "bds-file-host");
    const unknown = document.createElement("div");
    unknown.className = "some-other-thing";
    getOrCreateWrapper(msg).appendChild(unknown);

    removeMessageHost(msg, "bds-overlay-host");
    expect(document.contains(hostA)).toBe(false);
    expect(document.contains(hostB)).toBe(true);
    expect(document.contains(unknown)).toBe(true);
  });

  it("removing last child removes wrapper and clears ownership", () => {
    const host = getOrCreateHost(msg, "bds-overlay-host");
    const wrapper = getOrCreateWrapper(msg);

    removeMessageHost(msg, "bds-overlay-host");
    expect(document.contains(wrapper)).toBe(false);

    // New call creates a fresh wrapper
    const fresh = getOrCreateWrapper(msg);
    expect(fresh).not.toBe(wrapper);
  });

  it("pre-existing adjacent wrapper is rediscovered", () => {
    const existing = document.createElement("div");
    existing.className = "bds-host-wrapper";
    msg.insertAdjacentElement("afterend", existing);

    const wrapper = getOrCreateWrapper(msg);
    expect(wrapper).toBe(existing);
  });

  it("full disposal removes wrapper and all feature hosts", () => {
    getOrCreateHost(msg, "bds-overlay-host");
    getOrCreateHost(msg, "bds-file-host");
    const wrapper = getOrCreateWrapper(msg);

    removeAllMessageHosts(msg);

    expect(document.contains(wrapper)).toBe(false);
    // New call creates a fresh wrapper
    const fresh = getOrCreateWrapper(msg);
    expect(fresh).not.toBe(wrapper);
  });

  it("ownership remains correct after message reparenting", () => {
    const host = getOrCreateHost(msg, "bds-overlay-host");
    const wrapper = getOrCreateWrapper(msg);

    // Move message to a new parent
    const newParent = document.createElement("div");
    newParent.id = "new-area";
    document.body.appendChild(newParent);
    newParent.appendChild(msg);

    // Wrapper should be rediscovered (still next to msg in new parent)
    const refound = getOrCreateWrapper(msg);
    expect(refound).toBe(wrapper);
  });

  it("wrapper creation for different messages is independent", () => {
    const msg2 = document.createElement("div");
    msg2.className = "ds-message _63c77b1";
    document.body.appendChild(msg2);

    const w1 = getOrCreateWrapper(msg);
    const w2 = getOrCreateWrapper(msg2);

    expect(w1).not.toBe(w2);
    expect(msg.nextElementSibling).toBe(w1);
    expect(msg2.nextElementSibling).toBe(w2);
  });
});

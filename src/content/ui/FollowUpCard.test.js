// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, unmount, tick } from "svelte";

const sendMock = vi.fn();

vi.mock("../auto.js", () => ({
  injectPureTextAndSend: (...args) => sendMock(...args),
}));

import FollowUpCard from "./FollowUpCard.svelte";

let component = null;

beforeEach(() => {
  document.body.innerHTML = "";
  sendMock.mockReset();
});

afterEach(() => {
  if (component) {
    unmount(component);
    component = null;
  }
});

describe("FollowUpCard", () => {
  it("renders the label and default accept button, then sends query on click", async () => {
    sendMock.mockResolvedValueOnce(true);

    component = mount(FollowUpCard, {
      target: document.body,
      props: {
        label: "Want a Colab script?",
        query: "Create a Colab script for dataset preparation.",
      },
    });
    await tick();

    const labelEl = document.querySelector(".bds-followup-label");
    const btn = document.querySelector(".bds-followup-btn");
    expect(labelEl?.textContent).toBe("Want a Colab script?");
    expect(btn?.textContent?.trim()).toBe("Yes");
    expect(btn?.getAttribute("title")).toBe("Create a Colab script for dataset preparation.");

    btn.click();
    await tick();
    await Promise.resolve();
    await tick();

    expect(sendMock).toHaveBeenCalledWith(
      "Create a Colab script for dataset preparation.",
      "Follow-up",
    );
    expect(btn.disabled).toBe(true);
    expect(btn.textContent?.trim()).toBe("Sent");
  });

  it("uses custom button text and stays clickable if sending fails", async () => {
    sendMock.mockResolvedValueOnce(false);

    component = mount(FollowUpCard, {
      target: document.body,
      props: {
        label: "Explore WebSocket frames?",
        query: "Explain the WebSocket frame format.",
        button: "Show details",
      },
    });
    await tick();

    const btn = document.querySelector(".bds-followup-btn");
    expect(btn?.textContent?.trim()).toBe("Show details");

    btn.click();
    await tick();
    await Promise.resolve();
    await tick();

    expect(btn.disabled).toBe(false);
    expect(btn.textContent?.trim()).toBe("Show details");
  });
});

// @vitest-environment jsdom

/**
 * End-to-end check of the Find Skill dialog: search, click a result, and have
 * the downloaded SKILL.md land in the local skill set without duplicates.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, unmount, tick } from "svelte";
import appState from "../state.js";
import FindSkillModal from "./FindSkillModal.svelte";

const SKILL = {
  id: "vercel-labs/agent-skills/vercel-react-best-practices",
  source: "vercel-labs/agent-skills",
  skillId: "vercel-react-best-practices",
  name: "vercel-react-best-practices",
  installs: 868432,
};

const SKILL_MD = "---\nname: vercel-react-best-practices\n---\nUse this skill.";

function reply(payload) {
  return { ok: true, status: 200, html: JSON.stringify(payload) };
}

let component = null;

beforeEach(() => {
  document.body.innerHTML = "";
  appState.skills = [];
  vi.mocked(chrome.runtime.sendMessage).mockReset();
});

afterEach(() => {
  if (component) {
    unmount(component);
    component = null;
  }
});

async function searchFor(query) {
  const input = document.querySelector(".bds-fs-input");
  input.value = query;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await tick();
  document
    .querySelector(".bds-fs-search")
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await tick();
  await vi.waitFor(() => {
    expect(document.querySelectorAll(".bds-fs-result").length).toBeGreaterThan(0);
  });
}

describe("FindSkillModal", () => {
  it("searches skills.sh and saves the downloaded SKILL.md as a local skill", async () => {
    const sendMessage = vi
      .mocked(chrome.runtime.sendMessage)
      .mockResolvedValueOnce(reply({ skills: [SKILL] }))
      .mockResolvedValueOnce(reply({ files: [{ path: "SKILL.md", contents: SKILL_MD }] }));
    const onsaved = vi.fn();

    component = mount(FindSkillModal, {
      target: document.body,
      props: { onsaved },
    });
    await tick();

    await searchFor("react");

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://skills.sh/api/search?q=react" }),
    );

    document.querySelector(".bds-fs-result").click();
    await vi.waitFor(() => expect(appState.skills).toHaveLength(1));

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://skills.sh/api/download/vercel-labs/agent-skills/vercel-react-best-practices",
      }),
    );
    expect(appState.skills[0]).toMatchObject({
      name: SKILL.name,
      usage: SKILL.source,
      content: SKILL_MD,
      active: true,
      sourceId: SKILL.id,
    });
    expect(onsaved).toHaveBeenCalled();
    expect(document.querySelector(".bds-fs-notice")?.textContent).toContain(SKILL.name);
  });

  it("never overwrites a user-authored skill that happens to share the name", async () => {
    appState.skills = [
      {
        id: "local-1",
        name: SKILL.name,
        usage: "mine",
        content: "MY OWN INSTRUCTIONS",
        active: true,
      },
    ];
    const sendMessage = vi
      .mocked(chrome.runtime.sendMessage)
      .mockResolvedValueOnce(reply({ skills: [SKILL] }))
      .mockResolvedValueOnce(reply({ files: [{ path: "SKILL.md", contents: SKILL_MD }] }));

    component = mount(FindSkillModal, { target: document.body });
    await tick();
    await searchFor("react");
    document.querySelector(".bds-fs-result").click();
    await vi.waitFor(() => expect(appState.skills).toHaveLength(2));

    expect(appState.skills[0].content).toBe("MY OWN INSTRUCTIONS");
    expect(appState.skills[0].sourceId).toBeUndefined();
    expect(appState.skills[1].content).toBe(SKILL_MD);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("rejects a one-character query without calling the network", async () => {
    const sendMessage = vi.mocked(chrome.runtime.sendMessage);
    component = mount(FindSkillModal, { target: document.body });
    await tick();

    const input = document.querySelector(".bds-fs-input");
    input.value = "a";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    document
      .querySelector(".bds-fs-search")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await tick();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector(".bds-fs-error")).toBeTruthy();
    expect(document.querySelectorAll(".bds-fs-result")).toHaveLength(0);
  });
});

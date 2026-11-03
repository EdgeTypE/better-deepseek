/**
 * `<BDS:GET>module</BDS:GET>` — on-demand prompt module loader.
 *
 * The model asks for a reference it does not carry in the main system prompt.
 * We reply with a hidden user message holding that reference, so the next
 * request continues the original task with the documentation in context.
 */

import { devLog } from "../lib/dev-log.js";
import {
  PROMPT_MODULE_IDS,
  resolvePromptModule,
} from "../lib/prompt-modules/index.js";
import { injectPureTextAndSend } from "./auto.js";

/**
 * Conversation-scoped state. A module is worth loading once per chat, and a
 * send that keeps failing must not be retried on every DOM scan — the message
 * scan runs many times per second while a reply settles.
 */
const requests = new Map();
const MAX_SEND_ATTEMPTS = 3;

/** For test teardown */
export function _resetPromptModuleRequestsForTesting() {
  requests.clear();
}

function buildModuleMessage(module) {
  return [
    "<BetterDeepSeek>",
    `[BDS:PROMPT_MODULE] ${module.id}`,
    `The extension loaded the "${module.label}" reference you requested with <BDS:GET>${module.id}</BDS:GET>.`,
    "Continue the user's original task now, using this reference. Do not repeat, quote or summarise it.",
    "",
    module.content,
    "</BetterDeepSeek>",
  ].join("\n");
}

function buildUnknownModuleMessage(rawName) {
  return [
    "<BetterDeepSeek>",
    "[BDS:PROMPT_MODULE] unknown",
    `No prompt module named "${String(rawName || "").trim()}" exists.`,
    `Available modules: ${PROMPT_MODULE_IDS.join(", ")}.`,
    "Do not request it again. Answer the user with the tools you already know, or tell them the tool is unavailable.",
    "</BetterDeepSeek>",
  ].join("\n");
}

/**
 * @param {string} rawName - Tag body (or `name` attribute) written by the model.
 * @param {string} [conversationId] - Scopes the one-load-per-chat rule.
 */
export async function handlePromptModuleRequest(rawName, conversationId = "") {
  const module = resolvePromptModule(rawName);
  const key = `${conversationId}|${module ? module.id : String(rawName || "").trim().toLowerCase()}`;

  const entry = requests.get(key) || { attempts: 0, done: false, inFlight: false };
  if (entry.done || entry.inFlight || entry.attempts >= MAX_SEND_ATTEMPTS) return;

  entry.attempts += 1;
  entry.inFlight = true;
  requests.set(key, entry);

  devLog("PromptModule", `Loading ${module ? module.id : `unknown (${rawName})`}`);

  try {
    const sent = await injectPureTextAndSend(
      module ? buildModuleMessage(module) : buildUnknownModuleMessage(rawName),
      `Prompt module: ${module ? module.id : rawName}`,
    );
    if (sent !== false) entry.done = true;
  } catch (err) {
    console.error("[BDS:PromptModule] Failed to inject module:", err);
  } finally {
    entry.inFlight = false;
  }
}

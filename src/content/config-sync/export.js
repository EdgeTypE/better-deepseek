/**
 * "Export to chat" — stages a settings backup and sends the message that
 * carries it.
 *
 * The block never travels as visible text: it is staged in the injected
 * script and prepended to the next request body, so the composer stays short
 * and the model never authors a byte of the backup.
 */

import appState from "../state.js";
import { BRIDGE_EVENTS } from "../../lib/constants.js";
import {
  buildSyncPayload,
  encodeConfigBlock,
  measureSections,
} from "../../lib/config-sync.js";
import { t } from "../../lib/i18n.svelte.js";
import { devLog } from "../../lib/dev-log.js";
import { injectPureTextAndSend } from "../auto.js";
import { currentSyncSources } from "./apply.js";
import { rememberSentConfigBlock } from "./live.js";

/**
 * Stage (or, with an empty string, withdraw) the block for the next request.
 *
 * @param {string} block
 */
export function stageConfigSyncBlock(block) {
  window.dispatchEvent(
    new CustomEvent(BRIDGE_EVENTS.configSyncStage, {
      detail: JSON.stringify({ block: String(block || "") }),
    }),
  );
}

/**
 * Sections a chat transfer never carries.
 *
 * Project files are working data, not settings, and they are unbounded: a
 * single repo import can put megabytes of file content in storage, which turns
 * a "small settings backup" into a multi-megabyte chat message. The file
 * export still includes them.
 */
export const CHAT_SKIPPED_SECTIONS = ["projectFiles"];

/**
 * Hard ceiling for the encoded block. A chat message that large still fits the
 * context window, but it would be re-read by the model on the turn that
 * carries it for no benefit, and oversized requests are where things start
 * failing quietly.
 */
export const MAX_SYNC_BLOCK_CHARS = 120000;

/**
 * Build the backup, stage it, and send the message that carries it.
 *
 * Credentials are only included when a passphrase is set: an unencrypted blob
 * sits in the conversation as plaintext on someone else's server, and a shared
 * conversation link would expose every MCP key.
 *
 * @param {{ password?: string, includeSecrets?: boolean }} [options]
 * @returns {Promise<{
 *   ok: boolean,
 *   reason?: "too-large"|"send-failed",
 *   removedSecrets: number,
 *   bytes: number,
 *   breakdown?: Array<{ key: string, bytes: number }>,
 * }>}
 */
export async function exportSettingsToChat(options = {}) {
  const password = String(options.password || "");
  const includeSecrets = Boolean(options.includeSecrets) && Boolean(password);

  const { payload, removedSecrets } = buildSyncPayload(currentSyncSources(), {
    includeSecrets,
    skipSections: CHAT_SKIPPED_SECTIONS,
  });
  const block = await encodeConfigBlock(payload, { password });

  // Checked before staging: an oversized block must never reach the composer.
  if (block.length > MAX_SYNC_BLOCK_CHARS) {
    // Naming the largest sections is the only way the user can act on this:
    // an oversized backup is nearly always one runaway section.
    const breakdown = measureSections(payload).slice(0, 2);
    devLog(
      "ConfigSync",
      `backup too large: ${block.length} chars — ${breakdown
        .map((entry) => `${entry.key}=${entry.bytes}`)
        .join(", ")}`,
    );
    return {
      ok: false,
      reason: "too-large",
      removedSecrets,
      bytes: block.length,
      breakdown,
    };
  }

  stageConfigSyncBlock(block);
  const messageText = t("configSync.messageText");
  const sent = await injectPureTextAndSend(messageText, "Settings transfer");

  if (!sent) {
    // Nothing left the composer, so the block must not ride along with the
    // user's next message instead.
    stageConfigSyncBlock("");
    return { ok: false, reason: "send-failed", removedSecrets, bytes: block.length };
  }

  // The history cache is written on session load, so the card on this page is
  // mounted from this copy instead of waiting for a refresh.
  rememberSentConfigBlock(block, { visibleText: messageText });

  return { ok: true, removedSecrets, bytes: block.length };
}

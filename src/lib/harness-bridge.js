/**
 * Better-DeepSeek & DeepSeek Harness Bridge Client (v1.0 Plan).
 * 
 * Supports:
 * - MOD A: Full Automatic Mode with dedicated CORS-enabled /api/better-deepseek/* endpoints & Live SSE.
 * - MOD B: Lightweight Fallback Mode (Clipboard + Open Tab) when bridge plugin is not installed.
 */

export class BetterDeepSeekHarnessBridge {
  constructor(baseUrl = "http://127.0.0.1:3080") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.bdApi = `${this.baseUrl}/api/better-deepseek`;
    this.eventSource = null;
    this.listeners = new Set();
  }

  /**
   * Check whether Bridge Plugin is active (MOD A) or Fallback is needed (MOD B).
   * @param {number} timeoutMs 
   * @returns {Promise<'enhanced' | 'fallback'>}
   */
  async detectMode(timeoutMs = 3000) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(`${this.bdApi}/ping`, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        if (data && data.active) {
          return "enhanced";
        }
      }
    } catch {
      // CORS rejection or network timeout -> Fallback
    }
    return "fallback";
  }

  /**
   * Check plugin metadata & capabilities.
   */
  async checkPluginActive() {
    try {
      const res = await fetch(`${this.bdApi}/ping`);
      if (!res.ok) return { active: false };
      const data = await res.json();
      return {
        active: Boolean(data?.active),
        version: data?.version || "1.6.0",
        capabilities: data?.capabilities || ["filtered_sse", "approvals", "rag_inject", "session_result"],
      };
    } catch {
      return { active: false };
    }
  }

  /**
   * Connect to live SSE Event Stream (MOD A).
   * @param {(event: { type: string, timestamp: number, payload: any }) => void} onEventCallback 
   */
  connectEvents(onEventCallback) {
    if (this.eventSource) {
      this.eventSource.close();
    }

    try {
      this.eventSource = new EventSource(`${this.bdApi}/events`);

      this.eventSource.onmessage = (event) => {
        try {
          if (!event.data || event.data.trim() === ": connected") return;
          const data = JSON.parse(event.data);
          if (onEventCallback) {
            onEventCallback(data);
          }
          this.listeners.forEach((listener) => {
            try { listener(data); } catch (e) { console.error(e); }
          });
        } catch (err) {
          console.error("[Harness SSE] Parse Error:", err);
        }
      };

      this.eventSource.onerror = (err) => {
        console.warn("[Harness SSE] Stream connection interrupted / reconnecting...", err);
      };
    } catch (err) {
      console.warn("[Harness SSE] Failed to initialize EventSource:", err);
    }
  }

  /**
   * Add a listener to existing stream.
   */
  addListener(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 1. Create Session with Absolute CWD (MOD A).
   */
  async createSession(absoluteCwd) {
    const rpcId = `bd-create-${Date.now()}`;
    const res = await fetch(`${this.bdApi}/session.create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        type: "client-request",
        rpcId,
        method: "session.create",
        payload: { cwd: absoluteCwd },
      }),
    });

    const data = await res.json();
    if (!data.result?.ok || !data.result?.value?.sessionId) {
      throw new Error(data.result?.error?.message || "Failed to create session on Harness.");
    }
    return data.result.value.sessionId; // "session-..."
  }

  /**
   * 2. Send Prompt to Session (MOD A).
   */
  async sendPrompt(sessionId, promptText) {
    const rpcId = `bd-prompt-${Date.now()}`;
    const res = await fetch(`${this.bdApi}/session.prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        type: "client-request",
        rpcId,
        method: "session.prompt",
        payload: { sessionId, text: promptText },
      }),
    });
    return await res.json();
  }

  /**
   * 3. Fetch Session Result on Demand (REST API polling / refresh fallback).
   */
  async fetchSessionResult(sessionId) {
    try {
      const res = await fetch(`${this.bdApi}/session.result?sessionId=${encodeURIComponent(sessionId)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.result?.value || data.value || null;
    } catch {
      return null;
    }
  }

  /**
   * 4. Cancel / Stop Running Session.
   */
  async cancelSession(sessionId) {
    try {
      const rpcId = `bd-cancel-${Date.now()}`;
      const res = await fetch(`${this.bdApi}/session.cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          type: "client-request",
          rpcId,
          method: "session.cancel",
          payload: { sessionId },
        }),
      });
      const data = await res.json();
      return data.result?.ok ?? true;
    } catch (err) {
      console.warn("[Harness Bridge] Cancel request failed:", err);
      return false;
    }
  }

  /**
   * Close the SSE stream and clear listeners.
   */
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.listeners.clear();
  }
}

/**
 * MOD B: Lightweight Fallback Mode (Clipboard + Open Tab).
 * @param {string} promptText 
 * @param {string} [url] 
 */
export async function runFallbackMode(promptText, url = "http://127.0.0.1:3080") {
  // 1. Copy prompt to clipboard
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(promptText);
    } else {
      throw new Error("Clipboard API unavailable");
    }
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = promptText;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try { document.execCommand("copy"); } catch (e) { console.warn(e); }
    document.body.removeChild(textarea);
  }

  // 2. Open Harness Web UI in new tab
  try {
    window.open(url, "_blank");
  } catch (e) {
    console.warn("Failed to open tab:", e);
  }

  return {
    mode: "fallback",
    message: "Görev metni panoya kopyalandı! Harness sekmesinde yapıştırıp Enter'a basın.",
  };
}

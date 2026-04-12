(() => {
  "use strict";

  const EVENTS = {
    configUpdate: "bds:config-update",
    requestConfig: "bds:request-config",
    networkState: "bds:network-state"
  };

  const CHAT_COMPLETION_PATH = "/api/v0/chat/completion";

  const state = {
    config: {
      systemPrompt: "",
      skills: [],
      memories: []
    },
    initializedConversations: new Set(),
    activeCompletionRequests: 0
  };

  if (window.__bdsNetworkPatched) {
    return;
  }
  window.__bdsNetworkPatched = true;

  window.addEventListener(EVENTS.configUpdate, (event) => {
    const nextConfig = event && event.detail ? event.detail : {};
    state.config = normalizeConfig(nextConfig);
  });

  requestConfigFromContentScript();
  patchFetch();
  patchXmlHttpRequest();

  function requestConfigFromContentScript() {
    window.dispatchEvent(new CustomEvent(EVENTS.requestConfig));
  }

  function normalizeConfig(config) {
    const skills = Array.isArray(config.skills)
      ? config.skills
          .map((skill) => ({
            name: String(skill && skill.name ? skill.name : "skill"),
            content: String(skill && skill.content ? skill.content : "")
          }))
          .filter((skill) => skill.content.trim().length > 0)
      : [];

    const memories = Array.isArray(config.memories)
      ? config.memories
          .map((item) => ({
            key: sanitizeKey(item && item.key),
            value: String(item && item.value ? item.value : ""),
            importance: sanitizeImportance(item && item.importance)
          }))
          .filter((item) => item.key && item.value.trim().length > 0)
      : [];

    return {
      systemPrompt: String(config.systemPrompt || ""),
      skills,
      memories
    };
  }

  function sanitizeKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
  }

  function sanitizeImportance(value) {
    return String(value || "called").toLowerCase() === "always" ? "always" : "called";
  }

  function isChatCompletionUrl(url) {
    return String(url || "").includes(CHAT_COMPLETION_PATH);
  }

  function emitNetworkState(status, url) {
    window.dispatchEvent(
      new CustomEvent(EVENTS.networkState, {
        detail: {
          status,
          url: String(url || ""),
          activeCompletionRequests: state.activeCompletionRequests,
          timestamp: Date.now()
        }
      })
    );
  }

  function markCompletionRequestStart(url) {
    state.activeCompletionRequests += 1;
    emitNetworkState("start", url);
  }

  function markCompletionRequestEnd(url) {
    state.activeCompletionRequests = Math.max(0, state.activeCompletionRequests - 1);
    emitNetworkState("end", url);
  }

  function patchFetch() {
    const originalFetch = window.fetch;

    window.fetch = async function patchedFetch(input, init) {
      try {
        const url = extractUrl(input);
        if (!isChatCompletionUrl(url)) {
          return originalFetch.apply(this, arguments);
        }

        markCompletionRequestStart(url);

        try {
          const requestInfo = await buildMutatedFetchRequest(input, init);
          if (!requestInfo) {
            return await originalFetch.apply(this, arguments);
          }

          return await originalFetch.call(this, requestInfo.input, requestInfo.init);
        } finally {
          markCompletionRequestEnd(url);
        }
      } catch (error) {
        console.warn("[BetterDeepSeek] Request patch failed:", error);
        return originalFetch.apply(this, arguments);
      }
    };
  }

  function patchXmlHttpRequest() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
      this.__bdsRequestMeta = {
        method: String(method || "GET").toUpperCase(),
        url: String(url || "")
      };
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function patchedSend(body) {
      try {
        const meta = this.__bdsRequestMeta || {};
        if (!isChatCompletionUrl(meta.url)) {
          return originalSend.call(this, body);
        }

        markCompletionRequestStart(meta.url);
        let requestFinalized = false;
        const finalizeRequest = () => {
          if (requestFinalized) {
            return;
          }
          requestFinalized = true;
          markCompletionRequestEnd(meta.url);
        };

        this.addEventListener("loadend", finalizeRequest, { once: true });

        const bodyText = getXhrBodyText(body);
        if (!bodyText) {
          return originalSend.call(this, body);
        }

        const payload = JSON.parse(bodyText);
        const mutation = mutatePayload(payload);
        if (!mutation.changed) {
          return originalSend.call(this, body);
        }

        const nextBody = JSON.stringify(mutation.payload);
        return originalSend.call(this, nextBody);
      } catch (error) {
        const meta = this.__bdsRequestMeta || {};
        console.warn("[BetterDeepSeek] XHR patch failed:", error);
        try {
          return originalSend.call(this, body);
        } catch (sendError) {
          if (isChatCompletionUrl(meta.url)) {
            markCompletionRequestEnd(meta.url);
          }
          throw sendError;
        }
      }
    };
  }

  function getXhrBodyText(body) {
    if (typeof body === "string") {
      return body;
    }

    if (body instanceof URLSearchParams) {
      return body.toString();
    }

    return "";
  }

  function extractUrl(input) {
    if (typeof input === "string") {
      return input;
    }
    if (input instanceof URL) {
      return input.toString();
    }
    if (input instanceof Request) {
      return input.url;
    }
    return "";
  }

  async function buildMutatedFetchRequest(input, init) {
    const bodyText = await extractBodyText(input, init);
    if (!bodyText) {
      return null;
    }

    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return null;
    }

    const mutation = mutatePayload(payload);
    if (!mutation.changed) {
      return null;
    }

    const nextBody = JSON.stringify(mutation.payload);
    const sourceHeaders = init && init.headers ? init.headers : input instanceof Request ? input.headers : undefined;
    const headers = new Headers(sourceHeaders || {});
    headers.set("content-type", "application/json");

    const nextInit = {
      method: (init && init.method) || (input instanceof Request ? input.method : "POST"),
      headers,
      body: nextBody,
      credentials: (init && init.credentials) || (input instanceof Request ? input.credentials : undefined),
      cache: (init && init.cache) || (input instanceof Request ? input.cache : undefined),
      mode: (init && init.mode) || (input instanceof Request ? input.mode : undefined),
      redirect: (init && init.redirect) || (input instanceof Request ? input.redirect : undefined),
      referrer: (init && init.referrer) || (input instanceof Request ? input.referrer : undefined),
      referrerPolicy: (init && init.referrerPolicy) || (input instanceof Request ? input.referrerPolicy : undefined),
      keepalive: (init && init.keepalive) || (input instanceof Request ? input.keepalive : undefined),
      integrity: (init && init.integrity) || (input instanceof Request ? input.integrity : undefined),
      signal: (init && init.signal) || (input instanceof Request ? input.signal : undefined)
    };

    const nextInput = typeof input === "string" || input instanceof URL ? input : input.url;
    return { input: nextInput, init: nextInit };
  }

  async function extractBodyText(input, init) {
    if (init && typeof init.body === "string") {
      return init.body;
    }

    if (init && init.body instanceof URLSearchParams) {
      return init.body.toString();
    }

    if (input instanceof Request) {
      const cloned = input.clone();
      return cloned.text();
    }

    return "";
  }

  function mutatePayload(payload) {
    const messages = resolveMessageArray(payload);
    const conversationId = resolveConversationId(payload);

    let changed = false;
    let target = null;

    if (messages && messages.length > 0) {
      target = findLastUserMessage(messages) || messages[messages.length - 1];
      const currentText = extractMessageText(target);
      if (currentText) {
        const cleanText = stripInjectedBlocks(currentText);
        const prefix = buildHiddenPrefix(cleanText, conversationId);
        if (prefix) {
          setMessageText(target, `${prefix}\n\n${cleanText}`);
          changed = true;
        } else if (cleanText !== currentText) {
          setMessageText(target, cleanText);
          changed = true;
        }
      }
    } else if (typeof payload.prompt === "string") {
      const cleanText = stripInjectedBlocks(payload.prompt);
      const prefix = buildHiddenPrefix(cleanText, conversationId);
      if (prefix) {
        payload.prompt = `${prefix}\n\n${cleanText}`;
        changed = true;
      } else if (cleanText !== payload.prompt) {
        payload.prompt = cleanText;
        changed = true;
      }
    }

    return { changed, payload };
  }

  function resolveMessageArray(payload) {
    if (Array.isArray(payload.messages)) {
      return payload.messages;
    }

    if (payload.data && Array.isArray(payload.data.messages)) {
      return payload.data.messages;
    }

    if (payload.chat && Array.isArray(payload.chat.messages)) {
      return payload.chat.messages;
    }

    return null;
  }

  function resolveConversationId(payload) {
    return String(
      payload.conversation_id ||
        payload.conversationId ||
        payload.chat_session_id ||
        payload.chat_id ||
        payload.id ||
        "default"
    );
  }

  function findLastUserMessage(messages) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const item = messages[index];
      if (!item || typeof item !== "object") {
        continue;
      }

      const role = String(item.role || item.author || "").toLowerCase();
      if (role === "user" || role === "human") {
        return item;
      }
    }

    return null;
  }

  function extractMessageText(message) {
    if (!message) {
      return "";
    }

    if (typeof message.content === "string") {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      return message.content
        .map((part) => {
          if (typeof part === "string") {
            return part;
          }
          if (part && typeof part.text === "string") {
            return part.text;
          }
          return "";
        })
        .join("\n");
    }

    if (typeof message.prompt === "string") {
      return message.prompt;
    }

    return "";
  }

  function setMessageText(message, text) {
    if (!message) {
      return;
    }

    if (typeof message.content === "string" || message.content == null) {
      message.content = text;
      return;
    }

    if (Array.isArray(message.content)) {
      message.content = [{ type: "text", text }];
      return;
    }

    if (typeof message.prompt === "string") {
      message.prompt = text;
      return;
    }

    message.content = text;
  }

  function buildHiddenPrefix(userPrompt, conversationId) {
    const blocks = [];

    if (!state.initializedConversations.has(conversationId) && state.config.systemPrompt.trim()) {
      blocks.push(`<BetterDeepSeek>\n${state.config.systemPrompt.trim()}\n</BetterDeepSeek>`);
      state.initializedConversations.add(conversationId);
    }

    const skillsBlock = buildSkillsBlock();
    if (skillsBlock) {
      blocks.push(skillsBlock);
    }

    const memoryBlock = buildMemoryCallsBlock(userPrompt);
    if (memoryBlock) {
      blocks.push(memoryBlock);
    }

    return blocks.join("\n\n");
  }

  function buildSkillsBlock() {
    if (!state.config.skills.length) {
      return "";
    }

    const skillsText = state.config.skills
      .map((skill) => `## ${skill.name}\n${skill.content.trim()}`)
      .join("\n\n");

    return `<BDS:SKILLS>\n${skillsText}\n</BDS:SKILLS>`;
  }

  function buildMemoryCallsBlock(userPrompt) {
    if (!state.config.memories.length) {
      return "";
    }

    const lowerPrompt = String(userPrompt || "").toLowerCase();
    const selected = [];

    for (const item of state.config.memories) {
      if (item.importance === "always") {
        selected.push(item);
        continue;
      }

      if (item.key && lowerPrompt.includes(item.key.toLowerCase())) {
        selected.push(item);
      }
    }

    if (!selected.length) {
      return "";
    }

    const text = selected.map((item) => `${item.key}: ${item.value}`).join(". ");
    return `<BDS:memory_calls>${text}</BDS:memory_calls>`;
  }

  function stripInjectedBlocks(text) {
    let output = String(text || "");
    output = output.replace(/<BetterDeepSeek>[\s\S]*?<\/BetterDeepSeek>/gi, "");
    output = output.replace(/<BDS:SKILLS>[\s\S]*?<\/BDS:SKILLS>/gi, "");
    output = output.replace(/<BDS:memory_calls>[\s\S]*?<\/BDS:memory_calls>/gi, "");
    return output.trim();
  }
})();

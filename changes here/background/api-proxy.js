const DEEPSEEK_BASE = "https://api.deepseek.com";
const BETA_BASE = "https://api.deepseek.com/beta";

export async function proxyApiRequest(request) {
  const { endpoint, apiKey, signal } = request;
  if (!apiKey) throw new Error("API key is required.");

  const isBeta = endpoint === "completions";
  const baseUrl = isBeta ? BETA_BASE : DEEPSEEK_BASE;
  let url, fetchOptions;

  if (endpoint === "chat/completions") {
    url = `${baseUrl}/chat/completions`;
    fetchOptions = buildChatCompletionsRequest(request);
  } else if (endpoint === "completions") {
    url = `${baseUrl}/completions`;
    fetchOptions = buildCompletionsRequest(request);
  } else if (endpoint === "models") {
    url = `${baseUrl}/models`;
    fetchOptions = { method: "GET", headers: {} };
  } else if (endpoint === "user/balance") {
    url = `${baseUrl}/user/balance`;
    fetchOptions = { method: "GET", headers: {} };
  } else {
    throw new Error(`Unknown endpoint: ${endpoint}`);
  }

  const headers = {
    ...fetchOptions.headers,
    Authorization: `Bearer ${apiKey}`,
    Accept: request.stream
      ? "text/event-stream"
      : "application/json",
  };

  if (!request.stream) {
    headers["Content-Type"] = "application/json";
  }

  const fetchOpts = {
    method: fetchOptions.method || "POST",
    headers,
    ...(fetchOptions.body ? { body: fetchOptions.body } : {}),
  };

  if (signal) {
    const controller = new AbortController();
    fetchOpts.signal = controller.signal;
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  if (request.stream) {
    return streamResponse(url, fetchOpts);
  }

  const startTime = performance.now();
  const resp = await fetch(url, fetchOpts);
  const latency = performance.now() - startTime;

  if (!resp.ok) {
    let errorBody;
    try { errorBody = await resp.json(); } catch { errorBody = await resp.text(); }
    throw new ApiError(resp.status, errorBody);
  }

  const data = await resp.json();
  return { ok: true, data, latency, streamed: false };
}

async function streamResponse(url, fetchOpts) {
  const startTime = performance.now();
  const resp = await fetch(url, fetchOpts);

  if (!resp.ok) {
    let errorBody;
    try { errorBody = await resp.json(); } catch { errorBody = await resp.text(); }
    throw new ApiError(resp.status, errorBody);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error("Response body is not readable");

  const decoder = new TextDecoder();
  const chunks = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const jsonStr = trimmed.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          chunks.push(JSON.parse(jsonStr));
        } catch {}
      }
    }
    if (done) break;
  }

  const latency = performance.now() - startTime;
  return { ok: true, data: chunks, latency, streamed: true };
}

class ApiError extends Error {
  constructor(status, body) {
    const message = body?.error?.message || body?.error || JSON.stringify(body) || `HTTP ${status}`;
    super(message);
    this.status = status;
    this.body = body;
  }
}

function buildChatCompletionsRequest(req) {
  const body = {
    model: req.model,
    messages: req.messages || [],
  };

  if (req.maxTokens != null) body.max_tokens = req.maxTokens;
  if (req.temperature != null) body.temperature = req.temperature;
  if (req.topP != null) body.top_p = req.topP;
  if (req.stop?.length) body.stop = req.stop;
  if (req.stream) {
    body.stream = true;
    if (req.streamOptions?.includeUsage) {
      body.stream_options = { include_usage: true };
    }
  }
  if (req.thinking?.type === 'enabled') {
    body.thinking = req.thinking;
    if (req.reasoningEffort) body.reasoning_effort = req.reasoningEffort;
  }
  if (req.responseFormat?.type === "json_object") {
    body.response_format = { type: "json_object" };
  }
  if (req.tools?.length) {
    body.tools = req.tools;
    body.tool_choice = req.toolChoice || "auto";
  }
  if (req.logprobs) body.logprobs = true;
  if (req.topLogprobs > 0) body.top_logprobs = req.topLogprobs;
  if (req.userId) body.user_id = req.userId;
  if (req.messages?.length) {
    const last = req.messages[req.messages.length - 1];
    if (last.role === "assistant") {
      req.messages[req.messages.length - 1] = { ...last, prefix: true };
    }
  }

  return { method: "POST", headers: {}, body: JSON.stringify(body) };
}

function buildCompletionsRequest(req) {
  const body = {
    model: req.model,
    prompt: req.prompt || "",
  };

  if (req.suffix) body.suffix = req.suffix;
  if (req.maxTokens != null) body.max_tokens = req.maxTokens;
  if (req.temperature != null) body.temperature = req.temperature;
  if (req.topP != null) body.top_p = req.topP;
  if (req.stop?.length) body.stop = req.stop;
  if (req.stream) {
    body.stream = true;
    if (req.streamOptions?.includeUsage) {
      body.stream_options = { include_usage: true };
    }
  }
  if (req.logprobs > 0) body.logprobs = req.logprobs;
  if (req.echo) body.echo = true;

  return { method: "POST", headers: {}, body: JSON.stringify(body) };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "bds-api-proxy") {
    proxyApiRequest(message.request)
      .then((result) => sendResponse(result))
      .catch((err) => {
        sendResponse({
          ok: false,
          error: err.message,
          status: err.status || 0,
        });
      });
    return true;
  }

  if (message.type === "bds-api-proxy-abort") {
    return false;
  }

  return false;
});

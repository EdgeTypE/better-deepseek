export function parseSSEStream(text) {
  const chunks = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) continue;
    const jsonStr = trimmed.slice(6).trim();
    if (jsonStr === "[DONE]") continue;
    try {
      chunks.push(JSON.parse(jsonStr));
    } catch {
      /* skip malformed */
    }
  }
  return chunks;
}

export function mergeStreamChunks(chunks) {
  let content = "";
  let reasoningContent = "";
  let lastUsage = null;
  let lastModel = "";
  let lastId = "";
  let finishReason = null;

  for (const chunk of chunks) {
    if (chunk.id) lastId = chunk.id;
    if (chunk.model) lastModel = chunk.model;
    if (chunk.usage) lastUsage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    if (choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta;
    if (!delta) continue;
    if (delta.content) content += delta.content;
    if (delta.reasoning_content) reasoningContent += delta.reasoning_content;
  }

  return { content, reasoningContent, usage: lastUsage, model: lastModel, id: lastId, finishReason };
}

export function estimateTokens(text, charsPerToken = 3.5) {
  if (!text) return 0;
  return Math.max(1, Math.round(String(text).length / charsPerToken));
}

const PRICING = {
  "deepseek-v4-flash": { input: 0.22, cacheHit: 0.007, output: 0.66 },
  "deepseek-v4-pro": { input: 0.66, cacheHit: 0.022, output: 1.98 },
};

export function calculateCost(usage, model) {
  if (!usage || !model) return { inputCost: 0, outputCost: 0, totalCost: 0, cacheSavings: 0 };
  
  const pricing = PRICING[model] || PRICING["deepseek-v4-flash"];
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const cacheHit = usage.prompt_cache_hit_tokens || 0;
  const cacheMiss = usage.prompt_cache_miss_tokens || promptTokens;
  const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens || 0;

  const cacheHitCost = (cacheHit / 1_000_000) * pricing.cacheHit;
  const cacheMissCost = ((cacheMiss - cacheHit) / 1_000_000) * pricing.input;
  const inputCost = Math.max(0, cacheHitCost) + Math.max(0, cacheMissCost);
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  const fullInputCost = (promptTokens / 1_000_000) * pricing.input;
  const cacheSavings = fullInputCost - inputCost;

  return {
    inputCost: roundCost(inputCost),
    outputCost: roundCost(outputCost),
    totalCost: roundCost(inputCost + outputCost),
    cacheSavings: roundCost(cacheSavings),
    reasoningTokens,
  };
}

function roundCost(value) {
  if (value <= 0) return 0;
  if (value < 1e-6) return 0;
  if (value < 1e-4) return Number(value.toFixed(6));
  if (value < 0.01) return Number(value.toFixed(4));
  return Number(value.toFixed(4));
}

export function formatCost(value) {
  if (value <= 0) return "$0.00";
  if (value < 0.0001) return "< $0.0001";
  return "$" + value.toFixed(4);
}

export function formatTokenCount(n) {
  if (!n || n <= 0) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export function buildCurlCommand(request, apiKey) {
  const baseUrl = request.baseUrl || "https://api.deepseek.com";
  let url = baseUrl;
  let body = {};

  if (request.endpoint === "chat/completions") {
    url += "/chat/completions";
    body = {
      model: request.model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      top_p: request.topP,
      stream: request.stream,
    };
    if (request.thinking?.type) body.thinking = request.thinking;
    if (request.reasoningEffort) body.reasoning_effort = request.reasoningEffort;
    if (request.responseFormat?.type === "json_object") body.response_format = request.responseFormat;
    if (request.stop?.length) body.stop = request.stop;
    if (request.tools?.length) {
      body.tools = request.tools;
      body.tool_choice = request.toolChoice || "auto";
    }
    if (request.logprobs) body.logprobs = true;
    if (request.topLogprobs > 0) body.top_logprobs = request.topLogprobs;
    if (request.userId) body.user_id = request.userId;
    if (request.stream && request.streamOptions?.includeUsage) {
      body.stream_options = { include_usage: true };
    }
  } else if (request.endpoint === "completions") {
    url += "/beta/completions";
    body = {
      model: request.model,
      prompt: request.prompt,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      top_p: request.topP,
      stream: request.stream,
    };
    if (request.suffix) body.suffix = request.suffix;
    if (request.stop?.length) body.stop = request.stop;
    if (request.logprobs > 0) body.logprobs = request.logprobs;
    if (request.stream && request.streamOptions?.includeUsage) {
      body.stream_options = { include_usage: true };
    }
  } else if (request.endpoint === "models") {
    url += "/models";
    const headers = apiKey ? `-H "Authorization: Bearer ${apiKey}"` : "";
    return `curl ${url} \\\n  ${headers}`;
  } else if (request.endpoint === "user/balance") {
    url += "/user/balance";
    const headers = apiKey ? `-H "Authorization: Bearer ${apiKey}"` : "";
    return `curl ${url} \\\n  ${headers}`;
  }

  const headers = apiKey ? `-H "Authorization: Bearer ${apiKey}"` : "";
  return `curl ${url} \\\n  ${headers} \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(body, null, 2)}'`;
}

export async function copyCode(request, apiKey, language) {
  const baseUrl = request.baseUrl || "https://api.deepseek.com";

  if (language === "curl") return buildCurlCommand(request, apiKey);

  if (language === "python") {
    return [
      "from openai import OpenAI",
      "",
      "client = OpenAI(",
      `    api_key="${apiKey || '<YOUR_API_KEY>'}",`,
      `    base_url="${baseUrl}"`,
      ")",
      "",
      "# " + (request.endpoint === "chat/completions" ? "Chat Completion" :
              request.endpoint === "completions" ? "FIM Completion" :
              request.endpoint === "models" ? "List Models" : "Get Balance"),
      ...(request.endpoint === "chat/completions" ? buildPythonChatCode(request) :
          request.endpoint === "completions" ? buildPythonFimCode(request) :
          request.endpoint === "models" ? buildPythonModelsCode() :
          buildPythonBalanceCode()),
    ].join("\n");
  }

  if (language === "nodejs") {
    return [
      "import OpenAI from 'openai';",
      "",
      "const openai = new OpenAI({",
      `    apiKey: "${apiKey || '<YOUR_API_KEY>'}",`,
      `    baseURL: "${baseUrl}",`,
      "});",
      "",
      "async function main() {",
      ...(request.endpoint === "chat/completions" ? buildNodeChatCode(request) :
          request.endpoint === "completions" ? buildNodeFimCode(request) :
          request.endpoint === "models" ? buildNodeModelsCode() :
          buildNodeBalanceCode()),
      "}",
      "",
      "main();",
    ].join("\n");
  }

  return "";
}

function buildPythonChatCode(req) {
  const lines = [];
  lines.push(`response = client.chat.completions.create(`);
  lines.push(`    model="${req.model}",`);
  lines.push(`    messages=[`);
  for (const msg of req.messages || []) {
    const n = msg.name ? `, "name": "${msg.name}"` : "";
    const pf = msg.prefix ? `, "prefix": true` : "";
    lines.push(`        ${JSON.stringify({ role: msg.role, content: msg.content })}${n}${pf},`);
  }
  lines.push(`    ],`);
  if (req.maxTokens) lines.push(`    max_tokens=${req.maxTokens},`);
  if (req.temperature !== undefined) lines.push(`    temperature=${req.temperature},`);
  if (req.topP !== undefined) lines.push(`    top_p=${req.topP},`);
  if (req.stream) lines.push(`    stream=True,`);
  if (req.thinking?.type === "enabled") lines.push(`    reasoning_effort="${req.reasoningEffort || 'high'}",`);
  if (req.responseFormat?.type === "json_object") lines.push(`    response_format={"type": "json_object"},`);
  if (req.tools?.length) {
    lines.push(`    tools=${JSON.stringify(req.tools, null, 4).split("\n").map((l, i) => i === 0 ? l : `    ${l}`).join("\n")},`);
    lines.push(`    tool_choice="${req.toolChoice || 'auto'}",`);
  }
  if (req.logprobs) lines.push(`    logprobs=True,`);
  if (req.topLogprobs) lines.push(`    top_logprobs=${req.topLogprobs},`);
  if (req.thinking?.type === "enabled") {
    lines.push(`    extra_body={"thinking": {"type": "enabled"}},`);
  }
  lines.push(`)`);
  lines.push(`print(response.choices[0].message.content)`);
  return lines;
}

function buildPythonFimCode(req) {
  const lines = [];
  lines.push(`response = client.completions.create(`);
  lines.push(`    model="${req.model}",`);
  lines.push(`    prompt="${(req.prompt || '').replace(/"/g, '\\"')}",`);
  if (req.suffix) lines.push(`    suffix="${req.suffix.replace(/"/g, '\\"')}",`);
  if (req.maxTokens) lines.push(`    max_tokens=${req.maxTokens},`);
  if (req.temperature !== undefined) lines.push(`    temperature=${req.temperature},`);
  if (req.topP !== undefined) lines.push(`    top_p=${req.topP},`);
  if (req.stream) lines.push(`    stream=True,`);
  lines.push(`)`);
  lines.push(`print(response.choices[0].text)`);
  return lines;
}

function buildPythonModelsCode() {
  return ["response = client.models.list()", "for model in response.data:", "    print(f\"{model.id} ({model.owned_by})\")"];
}

function buildPythonBalanceCode() {
  return ["import requests", "response = requests.get('https://api.deepseek.com/user/balance', headers={'Authorization': f'Bearer {client.api_key}'})", "print(response.json())"];
}

function buildNodeChatCode(req) {
  const lines = [];
  lines.push(`  const completion = await openai.chat.completions.create({`);
  lines.push(`    model: "${req.model}",`);
  lines.push(`    messages: ${JSON.stringify(req.messages || [], null, 6).split("\n").map((l, i) => i === 0 ? l : `    ${l}`).join("\n")},`);
  if (req.maxTokens) lines.push(`    max_tokens: ${req.maxTokens},`);
  if (req.temperature !== undefined) lines.push(`    temperature: ${req.temperature},`);
  if (req.topP !== undefined) lines.push(`    top_p: ${req.topP},`);
  if (req.stream) lines.push(`    stream: true,`);
  if (req.thinking?.type === "enabled") lines.push(`    reasoning_effort: "${req.reasoningEffort || 'high'}",`);
  if (req.responseFormat?.type === "json_object") lines.push(`    response_format: { type: "json_object" },`);
  if (req.logprobs) lines.push(`    logprobs: true,`);
  if (req.topLogprobs) lines.push(`    top_logprobs: ${req.topLogprobs},`);
  lines.push(`  });`);
  lines.push(`  console.log(completion.choices[0].message.content);`);
  return lines;
}

function buildNodeFimCode(req) {
  const lines = [];
  lines.push(`  const completion = await openai.completions.create({`);
  lines.push(`    model: "${req.model}",`);
  lines.push(`    prompt: \`${(req.prompt || '').replace(/`/g, '\\`')}\`,`);
  if (req.suffix) lines.push(`    suffix: \`${req.suffix.replace(/`/g, '\\`')}\`,`);
  if (req.maxTokens) lines.push(`    max_tokens: ${req.maxTokens},`);
  if (req.temperature !== undefined) lines.push(`    temperature: ${req.temperature},`);
  lines.push(`  });`);
  lines.push(`  console.log(completion.choices[0].text);`);
  return lines;
}

function buildNodeModelsCode() {
  return ["  const list = await openai.models.list();", "  console.log(list.data);"];
}

function buildNodeBalanceCode() {
  return ["  console.log('Use GET https://api.deepseek.com/user/balance with Authorization header');"];
}

/**
 * Ensure a snippet is a complete HTML document.
 */
export function ensureHtmlDocument(content) {
  const trimmed = String(content || "").trim();
  if (/<html[\s>]/i.test(trimmed)) {
    return trimmed;
  }

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body {
        margin: 0;
        padding: 12px;
        font-family: "Segoe UI", sans-serif;
        background: #ffffff;
      }
    </style>
  </head>
  <body>${trimmed}</body>
</html>`;
}

/**
 * Build the full HTML document for the in-browser Python runner (Pyodide).
 */
export function buildPythonRunnerDocument(sourceCode) {
  const encodedCode = encodeURIComponent(sourceCode);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: #0f172a;
        color: #f8fafc;
      }
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        background: #1e293b;
        border-bottom: 1px solid #334155;
      }
      button {
        border: 0;
        padding: 6px 16px;
        border-radius: 6px;
        cursor: pointer;
        background: #10b981;
        color: #ffffff;
        font-weight: 600;
        font-size: 12px;
        transition: opacity 0.2s;
      }
      button:hover {
        opacity: 0.9;
      }
      textarea {
        width: 100%;
        min-height: 180px;
        border: 0;
        outline: 0;
        resize: vertical;
        box-sizing: border-box;
        padding: 12px;
        background: #1e293b;
        color: #f1f5f9;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 13px;
        line-height: 1.5;
      }
      pre {
        margin: 0;
        padding: 12px;
        min-height: 120px;
        white-space: pre-wrap;
        background: #020617;
        color: #34d399;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 13px;
        line-height: 1.5;
        border-top: 1px solid #1e293b;
      }
      .status {
        font-size: 11px;
        font-weight: 600;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    </style>
    <script src="https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.js"><\/script>
  </head>
  <body>
    <div class="toolbar">
      <button id="run-btn" type="button">Run Python</button>
      <span class="status" id="status">Loading runtime...</span>
    </div>
    <textarea id="editor"></textarea>
    <pre id="output"></pre>

    <script>
      const editor = document.getElementById("editor");
      const output = document.getElementById("output");
      const status = document.getElementById("status");
      const runButton = document.getElementById("run-btn");
      editor.value = decodeURIComponent("${encodedCode}");

      let runtimePromise = null;

      async function getRuntime() {
        if (!runtimePromise) {
          runtimePromise = (async () => {
            status.textContent = "Loading Pyodide...";
            const runtime = await loadPyodide({
              indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.3/full/"
            });
            status.textContent = "Runtime ready.";
            return runtime;
          })();
        }

        return runtimePromise;
      }

      async function runPythonCode() {
        output.textContent = "";
        status.textContent = "Running...";

        try {
          const runtime = await getRuntime();
          runtime.globals.set("bds_user_code", editor.value);
          const result = await runtime.runPythonAsync(
            "import io, sys, traceback\\n" +
            "_buffer = io.StringIO()\\n" +
            "_old_stdout = sys.stdout\\n" +
            "_old_stderr = sys.stderr\\n" +
            "sys.stdout = _buffer\\n" +
            "sys.stderr = _buffer\\n" +
            "try:\\n" +
            "    exec(bds_user_code, {})\\n" +
            "except Exception:\\n" +
            "    traceback.print_exc()\\n" +
            "finally:\\n" +
            "    sys.stdout = _old_stdout\\n" +
            "    sys.stderr = _old_stderr\\n" +
            "_buffer.getvalue()"
          );

          output.textContent = result || "(No output)";
          status.textContent = "Finished.";
        } catch (error) {
          output.textContent = String(error);
          status.textContent = "Error.";
        }
      }

      runButton.addEventListener("click", runPythonCode);
      getRuntime();
    <\/script>
  </body>
</html>`;
}

/**
 * Build the full HTML document for the in-browser JavaScript runner.
 * Provides a sandboxed environment with console.log capturing.
 */
export function buildJsRunnerDocument(sourceCode, language = "javascript") {
  const encodedCode = encodeURIComponent(sourceCode);
  const isTypeScript = language === "typescript" || language === "ts";

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: #0f172a;
        color: #f8fafc;
      }
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        background: #1e293b;
        border-bottom: 1px solid #334155;
      }
      button {
        border: 0;
        padding: 6px 16px;
        border-radius: 6px;
        cursor: pointer;
        background: #f59e0b;
        color: #ffffff;
        font-weight: 600;
        font-size: 12px;
        transition: opacity 0.2s;
      }
      button:hover {
        opacity: 0.9;
      }
      .status {
        font-size: 11px;
        font-weight: 600;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      textarea {
        width: 100%;
        min-height: 180px;
        border: 0;
        outline: 0;
        resize: vertical;
        box-sizing: border-box;
        padding: 12px;
        background: #1e293b;
        color: #f1f5f9;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 13px;
        line-height: 1.5;
      }
      pre {
        margin: 0;
        padding: 12px;
        min-height: 120px;
        white-space: pre-wrap;
        background: #020617;
        color: #34d399;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 13px;
        line-height: 1.5;
        border-top: 1px solid #1e293b;
      }
      }
      .status {
        font-size: 12px;
        color: #fcd34d;
      }
    </style>
    ${isTypeScript ? '<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.24.0/babel.min.js"></script>' : ''}
  </head>
  <body>
    <div class="toolbar">
      <button id="run-btn" type="button">Run ${isTypeScript ? 'TypeScript' : 'JavaScript'}</button>
      <span class="status" id="status">${isTypeScript ? 'TypeScript' : 'JavaScript'} Sandbox</span>
    </div>
    <textarea id="editor"></textarea>
    <pre id="output"></pre>

    <script>
      const editor = document.getElementById("editor");
      const output = document.getElementById("output");
      const status = document.getElementById("status");
      const runButton = document.getElementById("run-btn");
      editor.value = decodeURIComponent("${encodedCode}");

      function logToOutput(...args) {
        const text = args.map(arg => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2);
            } catch (e) {
              return String(arg);
            }
          }
          return String(arg);
        }).join(' ');
        output.textContent += text + "\\n";
      }

      async function runJsCode() {
        output.textContent = "";
        status.textContent = "Running...";

        let userCode = editor.value;

        ${isTypeScript ? `
        try {
          status.textContent = "Preparing transpiler...";
          
          // Wait for Babel to load if it hasn't yet
          let checks = 0;
          while (!window.Babel && checks < 50) {
            await new Promise(r => setTimeout(r, 100));
            checks++;
          }

          const transformer = window.Babel;
          if (!transformer) {
            throw new Error("TypeScript transpiler (Babel) failed to load. Please check your internet connection or try again in a few seconds.");
          }
          
          status.textContent = "Transpiling TypeScript...";
          const result = transformer.transform(userCode, {
            presets: ['typescript'],
            filename: 'script.ts'
          });
          userCode = result.code;
        } catch (err) {
          logToOutput("TRANSPILE ERROR:", err.message);
          status.textContent = "Transpile Error.";
          return;
        }
        ` : ''}

        // Override console
        const originalConsole = { ...console };
        console.log = (...args) => {
          originalConsole.log(...args);
          logToOutput(...args);
        };
        console.error = (...args) => {
          originalConsole.error(...args);
          logToOutput("ERROR:", ...args);
        };
        console.warn = (...args) => {
          originalConsole.warn(...args);
          logToOutput("WARN:", ...args);
        };

        try {
          const runner = new Function(userCode);
          const result = runner();
          
          if (result !== undefined) {
            logToOutput("Return value:", result);
          }
          
          status.textContent = "Finished.";
        } catch (error) {
          logToOutput("RUNTIME ERROR:", error.message);
          status.textContent = "Error.";
        } finally {
          Object.assign(console, originalConsole);
        }
      }

      runButton.addEventListener("click", runJsCode);
    <\/script>
  </body>
</html>`;
}

/**
 * Build a visualizer document with modern V-Kit CSS.
 * @param {string} content
 */
export function buildVisualizerDocument(content) {
  const trimmed = String(content || "").trim();
  
  const vKitCss = `
:root {
  --v-bg: #ffffff;
  --v-panel: #ffffff;
  --v-border: #e5e5e5;
  --v-border-strong: #d1d5db;
  --v-accent: #4d6bfe;
  --v-accent-glow: rgba(77, 107, 254, 0.1);
  --v-text: #0d0d0d;
  --v-text-secondary: #6b6b6b;
  --v-text-dim: #999999;
  --v-radius: 12px;
  --v-radius-sm: 8px;
  --v-shadow: 0 2px 12px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04);
}
body {
  margin: 0;
  padding: clamp(12px, 2vw, 28px);
  background: var(--v-bg);
  color: var(--v-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  overflow-x: hidden;
  line-height: 1.6;
}
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--v-border);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--v-border-strong);
}
.v-card {
  background: var(--v-panel);
  border: 1px solid var(--v-border);
  border-radius: var(--v-radius);
  padding: clamp(1rem, 2vw, 1.5rem);
  box-shadow: var(--v-shadow);
  animation: v-fade-in 0.25s ease-out;
}
.v-glass {
  background: transparent;
  border: 1px solid var(--v-border);
  border-radius: var(--v-radius-sm);
}
.v-title {
  font-size: 1.15rem;
  font-weight: 600;
  margin: 0 0 1rem 0;
  color: var(--v-text);
  border-bottom: 2px solid var(--v-border);
  padding-bottom: 6px;
  display: inline-block;
}
.v-control-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 1.5rem;
}
.v-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--v-text-secondary);
}
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  background: var(--v-border);
  border-radius: 3px;
  outline: none;
  cursor: pointer;
  margin: 8px 0;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--v-accent);
  border: 2px solid var(--v-panel);
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
  cursor: pointer;
  transition: transform 0.1s;
}
input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}
input[type="range"]::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--v-accent);
  border: 2px solid var(--v-panel);
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
  cursor: pointer;
}
input[type="text"],
input[type="number"],
select,
textarea {
  background: var(--v-bg);
  color: var(--v-text);
  border: 1px solid var(--v-border);
  border-radius: var(--v-radius-sm);
  padding: 8px 12px;
  font-size: 0.8125rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}
input[type="text"]:focus,
input[type="number"]:focus,
select:focus,
textarea:focus {
  border-color: var(--v-accent);
  box-shadow: 0 0 0 2px var(--v-accent-glow);
}
select {
  cursor: pointer;
}
textarea {
  resize: vertical;
  min-height: 60px;
}
.v-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.v-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.8125rem;
  color: var(--v-accent);
  font-weight: 700;
  background: var(--v-accent-glow);
  padding: 3px 10px;
  border-radius: var(--v-radius-sm);
}
button.v-btn {
  background: var(--v-accent);
  color: #ffffff;
  border: none;
  border-radius: var(--v-radius-sm);
  padding: 10px 18px;
  font-weight: 600;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
}
button.v-btn:hover {
  filter: brightness(0.9);
  transform: translateY(-1px);
}
button.v-btn:active {
  transform: translateY(0);
}
button.v-btn-outline {
  background: transparent;
  color: var(--v-accent);
  border: 1px solid var(--v-accent);
}
button.v-btn-outline:hover {
  background: var(--v-accent-glow);
}
.v-animate-float {
  animation: v-float 3s ease-in-out infinite;
}
@keyframes v-float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-5px); }
}
pre, code {
  font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 0.8125rem;
}
pre {
  background: var(--v-bg);
  border: 1px solid var(--v-border);
  border-radius: var(--v-radius-sm);
  padding: 12px 16px;
  overflow-x: auto;
  line-height: 1.5;
}
code {
  background: var(--v-accent-glow);
  color: var(--v-accent);
  padding: 1px 5px;
  border-radius: 4px;
}
pre code {
  background: none;
  color: inherit;
  padding: 0;
  border-radius: 0;
}
input[type="checkbox"] {
  accent-color: var(--v-accent);
  width: 16px;
  height: 16px;
  cursor: pointer;
}
canvas {
  width: 100%;
  border: 1px solid var(--v-border-strong);
  border-radius: var(--v-radius-sm);
  background: var(--v-panel);
}
@keyframes v-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
  `;

  const errorReportScript = `<script>
(function() {
  function sendError(msg, stack, lineno, colno) {
    try {
      window.parent.postMessage({
        type: "BDS_VISUALIZER_ERROR",
        message: String(msg || "Script error"),
        stack: stack ? String(stack) : null,
        lineno: lineno ?? null,
        colno: colno ?? null
      }, "*");
    } catch(e) {}
  }
  window.addEventListener("error", function(e) {
    sendError(e.message, e.error ? e.error.stack : null, e.lineno, e.colno);
  });
  window.addEventListener("unhandledrejection", function(e) {
    var reason = e.reason;
    var msg = reason ? (reason.message || String(reason)) : "Unhandled Promise Rejection";
    var stack = reason && reason.stack ? reason.stack : null;
    sendError(msg, stack);
  });
})();
</script>`;

  if (/<html[^>]*>/i.test(trimmed)) {
    let result = trimmed;
    if (/<head[^>]*>/i.test(result)) {
      result = result.replace(/<head[^>]*>/i, (match) => `${match}${errorReportScript}`);
      return result.replace(/<\/head>/i, `<style>${vKitCss}</style></head>`);
    } else {
      return result.replace(/<html[^>]*>/i, (match) => `${match}<head>${errorReportScript}<style>${vKitCss}</style></head>`);
    }
  }

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${errorReportScript}
    <style>${vKitCss}</style>
  </head>
  <body>${trimmed}</body>
</html>`;
}
/**
 * Build a headless runner document for off-thread execution.
 * Communicates with the parent via postMessage.
 */
export function buildHeadlessRunnerDocument(language = "javascript") {
  const isPython = language === "python" || language === "py";
  const isTypeScript = language === "typescript" || language === "ts";
  const isLua = language === "lua";
  const isRuby = language === "ruby";

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    ${isPython ? '<script src="https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.js"><\/script>' : ''}
    ${isTypeScript ? '<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.24.0/babel.min.js"></script>' : ''}
    ${isLua ? '<script src="https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.js"><\/script>' : ''}
    ${isRuby ? '<script src="https://cdn.opalrb.com/opal/1.8.2/opal.min.js"></script><script src="https://cdn.opalrb.com/opal/1.8.2/opal-parser.min.js"></script>' : ''}
  </head>
  <body>
    <script>
      let currentId = null;

      function sendToParent(type, data) {
        window.parent.postMessage({ type, data, id: currentId }, "*");
      }

      // Console override
      const originalConsole = { ...console };
      ['log', 'error', 'warn', 'info'].forEach(method => {
        console[method] = (...args) => {
          originalConsole[method](...args);
          sendToParent('CONSOLE_LOG', { method, args: args.map(arg => {
            if (arg === undefined) return "undefined";
            if (arg === null) return "null";
            try { return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg); }
            catch(e) { return String(arg); }
          })});
        };
      });

      window.addEventListener('message', async (event) => {
        const { type, code, id } = event.data;
        if (type !== 'RUN_CODE') return;

        currentId = id;
        sendToParent('STATUS', 'RUNNING');

        try {
          if ("${isPython}" === "true") {
            if (!window.pyodide) {
              sendToParent('STATUS', 'LOADING_PYODIDE');
              window.pyodide = await loadPyodide({
                indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.3/full/"
              });
            }
            
            window.pyodide.globals.set("bds_user_code", code);
            const result = await window.pyodide.runPythonAsync(
              "import io, sys, traceback\\n" +
              "_buffer = io.StringIO()\\n" +
              "_old_stdout = sys.stdout\\n" +
              "_old_stderr = sys.stderr\\n" +
              "sys.stdout = _buffer\\n" +
              "sys.stderr = _buffer\\n" +
              "try:\\n" +
              "    exec(bds_user_code, {})\\n" +
              "except Exception:\\n" +
              "    traceback.print_exc()\\n" +
              "finally:\\n" +
              "    sys.stdout = _old_stdout\\n" +
              "    sys.stderr = _old_stderr\\n" +
              "_buffer.getvalue()"
            );
            
            // Log the result (stdout/stderr)
            if (result !== undefined && result !== null) {
              console.log(String(result).trim());
            }
          } else if ("${isLua}" === "true") {
            if (!window.fengari) {
              let checks = 0;
              while (!window.fengari && checks < 50) {
                await new Promise(r => setTimeout(r, 100));
                checks++;
              }
            }
            if (!window.fengari) throw new Error("Fengari (Lua runtime) failed to load");
            const { lua, lauxlib, lualib } = window.fengari;
            const L = lauxlib.luaL_newstate();
            lualib.luaL_openlibs(L);
            const result = lauxlib.luaL_dostring(L, window.fengari.to_luastring(code));
            if (result !== 0) {
              const msg = lua.lua_tojsstring(L, -1);
              lua.lua_pop(L, 1);
              throw new Error(msg || "Lua execution error");
            }
          } else if ("${isRuby}" === "true") {
            if (!window.Opal?.eval) {
              let checks = 0;
              while (!window.Opal?.eval && checks < 50) {
                await new Promise(r => setTimeout(r, 100));
                checks++;
              }
            }
            if (!window.Opal?.eval) throw new Error("Opal (Ruby runtime) failed to load");
            Opal.eval(code);
          } else {
            let finalCode = code;
            if ("${isTypeScript}" === "true") {
              if (!window.Babel) {
                let checks = 0;
                while(!window.Babel && checks < 50) {
                  await new Promise(r => setTimeout(r, 100));
                  checks++;
                }
              }
              if (!window.Babel) throw new Error("Babel failed to load");
              finalCode = window.Babel.transform(code, {
                presets: ['typescript'],
                filename: 'script.ts'
              }).code;
            }
            const runner = new Function(finalCode);
            const result = runner();
            if (result !== undefined) console.log("Return:", result);
          }
          sendToParent('STATUS', 'FINISHED');
        } catch (err) {
          console.error(err.message || String(err));
          sendToParent('STATUS', 'ERROR');
        }
      });

      sendToParent('STATUS', 'READY');
    <\/script>
  </body>
</html>`;
}

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
        font-family: "Consolas", "Courier New", monospace;
        background: #0f172a;
        color: #e2e8f0;
      }
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px;
        background: #111827;
      }
      button {
        border: 0;
        padding: 6px 12px;
        border-radius: 999px;
        cursor: pointer;
        background: #14b8a6;
        color: #06201d;
        font-weight: 700;
      }
      textarea {
        width: 100%;
        min-height: 180px;
        border: 0;
        outline: 0;
        resize: vertical;
        box-sizing: border-box;
        padding: 10px;
        background: #1e293b;
        color: #f8fafc;
      }
      pre {
        margin: 0;
        padding: 10px;
        min-height: 100px;
        white-space: pre-wrap;
        background: #020617;
        color: #dcfce7;
      }
      .status {
        font-size: 12px;
        color: #93c5fd;
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
        font-family: "Consolas", "Courier New", monospace;
        background: #0f172a;
        color: #e2e8f0;
      }
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px;
        background: #111827;
      }
      button {
        border: 0;
        padding: 6px 12px;
        border-radius: 999px;
        cursor: pointer;
        background: #f59e0b;
        color: #451a03;
        font-weight: 700;
      }
      textarea {
        width: 100%;
        min-height: 180px;
        border: 0;
        outline: 0;
        resize: vertical;
        box-sizing: border-box;
        padding: 10px;
        background: #1e293b;
        color: #f8fafc;
      }
      pre {
        margin: 0;
        padding: 10px;
        min-height: 100px;
        white-space: pre-wrap;
        background: #020617;
        color: #dcfce7;
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
 * Build a premium visualizer document with the V-Kit CSS (Monochrome Minimalist).
 */
export function buildVisualizerDocument(content) {
  const trimmed = String(content || "").trim();
  
  // V-Kit CSS embedded (Monochrome Edition)
  const vKitCss = `
:root {
  --v-bg: #ffffff;
  --v-panel: #ffffff;
  --v-border: #000000;
  --v-accent: #1e3a8a;
  --v-text: #000000;
  --v-text-dim: #4b5563;
}
body {
  margin: 0;
  padding: 20px;
  background: var(--v-bg);
  color: var(--v-text);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow-x: hidden;
  line-height: 1.5;
}
.v-card {
  background: var(--v-panel);
  border: 1px solid var(--v-border);
  border-radius: 4px;
  padding: 1.5rem;
  box-shadow: 4px 4px 0px #000000;
}
.v-glass {
  background: transparent;
  border: 1px solid var(--v-border);
  border-radius: 4px;
}
.v-title {
  font-size: 1.15rem;
  font-weight: 900;
  margin: 0 0 1rem 0;
  color: var(--v-text);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 2px solid var(--v-border);
  padding-bottom: 4px;
  display: inline-block;
}
.v-stat {
  font-family: monospace;
  font-size: 0.8125rem;
  color: var(--v-accent);
  font-weight: 700;
}
.v-control-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 1.5rem;
}
.v-label {
  font-size: 0.7rem;
  font-weight: 800;
  color: var(--v-text);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
input[type="range"] {
  width: 100%;
  accent-color: var(--v-accent);
}
button.v-btn {
  background: var(--v-accent);
  color: white;
  border: 1px solid #000;
  border-radius: 0;
  padding: 8px 16px;
  font-weight: 700;
  text-transform: uppercase;
  font-size: 0.75rem;
  cursor: pointer;
}
.v-animate-float {
  animation: v-float 3s ease-in-out infinite;
}
@keyframes v-float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-5px); }
}
canvas {
  width: 100%;
  border: 1px solid #000;
  background: #fff;
}
  `;

  if (/<html[\s>]/i.test(trimmed)) {
    // If it's a full document, inject the style into the head
    return trimmed.replace(/<\/head>/i, `<style>${vKitCss}</style></head>`);
  }

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>${vKitCss}</style>
  </head>
  <body>${trimmed}</body>
</html>`;
}

import { mount } from "svelte";
import CodeRunner from "../ui/CodeRunner.svelte";

const INJECTED_ATTR = "data-bds-py-run-injected";

/**
 * Scan a DOM subtree for Python code blocks and inject Run buttons.
 * Uses a DOM data attribute for dedup — survives WeakSet GC and DOM re-render.
 */
export function injectPythonRunButtons(rootNode) {
  if (!rootNode) return;

  const codeBlocks = rootNode.querySelectorAll(`.md-code-block:not([${INJECTED_ATTR}])`);

  for (const block of codeBlocks) {
    if (!isPythonCodeBlock(block)) continue;

    const preEl = block.querySelector("pre");
    if (!preEl) continue;

    block.setAttribute(INJECTED_ATTR, "1");
    injectButton(block, preEl);
  }
}

// ── Detection ────────────────────────────────────────────────────────────────

function isPythonCodeBlock(block) {
  const banner =
    block.querySelector(".md-code-block-banner") ||
    block.querySelector('[class*="code-block-banner"]');
  if (banner) {
    const spans = banner.querySelectorAll("span");
    for (const span of spans) {
      const t = span.textContent.trim().toLowerCase();
      if (t === "python" || t === "py" || t === "python3") return true;
      // If it explicitly says JS/TS, it's not Python
      if (t === "javascript" || t === "js" || t === "typescript" || t === "ts") return false;
    }
  }

  const codeEl = block.querySelector(
    'pre code[class*="language-python"], pre code[class*="language-py"]'
  );
  if (codeEl) return true;

  if (block.querySelector('.token.keyword + .token.function')) {
    const text = block.querySelector("pre")?.textContent || "";
    if (/^(import |from |def |class )/m.test(text)) {
       // Avoid false positive with JS
       if (!/^(const |let |var |function |async |await )/m.test(text)) {
         return true;
       }
    }
  }

  return false;
}

// ── Injection ────────────────────────────────────────────────────────────────

function injectButton(block, preEl) {
  const btnContainer = findButtonContainer(block);

  const runBtn = document.createElement("button");
  runBtn.type = "button";
  runBtn.setAttribute("role", "button");
  runBtn.className = "ds-atom-button ds-text-button ds-text-button--with-icon bds-run-btn";
  runBtn.style.marginRight = "8px";

  const iconHtml = `
    <div class="ds-icon ds-atom-button__icon" style="font-size: 16px; width: 16px; height: 16px; margin-right: 3px; color: #10b981;">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
      </svg>
    </div>
  `;

  runBtn.innerHTML = `${iconHtml}<span><span class="code-info-button-text">Run Python</span></span><div class="ds-focus-ring"></div>`;

  let mounted = null;

  runBtn.addEventListener("click", () => {
    if (mounted) {
      mounted.instance.$destroy ? mounted.instance.$destroy() : mounted.unmount();
      mounted.container.remove();
      mounted = null;
      runBtn.querySelector(".code-info-button-text").textContent = "Run Python";
      runBtn.querySelector(".ds-icon").style.color = "#10b981";
      runBtn.querySelector("svg").innerHTML = '<path d="M12 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>';
      return;
    }

    const code = preEl.textContent || "";
    const container = document.createElement("div");
    block.parentNode.insertBefore(container, block.nextSibling);

    const instance = mount(CodeRunner, {
      target: container,
      props: {
        content: code,
        language: "python"
      }
    });

    mounted = { instance, container, unmount: () => {} };
    import("svelte").then(({ unmount: svelteUnmount }) => {
      mounted.unmount = () => svelteUnmount(instance);
    });

    runBtn.querySelector(".code-info-button-text").textContent = "Close";
    runBtn.querySelector(".ds-icon").style.color = "#ef4444";
    runBtn.querySelector("svg").innerHTML = '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>';
  });

  if (btnContainer) {
    btnContainer.insertBefore(runBtn, btnContainer.firstChild);
  } else {
    const banner =
      block.querySelector(".md-code-block-banner") ||
      block.querySelector('[class*="code-block-banner"]');
    if (banner) {
      banner.appendChild(runBtn);
    }
  }
}

function findButtonContainer(block) {
  // Find the Copy button that DeepSeek renders — skip buttons we injected.
  const btnText = block.querySelector(
    `.code-info-button-text:not(.bds-run-btn-text)`,
  );
  if (btnText) {
    const btn = btnText.closest("button");
    if (btn && btn.parentElement && !btn.classList.contains("bds-run-btn")) {
      return btn.parentElement;
    }
  }

  // Look for any ds-atom-button that isn't ours.
  const dsBtns = block.querySelectorAll(".ds-atom-button");
  for (const b of dsBtns) {
    if (!b.classList.contains("bds-run-btn") && b.parentElement) {
      return b.parentElement;
    }
  }

  return null;
}

import { mount } from "svelte";
import CodeRunner from "../ui/CodeRunner.svelte";

const INJECTED_ATTR = "data-bds-js-run-injected";

/**
 * Scan a DOM subtree for JS code blocks and inject Run buttons.
 * Uses a DOM data attribute for dedup — survives WeakSet GC and DOM re-render.
 */
export function injectJavaScriptRunButtons(rootNode) {
  if (!rootNode) return;

  const codeBlocks = rootNode.querySelectorAll(`.md-code-block:not([${INJECTED_ATTR}])`);

  for (const block of codeBlocks) {
    const lang = getCodeBlockLanguage(block);
    if (!lang) continue;

    const preEl = block.querySelector("pre");
    if (!preEl) continue;

    block.setAttribute(INJECTED_ATTR, "1");
    injectButton(block, preEl, lang);
  }
}

// ── Detection ────────────────────────────────────────────────────────────────

function getCodeBlockLanguage(block) {
  const banner =
    block.querySelector(".md-code-block-banner") ||
    block.querySelector('[class*="code-block-banner"]');
  
  if (banner) {
    const spans = banner.querySelectorAll("span");
    for (const span of spans) {
      const t = span.textContent.trim().toLowerCase();
      if (t === "javascript" || t === "js") return "javascript";
      if (t === "typescript" || t === "ts") return "typescript";
      // If it says something else (like python), it's definitely not JS
      if (t === "python" || t === "py" || t === "cpp" || t === "java") return null;
    }
  }

  const codeEl = block.querySelector('pre code[class*="language-"]');
  if (codeEl) {
    const cls = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
    if (cls) {
      const lang = cls.replace('language-', '').toLowerCase();
      if (lang === 'javascript' || lang === 'js') return 'javascript';
      if (lang === 'typescript' || lang === 'ts') return 'typescript';
    }
  }

  // Final check: look for JS keywords if language is unknown
  const text = block.querySelector("pre")?.textContent || "";
  if (/^(import |export |const |let |var |function |async |await |window\.|document\.)/m.test(text)) {
    // Only if it doesn't look like Python
    if (!/^(def |class |import sys|print\()/m.test(text)) {
       return "javascript";
    }
  }

  return null;
}

// ── Injection ────────────────────────────────────────────────────────────────

function injectButton(block, preEl, lang) {
  const btnContainer = findButtonContainer(block);

  const runBtn = document.createElement("button");
  runBtn.type = "button";
  runBtn.setAttribute("role", "button");
  runBtn.className = "ds-atom-button ds-text-button ds-text-button--with-icon bds-run-btn";
  runBtn.style.marginRight = "8px";
  
  const iconHtml = `
    <div class="ds-icon ds-atom-button__icon" style="font-size: 16px; width: 16px; height: 16px; margin-right: 3px; color: #f59e0b;">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 18l6-6-6-6M8 6l-6 6 6 6"></path>
      </svg>
    </div>
  `;

  runBtn.innerHTML = `${iconHtml}<span><span class="code-info-button-text">Run JS</span></span><div class="ds-focus-ring"></div>`;

  let mounted = null;

  runBtn.addEventListener("click", () => {
    if (mounted) {
      mounted.instance.$destroy ? mounted.instance.$destroy() : mounted.unmount();
      mounted.container.remove();
      mounted = null;
      runBtn.querySelector(".code-info-button-text").textContent = "Run JS";
      runBtn.querySelector(".ds-icon").style.color = "#f59e0b";
      runBtn.querySelector("svg").innerHTML = '<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"></path>';
      return;
    }

    const code = preEl.textContent || "";
    const container = document.createElement("div");
    block.parentNode.insertBefore(container, block.nextSibling);

    const instance = mount(CodeRunner, {
      target: container,
      props: {
        content: code,
        language: lang
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

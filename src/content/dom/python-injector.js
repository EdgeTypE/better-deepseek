import { mount } from "svelte";
import CodeRunner from "../ui/CodeRunner.svelte";

const processedBlocks = new WeakSet();

/**
 * Scan a DOM subtree for Python code blocks and inject Run buttons.
 */
export function injectPythonRunButtons(rootNode) {
  if (!rootNode) return;

  const codeBlocks = rootNode.querySelectorAll(".md-code-block");

  for (const block of codeBlocks) {
    if (processedBlocks.has(block)) continue;

    if (!isPythonCodeBlock(block)) continue;

    const preEl = block.querySelector("pre");
    if (!preEl) continue;

    processedBlocks.add(block);
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
    }
  }

  const codeEl = block.querySelector(
    'pre code[class*="language-python"], pre code[class*="language-py"]'
  );
  if (codeEl) return true;

  if (block.querySelector('.token.keyword + .token.function')) {
    const text = block.querySelector("pre")?.textContent || "";
    if (/^(import |from |def |class )/m.test(text)) return true;
  }

  return false;
}

// ── Injection ────────────────────────────────────────────────────────────────

function injectButton(block, preEl) {
  const btnContainer = findButtonContainer(block);

  const runBtn = document.createElement("button");
  runBtn.type = "button";
  runBtn.setAttribute("role", "button");
  runBtn.className = "bds-run-python-btn";
  runBtn.innerHTML =
    '<span style="margin-right:4px">▶</span><span>Run</span>';
  applyButtonStyle(runBtn);

  let mounted = null;

  runBtn.addEventListener("click", () => {
    if (mounted) {
      mounted.instance.$destroy ? mounted.instance.$destroy() : mounted.unmount();
      mounted.container.remove();
      mounted = null;
      runBtn.innerHTML =
        '<span style="margin-right:4px">▶</span><span>Run</span>';
      applyButtonStyle(runBtn);
      return;
    }

    const code = preEl.textContent || "";
    
    // Create container for Svelte component
    const container = document.createElement("div");
    block.parentNode.insertBefore(container, block.nextSibling);

    const instance = mount(CodeRunner, {
      target: container,
      props: {
        content: code,
        language: "python"
      }
    });

    mounted = { instance, container, unmount: () => {} }; // Note: Svelte 5 mount returns instance, unmount is a separate call if needed but usually just remove target or use unmount()
    // In Svelte 5, mount returns the component instance. To unmount, we need to keep track of it.
    // Actually Svelte 5 mount returns an object with unmount if called differently or just the instance.
    // Let's use the standard Svelte 5 unmount.
    import("svelte").then(({ unmount: svelteUnmount }) => {
      mounted.unmount = () => svelteUnmount(instance);
    });

    runBtn.innerHTML =
      '<span style="margin-right:4px">✕</span><span>Close</span>';
    runBtn.style.background = "#ef4444";
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
  const btnText = block.querySelector(".code-info-button-text");
  if (btnText) {
    const btn = btnText.closest("button");
    if (btn && btn.parentElement) return btn.parentElement;
  }

  const dsBtn = block.querySelector(".ds-atom-button");
  if (dsBtn && dsBtn.parentElement) return dsBtn.parentElement;

  return null;
}

function applyButtonStyle(el) {
  Object.assign(el.style, {
    display: "inline-flex",
    alignItems: "center",
    background: "#10b981",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    padding: "4px 12px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    marginRight: "6px",
    transition: "background 0.15s ease",
    lineHeight: "1.4",
    verticalAlign: "middle",
  });
}

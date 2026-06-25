<script>
  import { COMMANDS } from "./registry.js"
  import { tryExecuteRawInput } from "./executor.js"
  import appState from "../state.js"

  function editorValue(el) {
    const t = (el.tagName || "").toLowerCase()
    return t === "textarea" || t === "input" ? el.value : (el.textContent || "")
  }

  function getCursorPosition(el) {
    const t = (el.tagName || "").toLowerCase()
    if (t === "textarea" || t === "input") return el.selectionStart
    const sel = document.getSelection()
    if (sel && sel.rangeCount > 0) {
      const preCaretRange = sel.getRangeAt(0).cloneRange()
      preCaretRange.selectNodeContents(el)
      preCaretRange.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset)
      return preCaretRange.toString().length
    }
    return editorValue(el).length
  }

  function setEditorValue(el, v) {
    const t = (el.tagName || "").toLowerCase()
    if (t === "textarea" || t === "input") el.value = v
    else el.textContent = v
  }

  let { editor } = $props()

  let isOpen = $state(false)
  let query = $state("")
  let selectedIndex = $state(0)
  let filteredItems = $state([])
  let lastSlashPos = $state(-1)
  let dropdownStyle = $state("")
  let snippetCommands = $state([])

  function refreshSnippetCommands() {
    const mappings = appState.commands?.customMappings || {}
    snippetCommands = Object.entries(mappings).map(([cmd, snippetId]) => {
      const snippet = appState.savedItems.find(s => s.id === snippetId)
      return { id: cmd, snippet }
    }).filter(e => e.snippet)
  }

  $effect(refreshSnippetCommands)

  function handleBlur() { isOpen = false }

  $effect(() => {
    if (!editor) return
    console.log("[BDS:Cmd] AC mounted on", editor.tagName, "#" + (editor.id || ""))
    editor.addEventListener("input", handleInput)
    editor.addEventListener("keydown", handleKeydown)
    editor.addEventListener("blur", handleBlur)
    return () => {
      console.log("[BDS:Cmd] AC destroyed")
      editor.removeEventListener("input", handleInput)
      editor.removeEventListener("keydown", handleKeydown)
      editor.removeEventListener("blur", handleBlur)
    }
  })

  function handleInput(e) {
    refreshSnippetCommands()
    const text = editorValue(e.target)
    const pos = getCursorPosition(e.target)
    const beforeCursor = text.slice(0, pos)
    const slashIdx = beforeCursor.lastIndexOf("/")
    console.log("[BDS:Cmd] input text=" + text.substring(0, 50).replace(/\n/g, "\\n"), "pos=" + pos, "slashAt=" + slashIdx, "open=" + isOpen)
    if (slashIdx >= 0) {
      const afterSlash = beforeCursor.slice(slashIdx + 1)
      if (!afterSlash.includes(" ")) {
        lastSlashPos = slashIdx; query = afterSlash; selectedIndex = 0
        updateFiltered(); updatePosition(e.target)
        isOpen = filteredItems.length > 0
        console.log("[BDS:Cmd] dropdown " + (isOpen ? "OPEN" : "CLOSED (no matches)") + " query=" + query + " items=" + filteredItems.length)
        return
      }
    }
    if (isOpen) { isOpen = false; console.log("[BDS:Cmd] dropdown CLOSED (no slash or space after slash)") }
  }

  function handleKeydown(e) {
    if (!isOpen) return
    console.log("[BDS:Cmd] key=" + e.key + " idx=" + selectedIndex + "/" + filteredItems.length)
    if (e.key === "ArrowDown") { e.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, filteredItems.length - 1); scrollToSelected() }
    else if (e.key === "ArrowUp") { e.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); scrollToSelected() }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); selectCurrent() }
    else if (e.key === "Escape") { e.preventDefault(); isOpen = false; console.log("[BDS:Cmd] dropdown closed via Escape") }
  }

  function updateFiltered() {
    const q = query.toLowerCase()
    const builtins = q ? COMMANDS.filter(c => c.id.includes(q) || c.aliases.some(a => a.includes(q)) || c.name.toLowerCase().includes(q)) : COMMANDS
    const snippets = q ? snippetCommands.filter(s => s.id.includes(q)) : snippetCommands
    filteredItems = [...builtins.map(c => ({ type: "builtin", id: c.id, cmd: c })), ...snippets.map(s => ({ type: "snippet", id: s.id, snippet: s.snippet }))]
  }

  function updatePosition(inputEl) {
    const rect = inputEl.getBoundingClientRect()
    dropdownStyle = "bottom: " + (window.innerHeight - rect.top + 4) + "px; left: " + rect.left + "px; width: " + Math.min(rect.width, 400) + "px;"
  }

  function scrollToSelected() {
    requestAnimationFrame(() => { const el = document.querySelector(".bds-cmd-item--selected"); el?.scrollIntoView({ block: "nearest" }) })
  }

  function selectCurrent() {
    const item = filteredItems[selectedIndex]
    if (!item) { console.log("[BDS:Cmd] selectCurrent: no item at index", selectedIndex); return }
    isOpen = false
    const text = editorValue(editor)
    const before = text.slice(0, lastSlashPos)
    setEditorValue(editor, before)
    editor.dispatchEvent(new Event("input", { bubbles: true }))
    console.log("[BDS:Cmd] select type=" + item.type + " id=" + item.id)
    if (item.type === "builtin") {
      if (item.id === "help") { window.dispatchEvent(new CustomEvent("bds:show-help")); console.log("[BDS:Cmd] help event dispatched") }
      else if (item.cmd.minArgs === 0) { console.log("[BDS:Cmd] executing zero-arg builtin:", item.id); tryExecuteRawInput("/" + item.id) }
      else {
        setEditorValue(editor, "/" + item.id + " ")
        const len = editorValue(editor).length
        editor.dispatchEvent(new Event("input", { bubbles: true }))
        if (typeof editor.setSelectionRange === "function") editor.setSelectionRange(len, len)
        editor.focus()
      }
    } else if (item.type === "snippet") { console.log("[BDS:Cmd] executing snippet:", item.id); tryExecuteRawInput("/" + item.id) }
  }

  function handleItemClick(index) { selectedIndex = index; selectCurrent() }
</script>

{#if isOpen}
  <div class="bds-cmd-dropdown" style={dropdownStyle}>
    <div class="bds-cmd-list">
      {#each filteredItems as item, i}
        <button type="button" class="bds-cmd-item {i === selectedIndex ? 'bds-cmd-item--selected' : ''}" class:bds-cmd-item--builtin={item.type === "builtin"} class:bds-cmd-item--snippet={item.type === "snippet"} onclick={() => handleItemClick(i)} onmouseenter={() => { selectedIndex = i }}>
          {#if item.type === "builtin"}
            <span class="bds-cmd-icon">{@html item.cmd.icon}</span>
            <span class="bds-cmd-info"><span class="bds-cmd-name">/{item.cmd.id}</span><span class="bds-cmd-desc">{item.cmd.description}</span></span>
            <span class="bds-cmd-category">{item.cmd.category}</span>
          {:else}
            <span class="bds-cmd-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>
            <span class="bds-cmd-info"><span class="bds-cmd-name">/{item.id}</span><span class="bds-cmd-desc">{item.snippet.title}</span></span>
            <span class="bds-cmd-category bds-cmd-category--snippet">snippet</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
{/if}

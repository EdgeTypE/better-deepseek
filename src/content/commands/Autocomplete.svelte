<script>
import { COMMANDS } from "./registry.js"
import { tryExecuteRawInput } from "./executor.js"
import { injectPureTextAndSend } from "../auto.js"
import appState from "../state.js"
import { findMentionQuery } from "../../lib/skill-mentions.js"
import { t } from "../../lib/i18n.svelte.js"
import { devLog } from "../../lib/dev-log.js"

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

  function placeCaret(el, offset) {
    const tag = (el.tagName || "").toLowerCase()
    if (tag === "textarea" || tag === "input") {
      if (typeof el.setSelectionRange === "function") el.setSelectionRange(offset, offset)
      return
    }
    const sel = document.getSelection()
    if (!sel) return
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let remaining = offset
    let node = walker.nextNode()
    while (node) {
      const length = node.textContent.length
      if (remaining <= length) {
        const range = document.createRange()
        range.setStart(node, remaining)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        return
      }
      remaining -= length
      node = walker.nextNode()
    }
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  let { editor } = $props()

  let isOpen = $state(false)
  /** "slash" for /commands, "mention" for @skills. */
  let trigger = $state("slash")
  let query = $state("")
  let selectedIndex = $state(0)
  let filteredItems = $state([])
  /** Offset of the "/" or "@" that opened the menu. */
  let triggerStart = $state(-1)
  /** Caret offset when the menu opened, so a mention can be replaced exactly. */
  let triggerEnd = $state(-1)
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

  function skillList() {
    return Array.isArray(appState.skills) ? appState.skills : []
  }

  function skillNames() {
    return skillList().map(s => String(s.name || "")).filter(Boolean)
  }

  function handleBlur() { isOpen = false }

  /**
   * Keep the editor focused while the menu is clicked. Without this the blur
   * unmounts the list before the click lands.
   */
  function keepEditorFocus(node) {
    const prevent = (event) => event.preventDefault()
    node.addEventListener("mousedown", prevent)
    return {
      destroy() { node.removeEventListener("mousedown", prevent) }
    }
  }

  $effect(() => {
    if (!editor) return
    devLog("Cmd", "AC mounted on", editor.tagName, "#" + (editor.id || ""))
    editor.addEventListener("input", handleInput)
    editor.addEventListener("keydown", handleKeydown)
    editor.addEventListener("blur", handleBlur)
    return () => {
      devLog("Cmd", "AC destroyed")
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
    devLog("Cmd", "input text=", text.substring(0, 50).replace(/\n/g, "\\n"), "pos=", pos, "open=", isOpen)

    // /command — still only at the very start of the message.
    if (beforeCursor.startsWith("/")) {
      const afterSlash = beforeCursor.slice(1)
      if (!afterSlash.includes(" ")) {
        trigger = "slash"; triggerStart = 0; triggerEnd = pos
        query = afterSlash; selectedIndex = 0
        updateFiltered(); updatePosition(e.target)
        isOpen = filteredItems.length > 0
        devLog("Cmd", "dropdown", isOpen ? "OPEN" : "CLOSED (no matches)", "query=", query, "items=", filteredItems.length)
        return
      }
    }

    // @skill — anywhere in the message.
    const mention = findMentionQuery(text, pos, skillNames())
    if (mention) {
      trigger = "mention"; triggerStart = mention.start; triggerEnd = pos
      query = mention.query; selectedIndex = 0
      updateFiltered(mention.matches)
      updatePosition(e.target)
      isOpen = filteredItems.length > 0
      devLog("Cmd", "@dropdown", isOpen ? "OPEN" : "CLOSED (no matches)", "query=", query, "items=", filteredItems.length)
      return
    }

    if (isOpen) { isOpen = false; devLog("Cmd", "dropdown CLOSED (no trigger)") }
  }

  function handleKeydown(e) {
    if (!isOpen) return
    devLog("Cmd", "key=", e.key, "idx=", selectedIndex, "/", filteredItems.length)
    if (e.key === "ArrowDown") { e.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, filteredItems.length - 1); scrollToSelected() }
    else if (e.key === "ArrowUp") { e.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); scrollToSelected() }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); selectCurrent() }
    else if (e.key === "Escape") { e.preventDefault(); isOpen = false; devLog("Cmd", "dropdown closed via Escape") }
  }

  function updateFiltered(mentionMatches = null) {
    if (mentionMatches) {
      const skills = skillList()
      filteredItems = mentionMatches
        .map(name => skills.find(s => String(s.name || "") === name))
        .filter(Boolean)
        .map(skill => ({ type: "skill", id: skill.name, skill }))
      return
    }
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

  function insertSkillMention(skill) {
    const name = String(skill.name || "")
    const text = editorValue(editor)
    const start = triggerStart
    const end = Math.max(triggerEnd, start)
    // The mention stays in the message: the payload mutator resolves the same
    // string when the request goes out.
    const next = text.slice(0, start) + "@" + name + " " + text.slice(end)
    setEditorValue(editor, next)
    editor.dispatchEvent(new Event("input", { bubbles: true }))
    placeCaret(editor, start + name.length + 2)
    editor.focus()
    devLog("Cmd", "inserted mention @", name)
  }

  function selectCurrent() {
    const item = filteredItems[selectedIndex]
    if (!item) { devLog("Cmd", "selectCurrent: no item at index", selectedIndex); return }
    isOpen = false
    devLog("Cmd", "select type=", item.type, "id=", item.id)
    if (item.type === "skill") {
      insertSkillMention(item.skill)
    } else if (item.type === "builtin") {
      const text = editorValue(editor)
      const before = text.slice(0, triggerStart)
      setEditorValue(editor, before)
      editor.dispatchEvent(new Event("input", { bubbles: true }))
      if (item.id === "help") { window.dispatchEvent(new CustomEvent("bds:show-help")); devLog("Cmd", "help event dispatched") }
      else if (item.cmd.minArgs === 0) { devLog("Cmd", "executing zero-arg builtin:", item.id); tryExecuteRawInput("/" + item.id) }
      else {
        setEditorValue(editor, "/" + item.id + " ")
        const len = editorValue(editor).length
        editor.dispatchEvent(new Event("input", { bubbles: true }))
        if (typeof editor.setSelectionRange === "function") editor.setSelectionRange(len, len)
        editor.focus()
      }
    } else if (item.type === "snippet") { devLog("Cmd", "executing snippet:", item.id); injectPureTextAndSend(item.snippet.content, `/${item.id}`) }
  }

  function handleItemClick(index) { selectedIndex = index; selectCurrent() }

  function getArgsDisplay(cmd) {
    const usage = cmd.usage || ""
    const prefix = "/" + cmd.id
    if (usage.startsWith(prefix)) return " " + usage.slice(prefix.length).trim()
    return ""
  }
</script>

{#if isOpen}
  <!-- Keep focus in the editor: a blur would unmount this list before the
       click lands. -->
  <div class="bds-cmd-dropdown" style={dropdownStyle} use:keepEditorFocus>
    <div class="bds-cmd-list">
      {#each filteredItems as item, i}
        <button type="button" class="bds-cmd-item {i === selectedIndex ? 'bds-cmd-item--selected' : ''}" class:bds-cmd-item--builtin={item.type === "builtin"} class:bds-cmd-item--snippet={item.type === "snippet"} class:bds-cmd-item--skill={item.type === "skill"} onclick={() => handleItemClick(i)} onmouseenter={() => { selectedIndex = i }}>
          {#if item.type === "builtin"}
            <span class="bds-cmd-icon">{@html item.cmd.icon}</span>
            <span class="bds-cmd-info"><span class="bds-cmd-name">/{item.cmd.id}{#if getArgsDisplay(item.cmd)}<span class="bds-cmd-args">{getArgsDisplay(item.cmd)}</span>{/if}</span><span class="bds-cmd-desc">{t(item.cmd.descKey)}</span></span>
            <span class="bds-cmd-category">{t(item.cmd.catKey)}</span>
          {:else if item.type === "skill"}
            <span class="bds-cmd-icon bds-cmd-icon--mention">@</span>
            <span class="bds-cmd-info"><span class="bds-cmd-name">@{item.skill.name}</span>{#if item.skill.usage}<span class="bds-cmd-desc">{item.skill.usage}</span>{/if}</span>
            <span class="bds-cmd-category bds-cmd-category--skill">{t("commands.categorySkill")}</span>
          {:else}
            <span class="bds-cmd-icon"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span>
            <span class="bds-cmd-info"><span class="bds-cmd-name">/{item.id}</span><span class="bds-cmd-desc">{item.snippet.title}</span></span>
            <span class="bds-cmd-category bds-cmd-category--snippet">{t("commands.categorySnippet")}</span>
          {/if}
        </button>
      {/each}
    </div>
    <div class="bds-cmd-footer">{trigger === "mention" ? t("commands.mentionHint") : t("commands.autocompleteHint")}</div>
  </div>
{/if}

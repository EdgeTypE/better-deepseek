import { findCommand } from "./registry.js"
import { parseCommandInput } from "./parser.js"
import { searchWeb } from "../files/search-reader.js"
import { injectPureTextAndSend } from "../auto.js"
import { exportSession } from "../tools/exporter.js"
import { performCompress, performSummarize } from "./context-handoff.js"
import state from "../state.js"

export function tryExecuteRawInput(input) {
  const parsed = parseCommandInput(input)
  if (!parsed) return false

  const { command, args, rawArgs } = parsed
  const builtin = findCommand(command)
  if (builtin) {
    if (builtin.validateArgs) {
      const error = builtin.validateArgs(args)
      if (error) {
        if (state.ui) state.ui.showToast(error)
        return false
      }
    }
    executeBuiltin(builtin, args, rawArgs)
    return true
  }

  const snippetId = state.commands.customMappings[command]
  if (snippetId) {
    const snippet = state.savedItems.find(s => s.id === snippetId)
    if (snippet) {
      executeSnippet(snippet, rawArgs)
      return true
    }
  }

  if (state.ui) state.ui.showToast(`Unknown command: /${command}. Type /help for available commands.`)
  return false
}

async function executeBuiltin(cmd, args, rawArgs) {
  try {
    switch (cmd.id) {
      case "search": {
        const result = await searchWeb(rawArgs || args.join(" "), 0, () => {})
        if (result?.file) injectFileViaNativeInput(result.file)
        break
      }
      case "new":
        window.location.href = "https://chat.deepseek.com/"
        break
      case "compress":
        await performCompress()
        break
      case "summarize":
        await performSummarize()
        break
      case "export":
        await exportSession(args[0].toLowerCase())
        break
      case "help":
        window.dispatchEvent(new CustomEvent("bds:show-help"))
        break
    }
  } catch (err) {
    if (state.ui) state.ui.showToast(`${cmd.id}: ${err.message}`)
  }
}

async function executeSnippet(snippet, extraText) {
  try {
    let text = snippet.content
    if (extraText) {
      text += `\n\n---\n*User note: ${extraText}*`
    }
    await injectPureTextAndSend(text)
  } catch (err) {
    if (state.ui) state.ui.showToast(`snippet: ${err.message}`)
  }
}

function injectFileViaNativeInput(file) {
  const nativeInput = document.querySelector('input[type="file"][multiple]')
  if (!nativeInput) {
    if (state.ui) state.ui.showToast("Could not find file input to inject file")
    return
  }
  const dt = new DataTransfer()
  if (nativeInput.files) {
    for (let i = 0; i < nativeInput.files.length; i++) {
      dt.items.add(nativeInput.files[i])
    }
  }
  dt.items.add(file)
  nativeInput.files = dt.files
  nativeInput.dispatchEvent(new Event("change", { bubbles: true }))
}

export function parseCommandInput(input) {
  const text = String(input || "").trim()
  if (!text.startsWith("/")) return null

  const rest = text.slice(1)
  const parts = rest.match(/(?:[^\s"]+|"[^"]*")+/g) || []
  const command = (parts[0] || "").toLowerCase()

  const args = []

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]
    if (part.startsWith("\"") && part.endsWith("\"")) {
      args.push(part.slice(1, -1))
    } else {
      args.push(part)
    }
  }

  return { command, args, rawArgs: args.join(" "), text: rest }
}

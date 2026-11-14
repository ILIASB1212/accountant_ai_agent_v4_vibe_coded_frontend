import { z } from "zod"

const streamEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), phase: z.literal("checking") }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("replace"), text: z.string() }),
  z.object({
    type: z.literal("done"),
    answer: z.string(),
    history_saved: z.boolean(),
    blocked: z.boolean().default(false),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
])
const interrupted =
  "La réponse a été interrompue. Vérifiez l'historique avant de réessayer."

export async function readAnswerStream(
  response: Response,
  onText: (text: string) => void,
  onChecking?: () => void
) {
  if (!response.body) throw new Error(interrupted)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let text = ""
  let completion:
    { answer: string; historySaved: boolean; blocked: boolean } | undefined
  try {
    while (!completion) {
      const chunk = await reader.read()
      buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      if (buffer.length > 2_000_000) throw new Error(interrupted)
      let boundary = buffer.search(/\r?\n\r?\n/)
      let changed = false
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary)
        const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)
        buffer = buffer.slice(boundary + (separator?.[0].length ?? 2))
        const payload = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n")
        if (payload) {
          const data: unknown = JSON.parse(payload)
          const event = streamEvent.parse(data)
          switch (event.type) {
            case "status":
              onChecking?.()
              break
            case "delta":
              text += event.text
              changed = true
              break
            case "replace":
              text = event.text
              changed = true
              break
            case "done":
              completion = {
                answer: event.answer,
                historySaved: event.history_saved,
                blocked: event.blocked,
              }
              break
            case "error":
              throw new Error(interrupted)
          }
          if (text.length > 2_000_000) throw new Error(interrupted)
        }
        if (completion) break
        boundary = buffer.search(/\r?\n\r?\n/)
      }
      if (changed) onText(text)
      if (chunk.done && !completion) throw new Error(interrupted)
    }
    return completion
  } catch {
    throw new Error(interrupted)
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

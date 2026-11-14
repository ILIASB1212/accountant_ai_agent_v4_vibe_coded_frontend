import type { Message } from "./contracts"

export function hasCompletedSubmission(
  messages: Message[],
  text: string,
  previousIds: ReadonlySet<Message["id"]>
) {
  const index = messages.findLastIndex(
    (message) =>
      message.role === "user" &&
      message.content === text &&
      !previousIds.has(message.id)
  )
  if (index < 0) return false
  for (const message of messages.slice(index + 1)) {
    if (message.role === "user") return false
    if (message.role === "assistant") return true
  }
  return false
}

import type { ExtractedDocument } from "./contracts"

export const DOCUMENT_MARKER = "\n\n[Document joint]\n"
export type DocumentState =
  | { kind: "none" }
  | { kind: "reading"; filename: string }
  | { kind: "ready"; document: ExtractedDocument }
  | { kind: "error"; message: string }

export function composeMessage(draft: string, attachment: DocumentState) {
  const question = draft.trim()
  if (attachment.kind !== "ready") return question
  return `${question || "Analyse ce document comptable et résume les informations lisibles."}${DOCUMENT_MARKER}${attachment.document.filename}\n${attachment.document.text}`
}

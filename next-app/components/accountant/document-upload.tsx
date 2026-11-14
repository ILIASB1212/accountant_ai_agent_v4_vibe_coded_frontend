"use client"

import { useLanguage } from "@/components/language-provider"

import { useRef } from "react"
import { FileText, X } from "lucide-react"
import { DOCUMENT_MARKER, type DocumentState } from "@/lib/documents"
import { Busy, Notice } from "./ui"

export function UploadControl({
  disabled,
  onSelect,
}: {
  disabled: boolean
  onSelect: (file: File) => void
}) {
  const { t } = useLanguage()

  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
        aria-label={t("Fichier PDF ou image à lire")}
        className="sr-only"
        disabled={disabled}
        tabIndex={-1}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          if (file) onSelect(file)
        }}
      />
      <button
        type="button"
        className="icon-button upload-button"
        aria-label={t("Joindre un document")}
        title={t("Joindre un PDF, PNG ou JPEG (10 Mo maximum)")}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <FileText size={18} />
      </button>
    </>
  )
}

export function DocumentCard({
  state,
  onRemove,
  onPreview,
  disabled,
}: {
  state: DocumentState
  onRemove: () => void
  onPreview: () => void
  disabled: boolean
}) {
  const { t } = useLanguage()

  if (state.kind === "none") return null
  if (state.kind === "error")
    return (
      <div className="document-error">
        <Notice action={t("Fermer")} onAction={onRemove}>
          {state.message}
        </Notice>
      </div>
    )
  return (
    <div className="document-card">
      <FileText size={20} aria-hidden="true" />
      <div>
        <strong>
          {state.kind === "reading" ? state.filename : state.document.filename}
        </strong>
        {state.kind === "reading" ? (
          <Busy text={t("Lecture du document…")} />
        ) : (
          <button type="button" className="text-button" onClick={onPreview}>
            {t("Texte extrait · Voir avant envoi")}
          </button>
        )}
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label={t("Retirer le document")}
        disabled={disabled}
        onClick={onRemove}
      >
        <X size={17} />
      </button>
    </div>
  )
}

export function UserText({ content }: { content: string }) {
  const { t } = useLanguage()

  const position = content.lastIndexOf(DOCUMENT_MARKER)
  if (position < 0)
    return (
      <p className="user-text" dir="auto">
        {content}
      </p>
    )
  const documentText = content.slice(position + DOCUMENT_MARKER.length)
  const newline = documentText.indexOf("\n")
  if (newline < 0)
    return (
      <p className="user-text" dir="auto">
        {content}
      </p>
    )
  return (
    <div className="user-text">
      <p dir="auto">{content.slice(0, position)}</p>
      <details className="message-document">
        <summary>
          <FileText size={15} aria-hidden="true" />
          {documentText.slice(0, newline)}
          <span>{t("Texte extrait")}</span>
        </summary>
        <pre dir="auto">{documentText.slice(newline + 1)}</pre>
      </details>
    </div>
  )
}

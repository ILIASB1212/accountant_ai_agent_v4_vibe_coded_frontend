"use client"

import { useLanguage } from "@/components/language-provider"

import { Children, useEffect, useRef, type ReactNode } from "react"
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  LoaderCircle,
  X,
} from "lucide-react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"

export function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage()

  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`} dir="ltr">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>
        Accountant<span className="brand-ai"> AI</span>
        {!compact && <small>{t("Comptabilité & fiscalité marocaines")}</small>}
      </span>
      {!compact && <span className="version">v3</span>}
    </div>
  )
}
export function Busy({ text = "Chargement…" }: { text?: string }) {
  const { t } = useLanguage()

  return (
    <span className="busy" role="status">
      <LoaderCircle className="spinner" size={17} aria-hidden="true" />
      {t(text)}
    </span>
  )
}
export function Notice({
  children,
  action,
  onAction,
  kind = "error",
}: {
  children: ReactNode
  action?: string
  onAction?: () => void
  kind?: "error" | "info"
}) {
  const { t } = useLanguage()

  return (
    <div
      className={`notice notice-${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <AlertCircle size={18} aria-hidden="true" />
      <div>
        {Children.map(children, (child) =>
          typeof child === "string" ? t(child) : child
        )}
        {action && (
          <button className="text-button" onClick={onAction}>
            {t(action)}
          </button>
        )}
      </div>
    </div>
  )
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  const { t } = useLanguage()

  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    const previous = document.activeElement
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect()
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose()
        }
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-header">
        <div>
          <h2 id="modal-title">{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={t("Fermer")}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
export function Answer({ content }: { content: string }) {
  const { t } = useLanguage()

  return (
    <div className="answer" dir="auto">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) =>
            href && /^https?:\/\//i.test(href) ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
                <ArrowUpRight size={12} aria-hidden="true" />
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => (
            <span>{alt || t("Illustration non affichée")}</span>
          ),
          table: ({ children }) => (
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label={t("Tableau de la réponse")}
            >
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
export function ScopeNote() {
  const { t } = useLanguage()

  return (
    <div className="scope-note">
      <BookOpen size={16} aria-hidden="true" />
      <span>{t("Fiscalité marocaine · CGI, CGNC et lois de finances")}</span>
    </div>
  )
}

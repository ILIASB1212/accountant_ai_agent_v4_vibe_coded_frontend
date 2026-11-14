"use client"

import { useLanguage } from "@/components/language-provider"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Copy, RefreshCw, UserPlus } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { Busy, Modal, Notice } from "./ui"
import { CabinetMembers } from "./cabinet-members"

type InvitationState =
  | { kind: "loading" }
  | { kind: "ready"; code: string; companyName: string }
  | { kind: "error"; message: string }

export function CabinetSettings({
  onClose,
  onUnauthorized,
}: {
  onClose: () => void
  onUnauthorized: () => void
}) {
  const { t } = useLanguage()

  const [state, setState] = useState<InvitationState>({ kind: "loading" })
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState("")
  const codeInput = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const load = useCallback(
    (signal: AbortSignal) =>
      api
        .me(signal)
        .then((profile) => {
          if (signal.aborted) return
          const membership = profile.membership
          if (membership?.role !== "owner" || membership.status !== "active") {
            setState({
              kind: "error",
              message:
                "Seul le responsable du cabinet peut consulter le code d'invitation.",
            })
          } else if (!membership.join_code?.trim()) {
            setState({
              kind: "error",
              message:
                "Le code d'invitation n'est pas disponible. Actualisez pour vérifier à nouveau.",
            })
          } else {
            setState({
              kind: "ready",
              code: membership.join_code,
              companyName: membership.company_name || "Mon cabinet",
            })
          }
        })
        .catch((error: unknown) => {
          if (signal.aborted) return
          if (error instanceof ApiError && error.status === 401)
            onUnauthorized()
          else
            setState({
              kind: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Le code n'a pas pu être chargé.",
            })
        }),
    [onUnauthorized]
  )
  useEffect(() => {
    const request = new AbortController()
    controller.current = request
    void load(request.signal)
    return () => {
      controller.current?.abort()
      if (copyTimer.current) clearTimeout(copyTimer.current)
    }
  }, [load])

  function refresh() {
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setState({ kind: "loading" })
    setCopied(false)
    setCopyError("")
    void load(request.signal)
  }
  async function copyCode() {
    if (state.kind !== "ready") return
    try {
      await navigator.clipboard.writeText(state.code)
      setCopied(true)
      setCopyError("")
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopyError(
        "La copie automatique est indisponible. Le code est sélectionné : copiez-le manuellement."
      )
      codeInput.current?.focus()
      codeInput.current?.select()
    }
  }

  return (
    <Modal
      title={t("Paramètres du cabinet")}
      description={t("Invitez un collaborateur à rejoindre votre cabinet.")}
      onClose={onClose}
      wide
    >
      <CabinetMembers onUnauthorized={onUnauthorized} />
      {state.kind === "loading" ? (
        <div className="invitation-loading">
          <Busy text={t("Chargement du code d'invitation…")} />
        </div>
      ) : state.kind === "error" ? (
        <Notice action={t("Réessayer")} onAction={refresh}>
          {state.message}
        </Notice>
      ) : (
        <div className="invitation-settings">
          <div className="invitation-cabinet">
            <span className="invitation-icon">
              <UserPlus size={21} aria-hidden="true" />
            </span>
            <div>
              <h3>{t("Inviter un collaborateur")}</h3>
              <p>{state.companyName}</p>
            </div>
          </div>
          <label>
            {t("Code d'invitation")}
            <div className="invitation-code-row">
              <input
                ref={codeInput}
                aria-label={t("Code d'invitation")}
                readOnly
                dir="ltr"
                value={state.code}
                autoComplete="off"
                spellCheck={false}
                onFocus={(event) => event.currentTarget.select()}
              />
              <button className="button primary" onClick={copyCode}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? t("Code copié") : t("Copier le code")}
              </button>
            </div>
          </label>
          <span className="sr-only" role="status" aria-live="polite">
            {copied ? t("Code d'invitation copié.") : ""}
          </span>
          {copyError && <Notice kind="info">{copyError}</Notice>}
          <p className="invitation-description">
            {t(
              "Transmettez ce code au collaborateur que vous souhaitez inviter."
            )}
          </p>
          <ol className="invitation-steps">
            <li>{t("Il crée son compte ou se connecte.")}</li>
            <li>
              {t("Il choisit « Rejoindre un cabinet » et saisit ce code.")}
            </li>
            <li>
              {t(
                "Sa demande doit ensuite être approuvée par le responsable du cabinet."
              )}
            </li>
          </ol>
          <button className="text-button invitation-refresh" onClick={refresh}>
            <RefreshCw size={14} aria-hidden="true" />
            {t("Actualiser le code")}
          </button>
        </div>
      )}
    </Modal>
  )
}

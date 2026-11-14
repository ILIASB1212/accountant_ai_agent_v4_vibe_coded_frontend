"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Crown, RefreshCw, UserRound, Users } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import { api, ApiError } from "@/lib/api"
import type { CabinetMember } from "@/lib/contracts"
import { Busy, Notice } from "./ui"

type MembersState =
  | { kind: "loading" }
  | { kind: "ready"; members: CabinetMember[] }
  | { kind: "error"; message: string }

export function CabinetMembers({
  onUnauthorized,
}: {
  onUnauthorized: () => void
}) {
  const { t, locale } = useLanguage()
  const [state, setState] = useState<MembersState>({ kind: "loading" })
  const [approving, setApproving] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [approved, setApproved] = useState(false)
  const busy = useRef(false)
  const request = useRef<AbortController | null>(null)
  const approvalRequest = useRef<AbortController | null>(null)
  const load = useCallback(
    (signal: AbortSignal) =>
      api
        .members(signal)
        .then((members) => {
          if (!signal.aborted) setState({ kind: "ready", members })
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
                  : "Impossible de charger les demandes.",
            })
        }),
    [onUnauthorized]
  )

  useEffect(() => {
    const controller = new AbortController()
    request.current = controller
    void load(controller.signal)
    return () => {
      request.current?.abort()
      approvalRequest.current?.abort()
    }
  }, [load])

  function refresh() {
    if (busy.current) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setState({ kind: "loading" })
    setError("")
    setApproved(false)
    void load(controller.signal)
  }

  async function approve(userId: string) {
    if (busy.current) return
    busy.current = true
    setApproving(userId)
    setError("")
    setApproved(false)
    const controller = new AbortController()
    approvalRequest.current = controller
    try {
      const result = await api.approveMember(userId, controller.signal)
      if (controller.signal.aborted) return
      if (result.user_id !== userId)
        throw new Error(
          "La confirmation reçue ne correspond pas à cette demande. Actualisez les demandes."
        )
      setState((previous) =>
        previous.kind === "ready"
          ? {
              kind: "ready",
              members: previous.members.map((member) =>
                member.user_id === result.user_id
                  ? { ...member, status: result.status }
                  : member
              ),
            }
          : previous
      )
      setApproved(true)
    } catch (error) {
      if (controller.signal.aborted) return
      if (error instanceof ApiError && error.status === 401) onUnauthorized()
      else
        setError(
          error instanceof Error
            ? error.message
            : "L'approbation n'a pas pu être confirmée. Actualisez les demandes avant de réessayer."
        )
    } finally {
      busy.current = false
      if (!controller.signal.aborted) setApproving(null)
    }
  }

  const pending =
    state.kind === "ready"
      ? state.members.filter(
          (member) => member.role === "member" && member.status === "pending"
        )
      : []
  const contributors =
    state.kind === "ready"
      ? state.members.filter((member) => member.status === "active")
      : []
  return (
    <section
      className="member-requests"
      aria-labelledby="member-requests-title"
      aria-busy={approving !== null}
    >
      <div className="member-requests-heading">
        <h3 id="member-requests-title">
          <Users size={18} aria-hidden="true" />
          {t("Demandes d'accès")}
          {pending.length > 0 && (
            <span className="member-request-count">
              {pending.length.toLocaleString(locale)}
            </span>
          )}
        </h3>
        <button
          className="icon-button"
          type="button"
          aria-label={t("Actualiser les demandes")}
          title={t("Actualiser les demandes")}
          onClick={refresh}
          disabled={approving !== null || state.kind === "loading"}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <p className="member-requests-description">
        {t(
          "Approuvez les collaborateurs qui ont rejoint votre cabinet avec le code d'invitation."
        )}
      </p>
      {state.kind === "loading" ? (
        <Busy text={t("Chargement des demandes…")} />
      ) : state.kind === "error" ? (
        <Notice action={t("Réessayer")} onAction={refresh}>
          {state.message}
        </Notice>
      ) : pending.length === 0 ? (
        <p className="member-requests-empty">
          {t("Aucune demande en attente.")}
        </p>
      ) : (
        <ul className="member-request-list">
          {pending.map((member) => (
            <li key={member.user_id}>
              <div className="member-request-person">
                <strong dir="auto">
                  {member.full_name || t("Collaborateur sans nom")}
                </strong>
                <small>
                  {member.full_name ? (
                    t("En attente d'approbation")
                  ) : (
                    <bdi>{member.user_id}</bdi>
                  )}
                </small>
              </div>
              <button
                type="button"
                className="button primary"
                disabled={approving !== null}
                aria-label={`${t("Approuver")} — ${member.full_name || member.user_id}`}
                onClick={() => void approve(member.user_id)}
              >
                {approving === member.user_id ? (
                  <Busy text={t("Approbation…")} />
                ) : (
                  <>
                    <Check size={15} aria-hidden="true" />
                    {t("Approuver")}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <Notice action={t("Actualiser les demandes")} onAction={refresh}>
          {error}
        </Notice>
      )}
      {approved && (
        <Notice kind="info">
          {t(
            "Accès approuvé. Le collaborateur peut cliquer sur « Vérifier mon accès » pour entrer dans le cabinet."
          )}
        </Notice>
      )}
      {state.kind === "ready" && (
        <section
          className="cabinet-contributors"
          aria-labelledby="cabinet-contributors-title"
        >
          <h3 id="cabinet-contributors-title">
            {t("Contributeurs")}
            <span className="member-request-count">
              {contributors.length.toLocaleString(locale)}
            </span>
          </h3>
          <p className="member-requests-description">
            {t("Les membres actifs de votre cabinet.")}
          </p>
          {contributors.length === 0 ? (
            <p className="member-requests-empty">
              {t("Aucun contributeur actif.")}
            </p>
          ) : (
            <ul className="contributor-list" aria-label={t("Contributeurs")}>
              {contributors.map((member) => (
                <li key={member.user_id}>
                  <span
                    className={`contributor-icon ${member.role === "owner" ? "contributor-owner" : ""}`}
                    aria-hidden="true"
                  >
                    {member.role === "owner" ? (
                      <Crown size={17} />
                    ) : (
                      <UserRound size={17} />
                    )}
                  </span>
                  <div className="contributor-identity">
                    <strong dir="auto">
                      {member.full_name?.trim() ||
                        t("Nom complet indisponible")}
                    </strong>
                    {!member.full_name?.trim() && (
                      <small>
                        <bdi>{member.user_id}</bdi>
                      </small>
                    )}
                  </div>
                  <span
                    className={`contributor-role ${member.role === "owner" ? "contributor-owner" : ""}`}
                  >
                    {member.role === "owner"
                      ? t("Responsable du cabinet")
                      : t("Collaborateur")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  )
}

"use client"

import { LanguageSelect, useLanguage } from "@/components/language-provider"
import type { Locale } from "@/lib/translations"

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Building2,
  Calculator,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  HelpCircle,
  Landmark,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  Plus,
  Search,
  ShieldCheck,
  Settings,
} from "lucide-react"
import { api, ApiError } from "@/lib/api"
import type { Client, Message, Profile, Session } from "@/lib/contracts"
import { Auth, CabinetSetup } from "./auth"
import { Answer, Brand, Busy, Modal, Notice, ScopeNote } from "./ui"
import { MAX_DOCUMENT_BYTES } from "@/lib/contracts"
import { composeMessage, type DocumentState } from "@/lib/documents"
import { DocumentCard, UploadControl, UserText } from "./document-upload"
import { hasCompletedSubmission } from "@/lib/history"
import { CabinetSettings } from "./cabinet-settings"

type Account =
  | { kind: "loading" }
  | { kind: "guest"; error: string }
  | { kind: "ready"; profile: Profile }
const prompts = [
  {
    label: "TVA",
    title: "Clarifier une règle de TVA",
    description: "Taux, déductibilité et déclarations",
    icon: Calculator,
    prompt:
      "Quelles sont les conditions de déductibilité de la TVA au Maroc ? Précise les justificatifs nécessaires et les exceptions à vérifier.",
  },
  {
    label: "Impôt sur les sociétés",
    title: "Préparer un dossier fiscal",
    description: "Résultat fiscal et charges déductibles",
    icon: Landmark,
    prompt:
      "Comment passer du résultat comptable au résultat fiscal pour l'IS au Maroc ? Présente les principales réintégrations et déductions à examiner.",
  },
  {
    label: "Comptabilité",
    title: "Vérifier une écriture",
    description: "Comptes et traitement selon le CGNC",
    icon: FileText,
    prompt:
      "Comment comptabiliser une facture d'achat avec TVA selon le plan comptable marocain ? Donne un exemple chiffré avec les comptes débités et crédités.",
  },
  {
    label: "Lois de finances",
    title: "Comprendre une disposition",
    description: "Application et conséquences pratiques",
    icon: BookIcon,
    prompt:
      "Aide-moi à analyser une disposition de la loi de finances marocaine. Quelles informations dois-je te fournir pour préciser l'exercice, le régime fiscal et son application à mon client ?",
  },
]
function BookIcon({ size = 20 }: { size?: number }) {
  return <FileText size={size} />
}
function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Une erreur est survenue. Réessayez."
}
function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "C"
  )
}
function dateLabel(value: string, locale: Locale) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(`${locale}-MA`, {
        day: "numeric",
        month: "short",
      }).format(date)
}

export function Workspace({ initialMode = "login" }: { initialMode?: "login" | "signup" }) {
  const { t } = useLanguage()

  const [account, setAccount] = useState<Account>({ kind: "loading" })
  const reload = useCallback(async () => {
    const profile = await api.me()
    setAccount({ kind: "ready", profile })
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    api
      .me(controller.signal)
      .then((profile) => setAccount({ kind: "ready", profile }))
      .catch((err: unknown) => {
        if (!controller.signal.aborted)
          setAccount({
            kind: "guest",
            error:
              err instanceof ApiError && err.status === 401
                ? ""
                : errorText(err),
          })
      })
    return () => controller.abort()
  }, [])
  const [logoutError, setLogoutError] = useState("")
  const logout = async () => {
    try {
      await api.logout()
      setLogoutError("")
      setAccount({ kind: "guest", error: "" })
    } catch (err) {
      setLogoutError(errorText(err))
    }
  }
  if (account.kind === "loading")
    return (
      <main className="boot-screen">
        <Brand />
        <Busy text={t("Ouverture de votre espace…")} />
      </main>
    )
  if (account.kind === "guest")
    return <Auth onSuccess={reload} initialError={account.error} initialMode={initialMode} />
  return (
    <>
      {logoutError && (
        <div className="global-notice">
          <Notice>{logoutError}</Notice>
        </div>
      )}
      {account.profile.membership?.status !== "active" ? (
        <CabinetSetup
          profile={account.profile}
          reload={reload}
          logout={logout}
        />
      ) : (
        <ClientWorkspace
          profile={account.profile}
          logout={logout}
          expire={() =>
            setAccount({
              kind: "guest",
              error: t(
                "Votre session a expiré. Reconnectez-vous pour retrouver vos conversations."
              ),
            })
          }
        />
      )}
    </>
  )
}

function ClientWorkspace({
  profile,
  logout,
  expire,
}: {
  profile: Profile
  logout: () => Promise<void>
  expire: () => void
}) {
  const { t, locale } = useLanguage()

  const [clients, setClients] = useState<Client[]>([])
  const [client, setClient] = useState<Client | null>(null)
  const [clientsLoading, setClientsLoading] = useState(true)
  const [clientsError, setClientsError] = useState("")
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsError, setSessionsError] = useState("")
  const [session, setSession] = useState<Session | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState("")
  const [draft, setDraft] = useState("")
  const [attachment, setAttachment] = useState<DocumentState>({ kind: "none" })
  const [documentPreview, setDocumentPreview] = useState(false)
  const [submittedText, setSubmittedText] = useState("")
  const submittedMessageIds = useRef<Set<Message["id"]>>(new Set())
  const uploadController = useRef<AbortController | null>(null)
  const [pending, setPending] = useState(false)
  const [liveAnswer, setLiveAnswer] = useState("")
  const [streamChecking, setStreamChecking] = useState(false)
  const [blockedAnswer, setBlockedAnswer] = useState(false)
  const invocation = useRef<AbortController | null>(null)
  const [sendError, setSendError] = useState("")
  const [uncertain, setUncertain] = useState(false)
  const [unsaved, setUnsaved] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [modal, setModal] = useState<"clients" | "help" | "settings" | null>(
    null
  )
  const [clientSearch, setClientSearch] = useState("")
  const [sessionSearch, setSessionSearch] = useState("")
  const [clientName, setClientName] = useState("")
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState("")
  const [copied, setCopied] = useState<string | number | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const lock = useRef(false)
  const createLock = useRef(false)
  const epoch = useRef(0)
  const clientGeneration = useRef(0)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const reader = useRef<HTMLDivElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const mobileDialog = useRef<HTMLDialogElement>(null)
  const composedMessage = composeMessage(draft, attachment)
  const readingDocument = attachment.kind === "reading"
  useEffect(() => () => uploadController.current?.abort(), [])
  useEffect(() => () => invocation.current?.abort(), [])

  function removeDocument() {
    uploadController.current?.abort()
    setAttachment({ kind: "none" })
    setDocumentPreview(false)
  }
  async function readDocument(file: File) {
    if (lock.current || !client) return
    removeDocument()
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) {
      setAttachment({
        kind: "error",
        message: "Formats acceptés : PDF, PNG et JPEG.",
      })
      return
    }
    if (!file.size || file.size > MAX_DOCUMENT_BYTES) {
      setAttachment({
        kind: "error",
        message: file.size
          ? "Le fichier dépasse la limite de 10 Mo."
          : "Le fichier est vide.",
      })
      return
    }
    const controller = new AbortController()
    uploadController.current = controller
    const context = epoch.current
    setAttachment({ kind: "reading", filename: file.name })
    try {
      const extracted = await api.ocr(file, controller.signal)
      if (!controller.signal.aborted && context === epoch.current)
        setAttachment({ kind: "ready", document: extracted })
    } catch (err) {
      if (!controller.signal.aborted && context === epoch.current) {
        if (err instanceof ApiError && err.status === 401) expire()
        else setAttachment({ kind: "error", message: errorText(err) })
      }
    }
  }

  const handleError = useCallback(
    (err: unknown, setter: (value: string) => void) => {
      if (err instanceof ApiError && err.status === 401) expire()
      else setter(errorText(err))
    },
    [expire]
  )
  useEffect(() => {
    const controller = new AbortController()
    api
      .clients(controller.signal)
      .then((data) => {
        setClients(data)
        setClient(data[0] || null)
        setSessionsLoading(data.length > 0)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) handleError(err, setClientsError)
      })
      .finally(() => {
        if (!controller.signal.aborted) setClientsLoading(false)
      })
    return () => controller.abort()
    // The authenticated workspace is remounted on an identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const clientId = client?.id
  useEffect(() => {
    if (!clientId) return
    const controller = new AbortController()
    api
      .sessions(clientId, controller.signal)
      .then(setSessions)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) handleError(err, setSessionsError)
      })
      .finally(() => {
        if (!controller.signal.aborted) setSessionsLoading(false)
      })
    return () => controller.abort()
    // Client selection is the only trigger; event handlers manage explicit retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])
  useEffect(() => {
    if (messages.length === 0 && !pending) {
      reader.current?.scrollTo({ top: 0 })
    } else if (nearBottom.current)
      end.current?.scrollIntoView({ block: "end", behavior: "instant" })
  }, [messages, pending, liveAnswer])
  useEffect(() => {
    const element = textarea.current
    if (element) {
      element.style.height = "auto"
      element.style.height = `${Math.min(element.scrollHeight, 180)}px`
    }
  }, [draft])
  useEffect(() => {
    if (!drawer) return
    const previous = document.activeElement
    const dialog = mobileDialog.current
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [drawer])

  function resetConversation() {
    if (lock.current) return
    removeDocument()
    epoch.current++
    setSession(null)
    setMessages([])
    setLiveAnswer("")
    setBlockedAnswer(false)
    setHistoryError("")
    setHistoryLoading(false)
    setSendError("")
    setUncertain(false)
    setUnsaved(false)
    setDraft("")
    setDrawer(false)
    nearBottom.current = true
    textarea.current?.focus()
  }
  function selectClient(next: Client) {
    if (lock.current) return
    if (next.id !== client?.id) {
      clientGeneration.current++
      resetConversation()
      setClient(next)
      setSessions([])
      setSessionsLoading(true)
      setSessionsError("")
      setSessionSearch("")
    }
    setModal(null)
    setDrawer(false)
  }
  async function loadClients() {
    setClientsLoading(true)
    setClientsError("")
    try {
      const data = await api.clients()
      setClients(data)
      if (!client && data[0]) {
        setClient(data[0])
        setSessionsLoading(true)
      }
    } catch (err) {
      handleError(err, setClientsError)
    } finally {
      setClientsLoading(false)
    }
  }
  async function loadSessions() {
    if (!client) return
    const generation = clientGeneration.current
    setSessionsLoading(true)
    setSessionsError("")
    try {
      const data = await api.sessions(client.id)
      if (generation === clientGeneration.current) setSessions(data)
    } catch (err) {
      if (generation === clientGeneration.current)
        handleError(err, setSessionsError)
    } finally {
      if (generation === clientGeneration.current) setSessionsLoading(false)
    }
  }
  async function openSession(next: Session) {
    if (lock.current) return
    removeDocument()
    const current = ++epoch.current
    setSession(next)
    setMessages([])
    setLiveAnswer("")
    setBlockedAnswer(false)
    setDraft("")
    setSendError("")
    setUncertain(false)
    setUnsaved(false)
    setHistoryError("")
    setHistoryLoading(true)
    setDrawer(false)
    nearBottom.current = true
    try {
      const data = await api.messages(next.id)
      if (current === epoch.current) setMessages(data)
    } catch (err) {
      if (current === epoch.current) handleError(err, setHistoryError)
    } finally {
      if (current === epoch.current) setHistoryLoading(false)
    }
  }
  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (createLock.current) return
    createLock.current = true
    setCreateBusy(true)
    setCreateError("")
    try {
      const created = await api.createClient(clientName.trim())
      setClients((previous) =>
        [...previous, created].sort((a, b) =>
          a.name.localeCompare(b.name, "fr")
        )
      )
      selectClient(created)
      setClientName("")
    } catch (err) {
      handleError(err, setCreateError)
    } finally {
      createLock.current = false
      setCreateBusy(false)
    }
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = composedMessage
    if (
      !text ||
      text.length > 20000 ||
      !client ||
      lock.current ||
      historyLoading ||
      historyError ||
      uncertain ||
      readingDocument
    )
      return
    lock.current = true
    setPending(true)
    setLiveAnswer("")
    setStreamChecking(false)
    setBlockedAnswer(false)
    const controller = new AbortController()
    invocation.current = controller
    setSubmittedText(text)
    submittedMessageIds.current = new Set(messages.map((message) => message.id))
    setSendError("")
    nearBottom.current = true
    let currentSession = session
    let invoked = false
    try {
      if (!currentSession) {
        currentSession = await api.createSession(client.id, client.name)
        setSession(currentSession)
        setSessions((previous) =>
          [currentSession, ...previous].filter(
            (item): item is Session => item !== null
          )
        )
      }
      invoked = true
      const result = await api.invoke(
        currentSession.id,
        text,
        {
          onText: (value) => {
            if (!controller.signal.aborted) {
              setLiveAnswer(value)
              setStreamChecking(false)
            }
          },
          onChecking: () => {
            if (!controller.signal.aborted) setStreamChecking(true)
          },
        },
        controller.signal
      )
      if (controller.signal.aborted) return
      const answer = result.answer
      setBlockedAnswer(result.blocked)
      setLiveAnswer("")
      const now = new Date().toISOString()
      setMessages((previous) => [
        ...previous,
        {
          id: `local-user-${now}`,
          role: "user",
          content: text,
          created_at: now,
        },
        {
          id: `local-answer-${now}`,
          role: "assistant",
          content: answer.replace(
            /^_Response generated in [\d.]+ seconds_\s*\n?/,
            ""
          ),
          created_at: now,
        },
      ])
      setDraft("")
      removeDocument()
      setUnsaved(false)
      if (result.historySaved === false) {
        setUnsaved(true)
        return
      }
      try {
        const stored = await api.messages(currentSession.id)
        const lastUser = stored.findLastIndex(
          (message) =>
            message.role === "user" &&
            message.content === text &&
            !submittedMessageIds.current.has(message.id)
        )
        if (
          lastUser >= 0 &&
          stored
            .slice(lastUser + 1)
            .some((message) => message.role === "assistant")
        )
          setMessages(stored)
        else setUnsaved(true)
      } catch {
        setUnsaved(true)
      }
    } catch (err) {
      if (controller.signal.aborted) return
      handleError(err, setSendError)
      const ambiguous =
        invoked &&
        (!(err instanceof ApiError) || err.status === 0 || err.status >= 500)
      setUncertain(ambiguous)
    } finally {
      lock.current = false
      if (!controller.signal.aborted) {
        setPending(false)
        textarea.current?.focus()
      }
    }
  }
  async function reconcile() {
    if (!session || lock.current) return
    lock.current = true
    setHistoryLoading(true)
    setHistoryError("")
    try {
      const stored = await api.messages(session.id)
      setMessages(stored)
      if (
        hasCompletedSubmission(
          stored,
          submittedText,
          submittedMessageIds.current
        )
      ) {
        setSendError("")
        setUncertain(false)
        setLiveAnswer("")
        setUnsaved(false)
        setDraft("")
        removeDocument()
      } else {
        setSendError(
          "Aucune réponse à cet envoi n'a été retrouvée. Votre question et le texte du document restent dans la saisie. Aucun renvoi automatique n'est effectué. Vous pouvez vérifier à nouveau ou reprendre dans une nouvelle conversation."
        )
      }
    } catch (err) {
      handleError(err, setHistoryError)
    } finally {
      lock.current = false
      setHistoryLoading(false)
    }
  }
  function resumeInNewConversation() {
    if (lock.current) return
    epoch.current++
    setSession(null)
    setMessages([])
    setLiveAnswer("")
    setBlockedAnswer(false)
    setSendError("")
    setUncertain(false)
    setUnsaved(false)
    setHistoryError("")
    setHistoryLoading(false)
    nearBottom.current = true
    textarea.current?.focus()
  }
  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(message.id)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setSendError("Copie indisponible. Sélectionnez le texte pour le copier.")
    }
  }
  function choosePrompt(value: string) {
    setDraft(value)
    textarea.current?.focus()
  }

  const sidebar = (
    <>
      <div className="sidebar-brand">
        <Brand />
        <button
          className="icon-button mobile-close"
          aria-label={t("Fermer la navigation")}
          onClick={() => setDrawer(false)}
        >
          <PanelLeftClose size={20} />
        </button>
      </div>
      <div className="cabinet-label">
        <Building2 size={15} />
        <span>{profile.membership?.company_name || t("Mon cabinet")}</span>
      </div>
      <div className="sidebar-main">
        <button
          className="client-switch"
          onClick={() => {
            setModal("clients")
            setDrawer(false)
          }}
          disabled={pending || createBusy}
        >
          <span className="client-avatar">
            {client ? initials(client.name) : <Building2 size={18} />}
          </span>
          <span>
            <small>{t("Dossier client actif")}</small>
            <strong>
              {clientsLoading
                ? t("Chargement…")
                : client?.name || t("Choisir un client")}
            </strong>
          </span>
          <ChevronDown size={16} />
        </button>
        <button
          className="button sidebar-new"
          onClick={resetConversation}
          disabled={!client || pending || createBusy}
        >
          <Plus size={18} />
          {t("Nouvelle conversation")}
        </button>
        <div className="sidebar-section-heading">
          <span>{t("Conversations")}</span>
          <span>{sessions.length || ""}</span>
        </div>
        <div className="sidebar-search">
          <Search size={15} />
          <input
            aria-label={t("Rechercher une conversation")}
            value={sessionSearch}
            onChange={(event) => setSessionSearch(event.target.value)}
            placeholder={t("Rechercher…")}
          />
        </div>
        <nav
          className="session-list"
          aria-label={t("Historique des conversations")}
        >
          {sessionsLoading ? (
            <Busy text={t("Chargement…")} />
          ) : sessionsError ? (
            <Notice action={t("Réessayer")} onAction={loadSessions}>
              {sessionsError}
            </Notice>
          ) : sessions.length === 0 ? (
            <p className="sidebar-empty">
              {client
                ? t("Vos conversations pour ce client apparaîtront ici.")
                : t("Sélectionnez un client pour retrouver ses conversations.")}
            </p>
          ) : (
            sessions
              .filter((item) =>
                item.title
                  .toLocaleLowerCase("fr")
                  .includes(sessionSearch.toLocaleLowerCase("fr"))
              )
              .map((item) => (
                <button
                  key={item.id}
                  className={`session-item ${session?.id === item.id ? "active" : ""}`}
                  aria-current={session?.id === item.id ? "page" : undefined}
                  onClick={() => openSession(item)}
                  disabled={pending || createBusy}
                >
                  <MessageSquare size={15} />
                  <span>{item.title}</span>
                  <small>{dateLabel(item.created_at, locale)}</small>
                </button>
              ))
          )}
          {!sessionsLoading &&
            sessionSearch &&
            !sessions.some((item) =>
              item.title
                .toLocaleLowerCase("fr")
                .includes(sessionSearch.toLocaleLowerCase("fr"))
            ) && (
              <p className="sidebar-empty">
                {t("Aucune conversation trouvée.")}
              </p>
            )}
        </nav>
      </div>
      <div className="sidebar-footer">
        {profile.membership?.role === "owner" && (
          <button
            className="sidebar-link"
            onClick={() => {
              setModal("settings")
              setDrawer(false)
            }}
          >
            <Settings size={17} />
            {t("Paramètres du cabinet")}
            <ChevronRight size={15} />
          </button>
        )}
        <button
          className="sidebar-link"
          disabled={pending}
          onClick={() => {
            setModal("clients")
            setDrawer(false)
          }}
        >
          <Building2 size={17} />
          {t("Gérer les clients")}
          <ChevronRight size={15} />
        </button>
        <button
          className="sidebar-link"
          onClick={() => {
            setModal("help")
            setDrawer(false)
          }}
        >
          <HelpCircle size={17} />
          {t("Aide & utilisation")}
          <ChevronRight size={15} />
        </button>
        <div className="profile-row">
          <span className="profile-avatar">
            {initials(profile.full_name || t("Utilisateur"))}
          </span>
          <div>
            <strong>{profile.full_name || t("Mon compte")}</strong>
            <small>
              {profile.membership?.role === "owner"
                ? t("Responsable du cabinet")
                : t("Membre du cabinet")}
            </small>
          </div>
          <button
            className="icon-button"
            aria-label={t("Se déconnecter")}
            title={t("Se déconnecter")}
            onClick={logout}
            disabled={pending}
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </>
  )
  const visibleMessages = messages.filter(
    (message) => message.role === "user" || message.role === "assistant"
  )
  return (
    <div className="workspace">
      <a className="skip-link" href="#main-content">
        {t("Aller à la conversation")}
      </a>
      <aside
        className="sidebar desktop-sidebar"
        aria-label={t("Navigation principale")}
      >
        {sidebar}
      </aside>
      {drawer && (
        <dialog
          ref={mobileDialog}
          className="mobile-drawer sidebar"
          aria-label={t("Navigation principale")}
          onCancel={(event) => {
            event.preventDefault()
            setDrawer(false)
          }}
        >
          {sidebar}
        </dialog>
      )}
      <div className="workspace-main">
        <header className="workspace-header">
          <div className="header-location">
            <button
              className="icon-button mobile-menu"
              aria-label={t("Ouvrir la navigation")}
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
            >
              <Menu size={21} />
            </button>
            <span className="header-section">{t("Espace de travail")}</span>
            <ChevronRight size={14} />
            <strong>{client?.name || t("Assistant comptable")}</strong>
          </div>
          <div className="header-meta">
            <LanguageSelect />
            <span className="jurisdiction">{t("Maroc")}</span>
            <span className="header-divider" />
            <span className="header-version">
              Accountant AI <span>v3</span>
            </span>
          </div>
        </header>
        <main id="main-content" className="assistant-main">
          <div className="conversation-heading">
            <div>
              <span className="small-assistant-mark" aria-hidden="true">
                a
              </span>
              <div>
                <h1>{t("Assistant comptable")}</h1>
                <p>
                  {client ? (
                    <>
                      {t("Dossier")} <strong dir="auto">{client.name}</strong>
                    </>
                  ) : (
                    t("Votre partenaire de réflexion comptable et fiscale")
                  )}
                </p>
              </div>
            </div>
            <span className="context-tag">
              <ShieldCheck size={14} />
              {client ? t("Contexte client") : t("Espace cabinet")}
            </span>
          </div>
          <div
            ref={reader}
            className="conversation-reader"
            onScroll={() => {
              const node = reader.current
              if (node) {
                nearBottom.current =
                  node.scrollHeight - node.scrollTop - node.clientHeight < 100
                setScrolled(!nearBottom.current)
              }
            }}
          >
            {clientsError && (
              <div className="reader-notice">
                <Notice action={t("Réessayer")} onAction={loadClients}>
                  {clientsError}
                </Notice>
              </div>
            )}
            {historyLoading ? (
              <div className="history-loading">
                <Busy text={t("Chargement de la conversation…")} />
              </div>
            ) : historyError ? (
              <div className="reader-notice">
                <Notice
                  action={t("Recharger l'historique")}
                  onAction={() => {
                    if (uncertain) void reconcile()
                    else if (session) void openSession(session)
                  }}
                >
                  {historyError}
                </Notice>
              </div>
            ) : visibleMessages.length === 0 && !pending && !liveAnswer ? (
              <section className="welcome">
                <div className="welcome-symbol" aria-hidden="true">
                  <span className="ledger-line" />
                  <span className="ledger-line" />
                  <span className="ledger-line" />
                  <span className="ledger-cross" />
                </div>
                <p className="welcome-greeting">
                  {t("Votre expertise, bien accompagnée.")}
                </p>
                <h2>
                  {t("Un dossier. Une question.")}
                  <br />
                  {t("Une réponse plus claire.")}
                </h2>
                <p className="welcome-description">
                  {t(
                    "Explorez une règle fiscale, vérifiez une écriture ou préparez votre analyse. Commençons par votre question."
                  )}
                </p>
                {!clientsLoading && !client && (
                  <div className="first-client">
                    <p>
                      {t(
                        "Ajoutez votre premier client pour ouvrir une conversation."
                      )}
                    </p>
                    <button
                      className="button primary"
                      onClick={() => setModal("clients")}
                    >
                      <Plus size={17} />
                      {t("Ajouter un client")}
                    </button>
                  </div>
                )}
                <div className="prompt-grid">
                  {prompts.map((prompt) => (
                    <button
                      className="prompt-card"
                      key={prompt.label}
                      onClick={() => choosePrompt(t(prompt.prompt))}
                      disabled={!client || pending}
                    >
                      <span className="prompt-top">
                        <span className="prompt-icon">
                          <prompt.icon size={19} />
                        </span>
                        <span>{t(prompt.label)}</span>
                        <ArrowUpRightIcon />
                      </span>
                      <strong>{t(prompt.title)}</strong>
                      <span className="prompt-description">
                        {t(prompt.description)}
                      </span>
                    </button>
                  ))}
                </div>
                <ScopeNote />
              </section>
            ) : (
              <div
                className="message-list"
                role="log"
                aria-label={t("Messages de la conversation")}
                aria-live="polite"
                aria-relevant="additions"
                aria-busy={pending}
              >
                {visibleMessages.map((message) => (
                  <article
                    className={`message message-${message.role}`}
                    key={message.id}
                  >
                    <div className="message-label">
                      {message.role === "assistant" ? (
                        <>
                          <span className="message-agent-mark">a</span>
                          <strong>Accountant AI</strong>
                        </>
                      ) : (
                        <>
                          <span className="message-user-mark">
                            {initials(profile.full_name || t("Vous"))}
                          </span>
                          <strong>{t("Vous")}</strong>
                        </>
                      )}
                    </div>
                    <div className="message-content">
                      {message.role === "assistant" ? (
                        <Answer content={message.content} />
                      ) : (
                        <UserText content={message.content} />
                      )}
                      {message.role === "assistant" && (
                        <button
                          className="copy-button"
                          aria-label={t("Copier la réponse")}
                          onClick={() => copyMessage(message)}
                        >
                          {copied === message.id ? (
                            <Check size={14} />
                          ) : (
                            <Copy size={14} />
                          )}
                          {copied === message.id ? t("Copié") : t("Copier")}
                        </button>
                      )}
                    </div>
                  </article>
                ))}
                {(pending || (uncertain && !!liveAnswer)) && (
                  <article className="message message-user">
                    <div className="message-label">
                      <span className="message-user-mark">
                        {initials(profile.full_name || t("Vous"))}
                      </span>
                      <strong>{t("Vous")}</strong>
                    </div>
                    <div className="message-content">
                      <UserText content={submittedText} />
                    </div>
                  </article>
                )}
                {(pending || !!liveAnswer) && (
                  <article className="message message-pending">
                    <div className="message-label">
                      <span className="message-agent-mark">a</span>
                      <strong>Accountant AI</strong>
                    </div>
                    <div className="message-content">
                      {liveAnswer && (
                        <div className="streaming-answer" aria-live="off">
                          <Answer content={liveAnswer} />
                        </div>
                      )}
                      <div className="stream-status" role="status">
                        {pending ? (
                          <Busy
                            text={t(
                              liveAnswer
                                ? "Réponse en cours…"
                                : streamChecking
                                  ? "Vérification de la demande…"
                                  : "Préparation de la réponse…"
                            )}
                          />
                        ) : (
                          t(
                            "Réponse interrompue — contenu partiel non confirmé."
                          )
                        )}
                      </div>
                    </div>
                  </article>
                )}
                {unsaved && (
                  <Notice kind="info">
                    {t(
                      "La réponse est affichée, mais son enregistrement dans l'historique n'a pas pu être confirmé. Elle peut disparaître au rechargement."
                    )}
                  </Notice>
                )}
                {blockedAnswer && (
                  <Notice kind="info">
                    {t(
                      "Cette demande a été arrêtée par le contrôle de sujet avant la génération de la réponse."
                    )}
                  </Notice>
                )}
              </div>
            )}
            {sendError && (
              <div className="reader-notice">
                <Notice
                  action={uncertain ? t("Vérifier l'historique") : undefined}
                  onAction={reconcile}
                >
                  {sendError}
                  {uncertain && (
                    <>
                      <p>
                        {t(
                          "La réponse n'a pas été confirmée. Vérifiez l'historique avant de reprendre votre question."
                        )}
                      </p>
                      <button
                        type="button"
                        className="text-button"
                        disabled={historyLoading}
                        onClick={resumeInNewConversation}
                      >
                        {t("Reprendre dans une nouvelle conversation")}
                      </button>
                    </>
                  )}
                </Notice>
              </div>
            )}
            <div ref={end} className="conversation-end" />
          </div>
          {scrolled && (
            <button
              className="scroll-bottom icon-button"
              aria-label={t("Aller au dernier message")}
              onClick={() => {
                nearBottom.current = true
                end.current?.scrollIntoView({
                  behavior: "instant",
                  block: "end",
                })
              }}
            >
              <ArrowDown size={18} />
            </button>
          )}
          <div className="composer-area">
            <form className="composer" onSubmit={send}>
              <DocumentCard
                state={attachment}
                onRemove={removeDocument}
                onPreview={() => setDocumentPreview(true)}
                disabled={pending}
              />
              <label htmlFor="message-input" className="sr-only">
                {t("Votre question comptable ou fiscale")}
              </label>
              <textarea
                dir="auto"
                ref={textarea}
                id="message-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  client
                    ? t("Posez votre question comptable ou fiscale…")
                    : t("Sélectionnez un client pour commencer…")
                }
                disabled={
                  !client ||
                  pending ||
                  historyLoading ||
                  !!historyError ||
                  uncertain
                }
                maxLength={20000}
                rows={2}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing &&
                    window.matchMedia("(min-width: 768px)").matches
                  ) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
              />
              <div className="composer-bottom">
                <div className="composer-tools">
                  <UploadControl
                    disabled={
                      !client ||
                      pending ||
                      readingDocument ||
                      historyLoading ||
                      !!historyError ||
                      uncertain
                    }
                    onSelect={readDocument}
                  />
                  <span className="composer-context">
                    <Building2 size={14} />
                    <span>{client?.name || t("Aucun client sélectionné")}</span>
                  </span>
                </div>
                <div className="composer-actions">
                  <span className="keyboard-hint">
                    {t("Maj + Entrée pour un saut de ligne")}
                  </span>
                  {composedMessage.length > 18000 && (
                    <span className="character-count">
                      {composedMessage.length.toLocaleString(locale)}/
                      {(20000).toLocaleString(locale)}
                    </span>
                  )}
                  <button
                    className="send-button"
                    type="submit"
                    aria-label={t("Envoyer le message")}
                    disabled={
                      !composedMessage.trim() ||
                      composedMessage.length > 20000 ||
                      readingDocument ||
                      !client ||
                      pending ||
                      historyLoading ||
                      !!historyError ||
                      uncertain
                    }
                  >
                    {pending ? (
                      <span className="pending-square" />
                    ) : (
                      <ArrowUp size={20} />
                    )}
                  </button>
                </div>
              </div>
            </form>
            {composedMessage.length > 20000 && (
              <p className="document-length-error" role="alert">
                {t(
                  "Le message et le document dépassent 20 000 caractères. Raccourcissez la question ou retirez le document."
                )}
              </p>
            )}
            <p className="composer-disclaimer">
              {t(
                "L'IA peut commettre des erreurs. Vérifiez les réponses et les textes applicables avant toute décision."
              )}
            </p>
          </div>
        </main>
      </div>
      {documentPreview && attachment.kind === "ready" && (
        <Modal
          title={t("Texte extrait du document")}
          description={attachment.document.filename}
          onClose={() => setDocumentPreview(false)}
          wide
        >
          <p className="document-preview-note">
            {t(
              "Vérifiez le texte avant de l'envoyer. Il sera transmis avec votre question lors du prochain envoi."
            )}
          </p>
          <label>
            {t("Texte extrait")}
            <textarea
              className="document-preview-text"
              aria-label={t("Texte extrait du document")}
              value={attachment.document.text}
              readOnly
              rows={12}
            />
          </label>
          <button
            type="button"
            className="button primary document-preview-done"
            onClick={() => setDocumentPreview(false)}
          >
            {t("Revenir à ma question")}
          </button>
        </Modal>
      )}
      {modal === "settings" && (
        <CabinetSettings
          onClose={() => setModal(null)}
          onUnauthorized={expire}
        />
      )}
      {modal === "clients" && (
        <Modal
          title={t("Vos dossiers clients")}
          description={t(
            "Sélectionnez un client ou ajoutez un nouveau dossier."
          )}
          onClose={() => {
            if (!createBusy) setModal(null)
          }}
          wide
        >
          <div className="client-manager">
            <label className="search-field">
              <Search size={17} />
              <input
                aria-label={t("Rechercher un client")}
                placeholder={t("Rechercher un client…")}
                value={clientSearch}
                onChange={(event) => setClientSearch(event.target.value)}
              />
            </label>
            {clientsError && (
              <Notice action={t("Réessayer")} onAction={loadClients}>
                {clientsError}
              </Notice>
            )}
            <div className="client-list">
              {clientsLoading ? (
                <Busy />
              ) : clients.length === 0 ? (
                <div className="client-empty">
                  <Building2 size={26} />
                  <p>{t("Votre premier dossier commence ici.")}</p>
                  <span>{t("Ajoutez le nom de votre client ci-dessous.")}</span>
                </div>
              ) : (
                clients
                  .filter((item) =>
                    item.name
                      .toLocaleLowerCase("fr")
                      .includes(clientSearch.toLocaleLowerCase("fr"))
                  )
                  .map((item) => (
                    <button
                      key={item.id}
                      className={`client-option ${client?.id === item.id ? "selected" : ""}`}
                      onClick={() => selectClient(item)}
                      disabled={createBusy || pending}
                    >
                      <span className="client-avatar">
                        {initials(item.name)}
                      </span>
                      <strong>{item.name}</strong>
                      {client?.id === item.id ? (
                        <Check size={18} />
                      ) : (
                        <ChevronRight size={18} />
                      )}
                    </button>
                  ))
              )}
              {clients.length > 0 &&
                !clients.some((item) =>
                  item.name
                    .toLocaleLowerCase("fr")
                    .includes(clientSearch.toLocaleLowerCase("fr"))
                ) && (
                  <p className="muted">
                    {t("Aucun client ne correspond à votre recherche.")}
                  </p>
                )}
            </div>
            <form
              className="new-client-form form-stack"
              onSubmit={createClient}
            >
              <h3>{t("Nouveau dossier client")}</h3>
              <label>
                {t("Nom du client")}
                <input
                  value={clientName}
                  onChange={(event) => setClientName(event.target.value)}
                  name="client-name"
                  placeholder={t("Ex. Atlas Conseil SARL")}
                  minLength={2}
                  maxLength={120}
                  required
                  disabled={createBusy}
                />
              </label>
              {createError && (
                <Notice
                  action={t("Actualiser les clients")}
                  onAction={loadClients}
                >
                  {createError}
                </Notice>
              )}
              <button
                className="button primary"
                disabled={createBusy || pending || clientName.trim().length < 2}
              >
                {createBusy ? (
                  <Busy text={t("Création…")} />
                ) : (
                  <>
                    <Plus size={17} />
                    {t("Ajouter le client")}
                  </>
                )}
              </button>
            </form>
          </div>
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title={t("Un espace pour votre pratique")}
          onClose={() => setModal(null)}
        >
          <div className="help-content">
            <p>
              {t(
                "Sélectionnez un client, ouvrez une conversation et posez votre question en précisant l'exercice et les faits utiles."
              )}
            </p>
            <h3>{t("Des conversations par dossier")}</h3>
            <p>
              {t(
                "Chaque conversation appartient au client sélectionné. L'historique provient de votre cabinet et reste soumis aux droits d'accès du serveur."
              )}
            </p>
            <h3>{t("Des réponses à vérifier")}</h3>
            <p>
              {t(
                "Les références affichées font partie des réponses reçues. Vérifiez leur pertinence, leur date et les textes applicables à votre situation."
              )}
            </p>
            <h3>{t("Documents")}</h3>
            <p>
              {t(
                "Utilisez l'icône document près de la zone de saisie pour joindre un PDF, PNG ou JPEG de 10 Mo maximum. Vérifiez le texte extrait, puis envoyez votre question. Les PDF doivent contenir du texte lisible, avec un maximum de 20 pages. Pour un PDF scanné, importez les pages en images. Le fichier est temporaire ; seul le texte envoyé avec votre question rejoint la conversation."
              )}
            </p>
            <h3>{t("Votre session")}</h3>
            <p>
              {t(
                "Le bouton de déconnexion ferme l'accès sur ce navigateur. Pour réinitialiser votre mot de passe, utilisez « Mot de passe oublié » sur l'écran de connexion."
              )}
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}
function ArrowUpRightIcon() {
  return <ArrowRight className="prompt-arrow" size={16} aria-hidden="true" />
}

"use client"

import { LanguageSelect, useLanguage } from "@/components/language-provider"

import { useRef, useState, type FormEvent } from "react"
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react"
import { api } from "@/lib/api"
import type { Profile } from "@/lib/contracts"
import { Brand, Busy, Notice, ScopeNote } from "./ui"

export function Auth({
  onSuccess,
  initialError = "",
  initialMode = "login",
}: {
  onSuccess: () => Promise<void>
  initialError?: string
  initialMode?: "login" | "signup"
}) {
  const { t } = useLanguage()

  const [mode, setMode] = useState<"login" | "signup" | "forgot">(initialMode)
  const [busy, setBusy] = useState(false)
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState(initialError)
  const [notice, setNotice] = useState("")
  const lock = useRef(false)
  function change(next: typeof mode) {
    setMode(next)
    setError("")
    setNotice("")
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError("")
    setNotice("")
    const data = new FormData(event.currentTarget)
    const email = String(data.get("email") || "").trim()
    try {
      if (mode === "forgot") {
        await api.forgot(email)
        setNotice(
          "Si cette adresse possède un compte, un lien de réinitialisation a été envoyé. Consultez aussi vos courriers indésirables."
        )
      } else if (mode === "signup") {
        await api.signup({
          email,
          password: data.get("password"),
          full_name: String(data.get("full_name") || "").trim(),
        })
        setMode("login")
        setNotice(
          "Compte créé. Confirmez votre adresse e-mail si demandé, puis connectez-vous."
        )
      } else {
        await api.login({ email, password: data.get("password") })
        await onSuccess()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.")
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-language">
        <LanguageSelect />
      </div>
      <section className="auth-story">
        <Brand />
        <div className="auth-editorial">
          <span className="editorial-rule" />
          <p className="auth-audience">{t("L'espace des fiduciaires")}</p>
          <h1>
            {t("La précision comptable.")}
            <br />
            {t("La clarté en plus.")}
          </h1>
          <p>
            {t(
              "Un espace de travail pour vos dossiers clients et vos questions de comptabilité et de fiscalité marocaines."
            )}
          </p>
          <div className="auth-topics">
            <span>{t("TVA & IS")}</span>
            <span>{t("Écritures comptables")}</span>
            <span>{t("Lois de finances")}</span>
          </div>
        </div>
        <div className="auth-bottom">
          <span>{t("Conçu pour la pratique marocaine")}</span>
          <span className="morocco-mark" aria-label={t("Maroc")}>
            MA
          </span>
        </div>
      </section>
      <section className="auth-content">
        <div className="auth-mobile-brand">
          <Brand compact />
        </div>
        <div className="auth-form-wrap">
          <span className="auth-icon">
            <LockKeyhole size={23} strokeWidth={1.5} />
          </span>
          <h2>
            {mode === "login"
              ? t("Retrouvez votre espace.")
              : mode === "signup"
                ? t("Créez votre compte.")
                : t("Un nouveau départ.")}
          </h2>
          <p className="form-intro">
            {mode === "login"
              ? t("Connectez-vous pour accéder à vos dossiers clients.")
              : mode === "signup"
                ? t("Votre cabinet et vos conversations, au même endroit.")
                : t("Recevez un lien pour réinitialiser votre mot de passe.")}
          </p>
          {mode !== "forgot" && (
            <div className="auth-tabs" aria-label={t("Accès au compte")}>
              <button
                aria-pressed={mode === "login"}
                onClick={() => change("login")}
                disabled={busy}
              >
                {t("Connexion")}
              </button>
              <button
                aria-pressed={mode === "signup"}
                onClick={() => change("signup")}
                disabled={busy}
              >
                {t("Créer un compte")}
              </button>
            </div>
          )}
          <form onSubmit={submit} className="form-stack">
            {mode === "signup" && (
              <label>
                {t("Nom complet")}
                <input
                  name="full_name"
                  autoComplete="name"
                  placeholder={t("Votre nom et prénom")}
                  minLength={2}
                  maxLength={80}
                  required
                  disabled={busy}
                />
              </label>
            )}
            <label>
              {t("Adresse e-mail professionnelle")}
              <input
                name="email"
                dir="ltr"
                type="email"
                autoComplete="email"
                placeholder="vous@cabinet.ma"
                required
                disabled={busy}
              />
            </label>
            {mode !== "forgot" && (
              <label>
                {t("Mot de passe")}
                <div className="password-field">
                  <input
                    name="password"
                    type={visible ? "text" : "password"}
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    placeholder={
                      mode === "signup"
                        ? t("8 caractères minimum")
                        : t("Votre mot de passe")
                    }
                    minLength={mode === "signup" ? 8 : 1}
                    maxLength={72}
                    required
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={
                      visible
                        ? t("Masquer le mot de passe")
                        : t("Afficher le mot de passe")
                    }
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
            )}
            {mode === "login" && (
              <button
                className="text-button forgot-button"
                type="button"
                onClick={() => change("forgot")}
                disabled={busy}
              >
                {t("Mot de passe oublié ?")}
              </button>
            )}
            {error && <Notice>{error}</Notice>}
            {notice && <Notice kind="info">{notice}</Notice>}
            <button className="button primary auth-submit" disabled={busy}>
              {busy ? (
                <Busy text={t("Veuillez patienter…")} />
              ) : (
                <>
                  {mode === "login"
                    ? t("Se connecter")
                    : mode === "signup"
                      ? t("Créer mon compte")
                      : t("Envoyer le lien")}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
            {mode === "forgot" && (
              <button
                type="button"
                className="text-button"
                onClick={() => change("login")}
                disabled={busy}
              >
                {t("Revenir à la connexion")}
              </button>
            )}
          </form>
          <p className="auth-security">
            <ShieldCheck size={16} />
            {t("Votre accès est rattaché à votre cabinet.")}
          </p>
        </div>
        <ScopeNote />
      </section>
    </main>
  )
}

export function CabinetSetup({
  profile,
  reload,
  logout,
}: {
  profile: Profile
  reload: () => Promise<void>
  logout: () => void
}) {
  const { t } = useLanguage()

  const [join, setJoin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const lock = useRef(false)
  const pending = profile.membership?.status === "pending"
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError("")
    const value = String(
      new FormData(event.currentTarget).get("value") || ""
    ).trim()
    try {
      await api.company(
        join ? { join_code: value } : { company_name: value },
        join
      )
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opération impossible.")
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <main className="setup-page">
      <div className="auth-language">
        <LanguageSelect />
      </div>
      <Brand />
      <section className="setup-card">
        <span className="auth-icon">
          <ShieldCheck size={25} />
        </span>
        <h1>
          {pending
            ? t("Votre demande a été envoyée.")
            : t("Bienvenue dans votre cabinet.")}
        </h1>
        <p>
          {pending
            ? t(
                "Le responsable du cabinet doit approuver votre accès. Vous pourrez ensuite retrouver vos dossiers clients."
              )
            : t(
                "Créez votre cabinet ou rejoignez-en un avec le code transmis par son responsable."
              )}
        </p>
        {error && <Notice>{error}</Notice>}
        {pending ? (
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await reload()
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : t("Vérification impossible.")
                )
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Busy /> : t("Vérifier mon accès")}
          </button>
        ) : (
          <>
            <div className="auth-tabs">
              <button
                onClick={() => setJoin(false)}
                aria-pressed={!join}
                disabled={busy}
              >
                {t("Créer un cabinet")}
              </button>
              <button
                onClick={() => setJoin(true)}
                aria-pressed={join}
                disabled={busy}
              >
                {t("Rejoindre un cabinet")}
              </button>
            </div>
            <form onSubmit={submit} className="form-stack">
              <label>
                {join ? t("Code du cabinet") : t("Nom du cabinet")}
                <input
                  key={String(join)}
                  name="value"
                  required
                  minLength={join ? 4 : 2}
                  maxLength={join ? 16 : 60}
                  placeholder={
                    join
                      ? t("Code transmis par le responsable")
                      : t("Ex. Fiduciaire Atlas")
                  }
                  disabled={busy}
                />
              </label>
              <button className="button primary" disabled={busy}>
                {busy ? (
                  <Busy />
                ) : join ? (
                  t("Demander à rejoindre")
                ) : (
                  t("Créer mon cabinet")
                )}
              </button>
            </form>
          </>
        )}
        <button className="text-button" disabled={busy} onClick={logout}>
          {t("Se déconnecter")}
        </button>
      </section>
    </main>
  )
}

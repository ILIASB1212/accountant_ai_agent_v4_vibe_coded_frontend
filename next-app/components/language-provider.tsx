"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { ChevronDown, Globe2 } from "lucide-react"
import { parseLocale, translate, type Locale } from "@/lib/translations"

type LanguageContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (text: string) => string
}
const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale
  children: ReactNode
}) {
  const [locale, updateLocale] = useState(initialLocale)
  const setLocale = useCallback((next: Locale) => {
    updateLocale(next)
    document.cookie = `accountant-language=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`
  }, [])
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr"
    document.title = translate("Accountant AI | Votre espace comptable", locale)
  }, [locale])
  const t = useCallback((text: string) => translate(text, locale), [locale])
  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  )
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const value = useContext(LanguageContext)
  if (!value) throw new Error("LanguageProvider is required")
  return value
}

export function LanguageSelect() {
  const { locale, setLocale, t } = useLanguage()
  return (
    <label className="language-select">
      <Globe2 size={15} aria-hidden="true" />
      <span className="sr-only">{t("Langue")}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(parseLocale(event.target.value))}
        aria-label={t("Langue")}
      >
        <option value="fr" lang="fr">
          Français
        </option>
        <option value="en" lang="en">
          English
        </option>
        <option value="ar" lang="ar">
          العربية
        </option>
      </select>
      <ChevronDown size={12} aria-hidden="true" />
    </label>
  )
}

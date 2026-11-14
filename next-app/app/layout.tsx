import type { Metadata, Viewport } from "next"
import { cookies } from "next/headers"
import { LanguageProvider } from "@/components/language-provider"
import { parseLocale, translate } from "@/lib/translations"
import "./globals.css"

export async function generateMetadata(): Promise<Metadata> {
  const locale = parseLocale(
    (await cookies()).get("accountant-language")?.value
  )
  return {
    title: translate("Accountant AI | Votre espace comptable", locale),
    description: translate(
      "L'espace de travail des professionnels de la comptabilité et de la fiscalité marocaines.",
      locale
    ),
    robots: { index: false, follow: false },
  }
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = parseLocale(
    (await cookies()).get("accountant-language")?.value
  )
  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <body>
        <LanguageProvider initialLocale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  )
}

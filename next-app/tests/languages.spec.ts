import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

const fixture = "http://127.0.0.1:8101"
async function login(page: Page) {
  await page.goto("/")
  await page
    .getByLabel("Adresse e-mail professionnelle")
    .fill("salma@example.com")
  await page.getByLabel("Mot de passe", { exact: true }).fill("test-password")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Assistant comptable" })
  ).toBeVisible()
}
test.beforeEach(async ({ request }) => {
  await request.post(`${fixture}/test/reset`, { data: { mode: "active" } })
})

test("language selector translates authentication, errors and recovery flows", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByRole("combobox", { name: "Langue" }).selectOption("en")
  await expect(
    page.getByRole("heading", { name: "Welcome back." })
  ).toBeVisible()
  await expect(page).toHaveTitle("Accountant AI | Your accounting workspace")
  await page.getByLabel("Work email address").fill("salma@example.com")
  await page.getByLabel("Password", { exact: true }).fill("wrong")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.locator(".notice-error")).toContainText(
    "Incorrect credentials"
  )
  await page.getByRole("combobox", { name: "Language" }).selectOption("ar")
  await expect(page.locator(".notice-error")).toContainText(
    "بيانات الدخول غير صحيحة"
  )
  await page.getByRole("button", { name: "نسيتم كلمة المرور؟" }).click()
  await expect(
    page.getByRole("heading", { name: "بداية جديدة." })
  ).toBeVisible()
  await page.getByRole("button", { name: "إرسال الرابط" }).click()
  await expect(page.locator(".notice-info")).toContainText("رابط إعادة التعيين")
  await page.getByRole("button", { name: "العودة إلى تسجيل الدخول" }).click()
  await page.getByRole("button", { name: "إنشاء حساب", exact: true }).click()
  await expect(page.getByLabel("الاسم الكامل")).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: "test-results/language-arabic-auth-mobile.png",
    fullPage: true,
    animations: "disabled",
  })
})

test("switching workspace language preserves drafts, attachment and client context", async ({
  page,
}) => {
  await login(page)
  const draft = page.getByRole("textbox", {
    name: "Votre question comptable ou fiscale",
  })
  await draft.fill("Question inchangée — سؤال محفوظ")
  await page.getByLabel("Fichier PDF ou image à lire").setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from("fixture-image"),
  })
  await expect(
    page.getByRole("button", { name: "Texte extrait · Voir avant envoi" })
  ).toBeVisible()
  await page.getByRole("combobox", { name: "Langue" }).selectOption("en")
  await expect(
    page.getByRole("heading", { name: "Accounting assistant" })
  ).toBeVisible()
  await expect(
    page.getByRole("textbox", { name: "Your accounting or tax question" })
  ).toHaveValue("Question inchangée — سؤال محفوظ")
  await expect(
    page.getByRole("button", { name: "Extracted text · Review before sending" })
  ).toBeVisible()
  await expect(page.locator(".composer-context")).toContainText(
    "Atlas Conseil SARL"
  )
  await page.screenshot({
    path: "test-results/language-english-desktop.png",
    fullPage: true,
    animations: "disabled",
  })
  await page.getByRole("combobox", { name: "Language" }).selectOption("ar")
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  await expect(
    page.getByRole("heading", { name: "المساعد المحاسبي" })
  ).toBeVisible()
  await expect(
    page.getByRole("textbox", { name: "سؤالكم المحاسبي أو الضريبي" })
  ).toHaveValue("Question inchangée — سؤال محفوظ")
  await page.screenshot({
    path: "test-results/language-arabic-desktop.png",
    fullPage: true,
    animations: "disabled",
  })
  await page.getByRole("button", { name: "إزالة المستند" }).click()
  await page
    .getByRole("button", { name: /توضيح قاعدة ضريبة القيمة المضافة/ })
    .click()
  await expect(
    page.getByRole("textbox", { name: "سؤالكم المحاسبي أو الضريبي" })
  ).toHaveValue(/ما شروط خصم الضريبة/)
  await page.getByRole("combobox", { name: "اللغة" }).selectOption("fr")
  await expect(
    page.getByRole("textbox", { name: "Votre question comptable ou fiscale" })
  ).toHaveValue(/ما شروط خصم الضريبة/)
})

test("language preference survives reload and is rendered by the server", async ({
  page,
  context,
}) => {
  await page.goto("/")
  await page.getByRole("combobox", { name: "Langue" }).selectOption("ar")
  await page.reload()
  await expect(page.locator("html")).toHaveAttribute("lang", "ar")
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  await expect(page.getByRole("combobox", { name: "اللغة" })).toHaveValue("ar")
  const response = await page.request.get("/")
  expect(await response.text()).toContain('<html lang="ar" dir="rtl"')
  await context.addCookies([
    {
      name: "accountant-language",
      value: "invalid",
      url: "http://localhost:3100",
    },
  ])
  await page.reload()
  await expect(page.locator("html")).toHaveAttribute("lang", "fr")
  await expect(
    page.getByRole("heading", { name: "Retrouvez votre espace." })
  ).toBeVisible()
})

test("Arabic mobile navigation and settings fit and pass accessibility checks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.getByRole("combobox", { name: "Langue" }).selectOption("ar")
  await expect(
    page.getByRole("button", { name: "إرسال الرسالة" })
  ).toBeInViewport()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: "test-results/language-arabic-mobile.png",
    fullPage: true,
    animations: "disabled",
  })
  await page.getByRole("button", { name: "فتح قائمة التنقل" }).click()
  const drawer = page.getByRole("dialog", { name: "التنقل الرئيسي" })
  const bounds = await drawer.boundingBox()
  expect(bounds?.x).toBeGreaterThan(50)
  await page
    .getByRole("button", { name: "إعدادات المكتب", exact: true })
    .click()
  await expect(
    page.getByRole("textbox", { name: "رمز الدعوة", exact: true })
  ).toHaveValue("ATLAS1234")
  await expect(
    page.getByRole("textbox", { name: "رمز الدعوة", exact: true })
  ).toHaveAttribute("dir", "ltr")
  await page.getByRole("dialog").evaluate(async (node) => {
    await Promise.all(
      node.getAnimations().map((animation) => animation.finished)
    )
  })
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  ).toEqual([])
  await page.screenshot({
    path: "test-results/language-arabic-settings-mobile.png",
    fullPage: true,
    animations: "disabled",
  })
  await page.keyboard.press("Escape")
  await expect(
    page.getByRole("button", { name: "فتح قائمة التنقل" })
  ).toBeFocused()
})

test("language switch leaves server-provided history and answer content unchanged", async ({
  page,
}) => {
  await login(page)
  await page
    .getByRole("button", { name: /Traitement comptable des achats/ })
    .click()
  const answer = page.locator(".answer").first()
  await expect(answer).toBeVisible()
  const text = await answer.textContent()
  await page.getByRole("combobox", { name: "Langue" }).selectOption("en")
  await expect(answer).toHaveText(text || "")
  await expect(page.getByRole("button", { name: "Copy answer" })).toBeVisible()
  await page.getByRole("combobox", { name: "Language" }).selectOption("ar")
  await expect(answer).toHaveText(text || "")
  await expect(
    page.getByRole("button", { name: /Traitement comptable des achats/ })
  ).toBeVisible()
  await expect(answer).toHaveAttribute("dir", "auto")
})

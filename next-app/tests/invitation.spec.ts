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

test("owner can find, copy and refresh the cabinet invite code", async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await login(page)
  await page
    .getByRole("button", { name: "Paramètres du cabinet", exact: true })
    .click()
  await expect(
    page.getByRole("textbox", { name: "Code d'invitation", exact: true })
  ).toHaveValue("ATLAS1234")
  await page
    .getByRole("button", { name: "Copier le code", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Code copié", exact: true })
  ).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "ATLAS1234"
  )
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
    path: "test-results/invitation-desktop.png",
    fullPage: true,
    animations: "disabled",
  })
  await request.post(`${fixture}/test/reset`, {
    data: { mode: "active", joinCode: "NEWCODE42" },
  })
  await page
    .getByRole("button", { name: "Actualiser le code", exact: true })
    .click()
  await expect(
    page.getByRole("textbox", { name: "Code d'invitation", exact: true })
  ).toHaveValue("NEWCODE42")
})

test("members cannot access owner invitation settings", async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/test/reset`, { data: { mode: "member" } })
  await login(page)
  await expect(
    page.getByRole("button", { name: "Paramètres du cabinet", exact: true })
  ).toHaveCount(0)
  await expect(page.getByText("ATLAS1234", { exact: true })).toHaveCount(0)
})

test("mobile navigation opens readable invitation settings and restores focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.getByRole("button", { name: "Ouvrir la navigation" }).click()
  await page
    .getByRole("button", { name: "Paramètres du cabinet", exact: true })
    .click()
  await expect(
    page.getByRole("dialog", { name: "Navigation principale" })
  ).toHaveCount(0)
  await expect(
    page.getByRole("textbox", { name: "Code d'invitation", exact: true })
  ).toHaveValue("ATLAS1234")
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await expect(
    page.getByRole("button", { name: "Copier le code", exact: true })
  ).toBeInViewport()
  await page.screenshot({
    path: "test-results/invitation-mobile.png",
    fullPage: true,
    animations: "disabled",
  })
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Ouvrir la navigation" })
  ).toBeFocused()
})

test("missing code is recoverable and clipboard failure permits manual copy", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: () => Promise.reject(new Error("Clipboard unavailable")),
      },
      configurable: true,
    })
  })
  await request.post(`${fixture}/test/reset`, {
    data: { mode: "no-invite-code" },
  })
  await login(page)
  await page
    .getByRole("button", { name: "Paramètres du cabinet", exact: true })
    .click()
  await expect(page.locator(".notice-error")).toContainText(
    "n'est pas disponible"
  )
  await request.post(`${fixture}/test/reset`, { data: { mode: "active" } })
  await page.getByRole("button", { name: "Réessayer", exact: true }).click()
  const input = page.getByRole("textbox", {
    name: "Code d'invitation",
    exact: true,
  })
  await expect(input).toHaveValue("ATLAS1234")
  await page
    .getByRole("button", { name: "Copier le code", exact: true })
    .click()
  await expect(page.locator(".notice-info")).toContainText(
    "copiez-le manuellement"
  )
  await expect(input).toBeFocused()
  expect(
    await input.evaluate(
      (element) =>
        element instanceof HTMLInputElement &&
        element.selectionStart === 0 &&
        element.selectionEnd === element.value.length
    )
  ).toBe(true)
})

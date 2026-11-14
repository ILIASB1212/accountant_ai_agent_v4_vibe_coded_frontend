import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

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
  await request.post("http://127.0.0.1:8101/test/reset", {
    data: { mode: "active" },
  })
})

test("login, workspace, and client dialog pass automated WCAG AA checks", async ({
  page,
}) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Retrouvez votre espace." })
  ).toBeVisible()
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  ).toEqual([])
  await login(page)
  await expect(
    page.getByRole("button", { name: /Dossier client actif Atlas/ })
  ).toBeVisible()
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  ).toEqual([])
  await page.getByRole("button", { name: "Gérer les clients" }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.getByRole("dialog").evaluate(async (node) => {
    await Promise.all(
      node.getAnimations().map((animation) => animation.finished)
    )
  })
  await page.screenshot({
    path: "test-results/clients-desktop.png",
    fullPage: true,
    animations: "disabled",
  })
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations
  ).toEqual([])
})

test("tablet and narrow mobile layouts retain navigation and composer without horizontal overflow", async ({
  page,
}) => {
  await login(page)
  for (const width of [820, 600, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true)
    await expect(
      page.getByRole("button", { name: "Ouvrir la navigation" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Envoyer le message" })
    ).toBeInViewport()
    await expect(
      page.getByText("Votre expertise, bien accompagnée.")
    ).toBeInViewport()
  }
  await page.setViewportSize({ width: 820, height: 1000 })
  await page.screenshot({
    path: "test-results/workspace-tablet.png",
    fullPage: true,
    animations: "disabled",
  })
})

test("malformed API data is rejected and cabinet creation uses the existing endpoint", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:8101/test/reset", {
    data: { mode: "invalid" },
  })
  await login(page)
  await expect(page.locator(".notice-error")).toContainText("format inattendu")
  await request.post("http://127.0.0.1:8101/test/reset", {
    data: { mode: "setup" },
  })
  await page.reload()
  await page.getByLabel("Nom du cabinet").fill("Fiduciaire Test")
  await page
    .getByRole("button", { name: "Créer mon cabinet", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "Assistant comptable" })
  ).toBeVisible()
})

test("expired authentication returns to login without retaining client content", async ({
  page,
  context,
}) => {
  await login(page)
  await expect(
    page.getByRole("button", { name: /Traitement comptable des achats/ })
  ).toBeVisible()
  await context.clearCookies()
  await page
    .getByRole("button", { name: /Traitement comptable des achats/ })
    .click()
  await expect(
    page.getByRole("heading", { name: "Retrouvez votre espace." })
  ).toBeVisible()
  await expect(page.locator(".notice-error")).toContainText("session a expiré")
  await expect(page.locator(".message")).toHaveCount(0)
})

import { test, expect, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { z } from "zod"

const fixture = "http://127.0.0.1:8101"
const workerId = "30000000-0000-4000-8000-000000000002"
const approvePath = `registration/company/members/${workerId}/approve`
const callsSchema = z.object({
  calls: z.array(
    z.object({
      path: z.string(),
      method: z.string(),
      authorization: z.string().optional(),
    })
  ),
})
async function login(page: Page, email = "salma@example.com") {
  await page.goto("/")
  await page.getByLabel("Adresse e-mail professionnelle").fill(email)
  await page.getByLabel("Mot de passe", { exact: true }).fill("test-password")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
}
async function openSettings(page: Page) {
  await page
    .getByRole("button", { name: "Paramètres du cabinet", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "Demandes d'accès" })
  ).toBeVisible()
}
test.beforeEach(async ({ request }) => {
  await request.post(`${fixture}/test/reset`, {
    data: { mode: "member-requests" },
  })
})

test("owner approves once and waiting worker can enter the workspace", async ({
  page,
  browser,
  request,
}) => {
  const workerContext = await browser.newContext()
  try {
    const workerPage = await workerContext.newPage()
    await login(workerPage, "worker@example.com")
    await expect(
      workerPage.getByRole("heading", { name: "Votre demande a été envoyée." })
    ).toBeVisible()
    await login(page)
    await openSettings(page)
    const contributors = page.getByRole("list", {
      name: "Contributeurs",
      exact: true,
    })
    await expect(
      contributors.getByText("Salma Bennani", { exact: true })
    ).toBeVisible()
    await expect(
      contributors.getByText("Responsable du cabinet", { exact: true })
    ).toBeVisible()
    await expect(
      contributors.getByText("Youssef Amrani", { exact: true })
    ).toHaveCount(0)
    await expect(
      page.getByText("Youssef Amrani", { exact: true })
    ).toBeVisible()
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
      path: "test-results/member-requests-desktop.png",
      fullPage: true,
      animations: "disabled",
    })
    await page
      .getByRole("button", { name: "Approuver — Youssef Amrani", exact: true })
      .click({ clickCount: 2 })
    await expect(page.locator(".member-requests .notice-info")).toContainText(
      "Accès approuvé"
    )
    await expect(
      page.getByText("Aucune demande en attente.", { exact: true })
    ).toBeVisible()
    await expect(
      contributors.getByText("Youssef Amrani", { exact: true })
    ).toBeVisible()
    await expect(
      contributors.getByText("Collaborateur", { exact: true })
    ).toBeVisible()
    await page.screenshot({
      path: "test-results/contributors-desktop.png",
      fullPage: true,
      animations: "disabled",
    })
    const state = callsSchema.parse(
      await (await request.get(`${fixture}/test/state`)).json()
    )
    const approvals = state.calls.filter((call) => call.path === approvePath)
    expect(approvals).toHaveLength(1)
    expect(approvals[0]?.authorization).toBe("Bearer fixture-access")
    await workerPage.getByRole("button", { name: "Vérifier mon accès" }).click()
    await expect(
      workerPage.getByRole("heading", { name: "Assistant comptable" })
    ).toBeVisible()
    await expect(
      workerPage.getByRole("button", {
        name: "Paramètres du cabinet",
        exact: true,
      })
    ).toHaveCount(0)
    const denied = await workerPage.request.post(
      `/api/backend/${approvePath}`,
      { headers: { Origin: "http://localhost:3100" }, data: {} }
    )
    expect(denied.status()).toBe(403)
  } finally {
    await workerContext.close()
  }
})

test("load and approval failures remain recoverable without granting access", async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/test/reset`, {
    data: { mode: "members-error" },
  })
  await login(page)
  await openSettings(page)
  await expect(page.locator(".member-requests .notice-error")).toContainText(
    "momentanément indisponible"
  )
  await expect(
    page.getByRole("textbox", { name: "Code d'invitation", exact: true })
  ).toHaveValue("ATLAS1234")
  await request.post(`${fixture}/test/reset`, {
    data: { mode: "approve-error" },
  })
  await page
    .getByRole("button", { name: "Actualiser les demandes", exact: true })
    .click()
  const approve = page.getByRole("button", {
    name: "Approuver — Youssef Amrani",
    exact: true,
  })
  await approve.click()
  await expect(page.locator(".member-requests .notice-error")).toContainText(
    "momentanément indisponible"
  )
  await expect(approve).toBeEnabled()
  await expect(page.locator(".member-requests .notice-info")).toHaveCount(0)
  const state = callsSchema.parse(
    await (await request.get(`${fixture}/test/state`)).json()
  )
  expect(state.calls.filter((call) => call.path === approvePath)).toHaveLength(
    1
  )
})

test("stale approval request can be reconciled and invalid mutations are blocked", async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/test/reset`, {
    data: { mode: "approve-missing" },
  })
  await login(page)
  await openSettings(page)
  await page
    .getByRole("button", { name: "Approuver — Youssef Amrani", exact: true })
    .click()
  await expect(page.locator(".member-requests .notice-error")).toContainText(
    "n'est plus en attente"
  )
  await request.post(`${fixture}/test/reset`, { data: { mode: "active" } })
  await page
    .locator(".notice-error")
    .getByRole("button", { name: "Actualiser les demandes" })
    .click()
  await expect(
    page.getByText("Aucune demande en attente.", { exact: true })
  ).toBeVisible()
  const invalid = await page.request.post(
    "/api/backend/registration/company/members/not-a-uuid/approve",
    { headers: { Origin: "http://localhost:3100" }, data: {} }
  )
  expect(invalid.status()).toBe(404)
  const forged = await page.request.post(`/api/backend/${approvePath}`, {
    headers: { Origin: "http://localhost:3100" },
    data: { company_id: "other-firm" },
  })
  expect(forged.status()).toBe(422)
  const foreignOrigin = await page.request.post(`/api/backend/${approvePath}`, {
    headers: { Origin: "https://untrusted.example" },
    data: {},
  })
  expect(foreignOrigin.status()).toBe(403)
})

test("Arabic mobile owner can find and approve a request", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.getByRole("combobox", { name: "Langue" }).selectOption("ar")
  await page.getByRole("button", { name: "فتح قائمة التنقل" }).click()
  await page
    .getByRole("button", { name: "إعدادات المكتب", exact: true })
    .click()
  const approve = page.getByRole("button", {
    name: "الموافقة — Youssef Amrani",
    exact: true,
  })
  await expect(approve).toBeInViewport()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: "test-results/member-requests-arabic-mobile.png",
    fullPage: true,
    animations: "disabled",
  })
  await approve.click()
  await expect(page.locator(".member-requests .notice-info")).toContainText(
    "تمت الموافقة"
  )
})

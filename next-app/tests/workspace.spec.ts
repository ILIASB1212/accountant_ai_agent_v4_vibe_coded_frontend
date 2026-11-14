import { test, expect, type Page } from "@playwright/test"

const fixture = "http://127.0.0.1:8101"

test("loopback-IP signup and login work while mismatched origins remain blocked", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:3100/")
  await page
    .getByRole("button", { name: "Créer un compte", exact: true })
    .click()
  await page.getByLabel("Nom complet").fill("Test Origin")
  await page
    .getByLabel("Adresse e-mail professionnelle")
    .fill("origin@example.com")
  await page.getByLabel("Mot de passe", { exact: true }).fill("test-password")
  await page.getByRole("button", { name: "Créer mon compte" }).click()
  await expect(page.getByRole("status")).toContainText("Compte créé")
  await page
    .getByLabel("Adresse e-mail professionnelle")
    .fill("origin@example.com")
  await page.getByLabel("Mot de passe", { exact: true }).fill("test-password")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Assistant comptable" })
  ).toBeVisible()
  const mismatched = await page.request.post(
    "http://127.0.0.1:3100/api/backend/logout",
    { headers: { Origin: "http://localhost:3100" }, data: {} }
  )
  expect(mismatched.status()).toBe(403)
  const missingOrigin = await page.request.post(
    "http://127.0.0.1:3100/api/backend/logout",
    { data: {} }
  )
  expect(missingOrigin.status()).toBe(403)
})

async function login(page: Page) {
  await page.goto("/")
  await page
    .getByLabel("Adresse e-mail professionnelle")
    .fill("salma@example.com")
  await page.getByLabel("Mot de passe", { exact: true }).fill("test-password")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
}
test.beforeEach(async ({ request }) => {
  await request.post(`${fixture}/test/reset`, { data: { mode: "active" } })
})

test("authentication validation, failure, recovery, HttpOnly cookies and logout", async ({
  page,
  context,
}) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Retrouvez votre espace." })
  ).toBeVisible()
  await page.screenshot({
    path: "test-results/auth-desktop.png",
    fullPage: true,
  })
  await page
    .getByLabel("Adresse e-mail professionnelle")
    .fill("salma@example.com")
  await page.getByLabel("Mot de passe", { exact: true }).fill("wrong")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await expect(page.locator(".notice-error")).toContainText(
    "Identifiants incorrects"
  )
  await page.getByLabel("Mot de passe", { exact: true }).fill("test-password")
  await page.getByRole("button", { name: "Se connecter", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Assistant comptable" })
  ).toBeVisible()
  const cookies = await context.cookies()
  expect(
    cookies
      .filter((item) => item.name.startsWith("accountant_"))
      .every((item) => item.httpOnly && item.sameSite === "Lax")
  ).toBe(true)
  expect(await page.evaluate(() => document.cookie)).not.toContain("fixture-")
  await page
    .getByRole("button", { name: "Se déconnecter", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "Retrouvez votre espace." })
  ).toBeVisible()
})

test("signup and password recovery use supported endpoints", async ({
  page,
  request,
}) => {
  await page.goto("/")
  await page
    .getByRole("button", { name: "Créer un compte", exact: true })
    .click()
  await page.getByLabel("Nom complet").fill("Salma Bennani")
  await page
    .getByLabel("Adresse e-mail professionnelle")
    .fill("new@example.com")
  await page.getByLabel("Mot de passe", { exact: true }).fill("test-password")
  await page.getByRole("button", { name: "Créer mon compte" }).click()
  await expect(page.getByRole("status")).toContainText("Compte créé")
  await page.getByRole("button", { name: "Mot de passe oublié" }).click()
  await page
    .getByLabel("Adresse e-mail professionnelle")
    .fill("new@example.com")
  await page.getByRole("button", { name: "Envoyer le lien" }).click()
  await expect(page.getByRole("status")).toContainText(
    "un lien de réinitialisation"
  )
  const state = await (await request.get(`${fixture}/test/state`)).json()
  expect(
    state.calls.some(
      (call: { path: string }) => call.path === "registration/password/forgot"
    )
  ).toBe(true)
})

test("client selection, creation, search and desktop empty state", async ({
  page,
  request,
}) => {
  await login(page)
  await expect(
    page.getByRole("button", { name: /Dossier client actif Atlas/ })
  ).toBeVisible()
  await page.screenshot({
    path: "test-results/workspace-desktop.png",
    fullPage: true,
  })
  await page.getByRole("button", { name: "Gérer les clients" }).click()
  await page.getByLabel("Rechercher un client").fill("zellige")
  await page.getByRole("button", { name: "MZ Maison Zellige" }).click()
  await expect(
    page.getByRole("button", { name: /Dossier client actif Maison/ })
  ).toBeVisible()
  await expect(
    page.getByText("Vos conversations pour ce client apparaîtront ici.")
  ).toBeVisible()
  await page.getByRole("button", { name: "Gérer les clients" }).click()
  await page
    .getByLabel("Nom du client", { exact: true })
    .fill("Nouveau Client SARL")
  await page
    .getByRole("button", { name: "Ajouter le client", exact: true })
    .click()
  await expect(page.getByRole("dialog")).not.toBeVisible()
  await expect(
    page.getByRole("button", { name: /Dossier client actif Nouveau/ })
  ).toBeVisible()
  const state = await (await request.get(`${fixture}/test/state`)).json()
  expect(
    state.calls.filter(
      (call: { path: string; method: string }) =>
        call.path === "agents/clients" && call.method === "POST"
    )
  ).toHaveLength(1)
})

test("history order, safe long Markdown, tables, code, no remote images", async ({
  page,
}) => {
  await login(page)
  await page
    .getByRole("button", { name: /Traitement comptable des achats/ })
    .click()
  await expect(
    page
      .getByRole("heading", { name: "Traitement comptable", exact: true })
      .first()
  ).toBeVisible()
  expect(await page.locator(".message").first().innerText()).toContain(
    "Comment comptabiliser un achat"
  )
  await expect(page.locator(".answer table")).toHaveCount(3)
  await expect(page.locator(".answer pre")).toHaveCount(3)
  await expect(page.locator(".answer img, .answer script")).toHaveCount(0)
  expect(await page.evaluate(() => "injected" in window)).toBe(false)
  await page.screenshot({
    path: "test-results/answer-desktop.png",
    fullPage: true,
  })
})

test("single streamed submission, multiline keyboard input, reload persistence", async ({
  page,
  request,
}) => {
  await login(page)
  const input = page.getByLabel("Votre question comptable ou fiscale")
  await input.fill("Question TVA")
  await input.press("Shift+Enter")
  await input.press("a")
  await expect(input).toHaveValue("Question TVA\na")
  await input.press("Enter")
  await expect(page.getByText("Préparation de la réponse…")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Envoyer le message" })
  ).toBeDisabled()
  await expect(
    page.getByRole("heading", { name: "Traitement comptable", exact: true })
  ).toBeVisible()
  await expect(input).toHaveValue("")
  const state = await (await request.get(`${fixture}/test/state`)).json()
  expect(state.invokes).toBe(1)
  expect(
    state.calls.find((call: { path: string }) => call.path === "agents/invoke")
      .body.message
  ).toBe("Question TVA\na")
  expect(
    state.calls.find(
      (call: { path: string; method: string }) =>
        call.path === "agents/sessions" && call.method === "POST"
    ).body.title
  ).toBe("Atlas Conseil SARL")
  await page.reload()
  await page.getByRole("button", { name: /^Atlas Conseil SARL/ }).click()
  await expect(
    page.getByRole("heading", { name: "Traitement comptable", exact: true })
  ).toBeVisible()
})

test("uncertain failure never automatically resubmits", async ({
  page,
  request,
}) => {
  await login(page)
  await page
    .getByLabel("Votre question comptable ou fiscale")
    .fill("SIMULATE_FAILURE")
  await page.getByRole("button", { name: "Envoyer le message" }).click()
  await expect(page.locator(".notice-error")).toContainText(
    "momentanément indisponible"
  )
  await expect(page.locator(".notice-error")).not.toContainText(
    "secret internal"
  )
  await page.getByRole("button", { name: "Vérifier l'historique" }).click()
  await expect(page.locator(".notice-error")).toContainText(
    "Aucune réponse à cet envoi"
  )
  await expect(
    page.getByRole("button", { name: "Envoyer le message" })
  ).toBeDisabled()
  expect(
    (await (await request.get(`${fixture}/test/state`)).json()).invokes
  ).toBe(1)
  await page
    .getByRole("button", { name: "Nouvelle conversation", exact: true })
    .click()
  await expect(
    page.getByLabel("Votre question comptable ou fiscale")
  ).toBeEnabled()
})

test("mobile drawer traps focus, closes with Escape, layout fits and composer stays visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await expect(
    page.getByRole("heading", { name: "Assistant comptable" })
  ).toBeVisible()
  await page.screenshot({
    path: "test-results/workspace-mobile.png",
    fullPage: true,
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await page.getByRole("button", { name: "Ouvrir la navigation" }).click()
  const dialog = page.getByRole("dialog", { name: "Navigation principale" })
  await expect(dialog).toBeVisible()
  await page.screenshot({
    path: "test-results/navigation-mobile.png",
    fullPage: true,
    animations: "disabled",
  })
  await page.keyboard.press("Tab")
  expect(
    await page.evaluate(() => !!document.activeElement?.closest("dialog"))
  ).toBe(true)
  await page.keyboard.press("Escape")
  await expect(dialog).not.toBeVisible()
  await expect(
    page.getByRole("button", { name: "Ouvrir la navigation" })
  ).toBeFocused()
  await page
    .getByLabel("Votre question comptable ou fiscale")
    .fill("Question mobile")
  await page.getByLabel("Votre question comptable ou fiscale").press("Enter")
  await expect(
    page.getByLabel("Votre question comptable ou fiscale")
  ).toHaveValue("Question mobile\n")
  await page.getByRole("button", { name: "Envoyer le message" }).click()
  await expect(
    page.getByRole("heading", { name: "Traitement comptable", exact: true })
  ).toBeVisible()
  await page.screenshot({
    path: "test-results/answer-mobile.png",
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 480 })
  await expect(
    page.getByRole("button", { name: "Envoyer le message" })
  ).toBeInViewport()
})

test("reduced motion removes message displacement", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await login(page)
  await page
    .getByRole("button", { name: /Traitement comptable des achats/ })
    .click()
  await expect(page.locator(".message").first()).toBeVisible()
  expect(
    await page
      .locator(".message")
      .first()
      .evaluate((node) => getComputedStyle(node).animationName)
  ).toBe("fade")
  await page.screenshot({
    path: "test-results/reduced-motion.png",
    fullPage: true,
  })
})

test("cabinet onboarding and pending approval", async ({ page, request }) => {
  await request.post(`${fixture}/test/reset`, { data: { mode: "setup" } })
  await login(page)
  await page
    .getByRole("button", { name: "Rejoindre un cabinet", exact: true })
    .click()
  await page.getByLabel("Code du cabinet").fill("ATLAS123")
  await page.getByRole("button", { name: "Demander à rejoindre" }).click()
  await expect(
    page.getByRole("heading", { name: "Votre demande a été envoyée." })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Vérifier mon accès" })
  ).toBeVisible()
})

test("empty client list and forbidden access have actionable states", async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/test/reset`, { data: { mode: "empty" } })
  await login(page)
  await expect(
    page.getByRole("button", { name: "Ajouter un client", exact: true })
  ).toBeVisible()
  await expect(
    page.getByLabel("Votre question comptable ou fiscale")
  ).toBeDisabled()
  await request.post(`${fixture}/test/reset`, { data: { mode: "forbidden" } })
  await page.reload()
  await expect(page.locator(".notice-error")).toContainText("Accès refusé")
})

test("unconfirmed history persistence is explicit", async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/test/reset`, { data: { mode: "unsaved" } })
  await login(page)
  await page
    .getByLabel("Votre question comptable ou fiscale")
    .fill("Question non sauvegardée")
  await page.getByRole("button", { name: "Envoyer le message" }).click()
  await expect(
    page.getByText(/son enregistrement dans l'historique/)
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Traitement comptable", exact: true })
  ).toBeVisible()
})

test("proxy validates input, blocks cross-origin mutations and refreshes expired access", async ({
  page,
  request,
}) => {
  await login(page)
  const forged = await page.request.post("/api/backend/agents/clients", {
    headers: { Origin: "https://attacker.invalid" },
    data: { name: "Bad" },
  })
  expect(forged.status()).toBe(403)
  const invalid = await page.request.post("/api/backend/agents/clients", {
    headers: { Origin: "http://localhost:3100" },
    data: { name: "x" },
  })
  expect(invalid.status()).toBe(422)
  await page.context().clearCookies({ name: "accountant_access" })
  await page.reload()
  await expect(
    page.getByRole("heading", { name: "Assistant comptable" })
  ).toBeVisible()
  expect(
    (await (await request.get(`${fixture}/test/state`)).json()).refreshes
  ).toBe(1)
})

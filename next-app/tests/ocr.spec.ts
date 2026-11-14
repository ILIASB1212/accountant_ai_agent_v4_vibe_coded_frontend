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
    page.getByRole("button", { name: "Joindre un document" })
  ).toBeEnabled()
}
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:8101/test/reset", {
    data: { mode: "active" },
  })
})
const input = (page: Page) => page.getByLabel("Fichier PDF ou image à lire")

test("PDF uploads as multipart, extracted text can be reviewed and sent once", async ({
  page,
  request,
}) => {
  await login(page)
  const chooser = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: "Joindre un document" }).click()
  await (
    await chooser
  ).setFiles({
    name: "facture.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 synthetic browser fixture"),
  })
  await expect(page.getByText("Lecture du document…")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Envoyer le message" })
  ).toBeDisabled()
  await page
    .getByRole("button", { name: "Texte extrait · Voir avant envoi" })
    .click()
  await expect(
    page.getByRole("textbox", {
      name: "Texte extrait du document",
      exact: true,
    })
  ).toHaveValue(/1200.00 MAD/)
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
    path: "test-results/ocr-preview-desktop.png",
    fullPage: true,
    animations: "disabled",
  })
  await page.getByRole("button", { name: "Revenir à ma question" }).click()
  await page
    .getByLabel("Votre question comptable ou fiscale")
    .fill("Vérifie cette facture.")
  await page.getByRole("button", { name: "Envoyer le message" }).click()
  await expect(
    page.getByRole("heading", { name: "Traitement comptable", exact: true })
  ).toBeVisible()
  await expect(page.locator(".document-card")).toHaveCount(0)
  await expect(page.locator(".message-document summary")).toContainText(
    "facture.pdf"
  )
  const state = await (
    await request.get("http://127.0.0.1:8101/test/state")
  ).json()
  const uploads = state.calls.filter(
    (call: { path: string }) => call.path === "agents/ocr"
  )
  expect(uploads).toHaveLength(1)
  expect(uploads[0].authorization).toBe("Bearer fixture-access")
  expect(state.invokes).toBe(1)
  const message = state.calls.find(
    (call: { path: string }) => call.path === "agents/invoke"
  ).body.message
  expect(message).toContain("Vérifie cette facture.")
  expect(message).toContain("1200.00 MAD")
})

test("mobile image attachment remains usable and can be removed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await input(page).setInputFiles({
    name: "recu.png",
    mimeType: "image/png",
    buffer: Buffer.from("synthetic image fixture"),
  })
  await expect(
    page.getByRole("button", { name: "Texte extrait · Voir avant envoi" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Envoyer le message" })
  ).toBeEnabled()
  await expect(
    page.getByRole("button", { name: "Envoyer le message" })
  ).toBeInViewport()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: "test-results/ocr-mobile.png",
    fullPage: true,
    animations: "disabled",
  })
  await page.getByRole("button", { name: "Retirer le document" }).click()
  await expect(page.locator(".document-card")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Envoyer le message" })
  ).toBeDisabled()
})

test("invalid and oversized files never reach OCR, server extraction errors stay actionable", async ({
  page,
  request,
}) => {
  await login(page)
  await input(page).setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("text"),
  })
  await expect(page.locator(".document-error")).toContainText(
    "Formats acceptés"
  )
  await input(page).setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  })
  await expect(page.locator(".document-error")).toContainText("10 Mo")
  let state = await (
    await request.get("http://127.0.0.1:8101/test/state")
  ).json()
  expect(
    state.calls.filter((call: { path: string }) => call.path === "agents/ocr")
  ).toHaveLength(0)
  await request.post("http://127.0.0.1:8101/test/reset", {
    data: { mode: "ocr-error" },
  })
  await input(page).setInputFiles({
    name: "scan.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF fixture"),
  })
  await expect(page.locator(".document-error")).toContainText(
    "Aucun texte exploitable"
  )
  await expect(
    page.getByRole("button", { name: "Joindre un document" })
  ).toBeEnabled()
  state = await (await request.get("http://127.0.0.1:8101/test/state")).json()
  expect(state.invokes).toBe(0)
})

test("switching clients discards a pending document and its late result", async ({
  page,
}) => {
  await login(page)
  await input(page).setInputFiles({
    name: "ancien-client.png",
    mimeType: "image/png",
    buffer: Buffer.from("fixture"),
  })
  await page.getByRole("button", { name: "Gérer les clients" }).click()
  await page.getByRole("button", { name: "MZ Maison Zellige" }).click()
  await expect(
    page.getByRole("button", { name: /Dossier client actif Maison/ })
  ).toBeVisible()
  await expect(page.locator(".document-card")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Envoyer le message" })
  ).toBeDisabled()
})

test("history recovery restores a completed receipt response without sending it twice", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:8101/test/reset", {
    data: { mode: "persisted-failure" },
  })
  await login(page)
  await input(page).setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from("fixture"),
  })
  await expect(
    page.getByRole("button", { name: "Texte extrait · Voir avant envoi" })
  ).toBeVisible()
  await page
    .getByLabel("Votre question comptable ou fiscale")
    .fill("Vérifie cette facture.")
  await page.getByRole("button", { name: "Envoyer le message" }).click()
  await page.getByRole("button", { name: "Vérifier l'historique" }).click()
  await expect(
    page.getByRole("heading", { name: "Traitement comptable", exact: true })
  ).toBeVisible()
  await expect(page.locator(".notice-error")).toHaveCount(0)
  await expect(page.locator(".document-card")).toHaveCount(0)
  await expect(
    page.getByLabel("Votre question comptable ou fiscale")
  ).toHaveValue("")
  expect(
    (await (await request.get("http://127.0.0.1:8101/test/state")).json())
      .invokes
  ).toBe(1)
})

test("an uncompleted receipt submission can be resumed with its question and attachment intact", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:8101/test/reset", {
    data: { mode: "fail-first-invoke" },
  })
  await login(page)
  await input(page).setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from("fixture"),
  })
  await expect(
    page.getByRole("button", { name: "Texte extrait · Voir avant envoi" })
  ).toBeVisible()
  await page
    .getByLabel("Votre question comptable ou fiscale")
    .fill("Vérifie cette facture.")
  await page.getByRole("button", { name: "Envoyer le message" }).click()
  await page.getByRole("button", { name: "Vérifier l'historique" }).click()
  await expect(page.locator(".notice-error")).toContainText(
    "Aucune réponse à cet envoi"
  )
  await page
    .getByRole("button", { name: "Reprendre dans une nouvelle conversation" })
    .click()
  await expect(
    page.getByLabel("Votre question comptable ou fiscale")
  ).toHaveValue("Vérifie cette facture.")
  await expect(page.locator(".document-card")).toContainText("receipt.png")
  expect(
    (await (await request.get("http://127.0.0.1:8101/test/state")).json())
      .invokes
  ).toBe(1)
  await page.getByRole("button", { name: "Envoyer le message" }).click()
  await expect(
    page.getByRole("heading", { name: "Traitement comptable", exact: true })
  ).toBeVisible()
  const state = await (
    await request.get("http://127.0.0.1:8101/test/state")
  ).json()
  const calls = state.calls.filter(
    (call: { path: string }) => call.path === "agents/invoke"
  )
  expect(calls).toHaveLength(2)
  expect(calls[0].body.message).toBe(calls[1].body.message)
  expect(calls[0].body.session_id).not.toBe(calls[1].body.session_id)
})

test("an older identical message does not falsely confirm a failed submission", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:8101/test/reset", {
    data: { mode: "fail-first-invoke" },
  })
  await login(page)
  await page
    .getByRole("button", { name: /Traitement comptable des achats/ })
    .click()
  await expect(page.locator(".message").first()).toContainText(
    "Comment comptabiliser un achat ?"
  )
  await page
    .getByLabel("Votre question comptable ou fiscale")
    .fill("Comment comptabiliser un achat ?")
  await page.getByRole("button", { name: "Envoyer le message" }).click()
  await page.getByRole("button", { name: "Vérifier l'historique" }).click()
  await expect(page.locator(".notice-error")).toContainText(
    "Aucune réponse à cet envoi"
  )
  await expect(
    page.getByLabel("Votre question comptable ou fiscale")
  ).toHaveValue("Comment comptabiliser un achat ?")
  await expect(
    page.getByRole("button", { name: "Envoyer le message" })
  ).toBeDisabled()
})

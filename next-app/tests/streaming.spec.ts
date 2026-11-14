import { test, expect, type Page } from "@playwright/test"
import { z } from "zod"
import { readAnswerStream } from "../lib/answer-stream"

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

test("answer arrives progressively before completion through the real proxy", async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/test/reset`, { data: { mode: "stream-slow" } })
  await login(page)
  const input = page.getByLabel("Votre question comptable ou fiscale")
  await input.fill("Explique la TVA")
  await input.press("Enter")
  await expect(page.locator(".streaming-answer")).toContainText(
    "Première partie"
  )
  await expect(
    page.getByText("Réponse en cours…", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Envoyer le message" })
  ).toBeDisabled()
  await expect(page.locator(".streaming-answer")).not.toContainText(
    "La suite complète"
  )
  await page.screenshot({
    path: "test-results/streaming-desktop.png",
    fullPage: true,
    animations: "disabled",
  })
  await expect(page.locator(".message-content .answer").last()).toContainText(
    "La suite complète de la réponse."
  )
  await expect(page.locator(".streaming-answer")).toHaveCount(0)
  await expect(input).toHaveValue("")
  const state = z
    .object({ invokes: z.number() })
    .parse(await (await request.get(`${fixture}/test/state`)).json())
  expect(state.invokes).toBe(1)
  await page.reload()
  await page.getByRole("button", { name: /^Atlas Conseil SARL/ }).click()
  await expect(page.locator(".answer").last()).toContainText(
    "La suite complète"
  )
})

for (const mode of ["stream-truncated", "stream-error"]) {
  test(`${mode} retains partial text and never automatically resends`, async ({
    page,
    request,
  }) => {
    await request.post(`${fixture}/test/reset`, { data: { mode } })
    await login(page)
    const input = page.getByLabel("Votre question comptable ou fiscale")
    await input.fill("Question conservée")
    await input.press("Enter")
    await expect(page.locator(".notice-error")).toContainText(
      "La réponse a été interrompue"
    )
    await expect(
      page.getByText("Réponse interrompue — contenu partiel non confirmé.", {
        exact: true,
      })
    ).toBeVisible()
    await expect(page.locator(".streaming-answer")).toContainText(
      "Première partie"
    )
    await expect(input).toHaveValue("Question conservée")
    await expect(
      page.getByRole("button", { name: "Envoyer le message" })
    ).toBeDisabled()
    await expect(page.locator("body")).not.toContainText(
      "secret internal detail"
    )
    await page
      .getByRole("button", { name: "Vérifier l'historique", exact: true })
      .click()
    const state = z
      .object({ invokes: z.number() })
      .parse(await (await request.get(`${fixture}/test/state`)).json())
    expect(state.invokes).toBe(1)
    await page
      .getByRole("button", {
        name: "Reprendre dans une nouvelle conversation",
        exact: true,
      })
      .click()
    await expect(page.locator(".streaming-answer")).toHaveCount(0)
    await expect(input).toHaveValue("Question conservée")
  })
}

test("Arabic mobile streams real text with no simulated typing animation", async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/test/reset`, { data: { mode: "stream-slow" } })
  await page.setViewportSize({ width: 390, height: 844 })
  await login(page)
  await page.getByRole("combobox", { name: "Langue" }).selectOption("ar")
  await page
    .getByLabel("سؤالكم المحاسبي أو الضريبي")
    .fill("ما شروط خصم الضريبة؟")
  await page.getByRole("button", { name: "إرسال الرسالة" }).click()
  await expect(
    page.getByText("جارٍ تلقي الإجابة…", { exact: true })
  ).toBeVisible()
  await expect(page.locator(".streaming-answer")).toContainText(
    "Première partie"
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await page.screenshot({
    path: "test-results/streaming-arabic-mobile.png",
    fullPage: true,
    animations: "disabled",
  })
  await expect(page.locator(".streaming-answer")).toHaveCount(0)
  await expect(page.locator(".answer").last()).toContainText(
    "La suite complète"
  )
})

test("legacy API responses remain compatible without a second submission", async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/test/reset`, {
    data: { mode: "legacy-response" },
  })
  await login(page)
  await page.getByLabel("Votre question comptable ou fiscale").fill("Legacy")
  await page.getByRole("button", { name: "Envoyer le message" }).click()
  await expect(page.locator(".answer").last()).toContainText(
    "Traitement comptable"
  )
  const state = z
    .object({ invokes: z.number() })
    .parse(await (await request.get(`${fixture}/test/state`)).json())
  expect(state.invokes).toBe(1)
})

test("SSE reader handles split UTF-8, CRLF, comments and replacement events", async () => {
  const answer = "Réponse المغرب 🧾"
  const frames = [
    ": heartbeat\r\n\r\n",
    `data: ${JSON.stringify({ type: "delta", text: "temporary" })}\r\n\r\n`,
    `data: ${JSON.stringify({ type: "replace", text: "Réponse " })}\r\n\r\n`,
    `data: ${JSON.stringify({ type: "delta", text: "المغرب 🧾" })}\r\n\r\n`,
    `data: ${JSON.stringify({ type: "done", answer, history_saved: true })}\r\n\r\n`,
  ].join("")
  const bytes = new TextEncoder().encode(frames)
  let position = 0
  const response = new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (position === bytes.length) {
          controller.close()
          return
        }
        controller.enqueue(bytes.slice(position, position + 1))
        position++
      },
    })
  )
  const observed: string[] = []
  expect(
    await readAnswerStream(response, (text) => observed.push(text))
  ).toEqual({ answer, historySaved: true, blocked: false })
  expect(observed).toEqual(["temporary", "Réponse ", answer])
})

test("SSE reader rejects malformed data and a missing completion event", async () => {
  for (const wire of [
    'data: {"type":"unknown"}\n\n',
    'data: {"type":"delta","text":"partial"}\n\n',
    "data: not-json\n\n",
  ]) {
    await expect(
      readAnswerStream(new Response(wire), () => undefined)
    ).rejects.toThrow("La réponse a été interrompue")
  }
})

test("guardrail refusal is distinguished from a generated streaming answer", async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/test/reset`, {
    data: { mode: "stream-blocked" },
  })
  await login(page)
  await page
    .getByLabel("Votre question comptable ou fiscale")
    .fill("Accounting question")
  await page.getByRole("button", { name: "Envoyer le message" }).click()
  await expect(
    page.getByText("Vérification de la demande…", { exact: true })
  ).toBeVisible()
  await expect(page.locator(".notice-info")).toContainText("contrôle de sujet")
  await expect(page.locator(".answer").last()).toContainText(
    "I cannot process this request"
  )
  await expect(page.locator(".streaming-answer")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Vérifier l'historique", exact: true })
  ).toHaveCount(0)
})

// Isolated contract fixture. Never imports or writes the real backend or database.
import { createServer } from "node:http"
import { randomUUID } from "node:crypto"

const clientA = "10000000-0000-4000-8000-000000000001"
const clientB = "10000000-0000-4000-8000-000000000002"
const sessionA = "20000000-0000-4000-8000-000000000001"
const workerId = "30000000-0000-4000-8000-000000000002"
const now = "2026-11-03T10:00:00Z"
const answer = `## Traitement comptable\n\nVoici un **exemple de présentation**, fourni par le serveur de test.\n\n| Compte | Débit | Crédit |\n| --- | ---: | ---: |\n| 6111 | 1 000,00 | |\n| 4411 | | 1 000,00 |\n\n### Points à vérifier\n\n- L'exercice concerné\n- Les justificatifs disponibles\n\n\`\`\`text\nDébit = Crédit\n\`\`\`\n\n<script>window.injected=true</script>\n\n[Texte fourni par le serveur](https://example.com/reference)\n\n![Image distante](https://example.com/tracker.png)`
let state
function reset(mode = "active", joinCode = "ATLAS1234") {
  state = {
    mode,
    joinCode,
    members: [
      {
        user_id: "30000000-0000-4000-8000-000000000001",
        full_name: "Salma Bennani",
        role: "owner",
        status: "active",
        created_at: now,
      },
      ...(["member-requests", "approve-error", "approve-missing"].includes(mode)
        ? [
            {
              user_id: workerId,
              full_name: "Youssef Amrani",
              role: "member",
              status: "pending",
              created_at: now,
            },
          ]
        : []),
    ],
    clients: [
      { id: clientA, name: "Atlas Conseil SARL", created_at: now },
      { id: clientB, name: "Maison Zellige", created_at: now },
    ],
    sessions: [
      {
        id: sessionA,
        client_id: clientA,
        title: "Traitement comptable des achats",
        created_at: now,
      },
    ],
    messages: {
      [sessionA]: [
        {
          id: 1,
          role: "user",
          content: "Comment comptabiliser un achat ?",
          created_at: now,
        },
        {
          id: 2,
          role: "assistant",
          content: answer.repeat(3),
          created_at: now,
        },
      ],
    },
    calls: [],
    invokes: 0,
    refreshes: 0,
  }
  if (mode === "empty") state.clients = []
}
reset()
createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:8101")
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const bytes = Buffer.concat(chunks)
  const multipart = request.headers["content-type"]?.startsWith(
    "multipart/form-data;"
  )
  const form = multipart
    ? await new Response(bytes, {
        headers: { "Content-Type": request.headers["content-type"] },
      }).formData()
    : null
  const uploaded = form?.get("file")
  const body = multipart
    ? { filename: uploaded?.name, size: uploaded?.size }
    : bytes.length
      ? JSON.parse(bytes.toString())
      : {}
  const send = (status, data, text = false) => {
    response.writeHead(status, {
      "Content-Type": text ? "text/plain" : "application/json",
    })
    response.end(text ? data : JSON.stringify(data))
  }
  if (url.pathname === "/test/reset") {
    reset(body.mode, body.joinCode)
    return send(200, { ok: true })
  }
  if (url.pathname === "/test/state") return send(200, state)
  const path = url.pathname.replace("/api/v4/", "")
  state.calls.push({
    path,
    method: request.method,
    body,
    authorization: request.headers.authorization,
  })
  if (path === "registration/login") {
    if (body.password === "wrong")
      return send(401, { detail: "Invalid credentials" })
    return send(200, {
      access_token:
        body.email === "worker@example.com"
          ? "fixture-worker-access"
          : "fixture-access",
      refresh_token: "fixture-refresh-token",
      expires_in: 3600,
    })
  }
  if (path === "registration/refresh") {
    state.refreshes++
    return send(200, {
      access_token: "fixture-access",
      refresh_token: "fixture-refresh-rotated",
      expires_in: 3600,
    })
  }
  if (path === "registration/signup" || path === "registration/password/forgot")
    return send(200, { message: "OK" })
  if (path === "agents/health") return send(200, { status: "ok" })
  const isWorker =
    request.headers.authorization === "Bearer fixture-worker-access"
  if (request.headers.authorization !== "Bearer fixture-access" && !isWorker)
    return send(401, { detail: "Invalid token" })
  const worker = state.members.find((member) => member.user_id === workerId)
  if (path.startsWith("registration/company/members")) {
    if (isWorker || state.mode === "member" || state.mode === "pending")
      return send(403, { detail: "Only the company owner can do this." })
    if (path === "registration/company/members" && request.method === "GET") {
      if (state.mode === "members-error")
        return send(503, { detail: "Unavailable" })
      return send(200, state.members)
    }
    if (
      path === `registration/company/members/${workerId}/approve` &&
      request.method === "POST"
    ) {
      await new Promise((resolve) => setTimeout(resolve, 300))
      if (state.mode === "approve-error")
        return send(503, { detail: "Unavailable" })
      if (state.mode === "approve-missing" || worker?.status !== "pending")
        return send(404, { detail: "No pending request from that user." })
      worker.status = "active"
      return send(200, { user_id: workerId, status: "active" })
    }
    return send(404, { detail: "No pending request from that user." })
  }
  if (path === "agents/ocr") {
    await new Promise((resolve) => setTimeout(resolve, 400))
    if (state.mode === "ocr-error")
      return send(422, {
        detail:
          "Aucun texte exploitable trouvé. Importez une image PNG ou JPEG.",
      })
    return send(200, {
      filename: body.filename,
      text: "FACTURE TEST\nFournisseur : Exemple SARL\nTotal : 1200.00 MAD",
    })
  }
  if (path === "registration/me")
    return send(200, {
      user_id: isWorker ? workerId : "30000000-0000-4000-8000-000000000001",
      full_name: isWorker ? "Youssef Amrani" : "Salma Bennani",
      membership:
        state.mode === "setup"
          ? null
          : {
              company_id: "40000000-0000-4000-8000-000000000001",
              role: isWorker || state.mode === "member" ? "member" : "owner",
              status: isWorker
                ? worker?.status || "pending"
                : state.mode === "pending"
                  ? "pending"
                  : "active",
              company_name: "Fiduciaire Atlas",
              ...(isWorker ||
              state.mode === "member" ||
              state.mode === "no-invite-code"
                ? {}
                : { join_code: state.joinCode }),
            },
    })
  if (path === "registration/company" || path === "registration/company/join") {
    state.mode = path.endsWith("join") ? "pending" : "active"
    return send(201, { status: state.mode })
  }
  if (path === "agents/clients" && request.method === "GET") {
    if (state.mode === "forbidden") return send(403, { detail: "Not allowed" })
    if (state.mode === "invalid")
      return send(200, [{ id: "bad-id", name: "Invalid" }])
    return send(200, state.clients)
  }
  if (path === "agents/clients" && request.method === "POST") {
    const client = { id: randomUUID(), name: body.name, created_at: now }
    state.clients.push(client)
    return send(201, client)
  }
  if (path === "agents/sessions" && request.method === "GET")
    return send(
      200,
      state.sessions.filter(
        (item) => item.client_id === url.searchParams.get("client_id")
      )
    )
  if (path === "agents/sessions" && request.method === "POST") {
    const session = {
      id: randomUUID(),
      client_id: body.client_id,
      title: body.title,
      created_at: now,
    }
    state.sessions.unshift(session)
    state.messages[session.id] = []
    return send(201, session)
  }
  const match = path.match(/^agents\/sessions\/([^/]+)\/messages$/)
  if (match) return send(200, state.messages[match[1]] || [])
  if (path === "agents/invoke") {
    state.invokes++
    await new Promise((resolve) => setTimeout(resolve, 400))
    if (
      body.message === "SIMULATE_FAILURE" ||
      (state.mode === "fail-first-invoke" && state.invokes === 1)
    )
      return send(500, {
        detail: "secret internal diagnostic must never reach the browser",
      })
    const resultAnswer =
      state.mode === "stream-blocked"
        ? "I cannot process this request due to safety or topic policies."
        : state.mode.startsWith("stream-")
          ? "## TVA au Maroc\n\nPremière partie : ضريبة القيمة المضافة.\n\nLa suite complète de la réponse."
          : answer
    const saveHistory = () => {
      if (state.mode !== "unsaved")
        state.messages[body.session_id].push(
          {
            id: Date.now(),
            role: "user",
            content: body.message,
            created_at: now,
          },
          {
            id: Date.now() + 1,
            role: "assistant",
            content: resultAnswer,
            created_at: now,
          }
        )
    }
    if (
      request.headers.accept?.includes("text/event-stream") &&
      state.mode !== "persisted-failure" &&
      state.mode !== "legacy-response"
    ) {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
      })
      const event = (data) =>
        response.write(`data: ${JSON.stringify(data)}\n\n`)
      event({ type: "status", phase: "checking" })
      if (state.mode === "stream-blocked") {
        await new Promise((resolve) => setTimeout(resolve, 1200))
        saveHistory()
        event({ type: "replace", text: resultAnswer })
        event({
          type: "done",
          answer: resultAnswer,
          history_saved: true,
          blocked: true,
        })
        return response.end()
      }
      const split = Math.floor(resultAnswer.length / 2)
      event({
        type: "delta",
        text:
          state.mode === "stream-replace"
            ? "Provisional text to replace"
            : resultAnswer.slice(0, split),
      })
      await new Promise((resolve) =>
        setTimeout(resolve, state.mode.startsWith("stream-") ? 1200 : 50)
      )
      if (state.mode === "stream-truncated") return response.end()
      if (state.mode === "stream-error") {
        event({ type: "error", message: "secret internal detail" })
        return response.end()
      }
      if (state.mode === "stream-replace")
        event({ type: "replace", text: resultAnswer.slice(0, split) })
      event({ type: "delta", text: resultAnswer.slice(split) })
      saveHistory()
      event({
        type: "done",
        answer: resultAnswer,
        history_saved: state.mode !== "unsaved",
      })
      return response.end()
    }
    saveHistory()
    if (state.mode === "persisted-failure")
      return send(500, { detail: "Response lost after persistence" })
    return send(
      200,
      `_Response generated in 0.40 seconds_ \n ${resultAnswer}`,
      true
    )
  }
  send(404, { detail: "Not found" })
}).listen(8101, "127.0.0.1", () => console.log("Contract fixture on 8101"))

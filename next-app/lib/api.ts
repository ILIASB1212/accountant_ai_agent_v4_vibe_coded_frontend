import { z } from "zod"
import { readAnswerStream } from "./answer-stream"
import {
  clientSchema,
  messageSchema,
  profileSchema,
  sessionSchema,
  documentSchema,
  cabinetMemberSchema,
  memberApprovalSchema,
} from "./contracts"

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
  }
}
async function request(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)
  if (!(options.body instanceof FormData))
    headers.set("Content-Type", "application/json")
  let response: Response
  try {
    response = await fetch(`/api/backend/${path}`, {
      ...options,
      credentials: "same-origin",
      cache: "no-store",
      headers,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error
    throw new ApiError(
      "Connexion interrompue. Vérifiez votre connexion avant de continuer.",
      0
    )
  }
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null)
    const parsed = z.object({ detail: z.string() }).safeParse(data)
    throw new ApiError(
      parsed.success
        ? parsed.data.detail
        : "La demande n'a pas abouti. Réessayez dans un instant.",
      response.status
    )
  }
  return response
}
async function json<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> {
  const response = await request(path, options)
  const data: unknown = await response.json()
  const result = schema.safeParse(data)
  if (!result.success)
    throw new ApiError(
      "Le serveur a renvoyé un format inattendu. Rechargez les données.",
      502
    )
  return result.data
}
const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
})
export const api = {
  ocr: (file: File, signal?: AbortSignal) => {
    const body = new FormData()
    body.set("file", file)
    return json("agents/ocr", documentSchema, { method: "POST", body, signal })
  },
  me: (signal?: AbortSignal) =>
    json("registration/me", profileSchema, { signal }),
  login: async (body: unknown) => {
    await request("registration/login", post(body))
  },
  signup: async (body: unknown) => {
    await request("registration/signup", post(body))
  },
  forgot: async (email: string) => {
    await request("registration/password/forgot", post({ email }))
  },
  logout: async () => {
    await request("logout", post({}))
  },
  company: async (body: unknown, join: boolean) => {
    await request(`registration/company${join ? "/join" : ""}`, post(body))
  },
  members: (signal?: AbortSignal) =>
    json("registration/company/members", z.array(cabinetMemberSchema), {
      signal,
    }),
  approveMember: (userId: string, signal?: AbortSignal) =>
    json(
      `registration/company/members/${encodeURIComponent(userId)}/approve`,
      memberApprovalSchema,
      { ...post({}), signal }
    ),
  clients: (signal?: AbortSignal) =>
    json("agents/clients", z.array(clientSchema), { signal }),
  createClient: (name: string) =>
    json("agents/clients", clientSchema, post({ name })),
  sessions: (clientId: string, signal?: AbortSignal) =>
    json(
      `agents/sessions?client_id=${encodeURIComponent(clientId)}`,
      z.array(sessionSchema),
      { signal }
    ),
  createSession: (clientId: string, title: string) =>
    json(
      "agents/sessions",
      sessionSchema,
      post({ client_id: clientId, title })
    ),
  messages: (id: string, signal?: AbortSignal) =>
    json(
      `agents/sessions/${encodeURIComponent(id)}/messages`,
      z.array(messageSchema),
      { signal }
    ),
  invoke: async (
    sessionId: string,
    message: string,
    callbacks: { onText: (text: string) => void; onChecking: () => void },
    signal?: AbortSignal
  ) => {
    const response = await request("agents/invoke", {
      ...post({ session_id: sessionId, message }),
      headers: { Accept: "text/event-stream" },
      signal,
    })
    if (response.headers.get("content-type")?.includes("text/event-stream"))
      return readAnswerStream(response, callbacks.onText, callbacks.onChecking)
    // Compatible with an older API during a backend restart; never automatically resend.
    return { answer: await response.text(), historySaved: null, blocked: false }
  },
}

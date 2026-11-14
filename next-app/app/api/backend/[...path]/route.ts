import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import {
  chatInput,
  clientInput,
  companyInput,
  joinInput,
  loginSchema,
  sessionInput,
  signupSchema,
  tokenSchema,
  MAX_DOCUMENT_BYTES,
} from "@/lib/contracts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const accessCookie = "accountant_access"
const refreshCookie = "accountant_refresh"
const refreshes = new Map<string, Promise<Response>>()
const noCache = { "Cache-Control": "no-store, private" }
const rules = [
  {
    path: /^registration\/login$/,
    method: "POST",
    schema: loginSchema,
    public: true,
  },
  {
    path: /^registration\/signup$/,
    method: "POST",
    schema: signupSchema,
    public: true,
  },
  {
    path: /^registration\/password\/forgot$/,
    method: "POST",
    schema: z.object({ email: z.email() }),
    public: true,
  },
  { path: /^registration\/me$/, method: "GET", public: false },
  { path: /^registration\/company\/members$/, method: "GET", public: false },
  {
    path: /^registration\/company\/members\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/approve$/i,
    method: "POST",
    schema: z.object({}).strict(),
    public: false,
  },
  {
    path: /^registration\/company$/,
    method: "POST",
    schema: companyInput,
    public: false,
  },
  {
    path: /^registration\/company\/join$/,
    method: "POST",
    schema: joinInput,
    public: false,
  },
  { path: /^agents\/health$/, method: "GET", public: true },
  { path: /^agents\/ocr$/, method: "POST", public: false },
  { path: /^agents\/clients$/, method: "GET", public: false },
  {
    path: /^agents\/clients$/,
    method: "POST",
    schema: clientInput,
    public: false,
  },
  { path: /^agents\/sessions$/, method: "GET", public: false },
  {
    path: /^agents\/sessions$/,
    method: "POST",
    schema: sessionInput,
    public: false,
  },
  {
    path: /^agents\/sessions\/[0-9a-f-]{36}\/messages$/i,
    method: "GET",
    public: false,
  },
  {
    path: /^agents\/invoke$/,
    method: "POST",
    schema: chatInput,
    public: false,
  },
]
function failure(detail: string, status: number) {
  return NextResponse.json({ detail }, { status, headers: noCache })
}
async function readUpload(
  request: NextRequest
): Promise<FormData | NextResponse> {
  const limit = MAX_DOCUMENT_BYTES + 64 * 1024
  const contentType = request.headers.get("content-type") || ""
  if (
    !contentType.toLowerCase().startsWith("multipart/form-data;") ||
    !request.body
  )
    return failure("Choisissez un fichier PDF, PNG ou JPEG.", 415)
  if (Number(request.headers.get("content-length")) > limit)
    return failure("Le fichier dépasse la limite de 10 Mo.", 413)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > limit) {
        await reader.cancel()
        return failure("Le fichier dépasse la limite de 10 Mo.", 413)
      }
      chunks.push(chunk.value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const form = await new Response(bytes, {
      headers: { "Content-Type": contentType },
    }).formData()
    const file = form.get("file")
    if (!(file instanceof File) || Array.from(form.keys()).length !== 1)
      return failure("Choisissez un seul fichier PDF, PNG ou JPEG.", 422)
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name))
      return failure("Formats acceptés : PDF, PNG et JPEG.", 415)
    if (!file.size) return failure("Le fichier est vide.", 422)
    if (file.size > MAX_DOCUMENT_BYTES)
      return failure("Le fichier dépasse la limite de 10 Mo.", 413)
    return form
  } catch {
    return failure(
      "Le fichier n'a pas pu être lu. Sélectionnez-le à nouveau.",
      422
    )
  } finally {
    reader.releaseLock()
  }
}
function clearCookies(response: NextResponse) {
  response.cookies.set(accessCookie, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
  })
  response.cookies.set(refreshCookie, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
  })
}
function setTokens(
  response: NextResponse,
  tokens: z.infer<typeof tokenSchema>,
  request: NextRequest
) {
  const options = {
    httpOnly: true,
    sameSite: "lax",
    secure:
      request.nextUrl.protocol === "https:" ||
      process.env.NODE_ENV === "production",
    path: "/",
  } satisfies NonNullable<Parameters<typeof response.cookies.set>[2]>
  response.cookies.set(accessCookie, tokens.access_token, {
    ...options,
    maxAge: tokens.expires_in,
  })
  response.cookies.set(refreshCookie, tokens.refresh_token, {
    ...options,
    maxAge: 60 * 60 * 24 * 30,
  })
}
async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  if (request.method !== "GET") {
    const origin = request.headers.get("origin")
    const host = request.headers.get("host")
    let expectedOrigin: string | undefined
    try {
      if (host)
        expectedOrigin = new URL(`${request.nextUrl.protocol}//${host}`).origin
    } catch {
      return failure("Origine de la demande refusée.", 403)
    }
    if (
      !origin ||
      origin !== expectedOrigin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return failure("Origine de la demande refusée.", 403)
  }
  const path = (await context.params).path.join("/")
  if (path === "logout" && request.method === "POST") {
    const response = NextResponse.json({ ok: true }, { headers: noCache })
    clearCookies(response)
    return response
  }
  const rule = rules.find(
    (item) => item.method === request.method && item.path.test(path)
  )
  if (!rule) return failure("Cette opération n'est pas disponible.", 404)
  let body: string | FormData | undefined
  if (path === "agents/ocr") {
    const upload = await readUpload(request)
    if (upload instanceof NextResponse) return upload
    body = upload
  }
  if ("schema" in rule && rule.schema) {
    if (Number(request.headers.get("content-length")) > 100000)
      return failure("La demande est trop volumineuse.", 413)
    const value: unknown = await request.json().catch(() => null)
    const parsed = rule.schema.safeParse(value)
    if (!parsed.success)
      return failure("Vérifiez les champs saisis et leur longueur.", 422)
    body = JSON.stringify(parsed.data)
  }
  const base = (
    process.env.BACKEND_API_URL || "http://127.0.0.1:8000/api/v4"
  ).replace(/\/$/, "")
  let token = request.cookies.get(accessCookie)?.value
  let rotated: z.infer<typeof tokenSchema> | undefined
  try {
    const refresh = async () => {
      const key = request.cookies.get(refreshCookie)?.value
      if (!key) return false
      let pending = refreshes.get(key)
      if (!pending) {
        pending = fetch(`${base}/registration/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: key }),
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        })
        refreshes.set(key, pending)
        const timer = setTimeout(() => refreshes.delete(key), 5000)
        timer.unref()
      }
      const result = (await pending).clone()
      if (!result.ok) return false
      const data: unknown = await result.json()
      const parsed = tokenSchema.safeParse(data)
      if (!parsed.success) return false
      rotated = parsed.data
      token = rotated.access_token
      return true
    }
    if (!rule.public && !token && !(await refresh())) {
      const response = failure(
        "Votre session a expiré. Connectez-vous pour continuer.",
        401
      )
      clearCookies(response)
      return response
    }
    const target = new URL(`${base}/${path}`)
    if (path === "agents/sessions" && request.method === "GET") {
      const id = request.nextUrl.searchParams.get("client_id")
      if (id) {
        if (!z.string().uuid().safeParse(id).success)
          return failure("Client non valide.", 422)
        target.searchParams.set("client_id", id)
      }
    }
    const send = () =>
      fetch(target, {
        method: request.method,
        body,
        headers: {
          ...(path === "agents/invoke" &&
          request.headers.get("accept")?.includes("text/event-stream")
            ? { Accept: "text/event-stream" }
            : {}),
          ...(body instanceof FormData
            ? {}
            : { "Content-Type": "application/json" }),
          ...(!rule.public && token
            ? { Authorization: `Bearer ${token}` }
            : {}),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(
          path === "agents/invoke" || path === "agents/ocr" ? 180000 : 20000
        ),
        redirect: "error",
      })
    let upstream = await send()
    if (upstream.status === 401 && !rule.public && (await refresh()))
      upstream = await send()
    if (!upstream.ok) {
      let detail =
        upstream.status === 401
          ? path === "registration/login"
            ? "Identifiants incorrects ou adresse e-mail non confirmée."
            : "Votre session a expiré. Reconnectez-vous."
          : upstream.status === 403
            ? "Accès refusé. Vérifiez votre rattachement au cabinet et son approbation."
            : upstream.status === 404
              ? path.startsWith("registration/company/members/")
                ? "Cette demande n'est plus en attente. Actualisez les demandes."
                : "Ce client ou cette conversation n'est plus accessible."
              : upstream.status === 409
                ? "Cet élément existe déjà. Rechargez la liste."
                : upstream.status === 422
                  ? "Vérifiez les champs saisis."
                  : upstream.status === 429
                    ? "Trop de demandes. Patientez avant de réessayer."
                    : upstream.status >= 500
                      ? "Le service est momentanément indisponible."
                      : "La demande a été refusée. Vérifiez les informations saisies."
      if (path === "agents/ocr" && [413, 415, 422].includes(upstream.status)) {
        const data: unknown = await upstream.json().catch(() => null)
        const parsed = z.object({ detail: z.string().max(500) }).safeParse(data)
        if (parsed.success) detail = parsed.data.detail
      }
      const response = failure(detail, upstream.status)
      if (upstream.status === 401 && !rule.public) clearCookies(response)
      else if (rotated) setTokens(response, rotated, request)
      return response
    }
    if (path === "registration/login") {
      const data: unknown = await upstream.json()
      const tokens = tokenSchema.safeParse(data)
      if (!tokens.success)
        return failure("Réponse de connexion non valide.", 502)
      const response = NextResponse.json({ ok: true }, { headers: noCache })
      setTokens(response, tokens.data, request)
      return response
    }
    const streaming =
      path === "agents/invoke" &&
      upstream.headers.get("content-type")?.includes("text/event-stream")
    const response = new NextResponse(
      streaming ? upstream.body : await upstream.text(),
      {
        status: upstream.status,
        headers: {
          ...noCache,
          ...(streaming
            ? {
                "Cache-Control": "no-store, private, no-transform",
                "X-Accel-Buffering": "no",
              }
            : {}),
          "Content-Type": streaming
            ? "text/event-stream; charset=utf-8"
            : path === "agents/invoke"
              ? "text/plain; charset=utf-8"
              : "application/json",
          "X-Content-Type-Options": "nosniff",
        },
      }
    )
    if (rotated) setTokens(response, rotated, request)
    return response
  } catch {
    return failure(
      "Le serveur comptable ne répond pas. Réessayez plus tard.",
      502
    )
  }
}
export { handle as GET, handle as POST }

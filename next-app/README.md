# Accountant AI Agent v3

French accounting and tax workspace for Moroccan fiduciaries. Built with Next.js App Router, React, TypeScript, and Tailwind CSS. The existing Python backend, RAG pipeline, authorization rules, and data remain unchanged.

## Run locally

From this directory, with Node.js 20.9 or newer:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open [127.0.0.1:3000](http://127.0.0.1:3000). `npm run dev` starts the existing backend from the repository's `.venv`, waits for its health check, then starts the frontend. Loading the backend's retrieval and guardrail models can take several minutes. It reuses services already running and disables RAG index rebuilding. Backend startup runs the existing checkpoint initialization, so the backend's configured database must be ready. No backend source or RAG logic is modified. Press Ctrl+C to stop processes started by this command.

To run only the frontend against an API you manage separately, use `npm run dev:frontend`.

Set the server-only `BACKEND_API_URL` in `.env.local` to the complete API base URL. It defaults to `http://127.0.0.1:8000/api/v4`, matching `src/backend/__init__.py`. The product name remains v3; the current router prefix is v4. Do not copy the repository's backend `.env` into the frontend or prefix credentials with `NEXT_PUBLIC_`.

For a production build:

```powershell
npm run build
npm run start
```

Use HTTPS in production. Access and refresh tokens are stored in HttpOnly, SameSite=Lax cookies, with Secure enabled in production. The Next.js server forwards only allowlisted routes, preserves the user's bearer token, validates input, checks mutation origins, refreshes expired access, disables response caching, and hides internal upstream errors. No service key or database credential is needed by this frontend. A deployment must allow up to 180 seconds for agent requests and pass streaming response bodies without buffering or compression delays. Local logout clears this browser's cookies; the existing API does not expose token revocation.

## Supported workflows

The top-bar language selector supports French (default), English and Arabic. It is also available on sign-in and cabinet setup. The preference is stored in a browser cookie for one year, and the server renders the selected language and direction on reload. Arabic uses a right-to-left layout. Switching languages preserves the active client, conversation, unsent draft and extracted document. Interface text and starter prompts are translated; client data, stored messages, OCR text and backend-generated answers retain their original content. The language choice does not change the agent's instructions or request contract.

- Account creation, email/password login, session renewal, password-reset email, and local logout.
- Cabinet creation or joining and a pending-approval screen. Owners can review **Demandes d'accès** in **Paramètres du cabinet** and approve a worker through the existing owner-only API. The worker then selects **Vérifier mon accès** to enter the workspace. The panel reloads requests when opened and offers manual refresh; it does not send notifications or automatically approve requests.
- Owners can open **Paramètres du cabinet** in the sidebar to view and copy their invitation code. The code is loaded from the existing authenticated profile endpoint each time the settings open; workers cannot access this panel.
- The settings also list active **Contributeurs**, displaying the full names and owner/worker roles returned by the members API. Approved workers appear in that list immediately. Missing names are explicitly identified rather than inferred from email addresses or IDs.
- Client listing, local search, creation, and explicit active-client context.
- Per-client conversations, history in server order, new sessions named after the active client company, and streamed chat answers. Existing saved session titles are preserved.
- Safe Markdown answers with GFM tables and code. Raw HTML, remote images, and non-HTTP links are not rendered. References are shown only if the answer includes them.
- Keyboard and multiline entry, native modal dialogs, a mobile navigation drawer, reduced motion, and a composer that adapts to viewport resizing.

The document icon in the composer accepts a single PDF, PNG, or JPEG up to 10 MiB. The authenticated `POST /api/v4/agents/ocr` endpoint receives multipart field `file` and calls the existing `src/tools/groq_ocr.py` tool. Its JSON response contains `filename` and `text`. Images use the configured Groq vision model; PDFs use their existing native text layer, with a 20-page limit. Scanned PDFs without readable text return an actionable error asking for PNG/JPEG page images. Extraction is limited to 16,000 characters so document context can fit within the existing 20,000-character chat limit.

Documents are validated before extraction and processed in a temporary directory that is removed on success or failure. Files are not stored in the database or added to the RAG indexes. Extracted text stays in the current browser draft until sent, is cleared when changing conversations or clients, and can be previewed or removed. On send, the text is included in the normal user message and follows the existing conversation-history behavior. Provider credentials remain on the backend.

The frontend requests `POST /api/v4/agents/invoke` with `Accept: text/event-stream`. The endpoint uses the existing graph's message streaming without changing its nodes, prompts, tools, guardrails or checkpointer. Only chat text is forwarded; tool arguments, tool output and retrieval-model text are filtered out. SSE data events use `type: delta` (append text), `replace` (replace provisional text), `done` (authoritative answer plus `history_saved`), and `error` (generic failure). A guardrail refusal or a model without token streaming is sent as a completed replacement. Clients without the SSE Accept header retain the original plain-text response. The frontend also accepts that legacy response during a backend restart, without resubmitting the question.

The browser displays received chunks directly, with no simulated typing delay. Completed answers retain safe Markdown rendering. Partial answers remain marked as unconfirmed after an interruption, and the draft and extracted document remain available. The API has no idempotency key or cancellation guarantee, so the UI never automatically resends an interrupted invocation. It offers history reconciliation and a new conversation instead. The completion event reports whether the history write succeeded; if persistence fails or cannot be confirmed, the UI explicitly labels it as unconfirmed. Initial session selection and unsent drafts live only in React state; they are not claimed to persist across reloads.

After a failed submission, “Vérifier l'historique” restores a newly recorded matching answer and clears the warning when completion is confirmed. An older identical question is not treated as confirmation. “Reprendre dans une nouvelle conversation” keeps the current question and extracted document text, but does not send them until the user clicks Send. The checkpoint connection pool validates connections before use to replace stale PostgreSQL connections before agent execution. From the repository root, `.venv\Scripts\python.exe next-app/scripts/check-checkpoint-pool.py` verifies replacement with read-only queries.

The forgot-password flow sends the backend's existing reset email. The final password-change destination is controlled by the backend's Supabase redirect configuration; no unsupported password-update endpoint is added.

## Verification

```powershell
npm run lint
npm run typecheck
npm run build
npx playwright test
npm run check:services
```

Browser tests require an installed Google Chrome. They launch the production frontend on port 3100 and an isolated in-memory API contract fixture on port 8101. Run the build first and leave those ports free. The fixture uses synthetic records and tokens, never imports the Python backend, and never connects to the real database. It verifies the real Next.js proxy and browser UI, not live Supabase authentication or RAG answer quality.

`npm run check:services` separately checks the running local API on port 8000, its connection through the frontend on port 3000, and the real authentication rejection for a random synthetic address on example.com. It does not create an account or submit real user credentials.

Screenshots and traces are saved under `test-results/` and ignored by Git. Fonts use installed system families with reliable fallbacks and no remote font download. Shared colors and responsive/motion rules live in `app/globals.css`; API contracts and calls are centralized in `lib/contracts.ts` and `lib/api.ts`.

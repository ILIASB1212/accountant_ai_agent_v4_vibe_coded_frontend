import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const root = resolve(frontend, "..")
const children = new Set()
let stopping = false

function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      })
    } else child.kill("SIGTERM")
  }
  setTimeout(() => process.exit(code), 500)
}
process.on("SIGINT", () => stop())
process.on("SIGTERM", () => stop())

function launch(command, args, cwd, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    windowsHide: true,
  })
  children.add(child)
  child.on("error", (error) => {
    console.error(`Could not start ${command}: ${error.message}`)
    stop(1)
  })
  child.on("exit", (code) => {
    children.delete(child)
    if (!stopping) {
      console.error(`A required service stopped (exit ${code}).`)
      stop(code || 1)
    }
  })
  return child
}

async function backendReady() {
  try {
    const response = await fetch("http://127.0.0.1:8000/api/v4/agents/health", {
      signal: AbortSignal.timeout(1500),
    })
    const data = await response.json()
    return response.ok && data.status === "ok"
  } catch {
    return false
  }
}

async function run() {
  const python = resolve(
    root,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python"
  )
  if (!(await backendReady())) {
    if (!existsSync(python))
      throw new Error(`The backend Python environment is missing: ${python}`)
    console.log(
      "Starting the existing accounting API. Loading its retrieval and guardrail models can take several minutes."
    )
    launch(
      python,
      [
        "-u",
        "-m",
        "uvicorn",
        "src.backend:app",
        "--host",
        "127.0.0.1",
        "--port",
        "8000",
        ...(process.platform === "win32" ? ["--loop", "asyncio:SelectorEventLoop"] : []),
      ],
      root,
      { RAG_NO_REBUILD: "1", PYTHONUTF8: "1" }
    )
    const deadline = Date.now() + 10 * 60 * 1000
    while (!(await backendReady())) {
      if (stopping) return
      if (Date.now() >= deadline)
        throw new Error(
          "The backend did not become ready within 10 minutes. Check its startup output above."
        )
      await new Promise((resolveWait) => setTimeout(resolveWait, 1500))
    }
  } else console.log("Using the existing API on port 8000.")
  if (stopping) return
  try {
    const existing = await fetch("http://127.0.0.1:3000/", {
      signal: AbortSignal.timeout(3000),
    })
    if (existing.ok && (await existing.text()).includes("Accountant AI")) {
      console.log(
        "Frontend already running at http://127.0.0.1:3000. Press Ctrl+C to stop services started by this command."
      )
      if (children.size) await new Promise(() => {})
      return
    }
  } catch {
    /* No existing frontend. */
  }
  launch(
    process.execPath,
    [
      resolve(frontend, "node_modules/next/dist/bin/next"),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3000",
    ],
    frontend
  )
  console.log("API ready. Starting the frontend at http://127.0.0.1:3000.")
}
run().catch((error) => {
  console.error(error.message)
  stop(1)
})

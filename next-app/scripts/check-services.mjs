import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

const frontend = "http://127.0.0.1:3000"
for (const [label, url] of [
  ["Backend API", "http://127.0.0.1:8000/api/v4/agents/health"],
  ["Frontend to backend connection", `${frontend}/api/backend/agents/health`],
]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
  assert.equal(response.status, 200, `${label} did not respond successfully`)
  assert.equal((await response.json()).status, "ok")
  console.log(`${label}: ready`)
}

// A synthetic address on the reserved example.com domain checks the auth path without
// creating an account or submitting the user's credentials.
const response = await fetch(`${frontend}/api/backend/registration/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: frontend },
  body: JSON.stringify({
    email: `readiness-${randomUUID()}@example.com`,
    password: "readiness-check-not-a-user-password",
  }),
  signal: AbortSignal.timeout(30000),
})
assert.equal(
  response.status,
  401,
  "The real authentication service did not return the expected credentials rejection"
)
console.log(
  "Real authentication endpoint: reachable, rejects invalid credentials correctly"
)

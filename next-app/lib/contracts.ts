import { z } from "zod"

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
export const MAX_DOCUMENT_TEXT = 16000
export const documentSchema = z.object({
  filename: z.string().min(1).max(255),
  text: z.string().min(1).max(MAX_DOCUMENT_TEXT),
})
export type ExtractedDocument = z.infer<typeof documentSchema>

export const clientSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  created_at: z.string(),
})
export const sessionSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  title: z.string(),
  created_at: z.string(),
})
export const messageSchema = z.object({
  id: z.union([z.string(), z.number()]),
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string(),
  created_at: z.string(),
})
const membershipFields = z.object({
  company_id: z.string().uuid(),
  status: z.enum(["active", "pending"]),
  company_name: z.string().optional(),
})
const membershipSchema = z.discriminatedUnion("role", [
  membershipFields.extend({
    role: z.literal("owner"),
    join_code: z.string().optional(),
  }),
  membershipFields.extend({ role: z.literal("member") }),
])
export const profileSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().nullable(),
  membership: membershipSchema.nullable(),
})
export const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(10),
  expires_in: z.number().positive(),
})
export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(72),
})
export const signupSchema = loginSchema.extend({
  password: z.string().min(8).max(72),
  full_name: z.string().trim().min(2).max(80),
})
export const clientInput = z.object({ name: z.string().trim().min(2).max(120) })
export const sessionInput = z.object({
  client_id: z.string().uuid(),
  title: z.string().trim().max(120).optional(),
})
export const chatInput = z.object({
  session_id: z.string().uuid(),
  message: z.string().trim().min(1).max(20000),
})
export const companyInput = z.object({
  company_name: z.string().trim().min(2).max(60),
})
export const joinInput = z.object({
  join_code: z.string().trim().min(4).max(16),
})
export type Client = z.infer<typeof clientSchema>
export type Session = z.infer<typeof sessionSchema>
export type Message = z.infer<typeof messageSchema>
export type Profile = z.infer<typeof profileSchema>

export const cabinetMemberSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().nullable(),
  role: z.enum(["owner", "member"]),
  status: z.enum(["pending", "active"]),
  created_at: z.string(),
})
export const memberApprovalSchema = z.object({
  user_id: z.string().uuid(),
  status: z.literal("active"),
})
export type CabinetMember = z.infer<typeof cabinetMemberSchema>

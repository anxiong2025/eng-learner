/** Cloudflare Workers environment bindings */
export interface Env {
  // ─── Bindings ───
  DB: D1Database
  R2: R2Bucket

  // ─── AI ───
  AI_PROVIDER: string
  GEMINI_API_KEY: string
  CLAUDE_API_KEY?: string
  OPENAI_API_KEY?: string

  // ─── OAuth ───
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string

  // ─── Auth ───
  JWT_SECRET: string

  // ─── External APIs ───
  SUPADATA_API_KEY: string
  APIFY_API_TOKEN?: string
  RESEND_API_KEY: string

  // ─── Config ───
  FRONTEND_URL: string
  ENVIRONMENT: string
  R2_PUBLIC_URL: string
  R2_BUCKET_NAME?: string
}

/** Auth user info extracted from JWT */
export interface AuthUser {
  user_id: string
  email: string
  name: string
  avatar?: string
  provider: string
  tier: string
}

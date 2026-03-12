import { Hono } from 'hono'
import type { Env } from '../env'
import { generateToken, getAuthUser } from '../middleware/auth'
import { upsertUser, createEmailUser, getUserByEmail, markEmailVerified, saveVerificationCode, verifyCode, type DbUser } from '../db'

// ─── Password hashing utilities (Web Crypto API) ───
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  const saltHex = [...salt].map((b) => b.toString(16).padStart(2, '0')).join('')
  const hashHex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${saltHex}:${hashHex}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  const computed = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return computed === hashHex
}

function generateVerifyCode(): string {
  const arr = crypto.getRandomValues(new Uint8Array(3))
  return ((arr[0] << 16) | (arr[1] << 8) | arr[2]).toString().slice(-6).padStart(6, '0')
}

async function sendVerificationEmail(email: string, code: string, env: Env): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'TubeMo <noreply@tubemo.com>',
      to: [email],
      subject: 'Your TubeMo verification code',
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#111;margin-bottom:8px">Verify your email</h2>
        <p style="color:#555">Your verification code is:</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:24px 0;color:#111">${code}</div>
        <p style="color:#888;font-size:13px">This code expires in 10 minutes. If you didn't request this, please ignore this email.</p>
      </div>`,
    }),
  })
  return res.ok
}

export function authRoutes() {
  const app = new Hono<{ Bindings: Env }>()

  // ─── Get current user ───
  app.get('/me', async (c) => {
    const user = await getAuthUser(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)
    return c.json({
      id: user.user_id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      provider: user.provider,
      tier: user.tier,
    })
  })

  // ─── Google OAuth redirect ───
  app.get('/google', (c) => {
    const clientId = c.env.GOOGLE_CLIENT_ID
    const workerUrl = new URL(c.req.url).origin
    const redirectUri = `${workerUrl}/api/auth/callback/google`
    const refCode = c.req.query('ref_code') || ''
    const scope = 'openid email profile'

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&state=${encodeURIComponent(refCode)}`
    return c.redirect(authUrl)
  })

  // ─── GitHub OAuth redirect ───
  app.get('/github', (c) => {
    const clientId = c.env.GITHUB_CLIENT_ID
    const workerUrl = new URL(c.req.url).origin
    const redirectUri = `${workerUrl}/api/auth/callback/github`
    const refCode = c.req.query('ref_code') || ''
    const scope = 'user:email'

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(refCode)}`
    return c.redirect(authUrl)
  })

  // ─── Google OAuth callback ───
  app.get('/callback/google', async (c) => {
    const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:5173'
    const workerUrl = new URL(c.req.url).origin
    const redirectUri = `${workerUrl}/api/auth/callback/google`

    const code = c.req.query('code')
    const state = c.req.query('state') // ref_code

    if (!code) return c.redirect(`${frontendUrl}?error=no_code`)

    try {
      // Exchange code for token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: c.env.GOOGLE_CLIENT_ID,
          client_secret: c.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      })

      const tokenData = (await tokenRes.json()) as { access_token: string }
      if (!tokenData.access_token) return c.redirect(`${frontendUrl}?error=token_error`)

      // Get user info
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })

      const userInfo = (await userRes.json()) as {
        id: string
        email: string
        name: string
        picture?: string
      }

      const userId = `google_${userInfo.id}`
      const user: DbUser = {
        id: userId,
        email: userInfo.email,
        name: userInfo.name,
        avatar: userInfo.picture ?? null,
        provider: 'google',
        tier: 'free',
        invite_code: null,
        bonus_quota: 0,
        invited_by: null,
        created_at: null,
        last_login_at: null,
      }

      const refCode = state && state.length > 0 ? state : undefined
      await upsertUser(c.env.DB, user, refCode)

      const token = await generateToken(
        {
          user_id: userId,
          email: userInfo.email,
          name: userInfo.name,
          avatar: userInfo.picture,
          provider: 'google',
          tier: 'free',
        },
        c.env,
      )

      return c.redirect(`${frontendUrl}?auth_success=true&token=${encodeURIComponent(token)}`)
    } catch (e) {
      console.error('Google OAuth error:', e)
      return c.redirect(`${frontendUrl}?error=auth_error`)
    }
  })

  // ─── GitHub OAuth callback ───
  app.get('/callback/github', async (c) => {
    const frontendUrl = c.env.FRONTEND_URL || 'http://localhost:5173'

    const code = c.req.query('code')
    const state = c.req.query('state')

    if (!code) return c.redirect(`${frontendUrl}?error=no_code`)

    try {
      // Exchange code for token
      console.log('[github-cb] exchanging code for token...')
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: c.env.GITHUB_CLIENT_ID,
          client_secret: c.env.GITHUB_CLIENT_SECRET,
        }),
      })

      const tokenData = (await tokenRes.json()) as { access_token: string; error?: string; error_description?: string }
      if (!tokenData.access_token) {
        console.error('[github-cb] token exchange failed:', JSON.stringify(tokenData))
        return c.redirect(`${frontendUrl}?error=token_error`)
      }
      console.log('[github-cb] got access_token OK')

      // Get user info
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          'User-Agent': 'EngLearner',
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      })

      const userInfo = (await userRes.json()) as {
        id: number
        login: string
        name?: string
        email?: string
        avatar_url?: string
      }
      console.log('[github-cb] user info:', userInfo.login, userInfo.id)

      // Get email if not public
      let email = userInfo.email
      if (!email) {
        const emailsRes = await fetch('https://api.github.com/user/emails', {
          headers: {
            'User-Agent': 'EngLearner',
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        })
        const emails = (await emailsRes.json()) as {
          email: string
          primary: boolean
          verified: boolean
        }[]
        email =
          emails.find((e) => e.primary && e.verified)?.email ??
          `${userInfo.login}@github.local`
      }
      console.log('[github-cb] email resolved:', email)

      const userId = `github_${userInfo.id}`
      const name = userInfo.name ?? userInfo.login
      const user: DbUser = {
        id: userId,
        email,
        name,
        avatar: userInfo.avatar_url ?? null,
        provider: 'github',
        tier: 'free',
        invite_code: null,
        bonus_quota: 0,
        invited_by: null,
        created_at: null,
        last_login_at: null,
      }

      const refCode = state && state.length > 0 ? state : undefined
      console.log('[github-cb] upserting user...')
      await upsertUser(c.env.DB, user, refCode)
      console.log('[github-cb] user upserted OK')

      const token = await generateToken(
        {
          user_id: userId,
          email,
          name,
          avatar: userInfo.avatar_url,
          provider: 'github',
          tier: 'free',
        },
        c.env,
      )
      console.log('[github-cb] JWT generated, redirecting to frontend')

      return c.redirect(`${frontendUrl}?auth_success=true&token=${encodeURIComponent(token)}`)
    } catch (e) {
      console.error('GitHub OAuth error:', e)
      return c.redirect(`${frontendUrl}?error=auth_error`)
    }
  })

  // ─── Email: Register ───
  app.post('/register', async (c) => {
    const { email, password, name } = await c.req.json<{ email: string; password: string; name: string }>()

    if (!email || !password || !name) {
      return c.json({ success: false, error: 'Email, password and name are required' }, 400)
    }
    if (password.length < 8) {
      return c.json({ success: false, error: 'Password must be at least 8 characters' }, 400)
    }

    // Check if email already exists
    const existing = await getUserByEmail(c.env.DB, email)
    if (existing) {
      return c.json({ success: false, error: 'An account with this email already exists' }, 409)
    }

    const passwordHash = await hashPassword(password)
    const refCode = undefined // Could accept from body if needed
    await createEmailUser(c.env.DB, email, name, passwordHash, refCode)

    // Generate and send verification code
    const code = generateVerifyCode()
    await saveVerificationCode(c.env.DB, email, code, 'verify')
    const sent = await sendVerificationEmail(email, code, c.env)
    if (!sent) {
      console.error('Failed to send verification email to', email)
    }

    // Do NOT return token — user must verify email first
    return c.json({
      success: true,
      data: { needsVerification: true },
    })
  })

  // ─── Email: Login ───
  app.post('/login', async (c) => {
    const { email, password } = await c.req.json<{ email: string; password: string }>()

    if (!email || !password) {
      return c.json({ success: false, error: 'Email and password are required' }, 400)
    }

    const user = await getUserByEmail(c.env.DB, email)
    if (!user || !user.password_hash) {
      return c.json({ success: false, error: 'Invalid email or password' }, 401)
    }

    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      return c.json({ success: false, error: 'Invalid email or password' }, 401)
    }

    // Require email verification before login
    if (!user.email_verified) {
      // Resend verification code
      const code = generateVerifyCode()
      await saveVerificationCode(c.env.DB, email, code, 'verify')
      await sendVerificationEmail(email, code, c.env)
      return c.json({ success: false, error: 'Please verify your email first. A new code has been sent.', code: 'EMAIL_NOT_VERIFIED' }, 403)
    }

    // Update last login
    await c.env.DB
      .prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?')
      .bind(user.id)
      .run()

    const token = await generateToken(
      {
        user_id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar ?? undefined,
        provider: 'email',
        tier: user.tier,
      },
      c.env,
    )

    return c.json({
      success: true,
      data: { token, emailVerified: !!user.email_verified },
    })
  })

  // ─── Email: Send verification code ───
  app.post('/send-code', async (c) => {
    const { email } = await c.req.json<{ email: string }>()
    if (!email) return c.json({ success: false, error: 'Email is required' }, 400)

    const code = generateVerifyCode()
    await saveVerificationCode(c.env.DB, email, code, 'verify')
    const sent = await sendVerificationEmail(email, code, c.env)

    return c.json({ success: sent, error: sent ? undefined : 'Failed to send email' })
  })

  // ─── Email: Verify code ───
  app.post('/verify-email', async (c) => {
    const { email, code } = await c.req.json<{ email: string; code: string }>()
    if (!email || !code) return c.json({ success: false, error: 'Email and code are required' }, 400)

    const valid = await verifyCode(c.env.DB, email, code, 'verify')
    if (!valid) {
      return c.json({ success: false, error: 'Invalid or expired code' }, 400)
    }

    await markEmailVerified(c.env.DB, email)

    // Get user and generate token now that email is verified
    const user = await getUserByEmail(c.env.DB, email)
    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 404)
    }

    const token = await generateToken(
      {
        user_id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar ?? undefined,
        provider: 'email',
        tier: user.tier,
      },
      c.env,
    )

    return c.json({ success: true, data: { token } })
  })

  return app
}

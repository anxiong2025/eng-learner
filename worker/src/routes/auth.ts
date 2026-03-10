import { Hono } from 'hono'
import type { Env } from '../env'
import { generateToken, getAuthUser } from '../middleware/auth'
import { upsertUser, type DbUser } from '../db'

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

  return app
}

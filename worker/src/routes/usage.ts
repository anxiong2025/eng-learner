import { Hono } from 'hono'
import type { Env } from '../env'
import { requireAuth } from '../middleware/auth'
import * as db from '../db'

export function usageRoutes() {
  const app = new Hono<{ Bindings: Env }>()

  // ─── Get usage status ───
  app.get('/status', async (c) => {
    const auth = await requireAuth(c)
    if (auth instanceof Response) return auth

    try {
      const usage = await db.getDailyUsage(c.env.DB, auth.user_id)
      return c.json({ success: true, data: usage })
    } catch (e) {
      return c.json({ success: false, error: `Failed to get usage: ${e}` })
    }
  })

  return app
}

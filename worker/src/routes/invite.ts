import { Hono } from 'hono'
import type { Env } from '../env'
import { requireAuth } from '../middleware/auth'
import * as db from '../db'

export function inviteRoutes() {
  const app = new Hono<{ Bindings: Env }>()

  // ─── Get invite code ───
  app.get('/code', async (c) => {
    const auth = await requireAuth(c)
    if (auth instanceof Response) return auth

    try {
      const code = await db.getOrCreateInviteCode(c.env.DB, auth.user_id)
      return c.json({ success: true, data: { invite_code: code } })
    } catch (e) {
      return c.json({ success: false, error: `Failed to get invite code: ${e}` })
    }
  })

  // ─── Get invite stats ───
  app.get('/stats', async (c) => {
    const auth = await requireAuth(c)
    if (auth instanceof Response) return auth

    try {
      const inviteCount = await db.getInviteCount(c.env.DB, auth.user_id)
      const bonusQuota = await db.getBonusQuota(c.env.DB, auth.user_id)
      const inviteCode = await db.getOrCreateInviteCode(c.env.DB, auth.user_id)
      return c.json({
        success: true,
        data: {
          invite_code: inviteCode,
          invite_count: inviteCount,
          bonus_quota: bonusQuota,
        },
      })
    } catch (e) {
      return c.json({ success: false, error: `Failed to get invite stats: ${e}` })
    }
  })

  return app
}

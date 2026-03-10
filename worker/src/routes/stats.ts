import { Hono } from 'hono'
import type { Env } from '../env'
import { getOptionalAuth, requireAuth } from '../middleware/auth'
import * as db from '../db'

export function statsRoutes() {
  const app = new Hono<{ Bindings: Env }>()

  // ─── Today's stats ───
  app.get('/today', async (c) => {
    const { user_id } = await getOptionalAuth(c)

    try {
      const stats = await db.getTodayStats(c.env.DB, user_id)
      return c.json({ success: true, data: stats })
    } catch (e) {
      return c.json({ success: false, error: `Failed to get stats: ${e}` })
    }
  })

  // ─── Daily stats for chart ───
  app.get('/daily', async (c) => {
    const auth = await requireAuth(c)
    if (auth instanceof Response) return auth

    const days = parseInt(c.req.query('days') || '30')

    try {
      const stats = await db.getDailyStats(c.env.DB, auth.user_id, days)
      return c.json({ success: true, data: stats })
    } catch (e) {
      return c.json({ success: false, error: `Failed to get daily stats: ${e}` })
    }
  })

  // ─── User progress ───
  app.get('/progress', async (c) => {
    const auth = await requireAuth(c)
    if (auth instanceof Response) return auth

    try {
      const progress = await db.getUserProgress(c.env.DB, auth.user_id)
      return c.json({ success: true, data: progress })
    } catch (e) {
      return c.json({ success: false, error: `Failed to get progress: ${e}` })
    }
  })

  // ─── Overview stats ───
  app.get('/overview', async (c) => {
    const auth = await requireAuth(c)
    if (auth instanceof Response) return auth

    try {
      const overview = await db.getOverviewStats(c.env.DB, auth.user_id)
      return c.json({ success: true, data: overview })
    } catch (e) {
      return c.json({ success: false, error: `Failed to get overview: ${e}` })
    }
  })

  // ─── Memory distribution (spaced repetition intervals) ───
  app.get('/memory-distribution', async (c) => {
    const auth = await requireAuth(c)
    if (auth instanceof Response) return auth

    try {
      const distribution = await db.getMemoryDistribution(c.env.DB, auth.user_id)
      return c.json({ success: true, data: distribution })
    } catch (e) {
      return c.json({ success: false, error: `Failed to get distribution: ${e}` })
    }
  })

  return app
}

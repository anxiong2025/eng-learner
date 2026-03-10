import { Hono } from 'hono'
import type { Env } from '../env'
import { getOptionalAuth } from '../middleware/auth'
import * as db from '../db'

export function historyRoutes() {
  const app = new Hono<{ Bindings: Env }>()

  // ─── Add watch history ───
  app.post('/add', async (c) => {
    const { user_id } = await getOptionalAuth(c)
    const body = await c.req.json<{
      video_id: string
      title: string
      thumbnail?: string
    }>()

    try {
      await db.addWatchHistory(
        c.env.DB,
        user_id,
        body.video_id,
        body.title,
        body.thumbnail ?? '',
      )
      return c.json({ success: true, data: null })
    } catch (e) {
      return c.json({ success: false, error: `Failed to add history: ${e}` })
    }
  })

  // ─── Get watch history ───
  app.get('/list', async (c) => {
    const { user_id } = await getOptionalAuth(c)
    const limit = parseInt(c.req.query('limit') || '50')

    try {
      const history = await db.getWatchHistory(c.env.DB, user_id, limit)
      return c.json({ success: true, data: { history, total: history.length } })
    } catch (e) {
      return c.json({ success: false, error: `Failed to get history: ${e}` })
    }
  })

  // ─── Delete single history entry ───
  app.delete('/delete/:videoId', async (c) => {
    const { user_id } = await getOptionalAuth(c)
    const videoId = c.req.param('videoId')

    try {
      await db.deleteWatchHistory(c.env.DB, user_id, videoId)
      return c.json({ success: true, data: null })
    } catch (e) {
      return c.json({ success: false, error: `Failed to delete history: ${e}` })
    }
  })

  // ─── Clear all watch history ───
  app.delete('/clear', async (c) => {
    const { user_id } = await getOptionalAuth(c)

    try {
      await db.clearWatchHistory(c.env.DB, user_id)
      return c.json({ success: true, data: null })
    } catch (e) {
      return c.json({ success: false, error: `Failed to clear history: ${e}` })
    }
  })

  return app
}

import { Hono } from 'hono'
import type { Env } from '../env'
import { getOptionalAuth } from '../middleware/auth'
import { extractVideoId, fetchVideoInfo, fetchSubtitles } from '../services/youtube'
import * as db from '../db'

export function videoRoutes() {
  const app = new Hono<{ Bindings: Env }>()

  // ─── Parse video ───
  app.post('/parse', async (c) => {
    const { user_id, tier, isLoggedIn } = await getOptionalAuth(c)
    const { url } = await c.req.json<{ url: string }>()

    if (!url?.includes('youtube.com') && !url?.includes('youtu.be')) {
      return c.json({ success: false, error: 'Invalid YouTube URL' })
    }

    const videoId = extractVideoId(url.trim())
    if (!videoId) {
      return c.json({ success: false, error: 'Could not extract video ID' })
    }

    const DEMO_VIDEO_ID = 'zxMjOqM7DFs'
    const isDemo = videoId === DEMO_VIDEO_ID

    if (!isDemo && !isLoggedIn) {
      return c.json({
        success: false,
        error: 'Please sign in to watch this video.',
        code: 'LOGIN_REQUIRED',
      })
    }

    // Rate limit check
    let remaining = -1
    if (!isDemo) {
      const check = await db.checkCanParseVideo(c.env.DB, user_id, tier)
      if (!check.allowed) {
        return c.json({
          success: false,
          error: 'Daily limit reached. Please try again tomorrow or invite friends for more quota.',
          code: 'RATE_LIMIT_EXCEEDED',
        })
      }
      remaining = check.remaining
    }

    try {
      const info = await fetchVideoInfo(videoId, c.env)

      if (!isDemo) {
        await db.incrementVideoParseCount(c.env.DB, user_id)
      }

      return c.json({
        success: true,
        data: { ...info, usage: { remaining: remaining < 0 ? -1 : remaining } },
      })
    } catch (e) {
      return c.json({
        success: false,
        error: `Failed to fetch video info: ${e instanceof Error ? e.message : e}`,
      })
    }
  })

  // ─── Get subtitles ───
  app.get('/:video_id/subtitles', async (c) => {
    const videoId = c.req.param('video_id')
    const lang = c.req.query('lang') || 'en'

    // Check D1 cache first
    try {
      const cached = await db.getCachedSubtitles(c.env.DB, videoId, lang)
      if (cached) {
        return c.json({
          success: true,
          data: { video_id: videoId, subtitles: JSON.parse(cached), language: lang },
        })
      }
    } catch (_) {
      // Cache miss or error, proceed to fetch
    }

    try {
      const subtitles = await fetchSubtitles(videoId, lang, c.env)

      // Save to cache (fire and forget)
      c.executionCtx.waitUntil(
        db.saveSubtitlesCache(c.env.DB, videoId, lang, JSON.stringify(subtitles))
      )

      return c.json({
        success: true,
        data: { video_id: videoId, subtitles, language: lang },
      })
    } catch (e) {
      return c.json({
        success: false,
        error: `No ${lang} subtitles available: ${e instanceof Error ? e.message : e}`,
      })
    }
  })

  return app
}

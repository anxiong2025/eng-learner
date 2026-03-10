import { Hono } from 'hono'
import type { Env } from '../env'
import { getOptionalAuth } from '../middleware/auth'
import * as db from '../db'
import * as ai from '../services/ai'

export function aiRoutes() {
  const app = new Hono<{ Bindings: Env }>()

  // ─── Analyze highlights ───
  app.post('/analyze', async (c) => {
    const { subtitles } = await c.req.json<{ subtitles: ai.Subtitle[] }>()
    try {
      const highlights = await ai.analyzeHighlights(c.env, subtitles)
      return c.json({ success: true, data: { highlights } })
    } catch (e) {
      return c.json({ success: false, error: `Analysis failed: ${e}` })
    }
  })

  // ─── Ask question ───
  app.post('/ask', async (c) => {
    const { user_id, tier } = await getOptionalAuth(c)
    const { context, question } = await c.req.json<{ context: string; question: string }>()

    // Rate limit
    const check = await db.checkCanAiChat(c.env.DB, user_id, tier)
    if (!check.allowed) {
      return c.json({
        success: false,
        error: 'Daily AI chat limit reached. Please try again tomorrow.',
        code: 'RATE_LIMIT_EXCEEDED',
      })
    }

    try {
      const answer = await ai.askQuestion(c.env, context, question)
      await db.incrementAiChatCount(c.env.DB, user_id)
      return c.json({ success: true, data: { answer } })
    } catch (e) {
      return c.json({ success: false, error: `Question failed: ${e}` })
    }
  })

  // ─── Translate subtitles ───
  app.post('/translate', async (c) => {
    const { subtitles } = await c.req.json<{ subtitles: ai.Subtitle[] }>()
    try {
      const translations = await ai.translateSubtitles(c.env, subtitles)
      return c.json({ success: true, data: { translations } })
    } catch (e) {
      return c.json({ success: false, error: `Translation failed: ${e}` })
    }
  })

  // ─── Extract vocabulary ───
  app.post('/vocabulary', async (c) => {
    const { text } = await c.req.json<{ text: string }>()
    try {
      const vocabulary = await ai.extractVocabulary(c.env, text)
      return c.json({ success: true, data: { vocabulary } })
    } catch (e) {
      return c.json({ success: false, error: `Vocabulary extraction failed: ${e}` })
    }
  })

  // ─── Generate mindmap ───
  app.post('/mindmap', async (c) => {
    const { video_id, title, content, regenerate } = await c.req.json<{
      video_id: string
      title: string
      content: string
      regenerate?: boolean
    }>()

    if (!regenerate) {
      const cached = await db.getCachedMindmap(c.env.DB, video_id)
      if (cached) {
        return c.json({ success: true, data: { markdown: cached, cached: true } })
      }
    }

    try {
      const markdown = await ai.generateMindmap(c.env, title, content)
      await db.saveMindmapCache(c.env.DB, video_id, markdown)
      return c.json({ success: true, data: { markdown, cached: false } })
    } catch (e) {
      return c.json({ success: false, error: `Mind map generation failed: ${e}` })
    }
  })

  // ─── Generate slides ───
  app.post('/slides', async (c) => {
    const { video_id, title, content, regenerate } = await c.req.json<{
      video_id: string
      title: string
      content: string
      regenerate?: boolean
    }>()

    if (!regenerate) {
      const cached = await db.getCachedSlides(c.env.DB, video_id)
      if (cached) {
        try {
          const slides = JSON.parse(cached) as ai.Slide[]
          return c.json({ success: true, data: { slides, cached: true } })
        } catch {
          /* empty */
        }
      }
    }

    try {
      const slides = await ai.generateSlides(c.env, title, content)
      await db.saveSlidesCache(c.env.DB, video_id, JSON.stringify(slides))
      return c.json({ success: true, data: { slides, cached: false } })
    } catch (e) {
      return c.json({ success: false, error: `Slides generation failed: ${e}` })
    }
  })

  // ─── Generate chapters ───
  app.post('/chapters', async (c) => {
    const { subtitles } = await c.req.json<{ subtitles: ai.Subtitle[] }>()
    try {
      const chapters = await ai.generateChapters(c.env, subtitles)
      return c.json({ success: true, data: { chapters } })
    } catch (e) {
      return c.json({ success: false, error: `Chapter generation failed: ${e}` })
    }
  })

  return app
}

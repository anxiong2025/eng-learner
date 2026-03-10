import { Hono } from 'hono'
import type { Env } from '../env'
import { getOptionalAuth } from '../middleware/auth'
import * as db from '../db'

export function notesRoutes() {
  const app = new Hono<{ Bindings: Env }>()

  // ─── Save note ───
  app.post('/save', async (c) => {
    const { user_id } = await getOptionalAuth(c)
    const body = await c.req.json<{
      id: string
      video_id: string
      timestamp?: number
      english?: string
      chinese?: string
      note_text?: string
      images?: string
    }>()

    try {
      await db.saveNote(c.env.DB, {
        id: body.id,
        user_id,
        video_id: body.video_id,
        timestamp: body.timestamp ?? null,
        english: body.english ?? null,
        chinese: body.chinese ?? null,
        note_text: body.note_text ?? null,
        images: body.images ?? null,
        created_at: new Date().toISOString(),
      })
      await db.recordWordLearned(c.env.DB, user_id) // count as learning activity
      return c.json({ success: true, data: { id: body.id } })
    } catch (e) {
      return c.json({ success: false, error: `Failed to save note: ${e}` })
    }
  })

  // ─── List notes ───
  app.get('/list', async (c) => {
    const { user_id } = await getOptionalAuth(c)
    const videoId = c.req.query('video_id')

    try {
      const notes = videoId
        ? await db.getNotesByVideo(c.env.DB, user_id, videoId)
        : await db.getNotes(c.env.DB, user_id)
      return c.json({ success: true, data: { notes, total: notes.length } })
    } catch (e) {
      return c.json({ success: false, error: `Failed to list notes: ${e}` })
    }
  })

  // ─── Update note (upsert via saveNote) ───
  app.put('/update/:id', async (c) => {
    const { user_id } = await getOptionalAuth(c)
    const id = c.req.param('id')
    const body = await c.req.json<{
      video_id?: string
      timestamp?: number
      english?: string
      chinese?: string
      note_text?: string
      images?: string
    }>()

    try {
      await db.saveNote(c.env.DB, {
        id,
        user_id,
        video_id: body.video_id ?? '',
        timestamp: body.timestamp ?? null,
        english: body.english ?? null,
        chinese: body.chinese ?? null,
        note_text: body.note_text ?? null,
        images: body.images ?? null,
        created_at: new Date().toISOString(),
      })
      return c.json({ success: true, data: null })
    } catch (e) {
      return c.json({ success: false, error: `Failed to update note: ${e}` })
    }
  })

  // ─── Delete note ───
  app.delete('/delete/:id', async (c) => {
    const { user_id } = await getOptionalAuth(c)
    const id = c.req.param('id')

    try {
      await db.deleteNote(c.env.DB, user_id, id)
      return c.json({ success: true, data: null })
    } catch (e) {
      return c.json({ success: false, error: `Failed to delete note: ${e}` })
    }
  })

  return app
}

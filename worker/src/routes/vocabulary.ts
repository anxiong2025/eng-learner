import { Hono } from 'hono'
import type { Env } from '../env'
import { getOptionalAuth, requireAuth } from '../middleware/auth'
import * as db from '../db'
import * as ai from '../services/ai'

export function vocabularyRoutes() {
  const app = new Hono<{ Bindings: Env }>()

  // ─── Save vocabulary ───
  app.post('/save', async (c) => {
    const { user_id } = await getOptionalAuth(c)
    const body = await c.req.json<{
      word: string
      meaning: string
      level: string
      example?: string
      source_video_id?: string
      source_sentence?: string
    }>()

    try {
      const id = await db.saveVocabulary(
        c.env.DB,
        user_id,
        body.word,
        body.meaning,
        body.level,
        body.example,
        body.source_video_id,
        body.source_sentence,
      )
      await db.recordWordLearned(c.env.DB, user_id)
      return c.json({ success: true, data: { id } })
    } catch (e) {
      return c.json({ success: false, error: `Failed to save: ${e}` })
    }
  })

  // ─── List vocabulary ───
  app.get('/list', async (c) => {
    const { user_id } = await getOptionalAuth(c)
    const dueOnly = c.req.query('due_only') === 'true'

    try {
      const vocabulary = await db.getVocabularyList(c.env.DB, user_id, dueOnly)
      return c.json({ success: true, data: { vocabulary, total: vocabulary.length } })
    } catch (e) {
      return c.json({ success: false, error: `Failed to list: ${e}` })
    }
  })

  // ─── Review vocabulary ───
  app.post('/review', async (c) => {
    const { user_id } = await getOptionalAuth(c)
    const { vocab_id, quality } = await c.req.json<{ vocab_id: number; quality: number }>()

    try {
      await db.reviewVocabulary(c.env.DB, user_id, vocab_id, quality)
      await db.recordReview(c.env.DB, user_id, quality >= 2)
      return c.json({ success: true, data: null })
    } catch (e) {
      return c.json({ success: false, error: `Failed to review: ${e}` })
    }
  })

  // ─── Delete vocabulary ───
  app.delete('/delete/:id', async (c) => {
    const { user_id } = await getOptionalAuth(c)
    const id = parseInt(c.req.param('id'))

    try {
      await db.deleteVocabulary(c.env.DB, user_id, id)
      return c.json({ success: true, data: null })
    } catch (e) {
      return c.json({ success: false, error: `Failed to delete: ${e}` })
    }
  })

  // ─── Check vocabulary ───
  app.get('/check/:word', async (c) => {
    const { user_id } = await getOptionalAuth(c)
    const word = c.req.param('word')

    try {
      const saved = await db.isVocabularySaved(c.env.DB, user_id, word)
      return c.json({ success: true, data: { saved } })
    } catch (e) {
      return c.json({ success: false, error: `Failed to check: ${e}` })
    }
  })

  // ─── AI Review - Start session ───
  app.post('/ai-review', async (c) => {
    const auth = await requireAuth(c)
    if (auth instanceof Response) return auth

    const { vocab_ids } = await c.req.json<{ vocab_ids: number[] }>()
    const allVocab = await db.getVocabularyList(c.env.DB, auth.user_id, false)

    const vocabForReview: ai.VocabForReview[] = allVocab
      .filter((v) => vocab_ids.includes(v.id))
      .map((v) => ({
        id: v.id,
        word: v.word,
        meaning: v.meaning,
        source_sentence: v.source_sentence ?? undefined,
      }))

    if (vocabForReview.length === 0) {
      return c.json({ success: false, error: 'No vocabulary found for review' })
    }

    try {
      const questions = await ai.generateReviewQuestions(c.env, vocabForReview)
      const sessionId = crypto.randomUUID()
      return c.json({ success: true, data: { session_id: sessionId, questions } })
    } catch (e) {
      return c.json({ success: false, error: `Failed to generate questions: ${e}` })
    }
  })

  // ─── AI Review - Single question ───
  app.post('/ai-review/question', async (c) => {
    const auth = await requireAuth(c)
    if (auth instanceof Response) return auth

    const body = await c.req.json<{
      vocab_id: number
      word: string
      meaning: string
      source_sentence?: string
      question_type?: string
    }>()

    const types = ['meaning', 'usage', 'context', 'spelling']
    const qType = body.question_type ?? types[body.vocab_id % types.length]

    try {
      const question = await ai.generateReviewQuestion(
        c.env,
        { id: body.vocab_id, word: body.word, meaning: body.meaning, source_sentence: body.source_sentence },
        qType,
      )
      return c.json({ success: true, data: { question } })
    } catch (e) {
      return c.json({ success: false, error: `Failed to generate question: ${e}` })
    }
  })

  // ─── AI Review - Submit answer ───
  app.post('/ai-review/answer', async (c) => {
    const auth = await requireAuth(c)
    if (auth instanceof Response) return auth

    const { word, meaning, question, user_answer } = await c.req.json<{
      word: string
      meaning: string
      question: string
      user_answer: string
    }>()

    try {
      const evaluation = await ai.evaluateReviewAnswer(c.env, word, meaning, question, user_answer)
      return c.json({ success: true, data: evaluation })
    } catch (e) {
      return c.json({ success: false, error: `Failed to evaluate: ${e}` })
    }
  })

  // ─── Memory card ───
  app.post('/memory-card', async (c) => {
    const auth = await requireAuth(c)
    if (auth instanceof Response) return auth

    const { word, meaning, context } = await c.req.json<{
      word: string
      meaning: string
      context?: string
    }>()

    try {
      const card = await ai.generateMemoryCard(c.env, word, meaning, context)
      return c.json({ success: true, data: card })
    } catch (e) {
      return c.json({ success: false, error: `Failed to generate memory card: ${e}` })
    }
  })

  return app
}

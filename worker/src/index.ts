import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env } from './env'
import { cleanExpiredCache } from './db'
import { authRoutes } from './routes/auth'
import { videoRoutes } from './routes/video'
import { aiRoutes } from './routes/ai'
import { vocabularyRoutes } from './routes/vocabulary'
import { notesRoutes } from './routes/notes'
import { historyRoutes } from './routes/history'
import { statsRoutes } from './routes/stats'
import { usageRoutes } from './routes/usage'
import { inviteRoutes } from './routes/invite'
import { uploadRoutes } from './routes/upload'

const app = new Hono<{ Bindings: Env }>()

// ─── CORS ───
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
)

// ─── Health check ───
app.get('/', (c) => c.text('OK'))
app.get('/health', (c) => c.text('OK'))

// ─── API routes ───
app.route('/api/auth', authRoutes())
app.route('/api/video', videoRoutes())
app.route('/api/ai', aiRoutes())
app.route('/api/vocabulary', vocabularyRoutes())
app.route('/api/notes', notesRoutes())
app.route('/api/history', historyRoutes())
app.route('/api/stats', statsRoutes())
app.route('/api/usage', usageRoutes())
app.route('/api/invite', inviteRoutes())
app.route('/api/upload', uploadRoutes())

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      cleanExpiredCache(env.DB, 30).then((result) =>
        console.log('Cache cleanup:', result),
      ),
    )
  },
}

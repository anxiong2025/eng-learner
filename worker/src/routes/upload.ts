import { Hono } from 'hono'
import type { Env } from '../env'
import { requireAuth } from '../middleware/auth'

export function uploadRoutes() {
  const app = new Hono<{ Bindings: Env }>()

  // ─── Serve R2 file (public read) ───
  app.get('/file/:key{.+}', async (c) => {
    const key = c.req.param('key')
    const object = await c.env.R2.get(key)

    if (!object) {
      return c.json({ error: 'Not found' }, 404)
    }

    const headers = new Headers()
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream')
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')

    return new Response(object.body, { headers })
  })

  // ─── Upload image to R2 ───
  app.post('/image', async (c) => {
    const auth = await requireAuth(c)
    if (auth instanceof Response) return auth

    const contentType = c.req.header('content-type') || ''

    if (!contentType.includes('multipart/form-data')) {
      return c.json({ success: false, error: 'Expected multipart/form-data' }, 400)
    }

    try {
      const formData = await c.req.formData()
      const file = formData.get('file') as File | null

      if (!file) {
        return c.json({ success: false, error: 'No file provided' }, 400)
      }

      // Validate file type
      const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!allowed.includes(file.type)) {
        return c.json({ success: false, error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' }, 400)
      }

      // Validate file size (5MB max)
      const maxSize = 5 * 1024 * 1024
      if (file.size > maxSize) {
        return c.json({ success: false, error: 'File too large. Max 5MB.' }, 400)
      }

      // Generate unique key
      const ext = file.name.split('.').pop() || 'png'
      const key = `uploads/${auth.user_id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`

      // Upload to R2
      await c.env.R2.put(key, file.stream(), {
        httpMetadata: { contentType: file.type },
      })

      // Build public URL - serve through worker itself for reliability
      const workerUrl = new URL(c.req.url)
      const publicUrl = c.env.R2_PUBLIC_URL
        ? `${c.env.R2_PUBLIC_URL}/${key}`
        : `${workerUrl.origin}/api/upload/file/${key}`

      return c.json({
        success: true,
        data: { url: publicUrl, key },
      })
    } catch (e) {
      return c.json({ success: false, error: `Upload failed: ${e}` }, 500)
    }
  })

  return app
}

import type { Env } from '../env'

// ─── Types ───

interface VideoInfo {
  video_id: string
  title: string
  duration: number
  thumbnail: string
}

interface Subtitle {
  index: number
  start: number
  end: number
  text: string
  translation?: string
}

// ─── URL parsing ───

export function extractVideoId(url: string): string | null {
  if (url.includes('youtu.be/')) {
    return url.split('youtu.be/')[1]?.split(/[?&]/)[0] ?? null
  }
  if (url.includes('v=')) {
    return url.split('v=')[1]?.split(/[&#]/)[0] ?? null
  }
  return null
}

// ─── Supadata API ───

interface SupadataVideoResponse {
  title?: string
  duration?: number
  thumbnail?: string
}

interface SupadataSegment {
  text: string
  offset: number
  duration: number
}

interface SupadataTranscriptResponse {
  content?: SupadataSegment[]
}

async function fetchVideoInfoSupadata(videoId: string, apiKey: string): Promise<VideoInfo> {
  const res = await fetch(`https://api.supadata.ai/v1/youtube/video?id=${videoId}`, {
    headers: { 'x-api-key': apiKey },
  })

  if (!res.ok) {
    throw new Error(`Supadata API error (${res.status}): ${await res.text()}`)
  }

  const data = (await res.json()) as SupadataVideoResponse
  return {
    video_id: videoId,
    title: data.title ?? 'Unknown',
    duration: data.duration ?? 0,
    thumbnail:
      data.thumbnail ?? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
  }
}

async function fetchSubtitlesSupadata(
  videoId: string,
  lang: string,
  apiKey: string,
): Promise<Subtitle[]> {
  const res = await fetch(
    `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&lang=${lang}`,
    { headers: { 'x-api-key': apiKey } },
  )

  if (!res.ok) {
    throw new Error(`Supadata API error (${res.status}): ${await res.text()}`)
  }

  const data = (await res.json()) as SupadataTranscriptResponse
  const segments = data.content
  if (!segments) throw new Error('No transcript content')

  return segments.map((seg, i) => ({
    index: i,
    start: seg.offset / 1000,
    end: (seg.offset + seg.duration) / 1000,
    text: seg.text,
  }))
}

// ─── Apify API ───

interface ApifyVideoResponse {
  id?: string
  title?: string
  duration?: string
  thumbnailUrl?: string
  subtitles?: { language?: string; vtt?: string }[]
}

function parseDurationString(duration: string): number {
  const parts = duration.split(':')
  if (parts.length === 3) {
    return (
      parseFloat(parts[0]) * 3600 +
      parseFloat(parts[1]) * 60 +
      parseFloat(parts[2])
    )
  }
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
  }
  return 0
}

async function fetchVideoInfoApify(videoId: string, apiToken: string): Promise<VideoInfo> {
  const url = `https://api.apify.com/v2/acts/streamers~youtube-scraper/run-sync-get-dataset-items?token=${apiToken}`
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startUrls: [{ url: videoUrl }], maxResults: 1 }),
  })

  if (!res.ok) throw new Error(`Apify API error (${res.status})`)

  const data = (await res.json()) as ApifyVideoResponse[]
  const video = data[0]
  if (!video) throw new Error('No video data from Apify')

  return {
    video_id: video.id ?? videoId,
    title: video.title ?? 'Unknown',
    duration: video.duration ? parseDurationString(video.duration) : 0,
    thumbnail:
      video.thumbnailUrl ?? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
  }
}

async function fetchSubtitlesApify(
  videoId: string,
  lang: string,
  apiToken: string,
): Promise<Subtitle[]> {
  const url = `https://api.apify.com/v2/acts/streamers~youtube-scraper/run-sync-get-dataset-items?token=${apiToken}`
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
  const subLang = lang === 'zh' ? 'any' : lang

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startUrls: [{ url: videoUrl }],
      maxResults: 1,
      downloadSubtitles: true,
      subtitlesLanguage: subLang,
      subtitlesFormat: 'vtt',
    }),
  })

  if (!res.ok) throw new Error(`Apify API error (${res.status})`)

  const data = (await res.json()) as ApifyVideoResponse[]
  const video = data[0]
  if (!video?.subtitles) throw new Error('No subtitles from Apify')

  const subtitle = video.subtitles.find((s) => s.language === lang)
  if (!subtitle?.vtt) throw new Error(`No ${lang} subtitles found`)

  return parseVtt(subtitle.vtt)
}

// ─── VTT Parser ───

function parseVtt(content: string): Subtitle[] {
  const subtitles: Subtitle[] = []
  const lines = content.split('\n')
  const timestampRe = /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/
  const tagRe = /<[^>]+>/g

  let i = 0
  let index = 0

  while (i < lines.length) {
    const line = lines[i].trim()
    const match = timestampRe.exec(line)

    if (match) {
      const start = parseTimestamp(match[1])
      const end = parseTimestamp(match[2])
      const textParts: string[] = []

      i++
      while (i < lines.length) {
        const textLine = lines[i].trim()
        if (textLine === '' || timestampRe.test(textLine)) break
        const clean = textLine.replace(tagRe, '')
        if (clean) textParts.push(clean)
        i++
      }

      const text = textParts.join(' ').trim()
      if (text) {
        const last = subtitles[subtitles.length - 1]
        if (last && last.text === text) {
          last.end = end
        } else {
          subtitles.push({ index: index++, start, end, text })
        }
      }
    } else {
      i++
    }
  }

  return subtitles
}

function parseTimestamp(ts: string): number {
  const parts = ts.split(':')
  return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
}

// ─── Public API ───

export async function fetchVideoInfo(
  videoId: string,
  env: Env,
): Promise<VideoInfo> {
  // Try Supadata first (fast, reliable)
  if (env.SUPADATA_API_KEY) {
    try {
      return await fetchVideoInfoSupadata(videoId, env.SUPADATA_API_KEY)
    } catch (e) {
      console.warn('Supadata video info failed:', e)
    }
  }

  // Fallback to Apify
  if (env.APIFY_API_TOKEN) {
    try {
      return await fetchVideoInfoApify(videoId, env.APIFY_API_TOKEN)
    } catch (e) {
      console.warn('Apify video info failed:', e)
    }
  }

  throw new Error('Failed to fetch video info from all sources')
}

export async function fetchSubtitles(
  videoId: string,
  lang: string,
  env: Env,
): Promise<Subtitle[]> {
  // Try Supadata first
  if (env.SUPADATA_API_KEY) {
    try {
      return await fetchSubtitlesSupadata(videoId, lang, env.SUPADATA_API_KEY)
    } catch (e) {
      console.warn('Supadata subtitles failed:', e)
    }
  }

  // Fallback to Apify
  if (env.APIFY_API_TOKEN) {
    try {
      return await fetchSubtitlesApify(videoId, lang, env.APIFY_API_TOKEN)
    } catch (e) {
      console.warn('Apify subtitles failed:', e)
    }
  }

  throw new Error(`Failed to fetch ${lang} subtitles from all sources`)
}

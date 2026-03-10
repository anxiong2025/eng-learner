import type { Env } from '../env'

// ─── Types ───

export interface Subtitle {
  index: number
  start: number
  end: number
  text: string
}

export interface VocabularyItem {
  word: string
  meaning: string
  level: string
  example: string
}

export interface Slide {
  slide_type: string
  title: string
  subtitle?: string
  bullets: string[]
  notes?: string
}

export interface Chapter {
  title: string
  start_time: number
}

export interface ReviewQuestion {
  vocab_id: number
  word: string
  meaning: string
  source_sentence?: string
  question_type: string
  question: string
}

export interface ReviewEvaluation {
  is_correct: boolean
  feedback: string
  follow_up?: string
  quality: number
}

export interface MemoryCard {
  word: string
  phonetic?: string
  part_of_speech?: string
  meaning: string
  etymology?: string
  mnemonic?: string
  memory_story?: string
  example_sentence?: string
  visual_hint?: string
}

export interface VocabForReview {
  id: number
  word: string
  meaning: string
  source_sentence?: string
}

// ─── AI Provider Interface ───

interface AiProvider {
  call(prompt: string): Promise<string>
}

// ─── Provider Factory ───

function getProvider(env: Env): AiProvider {
  const provider = (env.AI_PROVIDER || 'gemini').toLowerCase()

  switch (provider) {
    case 'gemini':
      return new GeminiProvider(env.GEMINI_API_KEY)
    case 'claude':
      if (!env.CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY not set')
      return new ClaudeProvider(env.CLAUDE_API_KEY)
    case 'openai':
      if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')
      return new OpenAIProvider(env.OPENAI_API_KEY)
    default:
      throw new Error(`Unknown AI provider: ${provider}`)
  }
}

// ─── Gemini Provider ───

class GeminiProvider implements AiProvider {
  constructor(private apiKey: string) {}

  async call(prompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 8192 },
      }),
    })

    const data = (await res.json()) as {
      candidates?: { content: { parts: { text: string }[] } }[]
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('No response from Gemini')
    return text
  }
}

// ─── Claude Provider ───

class ClaudeProvider implements AiProvider {
  constructor(private apiKey: string) {}

  async call(prompt: string): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = (await res.json()) as { content: { text: string }[] }
    const text = data.content?.[0]?.text
    if (!text) throw new Error('No response from Claude')
    return text
  }
}

// ─── OpenAI Provider ───

class OpenAIProvider implements AiProvider {
  constructor(private apiKey: string) {}

  async call(prompt: string): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = (await res.json()) as {
      choices: { message: { content: string } }[]
    }
    const text = data.choices?.[0]?.message?.content
    if (!text) throw new Error('No response from OpenAI')
    return text
  }
}

// ─── JSON Parsing Helpers ───

function cleanJsonResponse(response: string): string {
  return response
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function extractJsonArray(response: string): string | null {
  const match = response.match(/\[[\s\S]*\]/)
  return match?.[0] ?? null
}

function extractJsonObject(response: string): string | null {
  const match = response.match(/\{[\s\S]*\}/)
  return match?.[0] ?? null
}

function safeParseArray<T>(response: string): T[] {
  const cleaned = cleanJsonResponse(response)
  try {
    return JSON.parse(cleaned) as T[]
  } catch {
    const extracted = extractJsonArray(cleaned)
    if (extracted) {
      try {
        return JSON.parse(extracted) as T[]
      } catch {
        /* empty */
      }
    }
    return []
  }
}

// ─── Subtitle Sampling ───

function sampleSubtitlesForChapters(subtitles: Subtitle[], maxChars: number): string {
  if (subtitles.length === 0) return ''
  const totalDuration = subtitles[subtitles.length - 1].end

  if (totalDuration < 600) {
    const text = subtitles.map((s) => `[${Math.round(s.start)}s] ${s.text}`).join('\n')
    return text.slice(0, maxChars)
  }

  const sampleInterval = Math.max(totalDuration / 200, 20)
  const sampled: string[] = []
  let nextTime = 0

  for (const subtitle of subtitles) {
    if (subtitle.start >= nextTime) {
      sampled.push(`[${Math.round(subtitle.start)}s] ${subtitle.text}`)
      nextTime = subtitle.start + sampleInterval
    }
  }

  const last = subtitles[subtitles.length - 1]
  const lastEntry = `[${Math.round(last.start)}s] ${last.text}`
  if (sampled[sampled.length - 1] !== lastEntry) sampled.push(lastEntry)

  return sampled.join('\n').slice(0, maxChars)
}

// ════════════════════════════════════════════════════════════
// Public AI Functions
// ════════════════════════════════════════════════════════════

export async function analyzeHighlights(
  env: Env,
  subtitles: Subtitle[],
): Promise<number[]> {
  const provider = getProvider(env)
  const text = subtitles.map((s, i) => `[${i}] ${s.text}`).join('\n')

  const prompt = `Analyze these English subtitles and identify 5-10 important sentences for English learners.
Return ONLY a JSON array of indices. Example: [0, 3, 7, 12, 15]

Subtitles:
${text}

Response:`

  const response = await provider.call(prompt)
  const match = response.match(/\[[\d,\s]+\]/)
  if (match) {
    try {
      return JSON.parse(match[0]) as number[]
    } catch {
      /* empty */
    }
  }
  return []
}

export async function askQuestion(
  env: Env,
  context: string,
  question: string,
): Promise<string> {
  const provider = getProvider(env)
  const prompt = `你是一位英语学习助手。用户正在观看英语视频并提问。

当前字幕上下文:
"${context}"

用户问题: ${question}

回答要求:
1. 如果问题与视频内容无关或是简单的闲聊（如"OK"、"好的"、"谢谢"），只需一句话简短回应
2. 只有当问题确实与视频内容或英语学习相关时，才详细解释
3. 回答要简洁，通常2-3句话足够，最多不超过100字
4. 解释词汇或语法时要结合视频上下文

用与问题相同的语言回答。`

  return provider.call(prompt)
}

export async function translateSubtitles(
  env: Env,
  subtitles: Subtitle[],
): Promise<string[]> {
  const provider = getProvider(env)
  const allTranslations: string[] = []

  for (let i = 0; i < subtitles.length; i += 20) {
    const chunk = subtitles.slice(i, i + 20)
    const texts = chunk.map((s, idx) => `[${idx}] ${s.text}`).join('\n')

    const prompt = `Translate the following English subtitles to Chinese (Simplified).
Keep translations natural and conversational.
Return ONLY a JSON array of translated strings, in the same order.

Subtitles:
${texts}

Example response format: ["翻译1", "翻译2", "翻译3"]

Response (JSON array only):`

    const response = await provider.call(prompt)
    const translations = safeParseArray<string>(response)

    // Pad with empty strings if needed
    while (translations.length < chunk.length) translations.push('')
    allTranslations.push(...translations.slice(0, chunk.length))
  }

  while (allTranslations.length < subtitles.length) allTranslations.push('')
  return allTranslations.slice(0, subtitles.length)
}

export async function extractVocabulary(
  env: Env,
  text: string,
): Promise<VocabularyItem[]> {
  const provider = getProvider(env)
  const prompt = `从以下英文内容中提取重点词汇和常用短语。

内容: "${text}"

提取要求:
1. 重点词汇：CET-4、CET-6、IELTS、TOEFL、GRE 核心词汇
2. 常用短语：实用固定搭配、习语、口语表达
3. 不要提取简单词（如 the, is, a, have, do）
4. 每项提供：词性+中文释义、等级、实用例句
5. 等级标记：CET-4、CET-6、IELTS、TOEFL、GRE、Phrase
6. 去重

返回JSON数组格式:
[{"word": "leverage", "meaning": "(v.) 充分利用", "level": "CET-6", "example": "Let's leverage this opportunity."}]

只返回JSON数组，不要其他内容:`

  const response = await provider.call(prompt)
  return safeParseArray<VocabularyItem>(response)
}

export async function generateMindmap(
  env: Env,
  title: string,
  content: string,
): Promise<string> {
  const provider = getProvider(env)
  const prompt = `基于以下视频内容，生成一个思维导图的 Markdown 格式。

视频标题: ${title}

视频字幕内容:
${content.slice(0, 8000)}

要求:
1. 用 Markdown 标题格式表示层级关系（# 一级, ## 二级, ### 三级）
2. 提取3-5个主要主题作为二级标题
3. 每个主题下列出2-4个关键点
4. 内容要精炼
5. 用中文输出，保留重要英文术语

请直接输出 Markdown 格式，不要其他解释:`

  return provider.call(prompt)
}

export async function generateSlides(
  env: Env,
  title: string,
  content: string,
): Promise<Slide[]> {
  const provider = getProvider(env)
  const prompt = `Generate presentation slides based on video content.

Video Title: ${title}
Content: ${content.slice(0, 12000)}

Requirements:
- Create 8-12 slides
- Structure: Title slide + 6-10 content slides + Summary slide
- Each slide: 3-5 bullet points
- Write in English
- Use notes field for key details

Return JSON array:
[{"slide_type": "title", "title": "Main Title", "subtitle": "Source", "bullets": [], "notes": null},
{"slide_type": "content", "title": "Key Point", "subtitle": null, "bullets": ["Description"], "notes": "Details"},
{"slide_type": "summary", "title": "Key Takeaways", "subtitle": null, "bullets": ["Takeaway"], "notes": null}]

Output JSON array only:`

  const response = await provider.call(prompt)
  const slides = safeParseArray<Slide>(response)
  if (slides.length === 0) throw new Error('Failed to parse slides from AI response')
  return slides
}

export async function generateChapters(
  env: Env,
  subtitles: Subtitle[],
): Promise<Chapter[]> {
  const provider = getProvider(env)
  const sampled = sampleSubtitlesForChapters(subtitles, 15000)
  const totalDuration = subtitles[subtitles.length - 1]?.end ?? 0
  const durationMin = Math.ceil(totalDuration / 60)

  const prompt = `Analyze these video subtitles and create 6-12 chapters.

Video duration: ~${durationMin} minutes
Subtitles (sampled):
${sampled}

Requirements:
1. Create 6-12 chapters covering the ENTIRE video
2. Clear, concise titles (English, max 6 words)
3. Use exact start_time in seconds
4. First chapter at 0, distribute across full duration

Return ONLY a JSON array:
[{"title": "Introduction", "start_time": 0}, {"title": "Main Topic", "start_time": 120}]

JSON array only:`

  const response = await provider.call(prompt)
  const chapters = safeParseArray<Chapter>(response)
  if (chapters.length === 0) throw new Error('Failed to parse chapters from AI response')
  return chapters
}

export async function generateReviewQuestion(
  env: Env,
  vocab: VocabForReview,
  questionType: string,
): Promise<ReviewQuestion> {
  const provider = getProvider(env)
  const contextHint = vocab.source_sentence ?? '无语境'

  const prompt = `你是一位友好的英语老师，正在帮学生复习单词。

单词: "${vocab.word}"
中文含义: "${vocab.meaning}"
原句语境: "${contextHint}"

请生成一个自然的复习问题。问题类型: ${questionType}
- meaning: 直接问这个词是什么意思
- usage: 让学生用这个词造一个句子
- context: 回顾语境，问学生是否记得这个词在原句中的意思
- spelling: 听写

要求: 用中文，友好简洁，不超过30字，不透露答案。
只返回问题本身:`

  const fallbackQuestions: Record<string, string> = {
    meaning: `「${vocab.word}」这个词是什么意思？`,
    usage: `用「${vocab.word}」造一个句子吧！`,
    context: `还记得「${vocab.word}」在视频里是什么意思吗？`,
    spelling: '听发音，把这个单词拼出来吧！',
  }

  let questionText: string
  try {
    questionText = (await provider.call(prompt)).trim()
  } catch {
    questionText = fallbackQuestions[questionType] ?? `「${vocab.word}」是什么意思？`
  }

  return {
    vocab_id: vocab.id,
    word: vocab.word,
    meaning: vocab.meaning,
    source_sentence: vocab.source_sentence,
    question_type: questionType,
    question: questionText,
  }
}

export async function generateReviewQuestions(
  env: Env,
  vocabList: VocabForReview[],
): Promise<ReviewQuestion[]> {
  const types = ['meaning', 'usage', 'context', 'spelling']
  const questions: ReviewQuestion[] = []

  for (let i = 0; i < vocabList.length; i++) {
    const q = await generateReviewQuestion(env, vocabList[i], types[i % types.length])
    questions.push(q)
  }

  return questions
}

export async function evaluateReviewAnswer(
  env: Env,
  word: string,
  meaning: string,
  question: string,
  userAnswer: string,
): Promise<ReviewEvaluation> {
  const provider = getProvider(env)
  const prompt = `你是一位友好的英语老师。评估学生的回答。

单词: "${word}"
中文含义: "${meaning}"
问题: "${question}"
学生回答: "${userAnswer}"

返回JSON:
{"is_correct": true/false, "feedback": "简短反馈(不超过20字)", "follow_up": "追问或null", "quality": 0-3}

0=完全不记得, 1=记得但困难, 2=基本掌握, 3=非常熟练
只返回JSON:`

  const response = await provider.call(prompt)
  const cleaned = cleanJsonResponse(response)

  try {
    return JSON.parse(cleaned) as ReviewEvaluation
  } catch {
    const extracted = extractJsonObject(cleaned)
    if (extracted) {
      try {
        return JSON.parse(extracted) as ReviewEvaluation
      } catch {
        /* empty */
      }
    }
  }

  return {
    is_correct: false,
    feedback: '我没能理解你的回答，请再试一次',
    quality: 1,
  }
}

export async function generateMemoryCard(
  env: Env,
  word: string,
  meaning: string,
  context?: string,
): Promise<MemoryCard> {
  const provider = getProvider(env)
  const contextText = context ?? 'No specific context'

  const prompt = `Generate vocabulary memory card. Word:"${word}" Meaning:"${meaning}" Context:"${contextText}"

Requirements: etymology (word roots analysis), real-life American example sentence

Return JSON:
{"phonetic":"IPA","part_of_speech":"pos","etymology":"word origin in English","example_sentence":"realistic American daily life sentence"}

Return ONLY the JSON:`

  const response = await provider.call(prompt)
  const cleaned = cleanJsonResponse(response)

  interface CardResponse {
    phonetic?: string
    part_of_speech?: string
    etymology?: string
    example_sentence?: string
  }

  let parsed: CardResponse | null = null
  try {
    parsed = JSON.parse(cleaned) as CardResponse
  } catch {
    const extracted = extractJsonObject(cleaned)
    if (extracted) {
      try {
        parsed = JSON.parse(extracted) as CardResponse
      } catch {
        /* empty */
      }
    }
  }

  return {
    word,
    meaning,
    phonetic: parsed?.phonetic,
    part_of_speech: parsed?.part_of_speech,
    etymology: parsed?.etymology,
    example_sentence: parsed?.example_sentence,
  }
}

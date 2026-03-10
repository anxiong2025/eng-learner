# Worker Backend — Cloudflare Workers + D1

TypeScript backend for **Eng Learner**, running on Cloudflare Workers with D1 (SQLite) and R2 storage.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Cloudflare Workers |
| Framework | [Hono](https://hono.dev) |
| Database | Cloudflare D1 (SQLite) |
| Storage | Cloudflare R2 |
| Auth | JWT (jose) + Google/GitHub OAuth |
| AI | Gemini 2.0 Flash / Claude 3 Haiku / GPT-3.5 |
| YouTube | Supadata API + Apify (fallback) |

## Project Structure

```
worker/
├── migrations/          # D1 SQL migrations
│   └── 0001_initial.sql
├── src/
│   ├── index.ts         # Entry point, Hono app, route mounting
│   ├── env.ts           # Env type definitions (bindings + vars)
│   ├── middleware/
│   │   └── auth.ts      # JWT generate/verify, requireAuth, getOptionalAuth
│   ├── db/
│   │   └── index.ts     # All database operations (~900 lines)
│   ├── routes/
│   │   ├── auth.ts      # Google & GitHub OAuth flows
│   │   ├── video.ts     # Video parse, subtitles
│   │   ├── ai.ts        # AI analyze, ask, translate, vocabulary, mindmap, slides
│   │   ├── vocabulary.ts# CRUD + SM-2 review + AI review questions + memory cards
│   │   ├── notes.ts     # CRUD with video filtering
│   │   ├── history.ts   # Watch history add/list/delete/clear
│   │   ├── stats.ts     # Today, daily, progress, overview, memory distribution
│   │   ├── usage.ts     # Rate limit status
│   │   ├── invite.ts    # Invite code + stats
│   │   └── upload.ts    # Image upload to R2
│   └── services/
│       ├── ai.ts        # 3 AI providers + all AI functions
│       └── youtube.ts   # Supadata + Apify transcript fetching
├── package.json
├── tsconfig.json
└── wrangler.toml        # Workers config, D1 & R2 bindings
```

## Quick Start

### Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`pnpm add -g wrangler`)
- Cloudflare account

### Setup

```bash
# From project root
pnpm install

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create eng-learner-db
# → Copy the database_id into wrangler.toml

# Create R2 bucket
wrangler r2 bucket create eng-learner-uploads

# Run database migrations
pnpm --filter worker db:migrate:remote

# Set secrets
wrangler secret put JWT_SECRET
wrangler secret put GEMINI_API_KEY
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put SUPADATA_API_KEY
# Optional:
wrangler secret put APIFY_API_TOKEN
wrangler secret put CLAUDE_API_KEY
wrangler secret put OPENAI_API_KEY
```

### Development

```bash
# Start local dev server with D1 local database
pnpm --filter worker dev

# Apply migrations to local D1
pnpm --filter worker db:migrate:local
```

The dev server runs at `http://localhost:8787`.

### Deploy

```bash
pnpm --filter worker deploy
```

Or push to `main` — GitHub Actions will auto-deploy if Worker files changed.

## API Endpoints

All endpoints are prefixed with `/api/`.

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/auth/google/callback` | — | Google OAuth callback |
| GET | `/api/auth/github/callback` | — | GitHub OAuth callback |
| GET | `/api/auth/me` | Required | Get current user info |

### Video
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/video/parse` | Optional | Parse YouTube URL → video info |
| POST | `/api/video/subtitles` | Optional | Fetch subtitles for video |

### AI
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/ai/analyze` | Required | Analyze highlighted text |
| POST | `/api/ai/ask` | Required | Ask a question (chat) |
| POST | `/api/ai/translate` | Required | Translate subtitles |
| POST | `/api/ai/vocabulary` | Required | Extract vocabulary from text |
| POST | `/api/ai/mindmap` | Required | Generate mindmap from subtitles |
| POST | `/api/ai/slides` | Required | Generate slides from subtitles |
| POST | `/api/ai/chapters` | Required | Generate chapter markers |

### Vocabulary
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/vocabulary/save` | Optional | Save a word |
| GET | `/api/vocabulary/list` | Optional | List vocabulary (optional `?due_only=true`) |
| POST | `/api/vocabulary/review` | Optional | Submit SM-2 review |
| DELETE | `/api/vocabulary/delete/:id` | Optional | Delete a word |
| GET | `/api/vocabulary/check/:word` | Optional | Check if word is saved |
| POST | `/api/vocabulary/ai-review` | Required | Start AI review session |
| POST | `/api/vocabulary/ai-review/question` | Required | Get single AI question |
| POST | `/api/vocabulary/ai-review/answer` | Required | Submit answer for evaluation |
| POST | `/api/vocabulary/memory-card` | Required | Generate memory card |

### Notes
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/notes/save` | Optional | Save/upsert a note |
| GET | `/api/notes/list` | Optional | List notes (optional `?video_id=`) |
| PUT | `/api/notes/update/:id` | Optional | Update a note |
| DELETE | `/api/notes/delete/:id` | Optional | Delete a note |

### History
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/history/add` | Optional | Add watch entry |
| GET | `/api/history/list` | Optional | List history (`?limit=50`) |
| DELETE | `/api/history/delete/:videoId` | Optional | Delete one entry |
| DELETE | `/api/history/clear` | Optional | Clear all history |

### Stats
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/stats/today` | Optional | Today's learning stats |
| GET | `/api/stats/daily` | Required | Daily stats chart data (`?days=30`) |
| GET | `/api/stats/progress` | Required | Streak, total words, etc. |
| GET | `/api/stats/overview` | Required | Overview summary |
| GET | `/api/stats/memory-distribution` | Required | Memory level distribution |

### Usage & Invite
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/usage/status` | Required | Daily rate limit status |
| GET | `/api/invite/code` | Required | Get invite code |
| GET | `/api/invite/stats` | Required | Invite count + bonus quota |

### Upload
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/upload/image` | Required | Upload image (multipart, max 5MB) |

## Database Schema

10 tables managed via D1 migrations:

- `users` — User accounts (Google/GitHub OAuth)
- `vocabulary` — Word definitions
- `user_vocabulary` — Per-user word state with SM-2 spaced repetition
- `learning_stats` — Daily learning metrics
- `user_progress` — Overall progress + streak tracking
- `notes` — User notes with video timestamps
- `watch_history` — Video watch history
- `daily_usage` — Rate limiting counters
- `video_mindmaps` — Cached AI-generated mindmaps
- `video_slides` — Cached AI-generated slides

## Rate Limits (Free Tier)

| Feature | Daily Limit |
|---------|-------------|
| Video parse | 5 + invite bonuses |
| AI chat | 20 |
| Invite bonus | +3 per invite (max 10 invites) |

Pro tier has no limits.

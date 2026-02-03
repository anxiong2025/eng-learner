# TubeMo - AI-Powered YouTube English Learning Assistant

Learn English by watching YouTube videos with AI-powered bilingual subtitles, mind maps, and smart vocabulary tools.

[中文文档](./README_zh.md)

## Demo

[![TubeMo Demo](https://img.youtube.com/vi/45WgxMtPf3U/maxresdefault.jpg)](https://youtu.be/45WgxMtPf3U)

👆 Click to watch the demo video

## Features

- **Bilingual Subtitles** - Real-time English-Chinese synchronized subtitles
- **AI Mind Map** - One-click knowledge graph generation
- **AI Slides** - Auto-generate presentation slides
- **Smart Vocabulary** - Spaced repetition with Ebbinghaus curve
- **AI Q&A** - Ask questions about video content

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  Frontend                                    │
│                        (React + TypeScript + Vite)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ VideoPlayer  │  │ TranscriptPanel│ │  MindMap     │  │ VocabularyPanel│  │
│  │ (YouTube API)│  │ (Subtitles)  │  │ (ReactFlow)  │  │ (Spaced Rep) │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                              │                                              │
│                      ┌───────┴───────┐                                      │
│                      │  Zustand Store │                                     │
│                      │  (State Mgmt)  │                                     │
│                      └───────┬───────┘                                      │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │ HTTP/REST
┌──────────────────────────────┼──────────────────────────────────────────────┐
│                              ▼                                              │
│                      ┌───────────────┐                                      │
│                      │   Axum Router │                                      │
│                      └───────┬───────┘                                      │
│                              │                                              │
│  ┌───────────────────────────┼───────────────────────────────┐              │
│  │                           │                               │              │
│  ▼                           ▼                               ▼              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐          │
│  │ Video Routes │    │ Auth Routes  │    │     AI Routes        │          │
│  │ - parse      │    │ - login      │    │ - mindmap generation │          │
│  │ - subtitles  │    │ - register   │    │ - Q&A chat           │          │
│  │ - transcript │    │ - session    │    │ - slides generation  │          │
│  └──────┬───────┘    └──────────────┘    └──────────┬───────────┘          │
│         │                                           │                       │
│         ▼                                           ▼                       │
│  ┌──────────────┐                          ┌──────────────────┐             │
│  │   yt-dlp     │                          │   AI Providers   │             │
│  │ (YouTube DL) │                          │ ┌──────────────┐ │             │
│  └──────────────┘                          │ │   Gemini     │ │             │
│                                            │ ├──────────────┤ │             │
│                                            │ │   Claude     │ │             │
│                                            │ ├──────────────┤ │             │
│                                            │ │   OpenAI     │ │             │
│                                            │ └──────────────┘ │             │
│                                            └──────────────────┘             │
│                              │                                              │
│                              ▼                                              │
│                      ┌───────────────┐                                      │
│                      │  PostgreSQL   │                                      │
│                      │  - users      │                                      │
│                      │  - videos     │                                      │
│                      │  - vocabulary │                                      │
│                      │  - notes      │                                      │
│                      └───────────────┘                                      │
│                                                                             │
│                           Backend (Rust + Axum)                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Backend | Frontend |
|---------|----------|
| Rust + Axum | React + TypeScript |
| PostgreSQL | TailwindCSS + shadcn/ui |
| Gemini/Claude/OpenAI | Zustand |
| yt-dlp | ReactFlow |

## Quick Start

### Prerequisites

- Rust 1.75+
- Node.js 18+
- PostgreSQL 14+
- yt-dlp

### 1. Install Dependencies

```bash
# macOS
brew install yt-dlp postgresql

# Linux (Ubuntu/Debian)
sudo apt install yt-dlp postgresql
```

### 2. Configure

```bash
# Create database
createdb eng_learner

# Configure backend
cd backend
cp .env.example .env
# Edit .env and add your API keys
```

### 3. Start

```bash
# Backend (Terminal 1)
cd backend && cargo run

# Frontend (Terminal 2)
cd frontend && npm install && npm run dev
```

Open http://localhost:3000 to start learning!

## Environment Variables

Configure in `backend/.env`:

```bash
# Database
DATABASE_URL=postgresql://localhost/eng_learner

# AI Provider (choose one: gemini, claude, openai)
AI_PROVIDER=gemini

# API Keys (add the one you're using)
GEMINI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
OPENAI_API_KEY=your_key
```

## Project Structure

```
eng-learner/
├── backend/
│   ├── src/
│   │   ├── main.rs          # Entry point
│   │   ├── routes/          # API routes
│   │   ├── db/              # Database operations
│   │   ├── ai/              # AI provider integrations
│   │   └── youtube/         # YouTube parsing
│   └── Cargo.toml
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Main app
│   │   ├── components/      # React components
│   │   ├── stores/          # Zustand stores
│   │   ├── hooks/           # Custom hooks
│   │   └── api/             # API client
│   └── package.json
└── README.md
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

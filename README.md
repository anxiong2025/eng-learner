# English Learner - YouTube 英语学习助手

通过 YouTube 视频学习英语的智能工具，支持双语字幕、AI 重点标注、智能问答。

## 功能特性

- **双语字幕** - 英文/中文/双语模式切换，实时同步高亮
- **AI 重点标注** - 自动识别重点句子，波浪线标注
- **暂停问 AI** - 暂停视频，针对当前句子向 AI 提问
- **笔记收藏** - 一键收藏句子到笔记本

## 技术栈

- **后端**: Rust + Axum
- **前端**: React 18 + TypeScript + Vite
- **样式**: TailwindCSS + shadcn/ui
- **状态管理**: Zustand
- **AI**: Gemini / Claude / OpenAI (可切换)

## 快速开始

### 环境要求

- Rust 1.70+
- Node.js 18+
- pnpm / npm
- yt-dlp (用于获取字幕)

### 安装 yt-dlp

```bash
# macOS
brew install yt-dlp

# Linux
sudo apt install yt-dlp

# Windows
winget install yt-dlp
```

### 配置环境变量

```bash
cd backend
cp .env.example .env
# 编辑 .env 文件，填入你的 API Key
```

### 启动后端

```bash
cd backend
cargo run
# 服务运行在 http://localhost:3001
```

### 启动前端

```bash
cd frontend
npm install
npm run dev
# 服务运行在 http://localhost:3000
```

## 项目结构

```
eng-learner/
├── backend/                   # Rust Axum 后端
│   ├── src/
│   │   ├── main.rs           # 入口
│   │   ├── routes/           # API 路由
│   │   │   ├── video.rs      # 视频/字幕 API
│   │   │   └── ai.rs         # AI 服务 API
│   │   ├── services/
│   │   │   ├── youtube.rs    # YouTube 字幕获取
│   │   │   └── ai.rs         # AI 多服务商支持
│   │   └── models/
│   │       └── mod.rs        # 数据模型
│   ├── .env                  # 环境变量
│   └── Cargo.toml
├── frontend/                  # React 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── VideoPlayer/  # YouTube 播放器
│   │   │   ├── SubtitlePanel/# 字幕面板
│   │   │   ├── AIChat/       # AI 问答
│   │   │   └── ui/           # shadcn/ui 组件
│   │   ├── stores/           # Zustand 状态
│   │   ├── api/              # API 客户端
│   │   └── types/            # TypeScript 类型
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## API 接口

### 视频解析
```
POST /api/video/parse
Body: { "url": "https://www.youtube.com/watch?v=xxx" }
Response: { "success": true, "data": { "video_id", "title", "duration" } }
```

### 获取字幕
```
GET /api/video/:videoId/subtitles?lang=en
Response: { "success": true, "data": { "subtitles": [...] } }
```

### AI 分析重点
```
POST /api/ai/analyze
Body: { "subtitles": [...] }
Response: { "success": true, "data": { "highlights": [0, 3, 7] } }
```

### AI 问答
```
POST /api/ai/ask
Body: { "context": "...", "question": "What does this mean?" }
Response: { "success": true, "data": { "answer": "..." } }
```

---

## 开发进度

### ✅ 已完成

**后端**
- [x] 项目架构搭建
- [x] 视频解析 API
- [x] YouTube 字幕获取 (yt-dlp)
- [x] VTT 字幕解析
- [x] 多 AI 服务商支持 (Gemini/Claude/OpenAI)
- [x] AI 重点分析接口
- [x] AI 问答接口

**前端**
- [x] 项目架构 (Vite + React + TypeScript)
- [x] UI 组件库 (shadcn/ui)
- [x] YouTube 播放器嵌入
- [x] 字幕面板 (EN/CN/Both 模式)
- [x] 字幕同步高亮
- [x] 点击字幕跳转
- [x] AI 聊天组件
- [x] 重点句子波浪线标注
- [x] 收藏按钮 (UI)

### 🚧 进行中 (MVP)

- [x] 中文翻译服务 (AI 自动翻译)
- [ ] 笔记 API (保存/获取/删除)
- [ ] 数据库持久化 (SQLite)
- [ ] 笔记面板 UI
- [ ] 笔记导出 (Markdown)

### 📋 计划中

**Phase 2: 学习增强**
- [ ] 单词查询 (点击单词查释义)
- [ ] 循环播放 (A-B 循环)
- [ ] 播放速度控制
- [ ] 键盘快捷键

**Phase 3: 复习系统**
- [ ] 间隔重复 (Anki 风格)
- [ ] 学习统计
- [ ] 进度追踪

**Phase 4: 用户系统**
- [ ] 用户注册/登录
- [ ] 云端同步
- [ ] 学习计划

**Phase 5: 平台扩展**
- [x] 移动端适配 (响应式布局)
- [ ] PWA 支持
- [ ] Tauri 桌面版
- [ ] 浏览器插件

---

## 配置说明

### AI 服务商切换

在 `backend/.env` 中配置：

```bash
# 支持: gemini, claude, openai
AI_PROVIDER=gemini

# Google Gemini
GEMINI_API_KEY=your_key_here

# Anthropic Claude (可选)
CLAUDE_API_KEY=your_key_here

# OpenAI (可选)
OPENAI_API_KEY=your_key_here
```

---

## License

MIT

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::env;

use crate::models::Subtitle;

/// Vocabulary item extracted from subtitle
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VocabularyItem {
    pub word: String,
    pub meaning: String,
    pub level: String,  // "雅思", "四级", "六级", "托福", "日常"
    pub example: String,
}

/// AI Provider trait - implement this for each provider
#[async_trait]
pub trait AiProvider: Send + Sync {
    /// Analyze subtitles and return indices of important sentences
    async fn analyze_highlights(&self, subtitles: &[Subtitle]) -> Result<Vec<usize>>;

    /// Answer a question about the given context
    async fn ask_question(&self, context: &str, question: &str) -> Result<String>;

    /// Translate subtitles to Chinese
    async fn translate_subtitles(&self, subtitles: &[Subtitle]) -> Result<Vec<String>>;

    /// Extract important vocabulary from subtitle text
    async fn extract_vocabulary(&self, text: &str) -> Result<Vec<VocabularyItem>>;
}

/// Get the configured AI provider
pub fn get_ai_provider() -> Result<Box<dyn AiProvider>> {
    let provider = env::var("AI_PROVIDER").unwrap_or_else(|_| "gemini".to_string());

    match provider.to_lowercase().as_str() {
        "gemini" => {
            let api_key = env::var("GEMINI_API_KEY")
                .map_err(|_| anyhow!("GEMINI_API_KEY not set"))?;
            Ok(Box::new(GeminiProvider::new(api_key)))
        }
        "claude" => {
            let api_key = env::var("CLAUDE_API_KEY")
                .map_err(|_| anyhow!("CLAUDE_API_KEY not set"))?;
            Ok(Box::new(ClaudeProvider::new(api_key)))
        }
        "openai" => {
            let api_key = env::var("OPENAI_API_KEY")
                .map_err(|_| anyhow!("OPENAI_API_KEY not set"))?;
            Ok(Box::new(OpenAIProvider::new(api_key)))
        }
        _ => Err(anyhow!("Unknown AI provider: {}", provider)),
    }
}

// ============================================================================
// Gemini Provider
// ============================================================================

pub struct GeminiProvider {
    api_key: String,
    client: Client,
}

impl GeminiProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: Client::new(),
        }
    }
}

#[derive(Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
}

#[derive(Serialize)]
struct GeminiContent {
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
struct GeminiPart {
    text: String,
}

#[derive(Deserialize)]
struct GeminiResponse {
    candidates: Option<Vec<GeminiCandidate>>,
}

#[derive(Deserialize)]
struct GeminiCandidate {
    content: GeminiContentResponse,
}

#[derive(Deserialize)]
struct GeminiContentResponse {
    parts: Vec<GeminiPartResponse>,
}

#[derive(Deserialize)]
struct GeminiPartResponse {
    text: String,
}

#[async_trait]
impl AiProvider for GeminiProvider {
    async fn analyze_highlights(&self, subtitles: &[Subtitle]) -> Result<Vec<usize>> {
        let subtitle_text: String = subtitles
            .iter()
            .enumerate()
            .map(|(i, s)| format!("[{}] {}", i, s.text))
            .collect::<Vec<_>>()
            .join("\n");

        let prompt = format!(
            r#"Analyze these English subtitles from a video and identify the most important/educational sentences for English learners.

Subtitles:
{}

Return ONLY a JSON array of indices (numbers) for the 5-10 most important sentences.
Important sentences include: key phrases, idiomatic expressions, useful grammar patterns, or main points.

Example response: [0, 3, 7, 12, 15]

Response:"#,
            subtitle_text
        );

        let response = self.call_gemini(&prompt).await?;

        // Parse the response to extract indices
        let indices: Vec<usize> = serde_json::from_str(&response)
            .or_else(|_| {
                // Try to extract array from response
                let re = regex::Regex::new(r"\[[\d,\s]+\]").unwrap();
                if let Some(mat) = re.find(&response) {
                    serde_json::from_str(mat.as_str())
                } else {
                    Ok(vec![])
                }
            })
            .unwrap_or_default();

        Ok(indices)
    }

    async fn ask_question(&self, context: &str, question: &str) -> Result<String> {
        let prompt = format!(
            r#"You are an English learning assistant. The user is watching a video and has a question.

Current subtitle context:
"{}"

User's question: {}

Please provide a helpful answer that:
1. Directly answers the question
2. Explains any vocabulary or grammar if relevant
3. Gives examples if helpful
4. Keep the response concise but informative

Answer in the same language as the question."#,
            context, question
        );

        self.call_gemini(&prompt).await
    }

    async fn translate_subtitles(&self, subtitles: &[Subtitle]) -> Result<Vec<String>> {
        // Batch subtitles for efficient translation (max 20 per batch)
        let mut all_translations = Vec::new();

        for chunk in subtitles.chunks(20) {
            let texts: Vec<String> = chunk
                .iter()
                .enumerate()
                .map(|(i, s)| format!("[{}] {}", i, s.text))
                .collect();

            let prompt = format!(
                r#"Translate the following English subtitles to Chinese (Simplified).
Keep translations natural and conversational.
Return ONLY a JSON array of translated strings, in the same order.

Subtitles:
{}

Example response format: ["翻译1", "翻译2", "翻译3"]

Response (JSON array only):"#,
                texts.join("\n")
            );

            let response = self.call_gemini(&prompt).await?;

            // Parse JSON array from response
            let translations: Vec<String> = parse_translation_response(&response, chunk.len());

            all_translations.extend(translations);
        }

        // Ensure we have the right number of translations
        while all_translations.len() < subtitles.len() {
            all_translations.push("翻译失败".to_string());
        }
        all_translations.truncate(subtitles.len());

        Ok(all_translations)
    }

    async fn extract_vocabulary(&self, text: &str) -> Result<Vec<VocabularyItem>> {
        let prompt = format!(
            r#"从以下英文句子中提取重点词汇（雅思、托福、四级、六级核心词汇或实用口语表达）。

句子: "{}"

要求:
1. 只提取真正有学习价值的词汇（不要提取简单词如 the, is, a）
2. 每个词汇提供：词性+中文释义、词汇等级、一个口语化的例句
3. 例句要简短、日常化、适合口语交流
4. 如果没有重点词汇，返回空数组

返回JSON数组格式:
[
  {{"word": "harness", "meaning": "(v.) 利用，驾驭", "level": "雅思", "example": "I want to harness AI to boost my productivity."}},
  {{"word": "leverage", "meaning": "(v.) 充分利用", "level": "四级", "example": "Let's leverage this opportunity to grow."}}
]

只返回JSON数组，不要其他内容:"#,
            text
        );

        let response = self.call_gemini(&prompt).await?;

        // Parse JSON response
        let items: Vec<VocabularyItem> = parse_vocabulary_response(&response);
        Ok(items)
    }
}

impl GeminiProvider {
    async fn call_gemini(&self, prompt: &str) -> Result<String> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={}",
            self.api_key
        );

        let request = GeminiRequest {
            contents: vec![GeminiContent {
                parts: vec![GeminiPart {
                    text: prompt.to_string(),
                }],
            }],
        };

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await?
            .json::<GeminiResponse>()
            .await?;

        let text = response
            .candidates
            .and_then(|c| c.into_iter().next())
            .and_then(|c| c.content.parts.into_iter().next())
            .map(|p| p.text)
            .ok_or_else(|| anyhow!("No response from Gemini"))?;

        Ok(text)
    }
}

// ============================================================================
// Claude Provider (placeholder)
// ============================================================================

pub struct ClaudeProvider {
    api_key: String,
    client: Client,
}

impl ClaudeProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: Client::new(),
        }
    }
}

#[async_trait]
impl AiProvider for ClaudeProvider {
    async fn analyze_highlights(&self, subtitles: &[Subtitle]) -> Result<Vec<usize>> {
        let subtitle_text: String = subtitles
            .iter()
            .enumerate()
            .map(|(i, s)| format!("[{}] {}", i, s.text))
            .collect::<Vec<_>>()
            .join("\n");

        let prompt = format!(
            r#"Analyze these English subtitles and identify 5-10 important sentences for English learners.
Return ONLY a JSON array of indices.

Subtitles:
{}

Response (JSON array only):"#,
            subtitle_text
        );

        let response = self.call_claude(&prompt).await?;

        let re = regex::Regex::new(r"\[[\d,\s]+\]").unwrap();
        let indices: Vec<usize> = re
            .find(&response)
            .and_then(|m| serde_json::from_str(m.as_str()).ok())
            .unwrap_or_default();

        Ok(indices)
    }

    async fn ask_question(&self, context: &str, question: &str) -> Result<String> {
        let prompt = format!(
            r#"You are an English learning assistant.

Context: "{}"
Question: {}

Provide a helpful, concise answer."#,
            context, question
        );

        self.call_claude(&prompt).await
    }

    async fn translate_subtitles(&self, subtitles: &[Subtitle]) -> Result<Vec<String>> {
        let mut all_translations = Vec::new();

        for chunk in subtitles.chunks(20) {
            let texts: Vec<String> = chunk
                .iter()
                .enumerate()
                .map(|(i, s)| format!("[{}] {}", i, s.text))
                .collect();

            let prompt = format!(
                r#"Translate these English subtitles to Chinese (Simplified).
Return ONLY a JSON array of translated strings.

Subtitles:
{}

Response (JSON array only):"#,
                texts.join("\n")
            );

            let response = self.call_claude(&prompt).await?;
            let translations = parse_translation_response(&response, chunk.len());
            all_translations.extend(translations);
        }

        while all_translations.len() < subtitles.len() {
            all_translations.push("翻译失败".to_string());
        }
        all_translations.truncate(subtitles.len());

        Ok(all_translations)
    }

    async fn extract_vocabulary(&self, text: &str) -> Result<Vec<VocabularyItem>> {
        let prompt = format!(
            r#"Extract important vocabulary (IELTS, TOEFL, CET-4/6) from this sentence: "{}"
Return JSON array: [{{"word": "...", "meaning": "(v.) Chinese meaning", "level": "雅思/四级/六级/托福", "example": "Short daily example"}}]
Only return JSON array:"#,
            text
        );

        let response = self.call_claude(&prompt).await?;
        Ok(parse_vocabulary_response(&response))
    }
}

impl ClaudeProvider {
    async fn call_claude(&self, prompt: &str) -> Result<String> {
        #[derive(Serialize)]
        struct ClaudeRequest {
            model: String,
            max_tokens: u32,
            messages: Vec<ClaudeMessage>,
        }

        #[derive(Serialize)]
        struct ClaudeMessage {
            role: String,
            content: String,
        }

        #[derive(Deserialize)]
        struct ClaudeResponse {
            content: Vec<ClaudeContent>,
        }

        #[derive(Deserialize)]
        struct ClaudeContent {
            text: String,
        }

        let request = ClaudeRequest {
            model: "claude-3-haiku-20240307".to_string(),
            max_tokens: 1024,
            messages: vec![ClaudeMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
        };

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await?
            .json::<ClaudeResponse>()
            .await?;

        response
            .content
            .into_iter()
            .next()
            .map(|c| c.text)
            .ok_or_else(|| anyhow!("No response from Claude"))
    }
}

// ============================================================================
// OpenAI Provider (placeholder)
// ============================================================================

pub struct OpenAIProvider {
    api_key: String,
    client: Client,
}

impl OpenAIProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: Client::new(),
        }
    }
}

#[async_trait]
impl AiProvider for OpenAIProvider {
    async fn analyze_highlights(&self, subtitles: &[Subtitle]) -> Result<Vec<usize>> {
        let subtitle_text: String = subtitles
            .iter()
            .enumerate()
            .map(|(i, s)| format!("[{}] {}", i, s.text))
            .collect::<Vec<_>>()
            .join("\n");

        let prompt = format!(
            r#"Analyze these English subtitles and identify 5-10 important sentences for English learners.
Return ONLY a JSON array of indices.

Subtitles:
{}

Response:"#,
            subtitle_text
        );

        let response = self.call_openai(&prompt).await?;

        let re = regex::Regex::new(r"\[[\d,\s]+\]").unwrap();
        let indices: Vec<usize> = re
            .find(&response)
            .and_then(|m| serde_json::from_str(m.as_str()).ok())
            .unwrap_or_default();

        Ok(indices)
    }

    async fn ask_question(&self, context: &str, question: &str) -> Result<String> {
        let prompt = format!(
            r#"You are an English learning assistant.

Context: "{}"
Question: {}

Provide a helpful, concise answer."#,
            context, question
        );

        self.call_openai(&prompt).await
    }

    async fn translate_subtitles(&self, subtitles: &[Subtitle]) -> Result<Vec<String>> {
        let mut all_translations = Vec::new();

        for chunk in subtitles.chunks(20) {
            let texts: Vec<String> = chunk
                .iter()
                .enumerate()
                .map(|(i, s)| format!("[{}] {}", i, s.text))
                .collect();

            let prompt = format!(
                r#"Translate these English subtitles to Chinese (Simplified).
Return ONLY a JSON array of translated strings.

Subtitles:
{}

Response (JSON array only):"#,
                texts.join("\n")
            );

            let response = self.call_openai(&prompt).await?;
            let translations = parse_translation_response(&response, chunk.len());
            all_translations.extend(translations);
        }

        while all_translations.len() < subtitles.len() {
            all_translations.push("翻译失败".to_string());
        }
        all_translations.truncate(subtitles.len());

        Ok(all_translations)
    }

    async fn extract_vocabulary(&self, text: &str) -> Result<Vec<VocabularyItem>> {
        let prompt = format!(
            r#"Extract important vocabulary (IELTS, TOEFL, CET-4/6) from this sentence: "{}"
Return JSON array: [{{"word": "...", "meaning": "(v.) Chinese meaning", "level": "雅思/四级/六级/托福", "example": "Short daily example"}}]
Only return JSON array:"#,
            text
        );

        let response = self.call_openai(&prompt).await?;
        Ok(parse_vocabulary_response(&response))
    }
}

impl OpenAIProvider {
    async fn call_openai(&self, prompt: &str) -> Result<String> {
        #[derive(Serialize)]
        struct OpenAIRequest {
            model: String,
            messages: Vec<OpenAIMessage>,
        }

        #[derive(Serialize)]
        struct OpenAIMessage {
            role: String,
            content: String,
        }

        #[derive(Deserialize)]
        struct OpenAIResponse {
            choices: Vec<OpenAIChoice>,
        }

        #[derive(Deserialize)]
        struct OpenAIChoice {
            message: OpenAIMessageResponse,
        }

        #[derive(Deserialize)]
        struct OpenAIMessageResponse {
            content: String,
        }

        let request = OpenAIRequest {
            model: "gpt-3.5-turbo".to_string(),
            messages: vec![OpenAIMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
        };

        let response = self
            .client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&request)
            .send()
            .await?
            .json::<OpenAIResponse>()
            .await?;

        response
            .choices
            .into_iter()
            .next()
            .map(|c| c.message.content)
            .ok_or_else(|| anyhow!("No response from OpenAI"))
    }
}

/// Helper function to parse translation response from AI
fn parse_translation_response(response: &str, expected_count: usize) -> Vec<String> {
    // Try to parse directly as JSON array
    if let Ok(translations) = serde_json::from_str::<Vec<String>>(response) {
        return translations;
    }

    // Clean up the response - remove markdown code blocks
    let cleaned = response
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    // Try parsing cleaned response
    if let Ok(translations) = serde_json::from_str::<Vec<String>>(cleaned) {
        return translations;
    }

    // Try to extract JSON array using regex (multiline support)
    let re = regex::Regex::new(r"(?s)\[[\s\S]*\]").unwrap();
    if let Some(mat) = re.find(cleaned) {
        if let Ok(translations) = serde_json::from_str::<Vec<String>>(mat.as_str()) {
            return translations;
        }
    }

    // Log the failed response for debugging
    tracing::warn!("Failed to parse translation response: {}", &response[..response.len().min(200)]);

    // Return fallback
    vec!["翻译失败".to_string(); expected_count]
}

/// Helper function to parse vocabulary response from AI
fn parse_vocabulary_response(response: &str) -> Vec<VocabularyItem> {
    // Try to parse directly as JSON array
    if let Ok(items) = serde_json::from_str::<Vec<VocabularyItem>>(response) {
        return items;
    }

    // Clean up the response - remove markdown code blocks
    let cleaned = response
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    // Try parsing cleaned response
    if let Ok(items) = serde_json::from_str::<Vec<VocabularyItem>>(cleaned) {
        return items;
    }

    // Try to extract JSON array using regex (multiline support)
    let re = regex::Regex::new(r"(?s)\[[\s\S]*\]").unwrap();
    if let Some(mat) = re.find(cleaned) {
        if let Ok(items) = serde_json::from_str::<Vec<VocabularyItem>>(mat.as_str()) {
            return items;
        }
    }

    // Log the failed response for debugging
    tracing::warn!("Failed to parse vocabulary response: {}", &response[..response.len().min(200)]);

    // Return empty
    vec![]
}

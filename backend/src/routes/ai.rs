use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};

use crate::auth::OptionalAuthUser;
use crate::db::{DbPool, get_cached_mindmap, save_mindmap_cache, get_cached_slides, save_slides_cache, check_can_ai_chat, increment_ai_chat_count};
use crate::models::{ApiResponse, Subtitle};
use crate::services::ai::{get_ai_provider, Chapter, Slide, VocabularyItem};

pub fn routes(db_pool: DbPool) -> Router {
    Router::new()
        .route("/analyze", post(analyze_highlights))
        .route("/ask", post(ask_question))
        .route("/translate", post(translate_subtitles))
        .route("/vocabulary", post(extract_vocabulary))
        .route("/mindmap", post(generate_mindmap))
        .route("/slides", post(generate_slides))
        .route("/chapters", post(generate_chapters))
        .with_state(db_pool)
}

#[derive(Deserialize)]
pub struct AnalyzeRequest {
    subtitles: Vec<Subtitle>,
}

#[derive(Serialize)]
pub struct AnalyzeResponse {
    highlights: Vec<usize>,
}

async fn analyze_highlights(
    Json(payload): Json<AnalyzeRequest>,
) -> Json<ApiResponse<AnalyzeResponse>> {
    let provider = match get_ai_provider() {
        Ok(p) => p,
        Err(e) => return Json(ApiResponse::error(format!("AI provider error: {}", e))),
    };

    match provider.analyze_highlights(&payload.subtitles).await {
        Ok(highlights) => Json(ApiResponse::success(AnalyzeResponse { highlights })),
        Err(e) => Json(ApiResponse::error(format!("Analysis failed: {}", e))),
    }
}

#[derive(Deserialize)]
pub struct AskRequest {
    context: String,
    question: String,
}

#[derive(Serialize)]
pub struct AskResponse {
    answer: String,
}

async fn ask_question(
    State(pool): State<DbPool>,
    auth: OptionalAuthUser,
    Json(payload): Json<AskRequest>,
) -> Json<ApiResponse<AskResponse>> {
    let user_id = auth.user_id_or_default();
    let tier = auth.tier_or_default();

    // Check rate limit
    match check_can_ai_chat(&pool, user_id, &tier).await {
        Ok((allowed, _remaining)) => {
            if !allowed {
                return Json(ApiResponse::error_with_code(
                    "RATE_LIMIT_EXCEEDED".to_string(),
                    "Daily AI chat limit reached. Please try again tomorrow.".to_string(),
                ));
            }
        }
        Err(e) => {
            tracing::warn!("Failed to check AI chat limit: {}", e);
            // Continue anyway if rate limit check fails
        }
    }

    let provider = match get_ai_provider() {
        Ok(p) => p,
        Err(e) => return Json(ApiResponse::error(format!("AI provider error: {}", e))),
    };

    match provider.ask_question(&payload.context, &payload.question).await {
        Ok(answer) => {
            // Increment usage count on success
            if let Err(e) = increment_ai_chat_count(&pool, user_id).await {
                tracing::warn!("Failed to increment AI chat count: {}", e);
            }
            Json(ApiResponse::success(AskResponse { answer }))
        }
        Err(e) => Json(ApiResponse::error(format!("Question failed: {}", e))),
    }
}

#[derive(Deserialize)]
pub struct TranslateRequest {
    subtitles: Vec<Subtitle>,
}

#[derive(Serialize)]
pub struct TranslateResponse {
    translations: Vec<String>,
}

async fn translate_subtitles(
    Json(payload): Json<TranslateRequest>,
) -> Json<ApiResponse<TranslateResponse>> {
    let provider = match get_ai_provider() {
        Ok(p) => p,
        Err(e) => return Json(ApiResponse::error(format!("AI provider error: {}", e))),
    };

    match provider.translate_subtitles(&payload.subtitles).await {
        Ok(translations) => Json(ApiResponse::success(TranslateResponse { translations })),
        Err(e) => Json(ApiResponse::error(format!("Translation failed: {}", e))),
    }
}

#[derive(Deserialize)]
pub struct VocabularyRequest {
    text: String,
}

#[derive(Serialize)]
pub struct VocabularyResponse {
    vocabulary: Vec<VocabularyItem>,
}

async fn extract_vocabulary(
    Json(payload): Json<VocabularyRequest>,
) -> Json<ApiResponse<VocabularyResponse>> {
    let provider = match get_ai_provider() {
        Ok(p) => p,
        Err(e) => return Json(ApiResponse::error(format!("AI provider error: {}", e))),
    };

    match provider.extract_vocabulary(&payload.text).await {
        Ok(vocabulary) => Json(ApiResponse::success(VocabularyResponse { vocabulary })),
        Err(e) => Json(ApiResponse::error(format!("Vocabulary extraction failed: {}", e))),
    }
}

#[derive(Deserialize)]
pub struct MindMapRequest {
    video_id: String,
    title: String,
    content: String,
    #[serde(default)]
    regenerate: bool,
}

#[derive(Serialize)]
pub struct MindMapResponse {
    markdown: String,
    cached: bool,
}

async fn generate_mindmap(
    State(db_pool): State<DbPool>,
    Json(payload): Json<MindMapRequest>,
) -> Json<ApiResponse<MindMapResponse>> {
    // Check cache first (skip if regenerate is requested)
    if !payload.regenerate {
        if let Ok(Some(cached_markdown)) = get_cached_mindmap(&db_pool, &payload.video_id).await {
            return Json(ApiResponse::success(MindMapResponse {
                markdown: cached_markdown,
                cached: true,
            }));
        }
    }

    let provider = match get_ai_provider() {
        Ok(p) => p,
        Err(e) => return Json(ApiResponse::error(format!("AI provider error: {}", e))),
    };

    match provider.generate_mindmap(&payload.title, &payload.content).await {
        Ok(markdown) => {
            // Save to cache (ignore errors)
            let _ = save_mindmap_cache(&db_pool, &payload.video_id, &markdown).await;
            Json(ApiResponse::success(MindMapResponse { markdown, cached: false }))
        }
        Err(e) => Json(ApiResponse::error(format!("Mind map generation failed: {}", e))),
    }
}

#[derive(Deserialize)]
pub struct SlidesRequest {
    video_id: String,
    title: String,
    content: String,
    #[serde(default)]
    regenerate: bool,
}

#[derive(Serialize)]
pub struct SlidesResponse {
    slides: Vec<Slide>,
    cached: bool,
}

async fn generate_slides(
    State(db_pool): State<DbPool>,
    Json(payload): Json<SlidesRequest>,
) -> Json<ApiResponse<SlidesResponse>> {
    // Check cache first (skip if regenerate is requested)
    if !payload.regenerate {
        if let Ok(Some(cached_json)) = get_cached_slides(&db_pool, &payload.video_id).await {
            if let Ok(slides) = serde_json::from_str::<Vec<Slide>>(&cached_json) {
                return Json(ApiResponse::success(SlidesResponse {
                    slides,
                    cached: true,
                }));
            }
        }
    }

    let provider = match get_ai_provider() {
        Ok(p) => p,
        Err(e) => return Json(ApiResponse::error(format!("AI provider error: {}", e))),
    };

    match provider.generate_slides(&payload.title, &payload.content).await {
        Ok(slides) => {
            // Save to cache (ignore errors)
            if let Ok(slides_json) = serde_json::to_string(&slides) {
                let _ = save_slides_cache(&db_pool, &payload.video_id, &slides_json).await;
            }
            Json(ApiResponse::success(SlidesResponse { slides, cached: false }))
        }
        Err(e) => Json(ApiResponse::error(format!("Slides generation failed: {}", e))),
    }
}

#[derive(Deserialize)]
pub struct ChaptersRequest {
    subtitles: Vec<Subtitle>,
}

#[derive(Serialize)]
pub struct ChaptersResponse {
    chapters: Vec<Chapter>,
}

async fn generate_chapters(
    Json(payload): Json<ChaptersRequest>,
) -> Json<ApiResponse<ChaptersResponse>> {
    let provider = match get_ai_provider() {
        Ok(p) => p,
        Err(e) => return Json(ApiResponse::error(format!("AI provider error: {}", e))),
    };

    match provider.generate_chapters(&payload.subtitles).await {
        Ok(chapters) => Json(ApiResponse::success(ChaptersResponse { chapters })),
        Err(e) => Json(ApiResponse::error(format!("Chapters generation failed: {}", e))),
    }
}

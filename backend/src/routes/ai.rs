use axum::{routing::post, Json, Router};
use serde::{Deserialize, Serialize};

use crate::models::{ApiResponse, Subtitle};
use crate::services::ai::{get_ai_provider, VocabularyItem};

pub fn routes() -> Router {
    Router::new()
        .route("/analyze", post(analyze_highlights))
        .route("/ask", post(ask_question))
        .route("/translate", post(translate_subtitles))
        .route("/vocabulary", post(extract_vocabulary))
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

async fn ask_question(Json(payload): Json<AskRequest>) -> Json<ApiResponse<AskResponse>> {
    let provider = match get_ai_provider() {
        Ok(p) => p,
        Err(e) => return Json(ApiResponse::error(format!("AI provider error: {}", e))),
    };

    match provider.ask_question(&payload.context, &payload.question).await {
        Ok(answer) => Json(ApiResponse::success(AskResponse { answer })),
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

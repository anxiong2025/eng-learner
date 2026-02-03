use axum::{
    extract::State,
    routing::{get, post, delete},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::auth::{AuthUser, OptionalAuthUser};
use crate::db::{self, DbPool, SavedVocabulary};
use crate::models::ApiResponse;
use crate::services::ai::{get_ai_provider, ReviewQuestion, ReviewEvaluation, VocabForReview, MemoryCard};

pub fn routes(db_pool: DbPool) -> Router {
    Router::new()
        .route("/save", post(save_vocabulary))
        .route("/list", get(list_vocabulary))
        .route("/review", post(review_vocabulary))
        .route("/delete/{id}", delete(delete_vocabulary))
        .route("/check/{word}", get(check_vocabulary))
        .route("/ai-review", post(start_ai_review))
        .route("/ai-review/question", post(generate_single_question))
        .route("/ai-review/answer", post(submit_ai_review_answer))
        .route("/memory-card", post(generate_memory_card))
        .with_state(db_pool)
}

#[derive(Deserialize)]
pub struct SaveVocabularyRequest {
    word: String,
    meaning: String,
    level: String,
    example: Option<String>,
    source_video_id: Option<String>,
    source_sentence: Option<String>,
}

#[derive(Serialize)]
pub struct SaveVocabularyResponse {
    id: i32,
}

async fn save_vocabulary(
    State(pool): State<DbPool>,
    auth: OptionalAuthUser,
    Json(payload): Json<SaveVocabularyRequest>,
) -> Json<ApiResponse<SaveVocabularyResponse>> {
    let user_id = auth.user_id_or_default();

    match db::save_vocabulary(
        &pool,
        user_id,
        &payload.word,
        &payload.meaning,
        &payload.level,
        payload.example.as_deref(),
        payload.source_video_id.as_deref(),
        payload.source_sentence.as_deref(),
    ).await {
        Ok(id) => {
            // Record learning statistics
            let _ = db::record_word_learned(&pool, user_id).await;
            Json(ApiResponse::success(SaveVocabularyResponse { id }))
        }
        Err(e) => Json(ApiResponse::error(format!("Failed to save: {}", e))),
    }
}

#[derive(Deserialize)]
pub struct ListQuery {
    due_only: Option<bool>,
}

#[derive(Serialize)]
pub struct ListVocabularyResponse {
    vocabulary: Vec<SavedVocabulary>,
    total: usize,
}

async fn list_vocabulary(
    State(pool): State<DbPool>,
    auth: OptionalAuthUser,
    axum::extract::Query(query): axum::extract::Query<ListQuery>,
) -> Json<ApiResponse<ListVocabularyResponse>> {
    let user_id = auth.user_id_or_default();
    let due_only = query.due_only.unwrap_or(false);

    match db::get_vocabulary_list(&pool, user_id, due_only).await {
        Ok(vocabulary) => {
            let total = vocabulary.len();
            Json(ApiResponse::success(ListVocabularyResponse { vocabulary, total }))
        }
        Err(e) => Json(ApiResponse::error(format!("Failed to list: {}", e))),
    }
}

#[derive(Deserialize)]
pub struct ReviewRequest {
    vocab_id: i32,
    quality: i32,  // 0=forgot, 1=hard, 2=good, 3=easy
}

async fn review_vocabulary(
    State(pool): State<DbPool>,
    auth: OptionalAuthUser,
    Json(payload): Json<ReviewRequest>,
) -> Json<ApiResponse<()>> {
    let user_id = auth.user_id_or_default();

    match db::review_vocabulary(&pool, user_id, payload.vocab_id, payload.quality).await {
        Ok(_) => {
            // Record review statistics (quality >= 2 is considered correct)
            let _ = db::record_review(&pool, user_id, payload.quality >= 2).await;
            Json(ApiResponse::success(()))
        }
        Err(e) => Json(ApiResponse::error(format!("Failed to review: {}", e))),
    }
}

async fn delete_vocabulary(
    State(pool): State<DbPool>,
    auth: OptionalAuthUser,
    axum::extract::Path(id): axum::extract::Path<i32>,
) -> Json<ApiResponse<()>> {
    let user_id = auth.user_id_or_default();

    match db::delete_vocabulary(&pool, user_id, id).await {
        Ok(_) => Json(ApiResponse::success(())),
        Err(e) => Json(ApiResponse::error(format!("Failed to delete: {}", e))),
    }
}

#[derive(Serialize)]
pub struct CheckVocabularyResponse {
    saved: bool,
}

async fn check_vocabulary(
    State(pool): State<DbPool>,
    auth: OptionalAuthUser,
    axum::extract::Path(word): axum::extract::Path<String>,
) -> Json<ApiResponse<CheckVocabularyResponse>> {
    let user_id = auth.user_id_or_default();

    match db::is_vocabulary_saved(&pool, user_id, &word).await {
        Ok(saved) => Json(ApiResponse::success(CheckVocabularyResponse { saved })),
        Err(e) => Json(ApiResponse::error(format!("Failed to check: {}", e))),
    }
}

// ============ AI Review APIs (require authentication) ============

#[derive(Deserialize)]
pub struct StartAIReviewRequest {
    vocab_ids: Vec<i32>,
}

#[derive(Serialize)]
pub struct StartAIReviewResponse {
    session_id: String,
    questions: Vec<ReviewQuestion>,
}

/// Start AI Review session - requires authentication
async fn start_ai_review(
    State(pool): State<DbPool>,
    auth: AuthUser,  // Requires login
    Json(payload): Json<StartAIReviewRequest>,
) -> Json<ApiResponse<StartAIReviewResponse>> {
    let user_id = &auth.user_id;

    // Get vocabulary details for the requested IDs
    let vocab_list = match db::get_vocabulary_list(&pool, user_id, false).await {
        Ok(list) => list,
        Err(e) => return Json(ApiResponse::error(format!("Failed to get vocabulary: {}", e))),
    };

    // Filter to only requested vocab IDs
    let vocab_for_review: Vec<VocabForReview> = vocab_list
        .into_iter()
        .filter(|v| payload.vocab_ids.contains(&v.id))
        .map(|v| VocabForReview {
            id: v.id,
            word: v.word,
            meaning: v.meaning,
            source_sentence: v.source_sentence,
        })
        .collect();

    if vocab_for_review.is_empty() {
        return Json(ApiResponse::error("No vocabulary found for review".to_string()));
    }

    // Get AI provider and generate questions
    let ai_provider = match get_ai_provider() {
        Ok(provider) => provider,
        Err(e) => return Json(ApiResponse::error(format!("AI provider error: {}", e))),
    };

    let questions = match ai_provider.generate_review_questions(&vocab_for_review).await {
        Ok(q) => q,
        Err(e) => return Json(ApiResponse::error(format!("Failed to generate questions: {}", e))),
    };

    // Generate a session ID
    let session_id = uuid::Uuid::new_v4().to_string();

    Json(ApiResponse::success(StartAIReviewResponse {
        session_id,
        questions,
    }))
}

// ============ Single Question Generation (for progressive loading) ============

#[derive(Deserialize)]
pub struct GenerateSingleQuestionRequest {
    vocab_id: i32,
    word: String,
    meaning: String,
    source_sentence: Option<String>,
    question_type: Option<String>, // "meaning", "usage", "context", "spelling"
}

#[derive(Serialize)]
pub struct GenerateSingleQuestionResponse {
    question: ReviewQuestion,
}

/// Generate a single review question - requires authentication
async fn generate_single_question(
    _auth: AuthUser,  // Requires login
    Json(payload): Json<GenerateSingleQuestionRequest>,
) -> Json<ApiResponse<GenerateSingleQuestionResponse>> {
    let question_types = ["meaning", "usage", "context", "spelling"];
    let question_type = payload.question_type.as_deref()
        .unwrap_or_else(|| question_types[payload.vocab_id as usize % question_types.len()]);

    // Get AI provider and generate question
    let ai_provider = match get_ai_provider() {
        Ok(provider) => provider,
        Err(e) => return Json(ApiResponse::error(format!("AI provider error: {}", e))),
    };

    let vocab = VocabForReview {
        id: payload.vocab_id,
        word: payload.word,
        meaning: payload.meaning,
        source_sentence: payload.source_sentence,
    };

    let question = match ai_provider.generate_single_review_question(&vocab, question_type).await {
        Ok(q) => q,
        Err(e) => return Json(ApiResponse::error(format!("Failed to generate question: {}", e))),
    };

    Json(ApiResponse::success(GenerateSingleQuestionResponse { question }))
}

#[derive(Deserialize)]
pub struct SubmitAnswerRequest {
    vocab_id: i32,
    word: String,
    meaning: String,
    question: String,
    user_answer: String,
}

#[derive(Serialize)]
pub struct SubmitAnswerResponse {
    evaluation: ReviewEvaluation,
}

/// Submit answer to AI Review - requires authentication
async fn submit_ai_review_answer(
    State(pool): State<DbPool>,
    auth: AuthUser,  // Requires login
    Json(payload): Json<SubmitAnswerRequest>,
) -> Json<ApiResponse<SubmitAnswerResponse>> {
    let user_id = &auth.user_id;

    // Get AI provider and evaluate answer
    let ai_provider = match get_ai_provider() {
        Ok(provider) => provider,
        Err(e) => return Json(ApiResponse::error(format!("AI provider error: {}", e))),
    };

    let evaluation = match ai_provider.evaluate_review_answer(
        &payload.word,
        &payload.meaning,
        &payload.question,
        &payload.user_answer,
    ).await {
        Ok(eval) => eval,
        Err(e) => return Json(ApiResponse::error(format!("Failed to evaluate: {}", e))),
    };

    // Update vocabulary review status based on AI evaluation
    if let Err(e) = db::review_vocabulary(&pool, user_id, payload.vocab_id, evaluation.quality).await {
        tracing::warn!("Failed to update review status: {}", e);
    }

    // Record review statistics
    let _ = db::record_review(&pool, user_id, evaluation.is_correct).await;

    Json(ApiResponse::success(SubmitAnswerResponse { evaluation }))
}

// ============ AI Memory Card Generation ============

#[derive(Deserialize)]
pub struct GenerateMemoryCardRequest {
    word: String,
    meaning: String,
    source_sentence: Option<String>,
}

#[derive(Serialize)]
pub struct GenerateMemoryCardResponse {
    card: MemoryCard,
}

/// Generate AI memory card for vocabulary learning
async fn generate_memory_card(
    _auth: AuthUser,  // Requires login
    Json(payload): Json<GenerateMemoryCardRequest>,
) -> Json<ApiResponse<GenerateMemoryCardResponse>> {
    // Get AI provider
    let ai_provider = match get_ai_provider() {
        Ok(provider) => provider,
        Err(e) => return Json(ApiResponse::error(format!("AI provider error: {}", e))),
    };

    // Generate memory card
    let card = match ai_provider.generate_memory_card(
        &payload.word,
        &payload.meaning,
        payload.source_sentence.as_deref(),
    ).await {
        Ok(c) => c,
        Err(e) => return Json(ApiResponse::error(format!("Failed to generate memory card: {}", e))),
    };

    Json(ApiResponse::success(GenerateMemoryCardResponse { card }))
}

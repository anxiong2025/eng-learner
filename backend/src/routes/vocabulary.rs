use axum::{
    extract::State,
    routing::{get, post, delete},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::db::{self, DbPool, SavedVocabulary};
use crate::models::ApiResponse;

pub fn routes(db_pool: DbPool) -> Router {
    Router::new()
        .route("/save", post(save_vocabulary))
        .route("/list", get(list_vocabulary))
        .route("/review", post(review_vocabulary))
        .route("/delete/:id", delete(delete_vocabulary))
        .route("/check/:word", get(check_vocabulary))
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
    id: i64,
}

async fn save_vocabulary(
    State(pool): State<DbPool>,
    Json(payload): Json<SaveVocabularyRequest>,
) -> Json<ApiResponse<SaveVocabularyResponse>> {
    match db::save_vocabulary(
        &pool,
        &payload.word,
        &payload.meaning,
        &payload.level,
        payload.example.as_deref(),
        payload.source_video_id.as_deref(),
        payload.source_sentence.as_deref(),
    ) {
        Ok(id) => {
            // Record learning statistics
            let _ = db::record_word_learned(&pool);
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
    axum::extract::Query(query): axum::extract::Query<ListQuery>,
) -> Json<ApiResponse<ListVocabularyResponse>> {
    let due_only = query.due_only.unwrap_or(false);

    match db::get_vocabulary_list(&pool, due_only) {
        Ok(vocabulary) => {
            let total = vocabulary.len();
            Json(ApiResponse::success(ListVocabularyResponse { vocabulary, total }))
        }
        Err(e) => Json(ApiResponse::error(format!("Failed to list: {}", e))),
    }
}

#[derive(Deserialize)]
pub struct ReviewRequest {
    vocab_id: i64,
    quality: i32,  // 0=forgot, 1=hard, 2=good, 3=easy
}

async fn review_vocabulary(
    State(pool): State<DbPool>,
    Json(payload): Json<ReviewRequest>,
) -> Json<ApiResponse<()>> {
    match db::review_vocabulary(&pool, payload.vocab_id, payload.quality) {
        Ok(_) => {
            // Record review statistics (quality >= 2 is considered correct)
            let _ = db::record_review(&pool, payload.quality >= 2);
            Json(ApiResponse::success(()))
        }
        Err(e) => Json(ApiResponse::error(format!("Failed to review: {}", e))),
    }
}

async fn delete_vocabulary(
    State(pool): State<DbPool>,
    axum::extract::Path(id): axum::extract::Path<i64>,
) -> Json<ApiResponse<()>> {
    match db::delete_vocabulary(&pool, id) {
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
    axum::extract::Path(word): axum::extract::Path<String>,
) -> Json<ApiResponse<CheckVocabularyResponse>> {
    match db::is_vocabulary_saved(&pool, &word) {
        Ok(saved) => Json(ApiResponse::success(CheckVocabularyResponse { saved })),
        Err(e) => Json(ApiResponse::error(format!("Failed to check: {}", e))),
    }
}

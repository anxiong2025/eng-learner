use axum::{
    extract::State,
    routing::{get, post, delete},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::auth::OptionalAuthUser;
use crate::db::{self, DbPool, WatchHistoryItem};

#[derive(Deserialize)]
pub struct AddHistoryRequest {
    video_id: String,
    title: String,
    thumbnail: String,
}

#[derive(Serialize)]
pub struct HistoryResponse {
    history: Vec<WatchHistoryItem>,
}

/// Add to watch history
async fn add_history(
    State(pool): State<DbPool>,
    auth: OptionalAuthUser,
    Json(req): Json<AddHistoryRequest>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let user_id = auth.user_id_or_default().to_string();

    db::add_watch_history(&pool, &user_id, &req.video_id, &req.title, &req.thumbnail)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "success": true })))
}

/// Get watch history
async fn get_history(
    State(pool): State<DbPool>,
    auth: OptionalAuthUser,
) -> Result<Json<HistoryResponse>, (axum::http::StatusCode, String)> {
    let user_id = auth.user_id_or_default().to_string();

    let history = db::get_watch_history(&pool, &user_id, 20)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(HistoryResponse { history }))
}

#[derive(Deserialize)]
pub struct DeleteHistoryRequest {
    video_id: String,
}

/// Delete from watch history
async fn delete_history(
    State(pool): State<DbPool>,
    auth: OptionalAuthUser,
    Json(req): Json<DeleteHistoryRequest>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let user_id = auth.user_id_or_default().to_string();

    db::delete_watch_history(&pool, &user_id, &req.video_id)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "success": true })))
}

/// Clear all watch history
async fn clear_history(
    State(pool): State<DbPool>,
    auth: OptionalAuthUser,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let user_id = auth.user_id_or_default().to_string();

    db::clear_watch_history(&pool, &user_id)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({ "success": true })))
}

pub fn routes(pool: DbPool) -> Router {
    Router::new()
        .route("/", get(get_history).post(add_history))
        .route("/delete", post(delete_history))
        .route("/clear", post(clear_history))
        .with_state(pool)
}

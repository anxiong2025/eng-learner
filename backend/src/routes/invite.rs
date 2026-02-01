use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use serde::Serialize;

use crate::auth::AuthUser;
use crate::db::{self, DbPool};
use crate::models::ApiResponse;

pub fn routes(db_pool: DbPool) -> Router {
    Router::new()
        .route("/code", get(get_invite_code))
        .route("/stats", get(get_invite_stats))
        .with_state(db_pool)
}

#[derive(Serialize)]
pub struct InviteCodeResponse {
    pub invite_code: String,
    pub invite_link: String,
}

/// Get user's invite code and shareable link
async fn get_invite_code(
    State(pool): State<DbPool>,
    auth: AuthUser,
) -> Json<ApiResponse<InviteCodeResponse>> {
    let frontend_url = std::env::var("FRONTEND_URL")
        .unwrap_or_else(|_| "https://eng-learner.vercel.app".to_string());

    match db::get_or_create_invite_code(&pool, &auth.user_id).await {
        Ok(code) => {
            let invite_link = format!("{}/?ref={}", frontend_url, code);
            Json(ApiResponse::success(InviteCodeResponse {
                invite_code: code,
                invite_link,
            }))
        }
        Err(e) => Json(ApiResponse::error(format!("Failed to get invite code: {}", e))),
    }
}

#[derive(Serialize)]
pub struct InviteStatsResponse {
    pub invite_count: i32,
    pub bonus_quota: i32,
    pub bonus_per_invite: i32,
}

/// Get user's invitation statistics
async fn get_invite_stats(
    State(pool): State<DbPool>,
    auth: AuthUser,
) -> Json<ApiResponse<InviteStatsResponse>> {
    let invite_count = db::get_invite_count(&pool, &auth.user_id).await.unwrap_or(0);
    let bonus_quota = db::get_bonus_quota(&pool, &auth.user_id).await.unwrap_or(0);

    Json(ApiResponse::success(InviteStatsResponse {
        invite_count,
        bonus_quota,
        bonus_per_invite: db::INVITE_BONUS_QUOTA,
    }))
}

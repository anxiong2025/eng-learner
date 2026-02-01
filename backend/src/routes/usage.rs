use axum::{
    extract::State,
    routing::get,
    Json, Router,
};

use crate::auth::OptionalAuthUser;
use crate::db::{self, DbPool, DailyUsageStatus};
use crate::models::ApiResponse;

pub fn routes(db_pool: DbPool) -> Router {
    Router::new()
        .route("/status", get(get_usage_status))
        .with_state(db_pool)
}

/// Get current usage status for the user
async fn get_usage_status(
    State(pool): State<DbPool>,
    auth: OptionalAuthUser,
) -> Json<ApiResponse<DailyUsageStatus>> {
    let user_id = auth.user_id_or_default();

    match db::get_daily_usage(&pool, user_id).await {
        Ok(status) => Json(ApiResponse::success(status)),
        Err(e) => Json(ApiResponse::error(format!("Failed to get usage status: {}", e))),
    }
}

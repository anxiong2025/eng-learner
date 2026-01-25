use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::db::{self, DbPool, DailyStats, UserProgress};
use crate::models::ApiResponse;

pub fn routes(db_pool: DbPool) -> Router {
    Router::new()
        .route("/today", get(get_today_stats))
        .route("/daily", get(get_daily_stats))
        .route("/progress", get(get_progress))
        .route("/overview", get(get_overview))
        .with_state(db_pool)
}

async fn get_today_stats(
    State(pool): State<DbPool>,
) -> Json<ApiResponse<DailyStats>> {
    match db::get_today_stats(&pool) {
        Ok(stats) => Json(ApiResponse::success(stats)),
        Err(e) => Json(ApiResponse::error(format!("Failed to get today stats: {}", e))),
    }
}

#[derive(Deserialize)]
pub struct DailyStatsQuery {
    days: Option<i32>,
}

async fn get_daily_stats(
    State(pool): State<DbPool>,
    axum::extract::Query(query): axum::extract::Query<DailyStatsQuery>,
) -> Json<ApiResponse<Vec<DailyStats>>> {
    let days = query.days.unwrap_or(7);
    match db::get_daily_stats(&pool, days) {
        Ok(stats) => Json(ApiResponse::success(stats)),
        Err(e) => Json(ApiResponse::error(format!("Failed to get daily stats: {}", e))),
    }
}

async fn get_progress(
    State(pool): State<DbPool>,
) -> Json<ApiResponse<UserProgress>> {
    match db::get_user_progress(&pool) {
        Ok(progress) => Json(ApiResponse::success(progress)),
        Err(e) => Json(ApiResponse::error(format!("Failed to get progress: {}", e))),
    }
}

#[derive(Serialize)]
pub struct LearningOverview {
    pub today: DailyStats,
    pub progress: UserProgress,
    pub weekly_stats: Vec<DailyStats>,
    pub accuracy_rate: f64,
}

async fn get_overview(
    State(pool): State<DbPool>,
) -> Json<ApiResponse<LearningOverview>> {
    let today = match db::get_today_stats(&pool) {
        Ok(s) => s,
        Err(e) => return Json(ApiResponse::error(format!("Failed to get today stats: {}", e))),
    };

    let progress = match db::get_user_progress(&pool) {
        Ok(p) => p,
        Err(e) => return Json(ApiResponse::error(format!("Failed to get progress: {}", e))),
    };

    let weekly_stats = match db::get_daily_stats(&pool, 7) {
        Ok(s) => s,
        Err(e) => return Json(ApiResponse::error(format!("Failed to get weekly stats: {}", e))),
    };

    // Calculate overall accuracy rate
    let total_correct: i32 = weekly_stats.iter().map(|s| s.correct_count).sum();
    let total_reviewed: i32 = weekly_stats.iter().map(|s| s.words_reviewed).sum();
    let accuracy_rate = if total_reviewed > 0 {
        (total_correct as f64 / total_reviewed as f64) * 100.0
    } else {
        0.0
    };

    Json(ApiResponse::success(LearningOverview {
        today,
        progress,
        weekly_stats,
        accuracy_rate,
    }))
}

use axum::{
    extract::State,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::auth::OptionalAuthUser;
use crate::db::{self, DbPool, DailyStats, UserProgress};
use crate::models::ApiResponse;

pub fn routes(db_pool: DbPool) -> Router {
    Router::new()
        .route("/today", get(get_today_stats))
        .route("/daily", get(get_daily_stats))
        .route("/progress", get(get_progress))
        .route("/overview", get(get_overview))
        .route("/memory-distribution", get(get_memory_distribution))
        .with_state(db_pool)
}

async fn get_today_stats(
    State(pool): State<DbPool>,
    auth: OptionalAuthUser,
) -> Json<ApiResponse<DailyStats>> {
    let user_id = auth.user_id_or_default();

    match db::get_today_stats(&pool, user_id) {
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
    auth: OptionalAuthUser,
    axum::extract::Query(query): axum::extract::Query<DailyStatsQuery>,
) -> Json<ApiResponse<Vec<DailyStats>>> {
    let user_id = auth.user_id_or_default();
    let days = query.days.unwrap_or(7);

    match db::get_daily_stats(&pool, user_id, days) {
        Ok(stats) => Json(ApiResponse::success(stats)),
        Err(e) => Json(ApiResponse::error(format!("Failed to get daily stats: {}", e))),
    }
}

async fn get_progress(
    State(pool): State<DbPool>,
    auth: OptionalAuthUser,
) -> Json<ApiResponse<UserProgress>> {
    let user_id = auth.user_id_or_default();

    match db::get_user_progress(&pool, user_id) {
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
    auth: OptionalAuthUser,
) -> Json<ApiResponse<LearningOverview>> {
    let user_id = auth.user_id_or_default();

    let today = match db::get_today_stats(&pool, user_id) {
        Ok(s) => s,
        Err(e) => return Json(ApiResponse::error(format!("Failed to get today stats: {}", e))),
    };

    let progress = match db::get_user_progress(&pool, user_id) {
        Ok(p) => p,
        Err(e) => return Json(ApiResponse::error(format!("Failed to get progress: {}", e))),
    };

    let weekly_stats = match db::get_daily_stats(&pool, user_id, 7) {
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

/// Memory strength distribution (for dashboard)
#[derive(Serialize)]
pub struct MemoryDistribution {
    pub strong: i32,      // >= 70%
    pub good: i32,        // 40-69%
    pub weak: i32,        // 20-39%
    pub critical: i32,    // < 20%
    pub total: i32,
}

async fn get_memory_distribution(
    State(pool): State<DbPool>,
    auth: OptionalAuthUser,
) -> Json<ApiResponse<MemoryDistribution>> {
    let user_id = auth.user_id_or_default();

    // Get all vocabulary with memory_strength
    let vocab_list = match db::get_vocabulary_list(&pool, user_id, false) {
        Ok(list) => list,
        Err(e) => return Json(ApiResponse::error(format!("Failed to get vocabulary: {}", e))),
    };

    let mut strong = 0;
    let mut good = 0;
    let mut weak = 0;
    let mut critical = 0;

    for vocab in &vocab_list {
        if vocab.memory_strength >= 0.7 {
            strong += 1;
        } else if vocab.memory_strength >= 0.4 {
            good += 1;
        } else if vocab.memory_strength >= 0.2 {
            weak += 1;
        } else {
            critical += 1;
        }
    }

    Json(ApiResponse::success(MemoryDistribution {
        strong,
        good,
        weak,
        critical,
        total: vocab_list.len() as i32,
    }))
}

use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::auth::OptionalAuthUser;
use crate::db::{self, DbPool};
use crate::models::{ApiResponse, SubtitleResponse, VideoInfo};
use crate::services::youtube;

#[derive(Deserialize)]
pub struct ParseRequest {
    url: String,
}

#[derive(Deserialize)]
pub struct SubtitleQuery {
    lang: Option<String>,
}

#[derive(Serialize)]
pub struct ParseVideoResponse {
    #[serde(flatten)]
    pub video_info: VideoInfo,
    pub usage: UsageInfo,
}

#[derive(Serialize)]
pub struct UsageInfo {
    pub remaining: i32,
}

pub fn routes(db_pool: DbPool) -> Router {
    Router::new()
        .route("/parse", post(parse_video))
        .route("/:video_id/subtitles", get(get_subtitles))
        .with_state(db_pool)
}

async fn parse_video(
    State(pool): State<DbPool>,
    auth: OptionalAuthUser,
    Json(payload): Json<ParseRequest>,
) -> Json<ApiResponse<ParseVideoResponse>> {
    let user_id = auth.user_id_or_default();
    let tier = auth.tier_or_default();
    let url = payload.url.trim();

    // Validate URL
    if !url.contains("youtube.com") && !url.contains("youtu.be") {
        return Json(ApiResponse::error("Invalid YouTube URL"));
    }

    // Extract video ID
    let video_id = match youtube::extract_video_id(url) {
        Some(id) => id,
        None => return Json(ApiResponse::error("Could not extract video ID")),
    };

    // Demo video ID - skip rate limiting and counting for demo
    const DEMO_VIDEO_ID: &str = "zxMjOqM7DFs";
    let is_demo = video_id == DEMO_VIDEO_ID;

    // Check rate limit (skip for demo video)
    let remaining = if is_demo {
        -1 // Demo doesn't count
    } else {
        let (can_parse, remaining) = match db::check_can_parse_video(&pool, user_id, tier).await {
            Ok(result) => result,
            Err(e) => {
                tracing::error!("Failed to check usage limit: {}", e);
                (true, -1)
            }
        };

        if !can_parse {
            return Json(ApiResponse::error_with_code(
                "RATE_LIMIT_EXCEEDED".to_string(),
                "Daily limit reached. Please try again tomorrow or invite friends for more quota.".to_string(),
            ));
        }
        remaining
    };

    // Fetch video info
    match youtube::fetch_video_info(&video_id).await {
        Ok(info) => {
            // Increment usage count on success (skip for demo video)
            if !is_demo {
                if let Err(e) = db::increment_video_parse_count(&pool, user_id).await {
                    tracing::error!("Failed to increment usage count: {}", e);
                }
            }

            // Calculate actual remaining after this request
            let actual_remaining = if remaining < 0 { -1 } else { remaining };

            Json(ApiResponse::success(ParseVideoResponse {
                video_info: info,
                usage: UsageInfo {
                    remaining: actual_remaining,
                },
            }))
        }
        Err(e) => Json(ApiResponse::error(format!("Failed to fetch video info: {}", e))),
    }
}

async fn get_subtitles(
    Path(video_id): Path<String>,
    Query(query): Query<SubtitleQuery>,
) -> Json<ApiResponse<SubtitleResponse>> {
    let lang = query.lang.unwrap_or_else(|| "en".to_string());

    // Try to fetch subtitles in requested language from YouTube
    // Note: For Chinese, if YouTube doesn't have it, frontend will use on-demand AI translation
    match youtube::fetch_subtitles(&video_id, &lang).await {
        Ok(subtitles) => Json(ApiResponse::success(SubtitleResponse {
            video_id,
            subtitles,
            language: lang,
        })),
        Err(e) => Json(ApiResponse::error(format!("No {} subtitles available: {}", lang, e))),
    }
}

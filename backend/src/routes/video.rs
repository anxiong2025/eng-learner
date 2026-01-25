use axum::{
    extract::{Path, Query},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;

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

pub fn routes() -> Router {
    Router::new()
        .route("/parse", post(parse_video))
        .route("/:video_id/subtitles", get(get_subtitles))
}

async fn parse_video(
    Json(payload): Json<ParseRequest>,
) -> Json<ApiResponse<VideoInfo>> {
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

    // Fetch video info
    match youtube::fetch_video_info(&video_id).await {
        Ok(info) => Json(ApiResponse::success(info)),
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

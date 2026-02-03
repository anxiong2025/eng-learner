use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    response::IntoResponse,
    routing::post,
    Json, Router,
};
use serde::Serialize;
use std::sync::Arc;

use crate::auth::OptionalAuthUser;
use crate::services::r2::R2Client;

pub fn routes(r2_client: Arc<R2Client>) -> Router {
    Router::new()
        .route("/image", post(upload_image))
        .with_state(r2_client)
}

#[derive(Debug, Serialize)]
pub struct UploadResponse {
    pub url: String,
    pub key: String,
}

async fn upload_image(
    State(r2_client): State<Arc<R2Client>>,
    auth: OptionalAuthUser,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let user_id = auth.user_id_or_default();

    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let name = field.name().unwrap_or("").to_string();

        if name == "file" || name == "image" {
            let content_type = field
                .content_type()
                .unwrap_or("image/png")
                .to_string();

            // Only allow image types
            if !content_type.starts_with("image/") {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({ "error": "Only image files are allowed" })),
                )
                    .into_response();
            }

            let data = match field.bytes().await {
                Ok(bytes) => bytes,
                Err(e) => {
                    tracing::error!("Failed to read file data: {}", e);
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(serde_json::json!({ "error": "Failed to read file" })),
                    )
                        .into_response();
                }
            };

            // Check file size (max 5MB)
            if data.len() > 5 * 1024 * 1024 {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({ "error": "File too large (max 5MB)" })),
                )
                    .into_response();
            }

            // Generate unique filename
            let ext = match content_type.as_str() {
                "image/png" => "png",
                "image/jpeg" | "image/jpg" => "jpg",
                "image/gif" => "gif",
                "image/webp" => "webp",
                _ => "png",
            };
            let key = format!(
                "notes/{}/{}.{}",
                user_id,
                uuid::Uuid::new_v4(),
                ext
            );

            // Upload to R2
            match r2_client.upload(&key, data.to_vec(), &content_type).await {
                Ok(url) => {
                    return (
                        StatusCode::OK,
                        Json(UploadResponse { url, key }),
                    )
                        .into_response();
                }
                Err(e) => {
                    tracing::error!("Failed to upload to R2: {}", e);
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({ "error": "Failed to upload file" })),
                    )
                        .into_response();
                }
            }
        }
    }

    (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({ "error": "No file provided" })),
    )
        .into_response()
}

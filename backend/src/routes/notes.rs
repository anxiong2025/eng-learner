use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::auth::{AuthUser, OptionalAuthUser};
use crate::db::{self, DbPool, Note};

pub fn routes(db_pool: DbPool) -> Router {
    Router::new()
        .route("/", get(get_notes))
        .route("/", post(save_note))
        .route("/{id}", delete(delete_note))
        .with_state(db_pool)
}

#[derive(Debug, Deserialize)]
pub struct GetNotesQuery {
    video_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct NoteResponse {
    pub id: String,
    pub video_id: String,
    pub timestamp: f64,
    pub english: Option<String>,
    pub chinese: Option<String>,
    pub note_text: Option<String>,
    pub images: Option<Vec<String>>,
    pub created_at: String,
}

impl From<Note> for NoteResponse {
    fn from(note: Note) -> Self {
        // Parse images JSON string to Vec<String>
        let images = note.images.and_then(|s| serde_json::from_str(&s).ok());
        NoteResponse {
            id: note.id,
            video_id: note.video_id,
            timestamp: note.timestamp,
            english: note.english,
            chinese: note.chinese,
            note_text: note.note_text,
            images,
            created_at: note.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateNoteRequest {
    pub id: Option<String>,
    pub video_id: String,
    pub timestamp: f64,
    pub english: Option<String>,
    pub chinese: Option<String>,
    pub note_text: Option<String>,
    pub images: Option<Vec<String>>,
}

// Get notes (optionally filtered by video_id)
async fn get_notes(
    State(db_pool): State<DbPool>,
    auth: OptionalAuthUser,
    Query(query): Query<GetNotesQuery>,
) -> impl IntoResponse {
    let user_id = auth.user_id_or_default();

    let notes = if let Some(video_id) = query.video_id {
        db::get_notes_by_video(&db_pool, user_id, &video_id).await
    } else {
        db::get_notes(&db_pool, user_id).await
    };

    match notes {
        Ok(notes) => {
            let response: Vec<NoteResponse> = notes.into_iter().map(|n| n.into()).collect();
            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to get notes: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to get notes" })),
            )
                .into_response()
        }
    }
}

// Save a note
async fn save_note(
    State(db_pool): State<DbPool>,
    auth: OptionalAuthUser,
    Json(request): Json<CreateNoteRequest>,
) -> impl IntoResponse {
    let user_id = auth.user_id_or_default();

    let note_id = request.id.unwrap_or_else(|| {
        format!(
            "note_{}_{}_{}",
            user_id,
            chrono::Utc::now().timestamp_millis(),
            rand_string(6)
        )
    });

    // Convert images Vec to JSON string for storage
    let images_json = request.images.map(|imgs| serde_json::to_string(&imgs).unwrap_or_default());

    let note = Note {
        id: note_id.clone(),
        user_id: user_id.to_string(),
        video_id: request.video_id,
        timestamp: request.timestamp,
        english: request.english,
        chinese: request.chinese,
        note_text: request.note_text,
        images: images_json,
        created_at: chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    };

    match db::save_note(&db_pool, &note).await {
        Ok(_) => {
            let response: NoteResponse = note.into();
            (StatusCode::CREATED, Json(response)).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to save note: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to save note" })),
            )
                .into_response()
        }
    }
}

// Delete a note
async fn delete_note(
    State(db_pool): State<DbPool>,
    auth: OptionalAuthUser,
    Path(note_id): Path<String>,
) -> impl IntoResponse {
    let user_id = auth.user_id_or_default();

    match db::delete_note(&db_pool, user_id, &note_id).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => {
            tracing::error!("Failed to delete note: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to delete note" })),
            )
                .into_response()
        }
    }
}

// Generate a random string for note IDs
fn rand_string(len: usize) -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};

    let hasher = RandomState::new().build_hasher();
    let hash = hasher.finish();
    format!("{:x}", hash)[..len.min(16)].to_string()
}

pub mod ai;
pub mod auth;
pub mod history;
pub mod notes;
pub mod stats;
pub mod video;
pub mod vocabulary;

use axum::Router;
use crate::db::DbPool;

pub fn api_routes(db_pool: DbPool) -> Router {
    Router::new()
        .nest("/video", video::routes())
        .nest("/ai", ai::routes())
        .nest("/auth", auth::routes(db_pool.clone()))
        .nest("/vocabulary", vocabulary::routes(db_pool.clone()))
        .nest("/stats", stats::routes(db_pool.clone()))
        .nest("/notes", notes::routes(db_pool.clone()))
        .nest("/history", history::routes(db_pool))
}

pub mod ai;
pub mod auth;
pub mod history;
pub mod invite;
pub mod notes;
pub mod stats;
pub mod usage;
pub mod video;
pub mod vocabulary;

use axum::Router;
use crate::db::DbPool;

pub fn api_routes(db_pool: DbPool) -> Router {
    Router::new()
        .nest("/video", video::routes(db_pool.clone()))
        .nest("/ai", ai::routes(db_pool.clone()))
        .nest("/auth", auth::routes(db_pool.clone()))
        .nest("/vocabulary", vocabulary::routes(db_pool.clone()))
        .nest("/stats", stats::routes(db_pool.clone()))
        .nest("/notes", notes::routes(db_pool.clone()))
        .nest("/history", history::routes(db_pool.clone()))
        .nest("/usage", usage::routes(db_pool.clone()))
        .nest("/invite", invite::routes(db_pool))
}

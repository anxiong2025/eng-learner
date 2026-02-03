pub mod ai;
pub mod auth;
pub mod history;
pub mod invite;
pub mod notes;
pub mod stats;
pub mod upload;
pub mod usage;
pub mod video;
pub mod vocabulary;

use axum::Router;
use std::sync::Arc;
use crate::db::DbPool;
use crate::services::r2::R2Client;

pub fn api_routes(db_pool: DbPool, r2_client: Option<Arc<R2Client>>) -> Router {
    let mut router = Router::new()
        .nest("/video", video::routes(db_pool.clone()))
        .nest("/ai", ai::routes(db_pool.clone()))
        .nest("/auth", auth::routes(db_pool.clone()))
        .nest("/vocabulary", vocabulary::routes(db_pool.clone()))
        .nest("/stats", stats::routes(db_pool.clone()))
        .nest("/notes", notes::routes(db_pool.clone()))
        .nest("/history", history::routes(db_pool.clone()))
        .nest("/usage", usage::routes(db_pool.clone()))
        .nest("/invite", invite::routes(db_pool));

    // Add upload routes if R2 is configured
    if let Some(r2) = r2_client {
        router = router.nest("/upload", upload::routes(r2));
    }

    router
}

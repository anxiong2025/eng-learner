pub mod ai;
pub mod stats;
pub mod video;
pub mod vocabulary;

use axum::Router;
use crate::db::DbPool;

pub fn api_routes(db_pool: DbPool) -> Router {
    Router::new()
        .nest("/video", video::routes())
        .nest("/ai", ai::routes())
        .nest("/vocabulary", vocabulary::routes(db_pool.clone()))
        .nest("/stats", stats::routes(db_pool))
}

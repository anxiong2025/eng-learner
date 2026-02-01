mod auth;
mod db;
mod models;
mod routes;
mod services;

use axum::{routing::get, Router};
use tower_http::cors::{Any, CorsLayer};

#[tokio::main]
async fn main() {
    // Load environment variables from .env file
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt::init();

    // Initialize database
    let db_pool = db::init_db().await.expect("Failed to initialize database");

    // Log AI provider configuration
    let ai_provider = std::env::var("AI_PROVIDER").unwrap_or_else(|_| "gemini".to_string());
    tracing::info!("AI Provider: {}", ai_provider);

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(health_check))
        .route("/health", get(health_check))
        .nest("/api", routes::api_routes(db_pool))
        .layer(cors);

    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let addr = format!("0.0.0.0:{}", port);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    tracing::info!("Backend server running on http://localhost:{}", port);
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> &'static str {
    "OK"
}

mod auth;
mod db;
mod models;
mod routes;
mod services;

use axum::{routing::get, Router};
use std::sync::Arc;
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

    // Initialize R2 client if configured
    let r2_client = match (
        std::env::var("R2_ACCOUNT_ID"),
        std::env::var("R2_ACCESS_KEY_ID"),
        std::env::var("R2_SECRET_ACCESS_KEY"),
        std::env::var("R2_BUCKET"),
        std::env::var("R2_PUBLIC_URL"),
    ) {
        (Ok(account_id), Ok(access_key), Ok(secret_key), Ok(bucket), Ok(public_url)) => {
            match services::r2::R2Client::new(&account_id, &access_key, &secret_key, &bucket, &public_url).await {
                Ok(client) => {
                    tracing::info!("R2 storage initialized: bucket={}", bucket);
                    Some(Arc::new(client))
                }
                Err(e) => {
                    tracing::warn!("Failed to initialize R2 client: {}", e);
                    None
                }
            }
        }
        _ => {
            tracing::info!("R2 storage not configured (missing env vars)");
            None
        }
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(health_check))
        .route("/health", get(health_check))
        .nest("/api", routes::api_routes(db_pool, r2_client))
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

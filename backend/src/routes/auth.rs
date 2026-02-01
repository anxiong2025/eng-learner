use axum::{
    extract::{Query, State},
    response::{IntoResponse, Redirect},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};

use crate::auth::{generate_token, AuthUser};
use crate::db::{self, DbPool, User};

#[derive(Debug, Deserialize)]
pub struct OAuthCallback {
    code: String,
    #[serde(default)]
    state: Option<String>,  // Contains ref_code for invitation tracking
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: String,
    pub name: String,
    pub email: String,
    pub avatar: Option<String>,
    pub provider: String,
    pub tier: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserInfo,
}

#[derive(Debug, Deserialize)]
struct GoogleTokenResponse {
    access_token: String,
    #[serde(default)]
    token_type: String,
}

#[derive(Debug, Deserialize)]
struct GoogleUserInfo {
    id: String,
    email: String,
    name: String,
    picture: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubTokenResponse {
    access_token: String,
    #[serde(default)]
    token_type: String,
}

#[derive(Debug, Deserialize)]
struct GitHubUserInfo {
    id: i64,
    login: String,
    name: Option<String>,
    email: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GitHubEmail {
    email: String,
    primary: bool,
    verified: bool,
}

pub fn routes(db_pool: DbPool) -> Router {
    Router::new()
        .route("/google", get(google_auth))
        .route("/github", get(github_auth))
        .route("/callback/google", get(google_callback))
        .route("/callback/github", get(github_callback))
        .route("/me", get(get_current_user))
        .with_state(db_pool)
}

// Get current user from JWT token
async fn get_current_user(auth: AuthUser) -> impl IntoResponse {
    Json(UserInfo {
        id: auth.user_id,
        name: auth.name,
        email: auth.email,
        avatar: auth.avatar,
        provider: auth.provider,
        tier: auth.tier,
    })
}

#[derive(Debug, Deserialize)]
pub struct AuthQuery {
    #[serde(default)]
    ref_code: Option<String>,  // Invite code for referral tracking
}

// Redirect to Google OAuth
async fn google_auth(Query(query): Query<AuthQuery>) -> impl IntoResponse {
    let client_id = std::env::var("GOOGLE_CLIENT_ID").unwrap_or_default();
    let redirect_uri = std::env::var("GOOGLE_REDIRECT_URI")
        .unwrap_or_else(|_| "http://localhost:3001/api/auth/callback/google".to_string());
    let scope = "openid email profile";

    // Pass ref_code through state parameter
    let state = query.ref_code.unwrap_or_default();

    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&state={}",
        client_id,
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(scope),
        urlencoding::encode(&state)
    );

    Redirect::temporary(&auth_url)
}

// Redirect to GitHub OAuth
async fn github_auth(Query(query): Query<AuthQuery>) -> impl IntoResponse {
    let client_id = std::env::var("GITHUB_CLIENT_ID").unwrap_or_default();
    let redirect_uri = std::env::var("GITHUB_REDIRECT_URI")
        .unwrap_or_else(|_| "http://localhost:3001/api/auth/callback/github".to_string());
    let scope = "user:email";

    // Pass ref_code through state parameter
    let state = query.ref_code.unwrap_or_default();

    let auth_url = format!(
        "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope={}&state={}",
        client_id,
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(scope),
        urlencoding::encode(&state)
    );

    Redirect::temporary(&auth_url)
}

// Handle Google OAuth callback
async fn google_callback(
    State(db_pool): State<DbPool>,
    Query(params): Query<OAuthCallback>,
) -> impl IntoResponse {
    let client_id = std::env::var("GOOGLE_CLIENT_ID").unwrap_or_default();
    let client_secret = std::env::var("GOOGLE_CLIENT_SECRET").unwrap_or_default();
    let frontend_url = std::env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());
    let redirect_uri = std::env::var("GOOGLE_REDIRECT_URI")
        .unwrap_or_else(|_| "http://localhost:3001/api/auth/callback/google".to_string());

    // Exchange code for token
    let client = reqwest::Client::new();
    let token_response = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", params.code.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await;

    let token_data: GoogleTokenResponse = match token_response {
        Ok(resp) => match resp.json().await {
            Ok(data) => data,
            Err(e) => {
                tracing::error!("Failed to parse Google token response: {}", e);
                return Redirect::temporary(&format!("{}?error=token_parse_error", frontend_url));
            }
        },
        Err(e) => {
            tracing::error!("Failed to get Google token: {}", e);
            return Redirect::temporary(&format!("{}?error=token_error", frontend_url));
        }
    };

    // Get user info
    let user_response = client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(&token_data.access_token)
        .send()
        .await;

    let user_info: GoogleUserInfo = match user_response {
        Ok(resp) => match resp.json().await {
            Ok(data) => data,
            Err(e) => {
                tracing::error!("Failed to parse Google user info: {}", e);
                return Redirect::temporary(&format!("{}?error=user_info_error", frontend_url));
            }
        },
        Err(e) => {
            tracing::error!("Failed to get Google user info: {}", e);
            return Redirect::temporary(&format!("{}?error=user_info_error", frontend_url));
        }
    };

    // Create user data
    let user_id = format!("google_{}", user_info.id);
    let user = User {
        id: user_id.clone(),
        email: user_info.email.clone(),
        name: user_info.name.clone(),
        avatar: user_info.picture.clone(),
        provider: "google".to_string(),
        tier: "free".to_string(),
        invite_code: None,
        bonus_quota: 0,
        invited_by: None,
        created_at: None,
        last_login_at: None,
    };

    // Extract ref_code from state parameter
    let ref_code = params.state.as_deref().filter(|s| !s.is_empty());

    // Save user to database (with referral tracking)
    if let Err(e) = db::upsert_user(&db_pool, &user, ref_code).await {
        tracing::error!("Failed to save user to database: {}", e);
        return Redirect::temporary(&format!("{}?error=db_error", frontend_url));
    }

    // Generate JWT token
    let token = match generate_token(
        &user_id,
        &user_info.email,
        &user_info.name,
        user_info.picture.as_deref(),
        "google",
        "free",
    ) {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("Failed to generate JWT token: {}", e);
            return Redirect::temporary(&format!("{}?error=token_generation_error", frontend_url));
        }
    };

    // Redirect to frontend with token
    Redirect::temporary(&format!("{}?auth_success=true&token={}", frontend_url, urlencoding::encode(&token)))
}

// Handle GitHub OAuth callback
async fn github_callback(
    State(db_pool): State<DbPool>,
    Query(params): Query<OAuthCallback>,
) -> impl IntoResponse {
    let client_id = std::env::var("GITHUB_CLIENT_ID").unwrap_or_default();
    let client_secret = std::env::var("GITHUB_CLIENT_SECRET").unwrap_or_default();
    let frontend_url = std::env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());

    // Exchange code for token
    let client = reqwest::Client::new();
    let token_response = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("code", params.code.as_str()),
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
        ])
        .send()
        .await;

    let token_data: GitHubTokenResponse = match token_response {
        Ok(resp) => match resp.json().await {
            Ok(data) => data,
            Err(e) => {
                tracing::error!("Failed to parse GitHub token response: {}", e);
                return Redirect::temporary(&format!("{}?error=token_parse_error", frontend_url));
            }
        },
        Err(e) => {
            tracing::error!("Failed to get GitHub token: {}", e);
            return Redirect::temporary(&format!("{}?error=token_error", frontend_url));
        }
    };

    // Get user info
    let user_response = client
        .get("https://api.github.com/user")
        .header("User-Agent", "EngLearner")
        .bearer_auth(&token_data.access_token)
        .send()
        .await;

    let user_info: GitHubUserInfo = match user_response {
        Ok(resp) => match resp.json().await {
            Ok(data) => data,
            Err(e) => {
                tracing::error!("Failed to parse GitHub user info: {}", e);
                return Redirect::temporary(&format!("{}?error=user_info_error", frontend_url));
            }
        },
        Err(e) => {
            tracing::error!("Failed to get GitHub user info: {}", e);
            return Redirect::temporary(&format!("{}?error=user_info_error", frontend_url));
        }
    };

    // Get user email if not public
    let email = if let Some(email) = user_info.email.clone() {
        email
    } else {
        // Fetch emails from GitHub API
        let emails_response = client
            .get("https://api.github.com/user/emails")
            .header("User-Agent", "EngLearner")
            .bearer_auth(&token_data.access_token)
            .send()
            .await;

        match emails_response {
            Ok(resp) => {
                let emails: Vec<GitHubEmail> = resp.json().await.unwrap_or_default();
                emails
                    .into_iter()
                    .find(|e| e.primary && e.verified)
                    .map(|e| e.email)
                    .unwrap_or_else(|| format!("{}@github.local", user_info.login))
            }
            Err(_) => format!("{}@github.local", user_info.login),
        }
    };

    // Create user data
    let user_id = format!("github_{}", user_info.id);
    let name = user_info.name.clone().unwrap_or_else(|| user_info.login.clone());
    let user = User {
        id: user_id.clone(),
        email: email.clone(),
        name: name.clone(),
        avatar: user_info.avatar_url.clone(),
        provider: "github".to_string(),
        tier: "free".to_string(),
        invite_code: None,
        bonus_quota: 0,
        invited_by: None,
        created_at: None,
        last_login_at: None,
    };

    // Extract ref_code from state parameter
    let ref_code = params.state.as_deref().filter(|s| !s.is_empty());

    // Save user to database (with referral tracking)
    if let Err(e) = db::upsert_user(&db_pool, &user, ref_code).await {
        tracing::error!("Failed to save user to database: {}", e);
        return Redirect::temporary(&format!("{}?error=db_error", frontend_url));
    }

    // Generate JWT token
    let token = match generate_token(
        &user_id,
        &email,
        &name,
        user_info.avatar_url.as_deref(),
        "github",
        "free",
    ) {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("Failed to generate JWT token: {}", e);
            return Redirect::temporary(&format!("{}?error=token_generation_error", frontend_url));
        }
    };

    // Redirect to frontend with token
    Redirect::temporary(&format!("{}?auth_success=true&token={}", frontend_url, urlencoding::encode(&token)))
}

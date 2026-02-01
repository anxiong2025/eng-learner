use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// JWT Claims
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,      // User ID
    pub email: String,
    pub name: String,
    pub avatar: Option<String>,
    pub provider: String,
    pub tier: String,
    pub exp: u64,         // Expiration time
    pub iat: u64,         // Issued at
}

/// Get JWT secret from environment or use default (for development only)
fn get_jwt_secret() -> String {
    std::env::var("JWT_SECRET").unwrap_or_else(|_| "eng-learner-dev-secret-change-in-production".to_string())
}

/// Generate a JWT token for a user
pub fn generate_token(
    user_id: &str,
    email: &str,
    name: &str,
    avatar: Option<&str>,
    provider: &str,
    tier: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let claims = Claims {
        sub: user_id.to_string(),
        email: email.to_string(),
        name: name.to_string(),
        avatar: avatar.map(|s| s.to_string()),
        provider: provider.to_string(),
        tier: tier.to_string(),
        exp: now + 60 * 60 * 24 * 7, // 7 days
        iat: now,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(get_jwt_secret().as_bytes()),
    )
}

/// Verify and decode a JWT token
pub fn verify_token(token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(get_jwt_secret().as_bytes()),
        &Validation::default(),
    )?;

    Ok(token_data.claims)
}

/// Auth error response
#[derive(Debug)]
pub struct AuthError {
    pub message: String,
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let body = Json(serde_json::json!({
            "error": self.message
        }));
        (StatusCode::UNAUTHORIZED, body).into_response()
    }
}

/// Authenticated user extractor
/// Use this in route handlers to require authentication
/// Example: async fn my_handler(auth: AuthUser) -> impl IntoResponse { ... }
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: String,
    pub email: String,
    pub name: String,
    pub avatar: Option<String>,
    pub provider: String,
    pub tier: String,
}

#[async_trait]
impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // Get authorization header
        let auth_header = parts
            .headers
            .get("authorization")
            .and_then(|value| value.to_str().ok());

        let token = match auth_header {
            Some(header) if header.starts_with("Bearer ") => &header[7..],
            _ => {
                return Err(AuthError {
                    message: "Missing or invalid authorization header".to_string(),
                })
            }
        };

        // Verify token
        let claims = verify_token(token).map_err(|e| AuthError {
            message: format!("Invalid token: {}", e),
        })?;

        Ok(AuthUser {
            user_id: claims.sub,
            email: claims.email,
            name: claims.name,
            avatar: claims.avatar,
            provider: claims.provider,
            tier: claims.tier,
        })
    }
}

/// Optional authenticated user extractor
/// Use this in route handlers where authentication is optional
/// Example: async fn my_handler(auth: OptionalAuthUser) -> impl IntoResponse { ... }
#[derive(Debug, Clone)]
pub struct OptionalAuthUser(pub Option<AuthUser>);

#[async_trait]
impl<S> FromRequestParts<S> for OptionalAuthUser
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let auth_user = AuthUser::from_request_parts(parts, state).await.ok();
        Ok(OptionalAuthUser(auth_user))
    }
}

impl OptionalAuthUser {
    /// Get user_id or return "default" for unauthenticated users
    pub fn user_id_or_default(&self) -> &str {
        self.0.as_ref().map(|u| u.user_id.as_str()).unwrap_or("default")
    }
}

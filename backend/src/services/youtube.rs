use crate::models::{Subtitle, VideoInfo};
use anyhow::{anyhow, Result};
use chrono::{Datelike, Utc};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::Deserialize;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Mutex;
use tokio::process::Command;

// ============ Apify Rate Limiting ============

/// Default Apify calls per user per day
const APIFY_DAILY_LIMIT_DEFAULT: u32 = 2;

/// Bonus Apify calls for users who have invited friends
const APIFY_DAILY_LIMIT_INVITED: u32 = 3;

/// yt-dlp timeout before falling back to Apify (seconds)
/// Keep short for better UX - if yt-dlp doesn't respond quickly, fallback to Apify
const YTDLP_TIMEOUT_SECS: u64 = 6;

/// (user_id, year, day_of_year) -> usage count
static APIFY_USAGE: Lazy<Mutex<HashMap<(String, i32, u32), u32>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn get_apify_usage_key(user_id: &str) -> (String, i32, u32) {
    let now = Utc::now();
    (user_id.to_string(), now.year(), now.ordinal())
}

fn get_apify_limit(has_invited: bool) -> u32 {
    if has_invited {
        APIFY_DAILY_LIMIT_INVITED
    } else {
        APIFY_DAILY_LIMIT_DEFAULT
    }
}

fn check_apify_rate_limit(user_id: &str, has_invited: bool) -> bool {
    let key = get_apify_usage_key(user_id);
    let usage = APIFY_USAGE.lock().unwrap();
    let count = usage.get(&key).copied().unwrap_or(0);
    count < get_apify_limit(has_invited)
}

fn increment_apify_usage(user_id: &str) {
    let key = get_apify_usage_key(user_id);
    let mut usage = APIFY_USAGE.lock().unwrap();

    // Clean old entries (keep only today's)
    let (_, year, day) = &key;
    usage.retain(|(_, y, d), _| y == year && d == day);

    // Increment
    *usage.entry(key).or_insert(0) += 1;
}

fn get_apify_remaining(user_id: &str, has_invited: bool) -> u32 {
    let key = get_apify_usage_key(user_id);
    let usage = APIFY_USAGE.lock().unwrap();
    let count = usage.get(&key).copied().unwrap_or(0);
    get_apify_limit(has_invited).saturating_sub(count)
}

/// Extract video ID from YouTube URL
pub fn extract_video_id(url: &str) -> Option<String> {
    // Handle youtu.be/VIDEO_ID
    if url.contains("youtu.be/") {
        return url
            .split("youtu.be/")
            .nth(1)
            .map(|s| s.split(['?', '&']).next().unwrap_or(s).to_string());
    }
    // Handle youtube.com/watch?v=VIDEO_ID
    if url.contains("v=") {
        return url
            .split("v=")
            .nth(1)
            .map(|s| s.split(['&', '#']).next().unwrap_or(s).to_string());
    }
    None
}

// ============ Apify API ============

#[derive(Debug, Deserialize)]
struct ApifyVideoResponse {
    id: Option<String>,
    title: Option<String>,
    duration: Option<String>, // Format: "00:03:33"
    #[serde(rename = "thumbnailUrl")]
    thumbnail_url: Option<String>,
    subtitles: Option<Vec<ApifySubtitle>>,
}

#[derive(Debug, Deserialize)]
struct ApifySubtitle {
    language: Option<String>,
    vtt: Option<String>,
}

fn get_apify_api_token() -> Option<String> {
    std::env::var("APIFY_API_TOKEN").ok()
}

/// Parse duration string "HH:MM:SS" to seconds
fn parse_duration_string(duration: &str) -> f64 {
    let parts: Vec<&str> = duration.split(':').collect();
    match parts.len() {
        3 => {
            let hours: f64 = parts[0].parse().unwrap_or(0.0);
            let minutes: f64 = parts[1].parse().unwrap_or(0.0);
            let seconds: f64 = parts[2].parse().unwrap_or(0.0);
            hours * 3600.0 + minutes * 60.0 + seconds
        }
        2 => {
            let minutes: f64 = parts[0].parse().unwrap_or(0.0);
            let seconds: f64 = parts[1].parse().unwrap_or(0.0);
            minutes * 60.0 + seconds
        }
        _ => 0.0,
    }
}

async fn fetch_video_info_apify(video_id: &str) -> Result<VideoInfo> {
    let api_token = get_apify_api_token()
        .ok_or_else(|| anyhow!("APIFY_API_TOKEN not configured"))?;

    let client = reqwest::Client::new();
    let url = format!(
        "https://api.apify.com/v2/acts/streamers~youtube-scraper/run-sync-get-dataset-items?token={}",
        api_token
    );
    let video_url = format!("https://www.youtube.com/watch?v={}", video_id);

    let payload = serde_json::json!({
        "startUrls": [{"url": video_url}],
        "maxResults": 1
    });

    tracing::info!("Fetching video info from Apify for: {}", video_id);

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&payload)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(anyhow!("Apify API error ({}): {}", status, text));
    }

    let data: Vec<ApifyVideoResponse> = response.json().await?;
    let video = data.into_iter().next()
        .ok_or_else(|| anyhow!("No video data returned from Apify"))?;

    let duration = video.duration
        .map(|d| parse_duration_string(&d))
        .unwrap_or(0.0);

    Ok(VideoInfo {
        video_id: video.id.unwrap_or_else(|| video_id.to_string()),
        title: video.title.unwrap_or_else(|| "Unknown".to_string()),
        duration,
        thumbnail: video.thumbnail_url.unwrap_or_else(|| {
            format!("https://img.youtube.com/vi/{}/maxresdefault.jpg", video_id)
        }),
    })
}

async fn fetch_subtitles_apify(video_id: &str, lang: &str) -> Result<Vec<Subtitle>> {
    let api_token = get_apify_api_token()
        .ok_or_else(|| anyhow!("APIFY_API_TOKEN not configured"))?;

    let client = reqwest::Client::new();
    let url = format!(
        "https://api.apify.com/v2/acts/streamers~youtube-scraper/run-sync-get-dataset-items?token={}",
        api_token
    );
    let video_url = format!("https://www.youtube.com/watch?v={}", video_id);

    // Apify only supports: en, de, es, fr, it, ja, ko, nl, pt, ru
    let sub_lang = if lang == "zh" { "any" } else { lang };

    let payload = serde_json::json!({
        "startUrls": [{"url": video_url}],
        "maxResults": 1,
        "downloadSubtitles": true,
        "subtitlesLanguage": sub_lang,
        "subtitlesFormat": "vtt"
    });

    tracing::info!("Fetching subtitles from Apify for: {} (lang: {})", video_id, lang);

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&payload)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(anyhow!("Apify API error ({}): {}", status, text));
    }

    let data: Vec<ApifyVideoResponse> = response.json().await?;
    let video = data.into_iter().next()
        .ok_or_else(|| anyhow!("No video data returned from Apify"))?;

    let subtitles_list = video.subtitles
        .ok_or_else(|| anyhow!("No subtitles returned from Apify"))?;

    // Find matching language subtitle or first available
    let subtitle = subtitles_list.into_iter()
        .find(|s| s.language.as_deref() == Some(lang))
        .ok_or_else(|| anyhow!("No {} subtitles found", lang))?;

    let vtt_content = subtitle.vtt
        .ok_or_else(|| anyhow!("Subtitle VTT content is empty"))?;

    parse_vtt(&vtt_content)
}

// ============ Supadata API (Final Fallback) ============

#[derive(Debug, Deserialize)]
struct SupadataVideoResponse {
    title: Option<String>,
    duration: Option<f64>,
    thumbnail: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SupadataTranscriptResponse {
    content: Option<Vec<SupadataSegment>>,
}

#[derive(Debug, Deserialize)]
struct SupadataSegment {
    text: String,
    offset: f64,
    duration: f64,
}

fn get_supadata_api_key() -> Option<String> {
    std::env::var("SUPADATA_API_KEY").ok()
}

async fn fetch_video_info_supadata(video_id: &str) -> Result<VideoInfo> {
    let api_key = get_supadata_api_key()
        .ok_or_else(|| anyhow!("SUPADATA_API_KEY not configured"))?;

    let client = reqwest::Client::new();
    let url = format!("https://api.supadata.ai/v1/youtube/video?id={}", video_id);

    tracing::info!("Fetching video info from Supadata for: {}", video_id);

    let response = client
        .get(&url)
        .header("x-api-key", &api_key)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(anyhow!("Supadata API error ({}): {}", status, text));
    }

    let data: SupadataVideoResponse = response.json().await?;

    Ok(VideoInfo {
        video_id: video_id.to_string(),
        title: data.title.unwrap_or_else(|| "Unknown".to_string()),
        duration: data.duration.unwrap_or(0.0),
        thumbnail: data.thumbnail.unwrap_or_else(|| {
            format!("https://img.youtube.com/vi/{}/maxresdefault.jpg", video_id)
        }),
    })
}

async fn fetch_subtitles_supadata(video_id: &str, lang: &str) -> Result<Vec<Subtitle>> {
    let api_key = get_supadata_api_key()
        .ok_or_else(|| anyhow!("SUPADATA_API_KEY not configured"))?;

    let client = reqwest::Client::new();
    let url = format!(
        "https://api.supadata.ai/v1/youtube/transcript?videoId={}&lang={}",
        video_id, lang
    );

    tracing::info!("Fetching subtitles from Supadata for: {} (lang: {})", video_id, lang);

    let response = client
        .get(&url)
        .header("x-api-key", &api_key)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(anyhow!("Supadata API error ({}): {}", status, text));
    }

    let data: SupadataTranscriptResponse = response.json().await?;
    let segments = data.content.ok_or_else(|| anyhow!("No transcript content"))?;

    let subtitles: Vec<Subtitle> = segments
        .into_iter()
        .enumerate()
        .map(|(i, seg)| Subtitle {
            index: i,
            start: seg.offset / 1000.0, // Convert ms to seconds
            end: (seg.offset + seg.duration) / 1000.0,
            text: seg.text,
            translation: None,
        })
        .collect();

    Ok(subtitles)
}

// ============ yt-dlp ============

fn get_cookies_path() -> Option<String> {
    let home = std::env::var("HOME").ok()?;
    let path = format!("{}/.config/yt-dlp/cookies.txt", home);
    if std::path::Path::new(&path).exists() {
        Some(path)
    } else {
        None
    }
}

/// Get proxy for yt-dlp from YTDLP_PROXY environment variable
fn get_proxy() -> Option<String> {
    std::env::var("YTDLP_PROXY").ok()
}

async fn fetch_video_info_ytdlp(video_id: &str) -> Result<VideoInfo> {
    let url = format!("https://www.youtube.com/watch?v={}", video_id);

    let mut args = vec!["-j", "--no-playlist", "--js-runtimes", "node"];
    let cookies_path = get_cookies_path();
    if let Some(ref path) = cookies_path {
        args.extend(["--cookies", path.as_str()]);
    }
    let proxy = get_proxy();
    if let Some(ref p) = proxy {
        tracing::info!("Using proxy for yt-dlp");
        args.extend(["--proxy", p.as_str()]);
    }
    args.push(&url);

    let output = Command::new("yt-dlp")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::error!("yt-dlp error: {}", stderr);
        // Check for common cloud deployment issues
        if stderr.contains("Sign in to confirm") || stderr.contains("bot") {
            return Err(anyhow!("This video requires verification. Please try a different video or try again later."));
        }
        return Err(anyhow!("Failed to fetch video info. Please check the URL and try again."));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let info: serde_json::Value = serde_json::from_str(&json_str)?;

    Ok(VideoInfo {
        video_id: video_id.to_string(),
        title: info["title"].as_str().unwrap_or("Unknown").to_string(),
        duration: info["duration"].as_f64().unwrap_or(0.0),
        thumbnail: info["thumbnail"].as_str().unwrap_or("").to_string(),
    })
}

async fn fetch_subtitles_ytdlp(video_id: &str, lang: &str) -> Result<Vec<Subtitle>> {
    let url = format!("https://www.youtube.com/watch?v={}", video_id);
    let temp_dir = std::env::temp_dir();
    let output_template = temp_dir.join(format!("eng_learner_{}", video_id));
    let output_path = output_template.to_string_lossy();

    let sub_lang = if lang == "zh" { "zh-Hans,zh-Hant,zh" } else { "en" };

    let mut args = vec![
        "--write-sub",
        "--write-auto-sub",
        "--sub-lang", sub_lang,
        "--sub-format", "vtt",
        "--skip-download",
        "--js-runtimes", "node",
    ];
    let cookies_path = get_cookies_path();
    if let Some(ref path) = cookies_path {
        args.extend(["--cookies", path.as_str()]);
    }
    let proxy = get_proxy();
    if let Some(ref p) = proxy {
        args.extend(["--proxy", p.as_str()]);
    }
    args.extend(["-o", &output_path, &url]);

    let output = Command::new("yt-dlp")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::warn!("yt-dlp subtitle fetch warning: {}", stderr);
    }

    let lang_code = if lang == "zh" { "zh" } else { "en" };
    let possible_files = vec![
        format!("{}.{}.vtt", output_path, lang_code),
        format!("{}.{}-Hans.vtt", output_path, lang_code),
        format!("{}.{}-Hant.vtt", output_path, lang_code),
    ];

    for file_path in &possible_files {
        if let Ok(content) = tokio::fs::read_to_string(file_path).await {
            let subtitles = parse_vtt(&content)?;
            let _ = tokio::fs::remove_file(file_path).await;
            return Ok(subtitles);
        }
    }

    Err(anyhow!("No subtitles found for language: {}", lang))
}

fn parse_vtt(content: &str) -> Result<Vec<Subtitle>> {
    let mut subtitles: Vec<Subtitle> = Vec::new();
    let lines: Vec<&str> = content.lines().collect();

    let timestamp_re = Regex::new(r"(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})")?;
    let tag_re = Regex::new(r"<[^>]+>")?;

    let mut i = 0;
    let mut index = 0;

    while i < lines.len() {
        let line = lines[i].trim();

        if let Some(caps) = timestamp_re.captures(line) {
            let start = parse_timestamp(&caps[1])?;
            let end = parse_timestamp(&caps[2])?;

            let mut text_parts = Vec::new();
            i += 1;
            while i < lines.len() {
                let text_line = lines[i].trim();
                if text_line.is_empty() || timestamp_re.is_match(text_line) {
                    break;
                }
                let clean_text = tag_re.replace_all(text_line, "").to_string();
                if !clean_text.is_empty() {
                    text_parts.push(clean_text);
                }
                i += 1;
            }

            let text = text_parts.join(" ").trim().to_string();

            if !text.is_empty() {
                if let Some(last) = subtitles.last_mut() {
                    if last.text == text {
                        last.end = end;
                        continue;
                    }
                }

                subtitles.push(Subtitle {
                    index,
                    start,
                    end,
                    text,
                    translation: None,
                });
                index += 1;
            }
        } else {
            i += 1;
        }
    }

    Ok(subtitles)
}

fn parse_timestamp(ts: &str) -> Result<f64> {
    let parts: Vec<&str> = ts.split(':').collect();
    if parts.len() != 3 {
        return Err(anyhow!("Invalid timestamp format: {}", ts));
    }

    let hours: f64 = parts[0].parse()?;
    let minutes: f64 = parts[1].parse()?;
    let seconds: f64 = parts[2].parse()?;

    Ok(hours * 3600.0 + minutes * 60.0 + seconds)
}

// ============ Public API ============

/// Fetch video info: try yt-dlp with timeout, fallback to Apify with rate limiting
/// - user_id: for rate limiting tracking
/// - has_invited: if true, user gets 3 Apify calls/day instead of 2
pub async fn fetch_video_info(video_id: &str, user_id: Option<&str>, has_invited: bool) -> Result<VideoInfo> {
    let user = user_id.unwrap_or("anonymous");

    // Try yt-dlp with timeout
    let ytdlp_result = tokio::time::timeout(
        std::time::Duration::from_secs(YTDLP_TIMEOUT_SECS),
        fetch_video_info_ytdlp(video_id),
    )
    .await;

    match ytdlp_result {
        Ok(Ok(info)) => {
            tracing::info!("Got video info from yt-dlp for: {}", video_id);
            return Ok(info);
        }
        Ok(Err(e)) => {
            tracing::warn!("yt-dlp failed for {}: {}", video_id, e);
        }
        Err(_) => {
            tracing::warn!("yt-dlp timeout ({}s) for {}", YTDLP_TIMEOUT_SECS, video_id);
        }
    }

    // Check Apify rate limit
    let limit = get_apify_limit(has_invited);
    if !check_apify_rate_limit(user, has_invited) {
        let remaining = get_apify_remaining(user, has_invited);
        return Err(anyhow!(
            "Apify daily limit reached ({}/{} used). Please try again tomorrow or invite friends for more quota.",
            limit - remaining,
            limit
        ));
    }

    // Fallback to Apify
    tracing::info!("Falling back to Apify for: {} (user: {}, has_invited: {})", video_id, user, has_invited);
    match fetch_video_info_apify(video_id).await {
        Ok(info) => {
            increment_apify_usage(user);
            let remaining = get_apify_remaining(user, has_invited);
            tracing::info!(
                "Got video info from Apify for: {} (user: {}, remaining: {}/{})",
                video_id,
                user,
                remaining,
                limit
            );
            return Ok(info);
        }
        Err(e) => {
            tracing::warn!("Apify failed for {}: {}", video_id, e);
        }
    }

    // Final fallback to Supadata
    tracing::info!("Falling back to Supadata for: {}", video_id);
    match fetch_video_info_supadata(video_id).await {
        Ok(info) => {
            tracing::info!("Got video info from Supadata for: {}", video_id);
            Ok(info)
        }
        Err(e) => {
            tracing::error!("All sources failed for {}: {}", video_id, e);
            Err(anyhow!("Failed to fetch video info from all sources"))
        }
    }
}

/// Fetch subtitles: try yt-dlp with timeout, fallback to Apify with rate limiting
/// - user_id: for rate limiting tracking
/// - has_invited: if true, user gets 3 Apify calls/day instead of 2
pub async fn fetch_subtitles(video_id: &str, lang: &str, user_id: Option<&str>, has_invited: bool) -> Result<Vec<Subtitle>> {
    let user = user_id.unwrap_or("anonymous");

    // Try yt-dlp with timeout
    let ytdlp_result = tokio::time::timeout(
        std::time::Duration::from_secs(YTDLP_TIMEOUT_SECS),
        fetch_subtitles_ytdlp(video_id, lang),
    )
    .await;

    match ytdlp_result {
        Ok(Ok(subs)) => {
            tracing::info!("Got subtitles from yt-dlp for: {} (lang: {})", video_id, lang);
            return Ok(subs);
        }
        Ok(Err(e)) => {
            tracing::warn!("yt-dlp subtitles failed for {}: {}", video_id, e);
        }
        Err(_) => {
            tracing::warn!("yt-dlp subtitles timeout ({}s) for {}", YTDLP_TIMEOUT_SECS, video_id);
        }
    }

    // Check Apify rate limit
    let limit = get_apify_limit(has_invited);
    if !check_apify_rate_limit(user, has_invited) {
        let remaining = get_apify_remaining(user, has_invited);
        return Err(anyhow!(
            "Apify daily limit reached ({}/{} used). Please try again tomorrow or invite friends for more quota.",
            limit - remaining,
            limit
        ));
    }

    // Fallback to Apify
    tracing::info!("Falling back to Apify subtitles for: {} (user: {}, has_invited: {})", video_id, user, has_invited);
    match fetch_subtitles_apify(video_id, lang).await {
        Ok(subs) => {
            increment_apify_usage(user);
            let remaining = get_apify_remaining(user, has_invited);
            tracing::info!(
                "Got subtitles from Apify for: {} (user: {}, remaining: {}/{})",
                video_id,
                user,
                remaining,
                limit
            );
            return Ok(subs);
        }
        Err(e) => {
            tracing::warn!("Apify subtitles failed for {}: {}", video_id, e);
        }
    }

    // Final fallback to Supadata
    tracing::info!("Falling back to Supadata subtitles for: {} (lang: {})", video_id, lang);
    match fetch_subtitles_supadata(video_id, lang).await {
        Ok(subs) => {
            tracing::info!("Got subtitles from Supadata for: {} (lang: {})", video_id, lang);
            Ok(subs)
        }
        Err(e) => {
            tracing::error!("All subtitle sources failed for {}: {}", video_id, e);
            Err(anyhow!("Failed to fetch subtitles from all sources"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_video_id() {
        assert_eq!(
            extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
        assert_eq!(
            extract_video_id("https://youtu.be/dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
    }

    #[test]
    fn test_parse_timestamp() {
        assert!((parse_timestamp("00:01:30.500").unwrap() - 90.5).abs() < 0.001);
    }

    #[test]
    fn test_parse_duration_string() {
        // Test HH:MM:SS format
        assert!((parse_duration_string("00:03:33") - 213.0).abs() < 0.001);
        assert!((parse_duration_string("01:30:00") - 5400.0).abs() < 0.001);
        // Test MM:SS format
        assert!((parse_duration_string("03:33") - 213.0).abs() < 0.001);
        // Test edge cases
        assert!((parse_duration_string("00:00:00") - 0.0).abs() < 0.001);
    }

    #[tokio::test]
    async fn test_apify_video_info() {
        if std::env::var("APIFY_API_TOKEN").is_err() {
            println!("Skipping Apify test: APIFY_API_TOKEN not set");
            return;
        }

        let result = fetch_video_info_apify("dQw4w9WgXcQ").await;
        assert!(result.is_ok(), "Apify video info failed: {:?}", result.err());

        let info = result.unwrap();
        assert_eq!(info.video_id, "dQw4w9WgXcQ");
        assert!(info.title.contains("Rick Astley") || info.title.contains("Never Gonna"));
        assert!(info.duration > 200.0); // Should be ~213 seconds
    }

    #[tokio::test]
    async fn test_apify_subtitles() {
        if std::env::var("APIFY_API_TOKEN").is_err() {
            println!("Skipping Apify test: APIFY_API_TOKEN not set");
            return;
        }

        let result = fetch_subtitles_apify("dQw4w9WgXcQ", "en").await;
        assert!(result.is_ok(), "Apify subtitles failed: {:?}", result.err());

        let subs = result.unwrap();
        assert!(!subs.is_empty(), "Should have subtitles");
        // Check first subtitle has valid data
        assert!(!subs[0].text.is_empty());
        assert!(subs[0].start >= 0.0);
    }

    #[test]
    fn test_apify_rate_limit() {
        // Use unique user ID to avoid conflicts with other tests
        let test_user = "test_normal_user_unique_12345";
        let has_invited = false;

        // Initially should have full quota (2 for non-invited users)
        assert_eq!(get_apify_remaining(test_user, has_invited), APIFY_DAILY_LIMIT_DEFAULT);
        assert!(check_apify_rate_limit(test_user, has_invited));

        // Use up the quota
        for _ in 0..APIFY_DAILY_LIMIT_DEFAULT {
            assert!(check_apify_rate_limit(test_user, has_invited));
            increment_apify_usage(test_user);
        }

        // Should be at limit now
        assert_eq!(get_apify_remaining(test_user, has_invited), 0);
        assert!(!check_apify_rate_limit(test_user, has_invited));
    }

    #[test]
    fn test_apify_rate_limit_with_invite() {
        // Use a unique user ID to avoid conflicts with other tests
        let test_user = "test_invited_user_unique_67890";
        let has_invited = true;

        // Invited users should have 3 quota
        assert_eq!(get_apify_remaining(test_user, has_invited), APIFY_DAILY_LIMIT_INVITED);
        assert!(check_apify_rate_limit(test_user, has_invited));

        // Use up the quota
        for _ in 0..APIFY_DAILY_LIMIT_INVITED {
            assert!(check_apify_rate_limit(test_user, has_invited));
            increment_apify_usage(test_user);
        }

        // Should be at limit now
        assert_eq!(get_apify_remaining(test_user, has_invited), 0);
        assert!(!check_apify_rate_limit(test_user, has_invited));
    }
}

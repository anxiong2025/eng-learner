use crate::models::{Subtitle, VideoInfo};
use anyhow::{anyhow, Result};
use regex::Regex;
use serde::Deserialize;
use std::process::Stdio;
use tokio::process::Command;

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

// ============ Supadata API ============

#[derive(Debug, Deserialize)]
struct SupadataVideoResponse {
    title: Option<String>,
    duration: Option<f64>,
    thumbnail: Option<String>,
    #[allow(dead_code)]
    channel: Option<SupadataChannel>,
}

#[derive(Debug, Deserialize)]
struct SupadataChannel {
    #[allow(dead_code)]
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SupadataTranscriptResponse {
    content: Option<Vec<SupadataSegment>>,
    lang: Option<String>,
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

    // Retry logic for rate limiting
    let mut retries = 0;
    let response = loop {
        let resp = client
            .get(&url)
            .header("x-api-key", &api_key)
            .send()
            .await?;

        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS && retries < 2 {
            retries += 1;
            tracing::info!("Rate limited, waiting 1.5s before retry {}", retries);
            tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
            continue;
        }
        break resp;
    };

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
    let video_url = format!("https://www.youtube.com/watch?v={}", video_id);
    let mut api_url = format!("https://api.supadata.ai/v1/transcript?url={}", video_url);

    if !lang.is_empty() {
        api_url.push_str(&format!("&lang={}", lang));
    }

    // Retry logic for rate limiting
    let mut retries = 0;
    let response = loop {
        let resp = client
            .get(&api_url)
            .header("x-api-key", &api_key)
            .send()
            .await?;

        if resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS && retries < 2 {
            retries += 1;
            tracing::info!("Rate limited on transcript, waiting 1.5s before retry {}", retries);
            tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
            continue;
        }
        break resp;
    };

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(anyhow!("Supadata transcript API error ({}): {}", status, text));
    }

    let data: SupadataTranscriptResponse = response.json().await?;

    // Check if returned language matches requested language
    if !lang.is_empty() {
        if let Some(returned_lang) = &data.lang {
            let lang_matches = match lang {
                "zh" => returned_lang.starts_with("zh"),
                "en" => returned_lang.starts_with("en"),
                _ => returned_lang.starts_with(lang),
            };
            if !lang_matches {
                return Err(anyhow!("Requested {} subtitles but got {}", lang, returned_lang));
            }
        }
    }

    let segments = data.content.unwrap_or_default();
    if segments.is_empty() {
        return Err(anyhow!("No subtitles found for language: {}", lang));
    }

    // Check if timestamps are in milliseconds by looking at the max offset
    // If max offset > 3600 (1 hour in seconds), it's likely milliseconds
    let max_offset = segments.iter().map(|s| s.offset).fold(0.0f64, f64::max);
    let is_milliseconds = max_offset > 3600.0;
    let divisor = if is_milliseconds { 1000.0 } else { 1.0 };

    let subtitles: Vec<Subtitle> = segments
        .into_iter()
        .enumerate()
        .map(|(index, seg)| {
            let start = seg.offset / divisor;
            let duration = seg.duration / divisor;
            Subtitle {
                index,
                start,
                end: start + duration,
                text: seg.text,
                translation: None,
            }
        })
        .collect();

    Ok(subtitles)
}

// ============ yt-dlp Fallback ============

fn get_cookies_path() -> Option<String> {
    let home = std::env::var("HOME").ok()?;
    let path = format!("{}/.config/yt-dlp/cookies.txt", home);
    if std::path::Path::new(&path).exists() {
        Some(path)
    } else {
        None
    }
}

async fn fetch_video_info_ytdlp(video_id: &str) -> Result<VideoInfo> {
    let url = format!("https://www.youtube.com/watch?v={}", video_id);

    let mut args = vec!["-j", "--no-playlist"];
    let cookies_path = get_cookies_path();
    if let Some(ref path) = cookies_path {
        args.extend(["--cookies", path.as_str()]);
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
    ];
    let cookies_path = get_cookies_path();
    if let Some(ref path) = cookies_path {
        args.extend(["--cookies", path.as_str()]);
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

// ============ Public API with Fallback ============

/// Fetch video info: try Supadata first, fallback to yt-dlp
pub async fn fetch_video_info(video_id: &str) -> Result<VideoInfo> {
    // Try Supadata first
    match fetch_video_info_supadata(video_id).await {
        Ok(info) => {
            tracing::info!("Fetched video info via Supadata");
            return Ok(info);
        }
        Err(e) => {
            tracing::warn!("Supadata failed, falling back to yt-dlp: {}", e);
        }
    }

    // Fallback to yt-dlp
    fetch_video_info_ytdlp(video_id).await
}

/// Fetch subtitles: try Supadata first, fallback to yt-dlp
pub async fn fetch_subtitles(video_id: &str, lang: &str) -> Result<Vec<Subtitle>> {
    // Try Supadata first
    match fetch_subtitles_supadata(video_id, lang).await {
        Ok(subs) => {
            tracing::info!("Fetched subtitles via Supadata");
            return Ok(subs);
        }
        Err(e) => {
            tracing::warn!("Supadata failed, falling back to yt-dlp: {}", e);
        }
    }

    // Fallback to yt-dlp
    fetch_subtitles_ytdlp(video_id, lang).await
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
}

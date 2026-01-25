use crate::models::{Subtitle, VideoInfo};
use anyhow::{anyhow, Result};
use regex::Regex;
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

/// Fetch video info using yt-dlp
pub async fn fetch_video_info(video_id: &str) -> Result<VideoInfo> {
    let url = format!("https://www.youtube.com/watch?v={}", video_id);

    let output = Command::new("yt-dlp")
        .args(["-j", "--no-playlist", &url])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("yt-dlp failed: {}", stderr));
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

/// Fetch subtitles using yt-dlp
pub async fn fetch_subtitles(video_id: &str, lang: &str) -> Result<Vec<Subtitle>> {
    let url = format!("https://www.youtube.com/watch?v={}", video_id);
    let temp_dir = std::env::temp_dir();
    let output_template = temp_dir.join(format!("eng_learner_{}", video_id));
    let output_path = output_template.to_string_lossy();

    // Try to get subtitles (auto-generated or manual)
    let sub_lang = if lang == "zh" { "zh-Hans,zh-Hant,zh" } else { "en" };

    let output = Command::new("yt-dlp")
        .args([
            "--write-sub",
            "--write-auto-sub",
            "--sub-lang", sub_lang,
            "--sub-format", "vtt",
            "--skip-download",
            "-o", &output_path,
            &url,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::warn!("yt-dlp subtitle fetch warning: {}", stderr);
    }

    // Find the subtitle file
    let lang_code = if lang == "zh" { "zh" } else { "en" };
    let possible_files = vec![
        format!("{}.{}.vtt", output_path, lang_code),
        format!("{}.{}-Hans.vtt", output_path, lang_code),
        format!("{}.{}-Hant.vtt", output_path, lang_code),
    ];

    for file_path in &possible_files {
        if let Ok(content) = tokio::fs::read_to_string(file_path).await {
            let subtitles = parse_vtt(&content)?;
            // Clean up temp file
            let _ = tokio::fs::remove_file(file_path).await;
            return Ok(subtitles);
        }
    }

    // Also check for auto-generated subtitles
    let auto_file = format!("{}.{}.vtt", output_path, lang_code);
    if let Ok(content) = tokio::fs::read_to_string(&auto_file).await {
        let subtitles = parse_vtt(&content)?;
        let _ = tokio::fs::remove_file(&auto_file).await;
        return Ok(subtitles);
    }

    Err(anyhow!("No subtitles found for language: {}", lang))
}

/// Parse VTT subtitle format
fn parse_vtt(content: &str) -> Result<Vec<Subtitle>> {
    let mut subtitles: Vec<Subtitle> = Vec::new();
    let lines: Vec<&str> = content.lines().collect();

    // Regex for timestamp: 00:00:00.000 --> 00:00:00.000
    let timestamp_re = Regex::new(r"(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})")?;
    // Regex to remove VTT tags like <c>, </c>, <00:00:00.000>
    let tag_re = Regex::new(r"<[^>]+>")?;

    let mut i = 0;
    let mut index = 0;

    while i < lines.len() {
        let line = lines[i].trim();

        if let Some(caps) = timestamp_re.captures(line) {
            let start = parse_timestamp(&caps[1])?;
            let end = parse_timestamp(&caps[2])?;

            // Collect text lines until empty line or next timestamp
            let mut text_parts = Vec::new();
            i += 1;
            while i < lines.len() {
                let text_line = lines[i].trim();
                if text_line.is_empty() || timestamp_re.is_match(text_line) {
                    break;
                }
                // Remove VTT formatting tags
                let clean_text = tag_re.replace_all(text_line, "").to_string();
                if !clean_text.is_empty() {
                    text_parts.push(clean_text);
                }
                i += 1;
            }

            let text = text_parts.join(" ").trim().to_string();

            // Skip empty or duplicate subtitles
            if !text.is_empty() {
                // Merge with previous if same text (common in auto-generated subs)
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

/// Parse timestamp string to seconds
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

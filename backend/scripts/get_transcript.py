#!/usr/bin/env python3
"""
Fetch YouTube transcript using youtube-transcript-api
Usage: python get_transcript.py <video_id> [lang]
Output: JSON array of transcript segments
"""

import sys
import json
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound

def get_transcript(video_id: str, lang: str = "en") -> dict:
    try:
        # Try to get transcript in requested language
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

        # Try manual transcript first, then auto-generated
        transcript = None
        try:
            transcript = transcript_list.find_transcript([lang])
        except NoTranscriptFound:
            # Try auto-generated
            try:
                transcript = transcript_list.find_generated_transcript([lang])
            except NoTranscriptFound:
                # Fall back to English if requested language not available
                if lang != "en":
                    try:
                        transcript = transcript_list.find_transcript(["en"])
                    except NoTranscriptFound:
                        transcript = transcript_list.find_generated_transcript(["en"])

        if transcript is None:
            return {"error": "No transcript found", "segments": []}

        segments = transcript.fetch()
        return {
            "language": transcript.language_code,
            "segments": [
                {
                    "text": seg["text"],
                    "start": seg["start"],
                    "duration": seg["duration"]
                }
                for seg in segments
            ]
        }
    except TranscriptsDisabled:
        return {"error": "Transcripts are disabled for this video", "segments": []}
    except Exception as e:
        return {"error": str(e), "segments": []}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: get_transcript.py <video_id> [lang]", "segments": []}))
        sys.exit(1)

    video_id = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else "en"

    result = get_transcript(video_id, lang)
    print(json.dumps(result))

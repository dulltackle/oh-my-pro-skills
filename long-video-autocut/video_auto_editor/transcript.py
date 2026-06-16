"""Whisper CLI 转写封装。"""

import os
import subprocess
import sys
from dataclasses import dataclass

from video_auto_editor.config import CONFIG


@dataclass
class WhisperConfig:
    """Whisper 片段转写配置。"""

    model: str = "small"
    language: str = "zh"
    timeout: int = 120
    output_format: str = "txt"
    sample_rate: int = 16000
    channels: int = 1


@dataclass
class TranscriptionResult:
    """单个片段的转写结果。"""

    success: bool
    text: str = ""
    audio_path: str = ""
    transcript_path: str = ""
    error: str = ""


class WhisperTranscriber:
    """基于 Whisper CLI 的片段转写器。"""

    def __init__(self, config=None):
        self.config = config or WhisperConfig()

    def is_available(self, timeout=10):
        """检查当前 Python 解释器中是否可调用 Whisper。"""
        if not sys.executable:
            return False

        try:
            result = subprocess.run(
                [sys.executable, "-m", "whisper", "--help"],
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            return result.returncode == 0
        except Exception:
            return False

    def transcribe_segment(self, video_path, segment_index, start_time, end_time, work_dir):
        """抽取片段音频并调用 Whisper 转写。"""
        try:
            safe_index = int(segment_index)
        except (TypeError, ValueError):
            raise ValueError(f"segment_index must be an integer: {segment_index!r}")
        if safe_index < 0:
            raise ValueError(f"segment_index must be non-negative: {segment_index!r}")

        os.makedirs(work_dir, exist_ok=True)
        audio_path = os.path.join(work_dir, f"segment_{safe_index}.wav")
        transcript_path = os.path.join(work_dir, f"segment_{safe_index}.{self.config.output_format}")

        if os.path.exists(transcript_path):
            os.remove(transcript_path)

        audio_result = subprocess.run(
            [
                "ffmpeg", "-y", "-i", video_path,
                "-ss", str(start_time), "-to", str(end_time),
                "-vn", "-ar", str(self.config.sample_rate),
                "-ac", str(self.config.channels), audio_path,
            ],
            capture_output=True,
            text=True,
        )
        if audio_result.returncode != 0:
            return TranscriptionResult(
                success=False,
                audio_path=audio_path,
                transcript_path=transcript_path,
                error=f"Audio extraction failed: {audio_result.stderr.strip()}",
            )
        if not os.path.exists(audio_path):
            return TranscriptionResult(
                success=False,
                audio_path=audio_path,
                transcript_path=transcript_path,
                error="Audio extraction did not create output file",
            )

        try:
            whisper_result = subprocess.run(
                [
                    sys.executable, "-m", "whisper", audio_path,
                    "--model", self.config.model,
                    "--language", self.config.language,
                    "--output_format", self.config.output_format,
                    "--output_dir", work_dir,
                ],
                capture_output=True,
                text=True,
                timeout=self.config.timeout,
            )
        except subprocess.TimeoutExpired:
            return TranscriptionResult(
                success=False,
                audio_path=audio_path,
                transcript_path=transcript_path,
                error=f"Whisper timed out after {self.config.timeout}s",
            )
        except Exception as exc:
            return TranscriptionResult(
                success=False,
                audio_path=audio_path,
                transcript_path=transcript_path,
                error=f"Whisper failed: {exc}",
            )

        if whisper_result.returncode != 0:
            return TranscriptionResult(
                success=False,
                audio_path=audio_path,
                transcript_path=transcript_path,
                error=f"Whisper command failed: {whisper_result.stderr.strip()}",
            )
        if not os.path.exists(transcript_path):
            return TranscriptionResult(
                success=False,
                audio_path=audio_path,
                transcript_path=transcript_path,
                error="Transcript file not generated",
            )

        with open(transcript_path, "r", encoding="utf-8") as transcript_file:
            text = transcript_file.read().strip()

        return TranscriptionResult(
            success=True,
            text=text,
            audio_path=audio_path,
            transcript_path=transcript_path,
        )


def create_whisper_transcriber(config=None):
    """从配置创建 Whisper 转写器。"""
    config = config or CONFIG
    return WhisperTranscriber(
        WhisperConfig(
            model=config["whisper_model"],
            language=config["whisper_language"],
            timeout=config["whisper_timeout"],
            output_format=config["whisper_output_format"],
            sample_rate=config["whisper_sample_rate"],
            channels=config["whisper_channels"],
        )
    )


def transcribe_candidates(video_path, candidates, work_dir, transcriber=None, config=None):
    """原地转写候选片段；失败时保持 seg.transcript 为空并继续处理。"""
    print("\n🎤 Step 6: Transcribing candidates...")
    transcriber = transcriber or create_whisper_transcriber(config)

    if not transcriber.is_available():
        print("   ⚠️  Whisper not installed or unavailable, skipping transcription, using audio-only scoring")
        return candidates

    for segment in candidates:
        print(f"   Transcribing segment_{segment.index}...")
        result = transcriber.transcribe_segment(
            video_path=video_path,
            segment_index=segment.index,
            start_time=segment.start_time,
            end_time=segment.end_time,
            work_dir=work_dir,
        )
        if result.success:
            segment.transcript = result.text
            if segment.transcript:
                preview = segment.transcript[:50] + "..." if len(segment.transcript) > 50 else segment.transcript
                print(f"   ✅ [{preview}]")
        else:
            print(f"    ⚠️  Transcription failed: segment_{segment.index}: {result.error}")

    return candidates

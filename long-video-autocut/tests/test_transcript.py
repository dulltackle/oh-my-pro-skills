import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from video_auto_editor import transcript
from video_auto_editor.transcript import TranscriptionResult, WhisperConfig, WhisperTranscriber


def completed(returncode=0, stderr=""):
    return SimpleNamespace(returncode=returncode, stderr=stderr)


def test_is_available_returns_true_when_whisper_help_succeeds(monkeypatch):
    def fake_run(cmd, **kwargs):
        assert cmd[:3] == [transcript.sys.executable, "-m", "whisper"]
        return completed(0)

    monkeypatch.setattr(transcript.subprocess, "run", fake_run)

    assert WhisperTranscriber().is_available() is True


def test_is_available_returns_false_for_nonzero_exception_and_timeout(monkeypatch):
    monkeypatch.setattr(transcript.subprocess, "run", lambda *args, **kwargs: completed(1))
    assert WhisperTranscriber().is_available() is False

    def raise_error(*args, **kwargs):
        raise OSError("missing")

    monkeypatch.setattr(transcript.subprocess, "run", raise_error)
    assert WhisperTranscriber().is_available() is False

    def raise_timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired(args[0], kwargs.get("timeout", 10))

    monkeypatch.setattr(transcript.subprocess, "run", raise_timeout)
    assert WhisperTranscriber().is_available() is False


def test_is_available_returns_false_when_python_executable_missing(monkeypatch):
    def fail_if_called(*args, **kwargs):
        raise AssertionError("subprocess.run should not be called")

    monkeypatch.setattr(transcript.sys, "executable", None)
    monkeypatch.setattr(transcript.subprocess, "run", fail_if_called)

    assert WhisperTranscriber().is_available() is False


def test_transcribe_segment_rejects_invalid_segment_index(monkeypatch, tmp_path):
    def fail_if_called(*args, **kwargs):
        raise AssertionError("subprocess.run should not be called")

    monkeypatch.setattr(transcript.subprocess, "run", fail_if_called)

    with pytest.raises(ValueError, match="segment_index must be an integer"):
        WhisperTranscriber().transcribe_segment(
            video_path="input.mov",
            segment_index="../../etc/passwd",
            start_time=0,
            end_time=10,
            work_dir=str(tmp_path),
        )

    assert not list(tmp_path.iterdir())


def test_transcribe_segment_rejects_negative_segment_index(monkeypatch, tmp_path):
    def fail_if_called(*args, **kwargs):
        raise AssertionError("subprocess.run should not be called")

    monkeypatch.setattr(transcript.subprocess, "run", fail_if_called)

    with pytest.raises(ValueError, match="segment_index must be non-negative"):
        WhisperTranscriber().transcribe_segment(
            video_path="input.mov",
            segment_index=-1,
            start_time=0,
            end_time=10,
            work_dir=str(tmp_path),
        )

    assert not list(tmp_path.iterdir())


def test_ffmpeg_failure_does_not_call_whisper(monkeypatch, tmp_path):
    calls = []

    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        return completed(1, "ffmpeg failed")

    monkeypatch.setattr(transcript.subprocess, "run", fake_run)

    result = WhisperTranscriber().transcribe_segment(
        video_path="input.mov",
        segment_index=1,
        start_time=0,
        end_time=10,
        work_dir=str(tmp_path),
    )

    assert result.success is False
    assert "Audio extraction failed" in result.error
    assert len(calls) == 1
    assert calls[0][0] == "ffmpeg"


def test_whisper_failure_deletes_stale_transcript_and_does_not_read_it(monkeypatch, tmp_path):
    stale_transcript = tmp_path / "segment_2.txt"
    stale_transcript.write_text("旧文本", encoding="utf-8")

    def fake_run(cmd, **kwargs):
        if cmd[0] == "ffmpeg":
            Path(cmd[-1]).write_bytes(b"audio")
            return completed(0)
        return completed(1, "whisper failed")

    monkeypatch.setattr(transcript.subprocess, "run", fake_run)

    result = WhisperTranscriber().transcribe_segment(
        video_path="input.mov",
        segment_index=2,
        start_time=1,
        end_time=11,
        work_dir=str(tmp_path),
    )

    assert result.success is False
    assert result.text == ""
    assert "Whisper command failed" in result.error
    assert not stale_transcript.exists()


def test_missing_transcript_after_whisper_success_does_not_use_stale_file(monkeypatch, tmp_path):
    stale_transcript = tmp_path / "segment_3.txt"
    stale_transcript.write_text("stale", encoding="utf-8")

    def fake_run(cmd, **kwargs):
        if cmd[0] == "ffmpeg":
            Path(cmd[-1]).write_bytes(b"audio")
        return completed(0)

    monkeypatch.setattr(transcript.subprocess, "run", fake_run)

    result = WhisperTranscriber().transcribe_segment(
        video_path="input.mov",
        segment_index=3,
        start_time=2,
        end_time=12,
        work_dir=str(tmp_path),
    )

    assert result.success is False
    assert result.text == ""
    assert result.error == "Transcript file not generated"
    assert not stale_transcript.exists()


def test_whisper_success_returns_transcript_text(monkeypatch, tmp_path):
    def fake_run(cmd, **kwargs):
        if cmd[0] == "ffmpeg":
            Path(cmd[-1]).write_bytes(b"audio")
            return completed(0)
        transcript_path = tmp_path / "segment_4.txt"
        transcript_path.write_text("  转写内容  \n", encoding="utf-8")
        return completed(0)

    monkeypatch.setattr(transcript.subprocess, "run", fake_run)

    result = WhisperTranscriber(WhisperConfig(timeout=30)).transcribe_segment(
        video_path="input.mov",
        segment_index=4,
        start_time=3,
        end_time=13,
        work_dir=str(tmp_path),
    )

    assert result == TranscriptionResult(
        success=True,
        text="转写内容",
        audio_path=str(tmp_path / "segment_4.wav"),
        transcript_path=str(tmp_path / "segment_4.txt"),
    )


def test_transcribe_candidates_skips_when_whisper_unavailable():
    candidates = [SimpleNamespace(index=1, start_time=0, end_time=10, transcript="")]

    class FakeTranscriber:
        def is_available(self):
            return False

    result = transcript.transcribe_candidates("input.mov", candidates, "work", FakeTranscriber())

    assert result is candidates
    assert candidates[0].transcript == ""


def test_transcribe_candidates_continues_after_single_segment_failure():
    candidates = [
        SimpleNamespace(index=1, start_time=0, end_time=10, transcript=""),
        SimpleNamespace(index=2, start_time=11, end_time=20, transcript=""),
    ]

    class FakeTranscriber:
        def is_available(self):
            return True

        def transcribe_segment(self, **kwargs):
            if kwargs["segment_index"] == 1:
                return TranscriptionResult(success=False, error="failed")
            return TranscriptionResult(success=True, text="第二段")

    transcript.transcribe_candidates("input.mov", candidates, "work", FakeTranscriber())

    assert candidates[0].transcript == ""
    assert candidates[1].transcript == "第二段"

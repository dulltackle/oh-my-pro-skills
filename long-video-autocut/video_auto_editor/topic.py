"""直播拆条候选片段生成。"""

import re

from video_auto_editor.config import CONFIG
from video_auto_editor.models import ClipCandidate


def generate_clip_candidates(chunks, silences, total_duration, config=None):
    """基于转写时间戳滑窗，并用静音边界校准候选片段。"""
    config = config or CONFIG
    clean_silences = _normalize_silences(silences, total_duration)
    clean_chunks = [
        (index, chunk)
        for index, chunk in enumerate(chunks)
        if _normalize_text(chunk.text)
    ]
    if not clean_chunks:
        return []

    target_duration = float(config["target_clip_duration"])
    overlap = float(config["topic_overlap_seconds"])
    min_duration = float(config["min_clip_duration"])
    max_duration = float(config["max_clip_duration"])

    candidates = []
    start_pos = 0
    candidate_index = 0

    while start_pos < len(clean_chunks):
        window = _build_window(clean_chunks, start_pos, target_duration)
        if not window:
            break

        first_original_index, first_chunk = window[0]
        last_original_index, last_chunk = window[-1]
        raw_start = float(first_chunk.start)
        raw_end = float(last_chunk.end)
        start_time, start_adjusted = _adjust_start(raw_start, clean_silences, config)
        end_time, end_adjusted = _adjust_end(raw_end, clean_silences, total_duration, config)
        start_time = _clamp(start_time, 0.0, total_duration)
        end_time = _clamp(end_time, 0.0, total_duration)
        duration = end_time - start_time

        if duration > 0 and min_duration <= duration <= max_duration:
            text = _normalize_text(" ".join(chunk.text for _, chunk in window))
            candidates.append(
                ClipCandidate(
                    index=candidate_index,
                    start_time=start_time,
                    end_time=end_time,
                    duration=duration,
                    text=text,
                    base_score=_score_candidate(duration, target_duration, start_adjusted, end_adjusted),
                    chunk_start_index=first_original_index,
                    chunk_end_index=last_original_index,
                )
            )
            candidate_index += 1

        next_pos = _next_window_start(clean_chunks, start_pos, raw_end, overlap)
        last_window_pos = start_pos + len(window) - 1
        if next_pos == last_window_pos and last_window_pos == len(clean_chunks) - 1:
            break
        if next_pos <= start_pos:
            next_pos = start_pos + 1
        start_pos = next_pos

    return candidates


def _build_window(clean_chunks, start_pos, target_duration):
    window = []
    start_time = float(clean_chunks[start_pos][1].start)
    end_time = start_time

    for item in clean_chunks[start_pos:]:
        window.append(item)
        end_time = float(item[1].end)
        if end_time - start_time >= target_duration:
            break

    return window


def _next_window_start(clean_chunks, start_pos, raw_end, overlap):
    next_start_time = max(float(clean_chunks[start_pos][1].start), raw_end - overlap)
    for pos in range(start_pos + 1, len(clean_chunks)):
        if float(clean_chunks[pos][1].end) > next_start_time:
            return pos
    return len(clean_chunks)


def _adjust_start(raw_start, silences, config):
    expand_before = float(config["context_expand_before"])
    lower_bound = raw_start - expand_before
    candidates = [
        silence_end
        for _, silence_end in silences
        if lower_bound <= silence_end <= raw_start
    ]
    if not candidates:
        return raw_start, False
    return max(candidates), True


def _adjust_end(raw_end, silences, total_duration, config):
    expand_after = float(config["context_expand_after"])
    upper_bound = min(raw_end + expand_after, total_duration)
    candidates = [
        silence_start
        for silence_start, _ in silences
        if raw_end <= silence_start <= upper_bound
    ]
    if not candidates:
        return raw_end, False
    return min(candidates), True


def _normalize_silences(silences, total_duration):
    normalized = []
    for silence_start, silence_end in silences:
        start = _clamp(float(silence_start), 0.0, total_duration)
        end = _clamp(float(silence_end), 0.0, total_duration)
        if start < end:
            normalized.append((start, end))
    return sorted(normalized)


def _score_candidate(duration, target_duration, start_adjusted, end_adjusted):
    if target_duration <= 0:
        duration_score = 80
    else:
        distance_ratio = abs(duration - target_duration) / target_duration
        duration_score = 90 - min(40, distance_ratio * 40)
    boundary_bonus = (5 if start_adjusted else 0) + (5 if end_adjusted else 0)
    return round(_clamp(duration_score + boundary_bonus, 0, 100), 1)


def _normalize_text(text):
    return re.sub(r"\s+", " ", str(text).strip())


def _clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))

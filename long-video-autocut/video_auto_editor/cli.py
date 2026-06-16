"""命令行入口与单视频、批处理流程编排。"""

import datetime
import glob
import os
import shutil
import sys

from video_auto_editor.config import CONFIG
from video_auto_editor.dedup import check_duplicate_content, cross_video_dedup
from video_auto_editor.media import clip_segment, concat_videos, get_video_duration
from video_auto_editor.models import ClipInfo
from video_auto_editor.report import generate_batch_report, generate_single_report
from video_auto_editor.scoring import analyze_fluency, calculate_adjusted_score, score_segment
from video_auto_editor.selection import select_best_segment
from video_auto_editor.silence import detect_silence, identify_segments
from video_auto_editor.transcript import transcribe_candidates


def process_single_video(video_path, output_dir, work_dir, batch_mode=False, config=None):
    """处理单条视频，成功时返回 ClipInfo，失败时返回 None。"""
    config = config or CONFIG
    video_name = os.path.splitext(os.path.basename(video_path))[0]
    video_work = os.path.join(work_dir, video_name)
    os.makedirs(video_work, exist_ok=True)

    print(f"\n{'=' * 60}")
    print(f"  Processing: {video_name}" if batch_mode else f"  Video Auto Editor v4.7 - Scenario A\n  Input: {video_path}")
    print(f"{'=' * 60}\n")

    print("📋 Step 1: Getting video info...")
    total_duration = get_video_duration(video_path)
    if total_duration is None:
        print("   ❌ Failed to get video info")
        return None
    print(f"   Duration: {total_duration:.1f}s ({total_duration / 60:.1f}min)")

    print("\n🔇 Step 2: Silence detection...")
    try:
        silences = detect_silence(video_path, config)
    except RuntimeError as exc:
        print(f"   ❌ {exc}")
        return None
    print(f"   Detected {len(silences)} silence spans")

    print("\n📝 Step 3: Segment identification...")
    segments = identify_segments(silences, total_duration)
    print(f"   Identified {len(segments)} segments")

    print("\n⭐ Step 4: Scoring...")
    for segment in segments:
        score_segment(segment, silences, total_duration)
        print(
            f"   segment_{segment.index}: {segment.start_time:.1f}s-{segment.end_time:.1f}s "
            f"({segment.duration:.1f}s) score={segment.total_score}"
        )

    print(f"\n🔍 Step 5: Filtering candidates (min_score={config['min_score']}, min_duration={config['min_duration']}s)...")
    candidates = [
        segment for segment in segments
        if segment.total_score >= config["min_score"] and segment.duration >= config["min_duration"]
    ]
    print(f"   {len(candidates)} candidate segments")

    if not candidates:
        print("\n⚠️  No candidates meet criteria, lowering standards...")
        candidates = sorted(segments, key=lambda segment: segment.total_score, reverse=True)[:5]
        print(f"   Selected top {len(candidates)} segments by score")

    candidates = transcribe_candidates(video_path, candidates, video_work, config=config)

    print("\n📊 Step 7: Fluency analysis...")
    for segment in candidates:
        if segment.transcript:
            (
                segment.repeat_count,
                segment.stutter_count,
                segment.is_natural_end,
                segment.is_interrupted,
            ) = analyze_fluency(segment.transcript)
        segment.adjusted_score = calculate_adjusted_score(segment, config)
        status = (" ✅natural end" if segment.is_natural_end else "") + (" ❌interrupted" if segment.is_interrupted else "")
        print(
            f"   segment_{segment.index}: base={segment.total_score} adjusted={segment.adjusted_score:.1f}"
            f" repeat={segment.repeat_count} stutter={segment.stutter_count}{status}"
        )

    print("\n🔄 Step 8: Duplicate content detection...")
    candidates = check_duplicate_content(candidates, config)
    print(f"   Marked {sum(1 for candidate in candidates if candidate.is_duplicate)} duplicate segments")

    print("\n🏆 Step 9: Selecting best segment...")
    best = select_best_segment(candidates)
    if not best:
        print("   ❌ Cannot select best segment")
        return None

    print(
        f"   ✅ Best: segment_{best.index} | "
        f"{best.start_time:.1f}-{best.end_time:.1f}s ({best.duration:.1f}s) | "
        f"adjusted={best.adjusted_score:.1f} | natural_end={'yes' if best.is_natural_end else 'no'}"
    )

    print("\n✂️  Step 10: Clipping output...")
    output_path = os.path.join(output_dir, f"{video_name}_clip.mp4")
    if not clip_segment(video_path, best, output_path, config):
        print("   ❌ Failed to clip")
        return None
    print(f"   ✅ Output: {output_path}")

    if not batch_mode:
        report_path = generate_single_report(
            video_name, output_dir, total_duration, silences, segments, candidates, best
        )
        print(f"   📄 Report: {report_path}")

    return ClipInfo(
        video_name=video_name,
        clip_path=output_path,
        transcript=best.transcript,
        adjusted_score=best.adjusted_score,
        is_natural_end=best.is_natural_end,
        duration=best.duration,
    )


def _find_video_files(input_dir):
    return sorted(
        glob.glob(os.path.join(input_dir, "*.MTS")) +
        glob.glob(os.path.join(input_dir, "*.mp4")) +
        glob.glob(os.path.join(input_dir, "*.mov"))
    )


def process_batch(input_dir, output_dir, work_dir, config=None):
    """批处理视频目录，输出拼接视频和批处理报告。"""
    config = config or CONFIG
    video_files = _find_video_files(input_dir)
    if not video_files:
        print("❌ No video files found")
        return

    print(f"\n{'=' * 60}")
    print("  Video Auto Editor v4.7 - Scenario B (Batch)")
    print(f"  Input directory: {input_dir} ({len(video_files)} videos)")
    print(f"{'=' * 60}\n")

    clips = []
    failed = []
    for video_file in video_files:
        clip = process_single_video(video_file, output_dir, work_dir, batch_mode=True, config=config)
        if clip:
            clips.append(clip)
        else:
            failed.append(video_file)
            print(f"   ⚠️  Failed to process {os.path.basename(video_file)}")

    if not clips:
        print("❌ No videos processed successfully")
        return

    print(f"\n{'=' * 60}")
    print(f"  🔄 Cross-video dedup check ({len(clips)} clips)")
    print(f"{'=' * 60}\n")

    clips = cross_video_dedup(clips, config)
    kept = [clip for clip in clips if not clip.is_cross_duplicate]
    removed = [clip for clip in clips if clip.is_cross_duplicate]

    for clip in removed:
        print(f"   ❌ Remove {clip.video_name} (duplicate of {clip.duplicate_of}, adjusted {clip.adjusted_score:.1f})")
    for clip in kept:
        print(f"   ✅ Keep {clip.video_name} (adjusted {clip.adjusted_score:.1f})")
    print(f"\n   Dedup result: {len(clips)} -> {len(kept)} clips")

    print(f"\n{'=' * 60}")
    print(f"  🎬 Concatenating {len(kept)} clips")
    print(f"{'=' * 60}\n")

    final_path = os.path.join(output_dir, f"final_concat_{datetime.datetime.now().strftime('%Y%m%d_%H%M')}.mp4")
    if not concat_videos([clip.clip_path for clip in kept], final_path, config):
        print("   ❌ Concatenation failed")
        return
    print(f"   ✅ Final video: {final_path}")

    for clip in clips:
        if os.path.exists(clip.clip_path):
            os.remove(clip.clip_path)
    if os.path.exists(work_dir) and _can_remove_work_dir(work_dir, output_dir):
        shutil.rmtree(work_dir, ignore_errors=True)
    elif os.path.exists(work_dir):
        print("   ⚠️  Skipping work_dir cleanup to avoid deleting output files")

    report_path = generate_batch_report(output_dir, clips, kept, removed, final_path)
    print(f"   📄 Report: {report_path}")
    print(f"\n{'=' * 60}")
    print(f"  Batch processing complete! ({len(kept)}/{len(clips)} clips)")
    print(f"{'=' * 60}\n")


def _can_remove_work_dir(work_dir, output_dir):
    """只有 work_dir 与 output_dir 完全不重叠时才允许目录级清理。"""
    work_abs = os.path.abspath(work_dir)
    output_abs = os.path.abspath(output_dir)
    common = os.path.commonpath([work_abs, output_abs])
    return common not in {work_abs, output_abs}


def main(argv=None):
    """兼容旧位置参数格式的命令行入口。"""
    argv = sys.argv[1:] if argv is None else list(argv)

    if len(argv) >= 1 and os.path.isdir(argv[0]):
        input_dir = argv[0]
        output_dir = argv[1] if len(argv) > 1 else "./output"
        work_dir = argv[2] if len(argv) > 2 else "./video_work"
        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(work_dir, exist_ok=True)
        process_batch(input_dir, output_dir, work_dir)
        return

    video_path = argv[0] if len(argv) > 0 else "02047.MTS"
    output_dir = argv[1] if len(argv) > 1 else "./output"
    work_dir = argv[2] if len(argv) > 2 else "./video_work"
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(work_dir, exist_ok=True)

    clip = process_single_video(video_path, output_dir, work_dir)
    if clip:
        print(f"  Scenario A complete: {clip.clip_path}")
    else:
        print("  ❌ Processing failed")

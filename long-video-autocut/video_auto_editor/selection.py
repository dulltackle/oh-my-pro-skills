"""候选片段选择策略。"""


def _fluency_rate(seg):
    return (seg.stutter_count + seg.repeat_count) / max(1.0, seg.duration / 30.0)


def select_best_segment(candidates):
    """分层选择最佳片段：自然结尾、流畅度、调整分、时长或顺序。"""
    if not candidates:
        return None

    pool = [c for c in candidates if not c.is_duplicate] or list(candidates)
    all_unnatural = not any(s.is_natural_end for s in pool)

    natural_end = [s for s in pool if s.is_natural_end]
    if natural_end:
        pool = natural_end

    pool.sort(key=_fluency_rate)
    best_rate = _fluency_rate(pool[0])
    pool = [s for s in pool if _fluency_rate(s) - best_rate <= 1.5]

    pool.sort(key=lambda s: s.adjusted_score, reverse=True)
    pool = [s for s in pool if s.adjusted_score == pool[0].adjusted_score]

    if len(pool) > 1:
        if all_unnatural:
            pool.sort(key=lambda s: s.index, reverse=True)
        else:
            pool.sort(key=lambda s: s.duration, reverse=True)

    return pool[0]

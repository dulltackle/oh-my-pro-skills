from datetime import datetime


class RateLimiter:
    def __init__(self, store):
        self.store = store

    def _is_quiet_hour(self, quiet_hours, current_hour):
        start, end = quiet_hours
        if start > end:
            return current_hour >= start or current_hour < end
        return start <= current_hour < end

    def can_send(self, contact=None):
        del contact
        now = datetime.now()
        config = self.store.get_config()

        if self._is_quiet_hour(config.quiet_hours, now.hour):
            return False, "静默时段"

        last_record = self.store.get_last_record()
        if last_record and last_record.status == "fail":
            last_fail_dt = datetime.strptime(last_record.created_at, "%Y-%m-%d %H:%M:%S")
            fail_elapsed = (now - last_fail_dt).total_seconds()
            if fail_elapsed < config.fail_cooldown_sec:
                return False, f"失败冷却中({int(fail_elapsed)}s < {config.fail_cooldown_sec}s)"

        hour_count = self.store.get_hour_count()
        if hour_count >= config.max_per_hour:
            return False, f"已达每小时上限({hour_count}/{config.max_per_hour})"

        last_send = self.store.get_last_send_time()
        if last_send:
            last_dt = datetime.strptime(last_send, "%Y-%m-%d %H:%M:%S")
            elapsed = (now - last_dt).total_seconds()
            if elapsed < config.min_interval_sec:
                return False, f"距上次发送间隔不足({int(elapsed)}s < {config.min_interval_sec}s)"

        return True, "OK"

    def record_send(self, contact, content, payload_type, status="ok", error_summary=None):
        self.store.add_record(
            contact=contact,
            content=content,
            payload_type=payload_type,
            status=status,
            error_summary=error_summary,
        )

    def get_status(self):
        config = self.store.get_config()
        now = datetime.now()
        last_record = self.store.get_last_record()
        last_fail = None
        if last_record and last_record.status == "fail":
            last_fail = last_record.created_at

        return {
            "hour_sent": self.store.get_hour_count(),
            "hour_limit": config.max_per_hour,
            "quiet": self._is_quiet_hour(config.quiet_hours, now.hour),
            "last_send": self.store.get_last_send_time(),
            "last_fail": last_fail,
        }

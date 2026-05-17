import json
from dataclasses import asdict, dataclass, field


class ConfigValidationError(ValueError):
    pass


def _ensure_int(name, value):
    if not isinstance(value, int):
        raise ConfigValidationError(f"{name} 必须是整数")


def validate_safety_config_values(values):
    positive_fields = ("max_per_hour",)
    non_negative_fields = ("min_interval_sec", "fail_cooldown_sec")

    for name in positive_fields:
        _ensure_int(name, values[name])
        if values[name] <= 0:
            raise ConfigValidationError(f"{name} 必须大于 0")

    for name in non_negative_fields:
        _ensure_int(name, values[name])
        if values[name] < 0:
            raise ConfigValidationError(f"{name} 必须大于等于 0")

    quiet_hours = values["quiet_hours"]
    if not isinstance(quiet_hours, list) or len(quiet_hours) != 2:
        raise ConfigValidationError("quiet_hours 必须是长度为 2 的整数数组")
    for hour in quiet_hours:
        _ensure_int("quiet_hours", hour)
        if hour < 0 or hour > 23:
            raise ConfigValidationError("quiet_hours 每项必须在 0-23 之间")


@dataclass
class SafetyConfig:
    max_per_hour: int = 3
    min_interval_sec: int = 120
    quiet_hours: list = field(default_factory=lambda: [23, 7])
    fail_cooldown_sec: int = 600

    def __post_init__(self):
        validate_safety_config_values(asdict(self))

    def to_dict(self):
        data = asdict(self)
        data["quiet_hours"] = json.dumps(data["quiet_hours"])
        return data

    @classmethod
    def from_row(cls, row):
        return cls(
            max_per_hour=row["max_per_hour"],
            min_interval_sec=row["min_interval_sec"],
            quiet_hours=json.loads(row["quiet_hours"]),
            fail_cooldown_sec=row["fail_cooldown_sec"],
        )


@dataclass
class SendRecord:
    id: int
    contact: str
    content: str
    payload_type: str
    status: str
    created_at: str
    error_summary: str = None

    @classmethod
    def from_row(cls, row):
        return cls(
            id=row["id"],
            contact=row["contact"],
            content=row["content"],
            payload_type=row["payload_type"],
            status=row["status"],
            error_summary=row["error_summary"],
            created_at=row["created_at"],
        )

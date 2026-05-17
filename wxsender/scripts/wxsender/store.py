import json
import os
import sqlite3
from datetime import datetime

from .models import SafetyConfig, SendRecord, validate_safety_config_values


_CREATE_SCHEMA = """
CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    max_per_hour INTEGER NOT NULL DEFAULT 3,
    min_interval_sec INTEGER NOT NULL DEFAULT 120,
    quiet_hours TEXT NOT NULL DEFAULT '[23, 7]',
    fail_cooldown_sec INTEGER NOT NULL DEFAULT 600
);

CREATE TABLE IF NOT EXISTS send_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact TEXT NOT NULL,
    payload_type TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL,
    error_summary TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS contacts (
    contact TEXT PRIMARY KEY,
    search_index INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_send_records_created ON send_records(created_at);
CREATE INDEX IF NOT EXISTS idx_send_records_contact_created ON send_records(contact, created_at);
"""


class Store:
    def __init__(self, db_path=":memory:"):
        if db_path != ":memory:":
            os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self._conn = sqlite3.connect(db_path)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._init_schema()

    def _init_schema(self):
        self._conn.executescript(_CREATE_SCHEMA)
        self._conn.execute("INSERT OR IGNORE INTO config (id) VALUES (1)")
        self._conn.commit()

    def close(self):
        self._conn.close()

    def get_config(self):
        row = self._conn.execute("SELECT * FROM config WHERE id = 1").fetchone()
        return SafetyConfig.from_row(row)

    def update_config(self, **kwargs):
        config = self.get_config()
        values = {
            "max_per_hour": config.max_per_hour,
            "min_interval_sec": config.min_interval_sec,
            "quiet_hours": config.quiet_hours,
            "fail_cooldown_sec": config.fail_cooldown_sec,
        }
        valid_keys = set(values)
        sets = []
        params = []

        for key, value in kwargs.items():
            if key == "quiet_hours":
                sets.append("quiet_hours = ?")
                params.append(json.dumps(value))
                values[key] = value
                continue
            if key not in valid_keys:
                raise ValueError(f"未知配置项: {key}")
            sets.append(f"{key} = ?")
            params.append(value)
            values[key] = value

        if not sets:
            return

        validate_safety_config_values(values)
        params.append(1)
        self._conn.execute(f"UPDATE config SET {', '.join(sets)} WHERE id = ?", params)
        self._conn.commit()

    def add_record(self, contact, content, payload_type, status="ok", error_summary=None):
        self._conn.execute(
            """
            INSERT INTO send_records (
                contact, payload_type, content, status, error_summary
            ) VALUES (?, ?, ?, ?, ?)
            """,
            (contact, payload_type, content, status, error_summary),
        )
        self._conn.commit()

    def _today_prefix(self):
        return datetime.now().strftime("%Y-%m-%d")

    def _hour_prefix(self):
        return datetime.now().strftime("%Y-%m-%d %H")

    def get_today_count(self, status="ok"):
        row = self._conn.execute(
            "SELECT COUNT(*) FROM send_records WHERE created_at LIKE ? AND status = ?",
            (self._today_prefix() + "%", status),
        ).fetchone()
        return row[0]

    def get_hour_count(self, status="ok"):
        row = self._conn.execute(
            "SELECT COUNT(*) FROM send_records WHERE created_at LIKE ? AND status = ?",
            (self._hour_prefix() + "%", status),
        ).fetchone()
        return row[0]

    def get_last_send_time(self, status="ok"):
        row = self._conn.execute(
            "SELECT created_at FROM send_records WHERE status = ? ORDER BY id DESC LIMIT 1",
            (status,),
        ).fetchone()
        if row is None:
            return None
        return row["created_at"]

    def get_last_record(self):
        row = self._conn.execute("SELECT * FROM send_records ORDER BY id DESC LIMIT 1").fetchone()
        if row is None:
            return None
        return SendRecord.from_row(row)

    def get_history(self, limit=20, contact=None):
        if contact:
            rows = self._conn.execute(
                "SELECT * FROM send_records WHERE contact = ? ORDER BY id DESC LIMIT ?",
                (contact, limit),
            ).fetchall()
        else:
            rows = self._conn.execute(
                "SELECT * FROM send_records ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [SendRecord.from_row(row) for row in rows]

    def get_search_index(self, contact, default=1):
        row = self._conn.execute(
            "SELECT search_index FROM contacts WHERE contact = ?",
            (contact,),
        ).fetchone()
        if row is None:
            return default
        return row["search_index"]

    def set_search_index(self, contact, index):
        if index < 1:
            raise ValueError("search_index 必须大于等于 1")
        self._conn.execute(
            """
            INSERT INTO contacts (contact, search_index, updated_at)
            VALUES (?, ?, datetime('now', 'localtime'))
            ON CONFLICT(contact) DO UPDATE SET
                search_index = excluded.search_index,
                updated_at = datetime('now', 'localtime')
            """,
            (contact, index),
        )
        self._conn.commit()

    def list_contacts(self):
        rows = self._conn.execute(
            "SELECT contact, search_index, updated_at FROM contacts ORDER BY contact"
        ).fetchall()
        return [
            {
                "contact": row["contact"],
                "search_index": row["search_index"],
                "updated_at": row["updated_at"],
            }
            for row in rows
        ]

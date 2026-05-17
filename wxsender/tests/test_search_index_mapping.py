from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.wxsender.sender import WeChatSender
from scripts.wxsender.services import MessageService, ServiceError


class FakeSimulator:
    def __init__(self):
        self.pressed_keys = []
        self.hotkeys = []
        self.clipboard_text = []
        self.active_window = "微信"

    def activate_window(self, window_name="微信"):
        self.active_window = window_name

    def is_window_active(self, window_name="微信"):
        return self.active_window == window_name

    def hotkey(self, *keys):
        self.hotkeys.append(keys)

    def type_via_clipboard(self, text):
        self.clipboard_text.append(text)

    def press_key(self, key):
        self.pressed_keys.append(key)

    def random_delay(self, *_args, **_kwargs):
        return None


class DummyStore:
    def get_search_index(self, contact, default=None):
        del contact
        return default


def build_sender():
    sender = WeChatSender(dry_run=False)
    sender.sim = FakeSimulator()
    return sender


def test_search_index_one_presses_no_down():
    sender = build_sender()

    sender._navigate_to_chat("张三", 1)

    assert sender.sim.pressed_keys == ["Return"]


def test_search_index_two_presses_one_down():
    sender = build_sender()

    sender._navigate_to_chat("张三", 2)

    assert sender.sim.pressed_keys == ["Down", "Return"]


def test_search_index_three_presses_two_downs():
    sender = build_sender()

    sender._navigate_to_chat("张三", 3)

    assert sender.sim.pressed_keys == ["Down", "Down", "Return"]


def test_message_service_rejects_search_index_less_than_one():
    service = MessageService(store=DummyStore(), sender_factory=object)

    try:
        service._resolve_search_index("张三", 0)
    except ServiceError as exc:
        assert exc.message == "search_index 必须大于等于 1"
    else:
        raise AssertionError("expected ServiceError for invalid search_index")

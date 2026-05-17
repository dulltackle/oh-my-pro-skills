import mimetypes
import os
import shutil
import subprocess
import time
import random
import logging
import logging as _logging


class SenderError(RuntimeError):
    def __init__(self, step, summary, detail=None):
        super().__init__(summary)
        self.step = step
        self.summary = summary
        self.detail = detail or summary

    def __str__(self):
        return f"{self.step}: {self.summary}"


class DependencyMissingError(SenderError):
    pass


class WindowNotFoundError(SenderError):
    pass


class WindowActivationError(SenderError):
    pass


class ClipboardError(SenderError):
    pass


class InputError(SenderError):
    pass


def _run_checked(command, step, summary, **kwargs):
    try:
        return subprocess.run(command, check=True, **kwargs)
    except FileNotFoundError as exc:
        raise DependencyMissingError(step, f"缺少依赖: {command[0]}", str(exc)) from exc
    except subprocess.CalledProcessError as exc:
        raise SenderError(step, summary, str(exc)) from exc


class HumanSimulator:
    @staticmethod
    def random_delay(min_s=0.5, max_s=2.5):
        time.sleep(random.uniform(min_s, max_s))

    @staticmethod
    def set_clipboard(text):
        _run_checked(
            ["xclip", "-selection", "clipboard"],
            "clipboard",
            "剪贴板写入失败",
            input=text.encode("utf-8"),
        )

    @staticmethod
    def set_clipboard_file(file_path):
        mime_type, _ = mimetypes.guess_type(file_path)
        if mime_type and mime_type.startswith("image/"):
            _run_checked(
                ["xclip", "-selection", "clipboard",
                 "-t", mime_type, "-i", file_path],
                "clipboard",
                "附件写入剪贴板失败",
            )
        else:
            uri = f"file://{os.path.abspath(file_path)}"
            _run_checked(
                ["xclip", "-selection", "clipboard",
                 "-t", "text/uri-list"],
                "clipboard",
                "附件写入剪贴板失败",
                input=uri.encode("utf-8"),
            )

    @staticmethod
    def paste_clipboard():
        _run_checked(["xdotool", "key", "ctrl+v"], "paste", "粘贴操作失败")

    @staticmethod
    def activate_window(window_name="微信"):
        result = HumanSimulator.find_window(window_name)
        wids = result.stdout.strip().split()
        activated = False
        for wid in reversed(wids):
            try:
                r = subprocess.run(
                    ["xdotool", "windowactivate", "--sync", wid],
                    capture_output=True,
                    text=True,
                    timeout=3,
                )
            except FileNotFoundError as exc:
                raise DependencyMissingError("activate_window", "缺少依赖: xdotool", str(exc)) from exc
            except subprocess.TimeoutExpired as exc:
                raise WindowActivationError("activate_window", f"窗口激活超时: {window_name}", str(exc)) from exc
            if r.returncode == 0:
                time.sleep(0.3)
                name_result = HumanSimulator.get_active_window_name()
                if window_name in name_result.stdout:
                    activated = True
                    break
        if not activated:
            raise WindowActivationError("activate_window", f"窗口激活失败: {window_name}")

    @staticmethod
    def type_via_clipboard(text):
        try:
            HumanSimulator.set_clipboard(text)
        except SenderError as exc:
            raise ClipboardError("clipboard", exc.summary, exc.detail) from exc
        HumanSimulator.paste_clipboard()

    @staticmethod
    def press_key(key):
        _run_checked(["xdotool", "key", key], "key", f"按键失败: {key}")

    @staticmethod
    def hotkey(*keys):
        combo = "+".join(keys)
        _run_checked(["xdotool", "key", combo], "key", f"组合键失败: {combo}")

    @staticmethod
    def find_window(window_name="微信"):
        try:
            result = subprocess.run(
                ["xdotool", "search", "--name", window_name],
                capture_output=True,
                text=True,
            )
        except FileNotFoundError as exc:
            raise DependencyMissingError("preflight", "缺少依赖: xdotool", str(exc)) from exc
        if result.returncode != 0 or not result.stdout.strip():
            raise WindowNotFoundError("preflight", f"未找到窗口: {window_name}")
        return result

    @staticmethod
    def get_active_window_name():
        try:
            return subprocess.run(
                ["xdotool", "getactivewindow", "getwindowname"],
                capture_output=True,
                text=True,
            )
        except FileNotFoundError as exc:
            raise DependencyMissingError("active_window", "缺少依赖: xdotool", str(exc)) from exc

    @staticmethod
    def is_window_active(window_name="微信"):
        result = HumanSimulator.get_active_window_name()
        return window_name in result.stdout


logger = _logging.getLogger(__name__)


class WeChatSender:
    def __init__(self, dry_run=False):
        self.sim = HumanSimulator()
        self.dry_run = dry_run

    def preflight(self, window_name="微信"):
        if self.dry_run:
            return

        for dependency in ("xclip", "xdotool"):
            if shutil.which(dependency) is None:
                raise DependencyMissingError("preflight", f"缺少依赖: {dependency}")

        self.sim.find_window(window_name)

    def send(self, contact, message=None, file_path=None, search_index=1):
        self.preflight()
        if file_path is not None:
            return self._send_file(contact, file_path, search_index)
        return self._send_text(contact, message, search_index)

    def _send_text(self, contact, message, search_index):
        if self.dry_run:
            logger.info(f"[DRY-RUN] 将发送 | 联系人:{contact} | 消息:{message} | search_index:{search_index}")
            return True

        self._navigate_to_chat(contact, search_index)
        self.sim.type_via_clipboard(message)
        self.sim.random_delay(0.5, 1.0)

        self.sim.press_key("Return")
        self.sim.random_delay(0.5, 1.0)

        return True

    def _send_file(self, contact, file_path, search_index):
        if self.dry_run:
            logger.info(f"[DRY-RUN] 将发送文件 | 联系人:{contact} | 文件:{file_path} | search_index:{search_index}")
            return True

        self._navigate_to_chat(contact, search_index)
        self.sim.set_clipboard_file(file_path)
        self.sim.random_delay(0.3, 0.8)

        self.sim.paste_clipboard()
        self.sim.random_delay(0.5, 1.0)

        self.sim.press_key("Return")
        self.sim.random_delay(0.5, 1.0)

        return True

    def _navigate_to_chat(self, contact, search_index):
        if search_index < 1:
            raise InputError("search_index 必须大于等于 1")

        try:
            self.sim.activate_window("微信")
        except SenderError as e:
            logger.error(f"窗口激活失败 | 原因:{e}")
            raise

        self.sim.random_delay(0.5, 1.5)
        if not self.sim.is_window_active("微信"):
            raise WindowActivationError("activate_window", "窗口激活后检查失败")

        self.sim.hotkey("ctrl", "f")
        self.sim.random_delay(0.8, 1.5)
        if not self.sim.is_window_active("微信"):
            raise WindowActivationError("search", "搜索步骤窗口丢失")

        self.sim.type_via_clipboard(contact)
        self.sim.random_delay(1.0, 2.0)

        down_count = search_index - 1
        for _ in range(down_count):
            self.sim.press_key("Down")
            self.sim.random_delay(0.3, 0.6)

        self.sim.press_key("Return")
        self.sim.random_delay(1.0, 1.5)

        self.sim.hotkey("alt", "Tab")
        self.sim.random_delay(0.3, 0.5)
        self.sim.hotkey("alt", "Tab")
        self.sim.random_delay(0.5, 1.0)

        return True

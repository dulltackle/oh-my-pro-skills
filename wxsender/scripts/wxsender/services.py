import os
from dataclasses import dataclass

from .rater import RateLimiter
from .sender import SenderError, WeChatSender


class ServiceError(RuntimeError):
    def __init__(self, message, exit_code=1):
        super().__init__(message)
        self.message = message
        self.exit_code = exit_code


@dataclass
class SendOutcome:
    contact: str
    message: str
    file_path: str
    dry_run: bool


class MessageService:
    def __init__(self, store, sender_factory=None, limiter_factory=None):
        self.store = store
        self.sender_factory = sender_factory or WeChatSender
        self.limiter_factory = limiter_factory or RateLimiter

    def _resolve_search_index(self, contact, search_index):
        if search_index is not None:
            if search_index < 1:
                raise ServiceError("search_index 必须大于等于 1")
            return search_index

        resolved = self.store.get_search_index(contact, default=None)
        if resolved is None:
            raise ServiceError(f"联系人 {contact} 未配置搜索结果位次，请先使用 contact --set {contact} --search-index N")
        return resolved

    def _dispatch_send(
        self,
        *,
        contact,
        message=None,
        file_path=None,
        search_index,
        force=False,
        dry_run=False,
    ):
        limiter = self.limiter_factory(self.store)
        if not force and not dry_run:
            can_send, reason = limiter.can_send(contact)
            if not can_send:
                raise ServiceError(f"限频拒绝: {reason}", exit_code=2)

        sender = self.sender_factory(dry_run=dry_run)
        content = message or file_path or ""
        payload_type = "attachment" if file_path else "text"

        try:
            success = sender.send(
                contact,
                message=message,
                file_path=file_path,
                search_index=search_index,
            )
        except SenderError as exc:
            if not dry_run:
                limiter.record_send(
                    contact=contact,
                    content=content,
                    payload_type=payload_type,
                    status="fail",
                    error_summary=exc.summary,
                )
            raise ServiceError(f"发送失败({exc.step}): {exc.summary}", exit_code=3) from exc

        if not success:
            if not dry_run:
                limiter.record_send(
                    contact=contact,
                    content=content,
                    payload_type=payload_type,
                    status="fail",
                )
            raise ServiceError("发送失败(send): 未完成发送动作", exit_code=3)

        if not dry_run:
            limiter.record_send(
                contact=contact,
                content=content,
                payload_type=payload_type,
                status="ok",
            )

        return SendOutcome(
            contact=contact,
            message=message,
            file_path=file_path,
            dry_run=dry_run,
        )

    def send_text(self, contact, message, search_index=None, force=False, dry_run=False):
        if not message:
            raise ServiceError("--message 不能为空")

        resolved_search_index = self._resolve_search_index(contact, search_index)
        return self._dispatch_send(
            contact=contact,
            message=message,
            file_path=None,
            search_index=resolved_search_index,
            force=force,
            dry_run=dry_run,
        )

    def send_file(self, contact, file_path, search_index=None, force=False, dry_run=False):
        if not os.path.isfile(file_path):
            raise ServiceError(f"附件文件不存在: {file_path}")

        resolved_search_index = self._resolve_search_index(contact, search_index)
        resolved_file_path = os.path.abspath(file_path)
        return self._dispatch_send(
            contact=contact,
            message=None,
            file_path=resolved_file_path,
            search_index=resolved_search_index,
            force=force,
            dry_run=dry_run,
        )

import argparse
import json
import os
import sys

from .store import Store
from .rater import RateLimiter
from .sender import WeChatSender
from .services import MessageService, ServiceError


def _get_skill_root():
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _get_default_db_path():
    return os.path.join(_get_skill_root(), ".state", "state.db")


def build_parser():
    parser = argparse.ArgumentParser(prog="wxsender", description="微信消息发送工具")
    parser.add_argument("--db", default=None, help="SQLite 数据库路径")

    sub = parser.add_subparsers(dest="command")

    p_config = sub.add_parser("config", help="查看/修改安全配置")
    p_config.add_argument("--json", action="store_true", dest="as_json")
    p_config.add_argument("--set", action="append", dest="sets", metavar="KEY=VALUE")

    p_send_text = sub.add_parser("send-text", help="立即发送文本消息")
    p_send_text.add_argument("--contact", required=True)
    p_send_text.add_argument("--message", required=True)
    p_send_text.add_argument("--search-index", type=int, default=None, help="联系人搜索结果位次（1-based，第 N 个结果，底层按 N-1 次 Down）")
    p_send_text.add_argument("--force", action="store_true")
    p_send_text.add_argument("--dry-run", action="store_true")

    p_send_file = sub.add_parser("send-file", help="立即发送附件")
    p_send_file.add_argument("--contact", required=True)
    p_send_file.add_argument("--file", dest="file_path", required=True)
    p_send_file.add_argument("--search-index", type=int, default=None, help="联系人搜索结果位次（1-based，第 N 个结果，底层按 N-1 次 Down）")
    p_send_file.add_argument("--force", action="store_true")
    p_send_file.add_argument("--dry-run", action="store_true")

    p_history = sub.add_parser("history", help="查看发送历史")
    p_history.add_argument("--limit", type=int, default=20)
    p_history.add_argument("--contact", default=None)

    p_status = sub.add_parser("status", help="限频状态概览")
    p_status.add_argument("--json", action="store_true", dest="as_json")

    p_contact = sub.add_parser("contact", help="管理联系人搜索结果位次")
    p_contact.add_argument("--list", action="store_true", dest="show_list", help="列出所有联系人")
    p_contact.add_argument("--set", metavar="CONTACT", default=None, help="设置联系人")
    p_contact.add_argument("--search-index", type=int, default=None, help="搜索结果位次（1-based，第 N 个结果，底层按 N-1 次 Down）")
    p_contact.add_argument("--json", action="store_true", dest="as_json")

    return parser


def _json_output(data):
    print(json.dumps(data, ensure_ascii=False, indent=2))


def _error(msg):
    print(f"错误: {msg}", file=sys.stderr)
    return 1


def _run_service(action):
    try:
        action()
        return 0
    except ServiceError as exc:
        print(f"错误: {exc.message}", file=sys.stderr)
        return exc.exit_code


def _handle_config(args, store):
    if args.sets:
        updates = {}
        for item in args.sets:
            if "=" not in item:
                return _error(f"格式错误: {item}，应为 KEY=VALUE")
            key, value = item.split("=", 1)
            if key == "quiet_hours":
                try:
                    updates[key] = json.loads(value)
                except json.JSONDecodeError:
                    return _error(f"quiet_hours 值必须是 JSON 数组")
            elif key in ("max_per_hour", "min_interval_sec", "fail_cooldown_sec"):
                try:
                    updates[key] = int(value)
                except ValueError:
                    return _error(f"{key} 值必须是整数")
            else:
                return _error(f"未知配置项: {key}")
        try:
            store.update_config(**updates)
        except ValueError as e:
            return _error(str(e))

    config = store.get_config()
    if args.as_json:
        _json_output({
            "max_per_hour": config.max_per_hour,
            "min_interval_sec": config.min_interval_sec,
            "quiet_hours": config.quiet_hours,
            "fail_cooldown_sec": config.fail_cooldown_sec,
        })
    else:
        print(f"max_per_hour:    {config.max_per_hour}")
        print(f"min_interval_sec: {config.min_interval_sec}")
        print(f"quiet_hours:     {config.quiet_hours}")
        print(f"fail_cooldown_sec: {config.fail_cooldown_sec}")
    return 0


def _handle_send_text(args, store):
    service = MessageService(store, sender_factory=WeChatSender)
    try:
        outcome = service.send_text(
            contact=args.contact,
            message=args.message,
            search_index=args.search_index,
            force=args.force,
            dry_run=args.dry_run,
        )
    except ServiceError as exc:
        print(f"错误: {exc.message}", file=sys.stderr)
        return exc.exit_code
    _json_output({
        "success": True,
        "contact": outcome.contact,
        "message": outcome.message,
        "file_path": outcome.file_path,
    })
    return 0


def _handle_send_file(args, store):
    service = MessageService(store, sender_factory=WeChatSender)
    try:
        outcome = service.send_file(
            contact=args.contact,
            file_path=args.file_path,
            search_index=args.search_index,
            force=args.force,
            dry_run=args.dry_run,
        )
    except ServiceError as exc:
        print(f"错误: {exc.message}", file=sys.stderr)
        return exc.exit_code
    _json_output({
        "success": True,
        "contact": outcome.contact,
        "message": outcome.message,
        "file_path": outcome.file_path,
    })
    return 0


def _handle_history(args, store):
    records = store.get_history(limit=args.limit, contact=args.contact)
    result = []
    for record in records:
        result.append({
            "id": record.id,
            "contact": record.contact,
            "payload_type": record.payload_type,
            "content": record.content,
            "status": record.status,
            "error_summary": record.error_summary,
            "created_at": record.created_at,
        })
    _json_output(result)
    return 0


def _handle_status(args, store):
    limiter = RateLimiter(store)
    status = limiter.get_status()
    if args.as_json:
        _json_output(status)
    else:
        print(f"本小时已发/上限: {status['hour_sent']}/{status['hour_limit']}")
        print(f"静默时段: {'是' if status['quiet'] else '否'}")
        print(f"上次发送: {status['last_send'] or '无'}")
        print(f"最近失败: {status['last_fail'] or '无'}")
    return 0


def _handle_contact(args, store):
    if args.show_list:
        contacts = store.list_contacts()
        if args.as_json:
            _json_output(contacts)
            return 0
        if not contacts:
            print("暂无联系人")
            return 0
        print(f"{'联系人':<15}  {'位次':<4}  更新时间")
        print("-" * 45)
        for c in contacts:
            print(f"{c['contact']:<15}  {c['search_index']:<4}  {c['updated_at']}")
        return 0
    if args.set:
        if args.search_index is None:
            return _error("使用 --set 时必须同时指定 --search-index")
        try:
            store.set_search_index(args.set, args.search_index)
        except ValueError as exc:
            return _error(str(exc))
        print(f"已设置联系人 {args.set} 搜索结果位次: {args.search_index}")
        return 0
    return _error("请指定 --list 或 --set 联系人 --search-index N")


def run_command(argv, store=None):
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command is None:
        parser.print_help(sys.stderr)
        return 2

    if store is None:
        default_db = _get_default_db_path()
        db_path = getattr(args, "db", None) or default_db
        store = Store(db_path)

    handlers = {
        "config": _handle_config,
        "send-text": _handle_send_text,
        "send-file": _handle_send_file,
        "history": _handle_history,
        "status": _handle_status,
        "contact": _handle_contact,
    }
    handler = handlers.get(args.command)
    if handler is None:
        parser.print_help(sys.stderr)
        return 2
    return handler(args, store)


def main():
    sys.exit(run_command(sys.argv[1:]))

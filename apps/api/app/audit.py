"""审计日志助手：写库失败只记 log，不影响主业务。"""
import logging

from sqlalchemy import func, select

from .db import SessionLocal
from .models import AuditLog

log = logging.getLogger("it-ops.audit")


def write_audit(username: str, action: str, *, target_type: str | None = None,
                target_id: str | None = None, detail: dict | None = None,
                ip: str | None = None) -> None:
    """独立 session 写一条审计；异常吞掉只打日志（审计不应阻断业务）。"""
    try:
        db = SessionLocal()
        try:
            db.add(AuditLog(username=username, action=action, target_type=target_type,
                            target_id=target_id, detail=detail or {}, ip=ip))
            db.commit()
        finally:
            db.close()
    except Exception:
        log.exception("audit write failed: %s %s", username, action)


def list_audit(*, username: str | None = None, action: str | None = None,
               target_type: str | None = None, target_id: str | None = None,
               page: int = 1, page_size: int = 20) -> tuple[list[AuditLog], int]:
    """分页查询，倒序。返回 (rows, total)。"""
    db = SessionLocal()
    try:
        cond = []
        if username:
            cond.append(AuditLog.username == username)
        if action:
            cond.append(AuditLog.action == action)
        if target_type:
            cond.append(AuditLog.target_type == target_type)
        if target_id:
            cond.append(AuditLog.target_id == target_id)
        base = select(AuditLog).where(*cond) if cond else select(AuditLog)
        total = db.scalar(select(func.count()).select_from(base.subquery()))
        rows = db.execute(
            base.order_by(AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)
        ).scalars().all()
        return list(rows), int(total or 0)
    finally:
        db.close()

"""SQLAlchemy ORM 模型（与 docs/02-data-model.md 一致）。"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, DateTime, Double, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def _utcnow() -> datetime:
    """ORM 侧时间默认值（aware UTC）。

    不能只依赖 DB server_default：alembic 迁移里 server_default='now()'
    是字符串字面量，会被 DDL 固化为「建表时刻的常量时间戳」。
    """
    return datetime.now(timezone.utc)


class Topology(Base):
    __tablename__ = "topology"
    # 部分唯一索引（仅 is_active=TRUE 唯一）在 Alembic 迁移中单独创建
    __table_args__ = (CheckConstraint("jsonb_typeof(canvas) = 'object'", name="ck_topology_canvas"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, default="默认拓扑")
    canvas: Mapped[dict] = mapped_column(JSONB)
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)


class TopologyNodeDevice(Base):
    __tablename__ = "topology_node_device"
    __table_args__ = (UniqueConstraint("topology_id", "node_id", name="pk_tnd"),)

    topology_id: Mapped[int] = mapped_column(ForeignKey("topology.id", ondelete="CASCADE"), primary_key=True)
    node_id: Mapped[str] = mapped_column(Text, primary_key=True)
    device_id: Mapped[str | None] = mapped_column(ForeignKey("device.id", ondelete="SET NULL"))


class Device(Base):
    __tablename__ = "device"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(Text)
    ip: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="normal")
    location: Mapped[str | None] = mapped_column(Text)
    owner: Mapped[str | None] = mapped_column(Text)
    extra: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)


class DeviceMetric(Base):
    __tablename__ = "device_metric"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[str] = mapped_column(ForeignKey("device.id", ondelete="CASCADE"))
    metric: Mapped[str] = mapped_column(Text)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    value: Mapped[float] = mapped_column(Double)


class Alert(Base):
    __tablename__ = "alert"

    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[str | None] = mapped_column(ForeignKey("device.id", ondelete="CASCADE"))
    level: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    detail: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    acked: Mapped[bool] = mapped_column(Boolean, default=False)


class BizSystem(Base):
    __tablename__ = "biz_system"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    owner: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="normal")
    sla_target: Mapped[float | None] = mapped_column(Numeric(5, 2))
    sla_actual: Mapped[float | None] = mapped_column(Numeric(5, 2))
    extra: Mapped[dict] = mapped_column(JSONB, default=dict)

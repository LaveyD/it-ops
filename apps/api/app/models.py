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
    status: Mapped[str] = mapped_column(Text, default="normal")  # normal | warn | alert
    location: Mapped[str | None] = mapped_column(Text)  # 文本冗余（展示用）
    location_id: Mapped[int | None] = mapped_column(ForeignKey("location.id", ondelete="SET NULL"))
    cabinet_id: Mapped[int | None] = mapped_column(ForeignKey("cabinet.id", ondelete="SET NULL"))
    u_start: Mapped[int | None] = mapped_column(Integer)  # U 位起（三维机房用，可空）
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
    # 事件来源：device=设备告警（默认）| security=安防事件（未关门/闯入/尾随，device_id 可为空）
    source: Mapped[str] = mapped_column(Text, default="device")
    # 事件类别（安防：door 门 / badge 刷卡 / intrude 闯入；设备告警可空）
    category: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    acked: Mapped[bool] = mapped_column(Boolean, default=False)


class DevicePool(Base):
    """终端设备资产池（手机/PC/笔记本等），与 IT 设备表（device）分开建模。
    余量 = total - used，不落库。mock 采集器每轮小幅漂移 used。"""

    __tablename__ = "device_pool"

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(Text, unique=True)
    total: Mapped[int] = mapped_column(Integer, default=0)
    used: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)


class RoomMetric(Base):
    """机房环境/动环指标（温度/湿度/UPS 负载）。

    接入契约：POST /api/room-monitor/report 是真实源（EMQ/动环网关/Zabbix）的
    写入入口，查询端与前端不感知数据来源；当前由 mock 采集器产出。
    source 字段标记来源（mock / 真实源名称），便于真源接入后区分。"""

    __tablename__ = "room_metric"

    id: Mapped[int] = mapped_column(primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("room.id", ondelete="CASCADE"), index=True)
    metric: Mapped[str] = mapped_column(Text, index=True)  # temperature | humidity | ups_load
    value: Mapped[float] = mapped_column(Double)
    source: Mapped[str] = mapped_column(Text, default="mock")
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class BizSystem(Base):
    __tablename__ = "biz_system"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    owner: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="normal")
    sla_target: Mapped[float | None] = mapped_column(Numeric(5, 2))
    sla_actual: Mapped[float | None] = mapped_column(Numeric(5, 2))
    extra: Mapped[dict] = mapped_column(JSONB, default=dict)


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(Text, unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    display_name: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str] = mapped_column(Text, default="operator")  # admin | operator | viewer
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(Text)
    action: Mapped[str] = mapped_column(Text)
    target_type: Mapped[str | None] = mapped_column(Text)
    target_id: Mapped[str | None] = mapped_column(Text)
    detail: Mapped[dict] = mapped_column(JSONB, default=dict)
    ip: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)


class NotifyConfig(Base):
    """通知配置（单行，id=1）。M10 mock：仅落地保存，推送 M+ 再做。"""

    __tablename__ = "notify_config"

    id: Mapped[int] = mapped_column(primary_key=True)
    webhook_url: Mapped[str | None] = mapped_column(Text)
    email_to: Mapped[str | None] = mapped_column(Text)
    email_from: Mapped[str | None] = mapped_column(Text)
    notify_alert: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_by: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)


class Location(Base):
    __tablename__ = "location"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)
    zone_type: Mapped[str] = mapped_column(Text, default="other")  # headquarters | branch | machine_room | other
    remark: Mapped[str | None] = mapped_column(Text)


class Room(Base):
    """机房（几何参数，三维机房渲染数据源之一）。"""
    __tablename__ = "room"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True)
    location_id: Mapped[int | None] = mapped_column(ForeignKey("location.id", ondelete="SET NULL"))
    rows: Mapped[int] = mapped_column(Integer, default=1)  # 行数
    cols: Mapped[int] = mapped_column(Integer, default=1)  # 每行机柜数
    remark: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)


class Cabinet(Base):
    """机柜（行/列定位 + U 高，三维机房实例化渲染数据源）。"""
    __tablename__ = "cabinet"

    id: Mapped[int] = mapped_column(primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("room.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(Text)
    row: Mapped[int] = mapped_column(Integer, default=1)  # 行号（1 起）
    col: Mapped[int] = mapped_column(Integer, default=1)  # 列号（1 起）
    u_height: Mapped[int] = mapped_column(Integer, default=42)  # U 位高度
    status: Mapped[str] = mapped_column(Text, default="normal")  # normal | warn | alert
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

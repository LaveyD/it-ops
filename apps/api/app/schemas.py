"""Pydantic 请求/响应模型。"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    """ORM 对象可直接 model_validate 的基类。"""
    model_config = ConfigDict(from_attributes=True)


# ===== auth =====
class LoginReq(BaseModel):
    username: str
    password: str


class LoginResp(BaseModel):
    token: str
    expires_in: int  # 秒
    role: str


class MeResp(BaseModel):
    username: str
    role: str


# ===== users / locations / audit =====
class UserOut(ORMModel):
    id: int
    username: str
    display_name: str | None
    role: str
    enabled: bool
    created_at: datetime
    updated_at: datetime


class UserCreateReq(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    display_name: str | None = None
    role: str = Field(default="operator", pattern="^(admin|operator|viewer)$")


class UserUpdateReq(BaseModel):
    display_name: str | None = None
    role: str | None = Field(default=None, pattern="^(admin|operator|viewer)$")
    enabled: bool | None = None


class PasswordResetReq(BaseModel):
    password: str = Field(min_length=6, max_length=128)


class ScreenTokenResp(BaseModel):
    token: str
    expires_in: int  # 秒


class LocationOut(ORMModel):
    id: int
    name: str
    zone_type: str
    remark: str | None


class LocationReq(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    zone_type: str = Field(default="other", pattern="^(headquarters|branch|machine_room|other)$")
    remark: str | None = None


class AuditOut(ORMModel):
    id: int
    username: str
    action: str
    target_type: str | None
    target_id: str | None
    detail: dict
    ip: str | None
    created_at: datetime


class AuditPageResp(BaseModel):
    items: list[AuditOut]
    total: int
    page: int
    page_size: int


# ===== topology =====
class TopologySaveReq(BaseModel):
    name: str | None = None
    canvas: dict = Field(..., description="{nodes[], links[], groups[]}")


class TopologyVersionItem(ORMModel):
    id: int
    name: str
    version: int
    is_active: bool
    updated_at: datetime


# ===== device =====
class ReferencedBy(BaseModel):
    topology_id: int
    topology_name: str
    node_id: str
    node_label: str


class DeviceOut(ORMModel):
    id: str
    name: str
    type: str
    ip: str | None = None
    status: str
    location: str | None = None
    owner: str | None = None
    extra: dict = {}
    referenced_by: list[ReferencedBy] = []


class DeviceDetail(DeviceOut):
    latest_metrics: dict = {}          # {metric: value}
    recent_alerts: list[dict] = []     # 精简告警对象


class MetricSeries(BaseModel):
    metric: str
    points: list[list] = []            # [[ts, value], ...]


# ===== alert =====
class AlertOut(ORMModel):
    id: int
    device_id: str | None
    device_name: str | None = None
    level: str
    title: str
    detail: str | None = None
    created_at: datetime
    acked: bool


class AlertDailyCount(BaseModel):
    """按天告警统计（近 7 天堆叠柱）。"""
    date: str                            # YYYY-MM-DD（UTC）
    info: int = 0
    warn: int = 0
    crit: int = 0


# ===== overview =====
class DeviceTopItem(BaseModel):
    device_id: str
    name: str
    metric: str
    value: float


# ===== biz system =====
class BizSystemOut(ORMModel):
    id: int
    name: str
    owner: str | None = None
    status: str
    sla_target: float | None = None
    sla_actual: float | None = None


# ===== overview =====
class OverviewOut(BaseModel):
    device_count: int
    online_rate: float                  # 0~1
    alert_counts: dict                  # {info, warn, crit}
    unacked_alerts: int
    biz_systems: list[BizSystemOut]
    topology: dict | None = None        # {id, name, version}

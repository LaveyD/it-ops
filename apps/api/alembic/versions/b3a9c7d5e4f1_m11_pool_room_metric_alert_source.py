"""m11: 终端设备资产池 + 机房环境指标 + alert 事件来源扩展

Revision ID: b3a9c7d5e4f1
Revises: 7c8d9e0f1a2b
Create Date: 2026-09-11

- device_pool: 终端资产池（手机/PC/笔记本等），余量 = total - used
- room_metric: 机房动环指标（温度/湿度/UPS 负载），真实源经 POST /api/room-monitor/report 写入
- alert: 增加 source（device|security）与 category（door/badge/intrude），
  安防事件（未关门等）复用 alert 表，device_id 允许为空
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "b3a9c7d5e4f1"
down_revision = "7c8d9e0f1a2b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "device_pool",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("used", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("category", name="uq_device_pool_category"),
    )
    op.create_table(
        "room_metric",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("room_id", sa.Integer(), sa.ForeignKey("room.id", ondelete="CASCADE"), nullable=False),
        sa.Column("metric", sa.Text(), nullable=False),
        sa.Column("value", sa.Double(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False, server_default="mock"),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_room_metric_room_id", "room_metric", ["room_id"])
    op.create_index("ix_room_metric_metric", "room_metric", ["metric"])
    op.create_index("ix_room_metric_room_metric_ts", "room_metric", ["room_id", "metric", sa.text("ts DESC")])
    op.add_column("alert", sa.Column("source", sa.Text(), nullable=False, server_default="device"))
    op.add_column("alert", sa.Column("category", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("alert", "category")
    op.drop_column("alert", "source")
    op.drop_index("ix_room_metric_room_metric_ts", table_name="room_metric")
    op.drop_index("ix_room_metric_metric", table_name="room_metric")
    op.drop_index("ix_room_metric_room_id", table_name="room_metric")
    op.drop_table("room_metric")
    op.drop_table("device_pool")

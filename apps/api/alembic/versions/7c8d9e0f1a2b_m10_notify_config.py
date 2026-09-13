"""m10: notify_config 通知配置表（mock 落地，推送 M+ 再做）

Revision ID: 7c8d9e0f1a2b
Revises: a7b3c9d2e1f4
Create Date: 2026-09-11

单行配置表（id 恒为 1）：webhook_url / email_to / email_from / notify_alert（仅严重告警推送）
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "7c8d9e0f1a2b"
down_revision = "a7b3c9d2e1f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notify_config",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("webhook_url", sa.Text(), nullable=True),
        sa.Column("email_to", sa.Text(), nullable=True),
        sa.Column("email_from", sa.Text(), nullable=True),
        sa.Column("notify_alert", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("updated_by", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("id = 1", name="ck_notify_config_singleton"),
    )
    op.execute(
        "INSERT INTO notify_config (id, notify_alert, updated_at) VALUES (1, true, now())"
    )


def downgrade() -> None:
    op.drop_table("notify_config")

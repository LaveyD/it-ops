"""m7: room/cabinet 表 + device 位置/机柜列 + 存量 location 回填

Revision ID: a7b3c9d2e1f4
Revises: 30d4ded4fd12
Create Date: 2026-09-11

手工编写（不用 autogenerate）：
- room 先建（cabinet.room_id 依赖），device 三列最后加（cabinet_id 依赖 cabinet 表）
- 回填：device.location_id = location.id WHERE location.name = device.location（文本归并）
- 不删除 device.location 文本列（保留为展示冗余，M9 三维机房上线后评估弃用）
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a7b3c9d2e1f4"
down_revision = "30d4ded4fd12"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "room",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("location_id", sa.Integer(), sa.ForeignKey("location.id", ondelete="SET NULL"), nullable=True),
        sa.Column("rows", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("cols", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("name", name="ux_room_name"),
    )
    op.create_table(
        "cabinet",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("room_id", sa.Integer(), sa.ForeignKey("room.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("row", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("col", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("u_height", sa.Integer(), nullable=False, server_default="42"),
        sa.Column("status", sa.Text(), nullable=False, server_default="normal"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_cabinet_room_id", "cabinet", ["room_id"])

    # device 三列
    op.add_column("device", sa.Column("location_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_device_location_id", "device", "location", ["location_id"], ["id"], ondelete="SET NULL")
    op.add_column("device", sa.Column("cabinet_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_device_cabinet_id", "device", "cabinet", ["cabinet_id"], ["id"], ondelete="SET NULL")
    op.add_column("device", sa.Column("u_start", sa.Integer(), nullable=True))

    # 存量回填：按现 location 文本归并到同名 location 记录
    op.execute(
        """
        UPDATE device d
        SET location_id = l.id
        FROM location l
        WHERE l.name = d.location
        """
    )


def downgrade() -> None:
    op.execute("UPDATE device SET location_id = NULL, cabinet_id = NULL, u_start = NULL")
    op.drop_constraint("fk_device_cabinet_id", "device", type_="foreignkey")
    op.drop_column("device", "cabinet_id")
    op.drop_constraint("fk_device_location_id", "device", type_="foreignkey")
    op.drop_column("device", "location_id")
    op.drop_column("device", "u_start")
    op.drop_index("ix_cabinet_room_id", table_name="cabinet")
    op.drop_table("cabinet")
    op.drop_table("room")

"""m6_user_audit_location

新增 user / audit_log / location 三表（RBAC + 审计 + 位置注册表）。
注意：手写索引（ix_alert_newest 等）在 ORM 中未声明，autogenerate 会误判为
removed，故本迁移仅 create 三张新表，不触碰既有索引/约束。

Revision ID: 30d4ded4fd12
Revises: f19f6c77cf65
Create Date: 2026-09-11 15:42:31.452057
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '30d4ded4fd12'
down_revision = 'f19f6c77cf65'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('user',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('username', sa.Text(), nullable=False),
    sa.Column('password_hash', sa.Text(), nullable=False),
    sa.Column('display_name', sa.Text(), nullable=True),
    sa.Column('role', sa.Text(), nullable=False),
    sa.Column('enabled', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('username')
    )
    op.create_table('audit_log',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('username', sa.Text(), nullable=False),
    sa.Column('action', sa.Text(), nullable=False),
    sa.Column('target_type', sa.Text(), nullable=True),
    sa.Column('target_id', sa.Text(), nullable=True),
    sa.Column('detail', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('ip', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_audit_created', 'audit_log', ['created_at'], unique=False)
    op.create_index('ix_audit_username', 'audit_log', ['username'], unique=False)
    op.create_table('location',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('zone_type', sa.Text(), nullable=False),
    sa.Column('remark', sa.Text(), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )


def downgrade() -> None:
    op.drop_table('location')
    op.drop_index('ix_audit_username', table_name='audit_log')
    op.drop_index('ix_audit_created', table_name='audit_log')
    op.drop_table('audit_log')
    op.drop_table('user')

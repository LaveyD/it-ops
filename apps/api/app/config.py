"""应用配置：环境变量集中读取（pydantic-settings）。"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://it_ops:itops2026@127.0.0.1:23432/it_ops"
    jwt_secret: str = "dev-secret"
    jwt_expire_minutes: int = 720
    admin_user: str = "admin"
    admin_password: str = "admin"
    host: str = "0.0.0.0"
    port: int = 8100
    collector: str = "mock"
    operator: str = "none"
    # 通知框架：webhook 发送超时（秒）与失败重试次数（重试 1 次 = 共发 2 次）
    notify_timeout_seconds: float = 5.0
    notify_max_retries: int = 1
    # 数据保留策略：超过保留期的告警/指标定期清理（mock collector 无限累积，
    # 告警 30 天覆盖 /api/alerts/stats 趋势最大窗口 le=30；指标 14 天覆盖趋势
    # 查询最长窗口（默认 1h）并留有余量）
    alert_retention_days: int = 30
    metric_retention_days: int = 14


@lru_cache
def get_settings() -> Settings:
    return Settings()

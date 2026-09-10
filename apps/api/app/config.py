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


@lru_cache
def get_settings() -> Settings:
    return Settings()

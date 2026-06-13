from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache
import os


class Settings(BaseSettings):
    # App
    APP_NAME: str = "StreamSafe"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    SECRET_KEY: str = "super-secret-key-change-in-production-min-32-chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Database
    DATABASE_URL: str = "postgresql://streamsafe:streamsafe@localhost:5432/streamsafe"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # CORS
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173", "*"]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, v):
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            v = v.strip()
            if v == "*":
                return ["*"]
            try:
                import json
                return json.loads(v)
            except Exception:
                return [v]
        return v

    # S3 / Object Storage
    S3_BUCKET_NAME: str = "streamsafe-recordings"
    S3_REGION: str = "us-east-1"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    S3_ENDPOINT_URL: str = ""  # For MinIO: http://localhost:9000

    # WebRTC / STUN/TURN
    STUN_SERVER: str = "stun:stun.l.google.com:19302"
    TURN_SERVER: str = ""
    TURN_USERNAME: str = ""
    TURN_CREDENTIAL: str = ""

    # Rate Limiting
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW: int = 60  # seconds

    # Session
    SESSION_GRACE_PERIOD_SECONDS: int = 10
    SESSION_MAX_PARTICIPANTS: int = 10
    MAX_CHAT_MESSAGES_PER_SESSION: int = 10000
    INVITE_TOKEN_EXPIRE_MINUTES: int = 30

    # Recording
    RECORDING_RETENTION_DAYS: int = 90
    MAX_RECORDING_SIZE_MB: int = 2048

    # ML / ABR
    ML_MODEL_PATH: str = "models/abr_model.pkl"
    ABR_UPDATE_INTERVAL_SECONDS: int = 2
    ABR_HYSTERESIS_UP: float = 1.2
    ABR_HYSTERESIS_DOWN: float = 0.8

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # Prometheus
    METRICS_PORT: int = 8001

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

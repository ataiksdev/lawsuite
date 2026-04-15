from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    database_url: str
    database_url_sync: str

    @property
    def async_database_url(self) -> str:
        """
        Ensures the database URL is using the asyncpg driver.
        Render provides `postgres://` URLs, but SQLAlchemy 2.0+ requires `postgresql+asyncpg://`.
        """
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    @property
    def sync_database_url(self) -> str:
        """
        Ensures the database URL is using the psycopg2 driver for sync operations (like migrations).
        Render provides `postgres://` URLs, but we want `postgresql+psycopg2://`.
        """
        url = self.database_url_sync
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+psycopg2://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
        return url

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    # Encryption (Fernet key for OAuth tokens at rest)
    encryption_key: str

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""  # http://localhost:8000/integrations/google/callback"
    google_signin_redirect_uri: str = ""

    trial_days: int = 30
    # paystack
    paystack_secret_key: str = ""
    paystack_public_key: str = ""
    # paystack_webhook_secret: str = ""
    paystack_free_plan_code: str = ""
    paystack_pro_plan_code: str = ""
    paystack_agency_plan_code: str = ""

    # Email (Resend — https://resend.com)
    resend_api_key: str = ""
    emails_from_address: str = ""
    emails_from_name: str = "LegalOps"

    # App
    app_env: str = "development"
    app_url: str = "http://localhost:8000"
    frontend_url: str = ""
    cors_origins: List[str] = [
        "http://localhost:3000",
        "192.168.18.5",
        "https://sphinxian-shu-untraveled.ngrok-free.dev",
    ]

    # Platform admin — your own org's UUID (the SaaS operator)
    # Set this after you register your own account
    platform_admin_org_id: str = ""

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"


settings = Settings()

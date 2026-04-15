# backend/app/services/email_service.py
from pathlib import Path

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType

from app.core.config import settings

# ---------------------------------------------------------------------------
# Template loader
# ---------------------------------------------------------------------------

_TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "email"


def _load_template(name: str) -> str:
    return (_TEMPLATES_DIR / name).read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Connection config — built lazily so missing env vars don't crash at import
# ---------------------------------------------------------------------------

def _get_mail_config() -> ConnectionConfig:
    return ConnectionConfig(
        MAIL_USERNAME=settings.smtp_user,
        MAIL_PASSWORD=settings.smtp_password,
        MAIL_FROM=settings.emails_from_address or settings.smtp_user,
        MAIL_FROM_NAME=settings.emails_from_name,
        MAIL_PORT=settings.smtp_port,
        MAIL_SERVER=settings.smtp_host,
        MAIL_STARTTLS=False,
        MAIL_SSL_TLS=True,
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True,
    )


# ---------------------------------------------------------------------------
# Invite email
# ---------------------------------------------------------------------------

async def send_invite_email(
    *,
    to: str,
    name: str,
    invited_by: str,
    role: str,
    invite_url: str,
) -> None:
    """
    Send a team invite email via SMTP.
    Silently skips (logs a warning) when SMTP is not configured,
    so dev environments without email still work.
    """
    if not settings.smtp_host or not settings.smtp_user:
        print(f"[EMAIL] SMTP not configured — skipping invite email to {to}")
        print(f"[EMAIL] Invite URL: {invite_url}")
        return

    html = _load_template("invite.html").format(
        name=name or to,
        invited_by=invited_by,
        role=role.capitalize(),
        invite_url=invite_url,
    )

    message = MessageSchema(
        subject="You've been invited to LegalOps",
        recipients=[to],
        body=html,
        subtype=MessageType.html,
    )

    fm = FastMail(_get_mail_config())
    await fm.send_message(message)
    print(f"[EMAIL] Invite sent to {to}")


# ---------------------------------------------------------------------------
# Password reset email
# ---------------------------------------------------------------------------

async def send_password_reset_email(
    *,
    to: str,
    name: str,
    reset_url: str,
) -> None:
    """
    Send a password reset email via SMTP.
    Silently skips (logs a warning) when SMTP is not configured.
    """
    if not settings.smtp_host or not settings.smtp_user:
        print(f"[EMAIL] SMTP not configured — skipping password reset email to {to}")
        print(f"[EMAIL] Reset URL: {reset_url}")
        return

    html = _load_template("password_reset.html").format(
        name=name or to,
        reset_url=reset_url,
    )

    message = MessageSchema(
        subject="Reset your LegalOps password",
        recipients=[to],
        body=html,
        subtype=MessageType.html,
    )

    fm = FastMail(_get_mail_config())
    await fm.send_message(message)
    print(f"[EMAIL] Password reset sent to {to}")

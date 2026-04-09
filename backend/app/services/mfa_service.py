# backend/app/services/mfa_service.py
"""
TOTP-based MFA service.

Flow for enabling MFA:
  1. POST /auth/mfa/setup          → returns otpauth URI + QR code data URL
  2. User scans QR in authenticator app
  3. POST /auth/mfa/verify  {code} → verifies first code, activates MFA + issues backup codes
  4. User saves backup codes

Flow at login when MFA is enabled:
  1. POST /auth/login               → returns {mfa_required: true, mfa_token: <short-lived JWT>}
  2. POST /auth/mfa/validate {mfa_token, code} → returns full access + refresh tokens

TOTP spec: RFC 6238 — 30-second window, 6-digit codes, SHA1 (pyotp default).
Backup codes: 8 codes, each 8 characters, stored as bcrypt hashes.
"""

import io
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import pyotp
import qrcode
import qrcode.image.svg
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    decode_token,
    decrypt,
    encrypt,
    hash_password,
    verify_password,
)
from app.models.user import User

BACKUP_CODE_COUNT = 8
BACKUP_CODE_LENGTH = 8
# Allow 1 step before/after (90-second window total) to handle clock skew
TOTP_WINDOW = 1


class MFAService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_user(self, user_id: uuid.UUID) -> User:
        result = await self.db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    # ── Setup ─────────────────────────────────────────────────────────────

    async def setup(self, user_id: uuid.UUID) -> dict:
        """
        Generate a new TOTP secret and return the otpauth URI + QR code.
        The secret is saved (encrypted) but MFA is NOT yet enabled —
        the user must verify a code first via /auth/mfa/verify.

        Returns:
          {
            "otpauth_uri": "otpauth://totp/...",
            "qr_code_svg":  "<svg>...</svg>",   # embed directly in frontend
            "secret":       "BASE32SECRET",      # manual entry fallback
          }
        """
        user = await self._get_user(user_id)

        if user.mfa_enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MFA is already enabled. Disable it first to re-setup.",
            )

        # Generate a fresh TOTP secret
        secret = pyotp.random_base32()

        # Build the otpauth URI (compatible with Google Authenticator, Authy, etc.)
        totp = pyotp.TOTP(secret)
        issuer = "LegalOps"
        uri = totp.provisioning_uri(name=user.email, issuer_name=issuer)

        # Generate SVG QR code (no external image service — rendered inline)
        qr = qrcode.make(uri, image_factory=qrcode.image.svg.SvgImage)
        svg_buffer = io.BytesIO()
        qr.save(svg_buffer)
        svg_string = svg_buffer.getvalue().decode("utf-8")

        # Store the secret encrypted — MFA stays disabled until verified
        user.mfa_secret = encrypt(secret)
        await self.db.commit()

        return {
            "otpauth_uri": uri,
            "qr_code_svg": svg_string,
            "secret": secret,  # shown once for manual entry
        }

    # ── Verify (activate) ─────────────────────────────────────────────────

    async def verify_and_enable(self, user_id: uuid.UUID, code: str) -> dict:
        """
        Verify the user's first TOTP code and activate MFA.
        Returns 8 one-time backup codes to be shown once and saved.
        """
        user = await self._get_user(user_id)

        if user.mfa_enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MFA is already active.",
            )
        if not user.mfa_secret:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MFA setup not initiated. Call /auth/mfa/setup first.",
            )

        secret = decrypt(user.mfa_secret)
        totp = pyotp.TOTP(secret)

        if not totp.verify(code, valid_window=TOTP_WINDOW):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid verification code. Check your authenticator app.",
            )

        # Generate backup codes (plaintext returned once, hashes stored)
        plain_codes = [secrets.token_hex(BACKUP_CODE_LENGTH // 2).upper() for _ in range(BACKUP_CODE_COUNT)]
        hashed_codes = [hash_password(c) for c in plain_codes]

        user.mfa_enabled = True
        user.mfa_backup_codes = hashed_codes
        await self.db.commit()

        return {
            "message": "MFA enabled successfully.",
            "backup_codes": plain_codes,
            "warning": "Save these backup codes. They will not be shown again.",
        }

    # ── Validate at login ─────────────────────────────────────────────────

    async def validate_login_code(
        self,
        user_id: uuid.UUID,
        code: str,
    ) -> bool:
        """
        Validate a TOTP code or backup code during the login MFA step.
        Returns True on success, raises 401 on failure.
        """
        user = await self._get_user(user_id)

        if not user.mfa_enabled or not user.mfa_secret:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MFA is not enabled for this account.",
            )

        secret = decrypt(user.mfa_secret)
        totp = pyotp.TOTP(secret)

        # Try TOTP code first
        if totp.verify(code.strip(), valid_window=TOTP_WINDOW):
            return True

        # Try backup codes (each is single-use)
        if user.mfa_backup_codes:
            for i, hashed in enumerate(user.mfa_backup_codes):
                if verify_password(code.strip().upper(), hashed):
                    # Consume the backup code — remove from list
                    remaining = list(user.mfa_backup_codes)
                    remaining.pop(i)
                    user.mfa_backup_codes = remaining
                    await self.db.commit()
                    return True

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid MFA code.",
        )

    # ── Disable ───────────────────────────────────────────────────────────

    async def disable(self, user_id: uuid.UUID, code: str) -> None:
        """
        Disable MFA. Requires a valid TOTP code or backup code to confirm.
        """
        await self.validate_login_code(user_id, code)

        user = await self._get_user(user_id)
        user.mfa_enabled = False
        user.mfa_secret = None
        user.mfa_backup_codes = None
        await self.db.commit()

    # ── Regenerate backup codes ───────────────────────────────────────────

    async def regenerate_backup_codes(self, user_id: uuid.UUID, code: str) -> list[str]:
        """
        Regenerate backup codes. Requires current TOTP to confirm.
        """
        await self.validate_login_code(user_id, code)

        user = await self._get_user(user_id)
        plain_codes = [secrets.token_hex(BACKUP_CODE_LENGTH // 2).upper() for _ in range(BACKUP_CODE_COUNT)]
        user.mfa_backup_codes = [hash_password(c) for c in plain_codes]
        await self.db.commit()

        return plain_codes

    # ── MFA token helpers (used in auth service) ──────────────────────────

    @staticmethod
    def create_mfa_pending_token(user_id: uuid.UUID, org_id: uuid.UUID, role: str) -> str:
        """
        Short-lived token issued after successful password login when MFA
        is required. Valid for 5 minutes. Used in POST /auth/mfa/validate.
        """
        from jose import jwt

        expire = datetime.now(timezone.utc) + timedelta(minutes=5)
        payload = {
            "sub": str(user_id),
            "org_id": str(org_id),
            "role": role,
            "type": "mfa_pending",
            "exp": expire,
        }
        return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    @staticmethod
    def decode_mfa_pending_token(token: str) -> dict:
        payload = decode_token(token)
        if payload.get("type") != "mfa_pending":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid MFA token.",
            )
        return payload

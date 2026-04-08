# backend/app/schemas/auth.py
from pydantic import BaseModel, EmailStr, Field, field_validator
import uuid
from datetime import datetime


# ─── Register ────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    org_name: str = Field(..., min_length=2, max_length=255)
    full_name: str = Field(..., min_length=2, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=100)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v

    @field_validator("org_name")
    @classmethod
    def strip_org_name(cls, v: str) -> str:
        return v.strip()


# ─── Login ───────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


# ─── Refresh ─────────────────────────────────────────────────────────────────

class RefreshRequest(BaseModel):
    refresh_token: str


# ─── Invite ──────────────────────────────────────────────────────────────────

class InviteRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=255)
    role: str = Field(default="member", pattern="^(admin|member|viewer)$")


class AcceptInviteRequest(BaseModel):
    token: str
    password: str = Field(..., min_length=8, max_length=100)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


# ─── Member management ────────────────────────────────────────────────────────

class UpdateMemberRoleRequest(BaseModel):
    role: str = Field(..., pattern="^(admin|member|viewer)$")


class UpdateProfileRequest(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=255)
    email: EmailStr | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=100)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


# ─── Organisation management ─────────────────────────────────────────────────

class UpdateOrgRequest(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=255)


# ─── Responses ───────────────────────────────────────────────────────────────

class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    is_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    is_verified: bool
    joined_at: datetime
    has_pending_invite: bool = False

    model_config = {"from_attributes": True}


class OrgResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    plan: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RegisterResponse(BaseModel):
    user: UserResponse
    organisation: OrgResponse
    tokens: TokenResponse
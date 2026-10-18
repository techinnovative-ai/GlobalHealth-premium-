from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

TargetKind = Literal["website", "model_api", "sandbox"]


class RegisterIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=10, max_length=200)


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=200)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    name: str
    role: str
    is_active: bool
    created_at: datetime


class UserUpdate(BaseModel):
    role: Literal["admin", "analyst", "viewer"] | None = None
    is_active: bool | None = None


class TargetIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    kind: TargetKind
    endpoint: str = Field(min_length=3, max_length=500)
    adapter: Literal["generic", "openai"] | None = None
    description: str = Field(default="", max_length=2000)
    credential_header: str | None = Field(default=None, max_length=80)
    credential_value: str | None = Field(default=None, max_length=2000)
    authorization_attested: bool = False

    @field_validator("authorization_attested")
    @classmethod
    def must_attest(cls, v: bool) -> bool:
        if not v:
            raise ValueError("you must confirm you are authorized to test this target")
        return v


class TargetOut(BaseModel):
    id: int
    name: str
    kind: str
    endpoint: str
    adapter: str | None
    description: str
    has_credential: bool
    credential_header: str | None
    is_demo: bool
    authorization_attested_by: str
    authorized_at: datetime
    created_at: datetime


class EvaluationIn(BaseModel):
    target_id: int
    test_keys: list[str] | None = None


class CheckpointOut(BaseModel):
    id: int
    position: int
    test_key: str
    route: str
    category: str
    title: str
    severity: str
    status: str
    detail: str
    remediation: str
    evidence: dict[str, Any] | None
    started_at: datetime | None
    finished_at: datetime | None


class EvaluationOut(BaseModel):
    id: int
    target_id: int
    target_name: str
    target_kind: str
    status: str
    created_by: str
    test_keys: list[str]
    summary: dict[str, Any] | None
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    results: list[CheckpointOut] = []

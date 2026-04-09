# backend/app/schemas/report.py
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel

# ─── Request ─────────────────────────────────────────────────────────────────


class ReportGenerateRequest(BaseModel):
    period_type: Literal["weekly", "monthly", "custom"] = "monthly"
    date_from: date | None = None  # required when period_type="custom"
    date_to: date | None = None  # required when period_type="custom"
    group_by_client: bool = True
    include_event_types: list[str] = []  # empty = all event types
    export_to_drive: bool = True
    send_email: bool = False
    recipient_email: str | None = None


# ─── Internal aggregation shapes ─────────────────────────────────────────────


class TaskSummary(BaseModel):
    total: int
    completed: int
    overdue: int


class DocumentSummary(BaseModel):
    added: int
    versioned: int
    signed: int


class MatterActivity(BaseModel):
    matter_id: uuid.UUID
    matter_title: str
    reference_no: str
    status: str
    event_count: int
    events_by_type: dict[str, int]
    tasks: TaskSummary
    documents: DocumentSummary


class ClientActivity(BaseModel):
    client_id: uuid.UUID
    client_name: str
    matter_count: int
    matters: list[MatterActivity]


class ReportData(BaseModel):
    org_id: uuid.UUID
    org_name: str
    period_label: str
    date_from: date
    date_to: date
    generated_at: datetime
    total_events: int
    matters_active: int
    matters_opened: int
    matters_closed: int
    clients: list[ClientActivity]


# ─── Stored report responses ─────────────────────────────────────────────────


class ReportResponse(BaseModel):
    id: uuid.UUID
    organisation_id: uuid.UUID
    title: str
    period_label: str
    date_from: date
    date_to: date
    drive_file_id: str | None
    drive_url: str | None
    generated_at: datetime
    created_by: uuid.UUID | None

    model_config = {"from_attributes": True}

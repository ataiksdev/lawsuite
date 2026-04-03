# backend/app/schemas/task.py
import uuid
from datetime import datetime, date
from pydantic import BaseModel, Field
from app.models.task import TaskStatus, TaskPriority


# ─── Requests ────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=255)
    notes: str | None = None
    priority: TaskPriority = TaskPriority.medium
    assigned_to: uuid.UUID | None = None
    due_date: date | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=255)
    notes: str | None = None
    priority: TaskPriority | None = None
    assigned_to: uuid.UUID | None = None
    due_date: date | None = None
    status: TaskStatus | None = None


# ─── Responses ───────────────────────────────────────────────────────────────

class TaskResponse(BaseModel):
    id: uuid.UUID
    matter_id: uuid.UUID
    organisation_id: uuid.UUID
    assigned_to: uuid.UUID | None
    created_by: uuid.UUID | None
    title: str
    notes: str | None
    status: TaskStatus
    priority: TaskPriority
    due_date: date | None
    is_deleted: bool
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaskListResponse(BaseModel):
    items: list[TaskResponse]
    total: int
    page: int
    page_size: int
    pages: int


class OverdueTaskResponse(BaseModel):
    """Task with its parent matter reference for the overdue dashboard."""
    id: uuid.UUID
    matter_id: uuid.UUID
    matter_title: str
    matter_reference_no: str
    title: str
    priority: TaskPriority
    due_date: date
    assigned_to: uuid.UUID | None

    model_config = {"from_attributes": True}

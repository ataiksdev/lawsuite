# backend/app/api/tasks.py
import math
import uuid

from fastapi import APIRouter, Query, status

from app.core.deps import DB, AuthUser
from app.models.task import TaskStatus
from app.schemas.task import (
    OverdueTaskResponse,
    TaskCreate,
    TaskListResponse,
    TaskResponse,
    TaskUpdate,
)
from app.services.task_service import TaskService

router = APIRouter()


# ─── Nested under /matters/{matter_id}/tasks ─────────────────────────────────


@router.get("/{matter_id}/tasks", response_model=TaskListResponse)
async def list_tasks(
    matter_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
    status: TaskStatus | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    """List all tasks for a matter, ordered by due date then creation time."""
    service = TaskService(db)
    tasks, total = await service.list_tasks(
        matter_id=matter_id,
        org_id=current_user.org_id,
        status_filter=status,
        page=page,
        page_size=page_size,
    )
    return TaskListResponse(
        items=[TaskResponse.model_validate(t) for t in tasks],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("/{matter_id}/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    matter_id: uuid.UUID,
    payload: TaskCreate,
    current_user: AuthUser,
    db: DB,
):
    """Create a task on a matter. Logs a task_created activity entry."""
    service = TaskService(db)
    task = await service.create_task(
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        data=payload,
    )
    return TaskResponse.model_validate(task)


@router.patch("/{matter_id}/tasks/{task_id}", response_model=TaskResponse)
async def update_task(
    matter_id: uuid.UUID,
    task_id: uuid.UUID,
    payload: TaskUpdate,
    current_user: AuthUser,
    db: DB,
):
    """
    Update a task. Marking status as 'done' sets completed_at automatically
    and logs a task_completed activity entry on the parent matter.
    """
    service = TaskService(db)
    task = await service.update_task(
        task_id=task_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
        data=payload,
    )
    return TaskResponse.model_validate(task)


@router.delete("/{matter_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    matter_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
):
    """
    Soft-delete a task. The task is hidden from listings but preserved
    in the database for audit purposes.
    """
    service = TaskService(db)
    await service.delete_task(
        task_id=task_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
    )


# ─── Standalone overdue endpoint ─────────────────────────────────────────────


@router.get("/overdue", response_model=dict)
async def get_overdue_tasks(
    current_user: AuthUser,
    db: DB,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    """
    All incomplete tasks past their due date across the entire organisation.
    Includes parent matter title and reference for dashboard display.
    """
    service = TaskService(db)
    tasks, total = await service.get_overdue(
        org_id=current_user.org_id,
        page=page,
        page_size=page_size,
    )
    return {
        "items": [OverdueTaskResponse.model_validate(t) for t in tasks],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total else 0,
    }

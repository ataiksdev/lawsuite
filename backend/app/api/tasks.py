# backend/app/api/tasks.py
import math
import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, AuthUser
from app.models.task import TaskStatus
from app.models.task_comment import TaskComment
from app.models.matter_document import MatterDocument
from app.models.task_document_link import TaskDocumentLink
from app.schemas.document import DocumentResponse
from app.schemas.task import (
    OverdueTaskResponse,
    TaskCommentCreate,
    TaskCommentResponse,
    TaskCreate,
    TaskDocumentLinkAdd,
    TaskListResponse,
    TaskResponse,
    TaskUpdate,
    TaskWatcherAdd,
    TaskWatcherResponse,
)
from app.services.task_service import TaskService

router = APIRouter()


# ─── Tasks (nested under /matters/{matter_id}/tasks) ─────────────────────────


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


@router.post(
    "/{matter_id}/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
)
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


@router.delete(
    "/{matter_id}/tasks/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_task(
    matter_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
):
    """Soft-delete a task."""
    service = TaskService(db)
    await service.delete_task(
        task_id=task_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
        user_id=current_user.user_id,
    )


# ─── Overdue (standalone, mounted at /tasks/overdue) ─────────────────────────


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


# ─── Comments ─────────────────────────────────────────────────────────────────


@router.get(
    "/{matter_id}/tasks/{task_id}/comments",
    response_model=list[TaskCommentResponse],
)
async def list_comments(
    matter_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
):
    """List all comments on a task, oldest first."""
    service = TaskService(db)
    comments = await service.list_comments(
        task_id=task_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
    )
    return [TaskCommentResponse.model_validate(c) for c in comments]


@router.post(
    "/{matter_id}/tasks/{task_id}/comments",
    response_model=TaskCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_comment(
    matter_id: uuid.UUID,
    task_id: uuid.UUID,
    payload: TaskCommentCreate,
    current_user: AuthUser,
    db: DB,
):
    """Add a comment to a task. Logs a task_commented activity entry."""
    service = TaskService(db)
    comment = await service.add_comment(
        task_id=task_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
        author_id=current_user.user_id,
        data=payload,
    )
    return TaskCommentResponse.model_validate(comment)


@router.delete(
    "/{matter_id}/tasks/{task_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_comment(
    matter_id: uuid.UUID,
    task_id: uuid.UUID,
    comment_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
):
    """
    Delete a comment. Authors can delete their own; admins can delete any.
    """
    service = TaskService(db)

    if current_user.is_admin:
        # Admins bypass ownership check — fetch and delete directly
        result = await db.execute(
            select(TaskComment).where(
                TaskComment.id == comment_id,
                TaskComment.task_id == task_id,
                TaskComment.organisation_id == current_user.org_id,
            )
        )
        comment = result.scalar_one_or_none()
        if not comment:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Comment not found",
            )
        await db.delete(comment)
        await db.commit()
    else:
        await service.delete_comment(
            comment_id=comment_id,
            task_id=task_id,
            org_id=current_user.org_id,
            requesting_user_id=current_user.user_id,
        )


# ─── Watchers ─────────────────────────────────────────────────────────────────


@router.get(
    "/{matter_id}/tasks/{task_id}/watchers",
    response_model=list[TaskWatcherResponse],
)
async def list_watchers(
    matter_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
):
    """List all watchers for a task."""
    service = TaskService(db)
    watchers = await service.list_watchers(
        task_id=task_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
    )
    return [TaskWatcherResponse.model_validate(w) for w in watchers]


@router.post(
    "/{matter_id}/tasks/{task_id}/watchers",
    response_model=TaskWatcherResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_watcher(
    matter_id: uuid.UUID,
    task_id: uuid.UUID,
    payload: TaskWatcherAdd,
    current_user: AuthUser,
    db: DB,
):
    """
    Add a user as a watcher on this task.
    Any member can add themselves; admins can add any org member.
    Idempotent — re-watching returns the existing entry without error.
    """
    service = TaskService(db)
    watcher = await service.add_watcher(
        task_id=task_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
        target_user_id=payload.user_id,
        requesting_user_id=current_user.user_id,
    )
    return TaskWatcherResponse.model_validate(watcher)


@router.delete(
    "/{matter_id}/tasks/{task_id}/watchers/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_watcher(
    matter_id: uuid.UUID,
    task_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
):
    """
    Remove a watcher. Users can remove themselves; admins can remove anyone.
    """
    service = TaskService(db)
    await service.remove_watcher(
        task_id=task_id,
        matter_id=matter_id,
        org_id=current_user.org_id,
        target_user_id=user_id,
        requesting_user_id=current_user.user_id,
    )


# ─── Document Links ───────────────────────────────────────────────────────────


@router.get(
    "/{matter_id}/tasks/{task_id}/document-links",
    response_model=list[DocumentResponse],
)
async def list_document_links(
    matter_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
):
    """List all documents linked to a task."""
    result = await db.execute(
        select(MatterDocument)
        .options(selectinload(MatterDocument.versions))
        .join(TaskDocumentLink, TaskDocumentLink.document_id == MatterDocument.id)
        .where(
            TaskDocumentLink.task_id == task_id,
            TaskDocumentLink.organisation_id == current_user.org_id,
            MatterDocument.is_deleted.is_(False),
        )
        .order_by(TaskDocumentLink.linked_at.desc())
    )
    docs = result.scalars().all()
    return [DocumentResponse.model_validate(d) for d in docs]


@router.post(
    "/{matter_id}/tasks/{task_id}/document-links",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_document_link(
    matter_id: uuid.UUID,
    task_id: uuid.UUID,
    payload: TaskDocumentLinkAdd,
    current_user: AuthUser,
    db: DB,
):
    """Link an existing matter document to a task."""
    # Verify the document belongs to this matter and org (eager-load versions for response)
    doc_result = await db.execute(
        select(MatterDocument)
        .options(selectinload(MatterDocument.versions))
        .where(
            MatterDocument.id == payload.document_id,
            MatterDocument.matter_id == matter_id,
            MatterDocument.organisation_id == current_user.org_id,
            MatterDocument.is_deleted.is_(False),
        )
    )
    doc = doc_result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Idempotent — ignore if already linked
    existing = await db.execute(
        select(TaskDocumentLink).where(
            TaskDocumentLink.task_id == task_id,
            TaskDocumentLink.document_id == payload.document_id,
        )
    )
    if not existing.scalar_one_or_none():
        link = TaskDocumentLink(
            task_id=task_id,
            document_id=payload.document_id,
            organisation_id=current_user.org_id,
            linked_by=current_user.user_id,
        )
        db.add(link)
        await db.commit()

    return DocumentResponse.model_validate(doc)


@router.delete(
    "/{matter_id}/tasks/{task_id}/document-links/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_document_link(
    matter_id: uuid.UUID,
    task_id: uuid.UUID,
    document_id: uuid.UUID,
    current_user: AuthUser,
    db: DB,
):
    """Unlink a document from a task."""
    result = await db.execute(
        select(TaskDocumentLink).where(
            TaskDocumentLink.task_id == task_id,
            TaskDocumentLink.document_id == document_id,
            TaskDocumentLink.organisation_id == current_user.org_id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    await db.delete(link)
    await db.commit()

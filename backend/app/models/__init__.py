# backend/app/models/__init__.py
# Import all models here so that:
# 1. Alembic autogenerate can detect them via Base.metadata
# 2. SQLAlchemy relationship resolution works across model files

from app.models.activity_log import ActivityLog
from app.models.calendar_event import CalendarEvent, CalendarEventType, CalendarSyncStatus
from app.models.client import Client
from app.models.matter import Matter, MatterStatus, MatterType
from app.models.matter_document import (
    DocumentStatus,
    DocumentType,
    MatterDocument,
    MatterDocumentVersion,
    MatterEmail,
)
from app.models.matter_note import MatterNote, MatterNoteType
from app.models.notification import Notification
from app.models.organisation import Organisation
from app.models.report import Report
from app.models.task import Task, TaskPriority, TaskStatus
from app.models.task_comment import TaskComment
from app.models.task_watcher import TaskWatcher
from app.models.user import OrganisationMember, User

__all__ = [
    "Organisation",
    "User",
    "OrganisationMember",
    "Client",
    "Matter",
    "MatterStatus",
    "MatterType",
    "CalendarEvent",
    "CalendarEventType",
    "CalendarSyncStatus",
    "MatterNote",
    "MatterNoteType",
    "Task",
    "TaskStatus",
    "TaskPriority",
    "MatterDocument",
    "MatterDocumentVersion",
    "MatterEmail",
    "DocumentType",
    "DocumentStatus",
    "ActivityLog",
    "Report",
    "TaskComment",
    "TaskWatcher",
    "Notification",
]

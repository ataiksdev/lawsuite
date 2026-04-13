# backend/app/models/__init__.py
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
# Note: matter_note module kept for Alembic compatibility but the canonical
# model is now app.models.note.Note (same table: matter_notes)
from app.models.note import Note, NoteType
# Legacy aliases so any existing code using MatterNote / MatterNoteType keeps working
from app.models.note import Note as MatterNote, NoteType as MatterNoteType
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
    "Note",
    "NoteType",
    # Legacy aliases
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

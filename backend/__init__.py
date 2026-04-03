# Import all models here so that:
# 1. Alembic autogenerate can detect them via Base.metadata
# 2. SQLAlchemy relationship resolution works across model files

from app.models.organisation import Organisation
from app.models.user import User, OrganisationMember
from app.models.client import Client
from app.models.matter import Matter, MatterStatus, MatterType
from app.models.task import Task, TaskStatus, TaskPriority
from app.models.matter_document import (
    MatterDocument,
    MatterDocumentVersion,
    MatterEmail,
    DocumentType,
    DocumentStatus,
)
from app.models.activity_log import ActivityLog

__all__ = [
    "Organisation",
    "User",
    "OrganisationMember",
    "Client",
    "Matter",
    "MatterStatus",
    "MatterType",
    "Task",
    "TaskStatus",
    "TaskPriority",
    "MatterDocument",
    "MatterDocumentVersion",
    "MatterEmail",
    "DocumentType",
    "DocumentStatus",
    "ActivityLog",
]

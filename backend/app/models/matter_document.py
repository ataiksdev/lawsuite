import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Text, Enum as SAEnum, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
import enum
from app.core.database import Base


class DocumentType(str, enum.Enum):
    engagement_letter = "engagement_letter"
    memo = "memo"
    contract = "contract"
    filing = "filing"
    correspondence = "correspondence"
    report = "report"
    other = "other"


class DocumentStatus(str, enum.Enum):
    draft = "draft"
    pending_signature = "pending_signature"
    signed = "signed"
    superseded = "superseded"


class MatterDocument(Base):
    __tablename__ = "matter_documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matters.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    added_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    doc_type: Mapped[DocumentType] = mapped_column(
        SAEnum(DocumentType), default=DocumentType.other, nullable=False
    )
    status: Mapped[DocumentStatus] = mapped_column(
        SAEnum(DocumentStatus), default=DocumentStatus.draft, nullable=False
    )
    current_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Current Drive file (denormalised from latest version for fast lookup)
    drive_file_id: Mapped[str | None] = mapped_column(String(255), index=True)
    drive_url: Mapped[str | None] = mapped_column(Text)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow,
        onupdate=datetime.utcnow, nullable=False
    )

    # Relationships
    matter: Mapped["Matter"] = relationship(back_populates="documents")
    versions: Mapped[list["MatterDocumentVersion"]] = relationship(
        back_populates="document", cascade="all, delete-orphan",
        order_by="MatterDocumentVersion.version_number"
    )

    def __repr__(self) -> str:
        return f"<MatterDocument id={self.id} name={self.name} v={self.current_version}>"


class MatterDocumentVersion(Base):
    __tablename__ = "matter_document_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matter_documents.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str | None] = mapped_column(String(255))  # e.g. "unsigned draft", "signed copy"
    drive_file_id: Mapped[str] = mapped_column(String(255), nullable=False)
    drive_url: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )

    # Relationships
    document: Mapped["MatterDocument"] = relationship(back_populates="versions")

    def __repr__(self) -> str:
        return f"<MatterDocumentVersion doc={self.document_id} v={self.version_number}>"


class MatterEmail(Base):
    __tablename__ = "matter_emails"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    matter_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("matters.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    organisation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    linked_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    gmail_thread_id: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(500))
    snippet: Mapped[str | None] = mapped_column(Text)

    linked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )

    # Relationships
    matter: Mapped["Matter"] = relationship(back_populates="emails")

    def __repr__(self) -> str:
        return f"<MatterEmail id={self.id} thread={self.gmail_thread_id}>"

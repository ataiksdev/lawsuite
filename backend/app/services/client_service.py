# backend/app/services/client_service.py
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client
from app.models.invoice import Invoice
from app.models.matter import Matter
from app.schemas.client import ClientCreate, ClientUpdate
from app.services.audit_log_service import AuditLogService


class ClientService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.audit = AuditLogService(db)

    async def list_clients(
        self,
        org_id: uuid.UUID,
        search: str | None = None,
        include_inactive: bool = False,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[Client], int]:
        query = select(Client).where(Client.organisation_id == org_id)

        if not include_inactive:
            query = query.where(Client.is_active == True)

        if search:
            query = query.where(Client.name.ilike(f"%{search}%"))

        count_q = select(func.count()).select_from(query.subquery())
        total = (await self.db.execute(count_q)).scalar_one()

        query = query.order_by(Client.name).offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    async def get_client(self, client_id: uuid.UUID, org_id: uuid.UUID) -> Client:
        result = await self.db.execute(
            select(Client).where(
                Client.id == client_id,
                Client.organisation_id == org_id,
            )
        )
        client = result.scalar_one_or_none()
        if not client:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
        return client

    async def _get_by_idempotency_key(self, org_id: uuid.UUID, key: str) -> Client | None:
        result = await self.db.execute(
            select(Client).where(Client.organisation_id == org_id, Client.idempotency_key == key)
        )
        return result.scalar_one_or_none()

    async def create_client(self, org_id: uuid.UUID, data: ClientCreate) -> Client:
        # A retried request (e.g. after a network error made the first
        # response look like it failed) carries the same key and gets the
        # original row back instead of creating a duplicate.
        if data.idempotency_key:
            existing = await self._get_by_idempotency_key(org_id, data.idempotency_key)
            if existing:
                return existing

        client = Client(
            organisation_id=org_id,
            idempotency_key=data.idempotency_key,
            name=data.name.strip(),
            email=data.email.lower() if data.email else None,
            phone=data.phone,
            address=data.address,
            notes=data.notes,
            client_type=data.client_type,
            tin=data.tin,
            vat_registered=data.vat_registered,
            billing_address=data.billing_address,
        )
        self.db.add(client)
        try:
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            if data.idempotency_key:
                existing = await self._get_by_idempotency_key(org_id, data.idempotency_key)
                if existing:
                    return existing
            raise
        await self.db.refresh(client)
        return client

    async def update_client(self, client_id: uuid.UUID, org_id: uuid.UUID, data: ClientUpdate) -> Client:
        client = await self.get_client(client_id, org_id)
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if field == "name" and value:
                value = value.strip()
            if field == "email" and value:
                value = value.lower()
            setattr(client, field, value)
        await self.db.commit()
        await self.db.refresh(client)
        return client

    async def delete_or_archive_client(
        self, client_id: uuid.UUID, org_id: uuid.UUID, actor_id: uuid.UUID
    ) -> Client | dict:
        """
        A client with zero matters and zero invoices has no history worth
        preserving — it's permanently deleted (audit-logged). Otherwise this
        falls back to the existing archive behaviour (soft delete via
        is_active, matters preserved, reactivate via PATCH).

        Returns the Client ORM object when archived, or a plain dict
        snapshot of its final field values when hard-deleted (the row is
        gone by the time this returns, so there's no live object to hand
        back — callers should validate either result the same way).
        """
        client = await self.get_client(client_id, org_id)

        matter_count = (
            await self.db.execute(
                select(func.count())
                .select_from(Matter)
                .where(Matter.client_id == client_id, Matter.organisation_id == org_id)
            )
        ).scalar_one()
        invoice_count = (
            await self.db.execute(
                select(func.count())
                .select_from(Invoice)
                .where(Invoice.client_id == client_id, Invoice.organisation_id == org_id)
            )
        ).scalar_one()

        if matter_count == 0 and invoice_count == 0:
            snapshot = {c.name: getattr(client, c.name) for c in Client.__table__.columns}
            await self.audit.log(
                org_id=org_id,
                actor_id=actor_id,
                action="client.deleted",
                entity_type="client",
                entity_id=client.id,
                summary=f"Deleted empty client '{client.name}'",
            )
            await self.db.delete(client)
            await self.db.commit()
            return snapshot

        client.is_active = False
        await self.db.commit()
        await self.db.refresh(client)
        return client

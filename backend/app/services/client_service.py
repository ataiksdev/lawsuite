# backend/app/services/client_service.py
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client
from app.schemas.client import ClientCreate, ClientUpdate


class ClientService:
    def __init__(self, db: AsyncSession):
        self.db = db

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

    async def create_client(self, org_id: uuid.UUID, data: ClientCreate) -> Client:
        client = Client(
            organisation_id=org_id,
            name=data.name.strip(),
            email=data.email.lower() if data.email else None,
            phone=data.phone,
            address=data.address,
            notes=data.notes,
        )
        self.db.add(client)
        await self.db.commit()
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

    async def archive_client(self, client_id: uuid.UUID, org_id: uuid.UUID) -> Client:
        client = await self.get_client(client_id, org_id)
        client.is_active = False
        await self.db.commit()
        await self.db.refresh(client)
        return client

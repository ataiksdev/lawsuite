# backend/app/api/clients.py
import math
import uuid

from fastapi import APIRouter, Query, status

from app.core.deps import DB, AuthUser
from app.schemas.client import ClientCreate, ClientResponse, ClientUpdate
from app.services.client_service import ClientService

router = APIRouter()


@router.get("/", response_model=dict)
async def list_clients(
    current_user: AuthUser,
    db: DB,
    search: str | None = Query(None, description="Search by name"),
    include_inactive: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    """List all clients for the current organisation."""
    service = ClientService(db)
    clients, total = await service.list_clients(
        org_id=current_user.org_id,
        search=search,
        include_inactive=include_inactive,
        page=page,
        page_size=page_size,
    )
    return {
        "items": [ClientResponse.model_validate(c) for c in clients],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total else 0,
    }


@router.post("/", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(
    payload: ClientCreate,
    current_user: AuthUser,
    db: DB,
):
    """Create a new client."""
    service = ClientService(db)
    client = await service.create_client(org_id=current_user.org_id, data=payload)
    return ClientResponse.model_validate(client)


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(client_id: uuid.UUID, current_user: AuthUser, db: DB):
    """Get a single client by ID."""
    service = ClientService(db)
    client = await service.get_client(client_id, current_user.org_id)
    return ClientResponse.model_validate(client)


@router.patch("/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: uuid.UUID,
    payload: ClientUpdate,
    current_user: AuthUser,
    db: DB,
):
    """Update a client's details."""
    service = ClientService(db)
    client = await service.update_client(client_id, current_user.org_id, payload)
    return ClientResponse.model_validate(client)


@router.delete("/{client_id}", response_model=ClientResponse)
async def archive_client(client_id: uuid.UUID, current_user: AuthUser, db: DB):
    """
    Archive a client (soft delete). The client's matters are preserved.
    Use PATCH to reactivate.
    """
    service = ClientService(db)
    client = await service.archive_client(client_id, current_user.org_id)
    return ClientResponse.model_validate(client)

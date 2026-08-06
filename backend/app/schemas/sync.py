# backend/app/schemas/sync.py
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class SyncChangesResponse(BaseModel):
    # table name -> list of row dicts. Row shape varies per table (it's
    # every non-sensitive column on that table) — see
    # app/services/sync_service.py's TABLE_REGISTRY for exactly what each
    # table includes/excludes.
    server_time: datetime
    tables: dict[str, list[dict[str, Any]]]


class SyncApplyRequest(BaseModel):
    tables: dict[str, list[dict[str, Any]]]


class SyncApplyResponse(BaseModel):
    written: dict[str, int]

# backend/tests/test_disbursements.py
import pytest
from httpx import AsyncClient

REGISTER = {
    "org_name": "Disbursement Test Firm",
    "full_name": "Ifeoma Eze",
    "email": "ifeoma@disbtest.ng",
    "password": "TestPass123",
}


async def setup(client: AsyncClient) -> tuple[str, str]:
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    cl = await client.post("/clients/", json={"name": "Disb Test Client"}, headers=headers)
    m = await client.post(
        "/matters/",
        json={"title": "Disbursement Matter", "matter_type": "litigation", "client_id": cl.json()["id"]},
        headers=headers,
    )
    return token, m.json()["id"]


@pytest.mark.asyncio
async def test_create_and_list_disbursement(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        f"/matters/{matter_id}/disbursements",
        json={
            "type": "agency",
            "description": "Court filing fee",
            "amount_kobo": 250_000,
            "incurred_at": "2026-07-01",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["invoiced"] is False

    listing = await client.get(f"/matters/{matter_id}/disbursements", headers=headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 1


@pytest.mark.asyncio
async def test_unbilled_only_filter(client: AsyncClient, db_session):
    from sqlalchemy import select

    from app.models.disbursement import Disbursement

    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    unbilled_resp = await client.post(
        f"/matters/{matter_id}/disbursements",
        json={"type": "agency", "description": "Filing", "amount_kobo": 100_000, "incurred_at": "2026-07-01"},
        headers=headers,
    )
    billed_resp = await client.post(
        f"/matters/{matter_id}/disbursements",
        json={"type": "recharge", "description": "Courier", "amount_kobo": 50_000, "incurred_at": "2026-07-02"},
        headers=headers,
    )

    result = await db_session.execute(
        select(Disbursement).where(Disbursement.id == billed_resp.json()["id"])
    )
    billed = result.scalar_one()
    billed.invoiced = True
    await db_session.commit()

    all_disbursements = await client.get(f"/matters/{matter_id}/disbursements", headers=headers)
    assert len(all_disbursements.json()) == 2

    unbilled = await client.get(f"/matters/{matter_id}/disbursements?unbilled_only=true", headers=headers)
    assert len(unbilled.json()) == 1
    assert unbilled.json()[0]["id"] == unbilled_resp.json()["id"]


@pytest.mark.asyncio
async def test_update_and_delete_rejected_once_invoiced(client: AsyncClient, db_session):
    from sqlalchemy import select
    from app.models.disbursement import Disbursement

    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        f"/matters/{matter_id}/disbursements",
        json={"type": "recharge", "description": "Courier", "amount_kobo": 50_000, "incurred_at": "2026-07-01"},
        headers=headers,
    )
    disbursement_id = resp.json()["id"]

    result = await db_session.execute(select(Disbursement).where(Disbursement.id == disbursement_id))
    disbursement = result.scalar_one()
    disbursement.invoiced = True
    await db_session.commit()

    update_resp = await client.patch(
        f"/matters/{matter_id}/disbursements/{disbursement_id}",
        json={"description": "Updated"},
        headers=headers,
    )
    assert update_resp.status_code == 422

    delete_resp = await client.delete(
        f"/matters/{matter_id}/disbursements/{disbursement_id}", headers=headers
    )
    assert delete_resp.status_code == 422

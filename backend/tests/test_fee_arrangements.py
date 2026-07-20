# backend/tests/test_fee_arrangements.py
import pytest
from httpx import AsyncClient

REGISTER = {
    "org_name": "Fee Arrangement Test Firm",
    "full_name": "Amaka Nwosu",
    "email": "amaka@feetest.ng",
    "password": "TestPass123",
}


async def setup(client: AsyncClient) -> tuple[str, str]:
    """Register, create a client + matter, return (token, matter_id)."""
    reg = await client.post("/auth/register", json=REGISTER)
    token = reg.json()["tokens"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    cl = await client.post("/clients/", json={"name": "Fee Test Client"}, headers=headers)
    m = await client.post(
        "/matters/",
        json={"title": "Fee Arrangement Matter", "matter_type": "compliance", "client_id": cl.json()["id"]},
        headers=headers,
    )
    return token, m.json()["id"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "arrangement_type,params",
    [
        ("fixed", {"amount_kobo": 50_000_000}),
        ("retainer", {"amount_kobo": 10_000_000, "schedule": "monthly"}),
        ("scale", {"scale_basis_kobo": 100_000_000}),
        ("milestone", {"milestones": [{"label": "Filing", "amount_kobo": 5_000_000, "invoiced": False}]}),
        ("recovery", {"percentage": 15}),
        ("appearance", {"amount_kobo": 2_000_000}),
    ],
)
async def test_create_each_fee_arrangement_type(client: AsyncClient, arrangement_type, params):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        f"/matters/{matter_id}/fee-arrangements",
        json={"type": arrangement_type, "params": params},
        headers=headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["type"] == arrangement_type
    assert body["params"] == params
    assert body["is_active"] is True


@pytest.mark.asyncio
async def test_second_arrangement_deactivates_first(client: AsyncClient):
    token, matter_id = await setup(client)
    headers = {"Authorization": f"Bearer {token}"}

    first = await client.post(
        f"/matters/{matter_id}/fee-arrangements",
        json={"type": "fixed", "params": {"amount_kobo": 1_000_000}},
        headers=headers,
    )
    second = await client.post(
        f"/matters/{matter_id}/fee-arrangements",
        json={"type": "retainer", "params": {"amount_kobo": 2_000_000}},
        headers=headers,
    )
    assert second.json()["is_active"] is True

    listing = await client.get(f"/matters/{matter_id}/fee-arrangements", headers=headers)
    by_id = {a["id"]: a for a in listing.json()}
    assert by_id[first.json()["id"]]["is_active"] is False
    assert by_id[second.json()["id"]]["is_active"] is True
    # History kept, not deleted.
    assert len(listing.json()) == 2


@pytest.mark.asyncio
async def test_org_isolation(client: AsyncClient):
    token_a, matter_id_a = await setup(client)
    headers_a = {"Authorization": f"Bearer {token_a}"}

    reg_b = await client.post(
        "/auth/register",
        json={
            "org_name": "Other Fee Firm",
            "full_name": "Tunde Bello",
            "email": "tunde@otherfeetest.ng",
            "password": "TestPass123",
        },
    )
    token_b = reg_b.json()["tokens"]["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    arrangement = await client.post(
        f"/matters/{matter_id_a}/fee-arrangements",
        json={"type": "fixed", "params": {"amount_kobo": 1_000_000}},
        headers=headers_a,
    )

    # Org B can't list org A's matter's arrangements — matter itself isn't visible.
    resp = await client.get(f"/matters/{matter_id_a}/fee-arrangements", headers=headers_b)
    assert resp.status_code == 404

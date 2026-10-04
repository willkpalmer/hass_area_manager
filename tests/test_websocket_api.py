"""Tests for the Area Manager WebSocket commands."""
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import floor_registry as fr
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed
from homeassistant.util import dt as dt_util
from datetime import timedelta

DOMAIN = "area_manager"


async def _setup(hass: HomeAssistant):
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain=DOMAIN, title="WP Area Manager")
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _device(hass, name, domain="hue", area_id=None):
    entry = MockConfigEntry(domain=domain, title=f"{domain} bridge")
    entry.add_to_hass(hass)
    device = dr.async_get(hass).async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(domain, name)},
        name=name,
        manufacturer="Acme",
        model="X1",
    )
    if area_id:
        device = dr.async_get(hass).async_update_device(device.id, area_id=area_id)
    return device


async def test_panel_registered(hass: HomeAssistant) -> None:
    await _setup(hass)
    assert "area-manager" in hass.data["frontend_panels"]


async def test_subscribe_and_live_updates(hass: HomeAssistant, hass_ws_client) -> None:
    await _setup(hass)
    floor = fr.async_get(hass).async_create("Ground", level=0)
    kitchen = ar.async_get(hass).async_create("Kitchen", floor_id=floor.floor_id)
    lamp = _device(hass, "Lamp", area_id=kitchen.id)
    _device(hass, "Plug", domain="shelly")

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "area_manager/subscribe"})
    assert (await client.receive_json())["success"]
    snapshot = (await client.receive_json())["event"]
    by_name = {d["name"]: d for d in snapshot["devices"]}
    assert by_name["Lamp"]["area_id"] == kitchen.id
    assert by_name["Lamp"]["domain"] == "hue"
    assert by_name["Lamp"]["integration"] == "Philips Hue"
    assert by_name["Plug"]["area_id"] is None
    assert [a["name"] for a in snapshot["areas"]] == ["Kitchen"]
    assert snapshot["areas"][0]["floor_id"] == floor.floor_id
    assert snapshot["floors"][0]["name"] == "Ground"

    # A bulk change arrives as one update.
    await client.send_json_auto_id(
        {"type": "area_manager/assign", "device_ids": list(by_name_ids(by_name)), "area_id": kitchen.id}
    )
    result = await client.receive_json()
    assert result["success"] and result["result"] == {"updated": 1}
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=1))
    await hass.async_block_till_done()
    snapshot = (await client.receive_json())["event"]
    assert {d["area_id"] for d in snapshot["devices"]} == {kitchen.id}
    assert lamp.id in {d["id"] for d in snapshot["devices"]}


def by_name_ids(by_name):
    return (d["id"] for d in by_name.values())


async def test_assign_and_clear(hass: HomeAssistant, hass_ws_client) -> None:
    await _setup(hass)
    hall = ar.async_get(hass).async_create("Hall")
    devices = [_device(hass, f"D{i}") for i in range(3)]
    client = await hass_ws_client(hass)

    await client.send_json_auto_id(
        {"type": "area_manager/assign", "device_ids": [d.id for d in devices], "area_id": hall.id}
    )
    assert (await client.receive_json())["result"] == {"updated": 3}
    reg = dr.async_get(hass)
    assert all(reg.async_get(d.id).area_id == hall.id for d in devices)

    await client.send_json_auto_id(
        {"type": "area_manager/assign", "device_ids": [devices[0].id], "area_id": None}
    )
    assert (await client.receive_json())["result"] == {"updated": 1}
    assert reg.async_get(devices[0].id).area_id is None

    await client.send_json_auto_id(
        {"type": "area_manager/assign", "device_ids": [devices[0].id], "area_id": "nope"}
    )
    msg = await client.receive_json()
    assert not msg["success"] and msg["error"]["code"] == "not_found"


async def test_area_create_update_delete(hass: HomeAssistant, hass_ws_client) -> None:
    await _setup(hass)
    floor = fr.async_get(hass).async_create("Upstairs", level=1)
    client = await hass_ws_client(hass)
    area_reg = ar.async_get(hass)

    await client.send_json_auto_id(
        {"type": "area_manager/area/create", "name": "  Office ", "icon": "mdi:desk", "floor_id": ""}
    )
    msg = await client.receive_json()
    assert msg["success"]
    area_id = msg["result"]["area_id"]
    area = area_reg.async_get_area(area_id)
    assert (area.name, area.icon, area.floor_id) == ("Office", "mdi:desk", None)

    # Duplicate names are refused.
    await client.send_json_auto_id({"type": "area_manager/area/create", "name": "office"})
    assert not (await client.receive_json())["success"]

    await client.send_json_auto_id(
        {
            "type": "area_manager/area/update",
            "area_id": area_id,
            "name": "Study",
            "icon": "",
            "floor_id": floor.floor_id,
        }
    )
    assert (await client.receive_json())["success"]
    area = area_reg.async_get_area(area_id)
    assert (area.name, area.icon, area.floor_id) == ("Study", None, floor.floor_id)

    device = _device(hass, "Desk lamp", area_id=area_id)
    await client.send_json_auto_id({"type": "area_manager/area/delete", "area_ids": [area_id, "gone"]})
    assert (await client.receive_json())["result"] == {"deleted": 1}
    await hass.async_block_till_done()
    assert area_reg.async_get_area(area_id) is None
    assert dr.async_get(hass).async_get(device.id).area_id is None


async def test_non_admin_refused(hass: HomeAssistant, hass_ws_client, hass_read_only_access_token) -> None:
    await _setup(hass)
    client = await hass_ws_client(hass, hass_read_only_access_token)
    await client.send_json_auto_id({"type": "area_manager/subscribe"})
    msg = await client.receive_json()
    assert not msg["success"] and msg["error"]["code"] == "unauthorized"

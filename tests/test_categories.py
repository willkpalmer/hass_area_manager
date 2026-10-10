"""Tests for the Area Manager category commands."""
from datetime import timedelta

from homeassistant.core import HomeAssistant
from homeassistant.helpers import category_registry as cr
from homeassistant.helpers import entity_registry as er
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed

DOMAIN = "area_manager"


async def _setup(hass: HomeAssistant):
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain=DOMAIN, title="WP Area Manager")
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()


def _entity(hass, domain, object_id, name):
    entry = er.async_get(hass).async_get_or_create(
        domain, "test", object_id, suggested_object_id=object_id, original_name=name
    )
    hass.states.async_set(entry.entity_id, "on", {"friendly_name": name})
    return entry.entity_id


async def test_snapshot_lists_categories_and_items(hass: HomeAssistant, hass_ws_client) -> None:
    await _setup(hass)
    cat = cr.async_get(hass).async_create(scope="automation", name="Lights", icon="mdi:lamp")
    auto = _entity(hass, "automation", "night", "Night lights")
    er.async_get(hass).async_update_entity(auto, categories={"automation": cat.category_id})
    _entity(hass, "script", "wake", "Wake up")
    hass.states.async_set("scene.yaml_only", "scening", {"friendly_name": "YAML scene"})

    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "area_manager/subscribe"})
    assert (await client.receive_json())["success"]
    snapshot = (await client.receive_json())["event"]
    assert snapshot["categories"]["automation"] == [
        {"category_id": cat.category_id, "name": "Lights", "icon": "mdi:lamp"}
    ]
    assert snapshot["categories"]["script"] == []
    items = {i["entity_id"]: i for i in snapshot["categorizable"]}
    assert items[auto]["category_id"] == cat.category_id
    assert items[auto]["name"] == "Night lights"
    assert items["script.wake"]["scope"] == "script" and items["script.wake"]["editable"]
    assert items["scene.yaml_only"]["editable"] is False
    assert snapshot["zha"] is False

    # A new automation shows up, but its runs don't send updates.
    _entity(hass, "automation", "morning", "Morning")
    async_fire_time_changed(hass, dt_util.utcnow() + timedelta(seconds=1))
    await hass.async_block_till_done()
    snapshot = (await client.receive_json())["event"]
    assert "automation.morning" in {i["entity_id"] for i in snapshot["categorizable"]}


async def test_categorize_and_clear(hass: HomeAssistant, hass_ws_client) -> None:
    await _setup(hass)
    cat = cr.async_get(hass).async_create(scope="script", name="Morning")
    other = cr.async_get(hass).async_create(scope="automation", name="Other")
    scripts = [_entity(hass, "script", f"s{i}", f"S{i}") for i in range(3)]
    auto = _entity(hass, "automation", "a", "A")
    reg = er.async_get(hass)
    reg.async_update_entity(scripts[0], categories={"automation": other.category_id})
    client = await hass_ws_client(hass)

    # Only the scripts change; the automation is the wrong kind.
    await client.send_json_auto_id({
        "type": "area_manager/categorize", "scope": "script",
        "entity_ids": [*scripts, auto], "category_id": cat.category_id,
    })
    assert (await client.receive_json())["result"] == {"updated": 3}
    assert all(reg.async_get(e).categories.get("script") == cat.category_id for e in scripts)
    # Other scopes' categories are kept.
    assert reg.async_get(scripts[0]).categories["automation"] == other.category_id
    assert reg.async_get(auto).categories == {}

    await client.send_json_auto_id({
        "type": "area_manager/categorize", "scope": "script",
        "entity_ids": [scripts[0]], "category_id": None,
    })
    assert (await client.receive_json())["result"] == {"updated": 1}
    assert reg.async_get(scripts[0]).categories == {"automation": other.category_id}

    # A category from another scope is refused.
    await client.send_json_auto_id({
        "type": "area_manager/categorize", "scope": "script",
        "entity_ids": [scripts[1]], "category_id": other.category_id,
    })
    msg = await client.receive_json()
    assert not msg["success"] and msg["error"]["code"] == "not_found"


async def test_category_create_update_delete(hass: HomeAssistant, hass_ws_client) -> None:
    await _setup(hass)
    client = await hass_ws_client(hass)
    cat_reg = cr.async_get(hass)

    await client.send_json_auto_id({
        "type": "area_manager/category/create", "scope": "scene", "name": " Evening ", "icon": "mdi:weather-night",
    })
    msg = await client.receive_json()
    assert msg["success"]
    category_id = msg["result"]["category_id"]
    cat = cat_reg.async_get_category(scope="scene", category_id=category_id)
    assert (cat.name, cat.icon) == ("Evening", "mdi:weather-night")

    # Duplicate names are refused, but the same name in another scope is fine.
    await client.send_json_auto_id({"type": "area_manager/category/create", "scope": "scene", "name": "evening"})
    assert not (await client.receive_json())["success"]
    await client.send_json_auto_id({"type": "area_manager/category/create", "scope": "script", "name": "Evening"})
    assert (await client.receive_json())["success"]

    await client.send_json_auto_id({
        "type": "area_manager/category/update", "scope": "scene", "category_id": category_id,
        "name": "Night", "icon": "",
    })
    assert (await client.receive_json())["success"]
    cat = cat_reg.async_get_category(scope="scene", category_id=category_id)
    assert (cat.name, cat.icon) == ("Night", None)

    await client.send_json_auto_id({
        "type": "area_manager/category/update", "scope": "automation", "category_id": category_id, "name": "X",
    })
    assert (await client.receive_json())["error"]["code"] == "not_found"

    scene = _entity(hass, "scene", "dim", "Dim")
    er.async_get(hass).async_update_entity(scene, categories={"scene": category_id})
    await client.send_json_auto_id({
        "type": "area_manager/category/delete", "scope": "scene", "category_ids": [category_id, "gone"],
    })
    assert (await client.receive_json())["result"] == {"deleted": 1}
    await hass.async_block_till_done()
    assert cat_reg.async_get_category(scope="scene", category_id=category_id) is None
    assert er.async_get(hass).async_get(scene).categories == {}

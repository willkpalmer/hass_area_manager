"""WebSocket commands for the Area Manager sidebar panel.

- area_manager/subscribe sends a snapshot of every device, area, floor,
  automation, script, scene and category straight away and again after
  every change to any of those registries, to a config entry, or to the
  list (or names) of automations, scripts and scenes, so the panel stays live and open browser
  tabs stay in sync. Changes from anywhere (Home Assistant's own pages
  included) show up.
- area_manager/assign sets (or, with area_id null, clears) the area of one
  or more devices.
- area_manager/area/create, area_manager/area/update and
  area_manager/area/delete manage the areas themselves. Deleting an area
  leaves its devices and entities without one, as Home Assistant's own
  Areas page does.
- area_manager/categorize sets (or, with category_id null, clears) the
  category of one or more automations, scripts or scenes, and
  area_manager/category/create, area_manager/category/update and
  area_manager/category/delete manage the categories of each of them.
  Categories belong to one "scope" (automation, script or scene), as on
  Home Assistant's own pages. Deleting a category leaves what was in it
  uncategorized.

Everything goes through Home Assistant's own registries, so it's exactly
what the Settings pages would do. All commands are admin-only, like the
panel itself.
"""
from __future__ import annotations

from collections import Counter
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import SIGNAL_CONFIG_ENTRY_CHANGED
from homeassistant.const import ATTR_FRIENDLY_NAME, EVENT_STATE_CHANGED
from homeassistant.core import CALLBACK_TYPE, Event, HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import category_registry as cr
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import floor_registry as fr
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.event import async_call_later
from homeassistant.loader import async_get_integrations

from .const import CATEGORY_SCOPES, UPDATE_DEBOUNCE_SECONDS

WS_SUBSCRIBE = "area_manager/subscribe"
WS_ASSIGN = "area_manager/assign"
WS_AREA_CREATE = "area_manager/area/create"
WS_AREA_UPDATE = "area_manager/area/update"
WS_AREA_DELETE = "area_manager/area/delete"
WS_CATEGORIZE = "area_manager/categorize"
WS_CATEGORY_CREATE = "area_manager/category/create"
WS_CATEGORY_UPDATE = "area_manager/category/update"
WS_CATEGORY_DELETE = "area_manager/category/delete"

_IDS = vol.All([str], vol.Length(min=1, max=100_000))
_NAME = vol.All(str, vol.Strip, vol.Length(min=1, max=255))
# Empty means "none" for the optional fields.
_OPTIONAL_STR = vol.Any(None, vol.All(str, vol.Strip, lambda v: v or None))
_SCOPE = vol.In(CATEGORY_SCOPES)


@callback
def async_setup(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, websocket_subscribe)
    websocket_api.async_register_command(hass, websocket_assign)
    websocket_api.async_register_command(hass, websocket_area_create)
    websocket_api.async_register_command(hass, websocket_area_update)
    websocket_api.async_register_command(hass, websocket_area_delete)
    websocket_api.async_register_command(hass, websocket_categorize)
    websocket_api.async_register_command(hass, websocket_category_create)
    websocket_api.async_register_command(hass, websocket_category_update)
    websocket_api.async_register_command(hass, websocket_category_delete)


# -- the snapshot -------------------------------------------------------


async def async_snapshot(hass: HomeAssistant) -> dict[str, Any]:
    """Every device, area and floor, as the panel shows them."""
    entries = {e.entry_id: e for e in hass.config_entries.async_entries()}
    names = await _async_integration_names(hass, {e.domain for e in entries.values()})

    # Read after the await, so the snapshot is as fresh as it can be.
    dev_reg = dr.async_get(hass)
    area_reg = ar.async_get(hass)
    floor_reg = fr.async_get(hass)
    ent_reg = er.async_get(hass)

    entity_counts = Counter(
        e.device_id for e in ent_reg.entities.values() if e.device_id
    )

    devices = []
    for device in dev_reg.devices.values():
        entry = _primary_entry(device, entries)
        domain = entry.domain if entry else None
        devices.append(
            {
                "id": device.id,
                "name": device.name_by_user or device.name or device.model or device.id,
                "original_name": device.name,
                "manufacturer": device.manufacturer,
                "model": device.model,
                "area_id": device.area_id,
                "domain": domain,
                "integration": names.get(domain, domain) if domain else None,
                "entry_title": entry.title if entry else None,
                "disabled": device.disabled_by is not None,
                "service": device.entry_type is dr.DeviceEntryType.SERVICE,
                "via_device_id": device.via_device_id,
                "entity_count": entity_counts.get(device.id, 0),
            }
        )

    areas = [
        {
            "area_id": area.id,
            "name": area.name,
            "icon": area.icon,
            "floor_id": area.floor_id,
            "picture": area.picture,
        }
        for area in area_reg.async_list_areas()
    ]
    floors = [
        {
            "floor_id": floor.floor_id,
            "name": floor.name,
            "level": floor.level,
            "icon": floor.icon,
        }
        for floor in floor_reg.async_list_floors()
    ]
    categories = {
        scope: [
            {"category_id": c.category_id, "name": c.name, "icon": c.icon}
            for c in cr.async_get(hass).async_list_categories(scope=scope)
        ]
        for scope in CATEGORY_SCOPES
    }
    return {
        "devices": devices,
        "areas": areas,
        "floors": floors,
        "categories": categories,
        "categorizable": _categorizable(hass, ent_reg),
    }


def _categorizable(hass: HomeAssistant, ent_reg: er.EntityRegistry) -> list[dict[str, Any]]:
    """Every automation, script and scene, with its category.

    Only those in the entity registry (that is, with a unique ID) can have a
    category; the rest (e.g. YAML ones without an id) are listed as not
    editable, as Home Assistant's own pages do.
    """
    items = []
    for entry in ent_reg.entities.values():
        if entry.domain not in CATEGORY_SCOPES:
            continue
        state = hass.states.get(entry.entity_id)
        items.append(
            {
                "entity_id": entry.entity_id,
                "scope": entry.domain,
                "name": entry.name
                or (state and state.attributes.get(ATTR_FRIENDLY_NAME))
                or entry.original_name
                or entry.entity_id,
                "category_id": entry.categories.get(entry.domain),
                "disabled": entry.disabled_by is not None,
                "editable": True,
            }
        )
    for scope in CATEGORY_SCOPES:
        for state in hass.states.async_all(scope):
            if ent_reg.async_get(state.entity_id) is not None:
                continue
            items.append(
                {
                    "entity_id": state.entity_id,
                    "scope": scope,
                    "name": state.attributes.get(ATTR_FRIENDLY_NAME) or state.entity_id,
                    "category_id": None,
                    "disabled": False,
                    "editable": False,
                }
            )
    return items


def _primary_entry(device: dr.DeviceEntry, entries: dict) -> Any:
    # The integration that created the device; config_entries is a set, so
    # without a primary entry any one of them will do.
    primary = getattr(device, "primary_config_entry", None)
    if primary and primary in entries:
        return entries[primary]
    for entry_id in sorted(device.config_entries):
        if entry_id in entries:
            return entries[entry_id]
    return None


async def _async_integration_names(hass: HomeAssistant, domains: set[str]) -> dict[str, str]:
    integrations = await async_get_integrations(hass, domains)
    return {
        domain: integration.name
        for domain, integration in integrations.items()
        if not isinstance(integration, Exception) and integration.name
    }


# -- commands -----------------------------------------------------------


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): WS_SUBSCRIBE})
@websocket_api.async_response
async def websocket_subscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    msg_id = msg["id"]
    pending: CALLBACK_TYPE | None = None

    async def _async_send() -> None:
        snapshot = await async_snapshot(hass)
        if msg_id in connection.subscriptions:
            connection.send_message(websocket_api.event_message(msg_id, snapshot))

    @callback
    def _send_now(_now: Any = None) -> None:
        nonlocal pending
        pending = None
        hass.async_create_task(_async_send())

    @callback
    def _changed(*_args: Any) -> None:
        nonlocal pending
        if pending is None:
            pending = async_call_later(hass, UPDATE_DEBOUNCE_SECONDS, _send_now)

    @callback
    def _state_changed(event: Event) -> None:
        # Only automations, scripts and scenes coming, going or renamed;
        # not every run or toggle.
        if event.data["entity_id"].split(".", 1)[0] not in CATEGORY_SCOPES:
            return
        old, new = event.data["old_state"], event.data["new_state"]
        if (
            old is None
            or new is None
            or old.attributes.get(ATTR_FRIENDLY_NAME) != new.attributes.get(ATTR_FRIENDLY_NAME)
        ):
            _changed()

    unsubs = [
        hass.bus.async_listen(dr.EVENT_DEVICE_REGISTRY_UPDATED, _changed),
        hass.bus.async_listen(cr.EVENT_CATEGORY_REGISTRY_UPDATED, _changed),
        hass.bus.async_listen(EVENT_STATE_CHANGED, _state_changed),
        hass.bus.async_listen(ar.EVENT_AREA_REGISTRY_UPDATED, _changed),
        hass.bus.async_listen(fr.EVENT_FLOOR_REGISTRY_UPDATED, _changed),
        hass.bus.async_listen(er.EVENT_ENTITY_REGISTRY_UPDATED, _changed),
        async_dispatcher_connect(hass, SIGNAL_CONFIG_ENTRY_CHANGED, _changed),
    ]

    @callback
    def _unsubscribe() -> None:
        nonlocal pending
        for unsub in unsubs:
            unsub()
        if pending is not None:
            pending()
            pending = None

    connection.subscriptions[msg_id] = _unsubscribe
    connection.send_result(msg_id)
    await _async_send()


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_ASSIGN,
        vol.Required("device_ids"): _IDS,
        vol.Required("area_id"): vol.Any(None, str),
    }
)
@callback
def websocket_assign(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    area_id = msg["area_id"]
    if area_id is not None and ar.async_get(hass).async_get_area(area_id) is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "That area no longer exists")
        return
    dev_reg = dr.async_get(hass)
    updated = 0
    for device_id in msg["device_ids"]:
        device = dev_reg.async_get(device_id)
        if device is None or device.area_id == area_id:
            continue
        dev_reg.async_update_device(device_id, area_id=area_id)
        updated += 1
    connection.send_result(msg["id"], {"updated": updated})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_AREA_CREATE,
        vol.Required("name"): _NAME,
        vol.Optional("icon"): _OPTIONAL_STR,
        vol.Optional("floor_id"): _OPTIONAL_STR,
    }
)
@callback
def websocket_area_create(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    try:
        area = ar.async_get(hass).async_create(
            msg["name"], icon=msg.get("icon"), floor_id=msg.get("floor_id")
        )
    except ValueError as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
        return
    connection.send_result(msg["id"], {"area_id": area.id})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_AREA_UPDATE,
        vol.Required("area_id"): str,
        vol.Optional("name"): _NAME,
        vol.Optional("icon"): _OPTIONAL_STR,
        vol.Optional("floor_id"): _OPTIONAL_STR,
    }
)
@callback
def websocket_area_update(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    area_reg = ar.async_get(hass)
    if area_reg.async_get_area(msg["area_id"]) is None:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "That area no longer exists")
        return
    changes = {key: msg[key] for key in ("name", "icon", "floor_id") if key in msg}
    try:
        area_reg.async_update(msg["area_id"], **changes)
    except ValueError as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
        return
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): WS_AREA_DELETE, vol.Required("area_ids"): _IDS}
)
@callback
def websocket_area_delete(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    area_reg = ar.async_get(hass)
    deleted = 0
    for area_id in msg["area_ids"]:
        if area_reg.async_get_area(area_id) is None:
            continue
        area_reg.async_delete(area_id)
        deleted += 1
    connection.send_result(msg["id"], {"deleted": deleted})


# -- categories ---------------------------------------------------------


def _category_exists(hass: HomeAssistant, scope: str, category_id: str) -> bool:
    return cr.async_get(hass).async_get_category(scope=scope, category_id=category_id) is not None


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_CATEGORIZE,
        vol.Required("scope"): _SCOPE,
        vol.Required("entity_ids"): _IDS,
        vol.Required("category_id"): vol.Any(None, str),
    }
)
@callback
def websocket_categorize(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    scope, category_id = msg["scope"], msg["category_id"]
    if category_id is not None and not _category_exists(hass, scope, category_id):
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "That category no longer exists")
        return
    ent_reg = er.async_get(hass)
    updated = 0
    for entity_id in msg["entity_ids"]:
        entry = ent_reg.async_get(entity_id)
        # A category only applies to its own kind (an automation category to
        # automations, and so on).
        if entry is None or entry.domain != scope or entry.categories.get(scope) == category_id:
            continue
        categories = dict(entry.categories)
        if category_id is None:
            categories.pop(scope, None)
        else:
            categories[scope] = category_id
        ent_reg.async_update_entity(entity_id, categories=categories)
        updated += 1
    connection.send_result(msg["id"], {"updated": updated})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_CATEGORY_CREATE,
        vol.Required("scope"): _SCOPE,
        vol.Required("name"): _NAME,
        vol.Optional("icon"): _OPTIONAL_STR,
    }
)
@callback
def websocket_category_create(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    try:
        category = cr.async_get(hass).async_create(
            scope=msg["scope"], name=msg["name"], icon=msg.get("icon")
        )
    except ValueError as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
        return
    connection.send_result(msg["id"], {"category_id": category.category_id})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_CATEGORY_UPDATE,
        vol.Required("scope"): _SCOPE,
        vol.Required("category_id"): str,
        vol.Optional("name"): _NAME,
        vol.Optional("icon"): _OPTIONAL_STR,
    }
)
@callback
def websocket_category_update(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    if not _category_exists(hass, msg["scope"], msg["category_id"]):
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "That category no longer exists")
        return
    changes = {key: msg[key] for key in ("name", "icon") if key in msg}
    try:
        cr.async_get(hass).async_update(
            scope=msg["scope"], category_id=msg["category_id"], **changes
        )
    except ValueError as err:
        connection.send_error(msg["id"], websocket_api.ERR_INVALID_FORMAT, str(err))
        return
    connection.send_result(msg["id"])


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_CATEGORY_DELETE,
        vol.Required("scope"): _SCOPE,
        vol.Required("category_ids"): _IDS,
    }
)
@callback
def websocket_category_delete(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    cat_reg = cr.async_get(hass)
    deleted = 0
    for category_id in msg["category_ids"]:
        if not _category_exists(hass, msg["scope"], category_id):
            continue
        # The entity registry takes the category off everything in it.
        cat_reg.async_delete(scope=msg["scope"], category_id=category_id)
        deleted += 1
    connection.send_result(msg["id"], {"deleted": deleted})

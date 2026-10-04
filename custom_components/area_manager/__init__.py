"""The Area Manager integration.

Adds an "Area Manager" page to the sidebar for assigning devices to areas
in bulk or one at a time, managing the areas themselves (create, rename,
change icon or floor, delete) and seeing every device grouped by area. It
has no entities or settings of its own: everything happens on the panel,
which reads and changes Home Assistant's own device and area registries
(see websocket_api.py).
"""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .panel import async_register_panel, async_remove_panel


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Area Manager from a config entry."""
    await async_register_panel(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload an Area Manager config entry."""
    async_remove_panel(hass)
    return True

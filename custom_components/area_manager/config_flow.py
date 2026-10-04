"""Config flow for Area Manager: nothing to configure, just confirm."""
from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigFlow

from .const import DOMAIN, TITLE


class AreaManagerConfigFlow(ConfigFlow, domain=DOMAIN):
    """Add Area Manager (once)."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> Any:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title=TITLE, data={})
        return self.async_show_form(step_id="user")

"""Constants for the Area Manager integration."""
from __future__ import annotations

DOMAIN = "area_manager"
TITLE = "WP Area Manager"

DATA_PANEL_STATIC_REGISTERED = f"{DOMAIN}_panel_static_registered"

# The Area Manager sidebar panel (see panel.py / frontend/), with a
# "Devices", "Devices by area" and "Areas" view, picked by the URL's
# #devices / #by-area / #areas.
PANEL_URL_PATH = "area-manager"
PANEL_TITLE = "Area Manager"
PANEL_ICON = "mdi:floor-plan"
PANEL_ELEMENT = "area-manager-panel"
PANEL_STATIC_URL = "/area_manager_static"
PANEL_MODULE_FILE = "area-manager-panel.js"

# Registry changes arriving within this many seconds of each other are sent
# to the panel as one update, so moving 200 devices at once doesn't send
# 200 full snapshots.
UPDATE_DEBOUNCE_SECONDS = 0.3

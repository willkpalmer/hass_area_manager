"""Constants for the Area Manager integration."""
from __future__ import annotations

DOMAIN = "area_manager"
TITLE = "WP Area Manager"

DATA_PANEL_STATIC_REGISTERED = f"{DOMAIN}_panel_static_registered"

# The Area Manager sidebar panel (see panel.py / frontend/), with
# "Devices", "Devices by area", "Areas", "By category" and "Categories"
# views, picked by the URL's #devices / #by-area / #areas / #by-category /
# #categories.
PANEL_URL_PATH = "area-manager"
PANEL_TITLE = "Area Manager"
PANEL_ICON = "mdi:floor-plan"
PANEL_ELEMENT = "area-manager-panel"
PANEL_STATIC_URL = "/area_manager_static"
PANEL_MODULE_FILE = "area-manager-panel.js"

# The kinds of things whose categories the panel manages; each has its own
# set of categories in Home Assistant's category registry, keyed by the
# same name as the entities' domain.
CATEGORY_SCOPES = ("automation", "script", "scene")

# Registry changes arriving within this many seconds of each other are sent
# to the panel as one update, so moving 200 devices at once doesn't send
# 200 full snapshots.
UPDATE_DEBOUNCE_SECONDS = 0.3

# Area Manager

A Home Assistant custom integration that adds an **Area Manager** page to
the sidebar for putting your devices in the right areas quickly - one at a
time or dozens at once - and for managing the areas themselves.

Home Assistant's own pages make you open each device to change its area.
Area Manager lists every device on one page instead, grouped by
integration, with an area picker on every row and bulk controls for the
devices you select.

It changes nothing on its own: every change is one you make on the page,
and it goes through Home Assistant's own device and area registries,
exactly as if you'd made it on the Settings pages.

## Installation

### HACS (recommended)

1. In HACS, open the menu (⋮) → **Custom repositories**.
2. Add `https://github.com/willkpalmer/hass_area_manager` with the type
   **Integration**.
3. Find **WP Area Manager** in HACS, download it, and restart Home
   Assistant.
4. Go to **Settings → Devices & services → Add integration**, search for
   **WP Area Manager** and add it. There's nothing to configure.

The **Area Manager** page then appears in the sidebar (for admin users
only).

### Manual

Copy `custom_components/area_manager` into your Home Assistant
`config/custom_components/` folder, restart, and add the integration as in
step 4 above.

## The Area Manager page

The page has three views, picked with the buttons at the top (or the
URL's `#devices`, `#by-area` and `#areas`). Everything on it updates live:
changes made anywhere - on this page, in another browser tab, or on Home
Assistant's own pages - show up straight away.

### Devices

Every device, grouped by integration.

- **Collapse or expand** an integration by clicking its heading, or all of
  them at once with **Collapse all** / **Expand all**. Which ones are
  collapsed is remembered in your browser.
- **Change one device's area** with the area picker on its row - the
  change is saved as soon as you pick.
- **Change many devices at once**: tick the devices (or an integration's
  heading to tick all of its devices, or the box in the column headings for
  every device shown), choose an area under **Move to area…** and press
  **Set area**. **Remove area** leaves the selected devices without one.
  Collapsing an integration unticks its devices, so a bulk change only
  ever touches devices you can see.
- **Filter** by device name, manufacturer, model, integration or area, and
  show only devices **without an area**, **with an area**, or **disabled**
  devices.
- **Sort** by any column by clicking its heading (devices stay grouped by
  integration).
- Each device's name opens its Home Assistant device page, and each
  integration's **Integration ↗** link opens the integration.

### Devices by area

The same devices, grouped by area instead: devices without an area first
(the ones still to sort out), then each area, floor by floor. The area
pickers, bulk controls, filters and collapsing work just as on the Devices
view, so you can move devices between areas from here too. Each area's
**Area ↗** link opens its Home Assistant area page.

### Areas

- **Create** an area: type its name (and optionally an icon such as
  `mdi:sofa` and its floor) and press **Create area** or Enter.
- **Rename** an area, or change its icon or floor: press **Edit** on its
  row, make the changes, and press **Save** or Enter (Escape cancels).
- **Delete** areas: tick them and press **Delete selected**, then confirm.
  Their devices and entities are left without an area, as when deleting
  an area on Home Assistant's own pages. This can't be undone.
- Each area's device count opens **Devices by area** at that area.

Floors are shown and can be picked when your Home Assistant has any; they
are created and managed on Home Assistant's own **Areas, labels & zones**
page.

## Requirements

Home Assistant 2024.4 or newer.

## Development

The panel is a single self-contained web component
(`custom_components/area_manager/frontend/area-manager-panel.js`) with no
build step. It talks to Home Assistant through the WebSocket commands in
`websocket_api.py`:

| Command | What it does |
| --- | --- |
| `area_manager/subscribe` | Sends every device, area and floor, then again after every change |
| `area_manager/assign` | Sets (or with `area_id: null`, clears) the area of one or more devices |
| `area_manager/area/create` | Creates an area (name, optional icon and floor) |
| `area_manager/area/update` | Renames an area, or changes its icon or floor |
| `area_manager/area/delete` | Deletes one or more areas |

All of them are admin-only. To run the tests:

```sh
pip install -r requirements_test.txt
pytest
```

# Area Manager

A Home Assistant custom integration that adds an **Area Manager** page to
the sidebar for putting your devices in the right areas quickly - one at a
time or dozens at once - and for managing the areas themselves. It does
the same for the categories of your automations, scripts and scenes, and
for your ZHA Zigbee groups.

Home Assistant's own pages make you open each device to change its area.
Area Manager lists every device on one page instead, grouped by
integration, with an area picker on every row and bulk controls for the
devices you select.

It changes nothing on its own: every change is one you make on the page,
and it goes through Home Assistant's own device, area, entity and
category registries, exactly as if you'd made it on the Settings pages.

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

The page has up to seven views, picked with the buttons at the top (or
the URL's `#devices`, `#by-area`, `#areas`, `#by-category`, `#categories`,
`#zigbee` and `#zigbee-groups`). The two Zigbee views only appear when ZHA
is set up. Everything on it updates live:
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

Every area, grouped by floor (in floor level order, areas without a floor
last), with each floor's area and device counts. Click a floor's heading to
collapse or expand it, or use **Collapse all** / **Expand all**; which ones
are collapsed is remembered in your browser. Without any floors, the areas
are one list.

- **Create** an area: type its name (and optionally an icon such as
  `mdi:sofa` and its floor) and press **Create area** or Enter.
- **Rename** an area, or change its icon or floor: press **Edit** on its
  row, make the changes, and press **Save** or Enter (Escape cancels).
- **Delete** areas: tick them (or a floor's heading to tick all of its
  areas) and press **Delete selected**, then confirm. Collapsing a floor
  unticks its areas.
  Their devices and entities are left without an area, as when deleting
  an area on Home Assistant's own pages. This can't be undone.
- Each area's device count opens **Devices by area** at that area.

Floors are shown and can be picked when your Home Assistant has any; they
are created and managed on Home Assistant's own **Areas, labels & zones**
page.

### By category

Your automations, scripts and scenes, each on its own tab, grouped by
category: uncategorized ones first, then each category. It works like
**Devices by area**:

- **Change one item's category** with the category picker on its row.
- **Change many at once**: tick them (or a category's heading, or the box
  in the column headings), choose a category under **Move to
  category…** and press **Set category**. **Remove category** leaves the
  selected ones uncategorized.
- **Collapse or expand** categories, **filter** by name, entity ID or
  category, show only the **uncategorized** ones or only those **with a
  category**, and **sort** by any column.
- Each item's name opens its Home Assistant details dialog.

As in Home Assistant, each kind has its own categories: an automation can
only go in an automation category, and so on. Automations, scripts and
scenes without a unique ID (for example ones written in YAML without an
`id`) are listed but can't have a category, as on Home Assistant's own
pages.

### Categories

The categories of your automations, scripts and scenes, one tab each,
managed like areas on the **Areas** view: **create** one (with an optional
icon), **Edit** it to rename it or change its icon, and **delete**
selected ones after confirming. Whatever was in a deleted category is left
uncategorized. Each category's count opens **By category** at that
category.

Blueprints aren't included: Home Assistant doesn't support categories for
blueprints.

### Zigbee by group

For ZHA (Zigbee Home Automation) users: every Zigbee device that can be in
a group, listed under each group it's in, with the devices in no group
first. Unlike areas, a device can be in several groups at once, so it's
listed once under each of them. Devices with more than one groupable
endpoint (such as a twin socket) are listed once per endpoint.

- **Add one device to a group** with the **Add to group…** picker on its
  row (it only offers groups the device isn't in yet), and **Remove** it
  from the group it's listed under with the button beside it.
- **Change many at once**: tick devices (or a group's heading, or the box
  in the column headings), then choose a group under **Add to group…** and
  press **Add to group**, or press **Remove from group** to take each
  ticked device out of the group it's listed under.
- **Collapse or expand** groups, **filter** by device, manufacturer, model,
  area or group, show only devices **not in a group** or **in a group**,
  and **sort** by any column.
- Each group's **Group ↗** link opens it on ZHA's own page.

ZHA doesn't announce group changes, so the list is fetched again when you
open the view, after every change you make here, and when anything else
on the page changes; **Refresh** fetches it straight away.

### Zigbee groups

ZHA's groups, with their group IDs and member counts: **create** a group
by name, and **delete** selected groups after confirming (their devices
are taken out of them and their group entities removed). ZHA has no way
to rename a group. Each group's count opens **Zigbee by group** at that
group.

All Zigbee changes go through ZHA's own commands, the same ones its Groups
page uses, so they're exactly what ZHA would do.

## Requirements

Home Assistant 2024.4 or newer.

## Development

The panel is a single self-contained web component
(`custom_components/area_manager/frontend/area-manager-panel.js`) with no
build step. It talks to Home Assistant through the WebSocket commands in
`websocket_api.py`:

| Command | What it does |
| --- | --- |
| `area_manager/subscribe` | Sends every device, area, floor, automation, script, scene and category, then again after every change |
| `area_manager/assign` | Sets (or with `area_id: null`, clears) the area of one or more devices |
| `area_manager/area/create` | Creates an area (name, optional icon and floor) |
| `area_manager/area/update` | Renames an area, or changes its icon or floor |
| `area_manager/area/delete` | Deletes one or more areas |
| `area_manager/categorize` | Sets (or with `category_id: null`, clears) the category of one or more automations, scripts or scenes |
| `area_manager/category/create` | Creates an automation, script or scene category (name, optional icon) |
| `area_manager/category/update` | Renames a category, or changes its icon |
| `area_manager/category/delete` | Deletes one or more categories |

The Zigbee views use ZHA's own commands (`zha/groups`,
`zha/devices/groupable`, `zha/group/add`, `zha/group/remove`,
`zha/group/members/add` and `zha/group/members/remove`) straight from the
panel.

All of them are admin-only. To run the tests:

```sh
pip install -r requirements_test.txt
pytest
```

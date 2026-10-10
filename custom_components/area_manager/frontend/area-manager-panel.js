// WP Area Manager - sidebar panel.
//
// A self-contained web component (no build step, no external libraries),
// laid out like WP Log Doctor's panel, with seven views:
//
//   #devices  Devices - every device, grouped by integration. Each group
//             collapses and expands, and each device's area can be changed
//             on its own row, or many at once: select them (or a whole
//             integration) and pick an area in the toolbar.
//   #by-area  Devices by area - the same devices grouped by area (devices
//             without one first), with the same per-row and bulk controls,
//             so devices can be moved between areas from here too.
//   #areas    Areas - every area, grouped by floor (when there are any
//             floors), to create, rename, change the icon or floor of,
//             and delete.
//   #by-category  By category - automations, scripts and scenes (one tab
//             each), grouped by category, with per-row and bulk category
//             controls like the device views.
//   #categories  Categories - the categories of automations, scripts and
//             scenes (one tab each), to create, rename, change the icon
//             of, and delete.
//
//   #zigbee   Zigbee by group - ZHA's groupable devices, listed under each
//             Zigbee group they're in (or "Not in a group"), to add to and
//             remove from groups, one at a time or in bulk.
//   #zigbee-groups  Zigbee groups - ZHA's groups, to create and delete.
//
// The category views are drawn by a separate element, AreaManagerCategories,
// and the Zigbee ones by AreaManagerZigbee (both near the end of this
// file), which the panel hands the data to.
//
// Everything comes from one WebSocket subscription (area_manager/subscribe)
// that sends every device, area, floor, automation, script, scene and
// category straight away and again after every change, wherever it was
// made, so the lists are always live.
//
// The page itself doesn't scroll: the view buttons, toolbar and column
// headings stay put and only the list scrolls (unless the window is too
// short for that, e.g. a phone held sideways).

const WS = {
  SUBSCRIBE: "area_manager/subscribe",
  ASSIGN: "area_manager/assign",
  AREA_CREATE: "area_manager/area/create",
  AREA_UPDATE: "area_manager/area/update",
  AREA_DELETE: "area_manager/area/delete",
  CATEGORIZE: "area_manager/categorize",
  CATEGORY_CREATE: "area_manager/category/create",
  CATEGORY_UPDATE: "area_manager/category/update",
  CATEGORY_DELETE: "area_manager/category/delete",
};

// The views drawn by AreaManagerCategories.
const CATEGORY_VIEWS = { "by-category": "items", categories: "manage" };
// The views drawn by AreaManagerZigbee (only offered when ZHA is set up).
const ZIGBEE_VIEWS = { zigbee: "members", "zigbee-groups": "groups" };

// Where the collapsed groups of each view are remembered, per browser.
const COLLAPSED_KEY = "area_manager.collapsed_groups";
// Group key for devices without an integration / an area.
const NONE = "";

const STYLE = `
:host {
  /* Fills the window; only the list scrolls, so everything above it and
     the column headings stay in view. */
  display: flex; flex-direction: column;
  height: 100vh; height: 100dvh;
  background: var(--primary-background-color, #fafafa);
  color: var(--primary-text-color, #212121);
  font-family: var(--paper-font-body1_-_font-family, var(--ha-font-family-body, Roboto, sans-serif));
  font-size: 14px;
}
* { box-sizing: border-box; }
.header {
  display: flex; align-items: center; gap: 8px;
  height: var(--header-height, 56px); padding: 0 16px;
  background: var(--app-header-background-color, var(--primary-color, #03a9f4));
  color: var(--app-header-text-color, #fff);
  flex: none;
}
.header h1 { font-size: 20px; font-weight: 400; margin: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.menu-btn { display: none; background: none; border: 0; color: inherit; font-size: 22px; cursor: pointer; padding: 4px 8px; }
:host([narrow]) .menu-btn { display: inline-block; }
.content {
  flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;
  width: 100%; max-width: 1400px; margin: 0 auto; padding: 16px;
}
.views { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; flex: none; }
area-manager-categories, area-manager-zigbee { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
area-manager-categories[hidden], area-manager-zigbee[hidden], .view[hidden] { display: none; }
.tabs { display: flex; border-bottom: 1px solid var(--divider-color, #e0e0e0); }
.tab {
  flex: 0 0 auto; padding: 12px 20px; background: none; border: 0;
  border-bottom: 2px solid transparent; color: var(--secondary-text-color, #727272);
  font: inherit; font-weight: 500; cursor: pointer;
}
.tab.active { color: var(--primary-color, #03a9f4); border-bottom-color: var(--primary-color, #03a9f4); }
.tab .count { opacity: 0.8; font-weight: 400; }
.view {
  font: inherit; font-weight: 500; padding: 8px 16px; border-radius: 18px; cursor: pointer;
  border: 1px solid var(--divider-color, #e0e0e0);
  background: var(--card-background-color, #fff); color: var(--primary-text-color, #212121);
}
.view.active { background: var(--primary-color, #03a9f4); border-color: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); }
.view .count { opacity: 0.8; font-weight: 400; }
.card {
  background: var(--card-background-color, #fff);
  border-radius: var(--ha-card-border-radius, 12px);
  border: 1px solid var(--divider-color, #e0e0e0);
  overflow: hidden;
  flex: 0 1 auto; min-height: 0; display: flex; flex-direction: column;
}
.card[hidden] { display: none; }
.card > .tabs, .card > .toolbar, .card > .confirm, .card > .footer { flex: none; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 16px; }
.toolbar + .toolbar { padding-top: 0; }
.toolbar.create { border-bottom: 1px solid var(--divider-color, #e0e0e0); padding-bottom: 12px; }
.toolbar.create + .toolbar { padding-top: 12px; }
input[type=search], input[type=text], select {
  font: inherit; padding: 8px 10px; border-radius: 6px;
  border: 1px solid var(--divider-color, #ccc);
  background: var(--secondary-background-color, #f5f5f5); color: inherit;
}
.toolbar input[type=search] { flex: 1 1 220px; min-width: 160px; }
.toolbar input[type=text] { flex: 1 1 180px; min-width: 140px; }
.toolbar input.icon-input { flex: 0 1 170px; min-width: 120px; }
.toolbar .selection { color: var(--secondary-text-color, #727272); white-space: nowrap; }
.spacer { flex: 1 1 auto; }
button.action {
  font: inherit; font-weight: 500; padding: 8px 14px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--primary-color, #03a9f4); background: var(--primary-color, #03a9f4);
  color: var(--text-primary-color, #fff); white-space: nowrap;
}
button.action.secondary { background: transparent; color: var(--primary-color, #03a9f4); }
button.action.danger { border-color: var(--error-color, #db4437); background: var(--error-color, #db4437); }
button.action.danger.secondary { background: transparent; color: var(--error-color, #db4437); }
button.action.small { padding: 4px 10px; font-size: 13px; }
button.action:disabled { opacity: 0.4; cursor: default; }
.confirm {
  display: none; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 16px;
  background: rgba(219, 68, 55, 0.1); border-top: 1px solid var(--divider-color, #e0e0e0);
}
.confirm.open { display: flex; }
.confirm span { flex: 1 1 240px; }
.table-wrap { flex: 0 1 auto; min-height: 0; overflow: auto; }
thead th {
  position: sticky; top: 0; z-index: 1;
  background: var(--card-background-color, #fff);
  box-shadow: inset 0 -1px 0 var(--divider-color, #e0e0e0);
}
table { width: 100%; border-collapse: separate; border-spacing: 0; }
th, td { text-align: left; padding: 8px 12px; border-top: 1px solid var(--divider-color, #e0e0e0); vertical-align: middle; }
th { font-weight: 500; color: var(--secondary-text-color, #727272); white-space: nowrap; user-select: none; }
th.sortable { cursor: pointer; }
th.sortable:hover { color: var(--primary-text-color, #212121); }
th .arrow { display: inline-block; width: 1em; }
td.check, th.check { width: 36px; padding-right: 0; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
th.num { text-align: right; }
td.name { min-width: 220px; word-break: break-word; }
td.area select { width: 100%; min-width: 150px; max-width: 260px; padding: 5px 8px; }
td.actions { white-space: nowrap; text-align: right; }
td.edit input[type=text] { width: 100%; min-width: 120px; padding: 6px 8px; }
td.edit select { padding: 5px 8px; }
tbody tr.row:hover { background: var(--secondary-background-color, rgba(0,0,0,0.03)); }
tbody tr.group td {
  background: var(--secondary-background-color, #f5f5f5); font-weight: 500; padding: 6px 12px;
}
tbody tr.group { cursor: pointer; user-select: none; }
tbody tr.group .caret { display: inline-block; width: 1.2em; color: var(--secondary-text-color, #727272); }
tbody tr.group ha-icon { --mdc-icon-size: 18px; margin-right: 6px; color: var(--secondary-text-color, #727272); }
tbody tr.group .group-link {
  display: inline-block; line-height: 1.5;
  margin-left: 12px; font-size: 12px; font-weight: 500; white-space: nowrap;
  padding: 1px 8px; border: 1px solid var(--primary-color, #03a9f4); border-radius: 10px;
}
tbody tr.group .group-link:hover { text-decoration: none; background: rgba(3, 169, 244, 0.1); }
tbody tr.group .group-count { font-weight: 400; color: var(--secondary-text-color, #727272); }
tbody tr.group .chip { margin-left: 8px; }
tbody tr.row.selected { background: rgba(3, 169, 244, 0.1); }
tbody tr.row.disabled td.name > a { opacity: 0.6; }
tbody tr.row.flash { animation: flash 1.2s ease-out; }
@keyframes flash { from { background: rgba(3, 169, 244, 0.3); } to { background: transparent; } }
.area-name { display: inline-flex; align-items: center; gap: 8px; }
.area-name ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color, #727272); }
input[type=checkbox] { width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary-color, #03a9f4); }
a { color: var(--primary-color, #03a9f4); text-decoration: none; }
a:hover { text-decoration: underline; }
.linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--primary-color, #03a9f4); cursor: pointer; }
.linkish:hover { text-decoration: underline; }
.sub { color: var(--secondary-text-color, #727272); font-size: 12px; }
.chip {
  display: inline-block; font-size: 11px; font-weight: 600; letter-spacing: 0.3px;
  padding: 1px 7px; border-radius: 10px; margin-left: 6px; text-transform: uppercase; white-space: nowrap;
  vertical-align: middle;
}
.chip.disabled { background: rgba(127, 127, 127, 0.15); color: var(--secondary-text-color, #727272); }
.chip.service { background: rgba(3, 169, 244, 0.15); color: var(--primary-color, #03a9f4); }
.chip.none { background: rgba(255, 152, 0, 0.18); color: var(--warning-color, #e68a00); }
.chip.floor { background: rgba(76, 175, 80, 0.15); color: var(--success-color, #43a047); }
.empty, .status { padding: 32px 16px; text-align: center; color: var(--secondary-text-color, #727272); }
.footer { padding: 8px 16px 12px; color: var(--secondary-text-color, #727272); font-size: 12px; }
.label { display: none; }

/* Phones: one card per row; the column headers become sort buttons. */
@media (max-width: 700px) {
  .content { padding: 8px; }
  table, thead, tbody { display: block; }
  thead tr {
    display: flex; flex-wrap: wrap; align-items: center; gap: 2px 14px;
    padding: 6px 12px; border-top: 1px solid var(--divider-color, #e0e0e0);
  }
  thead {
    position: sticky; top: 0; z-index: 1; background: var(--card-background-color, #fff);
    box-shadow: inset 0 -1px 0 var(--divider-color, #e0e0e0);
  }
  thead th { border: 0; padding: 6px 2px; position: static; box-shadow: none; }
  th.num { text-align: left; }
  tbody tr.row {
    display: grid; grid-template-columns: 30px 1fr; column-gap: 10px; row-gap: 4px;
    padding: 10px 12px; border-top: 1px solid var(--divider-color, #e0e0e0);
  }
  tbody tr.row td { border: 0; padding: 0; min-width: 0; grid-column: 2; text-align: left; }
  tbody tr.row td.check { grid-column: 1; grid-row: 1 / span 8; }
  tbody tr.row td.minor { font-size: 12px; color: var(--secondary-text-color, #727272); }
  tbody tr.row td.minor:empty { display: none; }
  tbody tr.row td.actions { text-align: left; }
  td.area select { max-width: none; }
  tbody tr.group { display: flex; align-items: center; }
  tbody tr.group td { display: block; }
  tbody tr.group td.check { width: auto; padding: 6px 0 6px 12px; }
  tbody tr.group td:not(.check) { flex: 1 1 auto; min-width: 0; line-height: 2; }
  tbody tr.group .group-link { margin-left: 0; margin-right: 6px; }
  tbody tr.group .group-count { margin-right: 8px; }
  .label { display: inline; }
  /* The tabs scroll sideways rather than run off the card. */
  .tabs { overflow-x: auto; scrollbar-width: none; }
  .tab { white-space: nowrap; padding: 12px 14px; }
}

/* Too short for a fixed top part (e.g. a phone held sideways): the whole
   page scrolls instead. */
@media (max-height: 520px) {
  :host { height: auto; min-height: 100vh; display: block; }
  .content, .card { display: block; }
  .table-wrap { overflow: visible; overflow-x: auto; }
  thead, thead th { position: static; }
}
`;

const TEMPLATE = `
<div class="header">
  <button class="menu-btn" title="Menu" data-action="menu">&#9776;</button>
  <h1>Area Manager</h1>
</div>
<div class="content">
  <div class="views">
    <button class="view" data-view="devices">Devices <span class="count" data-count="devices"></span></button>
    <button class="view" data-view="by-area">Devices by area <span class="count" data-count="unassigned"></span></button>
    <button class="view" data-view="areas">Areas <span class="count" data-count="areas"></span></button>
    <button class="view" data-view="by-category">By category <span class="count" data-count="uncategorized"></span></button>
    <button class="view" data-view="categories">Categories <span class="count" data-count="categories"></span></button>
    <button class="view" data-view="zigbee" data-zha hidden>Zigbee by group</button>
    <button class="view" data-view="zigbee-groups" data-zha hidden>Zigbee groups</button>
  </div>
  <area-manager-categories data-el="categories" hidden></area-manager-categories>
  <area-manager-zigbee data-el="zigbee" hidden></area-manager-zigbee>

  <div class="card" data-el="devices-card">
    <div class="toolbar">
      <input type="search" data-el="device-filter" placeholder="Filter by device, manufacturer, model, integration or area">
      <select data-el="device-kind" title="Show">
        <option value="">All devices</option>
        <option value="none">Without an area</option>
        <option value="assigned">With an area</option>
        <option value="disabled">Disabled devices</option>
      </select>
      <button class="action secondary" data-action="toggle-groups" title="Collapse or expand every group">Collapse all</button>
    </div>
    <div class="toolbar">
      <span class="selection" data-el="selection">No devices selected</span>
      <span class="spacer"></span>
      <select data-el="bulk-area" title="Area for the selected devices"></select>
      <button class="action" data-action="assign" disabled>Set area</button>
      <button class="action secondary" data-action="unassign" disabled title="Leave the selected devices without an area">Remove area</button>
    </div>
    <div class="table-wrap" data-el="device-scroll">
      <table>
        <thead><tr data-el="device-head"></tr></thead>
        <tbody data-el="device-body"></tbody>
      </table>
      <div class="status" data-el="device-status">Loading…</div>
    </div>
    <div class="footer" data-el="device-footer"></div>
  </div>

  <div class="card" data-el="areas-card" hidden>
    <div class="toolbar create">
      <input type="text" data-el="new-name" placeholder="New area name" maxlength="255">
      <input type="text" class="icon-input" data-el="new-icon" placeholder="Icon, e.g. mdi:sofa">
      <select data-el="new-floor" title="Floor"></select>
      <button class="action" data-action="create-area" disabled>Create area</button>
    </div>
    <div class="toolbar">
      <input type="search" data-el="area-filter" placeholder="Filter by area or floor">
      <button class="action secondary" data-action="toggle-floors" title="Collapse or expand every floor">Collapse all</button>
      <span class="spacer"></span>
      <button class="action danger secondary" data-action="ask-delete" disabled>Delete selected</button>
    </div>
    <div class="confirm" data-el="confirm">
      <span data-el="confirm-text"></span>
      <button class="action secondary" data-action="cancel-delete">Cancel</button>
      <button class="action danger" data-action="delete">Delete permanently</button>
    </div>
    <div class="table-wrap" data-el="area-scroll">
      <table>
        <thead><tr data-el="area-head"></tr></thead>
        <tbody data-el="area-body"></tbody>
      </table>
      <div class="status" data-el="area-status">Loading…</div>
    </div>
    <div class="footer" data-el="area-footer"></div>
  </div>
</div>
`;

// -- helpers ------------------------------------------------------------

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const cmp = (a, b) => collator.compare(a || "", b || "");

// Where an integration heading's link goes.
function integrationPage(domain) {
  return `/config/integrations/integration/${encodeURIComponent(domain)}`;
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key in node && typeof value !== "string") node[key] = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// Sorts by a column, then by name (always A-Z) for ties.
function byColumn(col, dir) {
  return (a, b) => col.cmp(a, b) * dir || cmp(a.name, b.name);
}

function words(filter) {
  return filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

// -- the device views ---------------------------------------------------

const DEVICE_COLUMNS = {
  name: { label: "Device", cls: "name", cmp: (a, b) => cmp(a.name, b.name) },
  integration: { label: "Integration", cls: "minor", cmp: (a, b) => cmp(a.integration, b.integration) },
  manufacturer: { label: "Manufacturer", cls: "minor", cmp: (a, b) => cmp(a.manufacturer, b.manufacturer) },
  model: { label: "Model", cls: "minor", cmp: (a, b) => cmp(a.model, b.model) },
  entities: { label: "Entities", cls: "num minor", num: true, firstDir: -1, cmp: (a, b) => a.entity_count - b.entity_count },
  area: { label: "Area", cls: "area", cmp: null }, // set per panel: sorts by area name
};

const DEVICE_VIEWS = {
  devices: {
    title: "Devices",
    columns: ["name", "manufacturer", "model", "entities", "area"],
    groupNoun: "integration",
    groupKey: (d) => d.domain || NONE,
  },
  "by-area": {
    title: "Devices by area",
    columns: ["name", "integration", "manufacturer", "model", "area"],
    groupNoun: "area",
    groupKey: (d) => d.area_id || NONE,
  },
};

const AREA_COLUMNS = {
  name: { label: "Area", cmp: (a, b) => cmp(a.name, b.name) },
  devices: { label: "Devices", cls: "num minor", num: true, firstDir: -1, cmp: null },
  actions: { label: "", cls: "actions" },
};

class AreaManagerPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._narrow = false;
    this._view = "devices";
    this._data = { devices: [], areas: [], floors: [] };
    this._loaded = false;
    this._error = null;
    this._unsub = null;
    this._subscribing = false;
    this._busy = false;
    this._state = {};
    for (const name of Object.keys(DEVICE_VIEWS)) {
      this._state[name] = {
        filter: "",
        kind: "",
        sort: { key: "name", dir: 1 },
        selected: new Set(),
        collapsed: this._loadCollapsed(name),
      };
    }
    this._state.areas = {
      filter: "",
      // Floors (by floor_id, "" for areas without one) whose areas are hidden.
      collapsed: this._loadCollapsed("areas"),
      sort: { key: "name", dir: 1 },
      selected: new Set(),
      // The area being edited, and what's been typed so far (kept when a
      // live update redraws the list mid-edit).
      editing: null,
      draft: {},
      focus: null,
      confirming: false,
    };
    this._indexData();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>${TEMPLATE}`;
    this._el = (name) => this.shadowRoot.querySelector(`[data-el="${name}"]`);
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
    this.shadowRoot.addEventListener("change", (ev) => this._onChange(ev));
    this.shadowRoot.addEventListener("keydown", (ev) => this._onKey(ev));
    this._el("device-filter").addEventListener("input", (ev) => {
      this._st().filter = ev.target.value;
      this._render();
    });
    this._el("area-filter").addEventListener("input", (ev) => {
      this._state.areas.filter = ev.target.value;
      this._render();
    });
    this._el("new-name").addEventListener("input", () => this._syncCreate());
    // Which edit field has the cursor, to put it back after a redraw;
    // none once anything else is focused.
    // The categories element handles its own events; it only asks the
    // panel to switch view (e.g. from a category's count to its items).
    this.shadowRoot.addEventListener("area-manager-view", (ev) => this._setView(ev.detail.view));
    this.shadowRoot.addEventListener("focusin", (ev) => {
      if (this._fromCategories(ev)) return;
      this._state.areas.focus = ev.composedPath()[0].dataset?.edit || null;
    });
    this._el("area-body").addEventListener("input", (ev) => {
      const target = ev.composedPath()[0];
      if (target.dataset?.edit) this._state.areas.draft[target.dataset.edit] = target.value;
    });
    this._onHash = () => this._applyHash();
  }

  set hass(hass) {
    this._hass = hass;
    this._el("categories").hass = hass;
    this._el("zigbee").hass = hass;
    if (this.isConnected) this._subscribe();
  }

  get hass() { return this._hass; }

  set narrow(value) {
    this._narrow = value;
    this.toggleAttribute("narrow", !!value);
  }

  get narrow() { return this._narrow; }

  set panel(value) { this._panel = value; }

  get panel() { return this._panel; }

  connectedCallback() {
    window.addEventListener("hashchange", this._onHash);
    this._applyHash(true);
    if (this._hass) this._subscribe();
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this._onHash);
    if (this._unsub) {
      try { this._unsub(); } catch (_err) { /* connection already gone */ }
      this._unsub = null;
    }
  }

  _st(name = this._view) { return this._state[name]; }

  _isDeviceView(name = this._view) { return !!DEVICE_VIEWS[name]; }

  _isCategoryView(name = this._view) { return !!CATEGORY_VIEWS[name]; }

  _isZigbeeView(name = this._view) { return !!ZIGBEE_VIEWS[name]; }

  // Events from the category and Zigbee elements are theirs to handle.
  _fromCategories(ev) {
    const path = ev.composedPath();
    return path.includes(this._el("categories")) || path.includes(this._el("zigbee"));
  }

  // -- data -------------------------------------------------------------

  async _subscribe() {
    if (this._unsub || this._subscribing || !this._hass) return;
    this._subscribing = true;
    try {
      this._unsub = await this._hass.connection.subscribeMessage(
        (msg) => this._onData(msg),
        { type: WS.SUBSCRIBE },
      );
      this._error = null;
    } catch (err) {
      this._error = `Couldn't load: ${err.message || err.code || err}`;
      this._render();
    } finally {
      this._subscribing = false;
    }
  }

  _onData(data) {
    this._data = data;
    this._loaded = true;
    this._indexData();
    // Forget selections of devices and areas that are gone.
    const deviceIds = new Set(data.devices.map((d) => d.id));
    for (const name of Object.keys(DEVICE_VIEWS)) {
      for (const id of [...this._state[name].selected]) {
        if (!deviceIds.has(id)) this._state[name].selected.delete(id);
      }
    }
    const areaSt = this._state.areas;
    for (const id of [...areaSt.selected]) {
      if (!this._areas.has(id)) areaSt.selected.delete(id);
    }
    if (areaSt.editing && !this._areas.has(areaSt.editing)) areaSt.editing = null;
    this._render();
  }

  _indexData() {
    this._areas = new Map(this._data.areas.map((a) => [a.area_id, a]));
    this._floors = new Map(this._data.floors.map((f) => [f.floor_id, f]));
    this._areaDeviceCounts = new Map();
    for (const d of this._data.devices) {
      if (d.area_id) this._areaDeviceCounts.set(d.area_id, (this._areaDeviceCounts.get(d.area_id) || 0) + 1);
    }
    DEVICE_COLUMNS.area.cmp = (a, b) => {
      // Devices without an area sort first.
      if (!a.area_id !== !b.area_id) return a.area_id ? 1 : -1;
      return cmp(this._areaName(a.area_id), this._areaName(b.area_id));
    };
    AREA_COLUMNS.devices.cmp = (a, b) =>
      (this._areaDeviceCounts.get(a.area_id) || 0) - (this._areaDeviceCounts.get(b.area_id) || 0);
  }

  _areaName(areaId) { return this._areas.get(areaId)?.name || ""; }

  _floorName(floorId) { return this._floors.get(floorId)?.name || ""; }

  // Floors in their level order, then by name.
  _sortedFloors() {
    return [...this._data.floors].sort((a, b) => {
      const la = a.level ?? Infinity;
      const lb = b.level ?? Infinity;
      return la !== lb ? (la < lb ? -1 : 1) : cmp(a.name, b.name);
    });
  }

  async _call(msg, success) {
    if (!this._hass) return null;
    this._busy = true;
    this._syncControls();
    try {
      const res = await this._hass.callWS(msg);
      if (success) this._toast(typeof success === "function" ? success(res) : success);
      return res || {};
    } catch (err) {
      this._toast(`Failed: ${err.message || err.code || err}`);
      return null;
    } finally {
      this._busy = false;
      this._syncControls();
    }
  }

  _toast(message) {
    this.dispatchEvent(new CustomEvent("hass-notification", {
      detail: { message }, bubbles: true, composed: true,
    }));
  }

  // -- collapsed groups, remembered per browser -------------------------

  _loadCollapsed(name) {
    try {
      const saved = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || "{}");
      return new Set(Array.isArray(saved[name]) ? saved[name] : []);
    } catch (_err) {
      return new Set();
    }
  }

  _saveCollapsed() {
    try {
      const saved = {};
      for (const name of [...Object.keys(DEVICE_VIEWS), "areas"]) {
        const collapsed = this._state[name].collapsed;
        if (collapsed.size) saved[name] = [...collapsed];
      }
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(saved));
    } catch (_err) { /* storage unavailable: just not remembered */ }
  }

  // Collapsing a floor deselects its areas, so a delete only ever touches
  // areas in view.
  _setFloorCollapsed(floor, collapsed) {
    const st = this._state.areas;
    if (collapsed) {
      st.collapsed.add(floor);
      for (const a of this._data.areas) {
        if (this._floorKey(a) === floor) st.selected.delete(a.area_id);
      }
    } else {
      st.collapsed.delete(floor);
    }
    this._saveCollapsed();
  }

  // The floor an area is grouped under: "" for none (or a floor that's gone).
  _floorKey(a) {
    return a.floor_id && this._floors.has(a.floor_id) ? a.floor_id : NONE;
  }

  // The areas shown and selectable: filtered in, and not on a collapsed floor.
  _shownAreas() {
    const st = this._state.areas;
    const grouped = this._data.floors.length > 0;
    return this._visibleAreas().filter((a) => !grouped || !st.collapsed.has(this._floorKey(a)));
  }

  // Collapsing a group deselects its devices: nothing hidden is selected,
  // so a bulk change only ever touches devices in view.
  _setCollapsed(group, collapsed) {
    const st = this._st();
    if (collapsed) {
      st.collapsed.add(group);
      const groupKey = DEVICE_VIEWS[this._view].groupKey;
      for (const d of this._data.devices) {
        if (groupKey(d) === group) st.selected.delete(d.id);
      }
    } else {
      st.collapsed.delete(group);
    }
    this._saveCollapsed();
  }

  // -- views ------------------------------------------------------------

  _applyHash(force = false) {
    const hash = window.location.hash.replace("#", "");
    const view = (DEVICE_VIEWS[hash] || CATEGORY_VIEWS[hash] || ZIGBEE_VIEWS[hash] || hash === "areas") ? hash : this._view;
    if (view !== this._view || force) {
      this._view = view;
      this._render();
    }
  }

  _setView(view) {
    if (view === this._view) return;
    history.replaceState(history.state, "", `#${view}`);
    this._view = view;
    this._render();
  }

  // -- rendering --------------------------------------------------------

  _render() {
    this._rendered = true;
    const devices = this._data.devices;
    for (const btn of this.shadowRoot.querySelectorAll(".view")) {
      btn.classList.toggle("active", btn.dataset.view === this._view);
    }
    const unassigned = devices.filter((d) => !d.area_id).length;
    this._el("devices-card").hidden = !this._isDeviceView();
    this._el("areas-card").hidden = this._view !== "areas";
    const categoriesEl = this._el("categories");
    categoriesEl.hidden = !this._isCategoryView();
    const zigbeeEl = this._el("zigbee");
    zigbeeEl.hidden = !this._isZigbeeView();
    // The Zigbee views only when ZHA is set up (or while one is open, so a
    // link to it still works before the data arrives).
    for (const btn of this.shadowRoot.querySelectorAll(".view[data-zha]")) {
      btn.hidden = !this._data.zha && btn.dataset.view !== this._view;
    }
    const items = this._data.categorizable || [];
    const uncategorized = items.filter((i) => i.editable && !i.category_id).length;
    const categoryCount = Object.values(this._data.categories || {}).reduce((sum, list) => sum + list.length, 0);
    const counts = this.shadowRoot.querySelectorAll("[data-count]");
    for (const span of counts) {
      if (!this._loaded) { span.textContent = ""; continue; }
      const key = span.dataset.count;
      const n = {
        devices: devices.length, unassigned, areas: this._data.areas.length,
        uncategorized, categories: categoryCount,
      }[key];
      if (key === "unassigned") span.textContent = n ? `(${n} without)` : "";
      else if (key === "uncategorized") span.textContent = n ? `(${n} uncategorized)` : "";
      else span.textContent = `(${n})`;
    }
    if (this._isZigbeeView()) {
      zigbeeEl.update({ mode: ZIGBEE_VIEWS[this._view], data: this._data });
      return;
    }
    if (this._isCategoryView()) {
      categoriesEl.update({
        mode: CATEGORY_VIEWS[this._view], data: this._data, loaded: this._loaded, error: this._error,
      });
      return;
    }
    if (this._isDeviceView()) this._renderDevices();
    else this._renderAreas();
    this._syncControls();
  }

  _areaOptions(select, current, { none = "No area", placeholder = null } = {}) {
    select.textContent = "";
    if (placeholder) select.append(el("option", { value: "__pick__", disabled: true }, placeholder));
    select.append(el("option", { value: "" }, none));
    const byFloor = new Map();
    for (const a of this._data.areas) {
      const key = a.floor_id && this._floors.has(a.floor_id) ? a.floor_id : NONE;
      if (!byFloor.has(key)) byFloor.set(key, []);
      byFloor.get(key).push(a);
    }
    const addAreas = (parent, areas) => {
      for (const a of areas.sort((x, y) => cmp(x.name, y.name))) {
        parent.append(el("option", { value: a.area_id }, a.name));
      }
    };
    const floors = this._sortedFloors().filter((f) => byFloor.has(f.floor_id));
    if (!floors.length) {
      addAreas(select, byFloor.get(NONE) || []);
    } else {
      for (const f of floors) {
        const group = el("optgroup", { label: f.name });
        addAreas(group, byFloor.get(f.floor_id));
        select.append(group);
      }
      if (byFloor.has(NONE)) {
        const group = el("optgroup", { label: "No floor" });
        addAreas(group, byFloor.get(NONE));
        select.append(group);
      }
    }
    const fallback = placeholder ? "__pick__" : "";
    select.value = current ?? fallback;
    // An area that's gone.
    if (select.value !== (current ?? fallback)) select.value = fallback;
  }

  _visibleDevices() {
    const st = this._st();
    const wanted = words(st.filter);
    return this._data.devices.filter((d) => {
      if (st.kind === "none" && d.area_id) return false;
      if (st.kind === "assigned" && !d.area_id) return false;
      if (st.kind === "disabled" && !d.disabled) return false;
      if (!wanted.length) return true;
      const text = [
        d.name, d.original_name, d.manufacturer, d.model, d.integration, d.domain,
        d.entry_title, this._areaName(d.area_id),
      ].join(" ").toLowerCase();
      return wanted.every((w) => text.includes(w));
    });
  }

  _visibleAreas() {
    const wanted = words(this._state.areas.filter);
    return this._data.areas.filter((a) => {
      if (!wanted.length) return true;
      const text = `${a.name} ${this._floorName(a.floor_id)}`.toLowerCase();
      return wanted.every((w) => text.includes(w));
    });
  }

  _groupLabel(key) {
    if (this._view === "by-area") return key ? this._areaName(key) : "No area";
    if (!key) return "No integration";
    return this._data.devices.find((d) => d.domain === key)?.integration || key;
  }

  // Groups in name order; devices without an area come first on the "by
  // area" view (they're the ones to sort out), "no integration" last.
  _groupOrder(a, b) {
    if (a === b) return 0;
    if (!a) return this._view === "by-area" ? -1 : 1;
    if (!b) return this._view === "by-area" ? 1 : -1;
    if (this._view === "by-area") {
      // By floor first, as Home Assistant's own Areas page does.
      const fa = this._floors.get(this._areas.get(a)?.floor_id);
      const fb = this._floors.get(this._areas.get(b)?.floor_id);
      if (fa !== fb) {
        if (!fa) return 1;
        if (!fb) return -1;
        const la = fa.level ?? Infinity;
        const lb = fb.level ?? Infinity;
        if (la !== lb) return la < lb ? -1 : 1;
        const byName = cmp(fa.name, fb.name);
        if (byName) return byName;
      }
    }
    return cmp(this._groupLabel(a), this._groupLabel(b));
  }

  _renderDevices() {
    const view = DEVICE_VIEWS[this._view];
    const st = this._st();
    this._el("device-filter").value = st.filter;
    this._el("device-kind").value = st.kind;

    // Head
    const head = this._el("device-head");
    head.textContent = "";
    const rows = this._visibleDevices();
    const shownRows = rows.filter((d) => !st.collapsed.has(view.groupKey(d)));
    const selectedShown = shownRows.filter((d) => st.selected.has(d.id)).length;
    const allCb = el("input", { type: "checkbox", dataset: { selectAll: "1" }, title: "Select every device shown" });
    allCb.checked = shownRows.length > 0 && selectedShown === shownRows.length;
    allCb.indeterminate = selectedShown > 0 && selectedShown < shownRows.length;
    allCb.disabled = !shownRows.length;
    head.append(el("th", { class: "check" }, allCb));
    for (const key of view.columns) {
      const col = DEVICE_COLUMNS[key];
      const th = el("th", { class: `sortable ${col.num ? "num" : ""}`, dataset: { sort: key } }, col.label);
      th.append(el("span", { class: "arrow" }, st.sort.key === key ? (st.sort.dir > 0 ? "▲" : "▼") : ""));
      head.append(th);
    }

    // Body: grouped, groups in order, devices sorted within each.
    const sortCol = DEVICE_COLUMNS[st.sort.key];
    const groups = new Map();
    for (const d of rows) {
      const key = view.groupKey(d);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    }
    const body = this._el("device-body");
    body.textContent = "";
    const frag = document.createDocumentFragment();
    const colSpan = view.columns.length;
    for (const key of [...groups.keys()].sort((a, b) => this._groupOrder(a, b))) {
      const members = groups.get(key).sort(byColumn(sortCol, st.sort.dir));
      const collapsed = st.collapsed.has(key);
      frag.append(this._groupRow(key, members, collapsed, colSpan));
      if (collapsed) continue;
      for (const d of members) frag.append(this._deviceRow(d, view));
    }
    body.append(frag);

    const status = this._el("device-status");
    status.hidden = this._loaded && !this._error && rows.length > 0;
    status.textContent = this._error || (!this._loaded ? "Loading…"
      : this._data.devices.length ? "No devices match." : "No devices yet.");

    const toggle = this.shadowRoot.querySelector('[data-action="toggle-groups"]');
    const allCollapsed = groups.size > 0 && [...groups.keys()].every((k) => st.collapsed.has(k));
    toggle.textContent = allCollapsed ? "Expand all" : "Collapse all";
    toggle.disabled = !groups.size;

    this._el("device-footer").textContent = this._loaded
      ? `Showing ${plural(rows.length, "device", "devices")} of ${this._data.devices.length}, in ${plural(groups.size, view.groupNoun, view.groupNoun === "area" ? "areas" : "integrations")}.`
      : "";
  }

  _groupRow(key, members, collapsed, colSpan) {
    const st = this._st();
    const byArea = this._view === "by-area";
    const tr = el("tr", {
      class: "group",
      dataset: { groupToggle: key },
      title: collapsed ? "Show these devices" : "Hide these devices",
    });
    const selected = members.filter((d) => st.selected.has(d.id)).length;
    const cb = el("input", {
      type: "checkbox",
      dataset: { groupSelect: key },
      title: collapsed ? "Expand to select these devices" : "Select all of these devices",
    });
    cb.checked = selected > 0 && selected === members.length;
    cb.indeterminate = selected > 0 && selected < members.length;
    cb.disabled = collapsed;
    tr.append(el("td", { class: "check" }, cb));
    const td = el("td", { colSpan });
    td.append(el("span", { class: "caret" }, collapsed ? "▸" : "▾"));
    const area = byArea && key ? this._areas.get(key) : null;
    if (area?.icon) td.append(el("ha-icon", { icon: area.icon }));
    td.append(this._groupLabel(key));
    td.append(el("span", { class: "group-count" }, ` (${members.length})`));
    if (byArea && !key) td.append(el("span", { class: "chip none" }, "Unassigned"));
    if (area?.floor_id && this._floors.has(area.floor_id)) {
      td.append(el("span", { class: "chip floor" }, this._floorName(area.floor_id)));
    }
    if (byArea && key) {
      td.append(el("a", {
        class: "group-link", href: `/config/areas/area/${encodeURIComponent(key)}`,
        dataset: { nav: "1" }, title: "Open this area in Home Assistant",
      }, "Area ↗"));
    } else if (!byArea && key) {
      td.append(el("a", {
        class: "group-link", href: integrationPage(key),
        dataset: { nav: "1" }, title: "Open this integration in Home Assistant",
      }, "Integration ↗"));
    }
    tr.append(td);
    return tr;
  }

  _deviceRow(d, view) {
    const st = this._st();
    const tr = el("tr", { class: "row", dataset: { id: d.id } });
    if (st.selected.has(d.id)) tr.classList.add("selected");
    if (d.disabled) tr.classList.add("disabled");
    const cb = el("input", { type: "checkbox", dataset: { row: d.id } });
    cb.checked = st.selected.has(d.id);
    tr.append(el("td", { class: "check" }, cb));
    for (const key of view.columns) {
      const col = DEVICE_COLUMNS[key];
      const td = el("td", { class: col.cls || "" });
      switch (key) {
        case "name": {
          td.append(el("a", {
            href: `/config/devices/device/${encodeURIComponent(d.id)}`,
            dataset: { nav: "1" }, title: "Open this device in Home Assistant",
          }, d.name));
          if (d.disabled) td.append(el("span", { class: "chip disabled" }, "Disabled"));
          if (d.service) td.append(el("span", { class: "chip service" }, "Service"));
          if (d.entry_title && d.entry_title !== d.name && this._view === "devices") {
            td.append(el("div", { class: "sub" }, d.entry_title));
          }
          break;
        }
        case "integration":
          td.append(el("span", { class: "label" }, "Integration: "), d.integration || "—");
          break;
        case "manufacturer":
          if (d.manufacturer) td.append(el("span", { class: "label" }, "Manufacturer: "), d.manufacturer);
          break;
        case "model":
          if (d.model) td.append(el("span", { class: "label" }, "Model: "), d.model);
          break;
        case "entities":
          td.append(el("span", { class: "label" }, "Entities: "), String(d.entity_count));
          break;
        case "area": {
          const select = el("select", { dataset: { assign: d.id }, title: "This device's area" });
          this._areaOptions(select, d.area_id || "");
          select.disabled = this._busy;
          td.append(select);
          break;
        }
        default:
          break;
      }
      tr.append(td);
    }
    return tr;
  }

  _renderAreas() {
    const st = this._state.areas;
    this._el("area-filter").value = st.filter;
    const floorSelect = this._el("new-floor");
    const keepFloor = floorSelect.value;
    floorSelect.textContent = "";
    floorSelect.append(el("option", { value: "" }, "No floor"));
    for (const f of this._sortedFloors()) floorSelect.append(el("option", { value: f.floor_id }, f.name));
    floorSelect.value = this._floors?.has(keepFloor) ? keepFloor : "";
    floorSelect.hidden = !this._data.floors.length;

    // Grouped by floor, in level order, areas without a floor last; a
    // flat list when there are no floors at all.
    const grouped = this._data.floors.length > 0;
    const rows = this._visibleAreas().sort(byColumn(AREA_COLUMNS[st.sort.key], st.sort.dir));
    const shown = this._shownAreas();

    const columns = ["name", "devices", "actions"];
    const head = this._el("area-head");
    head.textContent = "";
    const selectedShown = shown.filter((a) => st.selected.has(a.area_id)).length;
    const allCb = el("input", { type: "checkbox", dataset: { selectAllAreas: "1" }, title: "Select every area shown" });
    allCb.checked = shown.length > 0 && selectedShown === shown.length;
    allCb.indeterminate = selectedShown > 0 && selectedShown < shown.length;
    allCb.disabled = !shown.length;
    head.append(el("th", { class: "check" }, allCb));
    for (const key of columns) {
      const col = AREA_COLUMNS[key];
      if (!col.cmp) {
        head.append(el("th", {}, col.label));
        continue;
      }
      const th = el("th", { class: `sortable ${col.num ? "num" : ""}`, dataset: { sortArea: key } }, col.label);
      th.append(el("span", { class: "arrow" }, st.sort.key === key ? (st.sort.dir > 0 ? "▲" : "▼") : ""));
      head.append(th);
    }

    const body = this._el("area-body");
    body.textContent = "";
    const frag = document.createDocumentFragment();
    const areaRow = (a) => (st.editing === a.area_id ? this._areaEditRow(a, columns) : this._areaRow(a, columns));
    if (grouped) {
      const byFloor = new Map();
      for (const a of rows) {
        const key = this._floorKey(a);
        if (!byFloor.has(key)) byFloor.set(key, []);
        byFloor.get(key).push(a);
      }
      const order = [...this._sortedFloors().map((f) => f.floor_id), NONE];
      for (const key of order) {
        const members = byFloor.get(key);
        if (!members) continue;
        const collapsed = st.collapsed.has(key);
        frag.append(this._floorRow(key, members, collapsed, columns.length));
        if (!collapsed) for (const a of members) frag.append(areaRow(a));
      }
    } else {
      for (const a of rows) frag.append(areaRow(a));
    }
    body.append(frag);

    const toggle = this.shadowRoot.querySelector('[data-action="toggle-floors"]');
    const floorKeys = new Set(rows.map((a) => this._floorKey(a)));
    toggle.hidden = !grouped;
    toggle.disabled = !floorKeys.size;
    toggle.textContent = floorKeys.size && [...floorKeys].every((k) => st.collapsed.has(k))
      ? "Expand all" : "Collapse all";

    const status = this._el("area-status");
    status.hidden = this._loaded && !this._error && rows.length > 0;
    status.textContent = this._error || (!this._loaded ? "Loading…"
      : this._data.areas.length ? "No areas match." : "No areas yet. Create one above.");

    const devicesInAreas = this._data.devices.filter((d) => d.area_id).length;
    this._el("area-footer").textContent = this._loaded
      ? `${plural(this._data.areas.length, "area", "areas")}, with ${plural(devicesInAreas, "device", "devices")} between them; ${plural(this._data.devices.length - devicesInAreas, "device", "devices")} without an area.`
      : "";
    // Keep the cursor in the field being typed in across redraws.
    if (st.editing && st.focus) {
      const input = body.querySelector(`[data-edit="${st.focus}"]`);
      if (input) {
        input.focus();
        if (st.focus === "name" && st.draft.name === undefined) input.select();
      }
    }
  }

  _floorRow(key, members, collapsed, colSpan) {
    const st = this._state.areas;
    const tr = el("tr", {
      class: "group",
      dataset: { floorToggle: key },
      title: collapsed ? "Show this floor's areas" : "Hide this floor's areas",
    });
    const selected = members.filter((a) => st.selected.has(a.area_id)).length;
    const cb = el("input", {
      type: "checkbox",
      dataset: { floorSelect: key },
      title: collapsed ? "Expand to select these areas" : "Select all of this floor's areas",
    });
    cb.checked = selected > 0 && selected === members.length;
    cb.indeterminate = selected > 0 && selected < members.length;
    cb.disabled = collapsed;
    tr.append(el("td", { class: "check" }, cb));
    const td = el("td", { colSpan });
    td.append(el("span", { class: "caret" }, collapsed ? "▸" : "▾"));
    const floor = this._floors.get(key);
    if (floor?.icon) td.append(el("ha-icon", { icon: floor.icon }));
    td.append(floor ? floor.name : "No floor");
    td.append(el("span", { class: "group-count" }, ` (${members.length})`));
    const devices = members.reduce((sum, a) => sum + (this._areaDeviceCounts.get(a.area_id) || 0), 0);
    td.append(el("span", { class: "group-count" }, ` · ${plural(devices, "device", "devices")}`));
    tr.append(td);
    return tr;
  }

  _areaRow(a, columns) {
    const st = this._state.areas;
    const tr = el("tr", { class: "row", dataset: { areaId: a.area_id } });
    if (st.selected.has(a.area_id)) tr.classList.add("selected");
    const cb = el("input", { type: "checkbox", dataset: { areaRow: a.area_id } });
    cb.checked = st.selected.has(a.area_id);
    tr.append(el("td", { class: "check" }, cb));
    for (const key of columns) {
      const td = el("td", { class: AREA_COLUMNS[key].cls || "" });
      switch (key) {
        case "name": {
          const name = el("span", { class: "area-name" });
          if (a.icon) name.append(el("ha-icon", { icon: a.icon }));
          name.append(el("a", {
            href: `/config/areas/area/${encodeURIComponent(a.area_id)}`,
            dataset: { nav: "1" }, title: "Open this area in Home Assistant",
          }, a.name));
          td.append(name);
          break;
        }
        case "devices": {
          const n = this._areaDeviceCounts.get(a.area_id) || 0;
          td.append(el("button", {
            class: "linkish", dataset: { showArea: a.area_id }, title: "Show this area's devices",
          }, plural(n, "device", "devices")));
          break;
        }
        case "actions":
          td.append(el("button", {
            class: "action secondary small", dataset: { editArea: a.area_id },
            title: "Rename, or change the icon or floor",
          }, "Edit"));
          break;
        default:
          break;
      }
      tr.append(td);
    }
    return tr;
  }

  _areaEditRow(a, columns) {
    const draft = this._state.areas.draft;
    const tr = el("tr", { class: "row editing", dataset: { areaId: a.area_id } });
    tr.append(el("td", { class: "check" }));
    for (const key of columns) {
      const td = el("td", { class: `edit ${AREA_COLUMNS[key].cls || ""}` });
      switch (key) {
        case "name":
          td.append(
            el("input", {
              type: "text", value: draft.name ?? a.name, dataset: { edit: "name" }, maxlength: "255", placeholder: "Name",
            }),
            el("input", {
              type: "text", value: draft.icon ?? (a.icon || ""), dataset: { edit: "icon" },
              placeholder: "Icon, e.g. mdi:sofa", style: "margin-top: 6px",
            }),
          );
          if (this._data.floors.length) {
            const select = el("select", { dataset: { edit: "floor" }, title: "Floor", style: "margin-top: 6px" });
            select.append(el("option", { value: "" }, "No floor"));
            for (const f of this._sortedFloors()) select.append(el("option", { value: f.floor_id }, f.name));
            select.value = draft.floor ?? this._floorKey(a);
            if (select.value !== (draft.floor ?? select.value)) select.value = "";
            td.append(select);
          }
          break;
        case "devices":
          td.append(plural(this._areaDeviceCounts.get(a.area_id) || 0, "device", "devices"));
          break;
        case "actions":
          td.append(
            el("button", { class: "action small", dataset: { saveArea: a.area_id } }, "Save"),
            " ",
            el("button", { class: "action secondary small", dataset: { cancelEdit: "1" } }, "Cancel"),
          );
          break;
        default:
          break;
      }
      tr.append(td);
    }
    return tr;
  }

  // Enables and labels the toolbar buttons to match the selection.
  _syncControls() {
    if (this._isCategoryView() || this._isZigbeeView()) return;
    if (this._isDeviceView()) {
      const ids = this._selectedDeviceIds();
      const n = ids.length;
      this._el("selection").textContent = n
        ? `${plural(n, "device", "devices")} selected`
        : "No devices selected";
      const bulk = this._el("bulk-area");
      const keep = bulk.value;
      this._areaOptions(bulk, keep && keep !== "__pick__" && this._areas?.has(keep) ? keep : null, {
        none: "No area", placeholder: "Move to area…",
      });
      const picked = bulk.value !== "__pick__";
      const assign = this.shadowRoot.querySelector('[data-action="assign"]');
      assign.disabled = this._busy || !n || !picked;
      assign.textContent = n ? `Set area of ${plural(n, "device", "devices")}` : "Set area";
      const unassign = this.shadowRoot.querySelector('[data-action="unassign"]');
      const withArea = new Set(this._data.devices.filter((d) => d.area_id).map((d) => d.id));
      unassign.disabled = this._busy || !ids.some((id) => withArea.has(id));
      for (const select of this.shadowRoot.querySelectorAll("select[data-assign]")) select.disabled = this._busy;
    } else {
      const st = this._state.areas;
      this._syncCreate();
      const del = this.shadowRoot.querySelector('[data-action="ask-delete"]');
      del.disabled = this._busy || !st.selected.size;
      del.textContent = st.selected.size ? `Delete ${plural(st.selected.size, "area", "areas")}` : "Delete selected";
      const confirm = this._el("confirm");
      if (!st.selected.size) st.confirming = false;
      confirm.classList.toggle("open", st.confirming);
      if (st.confirming) {
        const ids = [...st.selected];
        const names = ids.map((id) => this._areaName(id)).sort(cmp);
        const devices = ids.reduce((sum, id) => sum + (this._areaDeviceCounts.get(id) || 0), 0);
        const shown = names.length > 5 ? `${names.slice(0, 5).join(", ")} and ${names.length - 5} more` : names.join(", ");
        this._el("confirm-text").textContent =
          `Delete ${plural(ids.length, "area", "areas")} (${shown})?`
          + (devices ? ` ${plural(devices, "device", "devices")} in them will be left without an area.` : "")
          + " This can't be undone.";
      }
      this.shadowRoot.querySelector('[data-action="delete"]').disabled = this._busy;
    }
  }

  _syncCreate() {
    const create = this.shadowRoot.querySelector('[data-action="create-area"]');
    create.disabled = this._busy || !this._el("new-name").value.trim();
  }

  // The selected devices still in view (filtered in, not collapsed).
  _selectedDeviceIds() {
    const st = this._st();
    if (!st.selected.size) return [];
    const groupKey = DEVICE_VIEWS[this._view].groupKey;
    return this._visibleDevices()
      .filter((d) => st.selected.has(d.id) && !st.collapsed.has(groupKey(d)))
      .map((d) => d.id);
  }

  // -- events -----------------------------------------------------------

  async _onClick(ev) {
    if (this._fromCategories(ev)) return;
    const path = ev.composedPath();
    const find = (key) => path.find((n) => n.dataset && n.dataset[key] !== undefined);

    const link = find("nav");
    if (link) {
      if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button) return;
      ev.preventDefault();
      history.pushState(null, "", link.getAttribute("href"));
      window.dispatchEvent(new CustomEvent("location-changed"));
      return;
    }
    const viewBtn = find("view");
    if (viewBtn) {
      this._setView(viewBtn.dataset.view);
      return;
    }
    // Checkboxes are handled on change; a click on one inside a group
    // heading mustn't also collapse the group.
    if (path[0]?.type === "checkbox" || path[0]?.tagName === "SELECT") return;

    const action = find("action")?.dataset.action;
    if (action === "menu") {
      this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
      return;
    }
    if (this._isDeviceView()) {
      await this._onDeviceClick(ev, find, action);
    } else {
      await this._onAreaClick(ev, find, action);
    }
  }

  async _onDeviceClick(ev, find, action) {
    const st = this._st();
    const group = find("groupToggle");
    if (group) {
      const key = group.dataset.groupToggle;
      this._setCollapsed(key, !st.collapsed.has(key));
      this._render();
      return;
    }
    const sortTh = find("sort");
    if (sortTh) {
      const key = sortTh.dataset.sort;
      if (st.sort.key === key) st.sort.dir = -st.sort.dir;
      else st.sort = { key, dir: DEVICE_COLUMNS[key].firstDir || 1 };
      this._render();
      return;
    }
    switch (action) {
      case "toggle-groups": {
        const groupKey = DEVICE_VIEWS[this._view].groupKey;
        const keys = new Set(this._visibleDevices().map(groupKey));
        const allCollapsed = [...keys].every((k) => st.collapsed.has(k));
        for (const k of keys) this._setCollapsed(k, !allCollapsed);
        this._render();
        break;
      }
      case "assign": {
        const areaId = this._el("bulk-area").value;
        if (areaId === "__pick__") return;
        await this._assign(this._selectedDeviceIds(), areaId || null, true);
        break;
      }
      case "unassign":
        await this._assign(this._selectedDeviceIds(), null, true);
        break;
      default:
        break;
    }
  }

  async _assign(ids, areaId, clearSelection) {
    if (!ids.length) return;
    const where = areaId ? this._areaName(areaId) : null;
    const res = await this._call(
      { type: WS.ASSIGN, device_ids: ids, area_id: areaId },
      (r) => {
        const n = r?.updated ?? ids.length;
        if (!n) return where ? `Already in ${where}` : "Already without an area";
        return where
          ? `Moved ${plural(n, "device", "devices")} to ${where}`
          : `Removed the area of ${plural(n, "device", "devices")}`;
      },
    );
    if (res && clearSelection) {
      this._st().selected.clear();
      this._render();
    }
  }

  async _onAreaClick(ev, find, action) {
    const st = this._state.areas;
    const floorRow = find("floorToggle");
    if (floorRow) {
      const key = floorRow.dataset.floorToggle;
      this._setFloorCollapsed(key, !st.collapsed.has(key));
      this._render();
      return;
    }
    if (action === "toggle-floors") {
      const keys = new Set(this._visibleAreas().map((a) => this._floorKey(a)));
      const allCollapsed = [...keys].every((k) => st.collapsed.has(k));
      for (const k of keys) this._setFloorCollapsed(k, !allCollapsed);
      this._render();
      return;
    }
    const sortTh = find("sortArea");
    if (sortTh) {
      const key = sortTh.dataset.sortArea;
      if (st.sort.key === key) st.sort.dir = -st.sort.dir;
      else st.sort = { key, dir: AREA_COLUMNS[key].firstDir || 1 };
      this._render();
      return;
    }
    const show = find("showArea");
    if (show) {
      this._showAreaDevices(show.dataset.showArea);
      return;
    }
    const edit = find("editArea");
    if (edit) {
      this._startEdit(edit.dataset.editArea);
      return;
    }
    if (find("cancelEdit")) {
      this._stopEdit();
      return;
    }
    const save = find("saveArea");
    if (save) {
      await this._saveArea(save.dataset.saveArea);
      return;
    }
    switch (action) {
      case "create-area":
        await this._createArea();
        break;
      case "ask-delete":
        st.confirming = true;
        this._syncControls();
        break;
      case "cancel-delete":
        st.confirming = false;
        this._syncControls();
        break;
      case "delete": {
        const ids = [...st.selected];
        const res = await this._call(
          { type: WS.AREA_DELETE, area_ids: ids },
          (r) => `Deleted ${plural(r?.deleted ?? ids.length, "area", "areas")}`,
        );
        if (res) {
          st.selected.clear();
          st.confirming = false;
          this._render();
        }
        break;
      }
      default:
        break;
    }
  }

  _startEdit(areaId) {
    const st = this._state.areas;
    st.editing = areaId;
    st.draft = {};
    st.focus = "name";
    this._render();
  }

  _stopEdit() {
    const st = this._state.areas;
    st.editing = null;
    st.draft = {};
    st.focus = null;
    this._render();
  }

  // Opens Devices by area at this area, expanded and not filtered out.
  _showAreaDevices(areaId) {
    const st = this._state["by-area"];
    st.filter = "";
    st.kind = "";
    st.collapsed.delete(areaId);
    this._saveCollapsed();
    this._setView("by-area");
    requestAnimationFrame(() => {
      const row = [...this.shadowRoot.querySelectorAll("tr.group")]
        .find((tr) => tr.dataset.groupToggle === areaId);
      if (!row) return;
      row.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  async _createArea() {
    const nameInput = this._el("new-name");
    const name = nameInput.value.trim();
    if (!name) return;
    const icon = this._el("new-icon").value.trim();
    const floor = this._el("new-floor").value;
    const res = await this._call(
      { type: WS.AREA_CREATE, name, icon: icon || null, floor_id: floor || null },
      `Created ${name}`,
    );
    if (res) {
      nameInput.value = "";
      this._el("new-icon").value = "";
      this._syncCreate();
      nameInput.focus();
    }
  }

  async _saveArea(areaId) {
    const area = this._areas.get(areaId);
    const row = this.shadowRoot.querySelector(`tr.editing[data-area-id="${CSS.escape(areaId)}"]`);
    if (!area || !row) return;
    const name = row.querySelector('[data-edit="name"]').value.trim();
    if (!name) {
      this._toast("An area needs a name");
      return;
    }
    const msg = { type: WS.AREA_UPDATE, area_id: areaId };
    if (name !== area.name) msg.name = name;
    const icon = row.querySelector('[data-edit="icon"]').value.trim() || null;
    if (icon !== (area.icon || null)) msg.icon = icon;
    const floorSelect = row.querySelector('[data-edit="floor"]');
    if (floorSelect) {
      const floor = floorSelect.value || null;
      if (floor !== (area.floor_id || null)) msg.floor_id = floor;
    }
    if (Object.keys(msg).length > 2) {
      const res = await this._call(msg, msg.name ? `Renamed ${area.name} to ${name}` : `Saved ${name}`);
      if (!res) return;
    }
    this._stopEdit();
  }

  async _onChange(ev) {
    if (this._fromCategories(ev)) return;
    const target = ev.composedPath()[0];
    const ds = target.dataset || {};
    if (target === this._el("device-kind")) {
      this._st().kind = target.value;
      this._render();
      return;
    }
    if (target === this._el("bulk-area")) {
      this._syncControls();
      return;
    }
    if (ds.edit === "floor") {
      this._state.areas.draft.floor = target.value;
      return;
    }
    if (ds.assign !== undefined) {
      // One device, straight from its row.
      await this._assign([ds.assign], target.value || null, false);
      return;
    }
    if (this._isDeviceView()) {
      const st = this._st();
      const view = DEVICE_VIEWS[this._view];
      if (ds.row !== undefined) {
        if (target.checked) st.selected.add(ds.row);
        else st.selected.delete(ds.row);
      } else if (ds.groupSelect !== undefined) {
        for (const d of this._visibleDevices()) {
          if (view.groupKey(d) !== ds.groupSelect) continue;
          if (target.checked) st.selected.add(d.id);
          else st.selected.delete(d.id);
        }
      } else if (ds.selectAll !== undefined) {
        for (const d of this._visibleDevices()) {
          if (st.collapsed.has(view.groupKey(d))) continue;
          if (target.checked) st.selected.add(d.id);
          else st.selected.delete(d.id);
        }
      } else {
        return;
      }
      this._render();
      return;
    }
    const st = this._state.areas;
    if (ds.areaRow !== undefined) {
      if (target.checked) st.selected.add(ds.areaRow);
      else st.selected.delete(ds.areaRow);
    } else if (ds.selectAllAreas !== undefined) {
      for (const a of this._shownAreas()) {
        if (target.checked) st.selected.add(a.area_id);
        else st.selected.delete(a.area_id);
      }
    } else if (ds.floorSelect !== undefined) {
      for (const a of this._visibleAreas()) {
        if (this._floorKey(a) !== ds.floorSelect) continue;
        if (target.checked) st.selected.add(a.area_id);
        else st.selected.delete(a.area_id);
      }
    } else {
      return;
    }
    this._render();
  }

  async _onKey(ev) {
    if (this._fromCategories(ev)) return;
    const target = ev.composedPath()[0];
    if (ev.key === "Enter" && (target === this._el("new-name") || target === this._el("new-icon"))) {
      ev.preventDefault();
      await this._createArea();
      return;
    }
    const editing = this._state.areas.editing;
    if (editing && target.dataset?.edit !== undefined) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        await this._saveArea(editing);
      } else if (ev.key === "Escape") {
        this._stopEdit();
      }
    }
  }
}

// -- the category views -------------------------------------------------
//
// AreaManagerCategories draws the "By category" (mode "items") and
// "Categories" (mode "manage") views: a tab for each kind of thing with
// categories (automations, scripts, scenes), then either their items
// grouped by category, with per-row and bulk category controls like the
// device views, or the categories themselves, to create, rename, change the
// icon of and delete, like the Areas view. The panel hands it the snapshot
// (update()); it makes its changes over the WebSocket itself.

const CATEGORY_SCOPES = {
  automation: { label: "Automations", one: "automation", many: "automations", page: "/config/automation/dashboard" },
  script: { label: "Scripts", one: "script", many: "scripts", page: "/config/script/dashboard" },
  scene: { label: "Scenes", one: "scene", many: "scenes", page: "/config/scene/dashboard" },
};
// The tab last picked, and the collapsed categories of each tab, per browser.
const SCOPE_KEY = "area_manager.category_scope";
const CATEGORY_COLLAPSED_KEY = "area_manager.collapsed_categories";

const ITEM_COLUMNS = {
  name: { label: "Name", cls: "name", cmp: (a, b) => cmp(a.name, b.name) },
  entity: { label: "Entity ID", cls: "minor", cmp: (a, b) => cmp(a.entity_id, b.entity_id) },
  category: { label: "Category", cls: "area", cmp: null }, // set per element: sorts by category name
};

const CATEGORY_COLUMNS = {
  name: { label: "Category", cmp: (a, b) => cmp(a.name, b.name) },
  items: { label: "Used by", cls: "num minor", num: true, firstDir: -1, cmp: null }, // set per element
  actions: { label: "", cls: "actions" },
};

const CATEGORY_STYLE = `
:host {
  display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0;
  height: auto; background: transparent;
}
:host([hidden]) { display: none; }
.mode { flex: none; }
.mode[hidden] { display: none; }
@media (max-height: 520px) {
  :host { display: block; min-height: 0; }
}
`;

const CATEGORY_TEMPLATE = `
<div class="card">
  <div class="tabs" data-el="tabs"></div>
  <div class="mode" data-mode="items">
    <div class="toolbar">
      <input type="search" data-el="item-filter">
      <select data-el="item-kind" title="Show">
        <option value="">All</option>
        <option value="none">Uncategorized</option>
        <option value="assigned">With a category</option>
      </select>
      <button class="action secondary" data-action="toggle-groups" title="Collapse or expand every category">Collapse all</button>
    </div>
    <div class="toolbar">
      <span class="selection" data-el="selection"></span>
      <span class="spacer"></span>
      <select data-el="bulk-category" title="Category for the selected items"></select>
      <button class="action" data-action="assign" disabled>Set category</button>
      <button class="action secondary" data-action="unassign" disabled>Remove category</button>
    </div>
  </div>
  <div class="mode" data-mode="manage">
    <div class="toolbar create">
      <input type="text" data-el="new-name" placeholder="New category name" maxlength="255">
      <input type="text" class="icon-input" data-el="new-icon" placeholder="Icon, e.g. mdi:lightbulb">
      <button class="action" data-action="create" disabled>Create category</button>
    </div>
    <div class="toolbar">
      <input type="search" data-el="category-filter" placeholder="Filter by category">
      <span class="spacer"></span>
      <button class="action danger secondary" data-action="ask-delete" disabled>Delete selected</button>
    </div>
    <div class="confirm" data-el="confirm">
      <span data-el="confirm-text"></span>
      <button class="action secondary" data-action="cancel-delete">Cancel</button>
      <button class="action danger" data-action="delete">Delete permanently</button>
    </div>
  </div>
  <div class="table-wrap" data-el="scroll">
    <table>
      <thead><tr data-el="head"></tr></thead>
      <tbody data-el="body"></tbody>
    </table>
    <div class="status" data-el="status">Loading…</div>
  </div>
  <div class="footer" data-el="footer"></div>
</div>
`;

class AreaManagerCategories extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._mode = "items";
    this._data = { categories: {}, categorizable: [] };
    this._loaded = false;
    this._error = null;
    this._busy = false;
    let scope = null;
    try { scope = localStorage.getItem(SCOPE_KEY); } catch (_err) { /* not remembered */ }
    this._scope = CATEGORY_SCOPES[scope] ? scope : "automation";
    const collapsed = this._loadCollapsed();
    this._state = {};
    for (const name of Object.keys(CATEGORY_SCOPES)) {
      this._state[name] = {
        items: {
          filter: "",
          kind: "",
          sort: { key: "name", dir: 1 },
          selected: new Set(),
          collapsed: new Set(collapsed[name] || []),
        },
        manage: {
          filter: "",
          sort: { key: "name", dir: 1 },
          selected: new Set(),
          // As on the Areas view: the category being edited, what's been
          // typed so far and which field has the cursor, kept across redraws.
          editing: null,
          draft: {},
          focus: null,
          confirming: false,
        },
      };
    }
    this._index();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>${STYLE}${CATEGORY_STYLE}</style>${CATEGORY_TEMPLATE}`;
    this._el = (name) => this.shadowRoot.querySelector(`[data-el="${name}"]`);
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
    this.shadowRoot.addEventListener("change", (ev) => this._onChange(ev));
    this.shadowRoot.addEventListener("keydown", (ev) => this._onKey(ev));
    this.shadowRoot.addEventListener("focusin", (ev) => {
      this._ms().focus = ev.composedPath()[0].dataset?.edit || null;
    });
    this._el("body").addEventListener("input", (ev) => {
      const target = ev.composedPath()[0];
      if (target.dataset?.edit) this._ms().draft[target.dataset.edit] = target.value;
    });
    this._el("item-filter").addEventListener("input", (ev) => {
      this._is().filter = ev.target.value;
      this._render();
    });
    this._el("category-filter").addEventListener("input", (ev) => {
      this._ms().filter = ev.target.value;
      this._render();
    });
    this._el("new-name").addEventListener("input", () => this._syncControls());
  }

  set hass(hass) { this._hass = hass; }

  get hass() { return this._hass; }

  // Called by the panel whenever its data or the view changes.
  update({ mode, data, loaded, error }) {
    if (mode !== this._mode) {
      // Nothing half-done carries over from the other view.
      this._ms().confirming = false;
      this._mode = mode;
    }
    this._data = { categories: data.categories || {}, categorizable: data.categorizable || [] };
    this._loaded = loaded;
    this._error = error;
    this._index();
    // Forget selections of what's gone.
    for (const scope of Object.keys(CATEGORY_SCOPES)) {
      const ids = new Set(this._items(scope).filter((i) => i.editable).map((i) => i.entity_id));
      const cats = this._categories.get(scope);
      const st = this._state[scope];
      for (const id of [...st.items.selected]) if (!ids.has(id)) st.items.selected.delete(id);
      for (const id of [...st.manage.selected]) if (!cats.has(id)) st.manage.selected.delete(id);
      if (st.manage.editing && !cats.has(st.manage.editing)) st.manage.editing = null;
    }
    this._render();
  }

  // -- data -------------------------------------------------------------

  _index() {
    this._categories = new Map();
    this._counts = new Map();
    for (const scope of Object.keys(CATEGORY_SCOPES)) {
      const list = this._data.categories[scope] || [];
      this._categories.set(scope, new Map(list.map((c) => [c.category_id, c])));
      const counts = new Map();
      for (const i of this._items(scope)) {
        if (i.category_id) counts.set(i.category_id, (counts.get(i.category_id) || 0) + 1);
      }
      this._counts.set(scope, counts);
    }
    ITEM_COLUMNS.category.cmp = (a, b) => {
      // Uncategorized first.
      const ka = this._categoryKey(a);
      const kb = this._categoryKey(b);
      if (!ka !== !kb) return ka ? 1 : -1;
      return cmp(this._categoryName(ka), this._categoryName(kb));
    };
    CATEGORY_COLUMNS.items.cmp = (a, b) =>
      (this._counts.get(this._scope).get(a.category_id) || 0) - (this._counts.get(this._scope).get(b.category_id) || 0);
  }

  _items(scope = this._scope) {
    return this._data.categorizable.filter((i) => i.scope === scope);
  }

  _s(scope = this._scope) { return this._state[scope]; }

  _is() { return this._s().items; }

  _ms() { return this._s().manage; }

  _info() { return CATEGORY_SCOPES[this._scope]; }

  // An item's category, or "" for none (or one that's gone).
  _categoryKey(i) {
    return i.category_id && this._categories.get(this._scope).has(i.category_id) ? i.category_id : NONE;
  }

  _categoryName(id) { return this._categories.get(this._scope).get(id)?.name || ""; }

  _sortedCategories() {
    return [...this._categories.get(this._scope).values()].sort((a, b) => cmp(a.name, b.name));
  }

  async _call(msg, success) {
    if (!this._hass) return null;
    this._busy = true;
    this._syncControls();
    try {
      const res = await this._hass.callWS(msg);
      if (success) this._toast(typeof success === "function" ? success(res) : success);
      return res || {};
    } catch (err) {
      this._toast(`Failed: ${err.message || err.code || err}`);
      return null;
    } finally {
      this._busy = false;
      this._syncControls();
    }
  }

  _toast(message) {
    this.dispatchEvent(new CustomEvent("hass-notification", {
      detail: { message }, bubbles: true, composed: true,
    }));
  }

  _loadCollapsed() {
    try {
      const saved = JSON.parse(localStorage.getItem(CATEGORY_COLLAPSED_KEY) || "{}");
      return saved && typeof saved === "object" ? saved : {};
    } catch (_err) {
      return {};
    }
  }

  _saveCollapsed() {
    try {
      const saved = {};
      for (const scope of Object.keys(CATEGORY_SCOPES)) {
        const collapsed = this._state[scope].items.collapsed;
        if (collapsed.size) saved[scope] = [...collapsed];
      }
      localStorage.setItem(CATEGORY_COLLAPSED_KEY, JSON.stringify(saved));
    } catch (_err) { /* storage unavailable: just not remembered */ }
  }

  // Collapsing a category deselects what's in it, so a bulk change only
  // ever touches items in view.
  _setCollapsed(key, collapsed) {
    const st = this._is();
    if (collapsed) {
      st.collapsed.add(key);
      for (const i of this._items()) if (this._categoryKey(i) === key) st.selected.delete(i.entity_id);
    } else {
      st.collapsed.delete(key);
    }
    this._saveCollapsed();
  }

  _setScope(scope) {
    if (scope === this._scope || !CATEGORY_SCOPES[scope]) return;
    this._ms().confirming = false;
    this._scope = scope;
    try { localStorage.setItem(SCOPE_KEY, scope); } catch (_err) { /* not remembered */ }
    this._index();
    this._render();
  }

  // -- rendering --------------------------------------------------------

  _render() {
    const tabs = this._el("tabs");
    tabs.textContent = "";
    for (const [scope, info] of Object.entries(CATEGORY_SCOPES)) {
      const n = this._mode === "items"
        ? this._items(scope).length
        : (this._data.categories[scope] || []).length;
      const tab = el("button", {
        class: `tab ${scope === this._scope ? "active" : ""}`, dataset: { scope },
        title: this._mode === "items" ? `${info.label}, by category` : `${info.label}' categories`,
      }, info.label, " ", el("span", { class: "count" }, this._loaded ? `(${n})` : ""));
      tabs.append(tab);
    }
    for (const div of this.shadowRoot.querySelectorAll("[data-mode]")) {
      div.hidden = div.dataset.mode !== this._mode;
    }
    if (this._mode === "items") this._renderItems();
    else this._renderManage();
    this._syncControls();
  }

  _visibleItems() {
    const st = this._is();
    const wanted = words(st.filter);
    return this._items().filter((i) => {
      if (st.kind === "none" && this._categoryKey(i)) return false;
      if (st.kind === "assigned" && !this._categoryKey(i)) return false;
      if (!wanted.length) return true;
      const text = `${i.name} ${i.entity_id} ${this._categoryName(this._categoryKey(i))}`.toLowerCase();
      return wanted.every((w) => text.includes(w));
    });
  }

  _renderItems() {
    const st = this._is();
    const info = this._info();
    const filter = this._el("item-filter");
    filter.value = st.filter;
    filter.placeholder = `Filter by ${info.one} name, entity ID or category`;
    this._el("item-kind").value = st.kind;
    this._el("item-kind").options[0].textContent = `All ${info.many}`;

    const rows = this._visibleItems();
    const shown = rows.filter((i) => !st.collapsed.has(this._categoryKey(i)) && i.editable);
    const head = this._el("head");
    head.textContent = "";
    const selectedShown = shown.filter((i) => st.selected.has(i.entity_id)).length;
    const allCb = el("input", { type: "checkbox", dataset: { selectAll: "1" }, title: `Select every ${info.one} shown` });
    allCb.checked = shown.length > 0 && selectedShown === shown.length;
    allCb.indeterminate = selectedShown > 0 && selectedShown < shown.length;
    allCb.disabled = !shown.length;
    head.append(el("th", { class: "check" }, allCb));
    const columns = ["name", "entity", "category"];
    for (const key of columns) {
      const col = ITEM_COLUMNS[key];
      const th = el("th", { class: "sortable", dataset: { sort: key } }, col.label);
      th.append(el("span", { class: "arrow" }, st.sort.key === key ? (st.sort.dir > 0 ? "▲" : "▼") : ""));
      head.append(th);
    }

    // Uncategorized first, then the categories A-Z.
    const groups = new Map();
    for (const i of rows) {
      const key = this._categoryKey(i);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(i);
    }
    const order = [...groups.keys()].sort((a, b) => {
      if (!a !== !b) return a ? 1 : -1;
      return cmp(this._categoryName(a), this._categoryName(b));
    });
    const body = this._el("body");
    body.textContent = "";
    const frag = document.createDocumentFragment();
    const sortCol = ITEM_COLUMNS[st.sort.key];
    for (const key of order) {
      const members = groups.get(key).sort(byColumn(sortCol, st.sort.dir));
      const collapsed = st.collapsed.has(key);
      frag.append(this._groupRow(key, members, collapsed, columns.length));
      if (!collapsed) for (const i of members) frag.append(this._itemRow(i, columns));
    }
    body.append(frag);

    const total = this._items().length;
    const status = this._el("status");
    status.hidden = this._loaded && !this._error && rows.length > 0;
    status.textContent = this._error || (!this._loaded ? "Loading…"
      : total ? `No ${info.many} match.` : `No ${info.many} yet.`);

    const toggle = this.shadowRoot.querySelector('[data-action="toggle-groups"]');
    toggle.disabled = !groups.size;
    toggle.textContent = groups.size && [...groups.keys()].every((k) => st.collapsed.has(k))
      ? "Expand all" : "Collapse all";

    const fixed = this._items().filter((i) => !i.editable).length;
    this._el("footer").textContent = this._loaded
      ? `Showing ${plural(rows.length, info.one, info.many)} of ${total}.`
        + (fixed ? ` ${plural(fixed, `${info.one} has`, `${info.many} have`)} no unique ID, so Home Assistant can't give ${fixed === 1 ? "it" : "them"} a category.` : "")
      : "";
  }

  _groupRow(key, members, collapsed, colSpan) {
    const st = this._is();
    const info = this._info();
    const tr = el("tr", {
      class: "group",
      dataset: { groupToggle: key },
      title: collapsed ? `Show these ${info.many}` : `Hide these ${info.many}`,
    });
    const selectable = members.filter((i) => i.editable);
    const selected = selectable.filter((i) => st.selected.has(i.entity_id)).length;
    const cb = el("input", {
      type: "checkbox",
      dataset: { groupSelect: key },
      title: collapsed ? `Expand to select these ${info.many}` : `Select all of these ${info.many}`,
    });
    cb.checked = selected > 0 && selected === selectable.length;
    cb.indeterminate = selected > 0 && selected < selectable.length;
    cb.disabled = collapsed || !selectable.length;
    tr.append(el("td", { class: "check" }, cb));
    const td = el("td", { colSpan });
    td.append(el("span", { class: "caret" }, collapsed ? "▸" : "▾"));
    const category = key ? this._categories.get(this._scope).get(key) : null;
    if (category?.icon) td.append(el("ha-icon", { icon: category.icon }));
    td.append(category ? category.name : "Uncategorized");
    td.append(el("span", { class: "group-count" }, ` (${members.length})`));
    tr.append(td);
    return tr;
  }

  _itemRow(i, columns) {
    const st = this._is();
    const tr = el("tr", { class: "row", dataset: { id: i.entity_id } });
    if (st.selected.has(i.entity_id)) tr.classList.add("selected");
    if (i.disabled) tr.classList.add("disabled");
    const cb = el("input", { type: "checkbox", dataset: { row: i.entity_id } });
    cb.checked = st.selected.has(i.entity_id);
    cb.disabled = !i.editable;
    tr.append(el("td", { class: "check" }, cb));
    for (const key of columns) {
      const td = el("td", { class: ITEM_COLUMNS[key].cls || "" });
      switch (key) {
        case "name":
          td.append(el("a", {
            href: "#", dataset: { moreInfo: i.entity_id }, title: "Open its details in Home Assistant",
          }, i.name));
          if (i.disabled) td.append(el("span", { class: "chip disabled" }, "Disabled"));
          if (!i.editable) {
            const chip = el("span", { class: "chip disabled" }, "No unique ID");
            chip.title = "Not in Home Assistant's entity registry, so it can't have a category";
            td.append(chip);
          }
          break;
        case "entity":
          td.append(el("span", { class: "label" }, "Entity ID: "), i.entity_id);
          break;
        case "category": {
          const select = el("select", { dataset: { assign: i.entity_id }, title: "Its category" });
          this._categoryOptions(select, this._categoryKey(i));
          select.disabled = this._busy || !i.editable;
          td.append(select);
          break;
        }
        default:
          break;
      }
      tr.append(td);
    }
    return tr;
  }

  _categoryOptions(select, current, placeholder = null) {
    select.textContent = "";
    if (placeholder) select.append(el("option", { value: "__pick__", disabled: true }, placeholder));
    select.append(el("option", { value: "" }, "No category"));
    for (const c of this._sortedCategories()) select.append(el("option", { value: c.category_id }, c.name));
    const fallback = placeholder ? "__pick__" : "";
    select.value = current ?? fallback;
    if (select.value !== (current ?? fallback)) select.value = fallback;
  }

  _visibleCategories() {
    const wanted = words(this._ms().filter);
    return this._sortedCategories().filter((c) => {
      if (!wanted.length) return true;
      return wanted.every((w) => c.name.toLowerCase().includes(w));
    });
  }

  _renderManage() {
    const st = this._ms();
    const info = this._info();
    this._el("category-filter").value = st.filter;
    this._el("new-name").placeholder = `New ${info.one} category name`;

    const rows = this._visibleCategories().sort(byColumn(CATEGORY_COLUMNS[st.sort.key], st.sort.dir));
    const columns = ["name", "items", "actions"];
    const head = this._el("head");
    head.textContent = "";
    const selectedShown = rows.filter((c) => st.selected.has(c.category_id)).length;
    const allCb = el("input", { type: "checkbox", dataset: { selectAllCategories: "1" }, title: "Select every category shown" });
    allCb.checked = rows.length > 0 && selectedShown === rows.length;
    allCb.indeterminate = selectedShown > 0 && selectedShown < rows.length;
    allCb.disabled = !rows.length;
    head.append(el("th", { class: "check" }, allCb));
    for (const key of columns) {
      const col = CATEGORY_COLUMNS[key];
      if (!col.cmp) {
        head.append(el("th", {}, col.label));
        continue;
      }
      const th = el("th", { class: `sortable ${col.num ? "num" : ""}`, dataset: { sort: key } }, col.label);
      th.append(el("span", { class: "arrow" }, st.sort.key === key ? (st.sort.dir > 0 ? "▲" : "▼") : ""));
      head.append(th);
    }

    const body = this._el("body");
    body.textContent = "";
    const frag = document.createDocumentFragment();
    for (const c of rows) {
      frag.append(st.editing === c.category_id ? this._editRow(c, columns) : this._categoryRow(c, columns));
    }
    body.append(frag);

    const total = this._categories.get(this._scope).size;
    const status = this._el("status");
    status.hidden = this._loaded && !this._error && rows.length > 0;
    status.textContent = this._error || (!this._loaded ? "Loading…"
      : total ? "No categories match." : `No ${info.one} categories yet. Create one above.`);

    const items = this._items().filter((i) => i.editable);
    const categorized = items.filter((i) => this._categoryKey(i)).length;
    this._el("footer").textContent = this._loaded
      ? `${plural(total, "category", "categories")} for ${info.many}; ${plural(categorized, info.one, info.many)} in one, ${plural(items.length - categorized, info.one, info.many)} uncategorized.`
      : "";
    if (st.editing && st.focus) {
      const input = body.querySelector(`[data-edit="${st.focus}"]`);
      if (input) {
        input.focus();
        if (st.focus === "name" && st.draft.name === undefined) input.select();
      }
    }
  }

  _categoryRow(c, columns) {
    const st = this._ms();
    const info = this._info();
    const tr = el("tr", { class: "row", dataset: { categoryId: c.category_id } });
    if (st.selected.has(c.category_id)) tr.classList.add("selected");
    const cb = el("input", { type: "checkbox", dataset: { categoryRow: c.category_id } });
    cb.checked = st.selected.has(c.category_id);
    tr.append(el("td", { class: "check" }, cb));
    for (const key of columns) {
      const td = el("td", { class: CATEGORY_COLUMNS[key].cls || "" });
      switch (key) {
        case "name": {
          const name = el("span", { class: "area-name" });
          if (c.icon) name.append(el("ha-icon", { icon: c.icon }));
          name.append(c.name);
          td.append(name);
          break;
        }
        case "items": {
          const n = this._counts.get(this._scope).get(c.category_id) || 0;
          td.append(el("button", {
            class: "linkish", dataset: { showCategory: c.category_id }, title: `Show this category's ${info.many}`,
          }, plural(n, info.one, info.many)));
          break;
        }
        case "actions":
          td.append(el("button", {
            class: "action secondary small", dataset: { editCategory: c.category_id },
            title: "Rename, or change the icon",
          }, "Edit"));
          break;
        default:
          break;
      }
      tr.append(td);
    }
    return tr;
  }

  _editRow(c, columns) {
    const draft = this._ms().draft;
    const info = this._info();
    const tr = el("tr", { class: "row editing", dataset: { categoryId: c.category_id } });
    tr.append(el("td", { class: "check" }));
    for (const key of columns) {
      const td = el("td", { class: `edit ${CATEGORY_COLUMNS[key].cls || ""}` });
      switch (key) {
        case "name":
          td.append(
            el("input", {
              type: "text", value: draft.name ?? c.name, dataset: { edit: "name" }, maxlength: "255", placeholder: "Name",
            }),
            el("input", {
              type: "text", value: draft.icon ?? (c.icon || ""), dataset: { edit: "icon" },
              placeholder: "Icon, e.g. mdi:lightbulb", style: "margin-top: 6px",
            }),
          );
          break;
        case "items":
          td.append(plural(this._counts.get(this._scope).get(c.category_id) || 0, info.one, info.many));
          break;
        case "actions":
          td.append(
            el("button", { class: "action small", dataset: { saveCategory: c.category_id } }, "Save"),
            " ",
            el("button", { class: "action secondary small", dataset: { cancelEdit: "1" } }, "Cancel"),
          );
          break;
        default:
          break;
      }
      tr.append(td);
    }
    return tr;
  }

  // The selected items still in view (filtered in, not collapsed).
  _selectedItemIds() {
    const st = this._is();
    if (!st.selected.size) return [];
    return this._visibleItems()
      .filter((i) => i.editable && st.selected.has(i.entity_id) && !st.collapsed.has(this._categoryKey(i)))
      .map((i) => i.entity_id);
  }

  _syncControls() {
    const info = this._info();
    if (this._mode === "items") {
      const ids = this._selectedItemIds();
      const n = ids.length;
      this._el("selection").textContent = n
        ? `${plural(n, info.one, info.many)} selected`
        : `No ${info.many} selected`;
      const bulk = this._el("bulk-category");
      const keep = bulk.value;
      this._categoryOptions(
        bulk,
        keep && keep !== "__pick__" && this._categories.get(this._scope).has(keep) ? keep : null,
        "Move to category…",
      );
      const assign = this.shadowRoot.querySelector('[data-action="assign"]');
      assign.disabled = this._busy || !n || bulk.value === "__pick__";
      assign.textContent = n ? `Set category of ${plural(n, info.one, info.many)}` : "Set category";
      const unassign = this.shadowRoot.querySelector('[data-action="unassign"]');
      const withCategory = new Set(this._items().filter((i) => this._categoryKey(i)).map((i) => i.entity_id));
      unassign.disabled = this._busy || !ids.some((id) => withCategory.has(id));
      unassign.title = `Leave the selected ${info.many} without a category`;
      for (const select of this.shadowRoot.querySelectorAll("select[data-assign]")) {
        const item = this._data.categorizable.find((i) => i.entity_id === select.dataset.assign);
        select.disabled = this._busy || !item?.editable;
      }
    } else {
      const st = this._ms();
      this.shadowRoot.querySelector('[data-action="create"]').disabled =
        this._busy || !this._el("new-name").value.trim();
      const del = this.shadowRoot.querySelector('[data-action="ask-delete"]');
      del.disabled = this._busy || !st.selected.size;
      del.textContent = st.selected.size ? `Delete ${plural(st.selected.size, "category", "categories")}` : "Delete selected";
      if (!st.selected.size) st.confirming = false;
      this._el("confirm").classList.toggle("open", st.confirming);
      if (st.confirming) {
        const ids = [...st.selected];
        const names = ids.map((id) => this._categoryName(id)).sort(cmp);
        const used = ids.reduce((sum, id) => sum + (this._counts.get(this._scope).get(id) || 0), 0);
        const shown = names.length > 5 ? `${names.slice(0, 5).join(", ")} and ${names.length - 5} more` : names.join(", ");
        this._el("confirm-text").textContent =
          `Delete ${plural(ids.length, "category", "categories")} (${shown})?`
          + (used ? ` ${plural(used, info.one, info.many)} in ${ids.length === 1 ? "it" : "them"} will be left uncategorized.` : "")
          + " This can't be undone.";
      }
      this.shadowRoot.querySelector('[data-action="delete"]').disabled = this._busy;
    }
  }

  // -- events -----------------------------------------------------------

  async _onClick(ev) {
    const path = ev.composedPath();
    const find = (key) => path.find((n) => n.dataset && n.dataset[key] !== undefined);

    const moreInfo = find("moreInfo");
    if (moreInfo) {
      ev.preventDefault();
      // Home Assistant's own dialog for it.
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        detail: { entityId: moreInfo.dataset.moreInfo }, bubbles: true, composed: true,
      }));
      return;
    }
    const tab = find("scope");
    if (tab) {
      this._setScope(tab.dataset.scope);
      return;
    }
    if (path[0]?.type === "checkbox" || path[0]?.tagName === "SELECT") return;
    const action = find("action")?.dataset.action;
    if (this._mode === "items") await this._onItemsClick(find, action);
    else await this._onManageClick(find, action);
  }

  async _onItemsClick(find, action) {
    const st = this._is();
    const group = find("groupToggle");
    if (group) {
      const key = group.dataset.groupToggle;
      this._setCollapsed(key, !st.collapsed.has(key));
      this._render();
      return;
    }
    const sortTh = find("sort");
    if (sortTh) {
      const key = sortTh.dataset.sort;
      if (st.sort.key === key) st.sort.dir = -st.sort.dir;
      else st.sort = { key, dir: ITEM_COLUMNS[key].firstDir || 1 };
      this._render();
      return;
    }
    switch (action) {
      case "toggle-groups": {
        const keys = new Set(this._visibleItems().map((i) => this._categoryKey(i)));
        const allCollapsed = [...keys].every((k) => st.collapsed.has(k));
        for (const k of keys) this._setCollapsed(k, !allCollapsed);
        this._render();
        break;
      }
      case "assign": {
        const categoryId = this._el("bulk-category").value;
        if (categoryId === "__pick__") return;
        await this._assign(this._selectedItemIds(), categoryId || null, true);
        break;
      }
      case "unassign":
        await this._assign(this._selectedItemIds(), null, true);
        break;
      default:
        break;
    }
  }

  async _assign(ids, categoryId, clearSelection) {
    if (!ids.length) return;
    const info = this._info();
    const scope = this._scope;
    const where = categoryId ? this._categoryName(categoryId) : null;
    const res = await this._call(
      { type: WS.CATEGORIZE, scope, entity_ids: ids, category_id: categoryId },
      (r) => {
        const n = r?.updated ?? ids.length;
        if (!n) return where ? `Already in ${where}` : "Already uncategorized";
        return where
          ? `Moved ${plural(n, info.one, info.many)} to ${where}`
          : `Removed the category of ${plural(n, info.one, info.many)}`;
      },
    );
    if (res && clearSelection) {
      this._s(scope).items.selected.clear();
      this._render();
    }
  }

  async _onManageClick(find, action) {
    const st = this._ms();
    const sortTh = find("sort");
    if (sortTh) {
      const key = sortTh.dataset.sort;
      if (st.sort.key === key) st.sort.dir = -st.sort.dir;
      else st.sort = { key, dir: CATEGORY_COLUMNS[key].firstDir || 1 };
      this._render();
      return;
    }
    const show = find("showCategory");
    if (show) {
      this._showCategoryItems(show.dataset.showCategory);
      return;
    }
    const edit = find("editCategory");
    if (edit) {
      st.editing = edit.dataset.editCategory;
      st.draft = {};
      st.focus = "name";
      this._render();
      return;
    }
    if (find("cancelEdit")) {
      this._stopEdit();
      return;
    }
    const save = find("saveCategory");
    if (save) {
      await this._saveCategory(save.dataset.saveCategory);
      return;
    }
    switch (action) {
      case "create":
        await this._createCategory();
        break;
      case "ask-delete":
        st.confirming = true;
        this._syncControls();
        break;
      case "cancel-delete":
        st.confirming = false;
        this._syncControls();
        break;
      case "delete": {
        const ids = [...st.selected];
        const res = await this._call(
          { type: WS.CATEGORY_DELETE, scope: this._scope, category_ids: ids },
          (r) => `Deleted ${plural(r?.deleted ?? ids.length, "category", "categories")}`,
        );
        if (res) {
          st.selected.clear();
          st.confirming = false;
          this._render();
        }
        break;
      }
      default:
        break;
    }
  }

  _stopEdit() {
    const st = this._ms();
    st.editing = null;
    st.draft = {};
    st.focus = null;
    this._render();
  }

  // Opens By category at this category, expanded and not filtered out.
  _showCategoryItems(categoryId) {
    const st = this._is();
    st.filter = "";
    st.kind = "";
    st.collapsed.delete(categoryId);
    this._saveCollapsed();
    this.dispatchEvent(new CustomEvent("area-manager-view", {
      detail: { view: "by-category" }, bubbles: true, composed: true,
    }));
    requestAnimationFrame(() => {
      const row = [...this.shadowRoot.querySelectorAll("tr.group")]
        .find((tr) => tr.dataset.groupToggle === categoryId);
      if (row) row.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  async _createCategory() {
    const nameInput = this._el("new-name");
    const name = nameInput.value.trim();
    if (!name) return;
    const icon = this._el("new-icon").value.trim();
    const res = await this._call(
      { type: WS.CATEGORY_CREATE, scope: this._scope, name, icon: icon || null },
      `Created ${name}`,
    );
    if (res) {
      nameInput.value = "";
      this._el("new-icon").value = "";
      this._syncControls();
      nameInput.focus();
    }
  }

  async _saveCategory(categoryId) {
    const category = this._categories.get(this._scope).get(categoryId);
    const row = this.shadowRoot.querySelector(`tr.editing[data-category-id="${CSS.escape(categoryId)}"]`);
    if (!category || !row) return;
    const name = row.querySelector('[data-edit="name"]').value.trim();
    if (!name) {
      this._toast("A category needs a name");
      return;
    }
    const msg = { type: WS.CATEGORY_UPDATE, scope: this._scope, category_id: categoryId };
    if (name !== category.name) msg.name = name;
    const icon = row.querySelector('[data-edit="icon"]').value.trim() || null;
    if (icon !== (category.icon || null)) msg.icon = icon;
    if (Object.keys(msg).length > 3) {
      const res = await this._call(msg, msg.name ? `Renamed ${category.name} to ${name}` : `Saved ${name}`);
      if (!res) return;
    }
    this._stopEdit();
  }

  async _onChange(ev) {
    const target = ev.composedPath()[0];
    const ds = target.dataset || {};
    if (target === this._el("item-kind")) {
      this._is().kind = target.value;
      this._render();
      return;
    }
    if (target === this._el("bulk-category")) {
      this._syncControls();
      return;
    }
    if (ds.assign !== undefined) {
      // One item, straight from its row.
      await this._assign([ds.assign], target.value || null, false);
      return;
    }
    if (this._mode === "items") {
      const st = this._is();
      const toggle = (i) => {
        if (!i.editable) return;
        if (target.checked) st.selected.add(i.entity_id);
        else st.selected.delete(i.entity_id);
      };
      if (ds.row !== undefined) {
        if (target.checked) st.selected.add(ds.row);
        else st.selected.delete(ds.row);
      } else if (ds.groupSelect !== undefined) {
        for (const i of this._visibleItems()) if (this._categoryKey(i) === ds.groupSelect) toggle(i);
      } else if (ds.selectAll !== undefined) {
        for (const i of this._visibleItems()) if (!st.collapsed.has(this._categoryKey(i))) toggle(i);
      } else {
        return;
      }
      this._render();
      return;
    }
    const st = this._ms();
    if (ds.categoryRow !== undefined) {
      if (target.checked) st.selected.add(ds.categoryRow);
      else st.selected.delete(ds.categoryRow);
    } else if (ds.selectAllCategories !== undefined) {
      for (const c of this._visibleCategories()) {
        if (target.checked) st.selected.add(c.category_id);
        else st.selected.delete(c.category_id);
      }
    } else {
      return;
    }
    this._render();
  }

  async _onKey(ev) {
    const target = ev.composedPath()[0];
    if (ev.key === "Enter" && (target === this._el("new-name") || target === this._el("new-icon"))) {
      ev.preventDefault();
      await this._createCategory();
      return;
    }
    const editing = this._ms().editing;
    if (editing && target.dataset?.edit !== undefined) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        await this._saveCategory(editing);
      } else if (ev.key === "Escape") {
        this._stopEdit();
      }
    }
  }
}

if (!customElements.get("area-manager-categories")) {
  customElements.define("area-manager-categories", AreaManagerCategories);
}

// -- the Zigbee group views ---------------------------------------------
//
// AreaManagerZigbee draws the "Zigbee by group" (mode "members") and
// "Zigbee groups" (mode "groups") views for ZHA. Unlike areas, a device can
// be in any number of Zigbee groups (strictly, each of its groupable
// endpoints can), so on "Zigbee by group" a device is listed under every
// group it's in, plus "Not in a group" for those in none; rows can be added
// to a group or removed from the group they're listed under, one at a time
// or in bulk. "Zigbee groups" creates and deletes the groups themselves
// (ZHA has no way to rename one).
//
// Everything goes through ZHA's own WebSocket commands, the ones its Groups
// page uses. ZHA doesn't announce group changes, so the lists are fetched
// when the view opens, after every change made here, and when anything
// else on the page changes (which includes ZHA adding or removing group
// entities).

const ZHA_WS = {
  GROUPS: "zha/groups",
  GROUPABLE: "zha/devices/groupable",
  GROUP_ADD: "zha/group/add",
  GROUP_REMOVE: "zha/group/remove",
  MEMBERS_ADD: "zha/group/members/add",
  MEMBERS_REMOVE: "zha/group/members/remove",
};
// Fetched again on the panel's live updates at most this often (ms).
const ZIGBEE_REFRESH_MS = 5000;
const ZIGBEE_COLLAPSED_KEY = "area_manager.collapsed_zigbee_groups";

const MEMBER_COLUMNS = {
  name: { label: "Device", cls: "name", cmp: (a, b) => cmp(a.name, b.name) },
  manufacturer: { label: "Manufacturer", cls: "minor", cmp: (a, b) => cmp(a.manufacturer, b.manufacturer) },
  model: { label: "Model", cls: "minor", cmp: (a, b) => cmp(a.model, b.model) },
  area: { label: "Area", cls: "minor", cmp: (a, b) => cmp(a.area, b.area) },
  actions: { label: "", cls: "area" },
};

const ZGROUP_COLUMNS = {
  name: { label: "Group", cmp: (a, b) => cmp(a.name, b.name) },
  id: { label: "Group ID", cls: "minor", cmp: (a, b) => a.group_id - b.group_id },
  members: { label: "Members", cls: "num minor", num: true, firstDir: -1, cmp: (a, b) => a.members.length - b.members.length },
  actions: { label: "", cls: "actions" },
};

const ZIGBEE_TEMPLATE = `
<div class="card">
  <div class="mode" data-mode="members">
    <div class="toolbar">
      <input type="search" data-el="member-filter" placeholder="Filter by device, manufacturer, model, area or group">
      <select data-el="member-kind" title="Show">
        <option value="">All groupable devices</option>
        <option value="none">Not in a group</option>
        <option value="grouped">In a group</option>
      </select>
      <button class="action secondary" data-action="toggle-groups" title="Collapse or expand every group">Collapse all</button>
      <button class="action secondary" data-action="refresh" title="Fetch the groups from ZHA again">Refresh</button>
    </div>
    <div class="toolbar">
      <span class="selection" data-el="selection"></span>
      <span class="spacer"></span>
      <select data-el="bulk-group" title="Group to add the selected devices to"></select>
      <button class="action" data-action="add" disabled>Add to group</button>
      <button class="action secondary" data-action="remove" disabled
        title="Take each selected device out of the group it's listed under">Remove from group</button>
    </div>
  </div>
  <div class="mode" data-mode="groups">
    <div class="toolbar create">
      <input type="text" data-el="new-name" placeholder="New Zigbee group name" maxlength="255">
      <button class="action" data-action="create" disabled>Create group</button>
    </div>
    <div class="toolbar">
      <input type="search" data-el="group-filter" placeholder="Filter by group name or ID">
      <button class="action secondary" data-action="refresh" title="Fetch the groups from ZHA again">Refresh</button>
      <span class="spacer"></span>
      <button class="action danger secondary" data-action="ask-delete" disabled>Delete selected</button>
    </div>
    <div class="confirm" data-el="confirm">
      <span data-el="confirm-text"></span>
      <button class="action secondary" data-action="cancel-delete">Cancel</button>
      <button class="action danger" data-action="delete">Delete permanently</button>
    </div>
  </div>
  <div class="table-wrap" data-el="scroll">
    <table>
      <thead><tr data-el="head"></tr></thead>
      <tbody data-el="body"></tbody>
    </table>
    <div class="status" data-el="status">Loading…</div>
  </div>
  <div class="footer" data-el="footer"></div>
</div>
`;

const ZIGBEE_STYLE = `
.row-actions { display: flex; align-items: center; gap: 6px; }
.row-actions select { flex: 1 1 auto; min-width: 130px; max-width: 220px; padding: 5px 8px; }
.chip.group-id { text-transform: none; }
`;

function hexGroupId(id) {
  return `0x${Number(id).toString(16).padStart(4, "0")}`;
}

class AreaManagerZigbee extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._mode = "members";
    this._groups = [];
    this._groupable = [];
    this._areas = new Map();
    this._loaded = false;
    this._error = null;
    this._busy = false;
    this._fetching = null;
    this._fetchedAt = 0;
    let collapsed = [];
    try { collapsed = JSON.parse(localStorage.getItem(ZIGBEE_COLLAPSED_KEY) || "[]"); } catch (_err) { /* none */ }
    this._state = {
      members: {
        filter: "",
        kind: "",
        sort: { key: "name", dir: 1 },
        selected: new Set(),
        collapsed: new Set(Array.isArray(collapsed) ? collapsed.map(String) : []),
      },
      groups: { filter: "", sort: { key: "name", dir: 1 }, selected: new Set(), confirming: false },
    };
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>${STYLE}${CATEGORY_STYLE}${ZIGBEE_STYLE}</style>${ZIGBEE_TEMPLATE}`;
    this._el = (name) => this.shadowRoot.querySelector(`[data-el="${name}"]`);
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
    this.shadowRoot.addEventListener("change", (ev) => this._onChange(ev));
    this._el("member-filter").addEventListener("input", (ev) => {
      this._state.members.filter = ev.target.value;
      this._render();
    });
    this._el("group-filter").addEventListener("input", (ev) => {
      this._state.groups.filter = ev.target.value;
      this._render();
    });
    this._el("new-name").addEventListener("input", () => this._syncControls());
    this._el("new-name").addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this._createGroup();
      }
    });
  }

  set hass(hass) { this._hass = hass; }

  get hass() { return this._hass; }

  // Called by the panel when this view is shown and on its live updates.
  update({ mode, data }) {
    if (mode !== this._mode) {
      this._state.groups.confirming = false;
      this._mode = mode;
    }
    this._areas = new Map((data.areas || []).map((a) => [a.area_id, a.name]));
    this._render();
    if (!this._loaded || Date.now() - this._fetchedAt > ZIGBEE_REFRESH_MS) this._fetch();
  }

  // -- data -------------------------------------------------------------

  async _fetch() {
    if (!this._hass) return;
    if (this._fetching) return this._fetching;
    this._fetching = (async () => {
      try {
        const [groups, groupable] = await Promise.all([
          this._hass.callWS({ type: ZHA_WS.GROUPS }),
          this._hass.callWS({ type: ZHA_WS.GROUPABLE }),
        ]);
        this._groups = groups || [];
        this._groupable = groupable || [];
        this._error = null;
      } catch (err) {
        this._error = err?.code === "unknown_command"
          ? "ZHA isn't set up in this Home Assistant."
          : `Couldn't load the Zigbee groups from ZHA: ${err?.message || err?.code || err}`;
      } finally {
        this._loaded = true;
        this._fetchedAt = Date.now();
        this._fetching = null;
      }
      this._prune();
      this._render();
    })();
    return this._fetching;
  }

  // Forget selections of what's gone.
  _prune() {
    const rowKeys = new Set(this._rows().map((r) => r.key));
    for (const key of [...this._state.members.selected]) if (!rowKeys.has(key)) this._state.members.selected.delete(key);
    const ids = new Set(this._groups.map((g) => String(g.group_id)));
    for (const id of [...this._state.groups.selected]) if (!ids.has(id)) this._state.groups.selected.delete(id);
  }

  _endpointKey(ieee, endpointId) { return `${ieee}/${endpointId}`; }

  _describe(device, endpointId, multi) {
    const name = device.user_given_name || device.name || device.ieee;
    return {
      ieee: device.ieee,
      endpoint_id: endpointId,
      name: multi ? `${name} (endpoint ${endpointId})` : name,
      device_id: device.device_reg_id,
      manufacturer: device.manufacturer || "",
      model: device.model || "",
      area: this._areas.get(device.area_id) || "",
    };
  }

  // One row per group member, plus one per groupable endpoint in no group.
  // Row keys are "<group id>|<ieee>/<endpoint>", with "" as the group id
  // for "Not in a group".
  _rows() {
    const endpointsPerDevice = new Map();
    for (const g of this._groupable) {
      endpointsPerDevice.set(g.device.ieee, (endpointsPerDevice.get(g.device.ieee) || 0) + 1);
    }
    const multi = (ieee) => (endpointsPerDevice.get(ieee) || 0) > 1;
    const rows = [];
    const grouped = new Set();
    for (const group of this._groups) {
      for (const m of group.members || []) {
        const ep = this._endpointKey(m.device.ieee, m.endpoint_id);
        grouped.add(ep);
        rows.push({
          ...this._describe(m.device, m.endpoint_id, multi(m.device.ieee)),
          key: `${group.group_id}|${ep}`, group: String(group.group_id), endpoint: ep,
        });
      }
    }
    for (const g of this._groupable) {
      const ep = this._endpointKey(g.device.ieee, g.endpoint_id);
      if (grouped.has(ep)) continue;
      rows.push({ ...this._describe(g.device, g.endpoint_id, multi(g.device.ieee)), key: `|${ep}`, group: NONE, endpoint: ep });
    }
    return rows;
  }

  _groupName(id) {
    const group = this._groups.find((g) => String(g.group_id) === id);
    return group ? group.name || hexGroupId(group.group_id) : "";
  }

  _membersOf(id) {
    const group = this._groups.find((g) => String(g.group_id) === id);
    return new Set((group?.members || []).map((m) => this._endpointKey(m.device.ieee, m.endpoint_id)));
  }

  async _call(msg, success) {
    if (!this._hass) return null;
    this._busy = true;
    this._syncControls();
    try {
      const res = await this._hass.callWS(msg);
      if (success) this._toast(success);
      return res || {};
    } catch (err) {
      this._toast(`Failed: ${err?.message || err?.code || err}`);
      return null;
    } finally {
      this._busy = false;
      this._syncControls();
    }
  }

  _toast(message) {
    this.dispatchEvent(new CustomEvent("hass-notification", {
      detail: { message }, bubbles: true, composed: true,
    }));
  }

  _saveCollapsed() {
    try {
      localStorage.setItem(ZIGBEE_COLLAPSED_KEY, JSON.stringify([...this._state.members.collapsed]));
    } catch (_err) { /* storage unavailable: just not remembered */ }
  }

  // Collapsing a group deselects its rows, so a bulk change only ever
  // touches rows in view.
  _setCollapsed(key, collapsed) {
    const st = this._state.members;
    if (collapsed) {
      st.collapsed.add(key);
      for (const sel of [...st.selected]) if (sel.split("|")[0] === key) st.selected.delete(sel);
    } else {
      st.collapsed.delete(key);
    }
    this._saveCollapsed();
  }

  // -- rendering --------------------------------------------------------

  _render() {
    for (const div of this.shadowRoot.querySelectorAll("[data-mode]")) {
      div.hidden = div.dataset.mode !== this._mode;
    }
    if (this._mode === "members") this._renderMembers();
    else this._renderGroups();
    this._syncControls();
  }

  _visibleRows() {
    const st = this._state.members;
    const wanted = words(st.filter);
    const rows = this._rows();
    const grouped = new Set(rows.filter((r) => r.group).map((r) => r.endpoint));
    return rows.filter((r) => {
      if (st.kind === "none" && grouped.has(r.endpoint)) return false;
      if (st.kind === "grouped" && !r.group) return false;
      if (!wanted.length) return true;
      const text = `${r.name} ${r.manufacturer} ${r.model} ${r.area} ${r.ieee} ${this._groupName(r.group)}`.toLowerCase();
      return wanted.every((w) => text.includes(w));
    });
  }

  _status(empty) {
    const status = this._el("status");
    status.hidden = this._loaded && !this._error && !empty;
    status.textContent = this._error || (!this._loaded ? "Loading…" : empty);
  }

  _renderMembers() {
    const st = this._state.members;
    this._el("member-filter").value = st.filter;
    this._el("member-kind").value = st.kind;
    const rows = this._error ? [] : this._visibleRows();
    const shown = rows.filter((r) => !st.collapsed.has(r.group));
    const columns = ["name", "manufacturer", "model", "area", "actions"];

    const head = this._el("head");
    head.textContent = "";
    const selectedShown = shown.filter((r) => st.selected.has(r.key)).length;
    const allCb = el("input", { type: "checkbox", dataset: { selectAll: "1" }, title: "Select every device shown" });
    allCb.checked = shown.length > 0 && selectedShown === shown.length;
    allCb.indeterminate = selectedShown > 0 && selectedShown < shown.length;
    allCb.disabled = !shown.length;
    head.append(el("th", { class: "check" }, allCb));
    for (const key of columns) {
      const col = MEMBER_COLUMNS[key];
      if (!col.cmp) {
        head.append(el("th", {}, col.label));
        continue;
      }
      const th = el("th", { class: "sortable", dataset: { sort: key } }, col.label);
      th.append(el("span", { class: "arrow" }, st.sort.key === key ? (st.sort.dir > 0 ? "▲" : "▼") : ""));
      head.append(th);
    }

    // "Not in a group" first, then the groups A-Z, empty ones included.
    const groups = new Map();
    if (!st.kind || st.kind === "none") groups.set(NONE, []);
    if (st.kind !== "none" && !words(st.filter).length) {
      for (const g of this._groups) groups.set(String(g.group_id), []);
    }
    for (const r of rows) {
      if (!groups.has(r.group)) groups.set(r.group, []);
      groups.get(r.group).push(r);
    }
    if (!groups.get(NONE)?.length) groups.delete(NONE);
    const order = [...groups.keys()].sort((a, b) => {
      if (!a !== !b) return a ? 1 : -1;
      return cmp(this._groupName(a), this._groupName(b));
    });
    const body = this._el("body");
    body.textContent = "";
    const frag = document.createDocumentFragment();
    const sortCol = MEMBER_COLUMNS[st.sort.key];
    for (const key of order) {
      const members = groups.get(key).sort(byColumn(sortCol, st.sort.dir));
      const collapsed = st.collapsed.has(key);
      frag.append(this._groupRow(key, members, collapsed, columns.length));
      if (!collapsed) for (const r of members) frag.append(this._memberRow(r, columns));
    }
    body.append(frag);
    this._status(groups.size ? "" : (this._groupable.length || this._groups.length
      ? "Nothing matches." : "No groupable Zigbee devices or groups yet."));

    const toggle = this.shadowRoot.querySelector('[data-action="toggle-groups"]');
    toggle.disabled = !groups.size;
    toggle.textContent = groups.size && [...groups.keys()].every((k) => st.collapsed.has(k)) ? "Expand all" : "Collapse all";

    const endpoints = new Set(this._rows().map((r) => r.endpoint));
    const ungrouped = this._rows().filter((r) => !r.group).length;
    this._el("footer").textContent = this._loaded && !this._error
      ? `${plural(this._groups.length, "Zigbee group", "Zigbee groups")}; ${plural(endpoints.size, "groupable device", "groupable devices")}, ${ungrouped} in no group. A device can be in more than one group.`
      : "";
  }

  _groupRow(key, members, collapsed, colSpan) {
    const st = this._state.members;
    const tr = el("tr", {
      class: "group", dataset: { groupToggle: key },
      title: collapsed ? "Show these devices" : "Hide these devices",
    });
    const selected = members.filter((r) => st.selected.has(r.key)).length;
    const cb = el("input", {
      type: "checkbox", dataset: { groupSelect: key },
      title: collapsed ? "Expand to select these devices" : "Select all of these devices",
    });
    cb.checked = selected > 0 && selected === members.length;
    cb.indeterminate = selected > 0 && selected < members.length;
    cb.disabled = collapsed || !members.length;
    tr.append(el("td", { class: "check" }, cb));
    const td = el("td", { colSpan });
    td.append(el("span", { class: "caret" }, collapsed ? "▸" : "▾"));
    td.append(key ? this._groupName(key) : "Not in a group");
    td.append(el("span", { class: "group-count" }, ` (${members.length})`));
    if (key) {
      td.append(el("span", { class: "chip floor group-id" }, hexGroupId(key)));
      td.append(el("a", {
        class: "group-link", href: `/config/zha/group/${encodeURIComponent(key)}`,
        dataset: { nav: "1" }, title: "Open this group in ZHA",
      }, "Group ↗"));
    }
    tr.append(td);
    return tr;
  }

  _memberRow(r, columns) {
    const st = this._state.members;
    const tr = el("tr", { class: "row", dataset: { id: r.key } });
    if (st.selected.has(r.key)) tr.classList.add("selected");
    const cb = el("input", { type: "checkbox", dataset: { row: r.key } });
    cb.checked = st.selected.has(r.key);
    tr.append(el("td", { class: "check" }, cb));
    for (const key of columns) {
      const td = el("td", { class: MEMBER_COLUMNS[key].cls || "" });
      switch (key) {
        case "name":
          if (r.device_id) {
            td.append(el("a", {
              href: `/config/devices/device/${encodeURIComponent(r.device_id)}`,
              dataset: { nav: "1" }, title: "Open this device in Home Assistant",
            }, r.name));
          } else {
            td.append(r.name);
          }
          td.append(el("div", { class: "sub" }, r.ieee));
          break;
        case "manufacturer":
          if (r.manufacturer) td.append(el("span", { class: "label" }, "Manufacturer: "), r.manufacturer);
          break;
        case "model":
          if (r.model) td.append(el("span", { class: "label" }, "Model: "), r.model);
          break;
        case "area":
          if (r.area) td.append(el("span", { class: "label" }, "Area: "), r.area);
          break;
        case "actions": {
          // Add to another group straight from the row; remove from the
          // group it's listed under.
          const select = el("select", { dataset: { addRow: r.key }, title: "Add this device to a group" });
          this._groupOptions(select, r.endpoint, "Add to group…");
          select.disabled = this._busy || select.options.length < 2;
          const wrap = el("div", { class: "row-actions" }, select);
          td.append(wrap);
          if (r.group) {
            wrap.append(el("button", {
              class: "action danger secondary small", dataset: { removeRow: r.key },
              title: `Take it out of ${this._groupName(r.group)}`,
            }, "Remove"));
          }
          break;
        }
        default:
          break;
      }
      tr.append(td);
    }
    return tr;
  }

  // The groups an endpoint (or, with none given, anything) can be added to.
  _groupOptions(select, endpoint, placeholder) {
    const keep = select.value;
    select.textContent = "";
    select.append(el("option", { value: "__pick__", disabled: true }, placeholder));
    const groups = [...this._groups].sort((a, b) => cmp(a.name, b.name));
    for (const g of groups) {
      const id = String(g.group_id);
      if (endpoint && this._membersOf(id).has(endpoint)) continue;
      select.append(el("option", { value: id }, g.name || hexGroupId(id)));
    }
    select.value = keep && keep !== "__pick__" ? keep : "__pick__";
    if (select.value !== keep) select.value = "__pick__";
  }

  _visibleGroups() {
    const wanted = words(this._state.groups.filter);
    return this._groups.filter((g) => {
      if (!wanted.length) return true;
      const text = `${g.name} ${hexGroupId(g.group_id)} ${g.group_id}`.toLowerCase();
      return wanted.every((w) => text.includes(w));
    });
  }

  _renderGroups() {
    const st = this._state.groups;
    this._el("group-filter").value = st.filter;
    const rows = this._error ? [] : this._visibleGroups().sort(byColumn(ZGROUP_COLUMNS[st.sort.key], st.sort.dir));
    const columns = ["name", "id", "members", "actions"];
    const head = this._el("head");
    head.textContent = "";
    const selectedShown = rows.filter((g) => st.selected.has(String(g.group_id))).length;
    const allCb = el("input", { type: "checkbox", dataset: { selectAllGroups: "1" }, title: "Select every group shown" });
    allCb.checked = rows.length > 0 && selectedShown === rows.length;
    allCb.indeterminate = selectedShown > 0 && selectedShown < rows.length;
    allCb.disabled = !rows.length;
    head.append(el("th", { class: "check" }, allCb));
    for (const key of columns) {
      const col = ZGROUP_COLUMNS[key];
      if (!col.cmp) {
        head.append(el("th", {}, col.label));
        continue;
      }
      const th = el("th", { class: `sortable ${col.num ? "num" : ""}`, dataset: { sort: key } }, col.label);
      th.append(el("span", { class: "arrow" }, st.sort.key === key ? (st.sort.dir > 0 ? "▲" : "▼") : ""));
      head.append(th);
    }
    const body = this._el("body");
    body.textContent = "";
    const frag = document.createDocumentFragment();
    for (const g of rows) {
      const id = String(g.group_id);
      const tr = el("tr", { class: "row", dataset: { groupId: id } });
      if (st.selected.has(id)) tr.classList.add("selected");
      const cb = el("input", { type: "checkbox", dataset: { groupRow: id } });
      cb.checked = st.selected.has(id);
      tr.append(el("td", { class: "check" }, cb));
      tr.append(el("td", {}, el("a", {
        href: `/config/zha/group/${encodeURIComponent(id)}`, dataset: { nav: "1" }, title: "Open this group in ZHA",
      }, g.name || hexGroupId(id))));
      tr.append(el("td", { class: "minor" }, el("span", { class: "label" }, "Group ID: "), hexGroupId(id)));
      tr.append(el("td", { class: "num minor" }, el("button", {
        class: "linkish", dataset: { showGroup: id }, title: "Show this group's devices",
      }, plural((g.members || []).length, "device", "devices"))));
      tr.append(el("td", { class: "actions" }));
      frag.append(tr);
    }
    body.append(frag);
    this._status(rows.length ? "" : (this._groups.length ? "No groups match." : "No Zigbee groups yet. Create one above."));
    this._el("footer").textContent = this._loaded && !this._error
      ? `${plural(this._groups.length, "Zigbee group", "Zigbee groups")}. ZHA can't rename a group; delete it and create a new one instead.`
      : "";
  }

  // The selected rows still in view (filtered in, not collapsed).
  _selectedRows() {
    const st = this._state.members;
    if (!st.selected.size) return [];
    return this._visibleRows().filter((r) => st.selected.has(r.key) && !st.collapsed.has(r.group));
  }

  _syncControls() {
    if (this._mode === "members") {
      const rows = this._selectedRows();
      const devices = new Set(rows.map((r) => r.endpoint));
      this._el("selection").textContent = devices.size
        ? `${plural(devices.size, "device", "devices")} selected`
        : "No devices selected";
      const bulk = this._el("bulk-group");
      this._groupOptions(bulk, null, "Add to group…");
      const add = this.shadowRoot.querySelector('[data-action="add"]');
      add.disabled = this._busy || !devices.size || bulk.value === "__pick__";
      const remove = this.shadowRoot.querySelector('[data-action="remove"]');
      remove.disabled = this._busy || !rows.some((r) => r.group);
      for (const select of this.shadowRoot.querySelectorAll("select[data-add-row]")) {
        select.disabled = this._busy || select.options.length < 2;
      }
      for (const btn of this.shadowRoot.querySelectorAll("[data-remove-row]")) btn.disabled = this._busy;
      for (const btn of this.shadowRoot.querySelectorAll('[data-action="refresh"]')) btn.disabled = this._busy;
    } else {
      const st = this._state.groups;
      this.shadowRoot.querySelector('[data-action="create"]').disabled =
        this._busy || !!this._error || !this._el("new-name").value.trim();
      const del = this.shadowRoot.querySelector('[data-action="ask-delete"]');
      del.disabled = this._busy || !st.selected.size;
      del.textContent = st.selected.size ? `Delete ${plural(st.selected.size, "group", "groups")}` : "Delete selected";
      if (!st.selected.size) st.confirming = false;
      this._el("confirm").classList.toggle("open", st.confirming);
      if (st.confirming) {
        const names = [...st.selected].map((id) => this._groupName(id)).sort(cmp);
        const shown = names.length > 5 ? `${names.slice(0, 5).join(", ")} and ${names.length - 5} more` : names.join(", ");
        this._el("confirm-text").textContent =
          `Delete ${plural(names.length, "Zigbee group", "Zigbee groups")} (${shown})? `
          + (names.length === 1
            ? "Its devices are taken out of it and its group entity is removed."
            : "Their devices are taken out of them and their group entities are removed.")
          + " This can't be undone.";
      }
      this.shadowRoot.querySelector('[data-action="delete"]').disabled = this._busy;
    }
  }

  // -- changes ----------------------------------------------------------

  _member(endpoint) {
    const [ieee, ep] = endpoint.split("/");
    return { ieee, endpoint_id: Number(ep) };
  }

  async _add(endpoints, groupId) {
    const already = this._membersOf(groupId);
    const adding = [...new Set(endpoints)].filter((e) => !already.has(e));
    const name = this._groupName(groupId);
    if (!adding.length) {
      this._toast(`Already in ${name}`);
      return true;
    }
    const res = await this._call(
      { type: ZHA_WS.MEMBERS_ADD, group_id: Number(groupId), members: adding.map((e) => this._member(e)) },
      `Added ${plural(adding.length, "device", "devices")} to ${name}`,
    );
    await this._fetch();
    return !!res;
  }

  async _remove(rows) {
    const byGroup = new Map();
    for (const r of rows) {
      if (!r.group) continue;
      if (!byGroup.has(r.group)) byGroup.set(r.group, []);
      byGroup.get(r.group).push(r.endpoint);
    }
    let ok = true;
    let removed = 0;
    for (const [groupId, endpoints] of byGroup) {
      const res = await this._call({
        type: ZHA_WS.MEMBERS_REMOVE, group_id: Number(groupId), members: endpoints.map((e) => this._member(e)),
      });
      if (res) removed += endpoints.length;
      else ok = false;
    }
    if (removed) {
      this._toast(byGroup.size === 1
        ? `Removed ${plural(removed, "device", "devices")} from ${this._groupName([...byGroup.keys()][0])}`
        : `Removed ${plural(removed, "device", "devices")} from their groups`);
    }
    await this._fetch();
    return ok;
  }

  async _createGroup() {
    const input = this._el("new-name");
    const name = input.value.trim();
    if (!name || this._busy) return;
    if (this._groups.some((g) => (g.name || "").toLowerCase() === name.toLowerCase())) {
      this._toast(`There's already a group called ${name}`);
      return;
    }
    const res = await this._call({ type: ZHA_WS.GROUP_ADD, group_name: name }, `Created ${name}`);
    if (res) {
      input.value = "";
      this._syncControls();
      input.focus();
    }
    await this._fetch();
  }

  _showGroup(groupId) {
    const st = this._state.members;
    st.filter = "";
    st.kind = "";
    st.collapsed.delete(groupId);
    this._saveCollapsed();
    this.dispatchEvent(new CustomEvent("area-manager-view", {
      detail: { view: "zigbee" }, bubbles: true, composed: true,
    }));
    requestAnimationFrame(() => {
      const row = [...this.shadowRoot.querySelectorAll("tr.group")].find((tr) => tr.dataset.groupToggle === groupId);
      if (row) row.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  // -- events -----------------------------------------------------------

  async _onClick(ev) {
    const path = ev.composedPath();
    const find = (key) => path.find((n) => n.dataset && n.dataset[key] !== undefined);
    const link = find("nav");
    if (link) {
      if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button) return;
      ev.preventDefault();
      history.pushState(null, "", link.getAttribute("href"));
      window.dispatchEvent(new CustomEvent("location-changed"));
      return;
    }
    if (path[0]?.type === "checkbox" || path[0]?.tagName === "SELECT") return;
    const action = find("action")?.dataset.action;
    if (action === "refresh") {
      await this._fetch();
      return;
    }
    if (this._mode === "members") await this._onMembersClick(find, action);
    else await this._onGroupsClick(find, action);
  }

  async _onMembersClick(find, action) {
    const st = this._state.members;
    const group = find("groupToggle");
    if (group) {
      const key = group.dataset.groupToggle;
      this._setCollapsed(key, !st.collapsed.has(key));
      this._render();
      return;
    }
    const sortTh = find("sort");
    if (sortTh) {
      const key = sortTh.dataset.sort;
      if (st.sort.key === key) st.sort.dir = -st.sort.dir;
      else st.sort = { key, dir: MEMBER_COLUMNS[key].firstDir || 1 };
      this._render();
      return;
    }
    const removeBtn = find("removeRow");
    if (removeBtn) {
      const row = this._rows().find((r) => r.key === removeBtn.dataset.removeRow);
      if (row) await this._remove([row]);
      return;
    }
    switch (action) {
      case "toggle-groups": {
        const keys = new Set([...this.shadowRoot.querySelectorAll("tr.group")].map((tr) => tr.dataset.groupToggle));
        const allCollapsed = [...keys].every((k) => st.collapsed.has(k));
        for (const k of keys) this._setCollapsed(k, !allCollapsed);
        this._render();
        break;
      }
      case "add": {
        const groupId = this._el("bulk-group").value;
        if (groupId === "__pick__") return;
        if (await this._add(this._selectedRows().map((r) => r.endpoint), groupId)) {
          st.selected.clear();
          this._render();
        }
        break;
      }
      case "remove":
        if (await this._remove(this._selectedRows())) {
          st.selected.clear();
          this._render();
        }
        break;
      default:
        break;
    }
  }

  async _onGroupsClick(find, action) {
    const st = this._state.groups;
    const sortTh = find("sort");
    if (sortTh) {
      const key = sortTh.dataset.sort;
      if (st.sort.key === key) st.sort.dir = -st.sort.dir;
      else st.sort = { key, dir: ZGROUP_COLUMNS[key].firstDir || 1 };
      this._render();
      return;
    }
    const show = find("showGroup");
    if (show) {
      this._showGroup(show.dataset.showGroup);
      return;
    }
    switch (action) {
      case "create":
        await this._createGroup();
        break;
      case "ask-delete":
        st.confirming = true;
        this._syncControls();
        break;
      case "cancel-delete":
        st.confirming = false;
        this._syncControls();
        break;
      case "delete": {
        const ids = [...st.selected].map(Number);
        const res = await this._call(
          { type: ZHA_WS.GROUP_REMOVE, group_ids: ids },
          `Deleted ${plural(ids.length, "Zigbee group", "Zigbee groups")}`,
        );
        if (res) {
          st.selected.clear();
          st.confirming = false;
        }
        await this._fetch();
        break;
      }
      default:
        break;
    }
  }

  async _onChange(ev) {
    const target = ev.composedPath()[0];
    const ds = target.dataset || {};
    if (target === this._el("member-kind")) {
      this._state.members.kind = target.value;
      this._render();
      return;
    }
    if (target === this._el("bulk-group")) {
      this._syncControls();
      return;
    }
    if (ds.addRow !== undefined) {
      // One device, straight from its row.
      const row = this._rows().find((r) => r.key === ds.addRow);
      const groupId = target.value;
      target.value = "__pick__";
      if (row && groupId !== "__pick__") await this._add([row.endpoint], groupId);
      return;
    }
    if (this._mode === "members") {
      const st = this._state.members;
      const set = (key) => (target.checked ? st.selected.add(key) : st.selected.delete(key));
      if (ds.row !== undefined) set(ds.row);
      else if (ds.groupSelect !== undefined) {
        for (const r of this._visibleRows()) if (r.group === ds.groupSelect) set(r.key);
      } else if (ds.selectAll !== undefined) {
        for (const r of this._visibleRows()) if (!st.collapsed.has(r.group)) set(r.key);
      } else return;
      this._render();
      return;
    }
    const st = this._state.groups;
    const set = (key) => (target.checked ? st.selected.add(key) : st.selected.delete(key));
    if (ds.groupRow !== undefined) set(ds.groupRow);
    else if (ds.selectAllGroups !== undefined) {
      for (const g of this._visibleGroups()) set(String(g.group_id));
    } else return;
    this._render();
  }
}

if (!customElements.get("area-manager-zigbee")) {
  customElements.define("area-manager-zigbee", AreaManagerZigbee);
}

if (!customElements.get("area-manager-panel")) {
  customElements.define("area-manager-panel", AreaManagerPanel);
}

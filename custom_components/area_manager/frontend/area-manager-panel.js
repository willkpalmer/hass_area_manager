// WP Area Manager - sidebar panel.
//
// A self-contained web component (no build step, no external libraries),
// laid out like WP Log Doctor's panel, with three views:
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
//
// Everything comes from one WebSocket subscription (area_manager/subscribe)
// that sends every device, area and floor straight away and again after
// every change, wherever it was made, so the lists are always live.
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
};

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
.card > .toolbar, .card > .confirm, .card > .footer { flex: none; }
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
  </div>

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
    this.shadowRoot.addEventListener("focusin", (ev) => {
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
    const view = (DEVICE_VIEWS[hash] || hash === "areas") ? hash : this._view;
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
    const counts = this.shadowRoot.querySelectorAll("[data-count]");
    for (const span of counts) {
      if (!this._loaded) { span.textContent = ""; continue; }
      const n = { devices: devices.length, unassigned, areas: this._data.areas.length }[span.dataset.count];
      span.textContent = span.dataset.count === "unassigned"
        ? (n ? `(${n} without)` : "")
        : `(${n})`;
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

if (!customElements.get("area-manager-panel")) {
  customElements.define("area-manager-panel", AreaManagerPanel);
}

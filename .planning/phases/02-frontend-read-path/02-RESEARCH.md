# Phase 2: Frontend Read Path - Research

**Researched:** 2026-03-16
**Domain:** Vanilla JS browser frontend, ESPHome web_server v3 SSE/REST, static file serving
**Confidence:** HIGH (all critical facts verified on live device in Phase 1; supplemented with official docs)

---

## Summary

Phase 2 builds a pin grid UI that displays all 11 GPIO entities (9 output switches, 2 input binary_sensors) with real-time state from the device already running at 10.1.1.162. All API shape facts are known from Phase 1 live verification — the SSE event schema, REST endpoint patterns, and CORS posture are confirmed, not assumed.

The frontend is a single vanilla JS file with zero dependencies. No framework, no build step, no npm. The full feature set (pin grid, HIGH/LOW badges, type labels, SSE real-time, connection status) fits comfortably in under 200 lines. The device's `/events` SSE endpoint emits all 11 entity states immediately on connect, making it the state hydration mechanism on both initial load and reconnect — no REST polling required for initial state.

The key architectural question for Phase 2 is the development serving strategy: serve the frontend file from a local dev server (file:/// or python http.server) calling the device cross-origin (CORS is confirmed present), or embed it in device flash via `js_include`. Both work. The recommended approach is: develop from a local file with cross-origin calls to the device, then embed in device flash via `js_include` when delivering the final artifact. This avoids a reflash on every JS edit during development.

**Primary recommendation:** Write a single `index.html` with inline JS and CSS. Develop against the live device from `file://` or a local server. Use `js_include` in the YAML for final delivery. Do not attempt `local: true` combined with `js_include` — this is a known broken combination in ESPHome (issue #5704).

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| READ-01 | User can view a pin grid displaying all ESPHome-configured GPIO entities with their name and current state | SSE sends all 11 entity states on connect; parse `name` and `state` fields from confirmed SSE schema |
| READ-02 | Each pin displays a HIGH/LOW color-coded visual badge for at-a-glance state reading | SSE `state` field is "ON"/"OFF" string; `value` field is boolean — both usable for badge color |
| READ-03 | Each pin displays its type (output switch or input binary_sensor) as a visual label | SSE `domain` field is "switch" or "binary_sensor" — use this for type label |
| READ-04 | User can see a connection status indicator (connected / disconnected / reconnecting) — no silent stale state | EventSource `onopen`, `onerror`, and `readyState` give all three states; implement visible banner |
| READ-05 | Input pin states update in real-time via SSE (`EventSource`) with automatic reconnection and state resync on reconnect | EventSource reconnects automatically; device sends all states on every new connect — resync is free |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Browser `EventSource` API | Built-in (all modern browsers) | SSE subscription to `/events` | Native API, handles reconnection; confirmed working against this device in Phase 1 |
| Browser `fetch()` API | Built-in | REST calls (Phase 3); CORS preflight-free for same-origin POSTs | Native, no polyfills needed on LAN browser targets |
| CSS Grid | Built-in | Pin card layout | Best fit for card grids with auto-fill; no JS needed |
| Vanilla HTML/JS/CSS | None | Entire frontend | No framework justified at this complexity level; fits flash constraints |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `python -m http.server` | Python stdlib | Local dev server for file serving | Only during development; zero install |
| `js_include` (ESPHome YAML) | ESPHome 2026.2.x | Embed JS into device flash | Final delivery artifact; requires YAML rebuild and reflash |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vanilla JS | React/Vue/Svelte | Bundles add 150-300KB gzipped; unjustifiable for 11 entities; no state complexity; flash constraints |
| Native EventSource | `reconnecting-eventsource` npm package | npm package adds a build step; native EventSource is sufficient; manual reconnect is ~10 lines |
| CSS Grid | Table layout | Grid is cleaner for card layouts; Table is semantically wrong for this UI |
| Inline HTML | Separate html/js/css files | Single file is simpler to embed via `js_include` and simpler to hand-edit; no HTTP requests to device for separate assets |

**Installation:** No npm. No install step. Browsers have all required APIs natively.

---

## Architecture Patterns

### Recommended Project Structure

```
esp32-gpio-controller/
├── gpio-controller.yaml       # YAML with js_include pointing to gpio-ui.js
├── gpio-ui.js                 # Complete frontend: grid render + SSE + connection banner
└── secrets.yaml               # Git-ignored WiFi credentials
```

The frontend is a single JS file that, when included via `js_include`, ESPHome serves at `/0.js`. The device's built-in `index.html` already loads `/0.js` as a script tag. During development, `gpio-ui.js` can be served from any local server — CORS is present on the device.

Alternative during development: a standalone `index.html` that loads `gpio-ui.js` from the same local dev server. This gives a self-contained developer experience with no need to touch the device.

### Pattern 1: SSE State Hydration (Initial Load + Reconnect)

**What:** Open an `EventSource` to `/events`. On each `state` event, upsert the entity into a JS Map keyed by `name_id`. Render the full grid after the initial burst completes (after first `ping` event or after 500ms debounce). On reconnect, the device re-sends all 11 states — the same upsert logic handles resync automatically.

**When to use:** Always. This is the only state hydration path. No REST polling needed on startup because SSE delivers all states immediately on connect.

**Key insight from Phase 1:** The SSE stream begins with a `ping` event, then immediately emits all 11 `state` events in a single burst, then periodically sends more `ping` events (every 30s). The `ping` event can serve as the "initial burst complete" signal.

**Example:**
```javascript
// Source: ESPHome Web API docs + Phase 1 live device verification
const DEVICE = location.hostname === 'localhost' || location.hostname === ''
  ? '10.1.1.162'      // dev: hardcoded device IP
  : location.host;    // prod: same-origin (served from device)

const pins = new Map(); // name_id -> {name, domain, state, value}
let initialBurstDone = false;

function connectSSE() {
  const es = new EventSource(`http://${DEVICE}/events`);

  es.addEventListener('state', e => {
    const data = JSON.parse(e.data);
    pins.set(data.name_id, {
      name: data.name,
      domain: data.domain,
      state: data.state,   // "ON" / "OFF"
      value: data.value    // true / false
    });
    if (initialBurstDone) renderPin(data.name_id); // live update
  });

  es.addEventListener('ping', () => {
    if (!initialBurstDone) {
      initialBurstDone = true;
      renderGrid(); // render all at once after initial burst
    }
  });

  es.onopen = () => setConnectionStatus('connected');

  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) {
      setConnectionStatus('disconnected');
      // Browser will NOT auto-reconnect when CLOSED
      setTimeout(() => {
        initialBurstDone = false;
        connectSSE();
      }, 3000);
    } else {
      // readyState === CONNECTING — browser is auto-reconnecting
      setConnectionStatus('reconnecting');
    }
  };
}
```

**Critical detail:** When `EventSource.readyState === EventSource.CLOSED` after an error, the browser will NOT auto-reconnect. This happens when the server returns an error response (not just a dropped TCP connection). Manual `setTimeout` reconnect is required for this case.

### Pattern 2: Pin Grid Render

**What:** Build a CSS grid of cards from the `pins` Map. Each card shows: GPIO name, domain type badge, HIGH/LOW state badge.

**When to use:** Called once after initial burst, then incrementally via `renderPin()` on live updates.

**Example:**
```javascript
// Source: MDN CSS Grid + project domain knowledge
function renderGrid() {
  const container = document.getElementById('pin-grid');
  container.innerHTML = '';
  for (const [nameId, pin] of pins) {
    container.appendChild(buildCard(nameId, pin));
  }
}

function buildCard(nameId, pin) {
  const card = document.createElement('div');
  card.className = 'pin-card';
  card.dataset.nameId = nameId;
  const isHigh = pin.value === true;
  card.innerHTML = `
    <span class="pin-name">${pin.name}</span>
    <span class="pin-type ${pin.domain}">${pin.domain === 'switch' ? 'OUTPUT' : 'INPUT'}</span>
    <span class="pin-state ${isHigh ? 'high' : 'low'}">${isHigh ? 'HIGH' : 'LOW'}</span>
  `;
  return card;
}

function renderPin(nameId) {
  const pin = pins.get(nameId);
  const existing = document.querySelector(`[data-nameId="${nameId}"]`);
  if (existing) existing.replaceWith(buildCard(nameId, pin));
  else renderGrid(); // fallback: full re-render
}
```

### Pattern 3: Connection Status Banner

**What:** A fixed-position banner that shows one of three states: connected (hidden or green), reconnecting (yellow), disconnected (red). Never hidden when state is stale.

**When to use:** Always visible in reconnecting/disconnected states. The requirement (READ-04) is "no silent stale state."

**Example:**
```javascript
// Source: project requirement READ-04
function setConnectionStatus(status) {
  const banner = document.getElementById('status-banner');
  banner.className = `status-banner ${status}`;
  const labels = {
    connected: 'Connected',
    reconnecting: 'Reconnecting...',
    disconnected: 'Disconnected — retrying in 3s'
  };
  banner.textContent = labels[status];
}
```

```css
.status-banner { position: fixed; top: 0; left: 0; right: 0; padding: 6px; text-align: center; font-size: 14px; z-index: 100; }
.status-banner.connected { display: none; }
.status-banner.reconnecting { background: #b7791f; color: white; }
.status-banner.disconnected { background: #c53030; color: white; }
```

### Pattern 4: Device Address Resolution

**What:** Determine the device host dynamically to avoid hardcoded IPs in the production artifact, while allowing a dev override.

**When to use:** Always — hardcoded IPs break when embedded on device (same-origin) and when device IP changes.

```javascript
// Production (served from device): location.host === '10.1.1.162'
// Development (served from localhost): location.hostname === 'localhost'
const DEVICE_HOST = (location.hostname === 'localhost' || location.hostname === '')
  ? '10.1.1.162'   // dev override — change to match current device IP
  : location.host; // prod: same-origin from device

const API_BASE = `http://${DEVICE_HOST}`;
```

### Anti-Patterns to Avoid

- **Polling REST for state on load:** The SSE endpoint sends all states immediately on connect. REST polling is redundant and adds latency. Use SSE as the sole state source.
- **`local: true` with `js_include`:** Known broken combination (ESPHome issue #5704). Use `js_include` without `local: true` OR remove `js_include` and rely on `local: true` for the built-in UI only.
- **Ignoring `readyState` in `onerror`:** Without the `CLOSED` vs `CONNECTING` check, you will either double-reconnect (when browser is already reconnecting) or fail to reconnect (when browser gives up). Always check readyState in onerror.
- **Rendering on every individual SSE event during initial burst:** The 11-event initial burst would cause 11 full re-renders. Debounce or use the `ping` event as the "burst complete" signal.
- **Hardcoded device IP in production JS:** When embedded on device via `js_include`, `location.host` is the device's own IP. Use dynamic resolution.
- **Setting `EventSource` URL with `http://` prefix when already same-origin:** Causes a CORS preflight. Use relative URL `/events` when same-origin; absolute URL only during development cross-origin.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE protocol parsing | Custom WebSocket + JSON framing | Native `EventSource` API | Browser handles chunked transfer, event-type routing, retry timing, Last-Event-ID header |
| Reconnection backoff | Custom retry loop with exponential backoff | `EventSource` native reconnect + `setTimeout` on CLOSED | EventSource handles TCP-level drops automatically; only CLOSED state needs manual retry |
| State hydration REST calls | GET each entity individually on load | Listen for SSE burst after connect | Device sends all 11 states on every connect; REST call per entity is 11 HTTP round trips vs 1 SSE connection |
| CSS card layout system | JavaScript position calculation | CSS Grid `auto-fill` + `minmax` | 2 lines of CSS vs 50+ lines of JS; responsive without breakpoints |

**Key insight:** The ESPHome SSE endpoint is designed as the state source: "each time a client connects to the event source the server sends out all current states so that the client can catch up with reality." Building a separate REST polling mechanism fights this design.

---

## Common Pitfalls

### Pitfall 1: EventSource CLOSED State Not Handled

**What goes wrong:** After a device reboot or WiFi hiccup, `onerror` fires with `readyState === CLOSED`. Without manual reconnect logic, the UI freezes forever on stale state with no visible indication.

**Why it happens:** The browser automatically reconnects for TCP-level drops (readyState stays CONNECTING), but stops retrying when the server returns a non-2xx response or the connection is explicitly closed. ESPHome resets its HTTP server on OTA, which the browser treats as a "real" close.

**How to avoid:** In `onerror`, check `readyState`. If `CLOSED`, schedule a `setTimeout` reconnect and show the disconnected banner. Never assume the browser will handle all cases.

**Warning signs:** UI shows state from >30 seconds ago (ping interval is 30s); connection banner absent or stuck on "connected."

### Pitfall 2: Cross-Origin Request for EventSource During Development

**What goes wrong:** Creating `new EventSource('http://10.1.1.162/events')` from a `file:///` page causes a CORS error in some browsers for EventSource specifically, even though CORS is present on the device.

**Why it happens:** `file://` origin is special — some browsers treat `file://` as a null origin and block CORS for `file://` even with `Access-Control-Allow-Origin: *`. This is a browser quirk, not an ESPHome issue.

**How to avoid:** Serve the development HTML from a local HTTP server (not `file://`): `python -m http.server 8080` in the project directory. Then navigate to `http://localhost:8080/index.html`. This gives a legitimate HTTP origin that CORS accepts.

**Warning signs:** DevTools shows "CORS error" or "null origin" in the Network tab.

### Pitfall 3: js_include + local: true Incompatibility

**What goes wrong:** Setting both `local: true` and `js_include` in the YAML causes the included JS to not load. The device embeds a static compressed index page that doesn't include the custom script tag.

**Why it happens:** ESPHome issue #5704 — `local: true` uses a pre-compiled, gzip-compressed index.html that does not have the dynamic `<script src="/0.js">` tag injection. Closed as "stale" in August 2024, not confirmed fixed.

**How to avoid:** Do NOT combine `local: true` with `js_include`. The yaml already has `local: true` for offline capability. When adding `js_include`, remove `local: true`, OR skip embedding entirely (serve from a separate origin using CORS).

**Warning signs:** `gpio-ui.js` logic doesn't execute; device serves the default ESPHome v3 UI.

### Pitfall 4: Initial Burst Causes 11 Re-renders

**What goes wrong:** Calling full `renderGrid()` in the `state` event handler causes the DOM to be rebuilt 11 times on connect.

**Why it happens:** The SSE initial burst fires 11 `state` events synchronously before the first `ping`. Without a burst-detection mechanism, each event triggers a full re-render.

**How to avoid:** Use the `ping` event as the burst-complete signal. Buffer state into the Map during the burst, then do one render when `ping` fires.

### Pitfall 5: URL Encoding in EventSource URLs

**What goes wrong:** `new EventSource('http://10.1.1.162/events')` works fine, but entity name_ids like `switch/GPIO 3` must be URL-encoded in REST calls. Not relevant for SSE itself, but the pattern difference causes bugs when the same name_id is reused for REST in Phase 3.

**How to avoid:** Always URL-encode name_id when building REST URLs: `encodeURIComponent(nameId)` gives `switch%2FGPIO%203`, then the full URL is `/switch/GPIO%203/turn_on`. Note: `encodeURIComponent` encodes the slash — that's wrong. Use the name component only: the domain is a path segment, the entity name goes through `encodeURIComponent`. REST URL: `/${domain}/${encodeURIComponent(name)}/turn_on`.

---

## Code Examples

Verified patterns from live device + official sources:

### Full SSE Event Shape (Confirmed from Phase 1 live device)

```json
// event: state (switch)
{"name_id":"switch/GPIO 3","id":"switch-gpio_3","domain":"switch","name":"GPIO 3","icon":"","entity_category":0,"value":true,"state":"ON","assumed_state":false}

// event: state (binary_sensor)
{"name_id":"binary_sensor/GPIO 20","id":"binary_sensor-gpio_20","domain":"binary_sensor","name":"GPIO 20","icon":"","entity_category":0,"value":true,"state":"ON"}

// event: ping
{"title":"gpio-controller","comment":"","ota":false,"log":true,"lang":"en"}

// SSE header from server
retry: 30000
```

**Field usage:**
- `name_id`: primary key — use this, not `id` (id is deprecated, will be removed in ESPHome 2026.8.0)
- `domain`: "switch" or "binary_sensor" — use for type label (READ-03)
- `name`: "GPIO 3", "GPIO 20" — display name (READ-01)
- `state`: "ON" or "OFF" — text state (READ-02)
- `value`: true or false — boolean state, simpler for conditional logic

### Complete Minimal Frontend (gpio-ui.js)

```javascript
// Source: Phase 1 verified API + MDN EventSource docs
// Serves all READ-01 through READ-05 requirements

const DEVICE_HOST = (location.hostname === 'localhost' || location.hostname === '')
  ? '10.1.1.162'
  : location.host;
const API_BASE = `http://${DEVICE_HOST}`;

const pins = new Map();
let initialBurstDone = false;
let es = null;

function setStatus(status) {
  const b = document.getElementById('status-banner');
  b.className = `status-banner ${status}`;
  b.textContent = { connected: '', reconnecting: 'Reconnecting...', disconnected: 'Disconnected — retrying...' }[status];
}

function buildCard(nameId, pin) {
  const card = document.createElement('div');
  card.className = 'pin-card';
  card.dataset.nameId = nameId;
  const high = pin.value === true;
  card.innerHTML = `
    <div class="pin-name">${pin.name}</div>
    <div class="pin-type ${pin.domain}">${pin.domain === 'switch' ? 'OUTPUT' : 'INPUT'}</div>
    <div class="pin-state ${high ? 'high' : 'low'}">${high ? 'HIGH' : 'LOW'}</div>
  `;
  return card;
}

function renderGrid() {
  const g = document.getElementById('pin-grid');
  g.innerHTML = '';
  for (const [nameId, pin] of pins) g.appendChild(buildCard(nameId, pin));
}

function upsertPin(nameId, pin) {
  pins.set(nameId, pin);
  if (!initialBurstDone) return;
  const el = document.querySelector(`[data-name-id="${nameId}"]`);
  if (el) el.replaceWith(buildCard(nameId, pin));
  else renderGrid();
}

function connect() {
  if (es) { es.close(); es = null; }
  initialBurstDone = false;
  setStatus('reconnecting');
  es = new EventSource(`${API_BASE}/events`);

  es.addEventListener('state', e => {
    const d = JSON.parse(e.data);
    upsertPin(d.name_id, { name: d.name, domain: d.domain, state: d.state, value: d.value });
  });

  es.addEventListener('ping', () => {
    if (!initialBurstDone) { initialBurstDone = true; renderGrid(); }
  });

  es.onopen = () => setStatus('connected');

  es.onerror = () => {
    if (es.readyState === EventSource.CLOSED) {
      setStatus('disconnected');
      setTimeout(connect, 3000);
    } else {
      setStatus('reconnecting');
    }
  };
}

document.addEventListener('DOMContentLoaded', connect);
```

### Minimal HTML Shell (index.html for development)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GPIO Controller</title>
  <style>
    body { font-family: monospace; margin: 0; background: #1a1a1a; color: #eee; }
    #status-banner { position: fixed; top: 0; left: 0; right: 0; padding: 6px; text-align: center; font-size: 13px; z-index: 100; display: none; }
    #status-banner.reconnecting { display: block; background: #b7791f; color: #fff; }
    #status-banner.disconnected { display: block; background: #c53030; color: #fff; }
    #pin-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; padding: 60px 16px 16px; }
    .pin-card { background: #2d2d2d; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
    .pin-name { font-size: 15px; font-weight: bold; }
    .pin-type { font-size: 11px; padding: 2px 6px; border-radius: 3px; display: inline-block; }
    .pin-type.switch { background: #2b6cb0; color: #fff; }
    .pin-type.binary_sensor { background: #276749; color: #fff; }
    .pin-state { font-size: 13px; font-weight: bold; padding: 4px 8px; border-radius: 4px; text-align: center; }
    .pin-state.high { background: #276749; color: #fff; }
    .pin-state.low { background: #4a5568; color: #aaa; }
  </style>
</head>
<body>
  <div id="status-banner" class="status-banner reconnecting">Connecting...</div>
  <div id="pin-grid"></div>
  <script src="gpio-ui.js"></script>
</body>
</html>
```

### ESPHome YAML Addition for Production Embed

```yaml
# Source: ESPHome web_server component docs
# Add js_include; REMOVE local: true (they are incompatible — ESPHome issue #5704)
web_server:
  port: 80
  version: 3
  # local: true     # REMOVED — incompatible with js_include
  js_include: gpio-ui.js   # served as /0.js; loaded by ESPHome's index.html
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WebSocket at `/ws` | SSE at `/events` | ESPHome v3 (2023.9+) | EventSource is simpler: built-in reconnect, text protocol, no framing code |
| `id` field as entity key | `name_id` field | ESPHome 2025.x (deprecation notice) | Use `name_id`; `id` will be removed in ESPHome 2026.8.0 |
| REST GET poll on page load | SSE initial burst as hydration | Always been SSE-first design | SSE sends all states on connect — REST polling is never needed |
| `web_server: version:` unset | `version: 3` explicit | ESPHome default changed silently | Always set version explicitly in YAML |

**Deprecated/outdated:**
- `id` field in SSE events: present during deprecation period, will be removed ESPHome 2026.8.0 — use `name_id` exclusively
- `web_server: local: true` with `js_include`: broken combination; avoid
- REST polling for initial state: anti-pattern; SSE burst handles this

---

## Open Questions

1. **Does `js_include` load after ESPHome's default v3 UI JS or instead of it?**
   - What we know: `js_include` adds a `<script src="/0.js">` tag to ESPHome's index.html. The default v3 UI (a Lit Element web component) runs in the same page.
   - What's unclear: Does our JS override the default UI's DOM, or do both render? Will there be a conflict between the default UI rendering `<esphome-root>` and our `#pin-grid`?
   - Recommendation: Test with a minimal `js_include` that logs to console before building the full UI. If conflict: use an empty HTML shell approach (serve from separate origin) instead. Alternative: check if ESPHome v3 `js_url: ""` suppresses the default UI.

2. **Does removing `local: true` break offline operation?**
   - What we know: `local: true` embeds the ESPHome UI JS in device flash; without it, the default UI loads JS from `oi.esphome.io`. Our custom `gpio-ui.js` is embedded via `js_include` regardless.
   - What's unclear: When using our custom UI exclusively, does the ESPHome UI JS from `oi.esphome.io` need to load for `/events` or REST to function?
   - Recommendation: The REST and SSE APIs are served by the ESPHome C++ server, not by the JS. Our custom frontend will work fully offline — the oi.esphome.io request is only for ESPHome's own UI JS, which we're replacing.

3. **SSE timing: what if ping never fires on reconnect?**
   - What we know: Live device sends ping immediately on connect (before state events), then every 30s. This is the burst-complete signal.
   - What's unclear: Is this timing guaranteed? Could the device send states before the first ping?
   - Recommendation: Add a 500ms `setTimeout` fallback: if ping hasn't fired within 500ms of first state event, set `initialBurstDone = true` and render anyway.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — vanilla JS, no test runner; manual browser verification |
| Config file | none |
| Quick run command | Open `index.html` via local server, inspect DevTools console |
| Full suite command | Full manual checklist (see below) |

This frontend has no automated test framework appropriate for a no-build-step vanilla JS file targeting an embedded device. Validation is manual browser verification against the live device at 10.1.1.162.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| READ-01 | Pin grid renders all 11 GPIO entities with name and current state | manual-smoke | n/a — browser visual | ❌ Wave 0 |
| READ-02 | Each pin shows HIGH/LOW color-coded badge | manual-smoke | n/a — browser visual | ❌ Wave 0 |
| READ-03 | Each pin shows OUTPUT/INPUT type label | manual-smoke | n/a — browser visual | ❌ Wave 0 |
| READ-04 | Connection status banner shows connected/reconnecting/disconnected | manual-smoke | n/a — network kill test | ❌ Wave 0 |
| READ-05 | Input pin state updates in real-time; reconnects after device reboot | manual-smoke | n/a — physical stimulation | ❌ Wave 0 |

**Justification for manual-only:** The test surface requires a live device (10.1.1.162), physical GPIO stimulation for binary_sensor state changes, and network interruption simulation. No mock-based unit tests are warranted for a 200-line DOM manipulation script at this scale.

### Sampling Rate

- **Per task commit:** Load `http://localhost:8080` and visually confirm the feature under development renders correctly
- **Per wave merge:** Full manual checklist below
- **Phase gate:** All manual checklist items pass before marking READ-01 through READ-05 complete

### Manual Verification Checklist (Phase Gate)

```
[ ] Grid renders: all 11 pins appear (GPIO 0,1,3,4,5,6,7,10,11,20,21)
[ ] State correct: GPIO 3 was toggled ON in Phase 1; badge shows HIGH
[ ] Type labels: GPIO 0-11 show "OUTPUT"; GPIO 20-21 show "INPUT"
[ ] Color codes: HIGH badges are green; LOW badges are grey/dark
[ ] Status banner: hidden or not visible when connected
[ ] Kill WiFi: banner transitions to "Reconnecting..." within 5s
[ ] Restore WiFi: banner returns to hidden; grid shows current state
[ ] Device reboot: banner shows disconnected, then reconnects, grid refreshes
[ ] Input pin live update: bridge GPIO 20 to GND; card flips to LOW within 2s
[ ] DevTools console: no uncaught errors during normal operation
```

### Wave 0 Gaps

- [ ] `esp32-gpio-controller/index.html` — development shell (local server origin)
- [ ] `esp32-gpio-controller/gpio-ui.js` — complete frontend implementation
- [ ] Local dev server: `python -m http.server 8080` in `esp32-gpio-controller/` directory

---

## Sources

### Primary (HIGH confidence)

- Phase 1 live device verification (01-02-SUMMARY.md) — SSE event shape, ping timing, CORS headers, REST endpoint behavior all confirmed on ESPHome 2026.2.x at 10.1.1.162
- [ESPHome Web API docs](https://esphome.io/web-api/) — REST endpoint patterns, SSE event types, `name_id` deprecation of `id` field, entity-level GET responses
- [MDN EventSource / javascript.info SSE guide](https://javascript.info/server-sent-events) — EventSource readyState values, CLOSED vs CONNECTING distinction, manual reconnect pattern

### Secondary (MEDIUM confidence)

- [ESPHome web_server component docs](https://esphome.io/components/web_server/) — `js_include`, `css_include`, `local`, `version` option semantics
- [ESPHome issue #5704](https://github.com/esphome/issues/issues/5704) — `local: true` + `js_include` incompatibility; closed August 2024 as "stale" (not confirmed fixed)

### Tertiary (LOW confidence)

- WebSearch results on `js_include` development workflow patterns — community patterns, not officially documented iteration workflow

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all browser APIs are stable; confirmed working against live device
- Architecture: HIGH — SSE event shape and REST patterns confirmed on live hardware; ESPHome design intent confirmed in docs
- Pitfalls: HIGH — CLOSED/CONNECTING distinction is specified in HTML Standard; js_include+local:true bug is documented in ESPHome issue tracker
- File serving strategy: MEDIUM — js_include behavior and interaction with v3 default UI needs live verification (Open Question 1)

**Research date:** 2026-03-16
**Valid until:** 2026-06-16 (stable browser APIs; ESPHome v3 API stable; only risk is ESPHome updates changing `id` deprecation timeline)

# Phase 3: Frontend Write Path - Research

**Researched:** 2026-03-16
**Domain:** Vanilla JS fetch() POST to ESPHome REST API; toggle UX; concurrent load verification
**Confidence:** HIGH — API behavior confirmed on live hardware in Phase 1; code patterns draw from existing Phase 2 code

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WRITE-01 | User can toggle any output pin on or off via a button that sends a REST POST to the ESP32-C3 | REST POST pattern confirmed on live device; `domain === 'switch'` filter identifies output pins; fetch() with empty body works natively |
</phase_requirements>

---

## Summary

Phase 3 adds one user-visible capability: toggle buttons on output pin cards (domain === 'switch'). Input pins (domain === 'binary_sensor') remain read-only — no button is rendered for them. The REST API surface is fully confirmed from Phase 1 live hardware testing, so there is no speculation about endpoint behavior. The primary implementation work is: (1) extend `buildCard()` to emit a button element for switch pins, (2) wire a click handler that calls `fetch()` with the correct POST shape, (3) add debouncing to prevent rapid-fire requests overwhelming the ESP32-C3 TCP stack, and (4) show visible error feedback when the POST fails.

Phase 3 also includes the concurrent load stability test: browser SSE connection open while HA native_api is connected simultaneously, verified stable over 10 minutes. This is a verification task, not a code task — it requires the user on live hardware.

The state update feedback loop is already built: SSE delivers state events whenever a switch changes. After a successful POST, the device will emit a state SSE event, which the existing `upsertPin()` path will handle. No additional state management code is needed for confirmed-OK responses.

**Primary recommendation:** Extend the existing `buildCard()` function with a conditional button element for switch-domain pins; add a module-level debounce guard; handle POST errors with a transient inline error message on the card.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native `fetch()` | Browser built-in | HTTP POST to ESPHome REST | No dependency; browser handles Content-Length automatically; confirmed working cross-origin with CORS: * |
| Native `EventSource` | Browser built-in | SSE state feedback after toggle | Already in use (Phase 2); device emits state event after switch toggles |

### No External Libraries Needed

This phase adds toggle buttons to an existing vanilla JS frontend. No framework, no build step, no new packages. The entire implementation fits within `gpio-ui.js`.

---

## Architecture Patterns

### Pattern 1: Conditional Button in buildCard()

**What:** `buildCard()` already builds the full card HTML string. Extend it with a button element that is only emitted when `pin.domain === 'switch'`.

**When to use:** Every card render — `buildCard()` is called both on initial `renderGrid()` and on every `upsertPin()` live update.

**Confirmed API shape (Phase 1 live hardware):**
```
POST http://10.1.1.162/switch/GPIO%203/toggle
Content-Length: 0   (browser fetch() sends this automatically with empty body)
Response: HTTP 200
```

**URL construction from name_id:**
```
name_id: "switch/GPIO 3"
URL segment: "GPIO%203"  (encodeURIComponent applied to the name portion only)

Full URL: API_BASE + '/' + name_id.replace(' ', '%20') + '/toggle'
```

The cleanest URL construction using the already-stored `name_id` field:
```javascript
// name_id is "switch/GPIO 3" — the domain prefix is already present
// ESPHome REST path mirrors the name_id exactly
var url = API_BASE + '/' + encodeURIComponent(pin.name_id).replace(/%2F/g, '/') + '/toggle';
```

Or more directly, since name_id contains the full path with domain prefix:
```javascript
// name_id "switch/GPIO 3" -> /switch/GPIO%203/toggle
var parts = nameId.split('/');  // ["switch", "GPIO 3"]
var url = API_BASE + '/' + parts[0] + '/' + encodeURIComponent(parts[1]) + '/toggle';
```

**Example button element in buildCard():**
```javascript
function buildCard(nameId, pin) {
  var card = document.createElement('div');
  card.className = 'pin-card';
  card.dataset.nameId = nameId;
  var high = pin.value === true;
  var toggleBtn = pin.domain === 'switch'
    ? '<button class="toggle-btn" data-name-id="' + nameId + '">Toggle</button>'
    : '';
  card.innerHTML =
    '<div class="pin-name">' + pin.name + '</div>' +
    '<div class="pin-type ' + pin.domain + '">' +
      (pin.domain === 'switch' ? 'OUTPUT' : 'INPUT') +
    '</div>' +
    '<div class="pin-state ' + (high ? 'high' : 'low') + '">' +
      (high ? 'HIGH' : 'LOW') +
    '</div>' +
    toggleBtn;
  return card;
}
```

**Note on innerHTML string concatenation:** Phase 2 established this pattern deliberately — it avoids template literal backtick escaping issues in the ESPHome js_include embedded context.

### Pattern 2: Event Delegation for Toggle Clicks

**What:** One click listener on `#pin-grid` (the container), not one listener per button. Buttons are destroyed and recreated on every `upsertPin()` call (they're rebuilt with `replaceWith(buildCard(...))`), so per-button listeners would be silently lost on state updates.

**Why event delegation is required here:** The existing `upsertPin()` pattern calls `existing.replaceWith(buildCard(nameId, pin))` — the old DOM node (and any listeners on it) is discarded. Delegating to the stable `#pin-grid` parent avoids the "lost listener" problem entirely.

```javascript
document.getElementById('pin-grid').addEventListener('click', function(e) {
  var btn = e.target.closest('.toggle-btn');
  if (!btn) return;
  var nameId = btn.dataset.nameId;
  sendToggle(nameId);
});
```

### Pattern 3: Debounce Guard (Module-Level Set)

**What:** A module-level `Set` of `nameId` strings currently in-flight. Before sending a POST, check the set; if the nameId is present, return early. Clear the entry after the fetch resolves (success or error).

**Why:** The ESP32-C3 TCP stack can queue and process requests faster than it can execute the relay, but a burst of rapid clicks can fill the socket buffer. The PITFALLS.md documents: "Creating one HTTP request per pin toggle... breaks when user clicks faster than ~200ms per toggle."

**A Set-based in-flight guard (not a timer) is preferred over setTimeout debounce** because:
- It prevents duplicate concurrent requests for the same pin
- It naturally clears when the request completes (not after an arbitrary timer window)
- It allows different pins to toggle simultaneously

```javascript
var inFlight = new Set();

function sendToggle(nameId) {
  if (inFlight.has(nameId)) return;  // already in flight for this pin
  inFlight.add(nameId);

  var parts = nameId.split('/');
  var url = API_BASE + '/' + parts[0] + '/' + encodeURIComponent(parts[1]) + '/toggle';

  fetch(url, { method: 'POST' })
    .then(function(res) {
      if (!res.ok) showToggleError(nameId, 'HTTP ' + res.status);
    })
    .catch(function() {
      showToggleError(nameId, 'Unreachable');
    })
    .finally(function() {
      inFlight.delete(nameId);
    });
}
```

**Note on Content-Length:** Confirmed in Phase 1 — browser `fetch()` with `method: 'POST'` and no body automatically sets `Content-Length: 0`. No manual header required from JS (only needed in curl).

### Pattern 4: Error Feedback

**What:** On POST failure (non-200 or network error), show a transient error indicator on the affected card. Do not alter the pin state in the Map — the SSE stream is the source of truth for state. The error is display-only.

**Options:**
1. Inline text in the card (e.g., a `.toggle-error` div set to `display: block` for 3 seconds)
2. A global error banner (shares the existing `#status-banner` slot — but that slot is used for connection state)

**Recommendation:** Add a separate transient per-card error element. Since cards are rebuilt on every SSE state update, the error will naturally disappear when the device confirms the new state (triggering a state SSE event that rebuilds the card). For failure cases where no state event arrives, use `setTimeout` to clear after 3 seconds.

```javascript
function showToggleError(nameId, msg) {
  var card = document.querySelector('[data-name-id="' + CSS.escape(nameId) + '"]');
  if (!card) return;
  var err = card.querySelector('.toggle-error');
  if (!err) {
    err = document.createElement('div');
    err.className = 'toggle-error';
    card.appendChild(err);
  }
  err.textContent = msg;
  setTimeout(function() { err.textContent = ''; }, 3000);
}
```

**Note on CSS.escape():** `nameId` values are like `"switch/GPIO 3"` — the space and slash require escaping in a CSS selector. `CSS.escape()` is available in all modern browsers (not IE11, which is not a concern here).

### Pattern 5: Visual Button State During In-Flight Request

**What:** While a toggle POST is in flight, disable the button on the card to prevent re-clicks.

**Implementation:** Since the button is identified by `data-name-id`, the click handler can disable it after confirming it's not already in-flight:

```javascript
document.getElementById('pin-grid').addEventListener('click', function(e) {
  var btn = e.target.closest('.toggle-btn');
  if (!btn) return;
  var nameId = btn.dataset.nameId;
  if (inFlight.has(nameId)) return;
  btn.disabled = true;  // visual feedback; button re-enabled when card is rebuilt by SSE
  sendToggle(nameId);
});
```

The button does not need to be manually re-enabled on success — the SSE state event will trigger `upsertPin()` which calls `replaceWith(buildCard(...))`, creating a fresh enabled button. On error, re-enable manually in `showToggleError()`.

### Recommended Project Structure

No structural changes from Phase 2. All toggle logic goes in `gpio-ui.js`. The file grows from ~115 lines to ~160-180 lines.

```
esp32-gpio-controller/
├── gpio-controller.yaml   # No changes needed for WRITE-01
├── index.html             # Add CSS for .toggle-btn and .toggle-error only
└── gpio-ui.js             # Add: inFlight Set, sendToggle(), showToggleError(), event delegation, updated buildCard()
```

### Anti-Patterns to Avoid

- **Per-button addEventListener:** Buttons are rebuilt on every SSE state update. Direct listeners are silently dropped. Use event delegation on `#pin-grid`.
- **Optimistic state update:** Phase 2 state pattern uses SSE as the single source of truth. Do not flip `pin.value` in the Map on click — wait for the SSE state event. (Optimistic UI is WRITE-02, explicitly a v2 requirement, out of scope.)
- **Fetch with manual Content-Length header:** Not needed from browser JS. Phase 1 confirmed browser handles it automatically.
- **`toggle` vs `turn_on`/`turn_off` debate:** Use `toggle` endpoint. It is stateless (no need to know current state) and matches the single-button toggle UX. The device state after toggle is authoritative via SSE. Only use `turn_on`/`turn_off` if implementing explicit ON/OFF buttons (WRITE-02+ territory).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL encoding of "GPIO 3" | Custom string replace | `encodeURIComponent(parts[1])` | Handles all possible name characters; a simple `.replace(' ', '%20')` fails on names with `&`, `+`, `#`, etc. |
| CSS selector escaping for `nameId` | Manual string escaping | `CSS.escape(nameId)` | `nameId` contains `/` and space; unescaped querySelector crashes silently |
| Debounce timing | `setTimeout` countdown | In-flight `Set` guard | A timer-based debounce can still allow two in-flight requests if clicks land just after timer clears; the Set-based guard is strictly correct |

---

## Common Pitfalls

### Pitfall 1: Lost Button Click Listeners After SSE State Update

**What goes wrong:** Developer adds `addEventListener('click', ...)` directly to the button element inside `buildCard()`. When the pin's SSE state event fires, `upsertPin()` calls `replaceWith(buildCard(...))` — the old button DOM node is discarded, taking the listener with it. The new button has no listener. Toggle stops working after any state event.

**Why it happens:** The Phase 2 card-replace pattern is efficient for the read path but breaks direct DOM listeners.

**How to avoid:** Event delegation on the stable `#pin-grid` parent. One listener, wired once on `DOMContentLoaded`, handles all current and future button clicks.

**Warning signs:** Toggle works on first click but stops working after any GPIO state change (because SSE update rebuilt the card).

### Pitfall 2: Slash in `name_id` Breaks querySelector

**What goes wrong:** `document.querySelector('[data-name-id="switch/GPIO 3"]')` — the `/` and space are valid in HTML attribute values but need escaping in CSS selectors. Without `CSS.escape()`, the space causes a browser exception.

**Why it happens:** The existing Phase 2 code uses `[data-name-id="..."]` selector (line 57 in gpio-ui.js). It works there because name_id is used from a variable in a string that happens to work, but for `showToggleError()` the full nameId is interpolated into a querySelector string.

**How to avoid:** Use `CSS.escape(nameId)` in any `querySelector` that uses nameId.

### Pitfall 3: Binary_sensor Pins Rendered with Toggle Button

**What goes wrong:** If the `pin.domain === 'switch'` guard is missing or wrong, input pins get toggle buttons. Clicking them sends a POST to `/binary_sensor/GPIO 20/toggle` which ESPHome will reject (no toggle endpoint for binary_sensors) or worse — it may succeed on an endpoint that exists but has unexpected side effects.

**Why it happens:** A simple "add button to all cards" implementation without domain filtering.

**How to avoid:** In `buildCard()`, the button HTML string is only non-empty when `pin.domain === 'switch'`. The guard is on the stored domain value, which comes from the SSE event's `domain` field (confirmed shape: `"switch"` or `"binary_sensor"`).

### Pitfall 4: ESP32-C3 TCP Stack Overwhelmed by Rapid Clicks

**What goes wrong:** User clicks Toggle 5 times quickly. 5 concurrent POST requests hit the ESP32-C3. The chip's TCP socket buffer can queue a limited number of connections; excess connections are dropped or the chip watchdog-resets.

**Why it happens:** No debounce or in-flight guard on the click handler.

**How to avoid:** The in-flight `Set` guard in `sendToggle()` ensures at most one concurrent POST per pin at any time.

**Warning signs (from PITFALLS.md):** "Device reboots when both a browser is open and HA is connected" — rapid toggle adds to this pressure.

### Pitfall 5: Concurrent Load Crash (native_api + SSE + Toggles)

**What goes wrong:** During the stability test, the device crashes or reboots after some minutes of combined load (browser SSE open + HA native_api connected + occasional toggle).

**Why it happens:** The ESP32-C3 has 400KB SRAM. Each active connection (SSE client, native_api session) consumes socket buffers and RTOS task stack. Toggles add short-lived HTTP connections on top.

**How to avoid:** This is a verification concern, not a code concern. The YAML already has `api: reboot_timeout: 0s` (prevents forced reboot when HA is absent) and `logger: level: DEBUG` (acceptable for dev; could reduce to WARN to free RAM if load test fails). The 10-minute stability test must run with both HA and the browser connected.

**Recovery if the test fails:** Set `logger: level: WARN` in YAML and reflash. This is the most impactful single change for freeing RAM.

---

## State After Toggle: The SSE Feedback Loop

This is a critical architecture point for the planner:

```
User clicks Toggle
  -> sendToggle(nameId) fires fetch() POST to /switch/GPIO%20N/toggle
  -> ESP32 processes toggle, changes pin state
  -> ESP32 emits SSE state event: {"name_id":"switch/GPIO 3","value":false,"state":"OFF",...}
  -> Browser EventSource receives event
  -> upsertPin("switch/GPIO 3", {...}) called
  -> existing card replaced with buildCard() output showing new state
  -> button is naturally re-enabled (new card, fresh button element)
```

No additional state management code is needed. The read path feedback loop handles everything. The only new code is: fire the POST, show error if POST fails.

---

## Concurrent Load Verification Protocol

**Goal:** Confirm the device remains stable under real-world concurrent load for 10 minutes.

**Test setup:**
1. Home Assistant must have the ESP32-C3 configured and its native_api connected (port 6053 active)
2. Browser tab open at `http://10.1.1.162` with SSE connection live (check: status banner is hidden)
3. Optional: perform 2-3 toggle clicks during the test to exercise the write path under load

**Pass criteria:**
- No device reboot or watchdog reset during 10 minutes
- SSE connection remains live (status banner stays hidden, or recovers within 10s if it briefly drops)
- Toggle buttons remain functional throughout

**Detection method:**
- Watch `esphome logs gpio-controller.yaml --device 10.1.1.162` in a terminal during the test
- A reboot produces: `[I][main:018]: ESP-IDF Version 5.x.x` in the log output
- A watchdog reset produces: `Task watchdog got triggered` or `Guru Meditation Error` in the log

**If stability test fails:**
1. First: set `logger: level: WARN` in YAML — reduces RAM usage significantly
2. Second: verify `api: reboot_timeout: 0s` is present (it is — confirmed in YAML)
3. Re-run stability test after reflash

---

## CSS Requirements

Add to `index.html` `<style>` block:

```css
.toggle-btn {
  margin-top: 4px;
  padding: 6px 12px;
  background: #2b6cb0;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: monospace;
  font-size: 12px;
  width: 100%;
}
.toggle-btn:hover {
  background: #2c5282;
}
.toggle-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.toggle-error {
  font-size: 11px;
  color: #fc8181;
  margin-top: 2px;
  min-height: 14px;
}
```

**Design rationale:** Button uses the same blue as `.pin-type.switch` badge (`#2b6cb0`) — visual consistency with the "this is an output" signal. Monospace font matches the rest of the UI.

---

## Validation Architecture

`nyquist_validation` is enabled in config.json.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — vanilla JS, no build step, no test runner |
| Config file | None |
| Quick run command | Manual: open browser DevTools, click Toggle, observe network request |
| Full suite command | Manual: 10-minute concurrent load test |

There is no automated test runner for this project. All validation is manual, consistent with Phase 2 approach (human-verified against live device). The verification gate is observable behavioral truths checked on live hardware.

### Phase Requirements — Test Map

| Req ID | Behavior | Test Type | How to Verify | Manual Reason |
|--------|----------|-----------|---------------|---------------|
| WRITE-01 | Toggle button appears on OUTPUT pin cards only; clicking sends POST; state updates via SSE | Manual on device | Open `http://10.1.1.162`, click Toggle on any switch pin, observe state badge flips; confirm no button on INPUT pins | Requires live device + SSE connection |

### Wave 0 Gaps

None — no test framework to install. Project is vanilla JS with no build infrastructure. All validation is manual against live device, consistent with Phase 2.

---

## Sources

### Primary (HIGH confidence)

- Phase 1 live hardware verification (2026-03-15) — REST POST pattern, Content-Length behavior, CORS, HTTP 200 on success
- Phase 2 `gpio-ui.js` (current codebase) — `buildCard()` signature, `upsertPin()` replace pattern, event shape, `data-name-id` usage
- `STATE.md` accumulated context — confirmed SSE event shape, name_id format, entity list
- `PITFALLS.md` — TCP stack overwhelm from rapid toggle (documented pitfall with prevention)

### Secondary (MEDIUM confidence)

- `CSS.escape()` browser compatibility — available in all modern browsers; MDN documents it as widely supported (not IE11, which is irrelevant here)

### Tertiary (LOW confidence)

- None — all findings are grounded in confirmed live device behavior or existing codebase patterns

---

## Metadata

**Confidence breakdown:**
- REST POST pattern: HIGH — confirmed on live hardware in Phase 1
- Toggle button DOM pattern: HIGH — derived directly from existing buildCard() code
- Event delegation requirement: HIGH — derived from existing replaceWith() pattern in upsertPin()
- Debounce approach: HIGH — documented pitfall in PITFALLS.md; in-flight Set is a well-established pattern
- Concurrent load stability: MEDIUM — YAML settings are confirmed; device behavior under 10-min load is unverified until tested
- CSS.escape() usage: MEDIUM — widely documented; not yet used in this codebase

**Research date:** 2026-03-16
**Valid until:** 2026-06-16 (stable: vanilla JS patterns; ESPHome API confirmed on live device)

# Architecture Research

**Domain:** ESPHome ESP32-C3 GPIO web controller
**Researched:** 2026-03-15
**Confidence:** MEDIUM (training knowledge, August 2025 cutoff — web tools unavailable for live verification; ESPHome web_server/native_api architecture is stable and well-documented)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser (Local Network)                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │               Custom Web Frontend (static HTML/JS)            │  │
│  │  ┌─────────────────┐    ┌──────────────────────────────────┐  │  │
│  │  │  Pin State UI   │    │   WebSocket Client (ws://)       │  │  │
│  │  │  (toggle btns,  │    │   Receives: state_changed events │  │  │
│  │  │   state badges) │    │   Sends: POST /switch/.../toggle │  │  │
│  │  └─────────────────┘    └──────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ WiFi / Local Network
┌──────────────────────────────┼──────────────────────────────────────┐
│  ESP32-C3 (ESPHome firmware) │                                       │
│                              │                                       │
│  ┌───────────────────────────┴──────────────────────────────────┐   │
│  │              web_server component (port 80)                   │   │
│  │   REST endpoints + WebSocket server (/ws or EventSource)     │   │
│  └───────────────────────────┬──────────────────────────────────┘   │
│                              │                                       │
│  ┌───────────────────────────┴──────────────────────────────────┐   │
│  │              ESPHome Core (entity registry)                   │   │
│  │   switch.* entities  |  binary_sensor.* entities             │   │
│  └───────────────────────┬─────────────────────────────────────┘    │
│                          │                                           │
│  ┌───────────────────────┴───────────────────────┐                  │
│  │            native_api component (port 6053)    │                  │
│  │    Protobuf protocol — HA/aioesphomeapi only   │                  │
│  └───────────────────────┬───────────────────────┘                  │
│                          │                                           │
│  ┌───────────────────────┴───────────────────────┐                  │
│  │              GPIO Hardware Layer               │                  │
│  │  GPIO 0-10, 18-21 (physical pins)             │                  │
│  └───────────────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘
                          │ native_api (port 6053)
┌─────────────────────────┴──────────────────────────────────────────┐
│                    Home Assistant (optional)                         │
│   aioesphomeapi client — subscribes to entity state changes         │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| ESPHome YAML config | Defines all entities (switches, binary_sensors), WiFi, both API components | `esphome.yaml` — single source of truth for firmware |
| `web_server` component | Serves HTTP REST API + WebSocket/EventSource for browser clients | Built into ESPHome; runs on port 80 by default |
| `api` (native_api) component | Exposes Protobuf-based API for Home Assistant | Runs on port 6053; parallel to web_server |
| ESPHome entity registry | Central in-firmware store for all switch/sensor state | Generated from YAML; manages GPIO reads/writes |
| Custom web frontend | Purpose-built pin control UI; replaces ESPHome's default dashboard | Static HTML/CSS/JS served from filesystem or embedded |
| GPIO hardware layer | Physical pin I/O on ESP32-C3 | Managed entirely by ESPHome entity definitions |
| Home Assistant | Optional consumer of native_api state stream | External; connects independently of browser frontend |

## Recommended Project Structure

```
esphome-gpio-controller/
├── esphome.yaml              # All ESPHome YAML — entities, WiFi, web_server, native_api
├── secrets.yaml              # WiFi credentials, API key (never commit)
└── web/                      # Custom frontend (served separately or embedded)
    ├── index.html            # Pin grid layout, toggle controls
    ├── main.js               # WebSocket client, state management, toggle handler
    └── styles.css            # Pin state styling (HIGH/LOW visual differentiation)
```

### Structure Rationale

- **esphome.yaml:** ESPHome's build system expects a single root YAML file. All GPIO entities, the web_server block, and the native_api block live here. Splitting into includes is possible but adds friction for a small project.
- **secrets.yaml:** ESPHome convention — credentials referenced as `!secret wifi_password`. Must not be committed to source control.
- **web/:** The custom frontend is decoupled from the firmware. It can be developed and tested against a running device independently. Keeping it in a sibling directory makes the relationship clear without mixing concerns.

## Architectural Patterns

### Pattern 1: WebSocket Event-Driven State Sync

**What:** The browser connects once via WebSocket to `ws://[device-ip]/ws`. ESPHome pushes state change events as JSON whenever any entity changes. The frontend maintains a local state map and updates the UI reactively.

**When to use:** Always — this is the correct pattern for ESPHome's web_server v3. Polling REST endpoints instead is a common anti-pattern that causes missed updates.

**Trade-offs:** Simple to implement; no reconnection handling out of the box (must implement `onclose` reconnect loop); WebSocket drops on device reboot require reconnect logic.

**Example:**
```javascript
// Connect once; ESPHome pushes all state changes
const ws = new WebSocket(`ws://${location.host}/ws`);

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  // msg.type: "state", msg.id: "switch-gpio0", msg.state: true/false
  updatePinUI(msg.id, msg.state);
};

ws.onclose = () => {
  setTimeout(() => reconnect(), 3000); // reconnect on device reboot
};
```

### Pattern 2: REST POST for Actuator Commands

**What:** Output pin toggling is done via HTTP POST to the web_server REST endpoint. The WebSocket then delivers the resulting state change — the frontend does not update optimistically.

**When to use:** Whenever the user toggles an output pin. Do not use GET for state mutation.

**Trade-offs:** Clean separation: commands go out via REST, state comes back via WebSocket. Slightly higher latency than optimistic UI, but correct — hardware confirmation before UI update.

**Example:**
```javascript
async function togglePin(entityId) {
  // POST to toggle — ESPHome flips state and emits WebSocket event
  await fetch(`/switch/${entityId}/toggle`, { method: 'POST' });
  // UI updates when WebSocket delivers the confirmed new state
}
```

### Pattern 3: Entity ID Naming Convention

**What:** ESPHome generates entity IDs from the `name:` field in YAML, slugified. A switch named `"GPIO 0 Output"` becomes `/switch/gpio_0_output/toggle` in the REST API and `switch-gpio_0_output` in WebSocket messages.

**When to use:** Always name entities consistently in YAML so frontend URL construction is predictable.

**Trade-offs:** Slugification rules must be known upfront. Using numeric names like `gpio0` in YAML produces clean IDs. Using human-readable names with spaces requires slug-awareness in the frontend.

## Data Flow

### Toggle Output Pin (Browser to Hardware)

```
User clicks toggle button
    ↓
main.js: POST /switch/gpio_0_output/toggle
    ↓
ESP32-C3 web_server component receives HTTP POST
    ↓
ESPHome entity registry: flip switch state
    ↓
GPIO hardware: write HIGH/LOW to physical pin
    ↓
ESPHome emits state change internally
    ↓
web_server WebSocket: broadcast {"type":"state","id":"switch-gpio_0_output","state":true}
    ↓
Browser WebSocket onmessage: update pin badge in UI
```

### Input Pin State Change (Hardware to Browser)

```
Physical signal change on GPIO input pin
    ↓
ESPHome binary_sensor: detects HIGH/LOW transition
    ↓
ESPHome entity registry: state updated
    ↓
web_server WebSocket: broadcast {"type":"state","id":"binary_sensor-gpio1_input","state":true}
    ↓  (parallel)
native_api: push state update to HA via protobuf (if HA connected)
    ↓
Browser WebSocket onmessage: update input pin badge in UI (real-time)
```

### Initial Page Load (State Hydration)

```
Browser opens index.html
    ↓
WebSocket connects to ws://[device-ip]/ws
    ↓
ESPHome web_server sends initial state dump for all entities
    ↓
main.js: populate pin grid with current states
    ↓
UI ready — subsequent updates arrive via WebSocket push
```

### Key Data Flows

1. **Output control:** Browser → REST POST → ESPHome entity → GPIO write → WebSocket state event → Browser UI
2. **Input monitoring:** GPIO read → ESPHome entity → WebSocket push → Browser UI (and separately → native_api → HA)
3. **State hydration:** WebSocket connect → ESPHome sends full state dump → Browser renders initial pin grid

## Scaling Considerations

This is a local network, single-device debugging tool. Scaling is not a concern. The relevant operational constraint is:

| Concern | Reality | Approach |
|---------|---------|----------|
| Concurrent browser clients | web_server handles 2-3 concurrent WebSocket connections comfortably | Fine for dev tool; don't expect 10+ clients |
| WebSocket stability | ESP32-C3 reboots on OTA flash — clients must reconnect | Implement reconnect loop in frontend |
| Memory | ESP32-C3 has ~400KB RAM; both web_server + native_api running simultaneously consumes significant RAM | Monitor if adding many entities causes crashes |
| native_api + web_server coexistence | Both can run simultaneously; confirmed ESPHome design intent | No architectural change needed |

## Anti-Patterns

### Anti-Pattern 1: Polling REST for Input State

**What people do:** Call `GET /binary_sensor/gpio1_input` on an interval (e.g., every 500ms) to check input pin state.

**Why it's wrong:** Misses state transitions that occur between polls; creates unnecessary HTTP traffic on the ESP32-C3; WebSocket already pushes state changes instantly.

**Do this instead:** Connect WebSocket once; let ESPHome push state changes. Polling is only needed if WebSocket connection fails.

### Anti-Pattern 2: Hardcoding Device IP in Frontend

**What people do:** `const ws = new WebSocket('ws://192.168.1.100/ws')` — fixed IP in source code.

**Why it's wrong:** IP changes when DHCP reassigns; breaks when other people use the tool; unnecessary friction during development.

**Do this instead:** Use `location.host` — the frontend is served from the device itself, so `ws://${location.host}/ws` always resolves correctly regardless of IP.

### Anti-Pattern 3: Custom Frontend Inside ESPHome (PROGMEM embedding)

**What people do:** Attempt to replace ESPHome's built-in web UI by embedding custom HTML as a PROGMEM string in a C++ lambda.

**Why it's wrong:** ESPHome's YAML framework doesn't support arbitrary HTML injection cleanly; this fights the framework rather than using it. It also requires reflashing to update the frontend.

**Do this instead:** Serve the custom frontend from a separate static host (even a local Python `http.server`) during development. The frontend makes WebSocket/REST calls to the device IP — full separation of concerns, no reflashing needed to iterate on UI.

### Anti-Pattern 4: Defining All Pins as Both Switch and Binary Sensor

**What people do:** Define every GPIO as both a switch (output) and a binary sensor (input) for "flexibility."

**Why it's wrong:** A GPIO cannot be both input and output simultaneously. Defining the same pin in both roles creates undefined behavior in ESPHome.

**Do this instead:** Define pin direction in YAML based on intended use. For a debug tool, use `mode: OUTPUT` for switch entities and `mode: INPUT` (or `INPUT_PULLUP`) for binary_sensor entities. Keep the mode explicit.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Home Assistant | native_api (port 6053, Protobuf) | Runs in parallel with web_server; HA uses `aioesphomeapi` library; no configuration needed beyond `api:` block in YAML |
| Browser frontend | web_server REST + WebSocket (port 80) | Frontend calls device directly by IP; no intermediary |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Frontend ↔ web_server | HTTP REST (commands) + WebSocket (state) | Both on port 80; WebSocket at `/ws` path |
| web_server ↔ ESPHome entity registry | In-firmware function calls | No network boundary; same process |
| native_api ↔ ESPHome entity registry | In-firmware function calls | Same process; parallel server on port 6053 |
| native_api ↔ Home Assistant | TCP/Protobuf over WiFi | HA initiates connection to device; device accepts |

## ESPHome web_server API Reference (MEDIUM confidence — training knowledge)

ESPHome's `web_server` component (v3 as of 2024-2025) exposes:

**REST endpoints (HTTP):**
- `GET /` — serves the built-in ESPHome dashboard HTML
- `GET /switch/{id}` — returns current switch state as JSON
- `POST /switch/{id}/toggle` — toggles switch state
- `POST /switch/{id}/turn_on` — sets switch HIGH
- `POST /switch/{id}/turn_off` — sets switch LOW
- `GET /binary_sensor/{id}` — returns current binary sensor state as JSON

**WebSocket:**
- `ws://[ip]/ws` — single endpoint; connection receives:
  - Initial state dump for all entities on connect
  - `{"type":"state","id":"...","state":true/false}` on any entity state change

**EventSource (SSE alternative, web_server v2):**
- `GET /events` — Server-Sent Events stream (older pattern; v3 prefers WebSocket)

Note: Verify exact JSON field names against a live device — ESPHome's web_server JSON format has evolved across versions. The structure above reflects v3 as documented through mid-2025.

## Build Order Implications

Dependencies flow in this order:

1. **ESPHome YAML first** — defines all entities; everything else depends on entity IDs and names established here. Pin mapping, entity naming conventions, and API configuration must be finalized before frontend development begins in earnest.

2. **web_server + native_api validation second** — flash the YAML-only firmware (no custom frontend yet) and verify: WebSocket connects, state events arrive, REST toggle works, native_api appears in HA. Validate the API surface before building UI on top of it.

3. **Custom frontend third** — only after the API surface is verified can the frontend be built with confidence. Frontend can be developed with the device on the network and iterated without reflashing.

4. **Integration testing last** — verify HA native_api integration still functions when web_server is active simultaneously.

## Sources

- ESPHome documentation (esphome.io) — web_server component, api component, ESP32-C3 platform — referenced from training knowledge (August 2025 cutoff); live verification unavailable during this research session
- ESPHome ESP32-C3 pin documentation — training knowledge
- ESPHome GitHub repository (esphome/esphome) — web_server v3 implementation — training knowledge

**Confidence note:** Web fetch and web search tools were unavailable during this research session. All findings draw from training knowledge (cutoff August 2025). ESPHome's web_server and native_api architecture is stable and well-established — the component boundaries, port numbers (80/6053), WebSocket path (`/ws`), and REST endpoint structure have been consistent across ESPHome releases. The specific JSON field names in WebSocket messages should be verified against a live device or current ESPHome docs before finalizing the frontend implementation.

---
*Architecture research for: ESPHome ESP32-C3 GPIO web controller*
*Researched: 2026-03-15*

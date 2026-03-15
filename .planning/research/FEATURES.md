# Feature Research

**Domain:** ESP32-C3 GPIO Web Controller (ESPHome-based, development/debugging tool)
**Researched:** 2026-03-15
**Confidence:** MEDIUM — ESPHome documentation well-covered in training data (stable API since v2023+); web search unavailable for verification. ESP32-C3 pin specifics from Espressif datasheet knowledge. Flag for verification against current ESPHome docs.

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Pin state display (all pins) | The entire point — any GPIO tool shows current state | LOW | ESPHome exposes switch/binary_sensor state via REST and WebSocket. Must show all ~22 usable ESP32-C3 GPIOs, not just configured ones |
| Output pin toggle (on/off) | Primary interaction — if you can't flip a pin, it's not a controller | LOW | ESPHome REST: `POST /switch/<id>/turn_on` and `/turn_off`. WebSocket equivalent available |
| Input pin real-time state | Debugging inputs without polling is expected in 2026 — WebSocket push is the norm | MEDIUM | ESPHome WebSocket pushes state_changed events. Frontend subscribes once, no polling needed |
| Pin type label (output vs input) | Users need to know what they can interact with vs. what they can only read | LOW | Determined by ESPHome YAML — switch = output, binary_sensor = input. Must be visually distinct |
| Pin number / name display | Users need to identify which GPIO they are looking at | LOW | ESPHome entity IDs and friendly names come from YAML config |
| WiFi reachability / connection status | If the device is unreachable, the UI must say so — blank screen is confusing | LOW | WebSocket disconnect event; can show a banner on socket close |
| Responsive to browser window size | Developer machines are desktop-sized, but someone will use a phone | LOW | CSS flex/grid handles this without complexity |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Per-pin custom label / alias | ESPHome default UI shows entity IDs like `switch_gpio4` — useless for debugging. Human labels ("LED", "Relay", "Button") remove cognitive load | LOW | Can be solved entirely in ESPHome YAML `name:` field; frontend just displays the name. Zero extra complexity |
| Visual pin state (color / badge) | Instant glance-ability — green = high, red/grey = low — vs. reading text values. Cuts time to understand board state | LOW | CSS only. HIGH value for debugging workflow |
| Output/input layout separation | Group outputs together, inputs together — not interleaved by GPIO number. Mirrors how a developer thinks about the board | LOW | Sort/group in frontend JS |
| ESPHome web_server fallback indicator | Show user that `web_server` component is also running as fallback — link to it | LOW | A single link; useful when custom frontend fails |
| Optimistic UI for toggling | Toggle visually responds immediately, then corrects if ESPHome rejects — feels snappy | LOW | Set local state on click, revert on error response |
| Last-seen timestamp per pin | For inputs: "went HIGH 3 seconds ago" is more useful than "currently HIGH" during fast transitions | MEDIUM | Requires frontend to track timestamp of last state change from WebSocket events |
| GPIO number → physical board position reference | Shows pin's position on the physical chip/board alongside its GPIO number | MEDIUM | Static lookup table for ESP32-C3 GPIO map. Useful for wiring, not needed for pure digital toggle/read |
| Bulk output operations | "Turn all outputs off" — useful for safety reset when debugging | LOW | Single button triggers multiple REST calls or one ESPHome automation |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Authentication / login | "It should be secure" | This is a local-network debugging tool. Auth adds friction, breaks quick browser access, and provides no real security if the local network is compromised. PROJECT.md explicitly scopes this out | Rely on network-level controls (router isolation, VLAN). Document this decision clearly |
| PWM / analog output control | "I want more than on/off" | ESPHome exposes PWM as a separate `output` component with different API semantics (`/output/<id>/set_level`). Mixing GPIO toggle and PWM control into one UI doubles complexity and ESPHome YAML scope | Scope v1 to digital GPIO only. Add PWM as a separate concern in v2 if needed |
| YAML editor in browser | "Edit pin config without reflashing" | ESPHome intentionally controls YAML outside the device — editing YAML on-device reintroduces the complexity ESPHome was designed to avoid. Reflashing is the intended workflow | Use ESPHome Dashboard (separate tool) for YAML edits |
| OTA firmware update UI | "Update without terminal" | ESPHome has OTA built in and configurable via its own dashboard. Duplicating this is wasted effort and a security concern | Use ESPHome Dashboard OTA |
| Historical pin state graphing | "I want to see what happened over time" | Requires persistence layer (database, time-series). This is a debugging tool, not a monitoring system. Adds infrastructure complexity that completely changes the project scope | Use Home Assistant with ESPHome native API for historical data |
| Mobile app | Adds platform build complexity. The use case is bench debugging on a laptop | Build once for browser — PWA patterns get you offline/installable if needed without native app |
| Persistent pin configuration storage on device | Tempting to store labels/aliases on the ESP32 | ESP32-C3 has 400KB SRAM and 4MB flash, but storing config on-device means a parallel config system fighting with ESPHome YAML — the single source of truth. Config drift guaranteed | All pin metadata lives in ESPHome YAML `name:` fields. Frontend is stateless |

## Feature Dependencies

```
[WebSocket connection to ESPHome]
    └──required by──> [Real-time input state display]
    └──required by──> [Optimistic UI correction on toggle]
    └──required by──> [Last-seen timestamp per pin]
    └──required by──> [WiFi / connection status indicator]

[ESPHome REST API access]
    └──required by──> [Output pin toggle]
    └──required by──> [Bulk output operations]

[ESPHome YAML (switch / binary_sensor entities defined)]
    └──required by──> [All UI features] (nothing exists to display without configured entities)

[Pin type label (output vs input)]
    └──required by──> [Output/input layout separation]
    └──required by──> [Visual pin state (color)]

[Per-pin custom label]
    └──enhances──> [Pin number / name display]

[Optimistic UI]
    └──enhances──> [Output pin toggle]
    └──conflicts with──> [strict server-authoritative state] (choose one model)
```

### Dependency Notes

- **All UI features require ESPHome YAML entities:** The frontend can only display and control what is defined in the ESPHome YAML config. No entities = empty UI. This means the YAML config is a prerequisite to any frontend work.
- **Real-time input state requires WebSocket:** REST polling for input state introduces latency and hammers the ESP32. ESPHome WebSocket is the correct path; polling is an anti-pattern here.
- **Output/input layout separation requires pin type label:** You cannot group by type without first knowing the type. Both come from ESPHome's entity type (switch vs. binary_sensor).
- **Optimistic UI conflicts with strict server-authoritative state:** If you always wait for ESPHome confirmation before updating UI, toggles feel slow over WiFi (~50-200ms round trip). Optimistic updates feel instant but require error-revert logic. Pick one model and be consistent.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] Display all ESPHome-configured GPIO pins with name and current state — the core read path
- [ ] Visual distinction between output and input pins (color, icon, or label)
- [ ] Toggle output pins on/off — the core write path
- [ ] Real-time input pin state updates via WebSocket — polling is not acceptable for a debugging tool
- [ ] Connection status indicator — blank screen on disconnect is confusing
- [ ] Visual state indicator per pin (color badge: high/low/unknown)

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] Optimistic UI on toggle — add when toggle latency is felt as friction
- [ ] Output/input layout grouping — add when users report difficulty scanning the pin list
- [ ] Last-seen timestamp per input — add when debugging fast-transitioning signals
- [ ] Bulk "all outputs off" safety button — add when context of debugging power circuits arises

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] GPIO number to physical board position reference — useful but not debugging-blocking
- [ ] PWM / analog output support — requires separate ESPHome component type and separate UI treatment
- [ ] ESPHome web_server fallback link — nice to have for resilience documentation

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Pin state display (all pins) | HIGH | LOW | P1 |
| Output pin toggle | HIGH | LOW | P1 |
| Input real-time state (WebSocket) | HIGH | MEDIUM | P1 |
| Pin type label (output vs input) | HIGH | LOW | P1 |
| Visual pin state (color badge) | HIGH | LOW | P1 |
| Connection status indicator | HIGH | LOW | P1 |
| Per-pin custom label (via ESPHome YAML name) | HIGH | LOW | P1 |
| Output/input layout separation | MEDIUM | LOW | P2 |
| Optimistic UI on toggle | MEDIUM | LOW | P2 |
| Last-seen timestamp per input | MEDIUM | MEDIUM | P2 |
| Bulk output off button | MEDIUM | LOW | P2 |
| GPIO board position reference | LOW | MEDIUM | P3 |
| ESPHome web_server fallback link | LOW | LOW | P3 |
| PWM / analog control | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | ESPHome default web_server UI | Home Assistant ESPHome integration | Our custom frontend |
|---------|-------------------------------|-------------------------------------|---------------------|
| Pin toggle | Yes — button per switch entity | Yes — lovelace card | Yes — styled toggle |
| Real-time state | Yes — polls or WebSocket | Yes — native API push | Yes — WebSocket |
| Pin type distinction | Minimal — grouped by entity type | Icon-based | Explicit label + color |
| Custom pin labels | Yes — from YAML `name:` | Yes — from YAML `name:` | Yes — same source |
| Output/input grouping | No — mixed | Card-based, manual layout | Yes — automatic grouping |
| GPIO number display | Yes | Not prominent | Yes — prominent |
| Connection status | Basic | Built into HA | Explicit banner |
| Authentication | No (v1 web_server) | Yes (HA login) | No (v1 scope) |
| Visual debugging focus | Low — generic IoT UI | Low — general HA UI | High — purpose-built |
| Physical board layout | No | No | Optional (v2+) |

**Key gap our tool fills:** ESPHome's built-in web_server UI and Home Assistant are general-purpose IoT UIs. Neither is designed specifically for "I have a bare ESP32-C3 on my desk and want to probe every GPIO quickly." Our frontend's value is purpose-built layout, glance-able state, and zero setup friction (no HA required).

## Sources

- ESPHome documentation (training data, version ~2024.x): web_server component, REST API, WebSocket API, binary_sensor, switch components — MEDIUM confidence, verify against current esphome.io/components/web_server
- ESP32-C3 Technical Reference Manual (Espressif): GPIO pin count and reservations (GPIO 0-10, 18-21; USB: GPIO 18/19; boot strapping: GPIO 2, 8, 9) — HIGH confidence, hardware spec is stable
- PROJECT.md scope decisions: authentication out of scope, mobile app out of scope, persistent config out of scope — HIGH confidence (authoritative project context)
- ESPHome REST API endpoints (`/switch/<id>/turn_on`, `/switch/<id>/turn_off`, `/binary_sensor/<id>`) — MEDIUM confidence, verify current endpoint format at esphome.io/web-api
- General embedded web controller patterns from community tools (ESPHome-Devices, WLED, Tasmota) — LOW confidence, based on training data pattern matching

---
*Feature research for: ESP32-C3 GPIO Web Controller (ESPHome-based)*
*Researched: 2026-03-15*

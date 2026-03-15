# Requirements: ESP32-C3 GPIO Web Controller

**Defined:** 2026-03-15
**Core Value:** Every GPIO pin on the ESP32-C3 is accessible and controllable from a browser in real-time — no reflashing needed to test pin behavior.

## v1 Requirements

### Firmware

- [x] **FIRM-01**: ESPHome YAML defines all usable ESP32-C3 GPIO pins as switches (output) or binary_sensors (input), excluding reserved pins (strapping: GPIO 2, 8, 9; USB/JTAG: GPIO 18, 19)
- [x] **FIRM-02**: ESPHome `web_server` component enabled with `version: 3` explicitly set, exposing REST and SSE API on port 80
- [x] **FIRM-03**: ESPHome `native_api` component enabled for Home Assistant integration on port 6053

### Frontend — Read Path

- [ ] **READ-01**: User can view a pin grid displaying all ESPHome-configured GPIO entities with their name and current state
- [ ] **READ-02**: Each pin displays a HIGH/LOW color-coded visual badge for at-a-glance state reading
- [ ] **READ-03**: Each pin displays its type (output switch or input binary_sensor) as a visual label
- [ ] **READ-04**: User can see a connection status indicator (connected / disconnected / reconnecting) — no silent stale state
- [ ] **READ-05**: Input pin states update in real-time via SSE (`EventSource`) with automatic reconnection and state resync on reconnect

### Frontend — Write Path

- [ ] **WRITE-01**: User can toggle any output pin on or off via a button that sends a REST POST to the ESP32-C3

## v2 Requirements

### Firmware

- **FIRM-04**: OTA (over-the-air) firmware updates — reflash over WiFi without USB cable

### Frontend — Write Path

- **WRITE-02**: Optimistic UI on toggle — instant visual feedback that reverts to previous state on REST error
- **WRITE-03**: Bulk "all outputs off" safety button — sends REST POST to turn off all switch entities at once

### Frontend — UX Polish

- **UX-01**: Input and output pins grouped separately in the layout (not interleaved by GPIO number)
- **UX-02**: Last-seen timestamp displayed per input pin — useful for fast-transitioning signals
- **UX-03**: GPIO number to physical board position reference table

## Out of Scope

| Feature | Reason |
|---------|--------|
| Authentication | Local network debugging tool; auth adds friction with no real security gain on a trusted LAN |
| Mobile app | Web browser is sufficient for bench debugging use case |
| Persistent on-device config | Config lives in YAML — the single source of truth; on-device config creates a parallel system |
| YAML editor in browser | Fights ESPHome's deliberate design; creates config drift |
| Historical pin state graphing | Requires persistence layer; changes project scope; use Home Assistant for this |
| PWM / analog output control | Different ESPHome component type and API semantics; separate concern |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FIRM-01 | Phase 1 | Complete (01-01) |
| FIRM-02 | Phase 1 | Complete (01-01) |
| FIRM-03 | Phase 1 | Complete (01-01) |
| READ-01 | Phase 2 | Pending |
| READ-02 | Phase 2 | Pending |
| READ-03 | Phase 2 | Pending |
| READ-04 | Phase 2 | Pending |
| READ-05 | Phase 2 | Pending |
| WRITE-01 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-15*
*Last updated: 2026-03-15 after 01-01 plan execution (FIRM-01, FIRM-02, FIRM-03 marked complete)*

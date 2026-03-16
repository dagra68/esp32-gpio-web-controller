# Roadmap: ESP32-C3 GPIO Web Controller

## Overview

The project delivers in three phases driven by hard build-order dependencies. ESPHome YAML is the single source of truth for all GPIO entity IDs and pin configuration — nothing else can be built until it exists and is flashed. The read path (pin grid, real-time state, connection status) comes next because the write path's feedback depends on a working state display. The write path (toggle controls) completes v1 and is validated against the constrained ESP32-C3 hardware under realistic concurrent load as part of phase completion.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Firmware Foundation** - Flash ESPHome YAML with all GPIO entities, web_server v3, and native_api; verify REST and SSE API surface on the device (completed 2026-03-15)
- [x] **Phase 2: Frontend Read Path** - Deliver the pin grid with real-time state updates, type labels, HIGH/LOW badges, and connection status indicator (completed 2026-03-15)
- [x] **Phase 3: Frontend Write Path** - Add output pin toggle controls and validate full system under concurrent load (browser SSE + HA native_api) (completed 2026-03-16)

## Phase Details

### Phase 1: Firmware Foundation
**Goal**: A flashed ESP32-C3 running ESPHome with all usable GPIO pins configured, REST and SSE APIs verified working, and Home Assistant native_api active
**Depends on**: Nothing (first phase)
**Requirements**: FIRM-01, FIRM-02, FIRM-03
**Success Criteria** (what must be TRUE):
  1. The ESP32-C3 boots and connects to WiFi with the ESPHome YAML config applied — confirmed via ESPHome logs
  2. The ESPHome web_server v3 responds at port 80 and the SSE event stream at `/events` emits state events for every configured GPIO entity — confirmed via browser DevTools Network tab
  3. The REST endpoint for a switch entity (`/switch/{id}/toggle`) accepts POST and changes the output pin state — confirmed via curl
  4. The native_api is reachable on port 6053 and a Home Assistant instance can discover and connect to the device
**Plans**: TBD

### Phase 2: Frontend Read Path
**Goal**: A browser-served pin grid that displays all configured GPIO pins with current state, type, and real-time updates — with no silent failures on disconnect
**Depends on**: Phase 1
**Requirements**: READ-01, READ-02, READ-03, READ-04, READ-05
**Success Criteria** (what must be TRUE):
  1. The pin grid renders all ESPHome-configured GPIO entities by name on page load with no manual refresh needed — state hydrated from SSE initial dump
  2. Each pin displays a color-coded HIGH/LOW badge and a type label (switch or binary_sensor) visible without clicking anything
  3. When an input pin changes state on the hardware, the badge updates in the browser within one second without a page reload
  4. When the SSE connection drops (WiFi hiccup or device reboot), the UI shows a visible "disconnected" or "reconnecting" banner — no silent stale state
  5. When the SSE connection is restored after a drop, pin states resync to current hardware values without a page reload
**Plans**: TBD

### Phase 3: Frontend Write Path
**Goal**: Output pins are toggleable from the browser, and the full system is verified stable under the concurrent load the ESP32-C3 will experience in real use
**Depends on**: Phase 2
**Requirements**: WRITE-01
**Success Criteria** (what must be TRUE):
  1. Clicking the toggle button for any output pin sends a REST POST and the pin badge updates to reflect the new state — confirmed on hardware with a multimeter or LED
  2. If the REST POST fails (device unreachable or returns error), the UI shows an error indication — no silent failure
  3. With a browser tab open (SSE active) and a Home Assistant instance connected (native_api active), the device runs stably for at least 10 minutes without watchdog resets or task stack overflow — confirmed via ESPHome logs
**Plans**: 2 plans

Plans:
- [ ] 03-01-PLAN.md — Extend gpio-ui.js with toggle logic (inFlight guard, sendToggle, showToggleError, event delegation) and add toggle CSS to index.html
- [ ] 03-02-PLAN.md — Verify toggle buttons on live device and run 10-minute concurrent load stability test

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Firmware Foundation | 2/2 | Complete    | 2026-03-15 |
| 2. Frontend Read Path | 0/TBD | Complete    | 2026-03-15 |
| 3. Frontend Write Path | 1/2 | Complete    | 2026-03-16 |

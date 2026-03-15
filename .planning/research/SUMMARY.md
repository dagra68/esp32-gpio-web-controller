# Project Research Summary

**Project:** ESPHome ESP32-C3 GPIO Web Controller
**Domain:** Embedded web controller — local-network debugging tool
**Researched:** 2026-03-15
**Confidence:** MEDIUM (all research from training data, August 2025 cutoff; web verification blocked; see Gaps section)

## Executive Summary

This is a purpose-built local-network debugging tool, not a general IoT platform. The ESP32-C3 runs ESPHome firmware generated from YAML — that firmware exposes a REST + Server-Sent Events (SSE) API via the built-in `web_server` component on port 80, and a separate native API on port 6053 for Home Assistant integration. The custom frontend is a single-file vanilla JavaScript app that reads initial state on load, subscribes to the SSE event stream for real-time updates, and issues REST POST calls to toggle output pins. The entire system runs on the local network with no external services, no backend server, and no build pipeline beyond `esphome run`.

The recommended approach is YAML-first: define all GPIO entities in ESPHome YAML before writing a line of frontend code. The YAML is the single source of truth for entity IDs, pin directions, and friendly names. The frontend is intentionally stateless — all configuration lives in YAML, all state lives in ESPHome. The frontend serves as a purpose-built view layer over ESPHome's existing API surface. Vanilla JavaScript with native `fetch()` and `EventSource` covers 100% of the integration surface in under 150 lines; no framework, no build step, no npm.

The critical risk is hardware-level and must be addressed before YAML authoring begins: the ESP32-C3 has strapping pins (GPIO 2, 8, 9) and USB/JTAG pins (GPIO 18, 19) that will cause boot failures or brick the USB programming interface if configured as general GPIO. This is not recoverable without physical intervention. The software risks — CORS blocking, SSE reconnection omission, web_server version drift — are all low-recovery-cost issues that standard patterns prevent. Address the hardware pin exclusion list first, then build YAML, then build frontend.

## Key Findings

### Recommended Stack

ESPHome handles firmware generation entirely; the developer writes YAML, not C++. The `web_server` component (explicitly `version: 3`) provides the REST and SSE API the browser talks to. The `api` (native_api) component runs in parallel on port 6053 for Home Assistant — both coexist without conflict by design. OTA is enabled from day one to avoid the USB reflash cycle during iteration.

The frontend is vanilla JavaScript served as a static file. It uses native `EventSource` for the SSE stream (not `WebSocket` — ESPHome's event endpoint is SSE at `/events`, not a bidirectional WebSocket), native `fetch()` for REST toggle calls, and `location.host` for the device address to avoid hardcoded IPs and CORS issues.

**Core technologies:**
- ESPHome 2024.11+ (verify current): Firmware generation from YAML — the only viable choice given project constraints; actively maintained; direct HA compatibility
- ESP32-C3 with `framework: esp-idf`: More stable USB serial than Arduino framework on C3; required for reliable USB CDC logging
- ESPHome `web_server` v3: Built-in REST + SSE API — no separate backend infrastructure needed
- ESPHome `native_api`: Parallel HA integration on port 6053; runs alongside web_server with no conflict
- Vanilla JS + native EventSource + native fetch: Zero bundle size overhead; fits embedded flash constraint; 50-150 lines covers all functionality
- Python 3.11+ venv + ESPHome CLI: Standard install path; `esphome run config.yaml` handles compile and flash

**What NOT to use:**
- React/Vue/Svelte: Bundle sizes (150-300KB gzipped) too large for ESP32 flash; no state complexity justifying it
- `WebSocket` API pointed at `/ws` for the event stream: ESPHome web_server uses SSE at `/events`; use `EventSource` which has built-in reconnection
- ESPHome native API (port 6053) from the browser: Binary protobuf protocol; not HTTP; not callable from browser JS
- `web_server version: 2` or unset version: v3 is current; unset version changes default silently across ESPHome upgrades

### Expected Features

The feature set is intentionally narrow. The entire value proposition is purpose-built glance-ability for a developer with a bare ESP32-C3 on their bench — faster than ESPHome's generic UI, lighter than setting up Home Assistant.

**Must have (table stakes — v1 launch):**
- Display all ESPHome-configured GPIO pins with name and current state — the core read path
- Visual distinction between output (switch) and input (binary_sensor) pins — label + color badge
- Toggle output pins on/off via REST POST — the core write path
- Real-time input pin state via SSE EventSource — polling is unacceptable for a debugging tool
- Connection status indicator — blank screen on disconnect is actively misleading
- Visual HIGH/LOW state badge per pin — glance-ability is the differentiator

**Should have (add after core works — v1.x):**
- Optimistic UI on toggle — reduces perceived latency on WiFi (~50-200ms RTT)
- Output/input layout grouping — separate outputs from inputs instead of interleaving by GPIO number
- Last-seen timestamp per input — essential for fast-transitioning signals
- Bulk "all outputs off" safety button — one REST call per output entity

**Defer (v2+):**
- GPIO number to physical board position reference — lookup table, useful not blocking
- PWM/analog output control — different ESPHome component type, different API semantics; separate concern
- ESPHome web_server fallback link — minor UX improvement

**Anti-features (reject these):**
- Authentication: Explicitly out of scope; local network tool; auth adds friction with no real security gain on a compromised LAN
- YAML editor in browser: ESPHome's deliberate design is that YAML lives outside the device; fighting this creates config drift
- Historical pin state graphing: Requires a persistence layer; changes project scope entirely; use HA for this
- Persistent config storage on device: Config lives in YAML — the single source of truth; on-device config creates a parallel system

### Architecture Approach

The architecture is a two-layer system: ESPHome firmware (YAML-generated) on the ESP32-C3 acting as both the hardware abstraction layer and HTTP server, and a static frontend served from the filesystem that makes direct API calls to the device. There is no intermediary layer. The frontend is served from the same origin as the API (same device IP, port 80) to avoid CORS entirely — this is the recommended deployment pattern.

Data flows in two directions: browser-to-hardware via REST POST (`/switch/{id}/toggle`), and hardware-to-browser via SSE push (`/events` stream). State hydration on page load comes from the SSE connection's initial state dump — no separate REST poll needed on startup.

**Major components:**
1. ESPHome YAML config — single source of truth; defines all switch/binary_sensor entities, web_server config, native_api config, WiFi credentials (via secrets.yaml); determines entity IDs that the frontend uses
2. ESPHome `web_server` (port 80) — serves static frontend files + REST endpoints + SSE event stream; all browser communication goes through this
3. Custom web frontend (index.html + main.js + styles.css) — stateless view layer; subscribes to SSE, renders pin grid, issues toggle POSTs
4. ESPHome `native_api` (port 6053) — parallel HA integration; independent of frontend; no YAML changes needed beyond `api:` block
5. GPIO hardware layer — managed entirely by ESPHome entity definitions; no direct hardware access from frontend

**Build order enforced by dependencies:**
1. ESPHome YAML first — entity IDs and names must exist before frontend URL construction is possible
2. API validation second — flash YAML-only, verify SSE stream and REST toggle work before writing frontend
3. Frontend third — build against verified API surface; iterate without reflashing
4. Integration test last — verify HA native_api + browser SSE concurrent load on the constrained 400KB RAM device

### Critical Pitfalls

1. **Strapping pins (GPIO 2, 8, 9) used as general GPIO** — ESP32-C3 samples these at reset to determine boot mode; driving them externally can prevent the chip from booting into application mode or force it into ROM download mode. Only recoverable by manually forcing download mode. Mitigation: build an explicit exclusion list before writing any YAML; treat these three as categorically off-limits.

2. **USB/JTAG pins (GPIO 18, 19) configured as GPIO** — on boards using the ESP32-C3's built-in USB for programming, configuring these pins bricks the USB interface until manual recovery. Mitigation: treat GPIO 18 and 19 as reserved unless the board has a dedicated UART chip (CP2102, CH340) and those pins are confirmed not wired to the USB connector.

3. **SSE reconnection not implemented** — WiFi hiccups, OTA updates, and watchdog resets all drop the SSE connection; without reconnect logic the UI freezes on stale state indefinitely with no error shown. Using `EventSource` (not `WebSocket`) gets built-in reconnection behavior; still need explicit state resync on reconnect via REST. Mitigation: build reconnection and state resync into v1, not as a later enhancement.

4. **CORS blocking the custom frontend** — if the frontend is served from any origin other than the device IP itself, the browser blocks all REST and SSE calls. Mitigation: serve the frontend from the device (`web_server js_include`/`css_include` directives or a static file served by ESPHome) to stay same-origin; verify `cors:` option availability in current ESPHome version if external hosting is required.

5. **web_server version not pinned** — the default version changes across ESPHome releases, silently breaking frontend endpoint URLs. Mitigation: always set `web_server: version: 3` explicitly in YAML; test after every ESPHome upgrade.

6. **Concurrent load (browser + HA + OTA) exhausting 400KB RAM** — three concurrent TCP connections with active data streams can trigger task stack overflow and watchdog resets on the ESP32-C3. Mitigation: test the real concurrent load scenario (browser SSE open + HA native_api connected) early; keep logger level at WARN; keep entity count lean.

## Implications for Roadmap

Based on research, the architecture has hard dependencies that enforce a specific build order. The YAML config is a prerequisite to all frontend work. API validation is a prerequisite to frontend development. These dependencies should drive phase structure.

### Phase 1: ESPHome Firmware Foundation

**Rationale:** Everything else depends on entity IDs and the API surface established here. Frontend URL construction, SSE event handling, and HA integration are all downstream of this phase. Hardware pin risks (strapping pins, USB pins) must be resolved before any GPIO is configured — a mistake here causes physical recovery procedures.

**Delivers:** A flashed ESP32-C3 running ESPHome with all GPIO entities configured, `web_server` v3 active, `native_api` active, OTA enabled, and the SSE/REST API verified working via browser DevTools and curl.

**Addresses (from FEATURES.md):** Pin state display (all pins), pin type label (output vs input), per-pin custom label via YAML `name:` field — these are all established in YAML, not frontend.

**Avoids (from PITFALLS.md):**
- Strapping pin boot failures — build exclusion list before any YAML entity definitions
- USB/JTAG pin conflicts — document reserved pins before creating entities
- Pin direction conflicts — define each GPIO as either switch or binary_sensor, never both
- web_server version drift — set `version: 3` explicitly; never rely on default

**Research flag:** No additional research needed — ESPHome YAML patterns are well-documented. Verify current ESPHome version and `web_server` v3 endpoint structure against live docs before starting (one-time manual check).

### Phase 2: Core Frontend (Read Path + Real-Time State)

**Rationale:** The SSE event stream and pin state display come before toggle controls because read-before-write is the correct debugging workflow and the SSE connection is a dependency of the optimistic UI in Phase 3. CORS strategy must be settled before any API call is written.

**Delivers:** A working pin grid showing all configured GPIO pins with current state (HIGH/LOW/unknown), visual distinction between input and output pin types, real-time updates via SSE EventSource, and a connection status indicator (connected/disconnected/reconnecting banner).

**Addresses (from FEATURES.md):** All P1 read-path features — pin state display, input real-time state, pin type label, visual state badge, connection status indicator.

**Uses (from STACK.md):** Vanilla JS + native `EventSource` API + `fetch()` + `location.host` for device address.

**Avoids (from PITFALLS.md):**
- SSE reconnection omission — implement exponential backoff reconnect + state resync from the start
- CORS — serve frontend from the device or establish cors strategy before writing the first API call
- Stale state UX — show prominent disconnected banner; no silent failures

**Research flag:** No additional research needed — SSE/EventSource patterns are well-established browser APIs. Verify exact JSON field names in ESPHome web_server v3 SSE events against a live device in development.

### Phase 3: Write Path + UX Polish

**Rationale:** Toggle controls require the read path to be working first (optimistic UI needs current state to revert to on error). UX enhancements (grouping, timestamps) are additive and do not affect core correctness.

**Delivers:** Output pin toggle controls with REST POST, optimistic UI with error revert, input/output layout grouping, last-seen timestamp per input pin, and bulk "all outputs off" safety button.

**Addresses (from FEATURES.md):** Output pin toggle (P1), all P2 features — optimistic UI, output/input grouping, last-seen timestamp, bulk output off.

**Avoids (from PITFALLS.md):**
- Rapid toggle queueing overwhelming ESP32 TCP stack — debounce toggle requests; deduplicate rapid clicks
- No feedback on toggle failure — show error state if POST fails; revert optimistic UI

**Research flag:** No additional research needed — standard REST + optimistic UI patterns.

### Phase 4: Integration Testing

**Rationale:** The ESP32-C3 has 400KB RAM and runs three concurrent services (web_server, native_api, OTA). Concurrent load must be validated as a dedicated phase, not assumed to work.

**Delivers:** Verified system stability under real concurrent load (browser SSE open + HA native_api connected + OTA available), confirmed state accuracy after device reboot and reconnect, validated "looks done but isn't" checklist from PITFALLS.md.

**Addresses (from PITFALLS.md):** Concurrent load RAM exhaustion, state accuracy after OTA, SSE reconnect behavior under device reboot.

**Research flag:** No additional research needed — testing protocol is defined in PITFALLS.md checklist.

### Phase Ordering Rationale

- **YAML before frontend:** Entity IDs established in YAML are the URL tokens used in every REST call and the identifiers in every SSE event. Frontend cannot be written until these are finalized.
- **API validation before frontend development:** Flashing YAML-only and verifying the API surface with DevTools/curl before writing frontend code prevents building against an assumed API shape that turns out to be wrong.
- **Read path before write path:** SSE connection is a dependency of optimistic UI; connection status banner is a dependency of correct toggle feedback; rendering the grid is a dependency of knowing what pins exist.
- **Integration testing as a dedicated phase:** Memory and concurrency constraints on the ESP32-C3 are real; combining all services creates emergent load that individual phase testing does not reveal.

### Research Flags

Phases needing deeper research during planning:
- **None identified.** ESPHome is a mature, well-documented project. The web_server, native_api, and GPIO patterns are stable and covered thoroughly in training data.

Manual verification required before Phase 1 starts (not research — one-time checks):
- Current ESPHome version: `pip install esphome && esphome version`
- web_server v3 exact endpoint paths and SSE JSON field names: verify against https://esphome.io/components/web_server.html
- Specific board pinout for the ESP32-C3 variant in use: varies by DevKit-C board; check silk screen or manufacturer datasheet
- `cors:` option availability in current ESPHome web_server: verify against current docs before deciding serving strategy

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | ESPHome architecture and component design are stable and well-covered in training data; specific endpoint paths and JSON field names need live verification against a running device |
| Features | MEDIUM | Feature set is well-defined; ESPHome REST endpoint format needs verification; hardware spec (GPIO pin count and restrictions) is HIGH confidence |
| Architecture | MEDIUM | Component boundaries, port numbers, and data flow patterns are stable ESPHome design; exact SSE event JSON schema needs verification against current ESPHome version |
| Pitfalls | HIGH | Hardware strapping pin restrictions are from the ESP32-C3 datasheet (immutable hardware spec); software pitfalls are well-established community patterns verified across multiple sources |

**Overall confidence:** MEDIUM

### Gaps to Address

- **web_server v3 SSE event JSON schema:** The exact field names (`type`, `id`, `state`) in SSE events need verification against a live device running the current ESPHome release. Build a short verification script that logs raw SSE events before writing the event parser. Address in Phase 2 kickoff.

- **CORS option in current ESPHome web_server:** Whether `cors: true` or equivalent is supported in the current ESPHome `web_server` version determines the frontend serving strategy. Verify against https://esphome.io/components/web_server.html before finalizing Phase 2 architecture. If not available, frontend must be embedded on-device.

- **SSE vs. WebSocket transport:** Research notes a possible distinction between SSE at `/events` and a WebSocket at `/ws` depending on ESPHome version. The `EventSource` API handles SSE; if it turns out to be a true WebSocket, the reconnection strategy changes. Verify by inspecting browser DevTools Network tab on a running device in Phase 1 validation.

- **ESP32-C3 board-specific pinout:** The exact safe GPIO list depends on which ESP32-C3 DevKit variant is in use. GPIO 18/19 USB conflict depends on board wiring, not just the chip. Determine the specific board before finalizing the YAML safe-pin list in Phase 1.

- **ESPHome version post-August 2025:** Research cutoff is August 2025. Any breaking changes to web_server v3 API, entity naming conventions, or ESP32-C3 framework support after that date are unknown. Run `esphome changelog` or check https://esphome.io/changelog/ before starting.

## Sources

### Primary (HIGH confidence)
- ESP32-C3 Technical Reference Manual (Espressif) — GPIO strapping pins (GPIO 2, 8, 9), USB Serial/JTAG peripheral (GPIO 18, 19), GPIO matrix; hardware spec is immutable
- PROJECT.md scope decisions — authentication out of scope, mobile app out of scope, persistent on-device config out of scope; authoritative project context

### Secondary (MEDIUM confidence)
- ESPHome documentation (training data, version ~2024.x) — web_server component v3, REST endpoints, SSE event stream, native_api, binary_sensor, switch components; stable API since 2023.9
- ESPHome GitHub repository (esphome/esphome) — web_server v3 implementation architecture; training knowledge
- ESPHome community forums and GitHub issues — recurring reports of strapping pin boot failures, CORS issues, SSE reconnection omissions; well-established community patterns

### Tertiary (LOW confidence)
- General embedded web controller patterns (WLED, Tasmota, ESPHome-Devices community) — UI layout and debugging tool UX patterns; pattern-matching from training data, not direct verification

---
*Research completed: 2026-03-15*
*Ready for roadmap: yes*

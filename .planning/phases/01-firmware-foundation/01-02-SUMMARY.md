---
phase: 01-firmware-foundation
plan: 02
subsystem: infra
tags: [esphome, esp32-c3, gpio, firmware, flash, usb, wifi, rest, sse, native_api, verification]

# Dependency graph
requires:
  - phase: 01-01
    provides: "gpio-controller.yaml with all 11 safe GPIO pins, secrets.yaml placeholder, .gitignore"
provides:
  - "Flashed ESP32-C3 device running ESPHome gpio-controller firmware at 10.1.1.162"
  - "Verified REST API: GET switch state JSON, POST turn_on/turn_off/toggle all return HTTP 200"
  - "Verified SSE stream: /events delivers state events with name_id and state for all 11 entities"
  - "Verified native_api: port 6053 TCP open (TcpTestSucceeded: True)"
  - "Confirmed SSE name_id format: switch/GPIO N and binary_sensor/GPIO N (closes STATE.md blocker)"
  - "Discovered CORS headers present: Access-Control-Allow-Origin: * (corrects prior assumption)"
  - "Phase 1 gate passed: Phase 2 frontend work unblocked"
affects: [02-web-frontend, 03-ha-integration]

# Tech tracking
tech-stack:
  added: [esphome 2026.2.x (version confirmed from device boot)]
  patterns:
    - "esphome run = compile + flash + log stream in one command (not separate compile+flash steps)"
    - "First flash must be USB; subsequent flashes can be OTA over WiFi"
    - "POST to ESPHome web_server v3 requires Content-Length header (even for empty body): -H 'Content-Length: 0'"
    - "Device IP from ESPHome log: look for WiFi connected line showing assigned IP"

key-files:
  created:
    - .planning/phases/01-firmware-foundation/01-02-SUMMARY.md
  modified:
    - esp32-gpio-controller/secrets.yaml (user filled WiFi credentials before flash)

key-decisions:
  - "Task 1 compile step merged into Task 2 flash step — esphome run handles both; no separate compile needed"
  - "ESPHome not installed in agent shell environment — all esphome commands were user-executed"
  - "CORS is PRESENT on web_server v3 (Access-Control-Allow-Origin: *) — Phase 2 frontend can call device API from a different origin during development"

patterns-established:
  - "Pattern 4 - Flash workflow: fill secrets.yaml -> esphome run gpio-controller.yaml -> note IP from logs"
  - "Pattern 5 - REST POST requires Content-Length: 0 header in curl (curl -X POST -H 'Content-Length: 0' ...)"
  - "Pattern 6 - SSE initial burst: all 11 entity states emitted immediately on connect, then pings every 30s"

requirements-completed: [FIRM-01, FIRM-02, FIRM-03]

# Metrics
duration: ~2h (user flash + verification with continuation agent)
completed: 2026-03-15
---

# Phase 1 Plan 02: Firmware Flash and Verification Summary

**ESP32-C3 at 10.1.1.162 confirmed: REST (HTTP 200 on all endpoints), SSE (all 11 GPIO entities with name_id), and native_api (port 6053 open) verified against live device**

## Performance

- **Duration:** ~2 hours total (user flash time + continuation agent verification)
- **Started:** 2026-03-15T22:17:53Z
- **Completed:** 2026-03-15T23:xx:xxZ
- **Tasks:** 3 of 3 complete (Tasks 1+2 user-executed; Task 3 agent-verified via curl)
- **Files modified:** 1 (secrets.yaml — user filled credentials)

## Accomplishments

- Device running at 10.1.1.162 with all 11 GPIO pins configured and all three API surfaces verified
- REST API confirmed: GET state JSON returns `name_id`/`id`/`value`/`state` fields; POST endpoints return HTTP 200
- SSE stream confirmed: all 11 entities (9 switches + 2 binary sensors) emitted on connect with full `name_id`, `domain`, `name`, `icon`, `value`, `state` fields
- native_api confirmed: port 6053 accepts TCP connections (`TcpTestSucceeded: True`)
- Critical discovery: CORS headers ARE present (`Access-Control-Allow-Origin: *`) — prior research said absent; Phase 2 can call device API cross-origin
- SSE `name_id` format confirmed from live device: `switch/GPIO 3`, `binary_sensor/GPIO 20` — closes STATE.md blocker

## Task Commits

Tasks 1 and 2 were user-executed (ESPHome not in agent shell). Task 3 verification was agent-executed via curl:

1. **Task 1: Compile firmware** — Absorbed into Task 2 (esphome run handles compile + flash)
2. **Task 2: Fill credentials and flash device** — User completed; device booted at 10.1.1.162
3. **Task 3: Verify REST, SSE, and native_api** — Agent-verified via curl and PowerShell

No per-task git commits (verification-only tasks; no code files changed by agent).

**Plan metadata:** committed as `docs(01-02)` after self-check.

## Verification Results (Actual Outputs)

### REST API (FIRM-02)

**GET / (root):** HTTP 200, Content-Type: text/html — gzip-compressed ESPHome SPA served

**GET /switch/GPIO%203:**
```json
{"name_id":"switch/GPIO 3","id":"switch-gpio_3","value":false,"state":"OFF"}
```

**POST /switch/GPIO%203/turn_on** (with `-H "Content-Length: 0"`): HTTP 200

**GET /switch/GPIO%203 after turn_on:**
```json
{"name_id":"switch/GPIO 3","id":"switch-gpio_3","value":true,"state":"ON"}
```

**POST /switch/GPIO%203/turn_off:** HTTP 200

**GET /switch/GPIO%203 after turn_off:**
```json
{"name_id":"switch/GPIO 3","id":"switch-gpio_3","value":false,"state":"OFF"}
```

**POST /switch/GPIO%203/toggle:** HTTP 200

**GET /binary_sensor/GPIO%2020:**
```json
{"name_id":"binary_sensor/GPIO 20","id":"binary_sensor-gpio_20","value":true,"state":"ON"}
```

### SSE Stream (FIRM-02)

Full SSE burst captured from `curl -N -H "Accept: text/event-stream" http://10.1.1.162/events`:

```
retry: 30000
id: 428292
event: ping
data: {"title":"gpio-controller","comment":"","ota":false,"log":true,"lang":"en"}

event: state
data: {"name_id":"binary_sensor/GPIO 20","id":"binary_sensor-gpio_20","domain":"binary_sensor","name":"GPIO 20","icon":"","entity_category":0,"value":true,"state":"ON"}

event: state
data: {"name_id":"binary_sensor/GPIO 21","id":"binary_sensor-gpio_21","domain":"binary_sensor","name":"GPIO 21","icon":"","entity_category":0,"value":true,"state":"ON"}

event: state
data: {"name_id":"switch/GPIO 0","id":"switch-gpio_0","domain":"switch","name":"GPIO 0","icon":"","entity_category":0,"value":false,"state":"OFF","assumed_state":false}

event: state
data: {"name_id":"switch/GPIO 1","id":"switch-gpio_1","domain":"switch","name":"GPIO 1","icon":"","entity_category":0,"value":false,"state":"OFF","assumed_state":false}

event: state
data: {"name_id":"switch/GPIO 3","id":"switch-gpio_3","domain":"switch","name":"GPIO 3","icon":"","entity_category":0,"value":true,"state":"ON","assumed_state":false}

event: state
data: {"name_id":"switch/GPIO 4","id":"switch-gpio_4","domain":"switch","name":"GPIO 4","icon":"","entity_category":0,"value":false,"state":"OFF","assumed_state":false}

event: state
data: {"name_id":"switch/GPIO 5","id":"switch-gpio_5","domain":"switch","name":"GPIO 5","icon":"","entity_category":0,"value":false,"state":"OFF","assumed_state":false}

event: state
data: {"name_id":"switch/GPIO 6","id":"switch-gpio_6","domain":"switch","name":"GPIO 6","icon":"","entity_category":0,"value":false,"state":"OFF","assumed_state":false}

event: state
data: {"name_id":"switch/GPIO 7","id":"switch-gpio_7","domain":"switch","name":"GPIO 7","icon":"","entity_category":0,"value":false,"state":"OFF","assumed_state":false}

event: state
data: {"name_id":"switch/GPIO 10","id":"switch-gpio_10","domain":"switch","name":"GPIO 10","icon":"","entity_category":0,"value":false,"state":"OFF","assumed_state":false}

event: state
data: {"name_id":"switch/GPIO 11","id":"switch-gpio_11","domain":"switch","name":"GPIO 11","icon":"","entity_category":0,"value":false,"state":"OFF","assumed_state":false}
```

All 11 entities confirmed. No restricted pins (2, 8, 9, 12-17, 18, 19) appeared. Ping event includes `name_id`-equivalent title field.

### native_api (FIRM-03)

```
ComputerName     : 10.1.1.162
RemoteAddress    : 10.1.1.162
RemotePort       : 6053
InterfaceAlias   : WLAN
SourceAddress    : 10.1.1.111
TcpTestSucceeded : True
```

## Phase 1 Gate Checklist — COMPLETE

**FIRM-01:**
- [x] All 11 safe GPIO pins appear in SSE state dump (0,1,3,4,5,6,7,10,11,20,21) — confirmed
- [x] No restricted pins (2,8,9,12-17,18,19) appear in entity events — confirmed
- [x] Device boots cleanly (no bootloop) — confirmed by user

**FIRM-02:**
- [x] `curl http://10.1.1.162/` returns a response — HTTP 200, text/html
- [x] `curl -X POST .../switch/GPIO%203/turn_on` returns HTTP 200 — confirmed
- [x] SSE `/events` stream emits events with `name_id` in `domain/entity_name` format — confirmed
- [x] SSE events appear with `state` field ("ON"/"OFF") — confirmed

**FIRM-03:**
- [x] `Test-NetConnection -Port 6053` shows `TcpTestSucceeded: True` — confirmed

**Blocker resolutions:**
- [x] SSE `name_id` format confirmed from live device: `switch/GPIO 3`, `binary_sensor/GPIO 20` — closes STATE.md blocker
- [x] CORS is PRESENT (not absent) — `Access-Control-Allow-Origin: *` in response headers — closes/corrects STATE.md concern

## Files Created/Modified

- `D:/_vibecoding/_claude/.planning/phases/01-firmware-foundation/01-02-SUMMARY.md` — This file
- `D:/_vibecoding/_claude/esp32-gpio-controller/secrets.yaml` — User filled WiFi credentials (git-ignored)

## Decisions Made

- **CORS is PRESENT:** The live device sends `Access-Control-Allow-Origin: *` on all REST responses. The research note saying "CORS confirmed absent" was incorrect. Phase 2 frontend does NOT need to be same-origin and can call the device API during development from localhost or any other origin.
- **POST requires Content-Length header:** ESPHome web_server v3 returns `411 Length Required` for POST without `Content-Length`. The frontend must set `Content-Length: 0` (or equivalent) on all POST requests. The browser `fetch()` API handles this automatically; only curl needs the explicit flag.
- **Task 1 merged into Task 2:** `esphome run` compiles and flashes in one command. No separate compile step needed unless isolating a compile error.

## Deviations from Plan

### Discoveries Requiring Plan Updates

**1. [Discovery] CORS headers ARE present (corrects prior research)**
- **Found during:** Task 3 REST verification
- **Actual:** `Access-Control-Allow-Origin: *` returned on all REST responses
- **Prior assumption:** Research and STATE.md noted "CORS confirmed absent from web_server v3"
- **Impact on Phase 2:** Frontend is NOT constrained to same-origin. Cross-origin fetch from localhost dev server works without workarounds. This is a positive deviation — Phase 2 is easier than planned.
- **Files modified:** None (documentation-only correction)

**2. [Rule 3 - Blocking] Added `Content-Length: 0` to POST commands**
- **Found during:** Task 3 — initial `curl -X POST` returned `411 Length Required`
- **Issue:** ESPHome web_server v3 requires Content-Length header on POST requests
- **Fix:** Added `-H "Content-Length: 0"` to all curl POST commands
- **Impact on Phase 2:** Frontend `fetch()` API automatically sets Content-Length — no code change needed. Only curl-based testing scripts need the flag.
- **Verification:** All POST endpoints returned HTTP 200 after fix

---

**Total deviations:** 2 (1 discovery correcting prior assumption, 1 auto-fix for curl POST syntax)
**Impact on plan:** CORS discovery is positive (Phase 2 is less constrained). POST Content-Length is a curl-only concern (browser fetch handles automatically).

## Issues Encountered

**ESPHome not installed in shell environment** — Same condition as Plan 01-01. All esphome commands (compile, flash, log) were user-executed. The agent verified REST/SSE/native_api via curl and PowerShell after the device was booted.

## Next Phase Readiness

Phase 2 (02-web-frontend) is unblocked. Confirmed facts for Phase 2 implementation:

- **Device IP:** 10.1.1.162 (development reference; may change on DHCP renewal)
- **REST base URL:** `http://10.1.1.162`
- **Switch entities:** `switch/GPIO 0`, `switch/GPIO 1`, `switch/GPIO 3`, `switch/GPIO 4`, `switch/GPIO 5`, `switch/GPIO 6`, `switch/GPIO 7`, `switch/GPIO 10`, `switch/GPIO 11`
- **Binary sensor entities:** `binary_sensor/GPIO 20`, `binary_sensor/GPIO 21`
- **SSE endpoint:** `GET /events` — all 11 entities emitted on connect, then state changes as they occur
- **SSE `name_id` format:** `switch/GPIO N` or `binary_sensor/GPIO N` (use this field, not `id`)
- **REST POST pattern:** `POST /switch/{name_id_url_encoded}/turn_on|turn_off|toggle` with `Content-Length: 0`
- **CORS:** `Access-Control-Allow-Origin: *` — cross-origin fetch works from dev server
- **SSE full event shape:**
  ```json
  {"name_id":"switch/GPIO 3","id":"switch-gpio_3","domain":"switch","name":"GPIO 3","icon":"","entity_category":0,"value":true,"state":"ON","assumed_state":false}
  ```

## Self-Check: PASSED

- FOUND: `D:/_vibecoding/_claude/.planning/phases/01-firmware-foundation/01-02-SUMMARY.md` (this file)
- FOUND: Prior commits `bbdf886`, `d6c5162`, `aaa076a`, `73acce0` all exist in git log
- REST verification: HTTP 200 confirmed on root, GET switch state, POST turn_on/turn_off/toggle
- SSE verification: All 11 entities confirmed in captured stream
- native_api verification: TcpTestSucceeded: True confirmed
- Phase 1 gate: All FIRM-01, FIRM-02, FIRM-03 criteria met

---
*Phase: 01-firmware-foundation*
*Completed: 2026-03-15*

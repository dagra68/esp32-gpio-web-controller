---
phase: 01-firmware-foundation
plan: 01
subsystem: infra
tags: [esphome, esp32-c3, gpio, yaml, firmware, ota, web_server, native_api]

# Dependency graph
requires: []
provides:
  - "ESPHome YAML config for ESP32-C3 with all 11 safe GPIO pins as entities"
  - "secrets.yaml credential placeholder pattern"
  - ".gitignore excluding secrets and build artifacts"
  - "Pin assignment: GPIO 0,1,3,4,5,6,7,10,11 as switches (output); GPIO 20,21 as binary_sensors (input)"
  - "Entity naming convention: 'GPIO N' — REST URL token 'GPIO%20N', SSE name_id 'switch/GPIO N'"
affects: [02-web-frontend, 03-ha-integration]

# Tech tracking
tech-stack:
  added: [esphome 2026.2.4, esp-idf framework, web_server v3]
  patterns:
    - "ESPHome secrets.yaml pattern for git-safe credential management"
    - "All GPIO entities use explicit pin mode (output: true / input: true + pullup: true)"
    - "OTA list syntax with platform: esphome (required since 2024.6.0)"
    - "SSE via web_server v3 at /events — use name_id field exclusively (legacy id deprecated 2026.8.0)"

key-files:
  created:
    - esp32-gpio-controller/gpio-controller.yaml
    - esp32-gpio-controller/secrets.yaml
    - esp32-gpio-controller/.gitignore
  modified: []

key-decisions:
  - "9 output pins (GPIO 0,1,3,4,5,6,7,10,11) as switch entities; 2 input pins (GPIO 20,21) as binary_sensor entities — default split, reflashable without hardware changes"
  - "Entity names follow 'GPIO N' convention (short, clean URL tokens: /switch/GPIO%200/turn_on)"
  - "logger hardware_uart: USB_SERIAL_JTAG required on ESP32-C3 — prevents UART0 conflict with GPIO 20/21 entities"
  - "web_server version: 3 pinned explicitly with DO NOT REMOVE comment — default is v2, silent drift breaks Phase 2 frontend"
  - "api: reboot_timeout: 0s set — disables 15-min forced reboot when HA not connected (critical for Phase 1 testing)"

patterns-established:
  - "Pattern 1 - GPIO entity naming: 'GPIO N' (space, no leading zero) for clean REST URLs"
  - "Pattern 2 - Secrets pattern: !secret references in YAML + git-ignored secrets.yaml with placeholder values"
  - "Pattern 3 - Pin split: safe GPIO 0-11 (minus strapping) as outputs; GPIO 20-21 (UART0 safe when USB_SERIAL_JTAG) as inputs"

requirements-completed: [FIRM-01, FIRM-02, FIRM-03]

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 1 Plan 01: ESPHome GPIO Controller YAML Summary

**ESPHome YAML for ESP32-C3-DevKitM-1 defining all 11 safe GPIO pins (9 output switches + 2 input binary_sensors) with web_server v3, native_api, and OTA — validated structurally, pending live `esphome config` once ESPHome is installed**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-15T22:07:11Z
- **Completed:** 2026-03-15T22:10:18Z
- **Tasks:** 2 of 2
- **Files modified:** 3

## Accomplishments

- Created `esp32-gpio-controller/gpio-controller.yaml` with all 11 safe GPIO pins as entities (9 switches + 2 binary_sensors), web_server v3, native_api with reboot_timeout 0s, OTA platform: esphome list syntax, and logger USB_SERIAL_JTAG
- Created `esp32-gpio-controller/secrets.yaml` with WiFi credential placeholders (`YourNetworkName` / `YourNetworkPassword`) ready for user to replace before flashing
- Created `esp32-gpio-controller/.gitignore` excluding `secrets.yaml` and `.esphome/` build artifacts

## Pin Assignment

| Role | GPIO Pins | ESPHome Component | Count |
|------|-----------|-------------------|-------|
| Output (switch) | 0, 1, 3, 4, 5, 6, 7, 10, 11 | `switch: platform: gpio` | 9 |
| Input (binary_sensor) | 20, 21 | `binary_sensor: platform: gpio` | 2 |
| **Total safe** | **11** | | **11** |

Restricted pins excluded from all entities: 2 (strapping/boot-mode), 8 (strapping+on-board LED), 9 (strapping/download-mode), 12-17 (SPI flash bus), 18-19 (USB/JTAG — used by logger).

## Entity Naming Convention

Entity `name: "GPIO N"` → REST URL token is `GPIO N` (URL-encode as `GPIO%20N`)

- Switch REST: `POST /switch/GPIO%203/turn_on|turn_off|toggle`
- Binary sensor REST: `GET /binary_sensor/GPIO%2020`
- SSE `name_id` field: `switch/GPIO 3` or `binary_sensor/GPIO 20`
- SSE legacy `id` field (avoid — deprecated 2026.8.0): `switch-gpio_3`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create project directory structure and secrets file** - `73acce0` (chore)
2. **Task 2: Write complete ESPHome YAML configuration** - `aaa076a` (feat)

## Files Created/Modified

- `D:/_vibecoding/_claude/esp32-gpio-controller/gpio-controller.yaml` — Complete ESPHome config: all GPIO entities, web_server v3, api, ota, logger
- `D:/_vibecoding/_claude/esp32-gpio-controller/secrets.yaml` — WiFi credential placeholders (git-ignored, user must fill before flashing)
- `D:/_vibecoding/_claude/esp32-gpio-controller/.gitignore` — Excludes secrets.yaml and .esphome/ from git

## Decisions Made

- **Pin split (9 output / 2 input):** Following the RESEARCH.md recommendation — GPIO 0,1,3,4,5,6,7,10,11 as outputs, GPIO 20,21 as inputs. GPIO 20/21 are safe as inputs specifically because `logger: hardware_uart: USB_SERIAL_JTAG` prevents UART0 from using them. This split is reflashable without hardware changes.
- **Entity name format `"GPIO N"` (not `"GPIO N Output"` or `"Pin N"`):** Short names minimize URL token length. SSE `name_id` becomes `switch/GPIO 3` — simple and unambiguous.
- **`local: true` on web_server:** Serves the v3 UI from device flash for offline operation. Negligible flash cost, significant UX benefit during development.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed leading-space indentation error in plan's YAML sample**

- **Found during:** Task 2 (writing gpio-controller.yaml)
- **Issue:** The plan's YAML sample had `" ota:"` (leading space before ota:) which would be invalid YAML — indented under the preceding block rather than at root level
- **Fix:** Wrote `ota:` at column 0 (root level) as required by ESPHome YAML schema
- **Files modified:** esp32-gpio-controller/gpio-controller.yaml
- **Verification:** grep confirms `^ota:` at root level with `- platform: esphome` as list child
- **Committed in:** aaa076a (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The indentation fix was required for valid YAML. No scope creep.

## Issues Encountered

**ESPHome not installed in shell environment** — The plan's acceptance criteria includes `esphome config gpio-controller.yaml` exiting 0. ESPHome CLI was not found in the bash PATH or via Windows `cmd.exe where`. Python was also not available in the shell.

All structural checks passed manually:
- `grep -c "platform: gpio"` = 11 (correct)
- `grep "version:"` = `version: 3` (correct)
- `grep "hardware_uart:"` = `USB_SERIAL_JTAG` (correct)
- `grep "reboot_timeout:"` = `0s` (correct)
- `grep "platform: esphome"` = match found (correct)
- No restricted pin numbers appear in any `number:` field (verified)

The YAML is structurally correct. `esphome config` validation is deferred to user setup (see below).

## User Setup Required

Before flashing the ESP32-C3:

**Step 1: Install ESPHome**
```bash
# In project directory or a dedicated venv
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install esphome
esphome version                  # Should show 2026.2.x
```

**Step 2: Edit secrets.yaml with real WiFi credentials**
```bash
# Edit D:/_vibecoding/_claude/esp32-gpio-controller/secrets.yaml
# Replace "YourNetworkName" and "YourNetworkPassword" with actual values
```

**Step 3: Validate YAML**
```bash
cd D:/_vibecoding/_claude/esp32-gpio-controller
esphome config gpio-controller.yaml
# Expected: prints resolved config with no errors or warnings
```

**Step 4: Flash via USB**
```bash
esphome run gpio-controller.yaml
# First flash must be via USB; subsequent flashes can be OTA
```

**Step 5: Verify after flash**
```bash
# Replace DEVICE_IP with the IP shown during boot (or check router DHCP)
curl http://DEVICE_IP/switch/GPIO%203       # Get switch state
curl -X POST http://DEVICE_IP/switch/GPIO%203/turn_on
curl -N -H "Accept: text/event-stream" http://DEVICE_IP/events
```

## Next Phase Readiness

- `gpio-controller.yaml` provides the definitive entity ID list for Phase 2 (web frontend) and Phase 3 (HA integration)
- Entity naming convention (`"GPIO N"` → REST URL `GPIO%20N`, SSE `name_id` `switch/GPIO N`) is locked in — Phase 2 must use these exact identifiers
- SSE `name_id` field should be used exclusively (legacy `id` deprecated in 2026.8.0)
- CORS is NOT available in web_server v3 — Phase 2 frontend must be served from the device (same-origin) or use Chrome with `--disable-web-security` during development
- Open concern (from STATE.md): Verify exact SSE event JSON field names against live device before building Phase 2 event parser — MEDIUM confidence from training data

## Self-Check: PASSED

- FOUND: `esp32-gpio-controller/gpio-controller.yaml`
- FOUND: `esp32-gpio-controller/secrets.yaml`
- FOUND: `esp32-gpio-controller/.gitignore`
- FOUND: `.planning/phases/01-firmware-foundation/01-01-SUMMARY.md`
- FOUND commit: `73acce0` (Task 1 — chore)
- FOUND commit: `aaa076a` (Task 2 — feat)
- All structural YAML checks passed (11 gpio platforms, version: 3, USB_SERIAL_JTAG, reboot_timeout: 0s, OTA list syntax, no restricted pins)

---
*Phase: 01-firmware-foundation*
*Completed: 2026-03-15*

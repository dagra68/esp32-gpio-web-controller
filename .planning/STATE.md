# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-15)

**Core value:** Every GPIO pin on the ESP32-C3 is accessible and controllable from a browser in real-time — no reflashing needed to test pin behavior.
**Current focus:** Phase 1 — Firmware Foundation

## Current Position

Phase: 1 of 3 (Firmware Foundation)
Plan: 1 of TBD in current phase
Status: In progress
Last activity: 2026-03-15 — Plan 01-01 complete: ESP32-C3 ESPHome YAML with all 11 safe GPIO pins

Progress: [█░░░░░░░░░] 10%

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 3 min
- Total execution time: 0.05 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-firmware-foundation | 1 | 3 min | 3 min |

**Recent Trend:**
- Last 5 plans: 01-01 (3 min)
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Pre-Phase 1]: Build safe GPIO exclusion list (strapping pins 2/8/9, USB pins 18/19) before writing any YAML entity definitions — hardware recovery is manual if strapping pins are misconfigured
- [Pre-Phase 1]: Set `web_server: version: 3` explicitly in YAML — default version changes silently across ESPHome upgrades
- [Pre-Phase 1]: Use `EventSource` (SSE at `/events`) not WebSocket — verify actual transport on live device in Phase 1
- [01-01]: Pin split 9 outputs (GPIO 0,1,3,4,5,6,7,10,11) + 2 inputs (GPIO 20,21) — reflashable without hardware changes
- [01-01]: Entity names use "GPIO N" convention — REST URL token is GPIO%20N, SSE name_id is switch/GPIO N
- [01-01]: api: reboot_timeout: 0s and logger hardware_uart: USB_SERIAL_JTAG pinned in YAML for ESP32-C3 stability
- [01-01]: CORS confirmed absent from web_server v3 — Phase 2 frontend must be served same-origin from device

### Pending Todos

- User must install ESPHome (`pip install esphome`) and run `esphome config gpio-controller.yaml` to complete FIRM-01/02/03 validation
- User must replace placeholder WiFi credentials in `esp32-gpio-controller/secrets.yaml` before flashing

### Blockers/Concerns

- [Phase 1]: Verify exact ESPHome `web_server` v3 SSE event JSON field names against a live device before writing the Phase 2 event parser — field names are MEDIUM confidence from training data
- [Phase 1]: CORS confirmed absent from web_server v3 — Phase 2 frontend must be same-origin (served from device) or dev tooling must use CORS-disabled browser

## Session Continuity

Last session: 2026-03-15
Stopped at: Completed 01-01-PLAN.md — ESPHome YAML, secrets.yaml, .gitignore created and committed
Resume file: None

# ESP32-C3 GPIO Web Controller

## What This Is

An ESPHome-based firmware configuration and custom web frontend for the ESP32-C3 that lets you control and monitor all GPIO pins from a browser. Output pins can be toggled on/off; input pin states update in real-time via WebSocket. Designed as a development and debugging tool.

## Core Value

Every GPIO pin on the ESP32-C3 is accessible and controllable from a browser in real-time — no reflashing needed to test pin behavior.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] ESPHome YAML config exposes all ESP32-C3 GPIO pins (outputs as switches, inputs as binary sensors)
- [ ] ESPHome native API enabled for Home Assistant integration
- [ ] ESPHome web_server component enabled as fallback UI
- [ ] Custom web frontend displays all pins with their current state
- [ ] Output pins can be toggled on/off from the web UI
- [ ] Input pin states update in real-time (WebSocket)
- [ ] Frontend communicates with ESPHome's REST/WebSocket API

### Out of Scope

- Mobile app — web browser is sufficient for debugging use case
- User authentication — local network tool, no auth needed for v1
- Persistent pin configuration storage — pins are defined in YAML

## Context

- **Board:** ESP32-C3 (RISC-V, 2.4GHz WiFi, BLE 5, ~22 usable GPIO pins)
- **Firmware framework:** ESPHome (YAML-driven, generates firmware)
- **ESPHome APIs available:** REST API, WebSocket, native API (for HA)
- **Use case:** Development/debugging — quickly test pin states without reflashing
- **HA integration:** ESPHome native API must stay enabled alongside the web UI

## Constraints

- **Framework:** ESPHome — firmware is YAML config, not custom C++
- **Connectivity:** WiFi (2.4GHz) — ESP32-C3 connects to local network
- **Pin count:** ESP32-C3 has GPIO 0–10 and GPIO 18–21 (some reserved for USB/boot)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| ESPHome over Arduino/ESP-IDF | User's chosen framework — YAML config, HA-compatible | — Pending |
| Custom frontend over ESPHome default UI | Better UX, purpose-built layout for pin debugging | — Pending |
| WebSocket for real-time updates | Push-based, instant — vs polling latency | — Pending |

---
*Last updated: 2026-03-15 after initialization*

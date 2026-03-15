# Stack Research

**Domain:** ESPHome ESP32-C3 GPIO Web Controller
**Researched:** 2026-03-15
**Confidence:** MEDIUM (training data through Aug 2025; web verification blocked — flag versions for manual confirmation)

---

## Research Constraints

WebSearch, WebFetch, and Brave Search were all blocked during this research session.
All findings are from training data (knowledge cutoff August 2025).

**Action required before implementation:** Verify ESPHome version numbers and
`web_server` API details against https://esphome.io/changelog/ before starting Phase 1.

---

## Recommended Stack

### Firmware Layer (ESPHome YAML)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| ESPHome | 2024.11+ (verify current) | Firmware generation from YAML | Only sensible choice — user's constraint, HA-compatible, active project |
| ESP32-C3 platform | arduino or esp-idf | Underlying chip framework | esp-idf preferred for stability; arduino for broader component compat |
| `esp32` platform component | bundled with ESPHome | Board targeting | Required for ESP32-C3 — use `variant: esp32c3` |
| `wifi` component | bundled | Network connectivity | Required — no ethernet on C3 |
| `web_server` component | v3 (bundled) | REST + WebSocket API | Built-in, no extra infra — serves the endpoint the frontend talks to |
| `native_api` component | bundled | Home Assistant integration | Required per project constraint — runs alongside web_server |
| `switch` (GPIO switch) | bundled | Output pin control | Standard ESPHome pattern for toggling GPIO outputs |
| `binary_sensor` (GPIO) | bundled | Input pin state | Standard ESPHome pattern for reading GPIO inputs |
| `logger` component | bundled | Debug output via UART | Essential for development; disable in production to save RAM |
| `ota` component | bundled | Over-the-air updates | Avoids reflashing cycle during development |
| `api` (encryption) | bundled | Native API security | Use `password:` or `encryption.key:` for HA auth |

### Frontend Layer (Custom Web UI)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vanilla JavaScript (ES2022+) | — | UI logic and WebSocket client | No build step, no framework overhead — fits embedded constraint perfectly |
| Native WebSocket API | browser built-in | Real-time pin state updates | Already in every modern browser; no library needed for this use case |
| HTML5 + CSS3 | — | Layout and pin grid | Single-file deliverable keeps hosting simple |
| ESPHome `web_server` REST API | v3 endpoint | Toggle switches, read sensors | Built into ESPHome — no separate backend needed |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| ESPHome CLI (`esphome`) | Compile, flash, validate YAML | `pip install esphome` — use venv; `esphome run config.yaml` |
| ESPHome Dashboard | Browser-based YAML editor and log viewer | Optional but useful for rapid iteration |
| Python 3.11+ | ESPHome runtime dependency | Required by ESPHome CLI |
| esptool.py | Manual flashing fallback | Bundled with ESPHome; useful if OTA breaks |
| Browser DevTools | WebSocket frame inspection | Chrome/Firefox — inspect WS frames from `web_server` during dev |
| `curl` / Postman | REST API testing | Test `web_server` endpoints before building UI |

---

## ESPHome Component Details

### `web_server` Component (MEDIUM confidence)

ESPHome's `web_server` component (v3 as of 2024.x) exposes:

- **REST endpoints:**
  - `GET /` — built-in ESPHome dashboard HTML (can be disabled)
  - `GET /switch/<id>/state` — get switch state
  - `POST /switch/<id>/turn_on` — turn on
  - `POST /switch/<id>/turn_off` — turn off
  - `GET /binary_sensor/<id>/state` — get sensor state

- **WebSocket endpoint:**
  - `ws://<device-ip>/events` — Server-Sent Events (SSE) stream for state changes
  - Note: ESPHome `web_server` uses **SSE (Server-Sent Events)**, not full WebSocket — the client subscribes to an event stream. Confirm this distinction in current docs.

- **YAML snippet:**
  ```yaml
  web_server:
    port: 80
    version: 3
    local: true  # serve from device flash, not CDN
  ```

### `native_api` Component

Runs on port 6053 (protobuf over TCP). Entirely separate from `web_server` — both can run simultaneously. No conflict. Home Assistant uses this port exclusively.

### ESP32-C3 GPIO Map (MEDIUM confidence)

The ESP32-C3 has 22 GPIO pins total, but usable count depends on variant:

| GPIO Range | Notes |
|------------|-------|
| GPIO 0–7 | General purpose; GPIO 2 = boot mode, GPIO 8 = USB D-, GPIO 9 = boot button |
| GPIO 10–21 | General purpose; GPIO 18/19 = USB D+/D- on some boards |
| GPIO 20/21 | UART0 TX/RX — avoid unless UART logging disabled |

**Safe for GPIO in ESPHome (typical):** 0, 1, 2, 3, 4, 5, 6, 7, 10 (with caveats), 18, 19 (if not USB)

Verify pinout for the specific board variant being used — DevKit-C boards vary.

---

## Frontend Architecture Decision: Vanilla JS vs Framework

**Recommendation: Vanilla JS, no build step.**

Rationale:
1. The UI is a ~20-switch grid with real-time state updates — this is not a SPA problem.
2. ESPHome's `web_server` serves static files from device flash (very limited, ~1MB). A React/Vue bundle adds 150-300KB gzipped; vanilla JS adds ~5KB.
3. No Node.js toolchain required on the development machine for the frontend.
4. Single HTML file can be hosted on any static host or served from the ESP32-C3 itself if `web_server local: true`.
5. SSE (EventSource API) and fetch() cover 100% of the integration surface.

**What the frontend needs to do:**
- On load: `GET` state for all switches and binary sensors
- On SSE event: update pin state in DOM
- On toggle click: `POST /switch/<id>/turn_on` or `turn_off`

This is 50-100 lines of JS. No framework adds value at this scope.

---

## Installation

```bash
# ESPHome (in a Python virtual environment)
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install esphome

# Verify
esphome version

# Flash initial firmware (USB required for first flash)
esphome run gpio-controller.yaml

# Subsequent updates via OTA
esphome run gpio-controller.yaml  # auto-detects OTA if device on network
```

No npm install needed — frontend is vanilla JS.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Vanilla JS | React/Vue/Svelte | Only if UI grows to 10+ views with complex state; overkill for a pin grid |
| ESPHome `web_server` SSE | Custom MQTT + separate backend | If device needs to talk to multiple subscribers simultaneously; adds infrastructure |
| ESPHome `web_server` REST | ESPHome native API (port 6053) | Native API is for HA only — not HTTP, requires protobuf client; wrong tool for browser |
| esp-idf framework | Arduino framework | Arduino has broader component support but esp-idf is more stable for C3 USB; pick based on peripheral needs |
| OTA updates | USB reflash only | USB-only is fine for one-time setup, but OTA is standard for iterative dev |
| Single HTML file frontend | Separate dev server (Vite/webpack) | If frontend grows beyond ~500 lines, add Vite — but start without it |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| ESPHome native API (port 6053) as the frontend transport | Binary protobuf protocol — requires a protobuf client, not usable from browser fetch/WebSocket directly | `web_server` REST + SSE |
| React, Vue, Angular for the frontend | Bundle size too large for ESP32 flash hosting; no state management complexity justifying the overhead | Vanilla JS + native fetch + EventSource |
| MQTT as primary browser transport | Requires separate broker (Mosquitto etc.) and an MQTT-over-WebSocket client library — unnecessary infrastructure for local tool | ESPHome `web_server` SSE |
| `web_server version: 2` | v2 API is the older interface; v3 has better REST structure | `web_server version: 3` |
| Axios / jQuery for HTTP | Unnecessary dependency when native `fetch()` covers all needs | Native `fetch()` |
| WebSocket.io / socket.io | ESPHome does not use socket.io protocol — it uses SSE or raw WS | Native EventSource (SSE) or native WebSocket |
| Platform `arduino` with ESP32-C3 + USB | USB CDC on ESP32-C3 requires esp-idf for reliable serial; arduino may need workarounds | `framework: esp-idf` if USB serial logging needed |

---

## Stack Patterns by Variant

**If hosting the frontend from the ESP32-C3 itself (`web_server local: true`):**
- Keep total JS + HTML under 200KB uncompressed
- Minify HTML/JS manually or with a simple script before embedding
- Use `web_server` `css_include` / `js_include` directives to inject custom files

**If hosting the frontend from a separate static host (laptop, Raspberry Pi, S3):**
- Enable CORS on `web_server` (check if ESPHome supports `Access-Control-Allow-Origin` header — verify in docs)
- Frontend can be larger; add a simple build step with esbuild if needed
- This avoids flash size constraints entirely

**If using Arduino framework (not esp-idf):**
- Some ESPHome components (e.g., `esp32_ble_tracker`) require specific framework version — check component docs
- GPIO behavior is identical either way

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| ESPHome 2024.11+ | Python 3.10, 3.11, 3.12 | Python 3.9 dropped in 2024.x series |
| ESPHome 2024.x | esp-idf 5.1.x (bundled) | ESPHome manages esp-idf version internally — do not install separately |
| ESPHome 2024.x | Arduino core 2.x for ESP32 | Bundled — do not install Arduino IDE separately |
| `web_server` v3 | ESPHome 2023.9+ | v3 was introduced in 2023.9; use `version: 3` explicitly |

**Verify before starting:** Run `esphome version` and cross-check against https://esphome.io/changelog/ for any breaking changes after August 2025.

---

## Sources

- Training data (knowledge cutoff August 2025) — ESPHome architecture, components, ESP32-C3 GPIO — MEDIUM confidence
- https://esphome.io/components/web_server.html — verify `web_server` v3 API shape (not fetched — blocked)
- https://esphome.io/components/esp32.html — verify ESP32-C3 variant config (not fetched — blocked)
- https://esphome.io/changelog/ — verify current version (not fetched — blocked)

**Verification required before Phase 1:**
1. Current ESPHome version (`pip install esphome && esphome version`)
2. Confirm `web_server` v3 endpoint paths (especially SSE vs WebSocket distinction)
3. Confirm ESP32-C3 pinout for the specific board in use

---

*Stack research for: ESPHome ESP32-C3 GPIO Web Controller*
*Researched: 2026-03-15*

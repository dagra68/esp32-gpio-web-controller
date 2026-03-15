# Phase 1: Firmware Foundation - Research

**Researched:** 2026-03-15
**Domain:** ESPHome YAML firmware for ESP32-C3 — GPIO entities, web_server v3, native_api
**Confidence:** HIGH (core stack and GPIO pin map verified against official ESPHome docs and ESP-IDF docs; ESPHome version 2026.2.4 confirmed)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FIRM-01 | ESPHome YAML defines all usable ESP32-C3 GPIO pins as switches (output) or binary_sensors (input), excluding reserved pins (strapping: GPIO 2, 8, 9; USB/JTAG: GPIO 18, 19) | GPIO safe/unsafe list fully mapped — see GPIO Pin Map section; SPI flash pins GPIO 12-17 also restricted (newly confirmed) |
| FIRM-02 | ESPHome `web_server` component enabled with `version: 3` explicitly set, exposing REST and SSE API on port 80 | Full YAML schema verified; SSE endpoint at `/events` confirmed; REST endpoint patterns confirmed |
| FIRM-03 | ESPHome `native_api` component enabled for Home Assistant integration on port 6053 | Port and minimal config verified; runs alongside web_server without conflict |

</phase_requirements>

---

## Summary

Phase 1 establishes the firmware base that all subsequent phases depend on. ESPHome version 2026.2.4 (current as of March 2026) compiles and flashes from a YAML configuration file. The `web_server: version: 3` component exposes a REST API and an SSE event stream at `/events`. The `api:` component (native_api) runs in parallel on port 6053 for Home Assistant. The `ota: platform: esphome` component enables WiFi reflashing after the initial USB flash.

The most important pre-YAML action is mapping the safe GPIO pin list. The ESP32-C3 has 22 physical GPIO pads (GPIO 0–21), but three categories are restricted: strapping pins (GPIO 2, 8, 9), USB/JTAG pins (GPIO 18, 19), and SPI flash pins (GPIO 12–17). This leaves 11 safe GPIO pins: 0, 1, 3, 4, 5, 6, 7, 10, 11, 20, 21. Note that GPIO 8 is additionally significant: it is the on-board LED pin on the ESP32-C3-DevKitM-1 board AND a strapping pin — never configure it as a YAML entity.

Entity IDs in REST URLs use the YAML `name:` field verbatim (spaces and case preserved). The URL pattern is `/switch/My Switch Name/turn_on`. The SSE stream at `/events` delivers JSON events with a `name_id` field in format `domain/entity_name` (preferred) and a legacy `id` field in format `domain-object_id`. A 2026.8.0 migration away from the legacy `id` field is planned — build against `name_id` from the start.

**Primary recommendation:** Write the complete YAML (esphome block + wifi + logger + api + ota + web_server + all switch and binary_sensor entities) in one pass, validate with `esphome validate`, flash via USB, then verify SSE and REST with browser DevTools and curl before Phase 2 begins.

---

## Standard Stack

### Core (all bundled with ESPHome — no separate installs)

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| ESPHome CLI | 2026.2.4 | Compile YAML to firmware, flash, OTA | Only viable YAML-to-firmware tool for this project; current version confirmed |
| `esp32` platform | bundled | Target ESP32-C3 chip | Required for all ESP32 family chips in ESPHome |
| `wifi` | bundled | Network connectivity | Required — ESP32-C3 has no ethernet |
| `logger` | bundled | Debug output | Essential for development; USB_SERIAL_JTAG is default on ESP32-C3 |
| `api` (native_api) | bundled | Home Assistant integration on port 6053 | Required per FIRM-03; runs alongside web_server |
| `ota: platform: esphome` | bundled | OTA firmware updates | Avoids USB reflash cycle; required for iterative development |
| `web_server: version: 3` | bundled | REST + SSE API on port 80 | Required per FIRM-02; v3 is current; must be pinned explicitly |
| `switch: platform: gpio` | bundled | Output pin entities | FIRM-01 output pins |
| `binary_sensor: platform: gpio` | bundled | Input pin entities | FIRM-01 input pins |

### Development Tools

| Tool | Purpose | Install |
|------|---------|---------|
| Python 3.11+ venv | ESPHome runtime | System Python |
| ESPHome CLI | Compile and flash | `pip install esphome` |
| `curl` | REST API verification | System |
| Browser DevTools (Network tab) | SSE stream inspection | Browser |

**Installation:**
```bash
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install esphome
esphome version                # confirm 2026.2.x
```

---

## GPIO Pin Map

This is the definitive safe-pin list for FIRM-01. Verified against the ESP-IDF GPIO reference and Espressif ESP32-C3 TRM.

| GPIO | Safe? | Reason if Restricted | Notes |
|------|-------|----------------------|-------|
| 0 | YES | — | ADC1_CH0; RTC wakeup capable |
| 1 | YES | — | ADC1_CH1; RTC wakeup capable |
| 2 | NO | **Strapping pin** — boot mode | Boot failure if driven at reset |
| 3 | YES | — | ADC1_CH3; RTC wakeup capable |
| 4 | YES | — | ADC1_CH4; RTC wakeup capable |
| 5 | YES | — | ADC2_CH0; RTC wakeup capable |
| 6 | YES | — | No restrictions |
| 7 | YES | — | No restrictions |
| 8 | NO | **Strapping pin** — also on-board LED on DevKitM-1 | Never use as entity |
| 9 | NO | **Strapping pin** — boot button; LOW at reset = download mode | Dangerous if externally driven |
| 10 | YES | — | No restrictions |
| 11 | YES | — | No restrictions |
| 12 | NO | **SPI flash** — internal flash bus | Board-level conflict |
| 13 | NO | **SPI flash** — internal flash bus | Board-level conflict |
| 14 | NO | **SPI flash** — internal flash bus | Board-level conflict |
| 15 | NO | **SPI flash** — internal flash bus | Board-level conflict |
| 16 | NO | **SPI flash** — internal flash bus | Board-level conflict |
| 17 | NO | **SPI flash** — internal flash bus | Board-level conflict |
| 18 | NO | **USB/JTAG D-** — logger uses USB_SERIAL_JTAG by default | Configuring as GPIO disables USB programming/logging |
| 19 | NO | **USB/JTAG D+** — USB_SERIAL_JTAG | Same as GPIO 18 |
| 20 | YES | — | UART0 RX (default); safe if not using UART0 |
| 21 | YES | — | UART0 TX (default); safe if not using UART0 |

**Safe GPIO pins (11 total):** 0, 1, 3, 4, 5, 6, 7, 10, 11, 20, 21

**Key finding from research:** The prior project research listed only 5 restricted pins (2, 8, 9, 18, 19). The ESP-IDF docs confirm GPIO 12–17 are also restricted (SPI flash bus). The safe usable set is 11 pins, not 17.

**Design decision required:** Split the 11 safe pins between switch (output) and binary_sensor (input) types. One direction per pin — never configure the same GPIO number in both a switch and a binary_sensor.

---

## Architecture Patterns

### Recommended Project Structure

```
esp32-gpio-controller/
├── gpio-controller.yaml      # Main ESPHome config (do not commit credentials)
├── secrets.yaml              # WiFi credentials — git-ignored
└── .gitignore                # Must include secrets.yaml
```

### Pattern 1: Minimal Base YAML

This is the verified, current-syntax ESPHome configuration skeleton for ESP32-C3 with esp-idf framework. OTA syntax changed in ESPHome 2024.6.0 to require `platform: esphome`.

```yaml
# Source: https://esphome.io/guides/getting_started_command_line.html
# + https://esphome.io/components/ota/index.html (2024.6.0 platform syntax)
esphome:
  name: gpio-controller

esp32:
  board: esp32-c3-devkitm-1
  variant: ESP32C3
  framework:
    type: esp-idf

logger:
  hardware_uart: USB_SERIAL_JTAG   # ESP32-C3 uses USB_SERIAL_JTAG, not UART0
  level: DEBUG                      # Use WARN in production to save RAM

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
  ap:
    ssid: "GPIO Controller Fallback"

api:
  reboot_timeout: 0s   # Prevent forced reboot when HA disconnects

ota:
  - platform: esphome

web_server:
  port: 80
  version: 3
  local: true     # Serve JS assets from device flash (offline-capable)
```

And `secrets.yaml` (git-ignored):
```yaml
wifi_ssid: "YourNetworkName"
wifi_password: "YourNetworkPassword"
```

### Pattern 2: Switch (Output) Entity

```yaml
# Source: https://esphome.io/components/switch/gpio.html
switch:
  - platform: gpio
    pin:
      number: GPIO3
      mode:
        output: true
    name: "GPIO 3 Output"
    id: gpio3_switch
```

REST URL for this entity: `POST /switch/GPIO 3 Output/turn_on`
SSE `name_id` for this entity: `switch/GPIO 3 Output`

### Pattern 3: Binary Sensor (Input) Entity

```yaml
# Source: https://esphome.io/components/binary_sensor/gpio.html
binary_sensor:
  - platform: gpio
    pin:
      number: GPIO10
      mode:
        input: true
        pullup: true
    name: "GPIO 10 Input"
    id: gpio10_sensor
```

REST URL: `GET /binary_sensor/GPIO 10 Input`
SSE `name_id`: `binary_sensor/GPIO 10 Input`

### Entity ID Slugification Rules (CRITICAL for Phase 2)

**How `name:` maps to REST URLs:**
- The URL path uses the `name:` field **verbatim** — spaces and case are preserved
- Example: `name: "GPIO 3 Output"` → URL token is `GPIO 3 Output` (URL-encode spaces as `%20` in curl)
- ESPHome does NOT auto-lowercase or replace spaces in REST URL paths

**SSE `name_id` format (prefer over legacy `id`):**
- Format: `domain/entity_name` — e.g., `switch/GPIO 3 Output`
- Legacy `id` format: `domain-object_id` — e.g., `switch-gpio_3_output` (lowercased, spaces → underscores)
- **Use `name_id` exclusively** — legacy `id` field is being deprecated in ESPHome 2026.8.0

**Naming recommendation for clean URLs:** Use short, consistent names like `"GPIO 3"` or `"Pin 3"` to minimize URL complexity.

### Pattern 4: SSE Event Stream

```javascript
// Source: https://esphome.io/web-api/
// Connect to SSE stream
const source = new EventSource('http://DEVICE_IP/events');

// Three event types: ping, state, log
source.addEventListener('state', (event) => {
  const data = JSON.parse(event.data);
  // data.name_id = "switch/GPIO 3 Output"   ← use this
  // data.id      = "switch-gpio_3_output"   ← legacy, avoid
  // data.state   = "ON" | "OFF"
  // data.value   = true | false
  console.log(data.name_id, data.state, data.value);
});

// EventSource has built-in reconnection — no manual reconnect needed for SSE
// But state resync on reconnect IS needed (missed events during disconnect)
```

State event JSON shape (verified):
```json
{
  "name_id": "switch/GPIO 3 Output",
  "id": "switch-gpio_3_output",
  "state": "ON",
  "value": true
}
```

### Anti-Patterns to Avoid

- **Logger without `hardware_uart: USB_SERIAL_JTAG`:** On ESP32-C3 with esp-idf, the default logger tries UART0 on GPIO 20/21; USB_SERIAL_JTAG is the correct interface for USB-connected DevKitM-1 boards.
- **OTA without `platform: esphome`:** Since ESPHome 2024.6.0 the `ota:` block requires `- platform: esphome`; the old bare `ota:` syntax is broken.
- **Same GPIO in both switch and binary_sensor:** ESPHome compiles without error but runtime behavior is undefined. One direction per pin.
- **Relying on default `web_server` version:** The default is still version 2; always set `version: 3` explicitly.
- **`reboot_timeout` not set on `api:`:** Default is 15 minutes — the device reboots if HA is not connected for 15 minutes. Set `reboot_timeout: 0s` to disable forced reboots.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| REST + SSE API server on ESP32 | Custom HTTP/WebSocket server | ESPHome `web_server: version: 3` | ESPHome's server handles chunked responses, SSE keep-alive, concurrent clients, and entity state tracking |
| GPIO state tracking | Manual interrupt handlers | ESPHome `binary_sensor: platform: gpio` | ESPHome handles debouncing, pullup/pulldown config, and state publishing to SSE automatically |
| OTA update mechanism | Custom binary upload endpoint | ESPHome `ota: platform: esphome` | ESPHome OTA handles partition tables, rollback on failure, and safe mode automatically |
| HA protocol integration | Native API protobuf implementation | ESPHome `api:` component | Native API is a binary protobuf protocol over TCP — not something to implement from scratch |
| Secrets management | Hardcoded credentials in YAML | `secrets.yaml` + `!secret` references | Prevents credentials appearing in git history |

---

## Common Pitfalls

### Pitfall 1: SPI Flash Pins (GPIO 12–17) — Missing From Prior Research

**What goes wrong:** GPIO 12–17 are connected to the internal SPI flash bus on ESP32-C3 DevKitM-1 boards. Configuring them as switch or binary_sensor entities causes undefined behavior or compilation errors. The prior project research did not list these as restricted.

**Why it happens:** Community documentation often lists only 5 restricted pins (strapping + USB). The ESP-IDF GPIO reference includes the SPI flash restriction but it is easy to miss.

**How to avoid:** Use only the 11 safe pins: 0, 1, 3, 4, 5, 6, 7, 10, 11, 20, 21.

**Confidence:** HIGH — verified against ESP-IDF stable docs.

### Pitfall 2: Strapping Pin GPIO 9 — Boot Mode Forcing

**What goes wrong:** GPIO 9 pulled LOW at reset forces the ESP32-C3 into ROM download mode. It becomes unresponsive to normal operation until manually reflashed.

**How to avoid:** GPIO 9 is categorically excluded from all YAML entities. Document it as "boot button / download mode" in YAML comments.

**Recovery:** Hold GPIO 9 LOW while applying power to force download mode, then reflash via USB.

### Pitfall 3: Logger Defaults on ESP32-C3

**What goes wrong:** Without `hardware_uart: USB_SERIAL_JTAG`, the logger on ESP32-C3 with esp-idf uses UART0 (GPIO 20/21). If GPIO 20 or 21 are configured as entities, the UART conflicts. Worse, USB_SERIAL_JTAG is the standard USB interface on the DevKitM-1 — without this setting, `esphome logs` may show nothing.

**How to avoid:** Always set `logger: hardware_uart: USB_SERIAL_JTAG` in the ESP32-C3 config.

**Note:** USB_SERIAL_JTAG uses GPIO 18/19 internally for the physical USB, but it is managed by the USB peripheral — this does not conflict with excluding GPIO 18/19 from general GPIO entities. The distinction is: the logger talks to the USB *peripheral*, not the GPIO pins directly.

### Pitfall 4: OTA Syntax Changed in ESPHome 2024.6.0

**What goes wrong:** Old YAML syntax `ota: password: "..."` is broken in ESPHome 2024.6+. The first flash silently fails OTA setup.

**Correct syntax:**
```yaml
ota:
  - platform: esphome
```

**How to avoid:** Use the list syntax with `platform: esphome` explicitly.

**Confidence:** HIGH — verified against ESPHome OTA docs, confirmed as breaking change in 2024.6.0.

### Pitfall 5: `web_server version: 3` Default Is Still 2

**What goes wrong:** If `version:` is omitted, ESPHome uses `version: 2`. The v2 and v3 APIs have different endpoint structures and different SSE event formats. Phase 2 frontend will be built against v3 — silent version drift causes confusing 404 errors after any YAML re-flash where the version line was accidentally removed.

**How to avoid:** Always write `version: 3` explicitly. Add a YAML comment: `# DO NOT REMOVE — default is v2`.

### Pitfall 6: `api: reboot_timeout` Causes Unexpected Device Reboots

**What goes wrong:** The default `reboot_timeout` on the `api:` component is 15 minutes. If Home Assistant is not running or not connected, the device reboots every 15 minutes. During Phase 1 testing without HA, this causes repeated disconnects.

**How to avoid:** Set `reboot_timeout: 0s` to disable the forced reboot during development.

### Pitfall 7: CORS — No `cors:` Option in web_server v3

**What goes wrong:** The prior research noted "verify `cors:` option availability." The current ESPHome `web_server` docs (March 2026) do NOT show a `cors:` configuration option. There is no CORS header support built into web_server v3.

**Implication for Phase 2:** The frontend MUST be served from the device itself (same origin) or from the browser directly as a local file opened with `file://` (which also avoids CORS for some browsers, with caveats). Development against `localhost:3000` will be blocked by CORS.

**How to avoid:** Serve the frontend from the device using `web_server`'s `js_include` / `css_include` directives. For development iteration without reflashing, use a browser with CORS disabled (Chrome `--disable-web-security`) pointed at the device IP, then embed the final frontend in the device for production.

**Confidence:** MEDIUM — confirmed absence of `cors:` from current docs; community workarounds suggest this has been a recurring request.

### Pitfall 8: `name_id` vs Legacy `id` in SSE Events

**What goes wrong:** ESPHome 2026.8.0 will deprecate the legacy `id` field in SSE events (format: `domain-object_id`). Phase 2 code written against `id` will break after an ESPHome upgrade later in the project.

**How to avoid:** In Phase 2, use `name_id` field exclusively for entity identification in SSE event parsing.

---

## Code Examples

### Complete Minimal Verification YAML (Phase 1 target)

```yaml
# gpio-controller.yaml
# Source: ESPHome official docs verified 2026-03-15
esphome:
  name: gpio-controller

esp32:
  board: esp32-c3-devkitm-1
  variant: ESP32C3
  framework:
    type: esp-idf

logger:
  hardware_uart: USB_SERIAL_JTAG
  level: DEBUG

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
  ap:
    ssid: "GPIO Controller Fallback"

api:
  reboot_timeout: 0s   # Disable forced reboot when HA not connected

ota:
  - platform: esphome  # Syntax required since ESPHome 2024.6.0

web_server:
  port: 80
  version: 3           # DO NOT REMOVE — default is v2
  local: true

# --- OUTPUT PINS (switches) ---
# Safe output pins: 0, 1, 3, 4, 5, 6, 7, 10, 11
switch:
  - platform: gpio
    pin:
      number: GPIO3
      mode:
        output: true
    name: "GPIO 3"
    id: gpio3_sw

  - platform: gpio
    pin:
      number: GPIO4
      mode:
        output: true
    name: "GPIO 4"
    id: gpio4_sw

# --- INPUT PINS (binary sensors) ---
# Safe input pins: 20, 21 (and any not used as outputs above)
binary_sensor:
  - platform: gpio
    pin:
      number: GPIO20
      mode:
        input: true
        pullup: true
    name: "GPIO 20"
    id: gpio20_bs

  - platform: gpio
    pin:
      number: GPIO21
      mode:
        input: true
        pullup: true
    name: "GPIO 21"
    id: gpio21_bs
```

### REST API Verification Commands

```bash
# Verify device is up and web_server is running
curl http://DEVICE_IP/

# Get switch state (replace spaces with %20 in curl)
curl http://DEVICE_IP/switch/GPIO%203

# Toggle switch ON
curl -X POST http://DEVICE_IP/switch/GPIO%203/turn_on

# Toggle switch OFF
curl -X POST http://DEVICE_IP/switch/GPIO%203/turn_off

# Toggle (flip current state)
curl -X POST http://DEVICE_IP/switch/GPIO%203/toggle

# Get binary sensor state
curl http://DEVICE_IP/binary_sensor/GPIO%2020

# Stream SSE events (Ctrl+C to stop)
curl -N -H "Accept: text/event-stream" http://DEVICE_IP/events
```

### SSE Stream Verification via Browser DevTools

1. Open `http://DEVICE_IP` in browser
2. Open DevTools > Network tab > Filter by "Fetch/XHR" or "Other"
3. Find the `/events` request — it should show type `eventsource`
4. Click it and view the EventStream tab
5. Confirm `state` events appear with JSON containing `name_id` and `state` fields

### native_api Verification (FIRM-03)

```bash
# Verify port 6053 is listening
# On the development machine (Linux/Mac):
nc -zv DEVICE_IP 6053

# On Windows:
Test-NetConnection -ComputerName DEVICE_IP -Port 6053

# Full HA verification:
# Open Home Assistant > Settings > Integrations
# Device should appear in "Discovered" within 5 minutes
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ota: password: "..."` (bare dict) | `ota:\n  - platform: esphome` (list with platform) | ESPHome 2024.6.0 | Old syntax breaks silently; must use new form |
| `web_server: version: 2` (default) | `web_server: version: 3` (must set explicitly) | ESPHome 2023.9 | v3 has better REST structure and SSE; v2 is still the default |
| SSE `id` field (`domain-object_id`) | SSE `name_id` field (`domain/entity_name`) | ESPHome ~2025.x; deprecated 2026.8.0 | Build against `name_id` exclusively |
| `framework: type: arduino` for ESP32-C3 | `framework: type: esp-idf` (default and recommended) | Ongoing | esp-idf is more stable for USB CDC on C3 |
| Bare `api:` with no reboot_timeout | `api: reboot_timeout: 0s` for dev environments | Ongoing best practice | Prevents 15-min forced reboots when HA not connected |

**Deprecated/outdated:**
- `ota: password:` (bare dict syntax): Broken since 2024.6.0. Always use `- platform: esphome` list syntax.
- SSE `id` field: Being deprecated in ESPHome 2026.8.0. Use `name_id`.

---

## Open Questions

1. **Exact board identifier for non-DevKitM-1 variants**
   - What we know: `esp32-c3-devkitm-1` is confirmed for the official Espressif DevKitM-1 board. Other common variants (Super Mini, LOLIN C3 Mini, Seeed XIAO C3) use different board identifiers.
   - What's unclear: Which specific ESP32-C3 board variant is in use for this project.
   - Recommendation: Check the board silk screen or purchase listing. Common alternatives: `lolin_c3_mini`, `seeed_xiao_esp32c3`. If unknown, `esp32-c3-devkitm-1` is the safest generic fallback — it works on most C3 boards even if not the exact variant.

2. **GPIO 20/21 conflict with logger UART0**
   - What we know: GPIO 20 (UART0 RX) and GPIO 21 (UART0 TX) are safe for general GPIO use when `hardware_uart: USB_SERIAL_JTAG` is set in logger (because UART0 is then unused).
   - What's unclear: If someone later adds `hardware_uart: UART0` to logger, GPIO 20/21 entities would conflict.
   - Recommendation: Keep `hardware_uart: USB_SERIAL_JTAG` pinned in logger config. Add a YAML comment noting that removing it would conflict with GPIO 20/21 entities.

3. **Exact split of 11 safe pins between output and input**
   - What we know: 11 safe pins exist; FIRM-01 requires some to be switches and some binary_sensors.
   - What's unclear: The intended pin split is not specified in requirements — how many outputs vs inputs is a project design decision.
   - Recommendation: Default to 9 outputs (GPIO 0, 1, 3, 4, 5, 6, 7, 10, 11) and 2 inputs (GPIO 20, 21) as a reasonable starting configuration. This can be adjusted without hardware changes by reflashing YAML.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Manual verification — no automated test framework applicable for firmware flash validation |
| Config file | N/A — ESPHome uses `esphome validate` for YAML linting |
| Quick run command | `esphome validate gpio-controller.yaml` |
| Full suite command | `esphome compile gpio-controller.yaml` then flash + manual API checks |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FIRM-01 | All 11 safe GPIO pins configured as switch or binary_sensor; no restricted pins in YAML | YAML lint + manual review | `esphome validate gpio-controller.yaml` | ❌ Wave 0 |
| FIRM-01 | Device boots cleanly after full YAML flash (no strapping pin boot failure) | Manual smoke | Power-cycle device 3x; confirm boot each time | N/A — manual |
| FIRM-02 | REST POST `/switch/GPIO 3/turn_on` returns 200 | Manual smoke | `curl -X POST http://DEVICE_IP/switch/GPIO%203/turn_on` | N/A — manual |
| FIRM-02 | SSE stream at `/events` delivers state events | Manual smoke | `curl -N -H "Accept: text/event-stream" http://DEVICE_IP/events` | N/A — manual |
| FIRM-03 | Port 6053 is open and accepting connections | Manual smoke | `nc -zv DEVICE_IP 6053` or PowerShell equivalent | N/A — manual |
| FIRM-03 | Device appears in HA discovered integrations | Manual E2E | Open HA Integrations page; confirm device listed | N/A — manual |

### Sampling Rate

- **Per task commit:** `esphome validate gpio-controller.yaml` (catches YAML syntax errors and unknown component options)
- **Per wave merge:** Full compile `esphome compile gpio-controller.yaml` + flash + all manual API checks
- **Phase gate:** All manual smoke tests green; device boots 3x cleanly; REST and SSE verified; port 6053 verified

### Wave 0 Gaps

- [ ] `gpio-controller.yaml` — the main config file (does not exist yet; created in Wave 1)
- [ ] `secrets.yaml` — WiFi credentials file (does not exist yet; created in Wave 1; must be git-ignored)
- [ ] `.gitignore` — must exclude `secrets.yaml` (does not exist yet; created in Wave 1)

---

## Sources

### Primary (HIGH confidence)

- [ESPHome Web API Reference](https://esphome.io/web-api/) — SSE `/events` endpoint confirmed; `name_id` vs `id` field format; switch/binary_sensor REST endpoints; state event JSON schema
- [ESPHome web_server Component](https://esphome.io/components/web_server/) — version 3 YAML options; `local`, `js_include`, `css_include`, `compression`, `sorting_groups`; no `cors:` option present
- [ESPHome ESP32 Platform](https://esphome.io/components/esp32.html) — `variant: ESP32C3`; `board: esp32-c3-devkitm-1`; framework options
- [ESPHome API Component](https://esphome.io/components/api.html) — port 6053; `reboot_timeout`; encryption; HA discovery
- [ESPHome OTA Component](https://esphome.io/components/ota/index.html) — `platform: esphome` syntax; 2024.6.0 breaking change confirmed
- [ESPHome GPIO Switch](https://esphome.io/components/switch/gpio.html) — YAML schema; pin mode; name-to-URL mapping
- [ESPHome GPIO Binary Sensor](https://esphome.io/components/binary_sensor/gpio.html) — YAML schema; pullup mode; REST endpoint
- [ESPHome Logger](https://esphome.io/components/logger.html) — `hardware_uart: USB_SERIAL_JTAG` for ESP32-C3; UART0 pins GPIO 20/21
- [ESP-IDF GPIO Reference — ESP32-C3](https://docs.espressif.com/projects/esp-idf/en/stable/esp32c3/api-reference/peripherals/gpio.html) — complete pin table; strapping pins; SPI flash pins GPIO 12–17; USB/JTAG GPIO 18–19
- [ESPHome WiFi Component](https://esphome.io/components/wifi.html) — secrets pattern; fallback AP; static IP
- [ESPHome Getting Started CLI](https://esphome.io/guides/getting_started_command_line.html) — secrets.yaml pattern; `esphome run` command
- [ESPHome Changelog](https://esphome.io/changelog/index.html) — Current version 2026.2.4 confirmed (March 3, 2026); 2026.2.1 web server fix noted

### Secondary (MEDIUM confidence)

- [Hutscape ESP32-C3 ESPHome Tutorial](https://hutscape.com/tutorials/blinky-esphome-esp32c3) — Confirms `board: esp32-c3-devkitm-1`, `variant: ESP32C3`, esp-idf framework; GPIO 8 on-board LED note confirmed
- [ESPHome community ESP32-C3 board identifiers](https://community.home-assistant.io/t/getting-esphome-to-work-with-an-esp32-c3-board/450923) — Community confirmation of `esp32-c3-devkitm-1` identifier
- [PCB Artists ESP32-C3 GPIO Notes](https://pcbartists.com/design/embedded/esp32-c3-gpio-notes-strapping-pins/) — Strapping pin list confirmation

### Tertiary (LOW confidence)

- [ESPHome strapping pin community reports](https://www.espboards.dev/blog/esp32-strapping-pins/) — Community aggregation of strapping pin behavior; consistent with official docs

---

## Metadata

**Confidence breakdown:**
- Standard stack (ESPHome components, YAML syntax): HIGH — verified against official ESPHome docs at current version 2026.2.4
- GPIO pin map (safe vs restricted): HIGH — verified against ESP-IDF stable docs; SPI flash pin restriction (12–17) newly confirmed beyond prior research
- REST/SSE API endpoints and JSON format: HIGH — verified against official ESPHome Web API docs
- Architecture patterns (entity ID → URL mapping, `name_id` deprecation): HIGH — verified against official docs
- `cors:` option absence: MEDIUM — confirmed not present in current docs; absence of evidence is not proof of absence, but strong signal
- Board identifier (`esp32-c3-devkitm-1`): MEDIUM-HIGH — confirmed in official Espressif DevKit docs and multiple ESPHome community examples; may differ for other C3 board variants

**Research date:** 2026-03-15
**Valid until:** 2026-06-15 (ESPHome releases frequently; re-verify web_server API shape and OTA syntax after any major ESPHome upgrade)

**Key delta from prior project research:**
- SPI flash pins GPIO 12–17 are ALSO restricted (not in prior SUMMARY.md or PITFALLS.md)
- Safe pin count is 11 (not ~17 as prior research implied)
- `cors:` option confirmed absent from web_server v3
- ESPHome current version is 2026.2.4 (prior research said "2024.11+, verify")
- `name_id` vs `id` field deprecation timeline: 2026.8.0
- Logger requires `hardware_uart: USB_SERIAL_JTAG` on ESP32-C3
- OTA `platform: esphome` list syntax confirmed (changed in 2024.6.0)

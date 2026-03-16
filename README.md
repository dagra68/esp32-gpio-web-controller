# ESP32-C3 GPIO Web Controller

A browser-based GPIO controller for the ESP32-C3, built with ESPHome. Toggle output pins and monitor input pin states in real-time from any browser on your local network.

![ESPHome](https://img.shields.io/badge/ESPHome-2026.2.4-blue) ![ESP32-C3](https://img.shields.io/badge/ESP32-C3-green)

## Features

- **11 GPIO pins** — 9 outputs (toggleable), 2 inputs (monitored)
- **Real-time updates** — input pin states push instantly via SSE (Server-Sent Events)
- **Custom web UI** — purpose-built pin grid, served directly from the device
- **Home Assistant** — native API on port 6053, works alongside the web UI
- **No cloud** — entirely local network, no external services

## Hardware

| Board | ESP32-C3-DevKitM-1 |
|-------|-------------------|
| Framework | ESP-IDF |
| ESPHome | 2026.2.4+ |

### Safe GPIO pins

| Pins | Direction | Notes |
|------|-----------|-------|
| 0, 1, 3, 4, 5, 6, 7, 10, 11 | Output (switch) | Toggleable from UI |
| 20, 21 | Input (binary_sensor) | Pull-up, active-LOW |
| 2, 8, 9 | **Reserved** | Strapping pins — do not use |
| 12–17 | **Reserved** | SPI flash bus |
| 18, 19 | **Reserved** | USB/JTAG (used by logger) |

## Setup

### 1. Install ESPHome

```bash
pip install esphome
```

### 2. Configure WiFi credentials

Edit `esp32-gpio-controller/secrets.yaml`:

```yaml
wifi_ssid: "YourNetworkName"
wifi_password: "YourPassword"
```

> `secrets.yaml` is git-ignored — never committed.

### 3. Flash

```bash
cd esp32-gpio-controller
esphome run gpio-controller.yaml
```

Note the device IP from the logs (e.g. `192.168.1.42`).

### 4. Open the UI

Navigate to `http://<device-ip>` in your browser.

## Web UI

The UI (`esp32-gpio-controller/index.html` + `gpio-ui.js`) is embedded in device flash via `js_include` and served same-origin — no separate server needed.

For local development:

```bash
cd esp32-gpio-controller
python -m http.server 8080
# open http://localhost:8080
```

The JS falls back to `10.1.1.162` (hardcoded dev IP) when served from localhost. Update `DEVICE_HOST` in `gpio-ui.js` if your device has a different IP.

## API

ESPHome `web_server v3` exposes a REST + SSE API on port 80:

```bash
# Get switch state
curl http://<device-ip>/switch/GPIO%203

# Toggle output
curl -X POST http://<device-ip>/switch/GPIO%203/toggle

# Real-time event stream
curl -N -H "Accept: text/event-stream" http://<device-ip>/events
```

CORS is open (`Access-Control-Allow-Origin: *`) — cross-origin requests work from any origin.

## Home Assistant

The ESPHome native API runs on port 6053 in parallel with the web UI. Add the device in HA via **Settings → Devices & Services → ESPHome**.

## Configuring a pin as input

By default all 11 pins are configured as outputs. To monitor a pin instead of controlling it, replace its `switch` block in `gpio-controller.yaml` with a `binary_sensor`:

```yaml
binary_sensor:
  - platform: gpio
    pin:
      number: GPIO20        # any safe pin
      mode:
        input: true
        pullup: true        # keeps pin HIGH when floating (active-LOW)
    name: "GPIO 20"
    id: gpio20_bs
```

Then reflash:

```bash
esphome run gpio-controller.yaml
```

The pin will appear in the UI as an INPUT with a live HIGH/LOW badge. Pin state is HIGH when floating and LOW when connected to GND.

## Project structure

```
esp32-gpio-controller/
├── gpio-controller.yaml   # ESPHome config
├── gpio-ui.js             # Frontend JS (embedded in flash)
├── index.html             # Frontend HTML (dev shell)
└── secrets.yaml           # WiFi credentials (git-ignored)
```

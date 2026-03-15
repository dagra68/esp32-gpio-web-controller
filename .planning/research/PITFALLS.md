# Pitfalls Research

**Domain:** ESPHome ESP32-C3 GPIO web controller with custom frontend
**Researched:** 2026-03-15
**Confidence:** HIGH for hardware pin restrictions and ESPHome API behavior; MEDIUM for CORS specifics (ESPHome releases actively; verify against current version)

---

## Critical Pitfalls

### Pitfall 1: Using Strapping / Boot-Mode GPIO Pins as General I/O

**What goes wrong:**
The ESP32-C3 has four strapping pins (GPIO 2, GPIO 8, GPIO 9) that the bootloader samples at reset to determine boot mode and download mode. If these are driven externally during power-on or reset, the chip either refuses to boot into application mode or enters the ROM download bootloader unexpectedly. GPIO 9 is the most dangerous — pulling it LOW at reset forces the chip into download mode, making the device unresponsive to normal operation.

**Why it happens:**
Developers treat all pins as equal. ESPHome will happily accept `GPIO 9` in a switch or binary_sensor config and compile without error. The failure only appears at runtime when the chip is power-cycled or reset with something connected.

**How to avoid:**
Never use GPIO 2, GPIO 8, or GPIO 9 as general-purpose outputs or inputs that are driven at power-on. If you must use them, ensure the external circuit leaves them in the correct default state (GPIO 9 HIGH for normal boot). In the YAML pin list, treat these three as categorically off-limits or annotate them with explicit "strapping pin — boot risk" comments.

**Warning signs:**
- Device boots normally when flashed via USB but hangs after a hard power cycle.
- Device only recovers by re-flashing (because it booted into download mode instead of app mode).
- Intermittent boots that depend on whether a wire or component is connected.

**Phase to address:** ESPHome YAML configuration phase (first firmware phase). Build the safe-pin list before writing any YAML.

---

### Pitfall 2: USB/JTAG Pins GPIO 18 and GPIO 19 Cannot Be Used as GPIO

**What goes wrong:**
The ESP32-C3 has built-in USB Serial/JTAG on GPIO 18 (D-) and GPIO 19 (D+). These are the same pins many boards use for the USB programming interface. ESPHome may allow configuring them as GPIO in YAML, but doing so conflicts with the USB peripheral. On boards where the USB port is the only programming interface (no UART chip), misconfiguring these pins can brick the device until it is manually put into download mode by holding GPIO 9 LOW during reset.

**Why it happens:**
The ESP32-C3 datasheet lists GPIO 18 and 19 in the general GPIO table. The USB function is a peripheral that shares these physical pads, and the conflict is not always obvious. Community pin-count claims of "22 usable GPIOs" sometimes count 18 and 19 without the USB caveat.

**How to avoid:**
Treat GPIO 18 and 19 as reserved unless you have a board with a dedicated UART-to-USB chip (CP2102, CH340, etc.) and have confirmed those pins are not wired to the USB connector. The safe working set for general GPIO is GPIO 0–10 excluding strapping concerns, which yields roughly 8–10 reliably usable pins.

**Warning signs:**
- USB programming stops working after a flash that included GPIO 18 or 19 in a switch or binary_sensor.
- OTA flashing fails but the device appears to still be running (log output visible briefly at boot, then USB dies).

**Phase to address:** ESPHome YAML configuration phase. Document the explicit exclusion list before creating any pin entities.

---

### Pitfall 3: CORS Blocks the Custom Frontend from Reaching ESPHome's REST API

**What goes wrong:**
ESPHome's `web_server` component serves its own frontend from the device's IP. When you serve a custom frontend from a different origin (a dev server on `localhost:3000`, a file served from a laptop, or a different host), the browser blocks all REST API calls and WebSocket connections due to the Same-Origin Policy. ESPHome's built-in web server does not set permissive CORS headers by default on its REST endpoints.

**Why it happens:**
Developers build the frontend locally and point it at `http://192.168.x.x/switch/my_switch/toggle`. This works in tools like curl or Postman but fails in the browser because the browser enforces CORS. The error appears in the browser console but the device itself gives no indication of the problem.

**How to avoid:**
Two approaches — pick one:
1. Serve the custom frontend **from the ESP32-C3 itself** using ESPHome's `web_server` `js_include` or by embedding the frontend as a SPIFFS/LittleFS file served by a custom component. Same origin, no CORS problem.
2. If developing locally, use a browser CORS disable flag for development only (`--disable-web-security` in Chrome), then accept that production must use approach 1 or a proxy.

The `web_server` component (v3) in recent ESPHome versions added a `cors` option — verify in the current ESPHome docs whether `cors: true` covers all endpoints including the WebSocket event stream.

**Warning signs:**
- Browser console shows `CORS policy: No 'Access-Control-Allow-Origin' header`.
- `fetch()` calls to the device succeed from curl but silently fail in the browser.
- WebSocket connects briefly then drops with a security error.

**Phase to address:** Frontend integration phase. Establish the serving strategy (embedded vs. external) before writing any frontend API calls.

---

### Pitfall 4: WebSocket Event Stream Drops Silently and State Goes Stale

**What goes wrong:**
ESPHome's WebSocket-based event stream (available at `/events` as Server-Sent Events or via the native WebSocket) does not automatically reconnect if the connection drops. WiFi hiccups, ESP32-C3 watchdog resets, and OTA updates all close the connection. If the frontend has no reconnection logic, the UI freezes showing stale pin states indefinitely with no visible error.

**Why it happens:**
The native browser `WebSocket` API fires an `onclose` event but does not reconnect. Developers who implement a quick proof-of-concept with a single `new WebSocket(url)` call get it working in a stable environment and never test connection loss.

**How to avoid:**
Implement exponential backoff reconnection from day one. On `onclose` or `onerror`, wait (e.g., 1s, 2s, 4s, max 30s) and reconnect. On successful reconnect, explicitly re-fetch all current pin states via the REST API (`/switch/`, `/binary_sensor/` endpoints) because the event stream only delivers deltas — missed events during the disconnect window are lost.

ESPHome's `web_server` uses Server-Sent Events (SSE) at `/events`, not a bidirectional WebSocket. Use the browser's `EventSource` API, which has built-in reconnection behavior. If you use the native ESPHome API (port 6053), that is a bidirectional binary protocol requiring a client library — much more complex.

**Warning signs:**
- UI shows correct states when first loaded but drifts after 10–30 minutes.
- Toggling a switch in the UI appears to succeed but the displayed state does not update.
- Pin states shown differ from actual device state after a device reboot.

**Phase to address:** Frontend real-time state phase. Build reconnection and state-resync into the first version of the event stream handler, not as a later enhancement.

---

### Pitfall 5: Mixing Input and Output Direction on the Same Pin in YAML

**What goes wrong:**
If the same GPIO number appears in both a `switch` (output) and a `binary_sensor` (input) block, ESPHome may compile without error but the runtime behavior is undefined — the output driver and input comparator fight over the same physical pad. On the ESP32-C3, a pin configured as output that is simultaneously read as input will just reflect the output state, making the sensor useless, or in some pull/drive configurations can cause current spikes.

**Why it happens:**
In a "control all pins" tool, the developer might add every pin as both a switch and a binary sensor to make the UI show bidirectional state. This seems logical but is wrong — a pin is either an output or an input at a given time, not both.

**How to avoid:**
In YAML, pick a direction per pin. For a development/debugging tool, use ESPHome's `output` + `binary_sensor` with explicit `mode: OUTPUT` or `mode: INPUT` (or `INPUT_PULLUP`). Never include the same GPIO number in both a `gpio.switch` and a `gpio.binary_sensor` block simultaneously. If you need to read the state of an output pin, read the switch entity's state via the API — ESPHome tracks it in software.

**Warning signs:**
- A pin shows as HIGH in the binary sensor even when the switch is toggled to OFF.
- The device behaves correctly in isolation but adding more pins causes odd readings on previously working pins.
- ESPHome log shows pin mode conflicts at boot.

**Phase to address:** ESPHome YAML configuration phase. Define the pin direction policy before writing any YAML entities.

---

### Pitfall 6: ESPHome Native API and web_server Port 80 Conflict Under Load

**What goes wrong:**
ESPHome's `web_server` (HTTP/WebSocket on port 80) and the native API (port 6053, used by Home Assistant) both consume RAM and CPU cycles on the ESP32-C3. The ESP32-C3 has 400KB SRAM. Under concurrent load — a browser holding a WebSocket/SSE connection, HA polling the native API, and an OTA update in progress — the device can run out of socket buffers and crash with a `task stack overflow` or similar watchdog reset.

**Why it happens:**
Developers enable all three features (native API, web_server, OTA) without considering the cumulative memory and task overhead on a resource-constrained chip. Each feature adds RTOS tasks and TCP socket buffers.

**How to avoid:**
Enable only what you need simultaneously. For this project, native API (for HA) + web_server (for custom UI) is the minimum required. Disable `web_server` logging verbosity, set `web_server: local: true` if available, and keep the YAML entity count lean (22 entities maximum, one per pin). Test with HA connected and the browser open simultaneously — that is the real concurrent load scenario.

**Warning signs:**
- Device reboots when both a browser is open and HA is connected.
- `esphome logs` shows `[W][component:157]: Component ... took a long time for an operation`.
- OTA updates fail when a browser tab is open.

**Phase to address:** ESPHome YAML configuration phase and integration testing phase.

---

### Pitfall 7: ESPHome web_server v1 vs v2 vs v3 API Endpoint Differences

**What goes wrong:**
ESPHome's `web_server` component has three major versions with different REST API URL structures and event formats. Code written against v1 endpoints (`/switch/<id>/turn_on`) breaks on v2/v3, and vice versa. The version is set by `web_server: version: 2` (or 3) in YAML. If not set, the default changes between ESPHome releases, silently breaking a frontend built against an assumed version.

**Why it happens:**
Documentation examples and community code snippets do not always specify which version they target. Developers copy an API call pattern without checking which `web_server` version the YAML configures.

**How to avoid:**
Explicitly pin `version: 3` (current as of ESPHome 2024.x) in your YAML `web_server:` config. Verify the actual REST endpoints by opening the device's built-in UI and inspecting network requests in browser DevTools. Build the frontend against documented v3 endpoints and test after every ESPHome upgrade.

**Warning signs:**
- REST API calls return 404 after an ESPHome upgrade.
- The built-in ESPHome UI works but custom frontend calls fail.
- Event stream messages have a different JSON structure than expected.

**Phase to address:** ESPHome YAML configuration phase. Set `version: 3` explicitly before building the frontend.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcode device IP in frontend | Simple, no discovery needed | Breaks when IP changes (DHCP); brittle | Only acceptable if device has a DHCP reservation or mDNS fallback is added |
| Poll REST API instead of SSE | Simpler frontend code | 100ms+ latency, hammers ESP32 CPU, can cause watchdog resets | Never — use SSE/EventSource from the start |
| Include all 22 pins in YAML without testing each | Fast to configure | Reserved pins cause boot failures or undefined behavior | Never — validate the safe pin list first |
| Skip reconnection logic | Faster initial build | UI shows stale state after any WiFi hiccup | Never for a debugging tool — stale state is actively misleading |
| Use `web_server` without explicit version pin | One less line of YAML | Silent breakage after ESPHome upgrade | Never — one line of YAML prevents a confusing debugging session |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| ESPHome REST API from browser | Calling from a different origin triggers CORS block | Serve frontend from the device or use the `cors` option in `web_server` (verify availability in current ESPHome version) |
| ESPHome native API (HA) | Assuming it shares port 80 with web_server | Native API runs on port 6053 (binary Protobuf protocol); do not attempt to call it from browser JS |
| ESPHome SSE event stream | Using `WebSocket` API instead of `EventSource` | ESPHome `web_server` event stream is SSE (`/events`), not WebSocket; `EventSource` handles reconnection automatically |
| Home Assistant + custom frontend simultaneously | HA floods native API while browser holds SSE open | Test concurrent load; set `reboot_timeout: 0s` in native API config to prevent forced reboots |
| OTA updates | Triggering OTA while browser is streaming events | OTA closes all connections; frontend must handle the disconnect/reconnect cycle gracefully |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Polling `/switch/` and `/binary_sensor/` endpoints on a timer | Device CPU spikes, response times degrade, watchdog resets | Use SSE (`EventSource` on `/events`) instead | Breaks with 2+ concurrent browser tabs or polling interval under 500ms |
| Creating one HTTP request per pin toggle | Rapid toggle sequences queue up and overwhelm the ESP32 TCP stack | Debounce toggle requests; queue and deduplicate rapid clicks | Breaks when user clicks faster than ~200ms per toggle |
| Large YAML entity count with verbose logging | Boot time increases, heap shrinks, OTA fails | Use `logger: level: WARN` in production YAML; disable unused components | Becomes critical above ~30 total entities |
| Browser keeping SSE connection open indefinitely without heartbeat handling | Connection drops silently after router NAT timeout (typically 60–300s of inactivity) | Send a keep-alive ping from ESPHome or implement frontend reconnect-on-silence timeout | Breaks silently when no GPIO state changes for several minutes |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing the device on a public or flat network | Any network device can toggle GPIO pins | Restrict to VLAN or trusted LAN segment; note that auth is explicitly out of scope for v1 |
| Serving frontend from an external CDN with device credentials embedded | CDN logs or leak device IP and endpoint structure | Keep frontend self-hosted; no credentials needed for local network use case |
| Enabling `web_server` without `local: true` on a shared network | ESPHome may expose additional endpoints | Set `local: true` in `web_server` config to disable remote ESPHome cloud dashboard proxy features |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visual distinction between output pins and input pins | User tries to "toggle" an input pin and nothing happens; no feedback | Label each pin row with its direction (IN/OUT); disable toggle controls on input pins |
| Toggle button shows optimistic state before device confirms | Button flips immediately but device is still processing; rapid clicks cause state confusion | Show a loading/pending state on the button until the SSE event confirms the new state |
| No indicator when SSE connection is lost | User believes stale state is current; makes wrong debugging decisions | Show a prominent "Disconnected" banner when `EventSource` is in reconnecting state |
| Showing all 22 potential GPIO numbers including reserved ones | User tries to interact with reserved pins and gets undefined behavior | Only expose the validated safe pin list in the UI; hide or grey-out reserved pins with a tooltip explanation |
| No indication of pin electrical state vs. ESPHome logical state | Inverted pin logic (`inverted: true` in YAML) makes the UI show the opposite of the voltage level | Display both the ESPHome logical state and note if the pin is configured as inverted |

---

## "Looks Done But Isn't" Checklist

- [ ] **Pin list:** YAML includes only tested, safe GPIO pins — verify that GPIO 2, 8, 9 (strapping), GPIO 18, 19 (USB/JTAG) are intentionally excluded or documented as restricted.
- [ ] **CORS:** Custom frontend loads without CORS errors in the browser console — verify with DevTools Network tab open, not just curl.
- [ ] **SSE reconnection:** Pull the ESP32-C3 power and restore it — verify the frontend detects the drop, shows a disconnected state, reconnects, and re-syncs all pin states within ~10 seconds.
- [ ] **Concurrent load:** Open the frontend in two browser tabs and have HA connected simultaneously — verify no watchdog resets over a 5-minute period.
- [ ] **web_server version:** YAML explicitly sets `web_server: version: 3` — verify it is not relying on the default, which can change with ESPHome upgrades.
- [ ] **Pin direction conflicts:** No GPIO number appears in both a `switch`/`output` block and a `binary_sensor`/`input` block in the same YAML.
- [ ] **State after OTA:** After an OTA update, the frontend reconnects and displays correct pin states — verify OTA does not leave the web_server in a broken state.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Bricked device from strapping/USB pin misconfiguration | MEDIUM | Hold GPIO 9 LOW while applying power to force download mode; re-flash via USB with corrected YAML |
| CORS blocks all frontend API calls | LOW | Add `cors: true` to `web_server` in YAML and re-flash; or switch to serving frontend from the device |
| Stale UI from missing SSE reconnect | LOW | Add `EventSource` with reconnect logic and state resync on open; no hardware changes needed |
| Device reboots under concurrent load | MEDIUM | Reduce concurrent components; set `logger: level: WARN`; test with HA disconnected to isolate cause |
| web_server API version mismatch after ESPHome upgrade | LOW | Pin `version: 3` in YAML; update frontend endpoint URLs to match documented v3 structure |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Strapping pins (GPIO 2, 8, 9) misuse | Phase 1: ESPHome YAML config | Power-cycle device with all pins configured; confirm clean boot every time |
| USB/JTAG pins (GPIO 18, 19) misuse | Phase 1: ESPHome YAML config | Confirm USB programming still works after full YAML is flashed |
| Pin direction conflicts (same pin as input + output) | Phase 1: ESPHome YAML config | YAML review checklist — grep for duplicate GPIO numbers across entity types |
| CORS blocking custom frontend | Phase 2: Frontend integration | Load frontend in browser with DevTools; zero CORS errors in Network tab |
| web_server version not pinned | Phase 1: ESPHome YAML config | YAML review — `version: 3` is explicit, not defaulted |
| SSE disconnection / stale state | Phase 2: Frontend real-time state | Simulate connection loss; verify reconnection and state resync within 10s |
| Concurrent load causing watchdog resets | Phase 3: Integration testing | Run HA + browser + OTA simultaneously; monitor for 10 minutes |
| No disconnection indicator in UI | Phase 2: Frontend UX | Disable power on device; verify visible "Disconnected" state within 3s |

---

## Sources

- ESP32-C3 Technical Reference Manual (Espressif) — GPIO strapping pins section; USB Serial/JTAG peripheral section. Confidence: HIGH (stable hardware documentation).
- ESPHome `web_server` component documentation — v1/v2/v3 API structure, CORS option, SSE event stream. Confidence: MEDIUM (verify against current ESPHome version; actively updated).
- ESPHome native API documentation — port 6053, Protobuf protocol, not browser-accessible. Confidence: HIGH (fundamental protocol fact, stable).
- ESPHome community forums and GitHub issues — recurring reports of strapping pin boot failures, CORS issues with custom frontends, SSE reconnection omissions. Confidence: MEDIUM (community patterns, well-established by 2025).
- ESP32-C3 datasheet, Table 2-1 (GPIO matrix and strapping pin table). Confidence: HIGH (hardware spec, immutable).

**Note:** External web tools were unavailable during this research session. All findings are based on training data through August 2025 covering ESPHome up to v2024.x and ESP32-C3 hardware documentation. Verify CORS option availability and `web_server` version defaults against the current ESPHome changelog before implementation.

---
*Pitfalls research for: ESPHome ESP32-C3 GPIO web controller*
*Researched: 2026-03-15*

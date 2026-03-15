---
phase: 1
slug: firmware-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-15
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual (ESPHome firmware — no unit test framework applicable) |
| **Config file** | none |
| **Quick run command** | `esphome logs config.yaml` |
| **Full suite command** | See Manual-Only Verifications table |
| **Estimated runtime** | ~5 minutes (flash + boot + verify) |

---

## Sampling Rate

- **After every task commit:** Run `esphome config config.yaml` (YAML validation)
- **After every plan wave:** Flash device and verify API surface
- **Before `/gsd:verify-work`:** All manual verification steps must be green
- **Max feedback latency:** ~120 seconds (flash cycle)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | FIRM-01 | manual | `esphome config config.yaml` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | FIRM-02 | manual | `curl http://{device-ip}/` | ❌ W0 | ⬜ pending |
| 1-01-03 | 01 | 2 | FIRM-03 | manual | `nc -zv {device-ip} 6053` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `config.yaml` — ESPHome config file (created in Wave 1)
- [ ] `secrets.yaml` — WiFi credentials (created in Wave 1)

*Existing infrastructure covers all phase requirements once config.yaml exists.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ESP32-C3 boots and connects to WiFi | FIRM-01 | Hardware flash required | Check ESPHome logs for "Connected to WiFi" |
| SSE stream at /events emits state events | FIRM-02 | Requires running device | Open DevTools Network tab → filter `/events` → confirm event stream |
| REST POST toggles output pin | FIRM-02 | Requires running device | `curl -X POST http://{ip}/switch/{id}/toggle` → check GPIO with multimeter |
| native_api reachable on port 6053 | FIRM-03 | Requires HA instance | Add ESPHome integration in HA → device should auto-discover |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

---
phase: 3
slug: frontend-write-path
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual (browser + ESPHome device — no unit test framework) |
| **Config file** | none |
| **Quick run command** | Open http://10.1.1.162, click a toggle button |
| **Full suite command** | See Manual-Only Verifications table |
| **Estimated runtime** | ~15 minutes (toggle test + 10min concurrent load) |

---

## Sampling Rate

- **After every task commit:** Reload http://10.1.1.162, confirm toggle buttons appear on OUTPUT pins only
- **After every plan wave:** Run full manual verification suite
- **Before `/gsd:verify-work`:** Concurrent load test must complete (10 min)
- **Max feedback latency:** ~30 seconds (OTA reflash + browser reload)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 03-01 | 1 | WRITE-01 | manual | `grep -c "togglePin" D:/_vibecoding/_claude/esp32-gpio-controller/gpio-ui.js` | ❌ W0 | ⬜ pending |
| 3-01-02 | 03-01 | 1 | WRITE-01 | manual | `grep -c "showToggleError" D:/_vibecoding/_claude/esp32-gpio-controller/gpio-ui.js` | ❌ W0 | ⬜ pending |
| 3-02-01 | 03-02 | 2 | WRITE-01 | manual | User: click toggle, watch GPIO change | N/A — manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `gpio-ui.js` — already exists (Phase 2); toggle function will be added in Wave 1

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Toggle button appears on OUTPUT pins only | WRITE-01 | Requires browser render | Navigate to http://10.1.1.162 — 9 OUTPUT cards have button, 2 INPUT cards do not |
| Toggle changes GPIO state | WRITE-01 | Requires hardware | Click toggle on GPIO 3 — LED/multimeter confirms pin state flips |
| Failed POST shows error | WRITE-01 | Requires device off | Unplug device, click toggle — error indicator appears |
| Device stable under concurrent load | WRITE-01 | Requires 10min runtime | Browser SSE open + HA native_api connected — no watchdog resets in ESPHome logs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

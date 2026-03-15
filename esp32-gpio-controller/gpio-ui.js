// gpio-ui.js — ESP32-C3 GPIO Controller frontend
// No framework, no build step, no dependencies.
// Covers READ-01 through READ-05.

const DEVICE_HOST = (location.hostname === 'localhost' || location.hostname === '')
  ? '10.1.1.162'   // dev: served from local server, calls device cross-origin
  : location.host; // prod: served from device, same-origin
const API_BASE = 'http://' + DEVICE_HOST;

const pins = new Map(); // name_id -> {name, domain, state, value}
let initialBurstDone = false;
let burstFallbackTimer = null;
let es = null;

// READ-04: show connection state — never silently stale
function setStatus(status) {
  const banner = document.getElementById('status-banner');
  banner.className = 'status-banner ' + status;
  const labels = {
    connected: '',
    reconnecting: 'Reconnecting...',
    disconnected: 'Disconnected — retrying...'
  };
  banner.textContent = labels[status];
}

// READ-01, READ-02, READ-03: build a single pin card element
function buildCard(nameId, pin) {
  const card = document.createElement('div');
  card.className = 'pin-card';
  card.dataset.nameId = nameId;
  const high = pin.value === true;
  card.innerHTML =
    '<div class="pin-name">' + pin.name + '</div>' +
    '<div class="pin-type ' + pin.domain + '">' +
      (pin.domain === 'switch' ? 'OUTPUT' : 'INPUT') +
    '</div>' +
    '<div class="pin-state ' + (high ? 'high' : 'low') + '">' +
      (high ? 'HIGH' : 'LOW') +
    '</div>';
  return card;
}

// Full grid render — called once after initial burst, and as fallback
function renderGrid() {
  const grid = document.getElementById('pin-grid');
  grid.innerHTML = '';
  for (const entry of pins) {
    grid.appendChild(buildCard(entry[0], entry[1]));
  }
}

// Live update — replace a single card without full re-render
function upsertPin(nameId, pin) {
  pins.set(nameId, pin);
  if (!initialBurstDone) return; // buffering during initial burst
  const existing = document.querySelector('[data-name-id="' + nameId + '"]');
  if (existing) {
    existing.replaceWith(buildCard(nameId, pin));
  } else {
    renderGrid(); // new entity appeared — rebuild
  }
}

// Trigger initial render — called by ping listener or 500ms fallback
function finishInitialBurst() {
  if (initialBurstDone) return;
  if (burstFallbackTimer) { clearTimeout(burstFallbackTimer); burstFallbackTimer = null; }
  initialBurstDone = true;
  renderGrid();
}

// READ-05: SSE connect with reconnect on CLOSED state
function connect() {
  if (es) { es.close(); es = null; }
  initialBurstDone = false;
  setStatus('reconnecting');

  es = new EventSource(API_BASE + '/events');

  // READ-01, READ-02, READ-03: receive entity state
  es.addEventListener('state', function(e) {
    var d = JSON.parse(e.data);
    var prev = pins.get(d.name_id) || {};
    upsertPin(d.name_id, { name: d.name || prev.name, domain: d.domain || prev.domain, state: d.state, value: d.value });
    // Fallback: if ping hasn't fired 500ms after first state event, render anyway
    if (!initialBurstDone && !burstFallbackTimer) {
      burstFallbackTimer = setTimeout(finishInitialBurst, 500);
    }
  });

  // Ping signals end of initial state burst — render the full grid once
  es.addEventListener('ping', function() {
    finishInitialBurst();
  });

  // READ-04: connected — hide banner
  es.onopen = function() {
    setStatus('connected');
  };

  // READ-04 + READ-05: error handling
  // CONNECTING (0): browser is auto-reconnecting — show banner, wait
  // CLOSED (2): browser gave up — show banner, manually reconnect after 3s
  es.onerror = function() {
    if (es.readyState === EventSource.CLOSED) {
      setStatus('disconnected');
      setTimeout(connect, 3000);
    } else {
      setStatus('reconnecting');
    }
  };
}

document.addEventListener('DOMContentLoaded', connect);

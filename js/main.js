import { initThree, toggleCleanView } from './scene.js';
import {
  simulateLeak,
  toggleNightMode,
  runDiagnostic,
  isolateSector,
  restoreSector,
  setValve,
  getValves,
  getLeakState,
} from './leaks.js';
import {
  goToView,
  queueViews,
  takeScreenshot,
  listViews,
} from './controls.js';

// ─── Estado global de la UI ───────────────────────────────────────────────────
let _threeReady    = false;
let _nightMode     = false;
let _logEntries    = [];
let _sessionStart  = Date.now();
let _uptimeTimer   = null;

// ─── Arranque ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ── Desbloqueo de audio ───────────────────────────────────────────────────
  // Algunos navegadores (Safari, Brave con shields estrictos) requieren que
  // el audio se "toque" dentro del primer gesto del usuario en la página,
  // incluso si la reproducción real ocurre más tarde en otro clic.
  let _audioUnlocked = false;
  function _unlockAudio() {
    if (_audioUnlocked) return;
    _audioUnlocked = true;
    const el = document.getElementById('sonido-alerta');
    if (el) {
      el.muted = true;
      el.play().then(() => {
        el.pause();
        el.currentTime = 0;
        el.muted = false;
      }).catch(() => { el.muted = false; });
    }
    document.removeEventListener('click', _unlockAudio);
  }
  document.addEventListener('click', _unlockAudio, { once: true });

  // ── Pestañas principales ──────────────────────────────────────────────────
  const tabs     = document.querySelectorAll('.nav-tab');
  const sections = document.querySelectorAll('.section');

  tabs.forEach(tab => {
    tab.addEventListener('click', function () {
      tabs.forEach(t => t.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      this.classList.add('active');

      const targetId = this.id === 'tab-comic' ? 'section-comic' : 'section-3d';
      document.getElementById(targetId).classList.add('active');

      const netStatusEl = document.getElementById('netStatus');
      if (netStatusEl) netStatusEl.style.opacity = targetId === 'section-comic' ? '1' : '0';

      if (targetId === 'section-3d' && !_threeReady) {
        _threeReady = true;
        setTimeout(initThree, 100);
      }
    });
  });

  // ── Scroll-reveal de la sección Problemática ──────────────────────────────
  // Cada bloque marcado con [data-reveal] aparece con fade+slide la primera
  // vez que entra en pantalla; no se repite al volver a scrollear.
  const revealTargets = document.querySelectorAll('[data-reveal]');
  if (revealTargets.length && 'IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealTargets.forEach(el => revealObserver.observe(el));
  } else {
    // Sin soporte de IntersectionObserver: mostrar todo de inmediato.
    revealTargets.forEach(el => el.classList.add('is-visible'));
  }

  // ── Indicador de estado de red — reacciona al scroll dentro de Problemática
  const netStatus = document.getElementById('netStatus');
  const comicSection = document.getElementById('section-comic');
  if (netStatus && comicSection) {
    const statusText = netStatus.querySelector('.net-status-text');
    const updateNetStatus = () => {
      const scrollable = comicSection.scrollHeight - comicSection.clientHeight;
      const progress = scrollable > 0 ? comicSection.scrollTop / scrollable : 0;
      netStatus.classList.remove('is-warn', 'is-ok');
      if (progress > 0.75) {
        netStatus.classList.add('is-ok');
        if (statusText) statusText.textContent = 'Corte automático activo';
      } else if (progress > 0.35) {
        netStatus.classList.add('is-warn');
        if (statusText) statusText.textContent = 'Anomalía detectada';
      } else if (statusText) {
        statusText.textContent = 'Red sin monitorear';
      }
    };
    comicSection.addEventListener('scroll', updateNetStatus, { passive: true });
    updateNetStatus();
  }

  // ── Botones de cámara ─────────────────────────────────────────────────────
  // Vistas nombradas del catálogo en controls.js
  const camButtons = {
    'btn-general':   'general',
    'btn-plant':     'plant',
    'btn-network':   'network',
    'btn-collector': 'collector',
    'btn-north':     'north',
    'btn-south':     'south',
    'btn-mainhouse': 'mainhouse',
    'btn-top':       'top',
  };

  Object.entries(camButtons).forEach(([id, view]) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => goToView(view));
  });

  // ── Botón de fuga ─────────────────────────────────────────────────────────
  const btnFuga = document.getElementById('btn-fuga');
  if (btnFuga) btnFuga.addEventListener('click', () => simulateLeak());

  // ── Modo nocturno ─────────────────────────────────────────────────────────
  const btnNight = document.getElementById('btn-daynight');
  if (btnNight) {
    btnNight.addEventListener('click', () => {
      _nightMode = toggleNightMode();
      btnNight.classList.toggle('active', _nightMode);
      btnNight.title = _nightMode ? 'Desactivar modo nocturno' : 'Activar modo nocturno';
      _addLog('info', _nightMode
        ? 'Modo nocturno activado — monitoreo de consumo nocturno'
        : 'Modo nocturno desactivado');
    });
  }

  // ── Diagnóstico ───────────────────────────────────────────────────────────
  const btnDiag = document.getElementById('btn-xray');
  if (btnDiag) {
    btnDiag.addEventListener('click', () => {
      _addLog('info', 'Iniciando diagnóstico de red…');
      runDiagnostic((step) => {
        _addLog(step.type === 'ok' ? 'ok' : 'info', step.msg);
      });
    });
  }

  // ── Vista limpia (oculta la UI para capturas) ─────────────────────────────
  const btnClean = document.getElementById('btn-clean');
  if (btnClean) {
    btnClean.addEventListener('click', () => {
      const clean = toggleCleanView();
      btnClean.classList.toggle('active', clean);
      _addLog('info', clean ? 'Vista limpia activada' : 'Vista limpia desactivada');
    });
  }

  // ── Cinematic tour ────────────────────────────────────────────────────────
  const btnTour = document.getElementById('btn-tour');
  if (btnTour) {
    btnTour.addEventListener('click', () => {
      queueViews(['general', 'plant', 'network', 'north', 'south', 'collector', 'general'], 1800);
      _addLog('info', 'Tour cinematográfico iniciado');
    });
  }

  // ── Screenshot ────────────────────────────────────────────────────────────
  const btnShot = document.getElementById('btn-screenshot');
  if (btnShot) {
    btnShot.addEventListener('click', () => {
      takeScreenshot('playa-la-virgen-' + Date.now() + '.png');
      _addLog('info', 'Captura de pantalla guardada');
    });
  }

  // ── Subpanel de válvulas (si existe en el HTML) ───────────────────────────
  _buildValvePanel();

  // ── Panel SCADA lateral (si existe) ──────────────────────────────────────
  _buildSensorPanel();

  // ── Log del sistema ───────────────────────────────────────────────────────
  _buildLogPanel();

  // ── Escuchar eventos de leaks.js ──────────────────────────────────────────
  window.addEventListener('leaks:log',          e => _addLog(e.detail.type, e.detail.msg));
  window.addEventListener('leaks:sensorUpdate', e => _refreshSensorPanel(e.detail.sensors));
  window.addEventListener('leaks:valveChange',  e => _refreshValvePanel());
  window.addEventListener('leaks:nightMode',    e => {
    _nightMode = e.detail.active;
  });

  // ── Reloj de uptime de sesión ─────────────────────────────────────────────
  _startUptimeClock();

  // ── Log de arranque ───────────────────────────────────────────────────────
  _addLog('info', 'Sistema SCADA iniciado correctamente');
  _addLog('info', 'Red HDPE conectada — 9 sensores activos');
  _addLog('info', 'Planta desaladora operacional — 35 m³/día disponibles');
});

// ─── Panel de válvulas ────────────────────────────────────────────────────────
function _buildValvePanel() {
  const container = document.getElementById('valve-panel');
  if (!container) return;
  _refreshValvePanel();
}

function _refreshValvePanel() {
  const container = document.getElementById('valve-panel');
  if (!container) return;

  const valves = getValves();
  container.innerHTML = Object.entries(valves).map(([id, v]) => `
    <div class="valve-row">
      <span class="valve-dot ${v.open ? 'open' : 'closed'}"></span>
      <span class="valve-name">${v.name}</span>
      <span class="valve-sector">Sector ${v.sector}</span>
      <button class="valve-btn" data-id="${id}" data-open="${v.open}">
        ${v.open ? 'Cerrar' : 'Abrir'}
      </button>
    </div>
  `).join('');

  container.querySelectorAll('.valve-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id   = btn.dataset.id;
      const open = btn.dataset.open === 'true';
      setValve(id, !open);
      _refreshValvePanel();
    });
  });
}

// ─── Panel de sensores ────────────────────────────────────────────────────────
function _buildSensorPanel() {
  const container = document.getElementById('sensor-panel');
  if (!container) return;

  const state = getLeakState();
  _refreshSensorPanel(state.sensors);
}

function _refreshSensorPanel(sensors) {
  const container = document.getElementById('sensor-panel');
  if (!container || !sensors) return;

  container.innerHTML = sensors.map(s => {
    const pct     = Math.min(100, Math.round((s.pressure / 6) * 100));
    const status  = s.pressure > 4  ? 'ok' :
                    s.pressure > 3.2 ? 'warn' : 'crit';
    return `
      <div class="sensor-row sensor-${status}">
        <span class="sensor-id">${s.id}</span>
        <span class="sensor-label">${s.label}</span>
        <span class="sensor-pressure">${s.pressure.toFixed(2)} bar</span>
        <div class="sensor-bar">
          <div class="sensor-bar-fill sensor-bar-${status}" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

// ─── Log del sistema ──────────────────────────────────────────────────────────
function _buildLogPanel() {
  const container = document.getElementById('log-panel');
  if (!container) return;
  _refreshLogPanel();
}

function _addLog(type, msg) {
  const ts = new Date().toLocaleTimeString('es-CL', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  _logEntries.unshift({ type, msg, ts });
  if (_logEntries.length > 50) _logEntries = _logEntries.slice(0, 50);
  _refreshLogPanel();
  _updateEventCounter();
}

function _refreshLogPanel() {
  const container = document.getElementById('log-panel');
  if (!container) return;

  container.innerHTML = _logEntries.map(e => {
    const icon = e.type === 'ok'   ? '✓' :
                 e.type === 'warn' ? '⚑' :
                 e.type === 'crit' ? '⚠' : 'ℹ';
    return `
      <div class="log-entry log-${e.type || 'info'}">
        <span class="log-ts">${e.ts}</span>
        <span class="log-icon">${icon}</span>
        <span class="log-msg">${e.msg}</span>
      </div>
    `;
  }).join('');
}

function _updateEventCounter() {
  const el = document.getElementById('event-count');
  if (el) el.textContent = _logEntries.length;
}

// ─── Reloj de uptime ──────────────────────────────────────────────────────────
function _startUptimeClock() {
  const el = document.getElementById('session-uptime');
  if (!el) return;

  _uptimeTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - _sessionStart) / 1000);
    const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    el.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

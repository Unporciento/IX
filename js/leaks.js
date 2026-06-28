import * as THREE from 'three';
import { goToView, focusNode } from './controls.js';
import * as L from './layout.js';

// ─── Constantes ───────────────────────────────────────────────────────────────
const NOMINAL_PRESSURE   = 4.5;   // bar — presión nominal de la red HDPE
const NIGHT_THRESHOLD    = 1.2;   // L/s — caudal nocturno máximo aceptable
const ALERT_PRESSURE_LOW = 3.2;   // bar — umbral bajo → alerta amarilla
const ALERT_PRESSURE_CRIT= 2.5;   // bar — umbral crítico → alerta roja

// ─── Estado del módulo ────────────────────────────────────────────────────────
let _scene = null;

// Objetos 3D de la fuga activa
let _leakMarker  = null;
let _puddle      = null;
let _rippleRing  = null;
let _sensorGroup = null; // grupo de marcadores de sensores siempre visibles

// Estado de simulación
let _isLeakActive   = false;
let _baseLeakSize   = 1;
let _activeLeakPos  = null;
let _activeLeakType = null;
let _activeLeakSector = null;
let _leakStartTime  = null;
let _totalLeaks     = 0;
let _leakHistory    = [];

// Temporizadores
let _alertTimeout      = null;
let _autoResolveTimer  = null;
let _timerInterval     = null;

// Modo nocturno
let _nightModeActive = false;

// Estado de válvulas (cámaras de paso)
const _valves = {
  V01: { name: 'Planta → Colector',  open: true,  sector: 'A' },
  V02: { name: 'Colector → Norte',   open: true,  sector: 'B' },
  V03: { name: 'Colector → Sur',     open: true,  sector: 'C' },
  V04: { name: 'Casa principal',     open: true,  sector: 'D' },
  V05: { name: 'Estanque → Red',     open: true,  sector: 'D' },
};

// Sensores: posiciones reales sobre la red de tuberías (layout lateral)
const _sensors = [
  { id: 'S01', label: 'Colector central',  pos: new THREE.Vector3(L.COLLECTOR_X, 0.3, 0),                          pressure: 4.1, sector: 'A' },
  { id: 'S02', label: 'Entrada planta',     pos: new THREE.Vector3(L.PLANTA_DESAL.x + 3.6, 0.3, L.PLANTA_DESAL.z),  pressure: 6.0, sector: 'A' },
  { id: 'S03', label: 'Estanque mont.',     pos: new THREE.Vector3(L.ESTANQUE.x, 0.3, L.ESTANQUE.z),                pressure: 4.8, sector: 'D' },
  { id: 'S04', label: 'Ramal norte oeste',  pos: new THREE.Vector3(-5.15, 0.3, L.HOUSE_ROWS_Z[0]),                  pressure: 4.0, sector: 'B' },
  { id: 'S05', label: 'Ramal norte este',   pos: new THREE.Vector3( 5.15, 0.3, L.HOUSE_ROWS_Z[1]),                  pressure: 3.9, sector: 'B' },
  { id: 'S06', label: 'Ramal sur oeste',    pos: new THREE.Vector3(-5.15, 0.3, L.HOUSE_ROWS_Z[4]),                  pressure: 3.8, sector: 'C' },
  { id: 'S07', label: 'Ramal sur este',     pos: new THREE.Vector3( 5.15, 0.3, L.HOUSE_ROWS_Z[5]),                  pressure: 3.7, sector: 'C' },
  { id: 'S08', label: 'Casa ppal.',         pos: new THREE.Vector3(5.15, 0.3, L.CASA_PRINCIPAL.z),                  pressure: 4.2, sector: 'D' },
  { id: 'S09', label: 'Sala de máquinas',   pos: new THREE.Vector3(5.15, 0.3, L.SALA_MAQUINAS.z),                   pressure: 4.1, sector: 'A' },
];

// Puntos de fuga posibles — sobre la red de tuberías real (layout lateral).
// Cada fila de casitas aporta 2 nodos (ramal oeste y este); se reparten en
// sectores B (norte) y C (sur) según la mitad de la lista de filas.
const _pipePoints = [];
{
  const houseStopX = 3.4 / 2 + 0.15;
  const westStop = L.HOUSE_SIDE_X.west + houseStopX;
  const eastStop = L.HOUSE_SIDE_X.east - houseStopX;
  const half = Math.ceil(L.HOUSE_ROWS_Z.length / 2);

  _pipePoints.push({ pos: new THREE.Vector3(L.COLLECTOR_X, 0.28, L.HOUSE_ROWS_Z[0]), label: 'Colector — extremo norte', sector: 'A' });
  _pipePoints.push({ pos: new THREE.Vector3(L.COLLECTOR_X, 0.28, 0), label: 'Colector central', sector: 'A' });
  _pipePoints.push({ pos: new THREE.Vector3(L.COLLECTOR_X, 0.28, L.HOUSE_ROWS_Z[L.HOUSE_ROWS_Z.length - 1]), label: 'Colector — extremo sur', sector: 'A' });

  L.HOUSE_ROWS_Z.forEach((z, i) => {
    const sector = i < half ? 'B' : 'C';
    _pipePoints.push({ pos: new THREE.Vector3(westStop, 0.28, z), label: `Ramal cabaña oeste — fila ${i + 1}`, sector });
    _pipePoints.push({ pos: new THREE.Vector3(eastStop, 0.28, z), label: `Ramal cabaña este — fila ${i + 1}`, sector });
  });

  _pipePoints.push({ pos: new THREE.Vector3(eastStop, 0.28, L.CASA_PRINCIPAL.z), label: 'Acometida casa principal', sector: 'D' });
  _pipePoints.push({ pos: new THREE.Vector3(eastStop, 0.28, L.SALA_MAQUINAS.z), label: 'Acometida sala de máquinas', sector: 'D' });
}

// Tipos de fuga con severidad diferenciada
const LEAK_TYPES = [
  {
    label:     'Goteo leve',
    size:       0.45,
    color:      0xffaa00,
    resolveMs:  18000,
    severity:  'warn',
    pressureDrop: 0.4,   // bar de caída en los sensores del sector
    description: 'Posible termofusión defectuosa o junta envejecida.',
  },
  {
    label:     'Fisura media',
    size:       0.9,
    color:      0xff5500,
    resolveMs:  12000,
    severity:  'warn',
    pressureDrop: 0.9,
    description: 'Tramo antiguo sin ficha de renovación — recambio prioritario.',
  },
  {
    label:     'Rotura crítica',
    size:       1.5,
    color:      0xff1111,
    resolveMs:   7000,
    severity:  'crit',
    pressureDrop: 1.8,
    description: '¡Corte de servicio inminente! Aislar sector y accionar válvula.',
  },
];

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initLeaks(scene) {
  _scene = scene;

  // Marcador de fuga (esfera pulsante)
  _leakMarker = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.85 })
  );
  _leakMarker.visible = false;
  scene.add(_leakMarker);

  // Charco en el suelo
  _puddle = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 3),
    new THREE.MeshBasicMaterial({ color: 0x225577, transparent: true, opacity: 0.55 })
  );
  _puddle.rotation.x = -Math.PI / 2;
  _puddle.visible = false;
  scene.add(_puddle);

  // Onda expansiva
  _rippleRing = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1.1, 32),
    new THREE.MeshBasicMaterial({ color: 0x4499bb, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
  );
  _rippleRing.rotation.x = -Math.PI / 2;
  _rippleRing.visible = false;
  scene.add(_rippleRing);

  // Marcadores permanentes de sensores
  _buildSensorMarkers(scene);

  // UI dinámica
  _injectUI();
}

// ─── Simular / detener fuga ───────────────────────────────────────────────────
export function simulateLeak(leakTypeIndex = null, pipePointIndex = null) {
  _isLeakActive = !_isLeakActive;

  if (_isLeakActive) {
    const ptIdx   = pipePointIndex ?? Math.floor(Math.random() * _pipePoints.length);
    const typeIdx = leakTypeIndex  ?? Math.floor(Math.random() * LEAK_TYPES.length);

    const point = _pipePoints[ptIdx];
    const type  = LEAK_TYPES[typeIdx];

    _activeLeakPos  = point.pos;
    _activeLeakType = type;
    _activeLeakSector = point.sector;
    _baseLeakSize   = type.size;
    _leakStartTime  = performance.now();
    _totalLeaks++;

    // Posicionar objetos 3D
    _leakMarker.material.color.setHex(type.color);
    _leakMarker.scale.setScalar(_baseLeakSize);
    _puddle.scale.setScalar(0.05);
    _rippleRing.scale.setScalar(0.1);

    _leakMarker.position.copy(point.pos).add(new THREE.Vector3(0, 0.3, 0));
    _puddle.position.copy(point.pos).add(new THREE.Vector3(0, -0.25, 0));
    _rippleRing.position.copy(point.pos).add(new THREE.Vector3(0, -0.24, 0));

    _leakMarker.visible = true;
    _puddle.visible     = true;
    _rippleRing.visible = true;

    // Degradar presión en sensores del sector afectado
    _applySectorPressureDrop(point.sector, type.pressureDrop);

    // UI
    _showAlert(type, point);
    _playSound();

    // Cámara: ángulo aéreo sobre el punto de fuga
    const camOffset = new THREE.Vector3(6, 12, 9);
    goToView('custom',
      point.pos,
      point.pos.clone().add(camOffset)
    );

    _startTimer();

    // Auto-resolución tras resolveMs
    clearTimeout(_autoResolveTimer);
    _autoResolveTimer = setTimeout(() => {
      if (_isLeakActive) _autoResolve();
    }, type.resolveMs);

    _updateBtnState(true);

  } else {
    _deactivateLeak(false);
  }
}

// ─── Activar modo nocturno ───────────────────────────────────────────────────
export function toggleNightMode() {
  _nightModeActive = !_nightModeActive;
  _emitEvent('nightMode', { active: _nightModeActive });

  const badge = document.getElementById('night-mode-badge');
  if (badge) badge.style.display = _nightModeActive ? 'block' : 'none';

  if (_nightModeActive) {
    _addLog('info', 'Modo nocturno activo — umbral de alerta: ' + NIGHT_THRESHOLD + ' L/s');
  }
  return _nightModeActive;
}

// ─── Control de válvulas ─────────────────────────────────────────────────────
export function setValve(valveId, open) {
  if (!_valves[valveId]) { console.warn(`Válvula ${valveId} no existe.`); return; }
  _valves[valveId].open = open;
  _addLog(open ? 'info' : 'warn', `Válvula ${valveId} (${_valves[valveId].name}) ${open ? 'abierta' : 'cerrada'}`);
  _emitEvent('valveChange', { id: valveId, open });
}

export function getValves() { return { ..._valves }; }

// ─── Aislar sector ────────────────────────────────────────────────────────────
export function isolateSector(sector) {
  Object.entries(_valves).forEach(([id, v]) => {
    if (v.sector === sector) setValve(id, false);
  });
  _addLog('warn', `Sector ${sector} aislado — válvulas cerradas`);
}

export function restoreSector(sector) {
  Object.entries(_valves).forEach(([id, v]) => {
    if (v.sector === sector) setValve(id, true);
  });
  _addLog('info', `Sector ${sector} restaurado`);
}

// ─── Diagnóstico rápido ──────────────────────────────────────────────────────
export function runDiagnostic(onStep) {
  const steps = [
    { delay:    0, msg: 'Verificando presión en colector principal…',     type: 'info' },
    { delay:  900, msg: 'Prueba acústica en ramales norte y sur…',        type: 'info' },
    { delay: 1800, msg: 'Revisando válvulas flotantes del estanque…',     type: 'info' },
    { delay: 2700, msg: 'Comprobando sensores de caudal nocturno…',       type: 'info' },
    { delay: 3600, msg: 'Diagnóstico completo — sin anomalías adicionales.', type: 'ok' },
  ];
  steps.forEach(s => {
    setTimeout(() => {
      _addLog(s.type === 'ok' ? 'info' : 'info', s.msg);
      if (typeof onStep === 'function') onStep(s);
    }, s.delay);
  });
}

// ─── Getter de estado público ─────────────────────────────────────────────────
export function getLeakState() {
  return {
    isActive:    _isLeakActive,
    position:    _activeLeakPos ? _activeLeakPos.clone() : null,
    leakType:    _activeLeakType,
    totalLeaks:  _totalLeaks,
    history:     [..._leakHistory],
    nightMode:   _nightModeActive,
    valves:      { ..._valves },
    sensors:     _sensors.map(s => ({ ...s })),
  };
}

// ─── Loop de animación ────────────────────────────────────────────────────────
export function updateLeaks() {
  if (!_isLeakActive) return;
  const time = performance.now() * 0.005;

  // Marcador pulsante
  if (_leakMarker?.visible)
    _leakMarker.scale.setScalar(_baseLeakSize + Math.sin(time) * 0.09);

  // Charco creciente
  if (_puddle?.visible) {
    const maxSize = _baseLeakSize * 2.2;
    if (_puddle.scale.x < maxSize)
      _puddle.scale.setScalar(Math.min(_puddle.scale.x + 0.001, maxSize));
  }

  // Onda expansiva cíclica
  if (_rippleRing?.visible) {
    const cycle = (time % 2.5) / 2.5;
    _rippleRing.scale.setScalar(0.4 + cycle * _baseLeakSize * 3.5);
    _rippleRing.material.opacity = 0.55 * (1 - cycle);
  }

  // Marcadores de sensores: parpadeo en sector afectado
  if (_sensorGroup) {
    _sensorGroup.children.forEach((marker) => {
      if (marker.userData.sector === _activeLeakSector) {
        marker.material.color.setHex(
          Math.sin(time * 6) > 0 ? 0xff2222 : 0xff8800
        );
      }
    });
  }
}

// ─── Desactivación interna ────────────────────────────────────────────────────
function _deactivateLeak(wasAutoResolved) {
  _isLeakActive = false;

  if (_leakStartTime !== null) {
    const duration = ((performance.now() - _leakStartTime) / 1000).toFixed(1);
    _leakHistory.push({
      tipo:     _activeLeakType?.label ?? '—',
      sector:   _activeLeakPos ? _findSectorForPos(_activeLeakPos) : '—',
      duration,
      auto:     wasAutoResolved,
      ts:       new Date().toLocaleTimeString('es-CL'),
    });
    _leakStartTime = null;
    _updateHistoryPanel();
  }

  _leakMarker.visible = false;
  _puddle.visible     = false;
  _rippleRing.visible = false;
  _activeLeakPos      = null;
  _activeLeakSector   = null;

  // Restaurar presión de sensores
  _restoreSensorPressure();

  // Restaurar color de marcadores de sensores
  if (_sensorGroup) {
    _sensorGroup.children.forEach(m => m.material.color.setHex(0x00d4aa));
  }

  _hideAlert(wasAutoResolved);
  _stopSound();

  clearTimeout(_alertTimeout);
  clearTimeout(_autoResolveTimer);

  _stopTimer();
  _updateBtnState(false);

  goToView('general');
  _addLog('info', wasAutoResolved
    ? 'Fuga resuelta automáticamente por el sistema'
    : 'Simulación detenida por el operador');
}

function _autoResolve() {
  const htmlAlert = document.getElementById('alerta-fuga');
  if (htmlAlert) {
    const h3 = htmlAlert.querySelector('h3');
    const p  = htmlAlert.querySelector('p');
    if (h3) h3.textContent = '✅ Fuga Controlada';
    if (p)  p.textContent  = 'Sistema cerrado automáticamente.';
  }
  _deactivateLeak(true);
}

// ─── Presión de sensores ──────────────────────────────────────────────────────
function _applySectorPressureDrop(sector, drop) {
  _sensors.forEach(s => {
    if (s.sector === sector) {
      s._baselinePressure = s.pressure;
      s.pressure = Math.max(1.0, s.pressure - drop);
    }
  });
  _emitEvent('sensorUpdate', { sensors: _sensors });
}

function _restoreSensorPressure() {
  _sensors.forEach(s => {
    if (s._baselinePressure !== undefined) {
      s.pressure = s._baselinePressure;
      delete s._baselinePressure;
    }
  });
  _emitEvent('sensorUpdate', { sensors: _sensors });
}

function _findSectorForPos(pos) {
  if (_activeLeakSector) return _activeLeakSector;
  const match = _pipePoints.find(p => p.pos.equals(pos));
  return match?.sector ?? '?';
}

// ─── Marcadores 3D de sensores ────────────────────────────────────────────────
function _buildSensorMarkers(scene) {
  _sensorGroup = new THREE.Group();
  _sensors.forEach(s => {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.35, 0),
      new THREE.MeshBasicMaterial({ color: 0x00d4aa, transparent: true, opacity: 0.85 })
    );
    mesh.position.copy(s.pos).add(new THREE.Vector3(0, 0.6, 0));
    mesh.userData = { sensorId: s.id, sector: s.sector };
    _sensorGroup.add(mesh);
  });
  scene.add(_sensorGroup);
}

// ─── UI dinámica ──────────────────────────────────────────────────────────────
function _injectUI() {
  const wrap = document.querySelector('.canvas-wrap');
  if (!wrap) return;

  // Panel de historial
  if (!document.getElementById('leak-history-panel')) {
    const panel = document.createElement('div');
    panel.id = 'leak-history-panel';
    panel.innerHTML = `
      <div class="lh-header">
        <span>📋 Registro de fugas</span>
        <span id="lh-count">0 eventos</span>
      </div>
      <ul id="lh-list"><li class="lh-empty">Sin eventos en esta sesión.</li></ul>
    `;
    wrap.appendChild(panel);
  }

  // Badge de modo nocturno
  if (!document.getElementById('night-mode-badge')) {
    const badge = document.createElement('div');
    badge.id = 'night-mode-badge';
    badge.textContent = '🌙 Modo nocturno activo';
    badge.style.cssText = 'display:none;position:absolute;top:58px;left:50%;transform:translateX(-50%);background:rgba(10,30,55,.9);color:#7ad4ef;border:1px solid rgba(122,212,239,.4);border-radius:20px;padding:5px 14px;font-size:11px;letter-spacing:.5px;backdrop-filter:blur(8px);z-index:5';
    wrap.appendChild(badge);
  }

  // Timer badge
  if (!document.getElementById('leak-timer-badge')) {
    const badge = document.createElement('div');
    badge.id = 'leak-timer-badge';
    badge.style.cssText = 'display:none;position:absolute;top:48px;right:10px;background:rgba(60,0,0,.9);color:#f44;border:1px solid #f44;border-radius:4px;padding:4px 10px;font-family:monospace;font-size:12px;letter-spacing:1px';
    badge.textContent = '00:00';
    wrap.appendChild(badge);
  }
}

function _showAlert(type, point) {
  const htmlAlert    = document.getElementById('alerta-fuga');
  const tipoEl       = document.getElementById('tipo-fuga');
  if (!htmlAlert) return;

  htmlAlert.classList.remove('esquina', 'resuelto');
  htmlAlert.style.display = 'block';

  if (tipoEl) {
    tipoEl.innerHTML = `
      <strong>${type.label}</strong> — ${point.label}<br>
      <small style="opacity:.75">${type.description}</small>
    `;
  }

  clearTimeout(_alertTimeout);
  _alertTimeout = setTimeout(() => htmlAlert.classList.add('esquina'), 2800);
}

function _hideAlert(resolved) {
  const htmlAlert = document.getElementById('alerta-fuga');
  if (!htmlAlert) return;

  if (resolved) {
    htmlAlert.classList.add('resuelto');
    htmlAlert.classList.remove('esquina');
    clearTimeout(_alertTimeout);
    setTimeout(() => {
      htmlAlert.style.display = 'none';
      htmlAlert.classList.remove('resuelto');
    }, 2000);
  } else {
    htmlAlert.classList.remove('esquina');
    htmlAlert.addEventListener('transitionend', () => {
      if (!_isLeakActive) htmlAlert.style.display = 'none';
    }, { once: true });
  }
}

function _updateBtnState(active) {
  const btn = document.getElementById('btn-fuga');
  if (!btn) return;
  btn.classList.toggle('fuga-activa', active);
  btn.innerHTML = active
    ? '<span class="cam-icon">🛑</span> Detener simulación'
    : '<span class="cam-icon">🚨</span> Simular fuga';
}

// ─── Historial ────────────────────────────────────────────────────────────────

function _updateHistoryPanel() {
  const list  = document.getElementById('lh-list');
  const count = document.getElementById('lh-count');
  if (!list) return;

  if (count) count.textContent = `${_leakHistory.length} evento${_leakHistory.length !== 1 ? 's' : ''}`;

  list.innerHTML = _leakHistory.slice().reverse().map((e, i) => `
    <li class="lh-item ${e.auto ? 'auto' : 'manual'}">
      <span class="lh-idx">#${_leakHistory.length - i}</span>
      <span class="lh-tipo">${e.tipo}</span>
      <span class="lh-sector">Sector ${e.sector}</span>
      <span class="lh-dur">${e.duration}s · ${e.auto ? '⚙️ auto' : '👤 manual'} · ${e.ts}</span>
    </li>
  `).join('');
}

function _addLog(type, msg) {
  _emitEvent('log', { type, msg, ts: new Date().toLocaleTimeString('es-CL') });
}

// ─── Audio ────────────────────────────────────────────────────────────────────
function _playSound() {
  const el = document.getElementById('sonido-alerta');
  if (el) el.play().catch(() => console.warn('Audio bloqueado por el navegador.'));
}
function _stopSound() {
  const el = document.getElementById('sonido-alerta');
  if (el) { el.pause(); el.currentTime = 0; }
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function _startTimer() {
  const badge = document.getElementById('leak-timer-badge');
  if (!badge) return;
  badge.style.display = 'block';
  let elapsed = 0;
  _timerInterval = setInterval(() => {
    elapsed++;
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    badge.textContent = `⏱ ${m}:${s}`;
  }, 1000);
}

function _stopTimer() {
  clearInterval(_timerInterval);
  const badge = document.getElementById('leak-timer-badge');
  if (badge) badge.style.display = 'none';
}

// ─── Sistema de eventos interno ───────────────────────────────────────────────
// Permite que scene.js o main.js reaccionen a cambios sin acoplamiento directo.
// Uso: window.addEventListener('leaks:log', e => console.log(e.detail))
function _emitEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(`leaks:${name}`, { detail }));
}
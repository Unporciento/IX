import * as THREE from 'three';
import { goToView } from './controls.js';
import * as L from './layout.js';
import {
  setActiveLeakPosition,
  clearActiveLeakPosition,
  dispatchRepairTech,
  recallRepairTech,
  setValveFlowClosed,
} from './scene.js';

const NIGHT_THRESHOLD = 1.2;

let _scene = null;
let _leakMarker  = null;
let _puddle      = null;
let _rippleRing  = null;
let _sensorGroup = null;

let _isLeakActive   = false;
let _baseLeakSize   = 1;
let _activeLeakPos  = null;
let _activeLeakType = null;
let _leakStartTime  = null;
let _totalLeaks     = 0;
let _leakHistory    = [];

let _alertTimeout     = null;
let _autoResolveTimer = null;
let _timerInterval    = null;
let _nightModeActive  = false;

const _valves = {};
Object.entries(L.getValvePositions()).forEach(([id, v]) => {
  _valves[id] = { name: v.name, open: true, sector: v.sector };
});

const _sensors = L.getSensorDefs().map(s => ({
  ...s,
  pos: new THREE.Vector3(...s.pos),
}));

const _pipePoints = L.getLeakNodes().map(n => ({
  pos: new THREE.Vector3(...n.pos),
  label: n.label,
  sector: n.sector,
}));

const LEAK_TYPES = [
  {
    label: 'Goteo leve', size: 0.45, color: 0xffaa00, resolveMs: 22000,
    severity: 'warn', pressureDrop: 0.4, techCount: 1,
    description: 'Posible termofusión defectuosa o junta envejecida.',
  },
  {
    label: 'Fisura media', size: 0.9, color: 0xff5500, resolveMs: 14000,
    severity: 'warn', pressureDrop: 0.9, techCount: 2,
    description: 'Tramo antiguo sin ficha de renovación — recambio prioritario.',
  },
  {
    label: 'Rotura crítica', size: 1.5, color: 0xff1111, resolveMs: 9000,
    severity: 'crit', pressureDrop: 1.8, techCount: 3,
    description: '¡Corte de servicio inminente! Aislar sector y accionar válvula.',
  },
];

const SECTOR_VALVES = {
  A: ['V01'],
  B: ['V02'],
  C: ['V03'],
  D: ['V04', 'V05'],
};

export function initLeaks(scene) {
  _scene = scene;

  _leakMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.9 })
  );
  _leakMarker.visible = false;
  scene.add(_leakMarker);

  _puddle = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({ color: 0x2266aa, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
  );
  _puddle.rotation.x = -Math.PI / 2;
  _puddle.visible = false;
  scene.add(_puddle);

  _rippleRing = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 0.9, 32),
    new THREE.MeshBasicMaterial({ color: 0x4499bb, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  _rippleRing.rotation.x = -Math.PI / 2;
  _rippleRing.visible = false;
  scene.add(_rippleRing);

  _buildSensorMarkers(scene);
  _injectUI();
}

export function simulateLeak(leakTypeIndex = null, pipePointIndex = null) {
  _ensureAudioCtx();

  if (_isLeakActive) {
    _deactivateLeak(false);
    return;
  }

  const ptIdx   = pipePointIndex ?? Math.floor(Math.random() * _pipePoints.length);
  const typeIdx = leakTypeIndex  ?? Math.floor(Math.random() * LEAK_TYPES.length);
  const point   = _pipePoints[ptIdx];
  const type    = LEAK_TYPES[typeIdx];

  _isLeakActive   = true;
  _activeLeakPos  = point.pos.clone();
  _activeLeakType = type;
  _baseLeakSize   = type.size;
  _leakStartTime  = performance.now();
  _totalLeaks++;

  _leakMarker.material.color.setHex(type.color);
  _leakMarker.scale.setScalar(type.size * 0.5);
  _puddle.scale.setScalar(0.1);
  _rippleRing.scale.setScalar(0.1);

  _leakMarker.position.copy(point.pos).add(new THREE.Vector3(0, 0.5, 0));
  _puddle.position.copy(point.pos).add(new THREE.Vector3(0, -0.02, 0));
  _rippleRing.position.copy(point.pos).add(new THREE.Vector3(0, -0.01, 0));

  _leakMarker.visible = true;
  _puddle.visible     = true;
  _rippleRing.visible = true;

  _applySectorPressureDrop(point.sector, type.pressureDrop);
  _autoCloseSectorValves(point.sector);

  setActiveLeakPosition(point.pos, type.size);
  dispatchRepairTech(point.pos, type.techCount);

  _showAlert(type, point);
  _playSound(type);

  const camOffset = new THREE.Vector3(8, 14, 10);
  goToView('custom', point.pos, point.pos.clone().add(camOffset));

  _startTimer();

  clearTimeout(_autoResolveTimer);
  _autoResolveTimer = setTimeout(() => {
    if (_isLeakActive) _autoResolve();
  }, type.resolveMs);

  _updateBtnState(true);
  _addLog('warn', `Fuga ${type.label} en ${point.label} — sector ${point.sector}`);
}

export function toggleNightMode() {
  _nightModeActive = !_nightModeActive;
  _emitEvent('nightMode', { active: _nightModeActive });
  const badge = document.getElementById('night-mode-badge');
  if (badge) badge.style.display = _nightModeActive ? 'block' : 'none';
  if (_nightModeActive) {
    _addLog('info', `Modo nocturno activo — umbral: ${NIGHT_THRESHOLD} L/s`);
  }
  return _nightModeActive;
}

export function setValve(valveId, open) {
  if (!_valves[valveId]) return;
  _valves[valveId].open = open;
  setValveFlowClosed(valveId, !open);
  _addLog(open ? 'info' : 'warn', `Válvula ${valveId} (${_valves[valveId].name}) ${open ? 'abierta' : 'cerrada'}`);
  _emitEvent('valveChange', { id: valveId, open });
}

export function getValves() { return { ..._valves }; }

export function isolateSector(sector) {
  (SECTOR_VALVES[sector] || []).forEach(id => setValve(id, false));
  _addLog('warn', `Sector ${sector} aislado — válvulas cerradas`);
}

export function restoreSector(sector) {
  (SECTOR_VALVES[sector] || []).forEach(id => setValve(id, true));
  _addLog('info', `Sector ${sector} restaurado`);
}

export function runDiagnostic(onStep) {
  const steps = [
    { delay: 0,    msg: 'Verificando presión en colector principal…', type: 'info' },
    { delay: 900,  msg: 'Prueba acústica en ramales norte y sur…', type: 'info' },
    { delay: 1800, msg: 'Revisando válvulas flotantes del estanque…', type: 'info' },
    { delay: 2700, msg: 'Comprobando sensores de caudal nocturno…', type: 'info' },
    { delay: 3600, msg: 'Diagnóstico completo — sin anomalías adicionales.', type: 'ok' },
  ];
  steps.forEach(s => {
    setTimeout(() => {
      _addLog(s.type === 'ok' ? 'info' : 'info', s.msg);
      if (typeof onStep === 'function') onStep(s);
    }, s.delay);
  });
}

export function getLeakState() {
  return {
    isActive: _isLeakActive,
    position: _activeLeakPos ? _activeLeakPos.clone() : null,
    leakType: _activeLeakType,
    totalLeaks: _totalLeaks,
    history: [..._leakHistory],
    nightMode: _nightModeActive,
    valves: { ..._valves },
    sensors: _sensors.map(s => ({ ...s, pos: s.pos.clone() })),
  };
}

export function updateLeaks() {
  if (!_isLeakActive) return;
  const time = performance.now() * 0.005;

  if (_leakMarker?.visible) {
    _leakMarker.scale.setScalar(_baseLeakSize * 0.5 + Math.sin(time * 3) * 0.12);
    _leakMarker.material.opacity = 0.7 + Math.sin(time * 5) * 0.25;
  }

  if (_puddle?.visible) {
    const maxSize = _baseLeakSize * 2.5;
    if (_puddle.scale.x < maxSize) {
      _puddle.scale.setScalar(Math.min(_puddle.scale.x + 0.002, maxSize));
    }
  }

  if (_rippleRing?.visible) {
    const cycle = (time % 2) / 2;
    _rippleRing.scale.setScalar(0.5 + cycle * _baseLeakSize * 4);
    _rippleRing.material.opacity = 0.6 * (1 - cycle);
  }

  if (_sensorGroup) {
    _sensorGroup.children.forEach(marker => {
      if (marker.userData.sector === _activeLeakType?.sector) {
        marker.material.color.setHex(Math.sin(time * 8) > 0 ? 0xff2222 : 0xff8800);
      }
    });
  }
}

function _autoCloseSectorValves(sector) {
  (SECTOR_VALVES[sector] || []).forEach(id => {
    if (_valves[id]?.open) {
      setValve(id, false);
      _addLog('warn', `Cierre automático: válvula ${id} por fuga en sector ${sector}`);
    }
  });
}

function _deactivateLeak(wasAutoResolved) {
  _isLeakActive = false;

  if (_leakStartTime !== null) {
    const duration = ((performance.now() - _leakStartTime) / 1000).toFixed(1);
    _leakHistory.push({
      tipo: _activeLeakType?.label ?? '—',
      sector: _activeLeakPos ? _findSectorForPos(_activeLeakPos) : '—',
      duration, auto: wasAutoResolved,
      ts: new Date().toLocaleTimeString('es-CL'),
    });
    _leakStartTime = null;
    _updateHistoryPanel();
  }

  _leakMarker.visible = false;
  _puddle.visible     = false;
  _rippleRing.visible = false;
  _activeLeakPos      = null;

  clearActiveLeakPosition();
  recallRepairTech();
  _restoreSensorPressure();

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
    ? 'Fuga reparada — tubería restaurada, válvulas en revisión'
    : 'Simulación detenida por el operador');
}

function _autoResolve() {
  const htmlAlert = document.getElementById('alerta-fuga');
  if (htmlAlert) {
    const h3 = htmlAlert.querySelector('h3');
    const p  = htmlAlert.querySelector('p');
    if (h3) h3.textContent = '✅ Reparación completada';
    if (p)  p.textContent  = 'Técnicos restauraron la tubería. Flujo normalizado.';
  }
  _deactivateLeak(true);
}

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
  const match = _pipePoints.find(p => p.pos.distanceTo(pos) < 0.5);
  return match?.sector ?? '?';
}

function _buildSensorMarkers(scene) {
  _sensorGroup = new THREE.Group();
  _sensors.forEach(s => {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.3, 0),
      new THREE.MeshBasicMaterial({ color: 0x00d4aa, transparent: true, opacity: 0.85 })
    );
    mesh.position.copy(s.pos).add(new THREE.Vector3(0, 0.5, 0));
    mesh.userData = { sensorId: s.id, sector: s.sector };
    _sensorGroup.add(mesh);
  });
  scene.add(_sensorGroup);
}

function _injectUI() {
  const wrap = document.querySelector('.canvas-wrap');
  if (!wrap) return;

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

  if (!document.getElementById('night-mode-badge')) {
    const badge = document.createElement('div');
    badge.id = 'night-mode-badge';
    badge.textContent = '🌙 Modo nocturno activo';
    badge.style.cssText = 'display:none;position:absolute;top:10px;right:10px;background:rgba(0,30,60,.9);color:#4af;border:1px solid #4af;border-radius:4px;padding:4px 10px;font-size:11px';
    wrap.appendChild(badge);
  }

  if (!document.getElementById('leak-timer-badge')) {
    const badge = document.createElement('div');
    badge.id = 'leak-timer-badge';
    badge.style.cssText = 'display:none;position:absolute;top:48px;right:10px;background:rgba(60,0,0,.9);color:#f44;border:1px solid #f44;border-radius:4px;padding:4px 10px;font-family:monospace;font-size:12px';
    badge.textContent = '00:00';
    wrap.appendChild(badge);
  }
}

function _showAlert(type, point) {
  const htmlAlert = document.getElementById('alerta-fuga');
  const tipoEl    = document.getElementById('tipo-fuga');
  if (!htmlAlert) return;

  htmlAlert.classList.remove('esquina', 'resuelto');
  htmlAlert.style.display = 'block';
  htmlAlert.querySelector('h3').textContent = '🚨 ALARMA — Fuga Detectada';

  if (tipoEl) {
    tipoEl.innerHTML = `
      <strong>${type.label}</strong> — ${point.label}<br>
      <small style="opacity:.75">${type.description}</small><br>
      <small style="color:#f88">🔧 ${type.techCount} técnico(s) en camino · Válvula sector ${point.sector} cerrada</small>
    `;
  }

  clearTimeout(_alertTimeout);
  _alertTimeout = setTimeout(() => htmlAlert.classList.add('esquina'), 3500);
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
      htmlAlert.querySelector('h3').textContent = '🚨 Fuga Detectada';
    }, 2500);
  } else {
    htmlAlert.style.display = 'none';
    htmlAlert.classList.remove('esquina');
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

// ─── Audio — sirena Web Audio API (loop mientras fuga activa) ─────────────────
let _audioCtx    = null;
let _alarmNodes  = null;
let _alarmActive = false;
let _alarmLoopTimer = null;

function _ensureAudioCtx() {
  if (!_audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    _audioCtx = new AC();
  }
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
  return _audioCtx;
}

function _playSound(type) {
  _stopSound();
  const ctx = _ensureAudioCtx();
  if (!ctx) return;

  const isCrit = type?.severity === 'crit';

  function _startAlarmCycle() {
    if (!_alarmActive) return;
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(isCrit ? 0.55 : 0.38, now + 0.08);
    master.gain.setValueAtTime(isCrit ? 0.55 : 0.38, now + 1.6);
    master.gain.linearRampToValueAtTime(0, now + 1.75);
    master.connect(ctx.destination);

    const carrier = ctx.createOscillator();
    carrier.type = isCrit ? 'sawtooth' : 'square';
    carrier.frequency.setValueAtTime(isCrit ? 880 : 660, now);
    carrier.frequency.linearRampToValueAtTime(isCrit ? 520 : 380, now + 0.85);
    carrier.frequency.linearRampToValueAtTime(isCrit ? 880 : 660, now + 1.6);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = isCrit ? 6 : 3.5;
    const lfoG = ctx.createGain();
    lfoG.gain.value = isCrit ? 0.25 : 0.15;
    lfo.connect(lfoG);
    lfoG.connect(master.gain);

    const cg = ctx.createGain();
    cg.gain.value = 0.65;
    carrier.connect(cg).connect(master);

    if (isCrit) {
      const hi = ctx.createOscillator();
      hi.type = 'square';
      hi.frequency.value = 1320;
      const hiG = ctx.createGain();
      hiG.gain.value = 0.12;
      hi.connect(hiG).connect(master);
      hi.start(now);
      hi.stop(now + 1.8);
    }

    carrier.start(now);
    lfo.start(now);
    carrier.stop(now + 1.8);
    lfo.stop(now + 1.8);
  }

  _alarmActive = true;
  _startAlarmCycle();
  _alarmLoopTimer = setInterval(_startAlarmCycle, isCrit ? 1600 : 2000);
}

function _stopSound() {
  _alarmActive = false;
  clearInterval(_alarmLoopTimer);
  _alarmLoopTimer = null;
  _alarmNodes = null;
}

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

function _emitEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(`leaks:${name}`, { detail }));
}

// Export para desbloqueo de audio desde main.js
export function unlockAudio() {
  _ensureAudioCtx();
}

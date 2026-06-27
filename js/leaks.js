import * as THREE from 'three';
import { goToView } from './controls.js';

// ─── Estado del módulo ────────────────────────────────────────────────────────
let leakMarker, puddle, rippleRing;
let isLeakActive  = false;
let alertTimeout;
let autoResolveTimeout;
let baseLeakSize  = 1;
let activeLeakPos = null;
let leakStartTime = null;
let totalLeaks    = 0;
let leakHistory   = [];

// ─── Puntos de fuga actualizados para la nueva maqueta ────────────────────────
//  Las tuberías de la red corren en Z=-6 (colector) y ramales en X=-10,-3,+5
//  Distribuidor transversal: Z=-6, X de -14 a +14
//  Ramales casitas fila norte: X=-10,-3,+5 entre Z=-6 y Z=2
//  Ramales casitas fila sur:   X=-10,-3,+5 entre Z=-6 y Z=11
//  Tubería casa principal:     de Z=-20 a Z=-12 en X=0
const pipePoints = [
  // Colector principal bajo la calle
  new THREE.Vector3(-7,  0.28, -6),
  new THREE.Vector3( 5,  0.28, -6),
  new THREE.Vector3( 0,  0.28, -6),
  // Ramal fila norte (casitas en Z=4)
  new THREE.Vector3(-10, 0.28,  0),
  new THREE.Vector3( -3, 0.28,  0),
  new THREE.Vector3(  5, 0.28,  0),
  // Ramal fila sur (casitas en Z=13)
  new THREE.Vector3(-10, 0.28,  8),
  new THREE.Vector3( -3, 0.28,  8),
  // Tubería casa principal
  new THREE.Vector3(  0, 0.28, -16),
];

// ─── Tipos de fuga ────────────────────────────────────────────────────────────
const LEAK_TYPES = [
  { label: 'Goteo Leve',     size: 0.5, color: 0xffaa00, resolveMs: 15000 },
  { label: 'Fisura Media',   size: 1.0, color: 0xff5500, resolveMs: 10000 },
  { label: 'Rotura Crítica', size: 1.5, color: 0xff0000, resolveMs:  6000 },
];

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initLeaks(scene) {
  const mAlert = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.85 });
  leakMarker = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 24), mAlert);
  leakMarker.visible = false;
  scene.add(leakMarker);

  const mPuddle = new THREE.MeshBasicMaterial({ color: 0x225577, transparent: true, opacity: 0.55 });
  puddle = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), mPuddle);
  puddle.rotation.x = -Math.PI / 2;
  puddle.visible = false;
  scene.add(puddle);

  const mRipple = new THREE.MeshBasicMaterial({ color: 0x4499bb, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  rippleRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.1, 32), mRipple);
  rippleRing.rotation.x = -Math.PI / 2;
  rippleRing.visible = false;
  scene.add(rippleRing);

  _injectHistoryPanel();
  _injectTimerBadge();
}

// ─── Simular / detener fuga ───────────────────────────────────────────────────
export function simulateLeak() {
  isLeakActive = !isLeakActive;

  const htmlAlert    = document.getElementById('alerta-fuga');
  const sonidoAlerta = document.getElementById('sonido-alerta');
  const btnFuga      = document.getElementById('btn-fuga');

  if (isLeakActive) {
    const pos  = pipePoints[Math.floor(Math.random() * pipePoints.length)];
    const type = LEAK_TYPES[Math.floor(Math.random() * LEAK_TYPES.length)];
    activeLeakPos = pos;
    baseLeakSize  = type.size;
    leakStartTime = performance.now();
    totalLeaks++;

    leakMarker.material.color.setHex(type.color);
    leakMarker.scale.setScalar(baseLeakSize);
    puddle.scale.setScalar(0.05);
    rippleRing.scale.setScalar(0.1);

    leakMarker.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0));
    puddle.position.copy(pos).add(new THREE.Vector3(0, -0.25, 0));
    rippleRing.position.copy(pos).add(new THREE.Vector3(0, -0.24, 0));

    leakMarker.visible = true;
    puddle.visible     = true;
    rippleRing.visible = true;

    htmlAlert.classList.remove('esquina', 'resuelto');
    htmlAlert.style.display = 'block';
    document.getElementById('tipo-fuga').innerText =
      `${type.label} · Sector (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})`;

    sonidoAlerta.play().catch(() =>
      console.warn('Audio bloqueado por el navegador.')
    );

    clearTimeout(alertTimeout);
    alertTimeout = setTimeout(() => htmlAlert.classList.add('esquina'), 2500);

    clearTimeout(autoResolveTimeout);
    autoResolveTimeout = setTimeout(() => {
      if (isLeakActive) _autoResolve();
    }, type.resolveMs);

    btnFuga.classList.add('fuga-activa');
    btnFuga.innerHTML = '<span class="cam-icon">🛑</span> Detener Simulación';

    // Cámara: vista desde arriba del punto de fuga, levemente inclinada
    const camOffset = new THREE.Vector3(6, 10, 8);
    goToView('custom', pos, pos.clone().add(camOffset));

    _startTimer();

  } else {
    _deactivateLeak(false);
  }
}

// ─── Desactivación ────────────────────────────────────────────────────────────
function _deactivateLeak(wasAutoResolved) {
  isLeakActive = false;

  const htmlAlert    = document.getElementById('alerta-fuga');
  const sonidoAlerta = document.getElementById('sonido-alerta');
  const btnFuga      = document.getElementById('btn-fuga');

  if (leakStartTime !== null) {
    const duration = ((performance.now() - leakStartTime) / 1000).toFixed(1);
    const tipo     = document.getElementById('tipo-fuga')?.innerText ?? '—';
    leakHistory.push({ tipo, duration, auto: wasAutoResolved });
    _updateHistoryPanel();
    leakStartTime = null;
  }

  leakMarker.visible = false;
  puddle.visible     = false;
  rippleRing.visible = false;
  activeLeakPos      = null;

  if (wasAutoResolved) {
    htmlAlert.classList.add('resuelto');
    htmlAlert.classList.remove('esquina');
    clearTimeout(alertTimeout);
    setTimeout(() => {
      htmlAlert.style.display = 'none';
      htmlAlert.classList.remove('resuelto');
    }, 1800);
  } else {
    htmlAlert.classList.remove('esquina');
    htmlAlert.addEventListener('transitionend', () => {
      if (!isLeakActive) htmlAlert.style.display = 'none';
    }, { once: true });
  }

  sonidoAlerta.pause();
  sonidoAlerta.currentTime = 0;
  clearTimeout(alertTimeout);
  clearTimeout(autoResolveTimeout);

  btnFuga.classList.remove('fuga-activa');
  btnFuga.innerHTML = '<span class="cam-icon">🚨</span> Simular Fuga';

  _stopTimer();
  goToView('general');
}

function _autoResolve() {
  const htmlAlert = document.getElementById('alerta-fuga');
  htmlAlert.querySelector('h3').textContent = '✅ Fuga Controlada';
  htmlAlert.querySelector('p').textContent  = 'Sistema cerrado automáticamente.';
  _deactivateLeak(true);
}

// ─── Loop de animación ────────────────────────────────────────────────────────
export function updateLeaks() {
  if (!isLeakActive) return;
  const time = performance.now() * 0.005;

  if (leakMarker?.visible)
    leakMarker.scale.setScalar(baseLeakSize + Math.sin(time) * 0.08);

  if (puddle?.visible) {
    const maxSize = baseLeakSize * 1.8;
    if (puddle.scale.x < maxSize)
      puddle.scale.setScalar(Math.min(puddle.scale.x + 0.0008, maxSize));
  }

  if (rippleRing?.visible) {
    const rippleScale = (time % 3) / 3;
    rippleRing.scale.setScalar(0.5 + rippleScale * baseLeakSize * 3);
    rippleRing.material.opacity = 0.5 * (1 - rippleScale);
  }
}

export function getLeakState() {
  return { isActive: isLeakActive, position: activeLeakPos, totalLeaks, history: [...leakHistory] };
}

// ─── Panel historial ──────────────────────────────────────────────────────────
function _injectHistoryPanel() {
  const panel = document.createElement('div');
  panel.id = 'leak-history-panel';
  panel.innerHTML = `
    <div class="lh-header">
      <span>📋 Registro de Fugas</span>
      <span id="lh-count">0 eventos</span>
    </div>
    <ul id="lh-list"><li class="lh-empty">Sin eventos en esta sesión.</li></ul>
  `;
  const wrap = document.querySelector('.canvas-wrap');
  if (wrap) wrap.appendChild(panel);
}

function _updateHistoryPanel() {
  const list  = document.getElementById('lh-list');
  const count = document.getElementById('lh-count');
  if (!list) return;
  count.textContent = `${leakHistory.length} evento${leakHistory.length !== 1 ? 's' : ''}`;
  list.innerHTML = leakHistory.slice().reverse().map((e, i) => `
    <li class="lh-item ${e.auto ? 'auto' : 'manual'}">
      <span class="lh-idx">#${leakHistory.length - i}</span>
      <span class="lh-tipo">${e.tipo}</span>
      <span class="lh-dur">${e.duration}s · ${e.auto ? '⚙️ auto' : '👤 manual'}</span>
    </li>
  `).join('');
}

// ─── Timer badge ──────────────────────────────────────────────────────────────
let _timerInterval = null;

function _injectTimerBadge() {
  const badge = document.createElement('div');
  badge.id = 'leak-timer-badge';
  badge.style.display = 'none';
  badge.textContent = '00:00';
  const wrap = document.querySelector('.canvas-wrap');
  if (wrap) wrap.appendChild(badge);
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

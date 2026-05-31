import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ═══════════════════════════════════════════════════════════════════════════
   controls.js  —  Sistema de cámara con animación, vistas predefinidas,
                   tour automático, minimap y atajos de teclado
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Estado ───────────────────────────────────────────────────────────────────
let controls, camera;

const destPos    = new THREE.Vector3();
const destTarget = new THREE.Vector3();
const fromPos    = new THREE.Vector3();
const fromTarget = new THREE.Vector3();

let isAnimating  = false;
let animProgress = 0;
let animSpeed    = 0.032;   // velocidad base — se ajusta por distancia

// ─── Tour automático ──────────────────────────────────────────────────────────
let tourActive   = false;
let tourIndex    = 0;
let tourTimer    = 0;
const TOUR_PAUSE = 4.0;    // segundos en cada vista antes de avanzar

const TOUR_SEQUENCE = ['general', 'plant', 'network', 'general'];

// ─── Historial de cámara (últimas 5 posiciones para "volver atrás") ───────────
const camHistory = [];
const CAM_HISTORY_MAX = 5;

// ─── Vistas predefinidas ──────────────────────────────────────────────────────
const VIEWS = {
  general: {
    pos:    new THREE.Vector3(0, 30, 45),
    target: new THREE.Vector3(0, 0, -5),
    label:  'Vista General',
  },
  plant: {
    pos:    new THREE.Vector3(30, 10, 10),
    target: new THREE.Vector3(18, 2, -5),
    label:  'Planta Desalinizadora',
  },
  network: {
    pos:    new THREE.Vector3(-8, 18, -10),
    target: new THREE.Vector3(0, 3, -25),
    label:  'Cerro y Estanque',
  },
};

// ─── Inicialización ───────────────────────────────────────────────────────────
export function initControls(cam, rendererDom) {
  camera = cam;

  controls = new OrbitControls(camera, rendererDom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.minDistance   = 5;
  controls.maxDistance   = 95;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  controls.enablePan     = true;
  controls.panSpeed      = 0.55;
  controls.rotateSpeed   = 0.50;   // rotación suave, sin mareo
  controls.zoomSpeed     = 0.75;
  controls.target.set(0, 0, -5);
  controls.update();

  destPos.copy(VIEWS.general.pos);
  destTarget.copy(VIEWS.general.target);

  // Cancelar animación al tomar control manual
  controls.addEventListener('start', _onUserInteractionStart);

  // Ocultar tooltip al primer toque
  controls.addEventListener('start', _hideCanvasTooltip, { once: true });

  // Atajos de teclado
  window.addEventListener('keydown', _handleKeydown);

  // Minimap
  _buildMinimap(rendererDom.parentElement);

  // Cheatsheet de atajos (icono ?)
  _buildShortcutHint(rendererDom.parentElement);
}

// ─── Loop principal ───────────────────────────────────────────────────────────
export function updateControls(delta = 0.016) {
  if (isAnimating) {
    animProgress = Math.min(animProgress + animSpeed, 1);
    const t = _easeInOutCubic(animProgress);

    camera.position.lerpVectors(fromPos, destPos, t);
    controls.target.lerpVectors(fromTarget, destTarget, t);

    if (animProgress >= 1) {
      isAnimating  = false;
      animProgress = 0;
      camera.position.copy(destPos);
      controls.target.copy(destTarget);
      _dispatchCameraArrived();
    }
  }

  // Tour automático
  if (tourActive && !isAnimating && !window._leakActive) {
    tourTimer -= delta;
    if (tourTimer <= 0) {
      tourIndex = (tourIndex + 1) % TOUR_SEQUENCE.length;
      goToView(TOUR_SEQUENCE[tourIndex]);
      tourTimer = TOUR_PAUSE;
    }
  }

  // Actualizar minimap
  _updateMinimap();

  controls.update();
}

// ─── Ir a una vista ───────────────────────────────────────────────────────────
export function goToView(name, customTarget = null, customPos = null) {
  // Guardar posición actual en historial
  _pushHistory();

  fromPos.copy(camera.position);
  fromTarget.copy(controls.target);

  if (name === 'custom') {
    destPos.copy(customPos);
    destTarget.copy(customTarget);
  } else {
    if (!VIEWS[name]) {
      console.warn(`goToView: vista "${name}" no existe.`);
      return;
    }
    destPos.copy(VIEWS[name].pos);
    destTarget.copy(VIEWS[name].target);
    _setActiveButton(name);
    _showViewLabel(VIEWS[name].label);
  }

  // Velocidad dinámica: más lento si hay más distancia (sensación de peso)
  const dist = fromPos.distanceTo(destPos);
  animSpeed  = THREE.MathUtils.clamp(0.028 + 0.004 * (1 / Math.max(dist, 1)), 0.018, 0.055);

  isAnimating  = true;
  animProgress = 0;
}

// ─── Volver a la vista anterior ───────────────────────────────────────────────
export function goBack() {
  if (camHistory.length === 0) return;
  const prev = camHistory.pop();
  fromPos.copy(camera.position);
  fromTarget.copy(controls.target);
  destPos.copy(prev.pos);
  destTarget.copy(prev.target);
  animSpeed    = 0.028;
  isAnimating  = true;
  animProgress = 0;
  _updateBackButton();
}

// ─── Tour automático ──────────────────────────────────────────────────────────
export function startTour() {
  if (window._leakActive) return;   // no durante emergencia
  tourActive = true;
  tourIndex  = 0;
  tourTimer  = 0;
  goToView(TOUR_SEQUENCE[0]);
  _setTourButtonState(true);
}

export function stopTour() {
  tourActive = false;
  _setTourButtonState(false);
}

export function isTourActive() { return tourActive; }

// ─── Getters públicos ─────────────────────────────────────────────────────────
export function isCameraAnimating() { return isAnimating; }
export function getCameraPosition()  { return camera?.position.clone(); }
export function getCameraTarget()    { return controls?.target.clone(); }

export function registerView(name, pos, target, label = name) {
  VIEWS[name] = {
    pos:    new THREE.Vector3().copy(pos),
    target: new THREE.Vector3().copy(target),
    label,
  };
}

// ─── Privados: interacción ────────────────────────────────────────────────────
function _onUserInteractionStart() {
  if (isAnimating) {
    isAnimating  = false;
    animProgress = 0;
    destPos.copy(camera.position);
    destTarget.copy(controls.target);
  }
  // Detener tour si el usuario toca la cámara manualmente
  if (tourActive) stopTour();
}

function _handleKeydown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const key = e.key;

  // Vistas numéricas
  if (key === '1') goToView('general');
  if (key === '2') goToView('plant');
  if (key === '3') goToView('network');

  // Reset
  if (key === 'r' || key === 'R') goToView('general');

  // Volver atrás
  if (key === 'Backspace' || key === 'b' || key === 'B') goBack();

  // Tour
  if (key === 't' || key === 'T') tourActive ? stopTour() : startTour();

  // Zoom teclado (+ / -)
  if ((key === '+' || key === '=') && camera) {
    const dir = controls.target.clone().sub(camera.position).normalize();
    camera.position.addScaledVector(dir, 2);
  }
  if (key === '-' && camera) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    camera.position.addScaledVector(dir, 2);
  }

  // F = pantalla completa del canvas
  if (key === 'f' || key === 'F') {
    const canvas = document.getElementById('three-canvas');
    if (canvas) {
      if (!document.fullscreenElement) canvas.requestFullscreen?.();
      else document.exitFullscreen?.();
    }
  }
}

// ─── Privados: historial ──────────────────────────────────────────────────────
function _pushHistory() {
  if (!camera) return;
  camHistory.push({
    pos:    camera.position.clone(),
    target: controls.target.clone(),
  });
  if (camHistory.length > CAM_HISTORY_MAX) camHistory.shift();
  _updateBackButton();
}

function _updateBackButton() {
  const btn = document.getElementById('btn-cam-back');
  if (btn) btn.style.opacity = camHistory.length > 0 ? '1' : '0.4';
}

// ─── Privados: UI ─────────────────────────────────────────────────────────────
function _hideCanvasTooltip() {
  const tip = document.getElementById('canvas-tooltip');
  if (tip) {
    tip.style.transition = 'opacity 1s ease';
    tip.style.opacity = '0';
    setTimeout(() => tip.classList.add('hidden'), 1000);
  }
}

function _setActiveButton(name) {
  document.querySelectorAll('.cam-btn:not(.btn-fuga)')
          .forEach(b => b.classList.remove('active'));
  const idMap = { general: 'btn-general', plant: 'btn-plant', network: 'btn-network' };
  const btn = document.getElementById(idMap[name]);
  if (btn) btn.classList.add('active');
}

// Toast con el nombre de la vista
let _labelTimeout;
function _showViewLabel(label) {
  let toast = document.getElementById('cam-view-label');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'cam-view-label';
    toast.style.cssText = `
      position:absolute; bottom:2.5rem; left:50%; transform:translateX(-50%);
      background:rgba(27,61,45,.88); color:#ddb85a;
      font-family:'Playfair Display',serif; font-size:0.82rem;
      letter-spacing:0.14em; text-transform:uppercase;
      padding:0.4rem 1.4rem; border-radius:20px;
      border:1px solid rgba(184,144,58,.4);
      pointer-events:none; z-index:20;
      opacity:0; transition:opacity 0.3s ease;
    `;
    document.querySelector('.canvas-wrap')?.appendChild(toast);
  }
  toast.textContent = label;
  toast.style.opacity = '1';
  clearTimeout(_labelTimeout);
  _labelTimeout = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
}

function _setTourButtonState(active) {
  const btn = document.getElementById('btn-tour');
  if (!btn) return;
  btn.innerHTML      = active ? '⏹ Detener Tour' : '▶ Tour Automático';
  btn.style.background = active ? '#b8903a' : '#1b3d2d';
}

function _dispatchCameraArrived() {
  window.dispatchEvent(new CustomEvent('camera:arrived'));
}

// ─── Minimap ──────────────────────────────────────────────────────────────────
let minimapDot;
const MINIMAP_SCALE = 3.2;  // unidades de escena → píxeles

function _buildMinimap(wrapper) {
  if (!wrapper) return;

  const map = document.createElement('div');
  map.id = 'cam-minimap';
  map.style.cssText = `
    position:absolute; bottom:1.2rem; left:50%; transform:translateX(-50%);
    width:120px; height:80px;
    background:rgba(10,18,10,.70);
    border:1px solid rgba(184,144,58,.35);
    border-radius:4px; z-index:10;
    overflow:hidden; pointer-events:none;
  `;

  // Fondo esquemático del layout
  map.innerHTML = `
    <svg width="120" height="80" viewBox="-40 -35 80 75" style="position:absolute;inset:0">
      <!-- mar -->
      <rect x="19" y="-35" width="25" height="75" fill="rgba(30,90,130,.5)" rx="0"/>
      <!-- calle principal -->
      <rect x="-40" y="-9" width="58" height="5" fill="rgba(80,75,65,.6)"/>
      <!-- calle lateral -->
      <rect x="-16" y="-20" width="4" height="55" fill="rgba(80,75,65,.6)"/>
      <!-- casitas fila norte -->
      <rect x="-12" y="2" width="4" height="4" fill="rgba(240,235,215,.5)" rx="1"/>
      <rect x="-5" y="2" width="4" height="4" fill="rgba(240,235,215,.5)" rx="1"/>
      <rect x="3"  y="2" width="4" height="4" fill="rgba(240,235,215,.5)" rx="1"/>
      <!-- casitas fila sur -->
      <rect x="-12" y="11" width="4" height="4" fill="rgba(240,235,215,.5)" rx="1"/>
      <rect x="-5"  y="11" width="4" height="4" fill="rgba(240,235,215,.5)" rx="1"/>
      <rect x="3"   y="11" width="4" height="4" fill="rgba(240,235,215,.5)" rx="1"/>
      <!-- casa principal -->
      <rect x="-5" y="-18" width="10" height="7" fill="rgba(250,245,235,.55)" rx="1"/>
      <!-- planta -->
      <rect x="10" y="-10" width="8" height="5" fill="rgba(210,200,185,.55)" rx="1"/>
      <!-- montaña -->
      <circle cx="0" cy="-32" r="8" fill="rgba(180,160,110,.5)"/>
      <!-- estanque -->
      <circle cx="0" cy="-32" r="2.5" fill="rgba(74,124,111,.7)"/>
    </svg>
    <div id="minimap-dot" style="
      position:absolute; width:7px; height:7px;
      background:#ddb85a; border-radius:50%;
      border:1px solid rgba(255,220,100,.8);
      box-shadow:0 0 4px #ddb85a;
      transform:translate(-50%,-50%);
      transition: left 0.1s, top 0.1s;
      pointer-events:none;
    "></div>
  `;

  wrapper.appendChild(map);
  minimapDot = document.getElementById('minimap-dot');
}

function _updateMinimap() {
  if (!minimapDot || !camera) return;

  // Mapear posición de cámara al espacio del minimap
  // Rango de escena: X de -40 a 20, Z de -35 a 40
  // Canvas del minimap: 120×80px, viewBox -40..-20 → 0..120, -35..40 → 0..80
  const sceneX  = camera.position.x;
  const sceneZ  = camera.position.z;
  const px = ((sceneX + 40) / 60) * 120;
  const py = ((sceneZ + 35) / 75) * 80;

  minimapDot.style.left = Math.max(4, Math.min(116, px)) + 'px';
  minimapDot.style.top  = Math.max(4, Math.min(76,  py)) + 'px';
}

// ─── Cheatsheet de atajos ─────────────────────────────────────────────────────
function _buildShortcutHint(wrapper) {
  if (!wrapper) return;

  const btn = document.createElement('button');
  btn.id = 'btn-shortcuts';
  btn.textContent = '?';
  btn.title = 'Atajos de teclado';
  btn.style.cssText = `
    position:absolute; top:1rem; right:1rem;
    width:28px; height:28px; border-radius:50%;
    background:rgba(27,61,45,.80); color:var(--accent-light,#ddb85a);
    border:1px solid rgba(184,144,58,.4);
    font-size:0.85rem; font-weight:700; cursor:pointer;
    z-index:20; display:flex; align-items:center; justify-content:center;
    transition:background .2s;
  `;

  const panel = document.createElement('div');
  panel.id = 'shortcut-panel';
  panel.style.cssText = `
    position:absolute; top:2.6rem; right:1rem;
    background:rgba(10,20,12,.92);
    border:1px solid rgba(184,144,58,.35);
    border-radius:6px; padding:0.9rem 1.2rem;
    color:rgba(255,255,255,.8); font-family:'Crimson Pro',serif;
    font-size:0.82rem; line-height:1.9;
    z-index:20; display:none; min-width:200px;
    pointer-events:none;
  `;
  panel.innerHTML = `
    <div style="color:#ddb85a;font-family:'Playfair Display',serif;font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;margin-bottom:.4rem">Atajos de Teclado</div>
    <div><kbd>1</kbd> Vista General</div>
    <div><kbd>2</kbd> Planta Desalinizadora</div>
    <div><kbd>3</kbd> Cerro y Estanque</div>
    <div><kbd>R</kbd> Resetear cámara</div>
    <div><kbd>B</kbd> Volver atrás</div>
    <div><kbd>T</kbd> Tour automático</div>
    <div><kbd>F</kbd> Pantalla completa</div>
    <div><kbd>+</kbd> / <kbd>-</kbd> Zoom</div>
  `;

  btn.addEventListener('mouseenter', () => { panel.style.display = 'block'; });
  btn.addEventListener('mouseleave', () => { panel.style.display = 'none'; });

  wrapper.appendChild(btn);
  wrapper.appendChild(panel);
}

// ─── Easing ───────────────────────────────────────────────────────────────────
function _easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
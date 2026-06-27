import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── Estado ───────────────────────────────────────────────────────────────────
let controls, camera, renderer;

let isAnimating  = false;
let animProgress = 0;
const ANIM_SPEED = 0.028; // más suave que antes (era 0.032)

const fromPos    = new THREE.Vector3();
const fromTarget = new THREE.Vector3();
const destPos    = new THREE.Vector3();
const destTarget = new THREE.Vector3();

// Cola de vistas: permite encadenar cinematics sin colisionar
const _viewQueue = [];
let   _queueTimer = null;

// Estado de la última vista nombrada (para restaurar tras focusNode)
let _lastNamedView = 'general';

// ─── Catálogo de vistas ───────────────────────────────────────────────────────
//
//  LAYOUT DE REFERENCIA (maqueta Three.js):
//    Z ≈ -32  → Montaña + estanque principal
//    Z ≈ -16  → Casa Principal
//    Z ≈  -6  → Calle vehicular / colector
//    Z ≈   4  → Fila casitas norte
//    Z ≈  13  → Fila casitas sur
//    X ≈  18  → Planta Desalinizadora (junto al mar)
//
const VIEWS = {

  // Vista isométrica global — muestra toda la urbanización de golpe
  general: {
    pos:    new THREE.Vector3(0, 30, 45),
    target: new THREE.Vector3(0, 0, -5),
    label:  'Vista general',
  },

  // Zoom a la planta desalinizadora (edificio industrial, borde del mar)
  plant: {
    pos:    new THREE.Vector3(30, 10, 10),
    target: new THREE.Vector3(18, 2, -5),
    label:  'Planta desaladora',
  },

  // Vista trasera elevada: montaña, estanque y tuberías de bajada
  network: {
    pos:    new THREE.Vector3(-8, 18, -10),
    target: new THREE.Vector3(0, 3, -25),
    label:  'Red y estanques',
  },

  // Colector principal bajo la calle vehicular
  collector: {
    pos:    new THREE.Vector3(0, 12, 8),
    target: new THREE.Vector3(0, 0, -6),
    label:  'Colector principal',
  },

  // Fila norte de casitas
  north: {
    pos:    new THREE.Vector3(-5, 14, 14),
    target: new THREE.Vector3(0, 0, 4),
    label:  'Sector norte',
  },

  // Fila sur de casitas
  south: {
    pos:    new THREE.Vector3(-5, 14, 24),
    target: new THREE.Vector3(0, 0, 13),
    label:  'Sector sur',
  },

  // Casa principal — tubería entre montaña y calle
  mainhouse: {
    pos:    new THREE.Vector3(-8, 14, -8),
    target: new THREE.Vector3(0, 1, -16),
    label:  'Casa principal',
  },

  // Cenital — pájaro a alta altitud
  top: {
    pos:    new THREE.Vector3(0, 60, 0),
    target: new THREE.Vector3(0, 0, -5),
    label:  'Vista cenital',
  },
};

// ─── Inicialización ───────────────────────────────────────────────────────────
export function initControls(cam, rendererDom, rendererRef) {
  camera   = cam;
  renderer = rendererRef; // guardado para screenshots

  controls = new OrbitControls(camera, rendererDom);
  controls.enableDamping  = true;
  controls.dampingFactor  = 0.05;
  controls.minDistance    = 4;
  controls.maxDistance    = 100;
  controls.maxPolarAngle  = Math.PI / 2 - 0.03;
  controls.enablePan      = true;
  controls.panSpeed       = 0.55;
  controls.rotateSpeed    = 0.50;
  controls.zoomSpeed      = 0.75;
  controls.target.set(0, 0, -5);
  controls.update();

  destPos.copy(VIEWS.general.pos);
  destTarget.copy(VIEWS.general.target);

  controls.addEventListener('start', _onUserInteractionStart);
  controls.addEventListener('start', _hideCanvasTooltip, { once: true });

  // Teclas rápidas de cámara
  window.addEventListener('keydown', _onKeyDown);
}

// ─── Loop principal ───────────────────────────────────────────────────────────
export function updateControls() {
  if (isAnimating) {
    animProgress = Math.min(animProgress + ANIM_SPEED, 1);
    const t = _easeInOutCubic(animProgress);

    camera.position.lerpVectors(fromPos, destPos, t);
    controls.target.lerpVectors(fromTarget, destTarget, t);

    if (animProgress >= 1) {
      isAnimating  = false;
      animProgress = 0;
      camera.position.copy(destPos);
      controls.target.copy(destTarget);
      _processQueue(); // siguiente vista en cola, si hay
    }
  }
  controls.update();
}

// ─── Ir a una vista ───────────────────────────────────────────────────────────
export function goToView(name, customTarget = null, customPos = null) {
  fromPos.copy(camera.position);
  fromTarget.copy(controls.target);

  if (name === 'custom') {
    if (!customPos || !customTarget) {
      console.warn('goToView custom: faltan customPos o customTarget.');
      return;
    }
    destPos.copy(customPos);
    destTarget.copy(customTarget);
  } else {
    if (!VIEWS[name]) {
      console.warn(`goToView: vista "${name}" no existe.`);
      return;
    }
    destPos.copy(VIEWS[name].pos);
    destTarget.copy(VIEWS[name].target);
    _lastNamedView = name;
    _setActiveButton(name);
  }

  isAnimating  = true;
  animProgress = 0;
}

// ─── Foco en un objeto 3D ─────────────────────────────────────────────────────
// Hace zoom hacia el centro de un mesh / grupo de Three.js.
// Calcula la distancia automáticamente según el bounding sphere.
export function focusNode(object3D, distanceMult = 3.5) {
  const box    = new THREE.Box3().setFromObject(object3D);
  const center = new THREE.Vector3();
  const size   = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  const radius   = size.length() * 0.5;
  const distance = radius * distanceMult;

  // Dirección: desde la posición actual de la cámara hacia el centro del nodo
  const dir = new THREE.Vector3()
    .subVectors(camera.position, center)
    .normalize();

  const newPos = center.clone().addScaledVector(dir, distance);
  newPos.y = Math.max(newPos.y, center.y + radius * 1.2); // siempre por encima

  fromPos.copy(camera.position);
  fromTarget.copy(controls.target);
  destPos.copy(newPos);
  destTarget.copy(center);

  isAnimating  = true;
  animProgress = 0;
}

// ─── Restaurar última vista nombrada ─────────────────────────────────────────
export function restoreView() {
  goToView(_lastNamedView);
}

// ─── Cola de vistas (cinematics) ─────────────────────────────────────────────
// Uso: queueViews(['plant', 'network', 'general'], 1200)
// Espera 1200 ms en cada destino antes de pasar al siguiente.
export function queueViews(names, dwellMs = 1500) {
  _viewQueue.length = 0;
  names.forEach(n => _viewQueue.push(n));
  _processQueue(dwellMs);
}

function _processQueue(dwellMs = 1500) {
  if (_queueTimer) { clearTimeout(_queueTimer); _queueTimer = null; }
  if (_viewQueue.length === 0) return;
  const next = _viewQueue.shift();
  goToView(next);
  _queueTimer = setTimeout(() => _processQueue(dwellMs), dwellMs + 1200);
}

// ─── Screenshot ───────────────────────────────────────────────────────────────
export function takeScreenshot(filename = 'playa-la-virgen.png') {
  if (!renderer) { console.warn('takeScreenshot: renderer no registrado.'); return; }
  renderer.render(renderer.scene || renderer._scene, camera); // render doble para garantizar frame
  const url  = renderer.domElement.toDataURL('image/png');
  const link = document.createElement('a');
  link.href     = url;
  link.download = filename;
  link.click();
}

// ─── Getters / Helpers públicos ───────────────────────────────────────────────
export function isCameraAnimating() { return isAnimating; }
export function getControls()       { return controls; }
export function getCamera()         { return camera; }

export function registerView(name, pos, target, label = '') {
  VIEWS[name] = {
    pos:    new THREE.Vector3().copy(pos),
    target: new THREE.Vector3().copy(target),
    label,
  };
}

export function listViews() { return Object.keys(VIEWS); }

// ─── Privados ─────────────────────────────────────────────────────────────────
function _onUserInteractionStart() {
  if (isAnimating) {
    // El usuario interrumpe: congela animación en la posición actual
    isAnimating  = false;
    animProgress = 0;
    destPos.copy(camera.position);
    destTarget.copy(controls.target);
    if (_queueTimer) { clearTimeout(_queueTimer); _queueTimer = null; _viewQueue.length = 0; }
  }
}

function _hideCanvasTooltip() {
  const tip = document.getElementById('canvas-tooltip');
  if (tip) tip.classList.add('hidden');
}

function _setActiveButton(name) {
  document.querySelectorAll('.cam-btn:not(.btn-fuga)')
          .forEach(b => b.classList.remove('active'));
  const idMap = {
    general:   'btn-general',
    plant:     'btn-plant',
    network:   'btn-network',
    collector: 'btn-collector',
    north:     'btn-north',
    south:     'btn-south',
    mainhouse: 'btn-mainhouse',
    top:       'btn-top',
  };
  const btn = document.getElementById(idMap[name]);
  if (btn) btn.classList.add('active');
}

// Atajos de teclado (G=general, P=plant, N=network, T=top, R=restore)
function _onKeyDown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const map = { g: 'general', p: 'plant', n: 'network', t: 'top', c: 'collector', r: null };
  const key = e.key.toLowerCase();
  if (key in map) {
    if (key === 'r') restoreView();
    else if (map[key]) goToView(map[key]);
  }
}

function _easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

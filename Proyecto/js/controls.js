import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── Estado ───────────────────────────────────────────────────────────────────
let controls, camera;
let destPos    = new THREE.Vector3();
let destTarget = new THREE.Vector3();

let isAnimating  = false;
let animProgress = 0;
const ANIM_SPEED = 0.032;

const fromPos    = new THREE.Vector3();
const fromTarget = new THREE.Vector3();

// ─── Vistas (actualizadas para la nueva maqueta) ──────────────────────────────
//
//  LAYOUT DE REFERENCIA:
//    Z ≈ -32  → Montaña + estanque
//    Z ≈ -16  → Casa Principal
//    Z ≈  -6  → Calle vehicular
//    Z ≈   4  → Fila casitas norte
//    Z ≈  13  → Fila casitas sur
//    X ≈  18  → Planta Desalinizadora (junto al mar)
//
const VIEWS = {

  // ── Vista General ──────────────────────────────────────────────────────────
  general: {
    pos:    new THREE.Vector3(0, 30, 45),
    target: new THREE.Vector3(0, 0, -5),
  },

  // ── Planta Desalinizadora ──────────────────────────────────────────────────
  plant: {
    pos:    new THREE.Vector3(30, 10, 10),
    target: new THREE.Vector3(18, 2, -5),
  },

  // ── Cerro y Estanque ───────────────────────────────────────────────────────
  network: {
    pos:    new THREE.Vector3(-8, 18, -10),
    target: new THREE.Vector3(0, 3, -25),
  },

};

// ─── Inicialización ───────────────────────────────────────────────────────────
export function initControls(cam, rendererDom) {
  camera = cam;

  controls = new OrbitControls(camera, rendererDom);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance   = 6;
  controls.maxDistance   = 90;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.enablePan     = true;
  controls.panSpeed      = 0.6;
  controls.rotateSpeed   = 0.55;
  controls.zoomSpeed     = 0.8;
  controls.target.set(0, 0, -5);
  controls.update();

  destPos.copy(VIEWS.general.pos);
  destTarget.copy(VIEWS.general.target);

  // Cancelar animación si el usuario toma el control manualmente
  controls.addEventListener('start', _onUserInteractionStart);
  // Ocultar tooltip la primera vez que interactúa
  controls.addEventListener('start', _hideCanvasTooltip, { once: true });
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
    }
  }
  controls.update();
}

// ─── Ir a una vista ───────────────────────────────────────────────────────────
export function goToView(name, customTarget = null, customPos = null) {
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
  }

  isAnimating  = true;
  animProgress = 0;
}

// ─── Getters / Helpers públicos ───────────────────────────────────────────────
export function isCameraAnimating() { return isAnimating; }

export function registerView(name, pos, target) {
  VIEWS[name] = {
    pos:    new THREE.Vector3().copy(pos),
    target: new THREE.Vector3().copy(target),
  };
}

// ─── Privados ─────────────────────────────────────────────────────────────────
function _onUserInteractionStart() {
  if (isAnimating) {
    isAnimating  = false;
    animProgress = 0;
    destPos.copy(camera.position);
    destTarget.copy(controls.target);
  }
}

function _hideCanvasTooltip() {
  const tip = document.getElementById('canvas-tooltip');
  if (tip) tip.classList.add('hidden');
}

function _setActiveButton(name) {
  document.querySelectorAll('.cam-btn:not(.btn-fuga)')
          .forEach(b => b.classList.remove('active'));
  const idMap = { general: 'btn-general', plant: 'btn-plant', network: 'btn-network' };
  const btn = document.getElementById(idMap[name]);
  if (btn) btn.classList.add('active');
}

function _easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
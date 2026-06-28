import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let controls, camera, renderer;

let isAnimating  = false;
let animProgress = 0;
const ANIM_SPEED = 0.028;

const fromPos    = new THREE.Vector3();
const fromTarget = new THREE.Vector3();
const destPos    = new THREE.Vector3();
const destTarget = new THREE.Vector3();

const _viewQueue = [];
let   _queueTimer = null;
let _lastNamedView = 'general';

const VIEWS = {
  general: {
    pos:    new THREE.Vector3(42, 32, 48),
    target: new THREE.Vector3(0, 0, 0),
    label:  'Vista general',
  },
  plant: {
    pos:    new THREE.Vector3(-20, 14, 38),
    target: new THREE.Vector3(-52, 2, 28),
    label:  'Planta desaladora',
  },
  network: {
    pos:    new THREE.Vector3(48, 22, 10),
    target: new THREE.Vector3(38, 4, 0),
    label:  'Red y estanques',
  },
  collector: {
    pos:    new THREE.Vector3(12, 16, 18),
    target: new THREE.Vector3(0, 0, 0),
    label:  'Colector principal',
  },
  north: {
    pos:    new THREE.Vector3(18, 16, -28),
    target: new THREE.Vector3(0, 0, -20),
    label:  'Sector norte',
  },
  south: {
    pos:    new THREE.Vector3(18, 16, 22),
    target: new THREE.Vector3(0, 0, 20),
    label:  'Sector sur',
  },
  mainhouse: {
    pos:    new THREE.Vector3(24, 14, -22),
    target: new THREE.Vector3(11, 1, -30),
    label:  'Casa principal',
  },
  top: {
    pos:    new THREE.Vector3(0, 65, 0),
    target: new THREE.Vector3(0, 0, 0),
    label:  'Vista cenital',
  },
  beach: {
    pos:    new THREE.Vector3(-15, 10, 35),
    target: new THREE.Vector3(-58, 0, 0),
    label:  'Playa y muelle',
  },
};

export function initControls(cam, rendererDom, rendererRef) {
  camera   = cam;
  renderer = rendererRef;

  controls = new OrbitControls(camera, rendererDom);
  controls.enableDamping  = true;
  controls.dampingFactor  = 0.05;
  controls.minDistance    = 4;
  controls.maxDistance    = 120;
  controls.maxPolarAngle  = Math.PI / 2 - 0.03;
  controls.enablePan      = true;
  controls.panSpeed       = 0.55;
  controls.rotateSpeed    = 0.50;
  controls.zoomSpeed      = 0.75;
  controls.target.set(0, 0, 0);
  controls.update();

  destPos.copy(VIEWS.general.pos);
  destTarget.copy(VIEWS.general.target);

  controls.addEventListener('start', _onUserInteractionStart);
  controls.addEventListener('start', _hideCanvasTooltip, { once: true });
  window.addEventListener('keydown', _onKeyDown);
}

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
      _processQueue();
    }
  }
  controls.update();
}

export function goToView(name, customTarget = null, customPos = null) {
  fromPos.copy(camera.position);
  fromTarget.copy(controls.target);

  if (name === 'custom') {
    if (!customPos || !customTarget) return;
    destPos.copy(customPos);
    destTarget.copy(customTarget);
  } else {
    if (!VIEWS[name]) return;
    destPos.copy(VIEWS[name].pos);
    destTarget.copy(VIEWS[name].target);
    _lastNamedView = name;
    _setActiveButton(name);
  }

  isAnimating  = true;
  animProgress = 0;
}

export function focusNode(object3D, distanceMult = 3.5) {
  const box    = new THREE.Box3().setFromObject(object3D);
  const center = new THREE.Vector3();
  const size   = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const radius   = size.length() * 0.5;
  const distance = radius * distanceMult;
  const dir = new THREE.Vector3().subVectors(camera.position, center).normalize();
  const newPos = center.clone().addScaledVector(dir, distance);
  newPos.y = Math.max(newPos.y, center.y + radius * 1.2);
  fromPos.copy(camera.position);
  fromTarget.copy(controls.target);
  destPos.copy(newPos);
  destTarget.copy(center);
  isAnimating  = true;
  animProgress = 0;
}

export function restoreView() { goToView(_lastNamedView); }

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

export function takeScreenshot(filename = 'playa-la-virgen.png') {
  if (!renderer) return;
  const url  = renderer.domElement.toDataURL('image/png');
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
}

export function isCameraAnimating() { return isAnimating; }
export function getControls()       { return controls; }
export function getCamera()         { return camera; }

export function registerView(name, pos, target, label = '') {
  VIEWS[name] = { pos: new THREE.Vector3().copy(pos), target: new THREE.Vector3().copy(target), label };
}

export function listViews() { return Object.keys(VIEWS); }

function _onUserInteractionStart() {
  if (isAnimating) {
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
  document.querySelectorAll('.cam-btn:not(.btn-fuga)').forEach(b => b.classList.remove('active'));
  const idMap = {
    general: 'btn-general', plant: 'btn-plant', network: 'btn-network',
    collector: 'btn-collector', north: 'btn-north', south: 'btn-south',
    mainhouse: 'btn-mainhouse', top: 'btn-top', beach: 'btn-beach',
  };
  const btn = document.getElementById(idMap[name]);
  if (btn) btn.classList.add('active');
}

function _onKeyDown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const map = { g: 'general', p: 'plant', n: 'network', t: 'top', c: 'collector', b: 'beach', r: null };
  const key = e.key.toLowerCase();
  if (key in map) {
    if (key === 'r') restoreView();
    else if (map[key]) goToView(map[key]);
  }
}

function _easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

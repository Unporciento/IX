import * as THREE from 'three';
import { goToView } from './controls.js';

/* ═══════════════════════════════════════════════════════════════════════════
   leaks.js — Sistema de simulación de fugas con escena de emergencia 3D
   ► Zonas de exclusión HARDCODEADAS con las posiciones exactas del scene.js
   ► Camioneta y trabajadores NUNCA entran en edificios
   ► Contador de litros perdidos en tiempo real
   ═══════════════════════════════════════════════════════════════════════════ */

let scene;
let leakMarker, puddle, rippleRing;
let isLeakActive  = false;
let alertTimeout, autoResolveTimeout;
let baseLeakSize  = 1;
let activeLeakPos = null;
let leakStartTime = null;
let totalLeaks    = 0;
let leakHistory   = [];
let litersLost    = 0;
let litersInterval = null;

let emergencyGroup = null;
let particles      = [];
let steamPuffs     = [];
let workers        = [];
let warningLight   = null;
let extraRipples   = [];
let brokenPipe     = null;

// ─── Zonas de exclusión (AABBs de todos los edificios) ───────────────────────
// Formato: { minX, maxX, minZ, maxZ }  — margen de 1.5 unidades extra
const EXCLUSION_ZONES = [
  // Casa principal: px=0 pz=-16 sw=10 sd=8 → X:[-5,5] Z:[-20,-12] + margen
  { minX: -6.5, maxX:  6.5, minZ: -21.5, maxZ: -10.5 },
  // Casitas fila norte: pz=4 sd=4 → Z:[2,6] + margen
  { minX: -13.0, maxX: -8.5,  minZ:  0.5, maxZ:  7.5 },  // px=-10
  { minX:  -5.8, maxX: -0.3,  minZ:  0.5, maxZ:  7.5 },  // px=-3
  { minX:   3.0, maxX:  8.5,  minZ:  0.5, maxZ:  7.5 },  // px=5
  // Casitas fila sur: pz=13 sd=4 → Z:[11,15] + margen
  { minX: -13.0, maxX: -8.5,  minZ:  9.5, maxZ: 16.5 },  // px=-10
  { minX:  -5.8, maxX: -0.3,  minZ:  9.5, maxZ: 16.5 },  // px=-3
  { minX:   3.0, maxX:  8.5,  minZ:  9.5, maxZ: 16.5 },  // px=5
  // Planta desalinizadora: px=12 pz=-8 sw=9 sd=7 → X:[7.5,16.5] Z:[-11.5,-4.5] + margen
  { minX:   6.0, maxX: 18.0,  minZ: -13.0, maxZ: -3.0 },
];

// ─── Verifica si una posición world cae dentro de algún edificio ─────────────
function _isInsideBuilding(wx, wz) {
  return EXCLUSION_ZONES.some(z =>
    wx >= z.minX && wx <= z.maxX && wz >= z.minZ && wz <= z.maxZ
  );
}

// ─── Encuentra la dirección segura para cada punto de fuga ───────────────────
// Prueba 8 ángulos de 45° y elige el que lleva más lejos de edificios
function _safeDirFor(pos) {
  const candidates = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    let score = 0;
    // Calcula cuánto espacio libre hay a 3, 5 y 7 unidades en esta dirección
    [3, 5, 7].forEach(dist => {
      if (!_isInsideBuilding(pos.x + dx * dist, pos.z + dz * dist)) score += dist;
    });
    candidates.push({ dx, dz, score });
  }
  // Elige el ángulo con mayor score (más espacio libre)
  const best = candidates.reduce((a, b) => a.score > b.score ? a : b);
  return new THREE.Vector3(best.dx, 0, best.dz);
}

// ─── Puntos de fuga ───────────────────────────────────────────────────────────
// La dirección safe se calcula dinámicamente en _buildEmergencyScene
const PIPE_POINTS = [
  new THREE.Vector3(-7,  0.28, -6),
  new THREE.Vector3( 5,  0.28, -6),
  new THREE.Vector3( 0,  0.28, -6),
  new THREE.Vector3(-10, 0.28,  0),
  new THREE.Vector3( -3, 0.28,  0),
  new THREE.Vector3(  5, 0.28,  0),
  new THREE.Vector3(-10, 0.28,  8),
  new THREE.Vector3( -3, 0.28,  8),
  new THREE.Vector3(  0, 0.28, -16),
];

// ─── Tipos de fuga ────────────────────────────────────────────────────────────
const LEAK_TYPES = [
  { label: 'Goteo Leve',     size: 0.5, color: 0xffaa00, resolveMs: 15000, particles:  8, steam:  3, pipeColor: 0x336699, litersPerSec:  2 },
  { label: 'Fisura Media',   size: 1.0, color: 0xff5500, resolveMs: 10000, particles: 20, steam:  6, pipeColor: 0x225588, litersPerSec:  8 },
  { label: 'Rotura Crítica', size: 1.5, color: 0xff0000, resolveMs:  6000, particles: 35, steam: 10, pipeColor: 0x113366, litersPerSec: 22 },
];
let activeLitersPerSec = 0;

// ─── Materiales ───────────────────────────────────────────────────────────────
const MAT = {};
function _buildMaterials() {
  const m = (color, opts = {}) => new THREE.MeshBasicMaterial({ color, ...opts });
  MAT.alert      = m(0xff0000, { transparent: true, opacity: 0.85 });
  MAT.puddle     = m(0x1a4a66, { transparent: true, opacity: 0.65 });
  MAT.ripple     = m(0x55aadd, { transparent: true, opacity: 0.40, side: THREE.DoubleSide });
  MAT.wetFloor   = m(0x112233, { transparent: true, opacity: 0.50 });
  MAT.pipeDark   = m(0x0a1f3a);
  MAT.crackEdge  = m(0x001133);
  MAT.rust       = m(0x663322);
  MAT.dirt       = m(0x7a5c3a);
  MAT.dirtDark   = m(0x5a3e22);
  MAT.asphaltCrk = m(0x222222);
  MAT.coneOrg    = m(0xff6600);
  MAT.coneWht    = m(0xffffff);
  MAT.coneBase   = m(0x1a1a1a);
  MAT.barrierRed = m(0xdd2200, { transparent: true, opacity: 0.80 });
  MAT.barrierYel = m(0xffdd00);
  MAT.helmet     = m(0xffcc00);
  MAT.helmetRed  = m(0xdd2200);
  MAT.skin       = m(0xf0c89a);
  MAT.vest       = m(0xff8800);
  MAT.vestBlue   = m(0x2244aa);
  MAT.pants      = m(0x334466);
  MAT.boots      = m(0x221100);
  MAT.tool       = m(0x888888);
  MAT.toolDark   = m(0x555555);
  MAT.truckOrange= m(0xdd8800);
  MAT.truckBlue  = m(0x2255aa);
  MAT.truckCabO  = m(0xeeaa00);
  MAT.truckCabB  = m(0x3366cc);
  MAT.truckWheel = m(0x222222);
  MAT.glass      = m(0x99ccee, { transparent: true, opacity: 0.60 });
  MAT.lightYel   = m(0xffff88);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
export function initLeaks(s) {
  scene = s;
  _buildMaterials();

  leakMarker = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 24), MAT.alert);
  leakMarker.visible = false;
  scene.add(leakMarker);

  puddle = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), MAT.puddle.clone());
  puddle.rotation.x = -Math.PI / 2;
  puddle.visible = false;
  scene.add(puddle);

  rippleRing = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.1, 32), MAT.ripple.clone());
  rippleRing.rotation.x = -Math.PI / 2;
  rippleRing.visible = false;
  scene.add(rippleRing);

  _injectHistoryPanel();
  _injectTimerBadge();
  _injectLitersCounter();
}

// ─── Simular / detener fuga ───────────────────────────────────────────────────
export function simulateLeak() {
  isLeakActive = !isLeakActive;

  const htmlAlert    = document.getElementById('alerta-fuga');
  const sonidoAlerta = document.getElementById('sonido-alerta');
  const btnFuga      = document.getElementById('btn-fuga');

  if (isLeakActive) {
    const pos  = PIPE_POINTS[Math.floor(Math.random() * PIPE_POINTS.length)];
    const type = LEAK_TYPES[Math.floor(Math.random() * LEAK_TYPES.length)];
    const safe = _safeDirFor(pos);  // ← dirección calculada dinámicamente

    activeLeakPos       = pos;
    baseLeakSize        = type.size;
    activeLitersPerSec  = type.litersPerSec;
    leakStartTime       = performance.now();
    totalLeaks++;
    litersLost = 0;
    _startLitersCounter(type.litersPerSec);

    MAT.alert.color.setHex(type.color);
    leakMarker.scale.setScalar(baseLeakSize);
    leakMarker.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
    leakMarker.visible = true;

    puddle.material.color.setHex(0x1a4a66);
    puddle.scale.setScalar(0.05);
    puddle.position.copy(pos).add(new THREE.Vector3(0, -0.26, 0));
    puddle.visible = true;

    rippleRing.scale.setScalar(0.1);
    rippleRing.position.copy(pos).add(new THREE.Vector3(0, -0.25, 0));
    rippleRing.visible = true;

    _buildEmergencyScene(pos, safe, type);

    htmlAlert.classList.remove('esquina', 'resuelto');
    htmlAlert.style.opacity = '';
    htmlAlert.style.display = 'block';
    document.getElementById('tipo-fuga').innerText =
      `${type.label} · Sector (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})`;

    sonidoAlerta.play().catch(() => {});

    clearTimeout(alertTimeout);
    alertTimeout = setTimeout(() => htmlAlert.classList.add('esquina'), 2500);
    clearTimeout(autoResolveTimeout);
    autoResolveTimeout = setTimeout(() => { if (isLeakActive) _autoResolve(); }, type.resolveMs);

    btnFuga.classList.add('fuga-activa');
    btnFuga.innerHTML = '<span class="cam-icon">🛑</span> Detener Simulación';

    // Cámara desde el lado seguro para ver la escena
    const camDir = safe.clone().multiplyScalar(9).add(new THREE.Vector3(0, 7, 0));
    goToView('custom', pos, pos.clone().add(camDir));
    _startTimer();

  } else {
    _deactivateLeak(false);
  }
}

// ─── Utilidad: rotar Vector3 en Y ─────────────────────────────────────────────
function _rotateY(v, angle) {
  return new THREE.Vector3(
     v.x * Math.cos(angle) + v.z * Math.sin(angle), 0,
    -v.x * Math.sin(angle) + v.z * Math.cos(angle)
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ESCENA DE EMERGENCIA
// ═══════════════════════════════════════════════════════════════════════════════
function _buildEmergencyScene(pos, safe, type) {
  _destroyEmergencyScene();

  emergencyGroup = new THREE.Group();
  emergencyGroup.position.copy(pos);
  scene.add(emergencyGroup);

  const perp = new THREE.Vector3(-safe.z, 0, safe.x).normalize();

  _makeExcavationPit(type);
  _makeBrokenPipe(type);

  const wet = new THREE.Mesh(
    new THREE.PlaneGeometry(7 + type.size * 2, 6 + type.size * 2),
    MAT.wetFloor.clone()
  );
  wet.rotation.x = -Math.PI / 2;
  wet.position.y = -0.26;
  emergencyGroup.add(wet);

  // Conos en esquinas del perímetro (orientados con safe+perp)
  const R = 3.2;
  [
    safe.clone().multiplyScalar( R).add(perp.clone().multiplyScalar( R)),
    safe.clone().multiplyScalar( R).add(perp.clone().multiplyScalar(-R)),
    safe.clone().multiplyScalar(-R).add(perp.clone().multiplyScalar( R)),
    safe.clone().multiplyScalar(-R).add(perp.clone().multiplyScalar(-R)),
  ].forEach(offset => {
    const cone = _makeCone();
    cone.position.set(offset.x, 0, offset.z);
    cone.rotation.y = Math.random() * 0.5 - 0.25;
    emergencyGroup.add(cone);
  });

  _makeBarrier(emergencyGroup, safe, perp, R);

  // Camioneta en dirección segura
  const truck = _makeTruck(false);
  const truckPos = safe.clone().multiplyScalar(5.5).add(perp.clone().multiplyScalar(1.2));
  truck.position.set(truckPos.x, 0, truckPos.z);
  truck.rotation.y = Math.atan2(-safe.x, -safe.z) + (Math.random() * 0.3 - 0.15);
  emergencyGroup.add(truck);

  if (type.size >= 1.5) {
    const truck2 = _makeTruck(true);
    const t2pos  = safe.clone().multiplyScalar(6.0).add(perp.clone().multiplyScalar(-2.2));
    truck2.position.set(t2pos.x, 0, t2pos.z);
    truck2.rotation.y = Math.atan2(-safe.x, -safe.z) + 0.5;
    emergencyGroup.add(truck2);
  }

  _spawnWaterParticles(type.particles);
  _spawnSteam(type.steam);

  extraRipples = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.6, 24),
      new THREE.MeshBasicMaterial({ color: 0x55aadd, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.24;
    emergencyGroup.add(ring);
    extraRipples.push({ mesh: ring, offset: i * 1.1 });
  }

  warningLight = new THREE.PointLight(0xff2200, 0, 10);
  warningLight.position.set(0, 2.5, 0);
  emergencyGroup.add(warningLight);

  // Trabajadores en arco del lado seguro
  workers = [];
  const workerCount = type.size < 1 ? 2 : 3;
  for (let i = 0; i < workerCount; i++) {
    const isForeman = (i === 0 && type.size >= 1.5);
    const w = _makeWorker(i, isForeman);
    const arcAngle = (workerCount === 1 ? 0 : (i / (workerCount - 1) - 0.5)) * (Math.PI * 0.65);
    const wDir     = _rotateY(safe.clone(), arcAngle);
    const radius   = 1.7 + Math.random() * 0.5;
    w.group.position.set(wDir.x * radius, 0, wDir.z * radius);
    w.group.lookAt(new THREE.Vector3(0, 0.5, 0));
    w.group.rotation.x += 0.18;
    emergencyGroup.add(w.group);
    workers.push({ ...w, phase: i * 1.3 });
  }
}

// ─── Hoyo de excavación ───────────────────────────────────────────────────────
function _makeExcavationPit(type) {
  const w = 1.4 + type.size * 0.4, d = 0.9 + type.size * 0.2, depth = 0.55;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), MAT.dirtDark.clone());
  floor.rotation.x = -Math.PI / 2; floor.position.y = -depth;
  emergencyGroup.add(floor);
  [
    { pos: [0,-depth/2,-d/2], rot:[0,0,0],           size:[w,depth] },
    { pos: [0,-depth/2, d/2], rot:[0,Math.PI,0],     size:[w,depth] },
    { pos: [-w/2,-depth/2,0], rot:[0, Math.PI/2,0],  size:[d,depth] },
    { pos: [ w/2,-depth/2,0], rot:[0,-Math.PI/2,0],  size:[d,depth] },
  ].forEach(({ pos, rot, size }) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(...size), MAT.dirt.clone());
    wall.position.set(...pos); wall.rotation.set(...rot);
    emergencyGroup.add(wall);
  });
  [[-w/2-0.5,0.10,0.0],[w/2+0.5,0.05,0.2]].forEach(([px,py,pz]) => {
    const pile = new THREE.Mesh(new THREE.ConeGeometry(0.5,0.25,7), MAT.dirt.clone());
    pile.position.set(px,py,pz); pile.rotation.y = Math.random()*Math.PI;
    emergencyGroup.add(pile);
  });
  [
    { pos:[0,0,-d/2-0.07], size:[w+0.3,0.14] },
    { pos:[0,0, d/2+0.07], size:[w+0.3,0.14] },
    { pos:[-w/2-0.07,0,0], size:[0.14,d+0.1] },
    { pos:[ w/2+0.07,0,0], size:[0.14,d+0.1] },
  ].forEach(({ pos, size }) => {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(...size), MAT.asphaltCrk.clone());
    edge.rotation.x = -Math.PI/2; edge.position.set(...pos);
    emergencyGroup.add(edge);
  });
}

// ─── Tubo roto ────────────────────────────────────────────────────────────────
function _makeBrokenPipe(type) {
  const g = new THREE.Group(); g.position.y = -0.45;
  const r = 0.18, pM = new THREE.MeshBasicMaterial({ color: type.pipeColor }), dM = MAT.pipeDark.clone();
  const addCyl = (mat, x, y, z) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r,r,1.2,12), mat);
    c.rotation.z = Math.PI/2; c.position.set(x,y,z); g.add(c);
    const ci = new THREE.Mesh(new THREE.CylinderGeometry(r*0.7,r*0.7,1.22,10), dM.clone());
    ci.rotation.z = Math.PI/2; ci.position.set(x,y,z); g.add(ci);
  };
  addCyl(pM, -0.70, 0.00, 0.00);
  addCyl(pM.clone(), 0.70, 0.06, 0.05);
  [[-0.12,0,0],[0.15,0.06,0.05]].forEach(([x,y,z]) => {
    const b = new THREE.Mesh(new THREE.TorusGeometry(r,0.035,6,12), MAT.crackEdge.clone());
    b.rotation.y = Math.PI/2; b.position.set(x,y,z); g.add(b);
  });
  const rust = new THREE.Mesh(new THREE.SphereGeometry(0.12,8,6), MAT.rust.clone());
  rust.scale.set(1,0.3,1); rust.position.set(0,0.18,0); g.add(rust);
  const jet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03,0.08,0.6,8),
    new THREE.MeshBasicMaterial({ color:0x55aaee, transparent:true, opacity:0.70 })
  );
  jet.position.set(0,0.35,0); jet.name='waterJet'; g.add(jet);
  emergencyGroup.add(g);
  brokenPipe = { group:g, jet };
}

// ─── Cono ─────────────────────────────────────────────────────────────────────
function _makeCone() {
  const g = new THREE.Group();
  const a = (geo, mat, py) => { const m = new THREE.Mesh(geo,mat); m.position.y=py; g.add(m); };
  a(new THREE.CylinderGeometry(0.24,0.27,0.06,8), MAT.coneBase, 0.03);
  a(new THREE.CylinderGeometry(0.05,0.21,0.36,8), MAT.coneOrg,  0.24);
  a(new THREE.CylinderGeometry(0.055,0.055,0.06,8), MAT.coneWht, 0.40);
  a(new THREE.CylinderGeometry(0.018,0.055,0.24,8), MAT.coneOrg, 0.56);
  a(new THREE.CylinderGeometry(0.006,0.018,0.08,8), MAT.coneWht, 0.72);
  return g;
}

// ─── Barrera ──────────────────────────────────────────────────────────────────
function _makeBarrier(parent, safe, perp, r) {
  const corners = [
    safe.clone().multiplyScalar( r).add(perp.clone().multiplyScalar( r)),
    safe.clone().multiplyScalar( r).add(perp.clone().multiplyScalar(-r)),
    safe.clone().multiplyScalar(-r).add(perp.clone().multiplyScalar(-r)),
    safe.clone().multiplyScalar(-r).add(perp.clone().multiplyScalar( r)),
  ].map(v => { v.y=0; return v; });
  corners.forEach(c => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,1.1,6), MAT.barrierRed.clone());
    pole.position.copy(c).add(new THREE.Vector3(0,0.55,0)); parent.add(pole);
  });
  [[0,1],[1,2],[2,3],[3,0]].forEach(([a,b]) => {
    [0.5,0.75].forEach(h => {
      const s = corners[a].clone().setY(h), e = corners[b].clone().setY(h);
      const mid = s.clone().add(e).multiplyScalar(0.5), len = s.distanceTo(e);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,len,4), MAT.barrierYel.clone());
      band.position.copy(mid);
      band.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), e.clone().sub(s).normalize());
      parent.add(band);
    });
  });
}

// ─── Camioneta ────────────────────────────────────────────────────────────────
function _makeTruck(isMaint = false) {
  const g = new THREE.Group();
  const body = isMaint ? MAT.truckBlue  : MAT.truckOrange;
  const cab  = isMaint ? MAT.truckCabB  : MAT.truckCabO;
  const add = (geo,mat,px,py,pz,rx=0,ry=0,rz=0) => {
    const m=new THREE.Mesh(geo,mat); m.position.set(px,py,pz); m.rotation.set(rx,ry,rz); g.add(m);
  };
  add(new THREE.BoxGeometry(1.8,0.70,1.00), body,  0,   0.65, 0);
  add(new THREE.BoxGeometry(1.0,0.65,0.95), cab,   0.70,1.05, 0);
  add(new THREE.BoxGeometry(0.06,0.45,0.75), MAT.glass, 1.18,1.05, 0);
  [0.35,-0.35].forEach(z => add(new THREE.BoxGeometry(0.06,0.12,0.18), MAT.lightYel, 1.22,0.62,z));
  [[0.55,0.28,0.58],[-0.55,0.28,0.58],[0.55,0.28,-0.58],[-0.55,0.28,-0.58]].forEach(([x,y,z]) => {
    add(new THREE.CylinderGeometry(0.28,0.28,0.22,10), MAT.truckWheel, x,y,z, 0,0,Math.PI/2);
  });
  add(new THREE.BoxGeometry(0.8,0.12,0.15), MAT.barrierYel, 0.70,1.42,0);
  return g;
}

// ─── Trabajador ───────────────────────────────────────────────────────────────
function _makeWorker(idx, isForeman=false) {
  const g = new THREE.Group();
  const add = (geo,mat,px,py,pz,rx=0,ry=0,rz=0) => {
    const m=new THREE.Mesh(geo,mat); m.position.set(px,py,pz); m.rotation.set(rx,ry,rz); g.add(m); return m;
  };
  const hMat = isForeman ? MAT.helmetRed : MAT.helmet;
  const vMat = isForeman ? MAT.helmetRed : MAT.vest;
  [-0.09,0.09].forEach(x => add(new THREE.BoxGeometry(0.12,0.10,0.16),MAT.boots,x,0.05,0.02));
  add(new THREE.BoxGeometry(0.12,0.38,0.13),MAT.pants,-0.09,0.29,0);
  add(new THREE.BoxGeometry(0.12,0.38,0.13),MAT.pants, 0.09,0.29,0);
  add(new THREE.BoxGeometry(0.30,0.36,0.18),MAT.vestBlue,0,0.67,0);
  add(new THREE.BoxGeometry(0.32,0.34,0.10),vMat,0,0.67,0.06);
  const armL = add(new THREE.BoxGeometry(0.10,0.30,0.11),MAT.vestBlue,-0.22,0.61,0, 0,0, 0.55);
  const armR = add(new THREE.BoxGeometry(0.10,0.30,0.11),MAT.vestBlue, 0.22,0.61,0, 0,0,-0.55);
  add(new THREE.BoxGeometry(0.09,0.09,0.09),MAT.skin,-0.28,0.46,0);
  add(new THREE.BoxGeometry(0.09,0.09,0.09),MAT.skin, 0.28,0.46,0);
  add(new THREE.BoxGeometry(0.22,0.22,0.20),MAT.skin,0,1.01,0);
  add(new THREE.CylinderGeometry(0.145,0.125,0.13,8),hMat,0,1.17,0);
  add(new THREE.CylinderGeometry(0.185,0.185,0.035,8),hMat,0,1.10,0);
  if (idx===0) {
    add(new THREE.BoxGeometry(0.18,0.07,0.07),MAT.tool, 0.36,0.48,0.08,0,0,-0.3);
    add(new THREE.BoxGeometry(0.06,0.38,0.06),MAT.tool, 0.32,0.48,0.08,0,0,-0.3);
  } else if (idx===1) {
    add(new THREE.BoxGeometry(0.06,0.60,0.06),MAT.toolDark,0.32,0.55,0.10,0,0,-0.25);
    add(new THREE.BoxGeometry(0.16,0.20,0.04),MAT.tool,    0.36,0.26,0.10,0,0,-0.25);
  } else {
    add(new THREE.BoxGeometry(0.14,0.20,0.03),MAT.toolDark,-0.30,0.62,0.05,0,0,0.4);
  }
  return { group:g, armL, armR };
}

// ─── Partículas ───────────────────────────────────────────────────────────────
function _spawnWaterParticles(count) {
  particles = [];
  for (let i=0; i<count; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.035+Math.random()*0.055,5,4),
      new THREE.MeshBasicMaterial({color:0x44aaee,transparent:true,opacity:0.75+Math.random()*0.2})
    );
    mesh.position.set((Math.random()-0.5)*0.35,Math.random()*1.2,(Math.random()-0.5)*0.35);
    mesh._vy=0.025+Math.random()*0.04; mesh._vx=(Math.random()-0.5)*0.022;
    mesh._vz=(Math.random()-0.5)*0.022; mesh._g=0.003+Math.random()*0.003;
    emergencyGroup.add(mesh); particles.push(mesh);
  }
}

// ─── Vapor ────────────────────────────────────────────────────────────────────
function _spawnSteam(count) {
  steamPuffs = [];
  for (let i=0; i<count; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08+Math.random()*0.12,6,5),
      new THREE.MeshBasicMaterial({color:0xaaccdd,transparent:true,opacity:0})
    );
    mesh.position.set((Math.random()-0.5)*0.5,-0.2+Math.random()*0.3,(Math.random()-0.5)*0.5);
    mesh._vy=0.005+Math.random()*0.008; mesh._life=Math.random(); mesh._maxOp=0.15+Math.random()*0.15;
    emergencyGroup.add(mesh); steamPuffs.push(mesh);
  }
}

// ─── Desactivación ────────────────────────────────────────────────────────────
function _deactivateLeak(wasAutoResolved) {
  isLeakActive = false;
  const htmlAlert    = document.getElementById('alerta-fuga');
  const sonidoAlerta = document.getElementById('sonido-alerta');
  const btnFuga      = document.getElementById('btn-fuga');

  if (leakStartTime !== null) {
    const duration = ((performance.now()-leakStartTime)/1000).toFixed(1);
    const tipo     = document.getElementById('tipo-fuga')?.innerText ?? '—';
    leakHistory.push({ tipo, duration, liters: Math.round(litersLost), auto: wasAutoResolved });
    _updateHistoryPanel();
    leakStartTime = null;
  }

  leakMarker.visible = false; puddle.visible = false; rippleRing.visible = false;
  activeLeakPos = null;
  _stopLitersCounter();
  _destroyEmergencyScene();
  clearTimeout(alertTimeout);
  htmlAlert.classList.remove('esquina');

  if (wasAutoResolved) {
    htmlAlert.classList.add('resuelto');
    setTimeout(() => {
      htmlAlert.style.opacity='0';
      setTimeout(() => { htmlAlert.style.display='none'; htmlAlert.style.opacity=''; htmlAlert.classList.remove('resuelto'); },400);
    },1800);
  } else {
    htmlAlert.style.opacity='0';
    setTimeout(() => { htmlAlert.style.display='none'; htmlAlert.style.opacity=''; },400);
  }
  sonidoAlerta.pause(); sonidoAlerta.currentTime=0;
  clearTimeout(autoResolveTimeout);
  btnFuga.classList.remove('fuga-activa');
  btnFuga.innerHTML='<span class="cam-icon">🚨</span> Simular Fuga';
  _stopTimer();
  goToView('general');
}

function _destroyEmergencyScene() {
  if (!emergencyGroup) return;
  emergencyGroup.traverse(obj => {
    if (obj.isMesh) {
      obj.geometry.dispose();
      Array.isArray(obj.material) ? obj.material.forEach(m=>m.dispose()) : obj.material?.dispose();
    }
  });
  scene.remove(emergencyGroup);
  emergencyGroup=null; particles=[]; steamPuffs=[]; workers=[];
  warningLight=null; extraRipples=[]; brokenPipe=null;
}

function _autoResolve() {
  const h = document.getElementById('alerta-fuga');
  h.querySelector('h3').textContent='✅ Fuga Controlada';
  h.querySelector('p').textContent='Sistema cerrado automáticamente.';
  _deactivateLeak(true);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LOOP
// ═══════════════════════════════════════════════════════════════════════════════
export function updateLeaks() {
  if (!isLeakActive) return;
  const time = performance.now()*0.005;

  if (leakMarker?.visible) leakMarker.scale.setScalar(baseLeakSize+Math.sin(time)*0.07);
  if (puddle?.visible) {
    const maxS=baseLeakSize*2.2;
    if (puddle.scale.x<maxS) puddle.scale.setScalar(Math.min(puddle.scale.x+0.001,maxS));
  }
  if (rippleRing?.visible) {
    const t=(time%3)/3;
    rippleRing.scale.setScalar(0.4+t*baseLeakSize*3.5);
    rippleRing.material.opacity=0.5*(1-t);
  }
  if (!emergencyGroup) return;
  if (warningLight) warningLight.intensity=(Math.sin(time*5)*0.5+0.5)*3*baseLeakSize;
  extraRipples.forEach(r => {
    const t=((time+r.offset)%3)/3;
    r.mesh.scale.setScalar(0.2+t*baseLeakSize*2.5);
    r.mesh.material.opacity=0.25*(1-t);
  });
  if (brokenPipe?.jet) {
    const j=brokenPipe.jet;
    j.scale.y=0.8+Math.sin(time*6)*0.2;
    j.position.y=0.3+Math.sin(time*4)*0.05;
    j.material.opacity=0.5+Math.sin(time*7)*0.2;
  }
  particles.forEach(p => {
    p._vy-=p._g; p.position.y+=p._vy; p.position.x+=p._vx; p.position.z+=p._vz;
    if (p.position.y<-0.44) {
      p.position.set((Math.random()-0.5)*0.35,-0.42+Math.random()*0.1,(Math.random()-0.5)*0.35);
      p._vy=0.025+Math.random()*0.04; p._vx=(Math.random()-0.5)*0.022; p._vz=(Math.random()-0.5)*0.022;
    }
  });
  steamPuffs.forEach(s => {
    s._life+=0.008; s.position.y+=s._vy;
    const ph=s._life%1;
    s.material.opacity=ph<0.5?ph*2*s._maxOp:(1-ph)*2*s._maxOp;
    s.scale.setScalar(0.6+ph*1.4);
    if (s.position.y>1.5) s.position.set((Math.random()-0.5)*0.5,-0.2,(Math.random()-0.5)*0.5);
  });
  workers.forEach(w => {
    const swing=Math.sin(time*2.8+w.phase)*0.3;
    if (w.armL) w.armL.rotation.z= 0.55+swing;
    if (w.armR) w.armR.rotation.z=-0.55-swing;
    w.group.rotation.z=Math.sin(time*1.2+w.phase)*0.04;
  });
}

export function getLeakState() {
  return { isActive:isLeakActive, position:activeLeakPos, totalLeaks, history:[...leakHistory] };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  UI — historial + timer + litros
// ═══════════════════════════════════════════════════════════════════════════════
function _injectHistoryPanel() {
  const panel = document.createElement('div');
  panel.id = 'leak-history-panel';
  panel.innerHTML = `
    <div class="lh-header">
      <span>📋 Registro de Fugas</span>
      <span id="lh-count">0 eventos</span>
    </div>
    <ul id="lh-list"><li class="lh-empty">Sin eventos en esta sesión.</li></ul>`;
  document.querySelector('.canvas-wrap')?.appendChild(panel);
}

function _updateHistoryPanel() {
  const list=document.getElementById('lh-list'), count=document.getElementById('lh-count');
  if (!list) return;
  count.textContent=`${leakHistory.length} evento${leakHistory.length!==1?'s':''}`;
  list.innerHTML=leakHistory.slice().reverse().map((e,i)=>`
    <li class="lh-item ${e.auto?'auto':'manual'}">
      <span class="lh-idx">#${leakHistory.length-i}</span>
      <span class="lh-tipo">${e.tipo}</span>
      <span class="lh-dur">${e.duration}s · ${e.liters}L · ${e.auto?'⚙️ auto':'👤 manual'}</span>
    </li>`).join('');
}

// ─── Contador de litros ───────────────────────────────────────────────────────
function _injectLitersCounter() {
  const el = document.createElement('div');
  el.id = 'liters-counter';
  el.style.display = 'none';
  el.innerHTML = `<span class="lc-label">💧 Litros perdidos</span><span id="lc-value">0 L</span>`;
  document.querySelector('.canvas-wrap')?.appendChild(el);
}

function _startLitersCounter(lps) {
  litersLost = 0;
  const el = document.getElementById('liters-counter');
  const val = document.getElementById('lc-value');
  if (el) el.style.display = 'flex';
  clearInterval(litersInterval);
  litersInterval = setInterval(() => {
    litersLost += lps / 10;
    if (val) val.textContent = litersLost < 1000
      ? `${litersLost.toFixed(1)} L`
      : `${(litersLost/1000).toFixed(2)} m³`;
  }, 100);
}

function _stopLitersCounter() {
  clearInterval(litersInterval);
  const el = document.getElementById('liters-counter');
  if (el) el.style.display = 'none';
}

// ─── Timer ────────────────────────────────────────────────────────────────────
let _timerInterval = null;
function _injectTimerBadge() {
  const badge=document.createElement('div'); badge.id='leak-timer-badge';
  badge.style.display='none'; badge.textContent='00:00';
  document.querySelector('.canvas-wrap')?.appendChild(badge);
}
function _startTimer() {
  const badge=document.getElementById('leak-timer-badge');
  if (!badge) return; badge.style.display='block'; let elapsed=0; clearInterval(_timerInterval);
  _timerInterval=setInterval(()=>{ elapsed++;
    badge.textContent=`⏱ ${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`;
  },1000);
}
function _stopTimer() {
  clearInterval(_timerInterval);
  const badge=document.getElementById('leak-timer-badge');
  if (badge) badge.style.display='none';
}

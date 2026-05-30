import * as THREE from 'three';
import { goToView } from './controls.js';

/* ═══════════════════════════════════════════════════════════════════════════
   leaks.js v3.0 — Sistema de Emergencia Hídrica
   ► 3 fases dramáticas: Detección → Escalada → Resolución
   ► Chorro físico con partículas de salpicadura
   ► Trabajadores con animación de caminata hacia la fuga
   ► Sirena giratoria + luz estroboscópica en camioneta
   ► Panel de emergencia con cuenta regresiva y severidad visual
   ► Ondas de choque al activar una Rotura Crítica
   ► Grieta en el asfalto animada según gravedad
   ► Estadísticas de sesión en tiempo real
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Estado global ─────────────────────────────────────────────────────────────
let scene;
let leakMarker, puddle, rippleRing;
let isLeakActive   = false;
let alertTimeout, autoResolveTimeout;
let baseLeakSize   = 1;
let activeLeakPos  = null;
let leakStartTime  = null;
let totalLeaks     = 0;
let totalLitersEver = 0;
let leakHistory    = [];
let litersLost     = 0;
let litersInterval = null;
let activeType     = null;

// Fase de emergencia: 0=detección, 1=escalada, 2=crítico
let leakPhase      = 0;
let phaseTimer     = 0;

let emergencyGroup = null;
let particles      = [];
let splashParticles = [];
let steamPuffs     = [];
let workers        = [];
let warningLight   = null;
let strobLight     = null;
let extraRipples   = [];
let brokenPipe     = null;
let sirenMesh      = null;
let crackMeshes    = [];
let shockwaveRings = [];

// ─── Zonas de exclusión ────────────────────────────────────────────────────────
const EXCLUSION_ZONES = [
  { minX: -6.5,  maxX:  6.5,  minZ: -21.5, maxZ: -10.5 },
  { minX: -13.0, maxX: -8.5,  minZ:   0.5, maxZ:   7.5 },
  { minX:  -5.8, maxX: -0.3,  minZ:   0.5, maxZ:   7.5 },
  { minX:   3.0, maxX:  8.5,  minZ:   0.5, maxZ:   7.5 },
  { minX: -13.0, maxX: -8.5,  minZ:   9.5, maxZ:  16.5 },
  { minX:  -5.8, maxX: -0.3,  minZ:   9.5, maxZ:  16.5 },
  { minX:   3.0, maxX:  8.5,  minZ:   9.5, maxZ:  16.5 },
  { minX:   6.0, maxX: 18.0,  minZ: -13.0, maxZ:  -3.0 },
];

function _isInsideBuilding(wx, wz) {
  return EXCLUSION_ZONES.some(z =>
    wx >= z.minX && wx <= z.maxX && wz >= z.minZ && wz <= z.maxZ
  );
}

function _safeDirFor(pos) {
  const candidates = [];
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    let score = 0;
    [2, 4, 6, 8].forEach(dist => {
      if (!_isInsideBuilding(pos.x + dx * dist, pos.z + dz * dist)) score += dist;
    });
    candidates.push({ dx, dz, score });
  }
  const best = candidates.reduce((a, b) => a.score > b.score ? a : b);
  return new THREE.Vector3(best.dx, 0, best.dz);
}

// ─── Puntos de fuga ────────────────────────────────────────────────────────────
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

// ─── Tipos de fuga ─────────────────────────────────────────────────────────────
const LEAK_TYPES = [
  {
    label: 'Goteo Leve', size: 0.5, color: 0xffaa00,
    resolveMs: 18000, particles: 10, splash: 6, steam: 4,
    pipeColor: 0x336699, litersPerSec: 2,
    alertBg: 'rgba(180,100,0,0.95)', cracks: 1,
    phases: ['🔍 Detectando origen…', '🔧 Equipo en camino', '✅ Reparación en curso'],
  },
  {
    label: 'Fisura Media', size: 1.0, color: 0xff5500,
    resolveMs: 12000, particles: 28, splash: 14, steam: 8,
    pipeColor: 0x225588, litersPerSec: 8,
    alertBg: 'rgba(200,60,0,0.95)', cracks: 3,
    phases: ['⚠️ Presión cayendo…', '🚨 Unidades desplegadas', '🛠️ Conteniendo fuga'],
  },
  {
    label: 'Rotura Crítica', size: 1.6, color: 0xff0000,
    resolveMs: 8000, particles: 50, splash: 24, steam: 14,
    pipeColor: 0x113366, litersPerSec: 25,
    alertBg: 'rgba(180,0,0,0.98)', cracks: 6,
    phases: ['🆘 ROTURA CRÍTICA', '🔴 CORTE DE EMERGENCIA', '🚒 BRIGADA DESPLEGADA'],
  },
];

// ─── Materiales ────────────────────────────────────────────────────────────────
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
  MAT.asphaltCrk = m(0x111111);
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
  MAT.siren      = m(0xff2200);
  MAT.sirenB     = m(0x2244ff);
  MAT.shockwave  = m(0x55ccff, { transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  MAT.splash     = m(0x88ccff, { transparent: true, opacity: 0.8 });
  MAT.crack      = m(0x0a0a0a);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════════════════════
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

  _injectEmergencyPanel();
  _injectHistoryPanel();
  _injectTimerBadge();
  _injectLitersCounter();
  _injectSessionStats();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SIMULAR / DETENER
// ═══════════════════════════════════════════════════════════════════════════════
export function simulateLeak() {
  isLeakActive = !isLeakActive;

  const htmlAlert    = document.getElementById('alerta-fuga');
  const sonidoAlerta = document.getElementById('sonido-alerta');
  const btnFuga      = document.getElementById('btn-fuga');

  if (isLeakActive) {
    const pos  = PIPE_POINTS[Math.floor(Math.random() * PIPE_POINTS.length)];
    const type = LEAK_TYPES[Math.floor(Math.random() * LEAK_TYPES.length)];
    const safe = _safeDirFor(pos);

    activeLeakPos      = pos;
    activeType         = type;
    baseLeakSize       = type.size;
    leakStartTime      = performance.now();
    leakPhase          = 0;
    phaseTimer         = 0;
    totalLeaks++;
    litersLost = 0;

    _startLitersCounter(type.litersPerSec);
    _showEmergencyPanel(type, pos);

    // Bajar presión HUD
    window._pressureDrop = true;
    const dropAmt = type.size * 28;
    ['ph-bar-3','ph-bar-2'].forEach((id, i) => {
      const bar = document.getElementById(id);
      const val = document.getElementById(id.replace('bar','val'));
      const base = [61, 74][i];
      const drop = i === 0 ? dropAmt : dropAmt * 0.4;
      if (bar) { bar.style.width = Math.max(5, base - drop) + '%'; bar.style.background = '#dd3333'; }
      if (val) val.textContent = ((Math.max(5, base - drop)) / 10).toFixed(1) + ' bar ⚠️';
    });

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

    // Shockwave si es crítica
    if (type.size >= 1.5) _spawnShockwaves(pos);

    htmlAlert.classList.remove('esquina', 'resuelto');
    htmlAlert.style.opacity = '';
    htmlAlert.style.display = 'block';
    htmlAlert.style.background = type.alertBg;
    document.getElementById('tipo-fuga').innerText =
      `${type.label} · Sector (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})`;

    sonidoAlerta.play().catch(() => {});

    clearTimeout(alertTimeout);
    alertTimeout = setTimeout(() => htmlAlert.classList.add('esquina'), 3000);
    clearTimeout(autoResolveTimeout);
    autoResolveTimeout = setTimeout(() => { if (isLeakActive) _autoResolve(); }, type.resolveMs);

    btnFuga.classList.add('fuga-activa');
    btnFuga.innerHTML = '<span class="cam-icon">🛑</span> Detener Emergencia';

    const camDir = safe.clone().multiplyScalar(10).add(new THREE.Vector3(0, 8, 0));
    goToView('custom', pos, pos.clone().add(camDir));
    _startTimer();

  } else {
    _deactivateLeak(false);
  }
}

// ─── Shockwaves al romper tubería crítica ──────────────────────────────────────
function _spawnShockwaves(pos) {
  shockwaveRings = [];
  for (let i = 0; i < 4; i++) {
    setTimeout(() => {
      if (!isLeakActive) return;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.1, 0.3, 32),
        new THREE.MeshBasicMaterial({ color: 0x55ccff, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(pos).add(new THREE.Vector3(0, 0.05, 0));
      ring._born = performance.now();
      ring._maxR = 6 + i * 2;
      scene.add(ring);
      shockwaveRings.push(ring);
    }, i * 280);
  }
}

// ─── Utilidad ─────────────────────────────────────────────────────────────────
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
  _makeAsphaltCracks(type);

  // Charco con gradiente radial más grande
  const wet = new THREE.Mesh(
    new THREE.PlaneGeometry(8 + type.size * 3, 7 + type.size * 2.5),
    MAT.wetFloor.clone()
  );
  wet.rotation.x = -Math.PI / 2;
  wet.position.y = -0.25;
  emergencyGroup.add(wet);

  // Conos — más según severidad
  const R = 3.5 + type.size * 0.5;
  const coneCount = type.size < 0.8 ? 4 : type.size < 1.3 ? 6 : 8;
  for (let i = 0; i < coneCount; i++) {
    const angle = (i / coneCount) * Math.PI * 2;
    const cx = Math.cos(angle) * R, cz = Math.sin(angle) * R;
    const cone = _makeCone();
    cone.position.set(cx, 0, cz);
    cone.rotation.y = Math.random() * 0.5;
    emergencyGroup.add(cone);
  }

  _makeBarrier(emergencyGroup, safe, perp, R);

  // Camioneta principal con sirena giratoria
  const truck = _makeTruck(false, true);
  const truckPos = safe.clone().multiplyScalar(5.5).add(perp.clone().multiplyScalar(1.2));
  truck.position.set(truckPos.x, 0, truckPos.z);
  truck.rotation.y = Math.atan2(-safe.x, -safe.z) + (Math.random() * 0.3 - 0.15);
  emergencyGroup.add(truck);

  // Segunda camioneta para fisura/rotura
  if (type.size >= 1.0) {
    const truck2 = _makeTruck(true, false);
    const t2pos  = safe.clone().multiplyScalar(6.5).add(perp.clone().multiplyScalar(-2.5));
    truck2.position.set(t2pos.x, 0, t2pos.z);
    truck2.rotation.y = Math.atan2(-safe.x, -safe.z) + 0.5;
    emergencyGroup.add(truck2);
  }

  // Tercera camioneta para rotura crítica
  if (type.size >= 1.5) {
    const truck3 = _makeTruck(false, false);
    const t3pos  = safe.clone().multiplyScalar(-5.0).add(perp.clone().multiplyScalar(3.0));
    truck3.position.set(t3pos.x, 0, t3pos.z);
    truck3.rotation.y = Math.atan2(safe.x, safe.z) + 0.3;
    emergencyGroup.add(truck3);
  }

  _spawnWaterParticles(type.particles);
  _spawnSplashParticles(type.splash);
  _spawnSteam(type.steam);

  // Ondas concéntricas — más anillos
  extraRipples = [];
  const rippleCount = Math.floor(2 + type.size * 3);
  for (let i = 0; i < rippleCount; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.55, 28),
      new THREE.MeshBasicMaterial({ color: 0x55aadd, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.23;
    emergencyGroup.add(ring);
    extraRipples.push({ mesh: ring, offset: i * 0.9 });
  }

  // Luz de alerta roja pulsante
  warningLight = new THREE.PointLight(type.color, 0, 12 + type.size * 4);
  warningLight.position.set(0, 3, 0);
  emergencyGroup.add(warningLight);

  // Luz estroboscópica azul (camioneta)
  strobLight = new THREE.PointLight(0x2255ff, 0, 8);
  strobLight.position.set(truckPos.x, 2.5, truckPos.z);
  emergencyGroup.add(strobLight);

  // Trabajadores — ahora caminan hacia la fuga con animación de piernas
  workers = [];
  const workerCount = type.size < 0.8 ? 2 : type.size < 1.3 ? 3 : 5;
  for (let i = 0; i < workerCount; i++) {
    const isForeman = (i === 0 && type.size >= 1.5);
    const w = _makeWorker(i, isForeman, type.size);
    const arcAngle = (workerCount === 1 ? 0 : (i / (workerCount - 1) - 0.5)) * (Math.PI * 0.8);
    const wDir     = _rotateY(safe.clone(), arcAngle);
    const radius   = 1.5 + Math.random() * 0.8;
    // Posición inicial más lejos — simula llegada
    w.group.position.set(wDir.x * (radius + 3), 0, wDir.z * (radius + 3));
    w.group.lookAt(new THREE.Vector3(0, 0.5, 0));
    w.group.rotation.x += 0.18;
    w._targetRadius = radius;
    w._wDir = wDir;
    w._arrived = false;
    emergencyGroup.add(w.group);
    workers.push({ ...w, phase: i * 1.3, idx: i });
  }
}

// ─── Grietas en el asfalto ────────────────────────────────────────────────────
function _makeAsphaltCracks(type) {
  crackMeshes = [];
  const count = type.cracks;
  for (let i = 0; i < count; i++) {
    const angle  = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const length = 0.4 + Math.random() * 0.8 * type.size;
    const width  = 0.03 + Math.random() * 0.04;
    const crack  = new THREE.Mesh(
      new THREE.PlaneGeometry(length, width),
      new THREE.MeshBasicMaterial({ color: 0x080808 })
    );
    crack.rotation.x = -Math.PI / 2;
    crack.rotation.z = angle;
    crack.position.set(
      Math.cos(angle) * length * 0.4,
      -0.24,
      Math.sin(angle) * length * 0.4
    );
    crack.scale.set(0.01, 1, 1); // empieza invisible, crece
    emergencyGroup.add(crack);
    crackMeshes.push({ mesh: crack, targetScaleX: 1.0 });
  }
}

// ─── Hoyo de excavación ───────────────────────────────────────────────────────
function _makeExcavationPit(type) {
  const w = 1.5 + type.size * 0.5, d = 1.0 + type.size * 0.3, depth = 0.6;
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
  // Montones de tierra a ambos lados
  [[-w/2-0.6,0.1,0],[w/2+0.5,0.07,0.2],[-w/2-0.3,0.06,-0.4]].forEach(([px,py,pz]) => {
    const pile = new THREE.Mesh(new THREE.ConeGeometry(0.45+Math.random()*0.2,0.22,7), MAT.dirt.clone());
    pile.position.set(px,py,pz); pile.rotation.y = Math.random()*Math.PI;
    emergencyGroup.add(pile);
  });
  // Bordes de asfalto roto
  [
    { pos:[0,0,-d/2-0.08], size:[w+0.4,0.16] },
    { pos:[0,0, d/2+0.08], size:[w+0.4,0.16] },
    { pos:[-w/2-0.08,0,0], size:[0.16,d+0.12] },
    { pos:[ w/2+0.08,0,0], size:[0.16,d+0.12] },
  ].forEach(({ pos, size }) => {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(...size), MAT.asphaltCrk.clone());
    edge.rotation.x = -Math.PI/2; edge.position.set(...pos);
    emergencyGroup.add(edge);
  });
}

// ─── Tubo roto con chorro mejorado ───────────────────────────────────────────
function _makeBrokenPipe(type) {
  const g = new THREE.Group(); g.position.y = -0.45;
  const r = 0.20 + type.size * 0.04;
  const pM = new THREE.MeshBasicMaterial({ color: type.pipeColor });
  const dM = MAT.pipeDark.clone();

  const addCyl = (mat, x, y, z) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r,r,1.3,12), mat);
    c.rotation.z = Math.PI/2; c.position.set(x,y,z); g.add(c);
    const ci = new THREE.Mesh(new THREE.CylinderGeometry(r*0.65,r*0.65,1.32,10), dM.clone());
    ci.rotation.z = Math.PI/2; ci.position.set(x,y,z); g.add(ci);
  };

  addCyl(pM, -0.75, 0.00, 0.00);
  addCyl(pM.clone(), 0.75, 0.08, 0.06);

  // Zona de ruptura con anillos y torsión
  [[-0.14,0,0],[0.16,0.08,0.06]].forEach(([x,y,z]) => {
    const b = new THREE.Mesh(new THREE.TorusGeometry(r,0.04,6,14), MAT.crackEdge.clone());
    b.rotation.y = Math.PI/2; b.position.set(x,y,z); g.add(b);
  });

  // Óxido / mancha
  const rust = new THREE.Mesh(new THREE.SphereGeometry(0.15,8,6), MAT.rust.clone());
  rust.scale.set(1.2,0.25,1.0); rust.position.set(0,0.20,0); g.add(rust);

  // Chorro principal (cono que apunta hacia arriba)
  const jetGeo = new THREE.CylinderGeometry(0.04+type.size*0.03, 0.10+type.size*0.06, 0.7+type.size*0.4, 10);
  const jet = new THREE.Mesh(jetGeo,
    new THREE.MeshBasicMaterial({ color: 0x55ccff, transparent: true, opacity: 0.75 })
  );
  jet.position.set(0, 0.45+type.size*0.2, 0);
  jet.name = 'waterJet';
  g.add(jet);

  // Chorro lateral (presión escapando al costado)
  const sideJet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.05, 0.4, 8),
    new THREE.MeshBasicMaterial({ color: 0x88ddff, transparent: true, opacity: 0.6 })
  );
  sideJet.rotation.z = Math.PI / 2.5;
  sideJet.position.set(0.3, 0.15, 0.1);
  g.add(sideJet);
  brokenPipe = { group: g, jet, sideJet };

  emergencyGroup.add(g);
}

// ─── Cono ─────────────────────────────────────────────────────────────────────
function _makeCone() {
  const g = new THREE.Group();
  const a = (geo, mat, py) => { const m = new THREE.Mesh(geo,mat); m.position.y=py; g.add(m); };
  a(new THREE.CylinderGeometry(0.24,0.27,0.06,8), MAT.coneBase,  0.03);
  a(new THREE.CylinderGeometry(0.05,0.22,0.38,8), MAT.coneOrg,   0.25);
  a(new THREE.CylinderGeometry(0.055,0.055,0.07,8), MAT.coneWht, 0.42);
  a(new THREE.CylinderGeometry(0.018,0.055,0.26,8), MAT.coneOrg, 0.58);
  a(new THREE.CylinderGeometry(0.006,0.018,0.09,8), MAT.coneWht, 0.74);
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
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045,0.045,1.2,6), MAT.barrierRed.clone());
    pole.position.copy(c).add(new THREE.Vector3(0,0.6,0)); parent.add(pole);
    // Reflector en el poste
    const ref = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.08,0.05),
      new THREE.MeshBasicMaterial({ color: 0xff4400 }));
    ref.position.copy(c).add(new THREE.Vector3(0,1.0,0)); parent.add(ref);
  });
  [[0,1],[1,2],[2,3],[3,0]].forEach(([a,b]) => {
    [0.45, 0.75, 1.0].forEach(h => {
      const s = corners[a].clone().setY(h), e = corners[b].clone().setY(h);
      const mid = s.clone().add(e).multiplyScalar(0.5), len = s.distanceTo(e);
      const col = h === 0.75 ? MAT.barrierRed : MAT.barrierYel;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,len,4), col.clone());
      band.position.copy(mid);
      band.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), e.clone().sub(s).normalize());
      parent.add(band);
    });
  });
}

// ─── Camioneta mejorada con sirena ────────────────────────────────────────────
function _makeTruck(isMaint = false, hasSiren = false) {
  const g = new THREE.Group();
  const body = isMaint ? MAT.truckBlue  : MAT.truckOrange;
  const cab  = isMaint ? MAT.truckCabB  : MAT.truckCabO;
  const add = (geo,mat,px,py,pz,rx=0,ry=0,rz=0) => {
    const m=new THREE.Mesh(geo,mat); m.position.set(px,py,pz); m.rotation.set(rx,ry,rz); g.add(m); return m;
  };
  // Carrocería
  add(new THREE.BoxGeometry(2.0,0.72,1.10), body,  0,    0.66, 0);
  // Caja de carga con detalles
  add(new THREE.BoxGeometry(0.9,0.18,0.90), MAT.toolDark, -0.45,1.12,0);
  add(new THREE.BoxGeometry(1.1,0.68,0.98), cab,   0.75, 1.06, 0);
  add(new THREE.BoxGeometry(0.06,0.46,0.78), MAT.glass, 1.23,1.06, 0);
  // Faros
  [0.38,-0.38].forEach(z => {
    add(new THREE.BoxGeometry(0.07,0.13,0.19), MAT.lightYel, 1.26,0.63,z);
    add(new THREE.BoxGeometry(0.04,0.08,0.10),
      new THREE.MeshBasicMaterial({color:0xffaaaa}), 1.27,0.63,z);
  });
  // Ruedas + llantas
  [[0.6,0.29,0.62],[-0.6,0.29,0.62],[0.6,0.29,-0.62],[-0.6,0.29,-0.62]].forEach(([x,y,z]) => {
    add(new THREE.CylinderGeometry(0.29,0.29,0.24,12), MAT.truckWheel, x,y,z, 0,0,Math.PI/2);
    add(new THREE.CylinderGeometry(0.16,0.16,0.26,8),
      new THREE.MeshBasicMaterial({color:0x888888}), x,y,z, 0,0,Math.PI/2);
  });
  // Parachoques
  add(new THREE.BoxGeometry(0.12,0.22,1.05), MAT.toolDark, 1.08,0.55,0);
  // Barra de señalización amarilla
  add(new THREE.BoxGeometry(0.9,0.13,0.16), MAT.barrierYel, 0.70,1.45,0);

  if (hasSiren) {
    // Sirena roja+azul en el techo
    const sirenBase = add(new THREE.BoxGeometry(0.35,0.12,0.18), MAT.toolDark, 0.55,1.42,0);
    const siren1 = add(new THREE.CylinderGeometry(0.06,0.06,0.18,8), MAT.siren, 0.42,1.58,0);
    const siren2 = add(new THREE.CylinderGeometry(0.06,0.06,0.18,8), MAT.sirenB, 0.68,1.58,0);
    sirenMesh = { red: siren1, blue: siren2 };
  }
  return g;
}

// ─── Trabajador mejorado con piernas animables ────────────────────────────────
function _makeWorker(idx, isForeman=false, severity=1) {
  const g = new THREE.Group();
  const add = (geo,mat,px,py,pz,rx=0,ry=0,rz=0) => {
    const m=new THREE.Mesh(geo,mat); m.position.set(px,py,pz); m.rotation.set(rx,ry,rz); g.add(m); return m;
  };
  const hMat = isForeman ? MAT.helmetRed : MAT.helmet;
  const vMat = isForeman ? MAT.helmetRed : (idx % 2 === 0 ? MAT.vest : MAT.vestBlue);

  // Botas
  [-0.09,0.09].forEach(x => add(new THREE.BoxGeometry(0.13,0.11,0.17),MAT.boots,x,0.055,0.02));
  // Piernas (guardamos referencias para animarlas)
  const legL = add(new THREE.BoxGeometry(0.13,0.40,0.14),MAT.pants,-0.09,0.30,0);
  const legR = add(new THREE.BoxGeometry(0.13,0.40,0.14),MAT.pants, 0.09,0.30,0);
  // Torso
  add(new THREE.BoxGeometry(0.32,0.38,0.19),MAT.vestBlue,0,0.68,0);
  add(new THREE.BoxGeometry(0.34,0.36,0.11),vMat,0,0.68,0.06);
  // Brazos
  const armL = add(new THREE.BoxGeometry(0.11,0.32,0.12),MAT.vestBlue,-0.23,0.62,0, 0,0, 0.55);
  const armR = add(new THREE.BoxGeometry(0.11,0.32,0.12),MAT.vestBlue, 0.23,0.62,0, 0,0,-0.55);
  // Manos
  add(new THREE.BoxGeometry(0.09,0.09,0.09),MAT.skin,-0.29,0.46,0);
  add(new THREE.BoxGeometry(0.09,0.09,0.09),MAT.skin, 0.29,0.46,0);
  // Cabeza
  add(new THREE.BoxGeometry(0.23,0.23,0.21),MAT.skin,0,1.02,0);
  // Casco
  add(new THREE.CylinderGeometry(0.15,0.13,0.14,8),hMat,0,1.18,0);
  add(new THREE.CylinderGeometry(0.195,0.195,0.038,8),hMat,0,1.11,0);
  // Herramientas según rol
  if (idx===0) {
    add(new THREE.BoxGeometry(0.19,0.07,0.07),MAT.tool, 0.37,0.48,0.09,0,0,-0.3);
    add(new THREE.BoxGeometry(0.06,0.40,0.06),MAT.tool, 0.33,0.48,0.09,0,0,-0.3);
  } else if (idx===1) {
    add(new THREE.BoxGeometry(0.06,0.62,0.06),MAT.toolDark,0.33,0.56,0.10,0,0,-0.25);
    add(new THREE.BoxGeometry(0.17,0.21,0.04),MAT.tool,    0.37,0.27,0.10,0,0,-0.25);
  } else if (idx===2) {
    // Tablet/clipboard
    add(new THREE.BoxGeometry(0.18,0.24,0.03),MAT.toolDark,-0.31,0.63,0.06,0,0,0.35);
    add(new THREE.BoxGeometry(0.14,0.18,0.02),
      new THREE.MeshBasicMaterial({color:0xaaccff}),-0.31,0.64,0.08,0,0,0.35);
  } else if (idx===3) {
    // Manguera
    add(new THREE.CylinderGeometry(0.03,0.03,0.55,6),MAT.tool,0.32,0.52,0.08,0,0,-0.4);
  } else {
    // Radio
    add(new THREE.BoxGeometry(0.08,0.14,0.05),MAT.toolDark,-0.29,0.74,0.07);
    add(new THREE.CylinderGeometry(0.01,0.01,0.12,4),MAT.tool,-0.29,0.86,0.07);
  }
  return { group:g, armL, armR, legL, legR };
}

// ─── Partículas de agua ───────────────────────────────────────────────────────
function _spawnWaterParticles(count) {
  particles = [];
  for (let i=0; i<count; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.03+Math.random()*0.06,5,4),
      new THREE.MeshBasicMaterial({color:0x44aaee,transparent:true,opacity:0.8+Math.random()*0.15})
    );
    mesh.position.set((Math.random()-0.5)*0.4,Math.random()*1.4,(Math.random()-0.5)*0.4);
    mesh._vy=0.03+Math.random()*0.05; mesh._vx=(Math.random()-0.5)*0.025;
    mesh._vz=(Math.random()-0.5)*0.025; mesh._g=0.003+Math.random()*0.003;
    emergencyGroup.add(mesh); particles.push(mesh);
  }
}

// ─── Salpicaduras (partículas planas que caen hacia afuera) ──────────────────
function _spawnSplashParticles(count) {
  splashParticles = [];
  for (let i=0; i<count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06+Math.random()*0.06, 0.08+Math.random()*0.06),
      new THREE.MeshBasicMaterial({color:0x88ccff,transparent:true,opacity:0,side:THREE.DoubleSide})
    );
    mesh._angle = angle;
    mesh._speed = 0.04 + Math.random() * 0.06;
    mesh._vy    = 0.02 + Math.random() * 0.04;
    mesh._g     = 0.002 + Math.random() * 0.002;
    mesh._life  = Math.random();
    mesh._maxLife = 0.6 + Math.random() * 0.4;
    mesh.position.set(0, 0.3, 0);
    emergencyGroup.add(mesh);
    splashParticles.push(mesh);
  }
}

// ─── Vapor ────────────────────────────────────────────────────────────────────
function _spawnSteam(count) {
  steamPuffs = [];
  for (let i=0; i<count; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09+Math.random()*0.14,6,5),
      new THREE.MeshBasicMaterial({color:0xbbddee,transparent:true,opacity:0})
    );
    mesh.position.set((Math.random()-0.5)*0.6,-0.2+Math.random()*0.4,(Math.random()-0.5)*0.6);
    mesh._vy=0.004+Math.random()*0.007; mesh._life=Math.random(); mesh._maxOp=0.12+Math.random()*0.14;
    mesh._drift = (Math.random()-0.5)*0.003;
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
    totalLitersEver += Math.round(litersLost);
    leakHistory.push({ tipo, duration, liters: Math.round(litersLost), auto: wasAutoResolved });
    _updateHistoryPanel();
    _updateSessionStats();
    leakStartTime = null;
  }

  leakMarker.visible = false; puddle.visible = false; rippleRing.visible = false;

  // Restaurar presión HUD
  window._pressureDrop = false;
  ['ph-bar-3','ph-bar-2'].forEach((id, i) => {
    const bar = document.getElementById(id);
    const val = document.getElementById(id.replace('bar','val'));
    const bases = [65, 74];
    if (bar) { bar.style.width = bases[i] + '%'; bar.style.background = ''; }
    if (val) val.textContent = (bases[i] / 10).toFixed(1) + ' bar';
  });

  activeLeakPos = null;
  activeType    = null;
  _stopLitersCounter();
  _destroyEmergencyScene();
  _hideEmergencyPanel();
  clearTimeout(alertTimeout);
  htmlAlert.classList.remove('esquina');

  // Limpiar shockwaves
  shockwaveRings.forEach(r => scene.remove(r));
  shockwaveRings = [];

  if (wasAutoResolved) {
    htmlAlert.classList.add('resuelto');
    setTimeout(() => {
      htmlAlert.style.opacity='0';
      setTimeout(() => { htmlAlert.style.display='none'; htmlAlert.style.opacity=''; htmlAlert.classList.remove('resuelto'); },400);
    },2000);
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
  emergencyGroup=null; particles=[]; splashParticles=[]; steamPuffs=[];
  workers=[]; warningLight=null; strobLight=null; extraRipples=[];
  brokenPipe=null; sirenMesh=null; crackMeshes=[];
}

function _autoResolve() {
  const h = document.getElementById('alerta-fuga');
  if (h) {
    h.querySelector('h3').textContent = '✅ Fuga Controlada';
    h.querySelector('p').textContent  = 'Sistema cerrado automáticamente.';
  }
  _updateEmergencyPanelPhase('✅ SISTEMA RESTAURADO', 'Presión normalizándose…', '#2e7d32');
  setTimeout(() => _deactivateLeak(true), 1500);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LOOP DE ANIMACIÓN
// ═══════════════════════════════════════════════════════════════════════════════
export function updateLeaks() {
  if (!isLeakActive) return;
  const time = performance.now() * 0.001;

  // ── Fases de emergencia ────────────────────────────────────────────────────
  phaseTimer += 0.016;
  const phaseDur = activeType ? activeType.resolveMs / 3000 : 4;
  const newPhase = Math.min(2, Math.floor(phaseTimer / phaseDur));
  if (newPhase !== leakPhase && activeType) {
    leakPhase = newPhase;
    _updateEmergencyPanelPhase(
      activeType.phases[leakPhase],
      _getPhaseDetail(leakPhase, activeType),
      leakPhase === 0 ? '#b86200' : leakPhase === 1 ? '#c83000' : '#8b0000'
    );
  }

  // ── Marcador de fuga pulsando ──────────────────────────────────────────────
  if (leakMarker?.visible) {
    const pulse = 1 + Math.sin(time * 6) * 0.12 * baseLeakSize;
    leakMarker.scale.setScalar(baseLeakSize * pulse);
    leakMarker.rotation.y = time * 1.5;
  }

  // ── Charco creciendo ──────────────────────────────────────────────────────
  if (puddle?.visible) {
    const maxS = baseLeakSize * 2.8;
    if (puddle.scale.x < maxS) puddle.scale.setScalar(Math.min(puddle.scale.x + 0.0015, maxS));
  }

  // ── Anillo principal pulsando ─────────────────────────────────────────────
  if (rippleRing?.visible) {
    const t = (time % 2.5) / 2.5;
    rippleRing.scale.setScalar(0.3 + t * baseLeakSize * 4.0);
    rippleRing.material.opacity = 0.55 * (1 - t);
  }

  if (!emergencyGroup) return;

  // ── Luz de alerta roja ────────────────────────────────────────────────────
  if (warningLight) {
    warningLight.intensity = (Math.sin(time * 5) * 0.5 + 0.5) * (2.5 + baseLeakSize * 1.5);
    warningLight.color.setHex(activeType ? activeType.color : 0xff2200);
  }

  // ── Estroboscópico azul (camioneta) ──────────────────────────────────────
  if (strobLight) {
    const strobOn = Math.sin(time * 9) > 0.3;
    strobLight.intensity = strobOn ? 2.5 : 0;
  }

  // ── Ondas concéntricas ────────────────────────────────────────────────────
  extraRipples.forEach(r => {
    const t = ((time + r.offset) % 2.8) / 2.8;
    r.mesh.scale.setScalar(0.15 + t * baseLeakSize * 3.2);
    r.mesh.material.opacity = 0.3 * (1 - t);
  });

  // ── Chorro de agua ────────────────────────────────────────────────────────
  if (brokenPipe?.jet) {
    const j = brokenPipe.jet;
    j.scale.y   = 0.7 + Math.sin(time * 7) * 0.3;
    j.scale.x   = 0.8 + Math.sin(time * 5.3) * 0.2;
    j.position.y = 0.4 + baseLeakSize * 0.2 + Math.sin(time * 4.5) * 0.06;
    j.material.opacity = 0.55 + Math.sin(time * 8) * 0.2;
    j.rotation.z = Math.sin(time * 3) * 0.08;
  }
  if (brokenPipe?.sideJet) {
    const sj = brokenPipe.sideJet;
    sj.scale.x = 0.6 + Math.sin(time * 6 + 1) * 0.4;
    sj.material.opacity = 0.4 + Math.sin(time * 7) * 0.25;
  }

  // ── Partículas de agua ────────────────────────────────────────────────────
  particles.forEach(p => {
    p._vy -= p._g;
    p.position.y += p._vy;
    p.position.x += p._vx;
    p.position.z += p._vz;
    if (p.position.y < -0.44) {
      p.position.set((Math.random()-0.5)*0.4,-0.42+Math.random()*0.12,(Math.random()-0.5)*0.4);
      p._vy = 0.03 + Math.random() * 0.05;
      p._vx = (Math.random()-0.5)*0.025;
      p._vz = (Math.random()-0.5)*0.025;
    }
  });

  // ── Salpicaduras ──────────────────────────────────────────────────────────
  splashParticles.forEach(sp => {
    sp._life += 0.025;
    if (sp._life > sp._maxLife) {
      sp._life = 0;
      sp._angle = Math.random() * Math.PI * 2;
      sp.position.set(0, 0.3 + Math.random() * 0.4, 0);
    }
    const ph = sp._life / sp._maxLife;
    sp._vy -= sp._g;
    sp.position.x += Math.cos(sp._angle) * sp._speed;
    sp.position.z += Math.sin(sp._angle) * sp._speed;
    sp.position.y += sp._vy;
    sp.rotation.x += 0.2;
    sp.rotation.z += 0.15;
    sp.material.opacity = ph < 0.2 ? ph * 5 * 0.7 : (1 - ph) * 0.7;
    sp._speed *= 0.96;
  });

  // ── Vapor subiendo con deriva lateral ────────────────────────────────────
  steamPuffs.forEach(s => {
    s._life += 0.007;
    s.position.y += s._vy;
    s.position.x += s._drift;
    const ph = s._life % 1;
    s.material.opacity = ph < 0.5 ? ph * 2 * s._maxOp : (1 - ph) * 2 * s._maxOp;
    s.scale.setScalar(0.5 + ph * 1.8);
    if (s.position.y > 1.8) {
      s.position.set((Math.random()-0.5)*0.6, -0.2, (Math.random()-0.5)*0.6);
      s._drift = (Math.random()-0.5)*0.003;
    }
  });

  // ── Trabajadores: caminar hacia la fuga + animación de brazos/piernas ─────
  workers.forEach(w => {
    const swing = Math.sin(time * 3.2 + w.phase) * 0.35;
    if (w.armL) w.armL.rotation.z =  0.55 + swing;
    if (w.armR) w.armR.rotation.z = -0.55 - swing;
    // Animación de piernas
    if (w.legL) w.legL.rotation.x =  Math.sin(time * 3.2 + w.phase) * 0.2;
    if (w.legR) w.legR.rotation.x = -Math.sin(time * 3.2 + w.phase) * 0.2;
    // Balanceo sutil del torso
    w.group.rotation.z = Math.sin(time * 1.4 + w.phase) * 0.03;

    // Caminar hacia la fuga si no llegaron
    if (!w._arrived) {
      const curr = w.group.position.clone();
      const target = new THREE.Vector3(w._wDir.x * w._targetRadius, 0, w._wDir.z * w._targetRadius);
      const dist = curr.distanceTo(target);
      if (dist > 0.15) {
        const dir = target.clone().sub(curr).normalize();
        w.group.position.add(dir.multiplyScalar(0.025));
      } else {
        w._arrived = true;
        w.group.rotation.x += 0.18; // inclinarse hacia la fuga
      }
    }
  });

  // ── Grietas creciendo ─────────────────────────────────────────────────────
  crackMeshes.forEach(c => {
    if (c.mesh.scale.x < c.targetScaleX) {
      c.mesh.scale.x = Math.min(c.mesh.scale.x + 0.03, c.targetScaleX);
    }
  });

  // ── Shockwaves expandiéndose ──────────────────────────────────────────────
  shockwaveRings.forEach(ring => {
    const age = (performance.now() - ring._born) / 1000;
    const progress = Math.min(age / 1.2, 1);
    const r = ring._maxR * progress;
    ring.scale.setScalar(r < 0.1 ? 0.1 : r);
    ring.material.opacity = 0.8 * (1 - progress);
    if (progress >= 1) ring.visible = false;
  });

  // ── Panel de litros: marcar crítico si supera umbral ─────────────────────
  const lcVal = document.getElementById('lc-value');
  if (lcVal) lcVal.classList.toggle('critical', litersLost > 60);
}

export function getLeakState() {
  return { isActive:isLeakActive, position:activeLeakPos, totalLeaks, history:[...leakHistory] };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  UI
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Panel de emergencia ──────────────────────────────────────────────────────
function _injectEmergencyPanel() {
  const el = document.createElement('div');
  el.id = 'emergency-panel';
  el.style.display = 'none';
  el.innerHTML = `
    <div id="ep-header">
      <span id="ep-badge">⚠️</span>
      <span id="ep-phase">Detectando…</span>
    </div>
    <div id="ep-detail">Analizando sistema…</div>
    <div id="ep-bars">
      <div class="ep-bar-row">
        <span>Intensidad</span>
        <div class="ep-bar-track"><div class="ep-bar-fill" id="ep-intensity"></div></div>
      </div>
      <div class="ep-bar-row">
        <span>Respuesta</span>
        <div class="ep-bar-track"><div class="ep-bar-fill ep-response" id="ep-response"></div></div>
      </div>
    </div>
    <div id="ep-footer">
      <span id="ep-sector">—</span>
      <span id="ep-litros">0 L</span>
    </div>`;
  document.querySelector('.canvas-wrap')?.appendChild(el);
}

function _showEmergencyPanel(type, pos) {
  const el = document.getElementById('emergency-panel');
  if (!el) return;
  el.style.display = 'block';
  el.style.borderColor = '#' + type.color.toString(16).padStart(6,'0');
  document.getElementById('ep-sector').textContent = `📍 (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})`;
  document.getElementById('ep-litros').textContent  = '0 L';
  // Barra de intensidad según severidad
  const intensityPct = Math.round(type.size / 1.6 * 100);
  const intensityBar = document.getElementById('ep-intensity');
  if (intensityBar) {
    intensityBar.style.width = intensityPct + '%';
    intensityBar.style.background = type.size < 0.8 ? '#e6a817' : type.size < 1.3 ? '#e05500' : '#cc0000';
  }
  // Barra de respuesta empieza en 0 y crece con el tiempo
  const respBar = document.getElementById('ep-response');
  if (respBar) { respBar.style.width = '5%'; respBar.style.background = '#2a7d3a'; }
  // Animar barra de respuesta
  let rPct = 5;
  const rInt = setInterval(() => {
    if (!isLeakActive) { clearInterval(rInt); return; }
    rPct = Math.min(rPct + 1.2, 100);
    if (respBar) respBar.style.width = rPct + '%';
  }, type.resolveMs / 80);

  _updateEmergencyPanelPhase(type.phases[0], _getPhaseDetail(0, type), '#b86200');

  // Actualizar litros en el panel
  const epLitros = document.getElementById('ep-litros');
  const litInt = setInterval(() => {
    if (!isLeakActive) { clearInterval(litInt); return; }
    if (epLitros) epLitros.textContent = litersLost < 1000
      ? litersLost.toFixed(0) + ' L'
      : (litersLost/1000).toFixed(2) + ' m³';
  }, 200);
}

function _updateEmergencyPanelPhase(phase, detail, color) {
  const ph  = document.getElementById('ep-phase');
  const det = document.getElementById('ep-detail');
  const hdr = document.getElementById('ep-header');
  if (ph)  ph.textContent  = phase;
  if (det) det.textContent = detail;
  if (hdr) hdr.style.background = color;
}

function _getPhaseDetail(phase, type) {
  const details = [
    ['Localizando punto de ruptura', 'Sensor Z-12 activado', 'ALERTA SECTOR CRÍTICO'],
    ['Equipo de campo notificado', 'Unidades movilizándose', 'CORTE AUTOMÁTICO ACTIVO'],
    ['Técnicos en sitio', 'Válvulas de cierre activadas', 'BRIGADA COMPLETA DESPLEGADA'],
  ];
  return details[phase][Math.floor(type.size * 1.5)] || details[phase][0];
}

function _hideEmergencyPanel() {
  const el = document.getElementById('emergency-panel');
  if (el) {
    el.style.opacity = '0';
    setTimeout(() => { el.style.display='none'; el.style.opacity=''; }, 500);
  }
}

// ─── Panel de historial ───────────────────────────────────────────────────────
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
  const list = document.getElementById('lh-list');
  const count = document.getElementById('lh-count');
  if (!list) return;
  count.textContent = `${leakHistory.length} evento${leakHistory.length!==1?'s':''}`;
  list.innerHTML = leakHistory.slice().reverse().map((e,i) => `
    <li class="lh-item ${e.auto?'auto':'manual'}">
      <span class="lh-idx">#${leakHistory.length-i}</span>
      <span class="lh-tipo">${e.tipo}</span>
      <span class="lh-dur">${e.duration}s · ${e.liters}L · ${e.auto?'⚙️ auto':'👤 manual'}</span>
    </li>`).join('');
}

// ─── Estadísticas de sesión ───────────────────────────────────────────────────
function _injectSessionStats() {
  const el = document.createElement('div');
  el.id = 'session-stats';
  el.innerHTML = `
    <div class="ss-title">📊 Estadísticas de Sesión</div>
    <div class="ss-row"><span class="ss-label">Fugas simuladas</span><span class="ss-val" id="ss-total">0</span></div>
    <div class="ss-row"><span class="ss-label">Total perdido</span><span class="ss-val" id="ss-liters">0 L</span></div>
    <div class="ss-row"><span class="ss-label">Resueltas auto</span><span class="ss-val" id="ss-auto">0</span></div>
    <div class="ss-row"><span class="ss-label">Peor fuga</span><span class="ss-val" id="ss-worst">—</span></div>`;
  document.querySelector('.canvas-wrap')?.appendChild(el);
}

function _updateSessionStats() {
  const ssTotal = document.getElementById('ss-total');
  const ssLiters = document.getElementById('ss-liters');
  const ssAuto   = document.getElementById('ss-auto');
  const ssWorst  = document.getElementById('ss-worst');
  if (ssTotal)  ssTotal.textContent  = totalLeaks;
  if (ssLiters) ssLiters.textContent = totalLitersEver < 1000
    ? totalLitersEver + ' L'
    : (totalLitersEver/1000).toFixed(1) + ' m³';
  if (ssAuto)   ssAuto.textContent   = leakHistory.filter(e=>e.auto).length;
  if (ssWorst) {
    const worst = leakHistory.reduce((a,b) => b.liters > (a?.liters||0) ? b : a, null);
    ssWorst.textContent = worst ? worst.liters + ' L' : '—';
  }
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
  const el  = document.getElementById('liters-counter');
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
  const badge = document.createElement('div');
  badge.id = 'leak-timer-badge';
  badge.style.display = 'none';
  badge.textContent = '00:00';
  document.querySelector('.canvas-wrap')?.appendChild(badge);
}
function _startTimer() {
  const badge = document.getElementById('leak-timer-badge');
  if (!badge) return;
  badge.style.display = 'block';
  let elapsed = 0;
  clearInterval(_timerInterval);
  _timerInterval = setInterval(() => {
    elapsed++;
    badge.textContent = `⏱ ${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`;
  }, 1000);
}
function _stopTimer() {
  clearInterval(_timerInterval);
  const badge = document.getElementById('leak-timer-badge');
  if (badge) badge.style.display = 'none';
}
import * as THREE from 'three';
import { initControls, updateControls } from './controls.js';
import { initLeaks, updateLeaks } from './leaks.js';

// ─── Estado del módulo ────────────────────────────────────────────────────────
let scene, camera, renderer, clock;
let sun, moon, hemiLight, sunLight;
let oceanMat, sandMat, grassMat;
let cloudGroup = [];
let isNight = false;
let isXray  = false;
let isClean = false;
let pipeGlowGroup;
let threeInitDone = false;

// ─── Punto de entrada ─────────────────────────────────────────────────────────
export function initThree() {
  if (threeInitDone) return;
  threeInitDone = true;

  const canvas = document.getElementById('maqueta-canvas');
  scene  = new THREE.Scene();
  clock  = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 500);
  camera.position.set(0, 30, 45);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  _resize();

  _buildSky();
  _buildLights();
  _buildOcean();
  _buildTerrain();
  _buildMountainAndTank();
  _buildPipeNetwork();
  _buildCasaPrincipal();
  _buildSalaDeMaquinas();
  _buildPlantaDesalinizadora();
  _buildCasitas();
  _buildParkingYBanos();
  _buildPier();
  _buildDuchas();
  _buildClouds();

  initControls(camera, renderer.domElement);
  initLeaks(scene);   // ← FIX: esto era lo que faltaba. Sin esto, simulateLeak()
                      //   intentaba usar leakMarker/puddle/rippleRing antes de
                      //   que existieran y la alarma no hacía nada.

  window.addEventListener('resize', _resize);
  _wireUI();

  renderer.setAnimationLoop(_tick);
}

// ─── Loop ──────────────────────────────────────────────────────────────────────
function _tick() {
  const t = clock.getElapsedTime();

  if (oceanMat) oceanMat.uniforms.uTime.value = t;
  cloudGroup.forEach((c, i) => { c.position.x += 0.004 * (1 + i * 0.1); if (c.position.x > 110) c.position.x = -110; });

  if (pipeGlowGroup) pipeGlowGroup.children.forEach((m, i) => {
    m.material.opacity = isXray ? (0.35 + Math.sin(t * 2 + i) * 0.15) : 0;
  });

  updateControls();
  updateLeaks();
  renderer.render(scene, camera);
}

function _resize() {
  const canvas = renderer.domElement;
  const parent = canvas.parentElement;
  const w = parent.clientWidth, h = parent.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ─── Cielo ─────────────────────────────────────────────────────────────────────
function _buildSky() {
  scene.background = new THREE.Color(0xaee3f5);
  scene.fog = new THREE.Fog(0xaee3f5, 70, 230);

  sun = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4 })
  );
  sun.position.set(45, 42, -50);
  scene.add(sun);

  moon = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xdfe6f5 })
  );
  moon.position.set(-45, 42, -50);
  moon.visible = false;
  scene.add(moon);
}

function _buildClouds() {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 7; i++) {
    const group = new THREE.Group();
    const puffs = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < puffs; j++) {
      const s = 1.6 + Math.random() * 1.6;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 10), mat);
      puff.position.set(j * 2.1 - puffs, Math.random() * 0.6, Math.random() * 1.2);
      group.add(puff);
    }
    group.position.set(-100 + Math.random() * 200, 30 + Math.random() * 8, -70 + Math.random() * 50);
    group.scale.setScalar(1.4);
    scene.add(group);
    cloudGroup.push(group);
  }
}

// ─── Luces ─────────────────────────────────────────────────────────────────────
function _buildLights() {
  hemiLight = new THREE.HemisphereLight(0xbfe3f5, 0xc9a876, 0.85);
  scene.add(hemiLight);

  sunLight = new THREE.DirectionalLight(0xfff2cf, 1.4);
  sunLight.position.set(45, 42, -50);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left   = -60;
  sunLight.shadow.camera.right  =  60;
  sunLight.shadow.camera.top    =  60;
  sunLight.shadow.camera.bottom = -60;
  sunLight.shadow.camera.far    = 200;
  scene.add(sunLight);
}

// ─── Océano (franja propia, sin pisar la arena) ───────────────────────────────
// LAYOUT DE PROFUNDIDAD (Z), de fondo a frente, sin superposiciones:
//   Z < -78        → océano
//   Z -78  a  -22  → arena (playa)
//   Z -22  a  +50  → pasto (zona de cabañas)
function _buildOcean() {
  const geo = new THREE.PlaneGeometry(260, 130, 80, 60);
  oceanMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:      { value: 0 },
      uColorDeep: { value: new THREE.Color(0x0c4f6e) },
      uColorTop:  { value: new THREE.Color(0x4fb8d6) },
    },
    vertexShader: `
      uniform float uTime;
      varying float vH;
      void main() {
        vec3 p = position;
        float h = sin(p.x * 0.18 + uTime * 1.1) * 0.18
                + sin(p.y * 0.25 - uTime * 0.8) * 0.14;
        p.z += h;
        vH = h;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColorDeep;
      uniform vec3 uColorTop;
      varying float vH;
      void main() {
        vec3 c = mix(uColorDeep, uColorTop, smoothstep(-0.2, 0.3, vH));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  // El plano mide 130 de "alto" (eje Y local, pasa a Z al rotar) y lo
  // centramos en Z=-143 → cubre Z=-208 a Z=-78. Así NO se mete en la arena.
  const ocean = new THREE.Mesh(geo, oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.05, -143);
  scene.add(ocean);
}

// ─── Terreno: arena + pasto, sin overlap (antes causaba z-fighting) ──────────
function _buildTerrain() {
  sandMat = new THREE.MeshLambertMaterial({ color: 0xe8d6a3 });
  // Arena: cubre Z=-78 a Z=-22 (56 de profundidad)
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(260, 56), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0, -50);
  sand.receiveShadow = true;
  scene.add(sand);

  grassMat = new THREE.MeshLambertMaterial({ color: 0x6f9b4a });
  // Pasto: cubre Z=-22 a Z=+50 (72 de profundidad) — arranca justo donde acaba la arena
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(260, 72), grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, 0, 14);
  grass.receiveShadow = true;
  scene.add(grass);
}

// ─── Montaña + Estanque de acumulación ─────────────────────────────────────────
// Reubicada bien atrás y más angosta para que NO choque con la Casa Principal.
function _buildMountainAndTank() {
  const mountainMat = new THREE.MeshLambertMaterial({ color: 0x8a7a5c, flatShading: true });
  const mountain = new THREE.Mesh(new THREE.ConeGeometry(8.5, 11, 8), mountainMat);
  mountain.position.set(-2, 5.5, -64);
  mountain.castShadow = true;
  mountain.receiveShadow = true;
  scene.add(mountain);

  // Estanque circular en la cima
  const tankBody = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.8, 2.2, 20),
    new THREE.MeshStandardMaterial({ color: 0x9fb3bd, metalness: 0.4, roughness: 0.5 })
  );
  tankBody.position.set(-2, 12, -64);
  tankBody.castShadow = true;
  scene.add(tankBody);

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(2.3, 2.3, 0.25, 20),
    new THREE.MeshStandardMaterial({ color: 0x3a8fb8, metalness: 0.1, roughness: 0.2 })
  );
  water.position.set(-2, 13.15, -64);
  scene.add(water);

  // Válvula de salida en la base del estanque
  const valve = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.3 })
  );
  valve.position.set(-2, 10.9, -64);
  scene.add(valve);

  _label(scene, 'Estanque', -2, 15.6, -64);
}

// ─── Red de tuberías (coincide con leaks.js pipePoints) ───────────────────────
// Todas las tuberías van pegadas al suelo (y≈0.28) en vez de cruzar el aire en
// diagonal — solo el tramo que baja de la montaña tiene una caída vertical real.
function _buildPipeNetwork() {
  pipeGlowGroup = new THREE.Group();
  scene.add(pipeGlowGroup);

  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x3d6f8f, metalness: 0.3, roughness: 0.5 });

  // Bajada vertical desde la base de la montaña hasta el nivel del suelo
  _addPipe(new THREE.Vector3(-2, 10.9, -64), new THREE.Vector3(-2, 0.28, -64), pipeMat);
  // Tramo horizontal: pie de la montaña → Casa Principal
  _addPipe(new THREE.Vector3(-2, 0.28, -64), new THREE.Vector3(0, 0.28, -64), pipeMat);
  _addPipe(new THREE.Vector3(0, 0.28, -64),  new THREE.Vector3(0, 0.28, -20), pipeMat);
  // Casa Principal → colector bajo la calle
  _addPipe(new THREE.Vector3(0, 0.28, -18), new THREE.Vector3(0, 0.28, -6), pipeMat);
  // Colector principal bajo la calle
  _addPipe(new THREE.Vector3(-7, 0.28, -6), new THREE.Vector3(5, 0.28, -6), pipeMat);
  // Ramales hacia fila norte (casitas Z=4)
  [-10, -3, 5].forEach(x => _addPipe(new THREE.Vector3(x, 0.28, -6), new THREE.Vector3(x, 0.28, 0), pipeMat));
  // Ramales hacia fila sur (casitas Z=13)
  [-10, -3].forEach(x => _addPipe(new THREE.Vector3(x, 0.28, -6), new THREE.Vector3(x, 0.28, 8), pipeMat));
}

function _addPipe(a, b, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 0.01) return;
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, len, 10), mat);
  tube.position.copy(mid);
  tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  tube.castShadow = true;
  scene.add(tube);

  // Halo para modo radiografía (solo visible cuando isXray = true)
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, len, 10),
    new THREE.MeshBasicMaterial({ color: 0x3fd1ff, transparent: true, opacity: 0, depthTest: false })
  );
  glow.position.copy(mid);
  glow.quaternion.copy(tube.quaternion);
  pipeGlowGroup.add(glow);
}

// ─── Casa Principal (Z = -20, separada de la montaña) ─────────────────────────
function _buildCasaPrincipal() {
  const house = _house({ w: 6, h: 4, d: 5, wallColor: 0xf4e3c1, roofColor: 0x8a3b2e });
  house.position.set(0, 0, -20);
  scene.add(house);
  _label(house, 'Casa Principal', 0, 6.2, 0);
}

// ─── Sala de Máquinas (junto a la calle, lejos de las tuberías) ───────────────
function _buildSalaDeMaquinas() {
  const house = _house({ w: 4.5, h: 3, d: 4, wallColor: 0xb7bcc2, roofColor: 0x4a4a4a });
  house.position.set(11, 0, -9);
  scene.add(house);

  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x3d6f8f, metalness: 0.3, roughness: 0.5 });
  _addPipe(new THREE.Vector3(11, 0.28, -9), new THREE.Vector3(5, 0.28, -6), pipeMat);

  _label(house, 'Sala de Máquinas', 0, 5, 0);
}

// ─── Planta Desalinizadora (X ≈ 22, junto al mar, tanques pegados al edificio) ─
function _buildPlantaDesalinizadora() {
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(9, 4.5, 7),
    new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.2, roughness: 0.6 })
  );
  base.position.set(0, 2.25, 0);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // Tanques cilíndricos adosados a la pared trasera del edificio (sin flotar)
  for (let i = 0; i < 3; i++) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 4, 16),
      new THREE.MeshStandardMaterial({ color: 0x8fa6b3, metalness: 0.5, roughness: 0.4 })
    );
    tank.position.set(-2.6 + i * 2.6, 2, -4.4);
    tank.castShadow = true;
    group.add(tank);
  }

  group.position.set(24, 0, -55);
  scene.add(group);
  _label(group, 'Planta Desalinizadora', 0, 6, 0);
}

// ─── Casitas (fila norte Z=4 y fila sur Z=13) ─────────────────────────────────
function _buildCasitas() {
  const xs = [-10, -3, 5];
  xs.forEach(x => {
    const c1 = _house({ w: 3.2, h: 2.4, d: 3, wallColor: 0xfdf1de, roofColor: 0x3f7a63 });
    c1.position.set(x, 0, 4);
    scene.add(c1);

    const c2 = _house({ w: 3.2, h: 2.4, d: 3, wallColor: 0xfdf1de, roofColor: 0x3f7a63 });
    c2.position.set(x, 0, 13);
    scene.add(c2);
  });
}

// ─── Estacionamiento + cabinas de baño ────────────────────────────────────────
function _buildParkingYBanos() {
  const lot = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 8),
    new THREE.MeshLambertMaterial({ color: 0x5a5a5a })
  );
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(-24, 0.015, -2);
  lot.receiveShadow = true;
  scene.add(lot);

  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = -2; i <= 2; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 5), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(-24 + i * 2.6, 0.02, -2);
    scene.add(line);
  }

  // Cabina de baño, a un costado del estacionamiento (sin chocar con las líneas)
  const bath = _house({ w: 2.2, h: 2.1, d: 2, wallColor: 0xffffff, roofColor: 0x2f6f8f });
  bath.position.set(-24, 0, -8);
  scene.add(bath);

  // Letrero de tarifas
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(2, 1.3, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  sign.position.set(-24, 2.4, -6.7);
  scene.add(sign);

  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 22px sans-serif';
  ctx.fillText('Baño: $200', 14, 50);
  ctx.fillText('Baño+Auto: $500', 14, 90);
  ctx.fillText('Estac.+Baño: $1.000', 14, 130);
  const tex = new THREE.CanvasTexture(canvas);
  sign.material = new THREE.MeshStandardMaterial({ map: tex });

  _label(scene, 'Estacionamiento', -24, 0.6, 4);
}

// ─── Pier + duchas (dentro de la franja de arena, antes del océano) ──────────
function _buildPier() {
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.4, 18),
    new THREE.MeshStandardMaterial({ color: 0x7a5a3a })
  );
  pier.position.set(16, 0.4, -75);
  pier.castShadow = true;
  scene.add(pier);

  for (let i = -1; i <= 1; i += 2) {
    for (let z = -68; z >= -82; z -= 6) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a3522 }));
      pile.position.set(16 + i * 1.4, -0.2, z);
      scene.add(pile);
    }
  }

  [[12, -80], [20, -78]].forEach(([x, z]) => {
    const boat = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.4, 6),
      new THREE.MeshStandardMaterial({ color: 0xd44a3a }));
    boat.rotation.x = Math.PI / 2;
    boat.position.set(x, 0.15, z);
    scene.add(boat);
  });
}

function _buildDuchas() {
  [-28, -30].forEach((x, i) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6 }));
    pole.position.set(x, 1.2, -28 + i * 2);
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.7 }));
    head.position.set(x, 2.4, -28 + i * 2);
    scene.add(head);
  });
}

// ─── Helpers de construcción ───────────────────────────────────────────────────
function _house({ w, h, d, wallColor, roofColor }) {
  const group = new THREE.Group();
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: wallColor })
  );
  walls.position.y = h / 2;
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(w, d) * 0.72, h * 0.65, 4),
    new THREE.MeshLambertMaterial({ color: roofColor })
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + (h * 0.32);
  roof.castShadow = true;
  group.add(roof);

  return group;
}

// Etiqueta flotante: más grande, con fondo semitransparente y siempre
// orientada para no recortarse como en la versión anterior.
function _label(parent, text, x, y, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 40px sans-serif';
  const textWidth = ctx.measureText(text).width;
  const padX = 24;
  const bw = Math.min(canvas.width, textWidth + padX * 2);
  const bx = (canvas.width - bw) / 2;
  ctx.fillStyle = 'rgba(15,25,32,0.78)';
  _roundRect(ctx, bx, 14, bw, 68, 16);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, 48);

  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  const scale = Math.max(4.2, text.length * 0.34);
  sprite.scale.set(scale, scale * (96 / 512), 1);
  sprite.position.set(x, y, z);
  sprite.renderOrder = 10;
  parent.add(sprite);
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ─── Modos: día/noche, radiografía, limpio ────────────────────────────────────
export function toggleDayNight() {
  isNight = !isNight;
  if (isNight) {
    scene.background.set(0x0a1230);
    scene.fog.color.set(0x0a1230);
    hemiLight.intensity = 0.18;
    hemiLight.color.set(0x335577);
    sunLight.intensity = 0.12;
    sun.visible = false;
    moon.visible = true;
  } else {
    scene.background.set(0xaee3f5);
    scene.fog.color.set(0xaee3f5);
    hemiLight.intensity = 0.85;
    hemiLight.color.set(0xbfe3f5);
    sunLight.intensity = 1.4;
    sun.visible = true;
    moon.visible = false;
  }
  return isNight;
}

export function toggleXray() {
  isXray = !isXray;
  [sandMat, grassMat].forEach(m => {
    if (!m) return;
    m.transparent = isXray;
    m.opacity = isXray ? 0.35 : 1;
  });
  return isXray;
}

export function toggleCleanView() {
  isClean = !isClean;
  document.body.classList.toggle('clean-mode', isClean);
  return isClean;
}

// ─── UI: conecta los botones nuevos ───────────────────────────────────────────
function _wireUI() {
  const btnDayNight = document.getElementById('btn-daynight');
  const btnXray     = document.getElementById('btn-xray');
  const btnClean    = document.getElementById('btn-clean');

  if (btnDayNight) btnDayNight.addEventListener('click', () => {
    const night = toggleDayNight();
    btnDayNight.innerHTML = night
      ? '<span class="cam-icon">☀️</span> Modo Día'
      : '<span class="cam-icon">🌙</span> Modo Noche';
  });

  if (btnXray) btnXray.addEventListener('click', () => {
    const xray = toggleXray();
    btnXray.classList.toggle('active', xray);
  });

  if (btnClean) btnClean.addEventListener('click', () => {
    const clean = toggleCleanView();
    btnClean.classList.toggle('active', clean);
  });
}

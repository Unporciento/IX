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
let pipesVisible = false;
let pipeGroup, pipeGlowGroup;
let threeInitDone = false;

// ─── Punto de entrada ─────────────────────────────────────────────────────────
export function initThree() {
  if (threeInitDone) return;
  threeInitDone = true;

  const canvas = document.getElementById('maqueta-canvas');
  scene  = new THREE.Scene();
  clock  = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(42, canvas.clientWidth / canvas.clientHeight, 0.1, 500);
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
  _buildRoads();
  _buildMountainAndTank();
  _buildPipeNetwork();
  _buildCasaPrincipal();
  _buildSalaDeMaquinas();
  _buildPlantaDesalinizadora();
  _buildCasitas();
  _buildParkingYBanos();
  _buildPier();
  _buildDuchas();
  _buildPalmTrees();
  _buildVehicles();
  _buildClouds();

  initControls(camera, renderer.domElement);
  initLeaks(scene);

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
    m.material.opacity = (isXray && pipesVisible) ? (0.35 + Math.sin(t * 2 + i) * 0.15) : 0;
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
  scene.background = new THREE.Color(0xb9e6f2);
  scene.fog = new THREE.Fog(0xb9e6f2, 80, 230);

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
  for (let i = 0; i < 6; i++) {
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
  hemiLight = new THREE.HemisphereLight(0xcdeaf5, 0xc9a876, 0.9);
  scene.add(hemiLight);

  sunLight = new THREE.DirectionalLight(0xfff2cf, 1.35);
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

// ─── Océano: gradiente suave, sin choppy pattern ──────────────────────────────
// LAYOUT DE PROFUNDIDAD (Z), sin superposiciones:
//   Z < -78        → océano
//   Z -78  a  -22  → arena (playa)
//   Z -22  a  +50  → pasto (zona de cabañas)
function _buildOcean() {
  const geo = new THREE.PlaneGeometry(260, 130, 60, 40);
  oceanMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:      { value: 0 },
      uColorDeep: { value: new THREE.Color(0x1f6f86) },
      uColorTop:  { value: new THREE.Color(0x4fc7d6) },
    },
    vertexShader: `
      uniform float uTime;
      varying float vH;
      void main() {
        vec3 p = position;
        float h = sin(p.x * 0.12 + uTime * 0.7) * 0.08
                + sin(p.y * 0.18 - uTime * 0.5) * 0.06;
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
        vec3 c = mix(uColorDeep, uColorTop, smoothstep(-0.1, 0.15, vH));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const ocean = new THREE.Mesh(geo, oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.05, -143);
  scene.add(ocean);
}

// ─── Terreno: arena + pasto, sin overlap ──────────────────────────────────────
function _buildTerrain() {
  sandMat = new THREE.MeshLambertMaterial({ color: 0xe9d8ab });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(260, 56), sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0, -50);
  sand.receiveShadow = true;
  scene.add(sand);

  grassMat = new THREE.MeshLambertMaterial({ color: 0x8fae5e });
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(260, 72), grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, 0, 14);
  grass.receiveShadow = true;
  scene.add(grass);
}

// ─── Calles: avenida principal + transversal, con línea discontinua ─────────
function _buildRoads() {
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x555a5e });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });

  // Avenida principal (eje Z, de la playa hacia las casitas)
  const mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 64), roadMat);
  mainRoad.rotation.x = -Math.PI / 2;
  mainRoad.position.set(0, 0.012, -2);
  scene.add(mainRoad);
  _dashedLine(0, -2, 60, 'z', lineMat);

  // Calle transversal (eje X, frente a las casitas)
  const crossRoad = new THREE.Mesh(new THREE.PlaneGeometry(34, 4), roadMat);
  crossRoad.rotation.x = -Math.PI / 2;
  crossRoad.position.set(-7, 0.012, -6);
  scene.add(crossRoad);
  _dashedLine(-7, -6, 32, 'x', lineMat);
}

function _dashedLine(cx, cz, length, axis, mat) {
  const dashLen = 1.4, gap = 1.1;
  const count = Math.floor(length / (dashLen + gap));
  for (let i = 0; i < count; i++) {
    const offset = -length / 2 + i * (dashLen + gap);
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(axis === 'z' ? 0.15 : dashLen, axis === 'z' ? dashLen : 0.15), mat);
    dash.rotation.x = -Math.PI / 2;
    if (axis === 'z') dash.position.set(cx, 0.018, cz + offset);
    else dash.position.set(cx + offset, 0.018, cz);
    scene.add(dash);
  }
}

// ─── Cerro + Estanque (forma redondeada, domo, como la maqueta original) ────
function _buildMountainAndTank() {
  const mountainMat = new THREE.MeshLambertMaterial({ color: 0xcdb988 });
  // Icosaedro deformado en lugar de cono: da una silueta de duna/cerro redondeado
  const mountain = new THREE.Mesh(new THREE.SphereGeometry(8.5, 24, 16, 0, Math.PI * 2, 0, Math.PI / 1.9), mountainMat);
  mountain.scale.set(1, 0.62, 1);
  mountain.position.set(-2, 0, -64);
  mountain.castShadow = true;
  mountain.receiveShadow = true;
  scene.add(mountain);

  // Estanque: domo verde oscuro sobre el cerro (igual al diseño original)
  const tankDome = new THREE.Mesh(
    new THREE.SphereGeometry(3.4, 20, 14, 0, Math.PI * 2, 0, Math.PI / 1.8),
    new THREE.MeshStandardMaterial({ color: 0x2f6b4f, metalness: 0.1, roughness: 0.6 })
  );
  tankDome.position.set(-2, 5.1, -64);
  tankDome.castShadow = true;
  scene.add(tankDome);

  const tankBase = new THREE.Mesh(
    new THREE.CylinderGeometry(3.4, 3.5, 1, 20),
    new THREE.MeshStandardMaterial({ color: 0x355c46, metalness: 0.1, roughness: 0.6 })
  );
  tankBase.position.set(-2, 4.4, -64);
  scene.add(tankBase);

  _label(scene, 'Estanque', -2, 9.6, -64);
}

// ─── Red de tuberías (oculta por defecto, se activa con el botón) ───────────
function _buildPipeNetwork() {
  pipeGroup     = new THREE.Group();
  pipeGlowGroup = new THREE.Group();
  pipeGroup.visible = false;
  scene.add(pipeGroup);
  scene.add(pipeGlowGroup);

  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x1f9e7a, emissive: 0x0c4f3c, emissiveIntensity: 0.4, metalness: 0.2, roughness: 0.4 });

  _addPipe(new THREE.Vector3(-2, 3.9, -64), new THREE.Vector3(-2, 0.28, -64), pipeMat);
  _addPipe(new THREE.Vector3(-2, 0.28, -64), new THREE.Vector3(0, 0.28, -64), pipeMat);
  _addPipe(new THREE.Vector3(0, 0.28, -64),  new THREE.Vector3(0, 0.28, -20), pipeMat);
  _addPipe(new THREE.Vector3(0, 0.28, -18), new THREE.Vector3(0, 0.28, -6), pipeMat);
  _addPipe(new THREE.Vector3(-7, 0.28, -6), new THREE.Vector3(5, 0.28, -6), pipeMat);
  [-10, -3, 5].forEach(x => _addPipe(new THREE.Vector3(x, 0.28, -6), new THREE.Vector3(x, 0.28, 0), pipeMat));
  [-10, -3].forEach(x => _addPipe(new THREE.Vector3(x, 0.28, -6), new THREE.Vector3(x, 0.28, 8), pipeMat));
}

function _addPipe(a, b, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 0.01) return;
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, len, 10), mat);
  tube.position.copy(mid);
  tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  tube.castShadow = true;
  pipeGroup.add(tube);

  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, len, 10),
    new THREE.MeshBasicMaterial({ color: 0x3fffc0, transparent: true, opacity: 0, depthTest: false })
  );
  glow.position.copy(mid);
  glow.quaternion.copy(tube.quaternion);
  pipeGlowGroup.add(glow);
}

// ─── Casa Principal ────────────────────────────────────────────────────────────
function _buildCasaPrincipal() {
  const house = _house({ w: 6, h: 4, d: 5, wallColor: 0xf4ede0, roofColor: 0x2f6b4f, windows: true });
  house.position.set(0, 0, -20);
  scene.add(house);
  _label(house, 'Casa Principal', 0, 6.2, 0);
}

// ─── Sala de Máquinas ──────────────────────────────────────────────────────────
function _buildSalaDeMaquinas() {
  const house = _house({ w: 4.5, h: 3, d: 4, wallColor: 0xc7ccd1, roofColor: 0x454a4d, windows: true });
  house.position.set(11, 0, -9);
  scene.add(house);

  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x1f9e7a, emissive: 0x0c4f3c, emissiveIntensity: 0.4 });
  _addPipe(new THREE.Vector3(11, 0.28, -9), new THREE.Vector3(5, 0.28, -6), pipeMat);

  _label(house, 'Sala de Máquinas', 0, 5, 0);
}

// ─── Planta Desalinizadora ─────────────────────────────────────────────────────
function _buildPlantaDesalinizadora() {
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(9, 4.5, 7),
    new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.15, roughness: 0.65 })
  );
  base.position.set(0, 2.25, 0);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  for (let i = 0; i < 3; i++) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 4, 16),
      new THREE.MeshStandardMaterial({ color: 0x8fa6b3, metalness: 0.4, roughness: 0.45 })
    );
    tank.position.set(-2.6 + i * 2.6, 2, -4.4);
    tank.castShadow = true;
    group.add(tank);
  }

  group.position.set(24, 0, -55);
  scene.add(group);
  _label(group, 'Planta Desalinizadora', 0, 6, 0);
}

// ─── Casitas con ventanas ───────────────────────────────────────────────────
function _buildCasitas() {
  const xs = [-10, -3, 5];
  xs.forEach(x => {
    const c1 = _house({ w: 3.2, h: 2.4, d: 3, wallColor: 0xf7f1e3, roofColor: 0x2f6b4f, windows: true });
    c1.position.set(x, 0, 4);
    scene.add(c1);

    const c2 = _house({ w: 3.2, h: 2.4, d: 3, wallColor: 0xf7f1e3, roofColor: 0x2f6b4f, windows: true });
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

  const bath = _house({ w: 2.2, h: 2.1, d: 2, wallColor: 0xffffff, roofColor: 0x2f6f8f, windows: false });
  bath.position.set(-24, 0, -8);
  scene.add(bath);

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

// ─── Pier + duchas ──────────────────────────────────────────────────────────────
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

// ─── Palmeras: a lo largo de las calles y la playa ────────────────────────────
function _buildPalmTrees() {
  const spots = [];
  // Bordeando la avenida principal
  for (let z = -16; z <= 8; z += 5) {
    spots.push([-3.6, z]);
    spots.push([3.6, z]);
  }
  // Bordeando la calle transversal
  for (let x = -18; x <= 4; x += 5) {
    spots.push([x, -3.5]);
  }
  // Algunas en la playa, cerca del pier
  [[10, -68], [6, -72], [22, -68]].forEach(p => spots.push(p));

  spots.forEach(([x, z]) => _palmTree(x, z));
}

function _palmTree(x, z) {
  const group = new THREE.Group();
  const h = 2.6 + Math.random() * 1.2;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.16, h, 6),
    new THREE.MeshLambertMaterial({ color: 0x8a6a3f })
  );
  trunk.position.y = h / 2;
  trunk.rotation.z = (Math.random() - 0.5) * 0.12;
  trunk.castShadow = true;
  group.add(trunk);

  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f7a4a });
  for (let i = 0; i < 6; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.4, 4), frondMat);
    frond.position.y = h;
    frond.rotation.z = Math.PI / 2.4;
    frond.rotation.y = (i / 6) * Math.PI * 2;
    frond.translateY(0.5);
    frond.castShadow = true;
    group.add(frond);
  }

  group.position.set(x, 0, z);
  scene.add(group);
}

// ─── Vehículos simples sobre las calles ───────────────────────────────────────
function _buildVehicles() {
  _car(2.3, -2, 0xc0392b);
  _car(-7, 5, 0xc0392b, true);
}

function _car(x, z, color, isTruck = false) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(isTruck ? 2.2 : 1.6, 0.6, isTruck ? 1.3 : 0.9),
    new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 })
  );
  body.position.y = 0.5;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(isTruck ? 0.9 : 0.9, 0.4, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x2c2c2c })
  );
  cabin.position.set(isTruck ? -0.5 : 0, 0.9, 0);
  group.add(cabin);

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]].forEach(([wx, wz]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 12), wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx * (isTruck ? 1.1 : 0.9), 0.22, wz);
    group.add(wheel);
  });

  group.position.set(x, 0, z);
  group.rotation.y = Math.PI / 2;
  scene.add(group);
}

// ─── Helpers de construcción ───────────────────────────────────────────────────
function _house({ w, h, d, wallColor, roofColor, windows }) {
  const group = new THREE.Group();
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: wallColor })
  );
  walls.position.y = h / 2;
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  if (windows) {
    const winMat = new THREE.MeshLambertMaterial({ color: 0x274656 });
    const winSize = Math.min(0.55, h * 0.22);
    [[1, 0], [-1, 0]].forEach(([side]) => {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(winSize, winSize), winMat);
      win.position.set(side * w * 0.22, h * 0.55, d / 2 + 0.01);
      group.add(win);
    });
  }

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

// ─── Modos: día/noche, radiografía, limpio, red de tuberías ──────────────────
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
    scene.background.set(0xb9e6f2);
    scene.fog.color.set(0xb9e6f2);
    hemiLight.intensity = 0.9;
    hemiLight.color.set(0xcdeaf5);
    sunLight.intensity = 1.35;
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
  if (isXray) pipeGroup.visible = true;
  return isXray;
}

export function toggleCleanView() {
  isClean = !isClean;
  document.body.classList.toggle('clean-mode', isClean);
  return isClean;
}

export function togglePipes() {
  pipesVisible = !pipesVisible;
  pipeGroup.visible = pipesVisible || isXray;
  return pipesVisible;
}

// ─── UI: conecta los botones nuevos ───────────────────────────────────────────
function _wireUI() {
  const btnDayNight = document.getElementById('btn-daynight');
  const btnXray     = document.getElementById('btn-xray');
  const btnClean    = document.getElementById('btn-clean');
  const btnPipes    = document.getElementById('btn-pipes');

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

  if (btnPipes) btnPipes.addEventListener('click', () => {
    const visible = togglePipes();
    btnPipes.classList.toggle('active', visible);
    btnPipes.innerHTML = visible
      ? '<span class="cam-icon">📐</span> Ocultar Red de Tuberías'
      : '<span class="cam-icon">📐</span> Mostrar Red de Tuberías';
  });
}

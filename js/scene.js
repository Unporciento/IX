import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { initControls, updateControls } from './controls.js';
import { initLeaks, updateLeaks } from './leaks.js';
import * as L from './layout.js';

// ─── Estado del módulo ────────────────────────────────────────────────────────
let scene, camera, renderer, clock;
let sun, moon, hemiLight, sunLight, fillLight;
let oceanMat, sandMat, gardenMat;
let cloudGroup = [];
let isNight = false;
let isXray  = false;
let isClean = false;
let pipesVisible = false;
let pipeGroup, pipeGlowGroup, pipeFlowGroup;
let threeInitDone = false;
let lampLights = []; // { mesh, light } — luces reales de los postes
let bigShipGroup = null;
let bigShipTimer = 0;
let fishGroup = null;
let leakActivePos = null; // posición de la fuga activa, controlada por leaks.js

// ─── Texturas procedurales (ruido value-noise + fbm) ─────────────────────────
function _hash(x, y) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function _noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return _hash(ix, iy) * (1 - ux) * (1 - uy) + _hash(ix + 1, iy) * ux * (1 - uy) +
         _hash(ix, iy + 1) * (1 - ux) * uy + _hash(ix + 1, iy + 1) * ux * uy;
}
function _fbm(x, y, oct = 4) {
  let v = 0, a = 1, f = 1, m = 0;
  for (let i = 0; i < oct; i++) { v += _noise(x * f, y * f) * a; m += a; a *= 0.5; f *= 2; }
  return v / m;
}

function _makeSandTexture(rTint = 233, gTint = 210, bTint = 168, scale = 12) {
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const v = _fbm(i / size * scale, j / size * scale, 5);
      const sandy = 0.78 + v * 0.22;
      const idx = (i * size + j) * 4;
      data[idx] = Math.floor(rTint * sandy);
      data[idx + 1] = Math.floor(gTint * sandy);
      data[idx + 2] = Math.floor(bTint * sandy);
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function _makeRoughTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
    const v = Math.floor(_hash(i * 0.5, j * 0.5) * 80 + 170);
    const idx = (i * size + j) * 4;
    data[idx] = data[idx + 1] = data[idx + 2] = v; data[idx + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ─── Punto de entrada ─────────────────────────────────────────────────────────
export function initThree() {
  if (threeInitDone) return;
  threeInitDone = true;

  const canvas = document.getElementById('maqueta-canvas');
  scene = new THREE.Scene();
  clock = new THREE.Clock();

  // Cámara general: mirando hacia la calle con el mar a la izquierda (-X)
  camera = new THREE.PerspectiveCamera(42, canvas.clientWidth / canvas.clientHeight, 0.1, 800);
  camera.position.set(45, 32, 10);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  _resize();

  _buildSky();
  _buildLights();
  _buildOcean();
  _buildTerrain();
  _buildBeachDetails();
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
  _buildVegetation();
  _buildVehicles();
  _buildClouds();
  _buildLampPosts();
  _buildFish();

  initControls(camera, renderer.domElement);
  initLeaks(scene);

  window.addEventListener('resize', _resize);
  _wireUI();

  renderer.setAnimationLoop(_tick);
}

// ─── Loop ──────────────────────────────────────────────────────────────────────
function _tick() {
  const t = clock.getElapsedTime();
  const dt = clock.getDelta();

  if (oceanMat) oceanMat.uniforms.uTime.value = t;

  cloudGroup.forEach((c) => {
    c.position.x += 0.006;
    if (c.position.x > 90) c.position.x = -90;
    if (c.userData.shadow) c.userData.shadow.position.x = c.position.x;
  });

  if (pipeGlowGroup) {
    pipeGlowGroup.children.forEach((m, i) => {
      m.material.opacity = (isXray && pipesVisible)
        ? (0.45 + Math.sin(t * 2.5 + i * 0.7) * 0.2)
        : 0;
    });
  }
  if (pipeFlowGroup) {
    pipeFlowGroup.children.forEach((m) => {
      const visible = (isXray && pipesVisible) || leakActivePos !== null;
      m.visible = visible;
      if (!visible) return;

      // Si el tramo está "corriente abajo" del punto de fuga activo, el
      // flujo se detiene y se pone rojo (corte de suministro simulado).
      const isAffected = leakActivePos !== null &&
        m.userData.from.distanceTo(leakActivePos) < 4;

      if (isAffected) {
        m.material.color.setHex(0xff4433);
        m.position.copy(m.userData.from); // se queda quieto, "estancado"
      } else {
        m.material.color.setHex(0x9fffe8);
        m.position.copy(m.userData.from).lerp(
          m.userData.to,
          (t * 0.5 + m.userData.offset) % 1
        );
      }
    });
  }

  scene.traverse(obj => {
    if (obj.userData.isWave) {
      obj.position.x = obj.userData.waveBaseX + Math.sin(t * 0.8 + obj.userData.wavePhase) * 0.3;
      obj.material.opacity = 0.35 + Math.sin(t * 1.2 + obj.userData.wavePhase) * 0.15;
    }
    if (obj.userData.isFoam) {
      obj.material.opacity = 0.55 + Math.sin(t * 1.8 + obj.userData.foamPhase) * 0.25;
    }
    if (obj.userData.isMoonGlitter) {
      obj.material.opacity = isNight ? (0.3 + Math.sin(t * 3 + obj.userData.glitterPhase) * 0.25) : 0;
    }
  });

  lampLights.forEach((l, i) => {
    if (isNight) l.light.intensity = 2.2 + Math.sin(t * 20 + i) * 0.15;
  });

  vehicleGroup.forEach(car => {
    if (car.userData.driveBaseZ === undefined) return;
    const d = car.userData;
    let newZ = car.position.z + d.driveDir * d.driveSpeed * dt;
    if (newZ > d.driveBaseZ + d.driveRange || newZ < d.driveBaseZ - d.driveRange) {
      d.driveDir *= -1;
      car.rotation.y = d.driveDir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      car.position.z = newZ;
    }
  });

  _updateBigShip(dt, t);
  _updateRepairTech(t, dt);
  _updateFish(t);

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

// ─── Terreno: arena de playa (junto al mar) + jardín (junto a las casas) ───
function _buildTerrain() {
  const sandTex = _makeSandTexture(233, 210, 168, 12);
  sandTex.repeat.set(5, 16);
  const roughTex = _makeRoughTexture();

  sandMat = new THREE.MeshStandardMaterial({
    map: sandTex, roughnessMap: roughTex, roughness: 0.92, metalness: 0.0,
    normalScale: new THREE.Vector2(0.3, 0.3),
  });

  // Arena de playa: franja X=-50..-32
  const sandGeo = new THREE.PlaneGeometry(18, 260, 16, 80);
  const sandPos = sandGeo.attributes.position;
  for (let i = 0; i < sandPos.count; i++) {
    const x = sandPos.getX(i), y = sandPos.getY(i);
    const dune = Math.sin(y * 0.12) * Math.cos(x * 0.2) * 0.18 + Math.sin(y * 0.05 + 1) * 0.12;
    sandPos.setZ(i, dune);
  }
  sandGeo.computeVertexNormals();
  const sand = new THREE.Mesh(sandGeo, sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(-41, 0, 0); // centro de la franja -50..-32
  sand.receiveShadow = true;
  scene.add(sand);

  // Tierra/suelo seco frente a las casas (NO césped verde): mismo generador
  // de ruido que la arena, con tinte tierra/ocre y manchas de matorral ralo.
  const earthTex = _makeEarthTexture();
  earthTex.repeat.set(7, 24);
  gardenMat = new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.9, metalness: 0.0 });
  const earthFront = new THREE.Mesh(new THREE.PlaneGeometry(29, 260), gardenMat);
  earthFront.rotation.x = -Math.PI / 2;
  earthFront.position.set(-17.5, 0.01, 0); // centro de la franja -32..-3
  earthFront.receiveShadow = true;
  scene.add(earthFront);

  // Tierra adentro (lado este de la calle, hacia el cerro/planta/parking)
  const earthBack = new THREE.Mesh(new THREE.PlaneGeometry(84, 260), gardenMat);
  earthBack.rotation.x = -Math.PI / 2;
  earthBack.position.set(45, 0.01, 0); // centro de la franja 3..87
  earthBack.receiveShadow = true;
  scene.add(earthBack);

  // Transición arena→tierra (franja húmeda/oscura)
  const transitionMat = new THREE.MeshStandardMaterial({ color: 0xb8a870, roughness: 0.95 });
  const transition = new THREE.Mesh(new THREE.PlaneGeometry(4, 260), transitionMat);
  transition.rotation.x = -Math.PI / 2;
  transition.position.set(-32, 0.005, 0);
  scene.add(transition);
}

// Textura de tierra/suelo seco con matorral disperso — reemplaza el jardín
// verde uniforme. Misma técnica de ruido fbm que la arena, distinto tinte.
function _makeEarthTexture() {
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const v = _fbm(i / size * 14, j / size * 14, 5);
      const sandy = 0.72 + v * 0.28;
      let r = 213, g = 188, b = 140; // tierra clara base

      const patch = _fbm(i / size * 5 + 41, j / size * 5 + 17, 3);
      if (patch > 0.6) {
        const mix = Math.min(1, (patch - 0.6) / 0.28) * 0.5;
        r = r * (1 - mix) + 118 * mix;
        g = g * (1 - mix) + 124 * mix;
        b = b * (1 - mix) + 76 * mix;
      }
      const idx = (i * size + j) * 4;
      data[idx] = Math.floor(r * sandy);
      data[idx + 1] = Math.floor(g * sandy);
      data[idx + 2] = Math.floor(b * sandy);
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function _buildSky() {
  const skyGeo = new THREE.SphereGeometry(400, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTopColor:     { value: new THREE.Color(0x4a8fcb) },
      uHorizonColor: { value: new THREE.Color(0x9cd2e8) },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uHorizonColor;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        vec3 col = mix(uHorizonColor, uTopColor, smoothstep(0.0, 0.5, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.userData.isSky = true;
  scene.add(sky);

  scene.fog = new THREE.FogExp2(0xb9e6f2, 0.0035);

  // Sol con halo — sale por el lado del mar (oeste/-X) para que ilumine la playa
  sun = new THREE.Group();
  sun.add(new THREE.Mesh(new THREE.SphereGeometry(2.5, 32, 32), new THREE.MeshBasicMaterial({ color: 0xfffde8 })));
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) sun.add(new THREE.Mesh(new THREE.SphereGeometry(3.5 + i * 1.8, 24, 24), haloMat));
  sun.position.set(-70, 46, -30);
  scene.add(sun);

  // Luna
  moon = new THREE.Group();
  moon.add(new THREE.Mesh(
    new THREE.SphereGeometry(2.0, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0xd8e4f2, emissive: 0x8899bb, emissiveIntensity: 0.3, roughness: 0.8 })
  ));
  moon.position.set(-90, 50, 40);
  moon.visible = false;
  scene.add(moon);

  // Reflejo lunar: destellos sobre el agua, parpadeantes
  for (let i = 0; i < 14; i++) {
    const glit = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4 + Math.random() * 1.6, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xeaf2ff, transparent: true, opacity: 0, depthWrite: false })
    );
    glit.rotation.x = -Math.PI / 2;
    glit.position.set(-78 - Math.random() * 14, 0.05, 30 + (Math.random() - 0.5) * 20 - i * 1.2);
    glit.userData.isMoonGlitter = true;
    glit.userData.glitterPhase = Math.random() * 10;
    scene.add(glit);
  }

  const starGeo = new THREE.BufferGeometry();
  const starCount = 800;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const phi = Math.acos(-1 + (2 * i) / starCount);
    const theta = Math.sqrt(starCount * Math.PI) * phi;
    starPos[i * 3] = 300 * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = Math.abs(300 * Math.cos(phi)) + 10;
    starPos[i * 3 + 2] = 300 * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.9, transparent: true, opacity: 0, sizeAttenuation: false,
  }));
  stars.userData.isStars = true;
  scene.add(stars);
}

function _buildClouds() {
  const cloudConfigs = [
    { x: -60, y: 32, z: -50, s: 1.8 }, { x: 10, y: 30, z: -70, s: 2.2 },
    { x: -40, y: 34, z: 30, s: 1.5 },  { x: 20, y: 31, z: 60, s: 2.0 },
    { x: -70, y: 35, z: 10, s: 1.6 },  { x: -20, y: 29, z: -65, s: 1.9 },
    { x: 30, y: 33, z: -20, s: 1.4 },  { x: -55, y: 36, z: 55, s: 2.1 },
  ];
  cloudConfigs.forEach((cfg) => {
    const group = new THREE.Group();
    const puffCount = 5 + Math.floor(Math.random() * 4);
    for (let j = 0; j < puffCount; j++) {
      const s = (1.2 + Math.random() * 2.2) * cfg.s;
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(s, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 + Math.random() * 0.2, roughness: 1 })
      );
      puff.position.set((j - puffCount / 2) * 2.8 + (Math.random() - 0.5) * 2, (Math.random() - 0.3) * 1.8, (Math.random() - 0.5) * 2.5);
      group.add(puff);
    }
    const shadowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(cfg.s * puffCount * 0.32, 20),
      new THREE.MeshBasicMaterial({ color: 0x336688, transparent: true, opacity: 0.1, depthWrite: false })
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.set(cfg.x, 0.04, cfg.z);
    scene.add(shadowDisc);

    group.position.set(cfg.x, cfg.y, cfg.z);
    group.userData.shadow = shadowDisc;
    scene.add(group);
    cloudGroup.push(group);
  });
}

// ─── Iluminación PBR ───────────────────────────────────────────────────────────
function _buildLights() {
  hemiLight = new THREE.HemisphereLight(0x9ecfea, 0xc8b870, 1.0);
  scene.add(hemiLight);

  sunLight = new THREE.DirectionalLight(0xfff0d0, 2.2);
  sunLight.position.set(-70, 46, -30);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(4096, 4096);
  sunLight.shadow.camera.left = -90; sunLight.shadow.camera.right = 90;
  sunLight.shadow.camera.top = 90; sunLight.shadow.camera.bottom = -90;
  sunLight.shadow.camera.far = 260;
  sunLight.shadow.bias = -0.0003;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight);

  fillLight = new THREE.DirectionalLight(0x88c8e8, 0.35);
  fillLight.position.set(30, 10, -20);
  scene.add(fillLight);

  const ambOcc = new THREE.HemisphereLight(0x000000, 0x223344, 0.25);
  scene.add(ambOcc);
}

// ─── Océano: a la izquierda (X negativo), franja paralela a Z ───────────────
function _buildOcean() {
  const geo = new THREE.PlaneGeometry(200, 400, 100, 140);
  oceanMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:        { value: 0 },
      uDeepColor:   { value: new THREE.Color(0x073d54) },
      uMidColor:    { value: new THREE.Color(0x0e6f86) },
      uShallowColor:{ value: new THREE.Color(0x2cb6c2) },
      uFoamColor:   { value: new THREE.Color(0xeaf7ff) },
      uSunDir:      { value: new THREE.Vector3(-0.6, 0.8, -0.3).normalize() },
      uFresnelBase: { value: 0.04 },
    },
    vertexShader: `
      uniform float uTime;
      varying float vH;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      float wave(vec2 p, float freq, float speed, float amp) {
        return sin(p.x * freq + uTime * speed) * cos(p.y * freq * 0.7 + uTime * speed * 0.8) * amp;
      }
      float swell(vec2 p) {
        return wave(p, 0.045, 0.5, 0.30) + wave(p * 1.7, 0.07, 0.7, 0.19)
             + wave(p * 0.5, 0.05, 0.6, 0.16) + wave(p * 2.4, 0.13, 1.2, 0.09)
             + wave(p * 4.6, 0.22, 1.9, 0.045);
      }
      void main() {
        vec3 p = position;
        float h = swell(p.xy);
        p.z += h;
        vH = h; vUv = uv;
        vWorldPos = (modelMatrix * vec4(p, 1.0)).xyz;
        float eps = 0.5;
        float hL = swell(vec2(p.x-eps,p.y));
        float hR = swell(vec2(p.x+eps,p.y));
        float hD = swell(vec2(p.x,p.y-eps));
        float hU = swell(vec2(p.x,p.y+eps));
        vNormal = normalize(vec3(hL-hR, 2.0, hD-hU));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uDeepColor, uMidColor, uShallowColor, uFoamColor, uSunDir;
      uniform float uFresnelBase, uTime;
      varying float vH; varying vec3 vNormal, vWorldPos; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y);
      }
      void main() {
        // vUv.y = 0 en la orilla (cerca), 1 hacia el horizonte (mar abierto)
        float depthT = smoothstep(0.0, 1.0, vUv.y);
        vec3 base = mix(uShallowColor, uMidColor, smoothstep(0.0, 0.22, depthT));
        base = mix(base, uDeepColor, smoothstep(0.18, 0.8, depthT));

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = uFresnelBase + (1.0-uFresnelBase) * pow(1.0 - max(0.0, dot(vNormal, viewDir)), 5.0);
        vec3 halfVec = normalize(uSunDir + viewDir);
        float spec = pow(max(0.0, dot(vNormal, halfVec)), 170.0);
        float foamNoise = noise(vWorldPos.xz * 0.42 + uTime * 0.21);
        float foam = smoothstep(0.14, 0.30, vH + foamNoise * 0.11);
        float caustic = noise(vWorldPos.xz*2.5+uTime*0.8) * noise(vWorldPos.xz*3.1-uTime*0.6);
        caustic = smoothstep(0.4, 0.8, caustic) * 0.22 * (1.0 - depthT * 0.6);
        vec3 col = mix(base, uFoamColor, foam);
        col += vec3(spec * 2.2 * (1.0 - foam));
        col = mix(col, vec3(0.82,0.95,1.0), fresnel * 0.32);
        col += caustic * uShallowColor;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const ocean = new THREE.Mesh(geo, oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(-150, -0.1, 0);
  scene.add(ocean);

  // Olas cerca de la orilla (franjas paralelas a la costa, perpendiculares a X)
  for (let i = 0; i < 6; i++) {
    const geo2 = new THREE.PlaneGeometry(1.8, 220, 1, 80);
    const pos = geo2.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v);
      pos.setZ(v, Math.sin(y * 0.08) * 0.15);
      pos.setX(v, 0.1 + Math.sin(y * 0.12) * 0.08);
    }
    geo2.computeVertexNormals();
    const wave = new THREE.Mesh(geo2, new THREE.MeshStandardMaterial({
      color: 0xc8eef8, transparent: true, opacity: 0.4, roughness: 0.1, metalness: 0.2, side: THREE.DoubleSide,
    }));
    wave.rotation.x = -Math.PI / 2;
    const waveX = -49 + i * 1.4; // dentro de la franja de playa, cerca del borde del mar (-50)
    wave.position.set(waveX, 0.08, 0);
    wave.userData.isWave = true;
    wave.userData.waveBaseX = waveX;
    wave.userData.wavePhase = i * 1.1;
    scene.add(wave);
  }

  // Espuma en la línea de costa
  for (let i = 0; i < 5; i++) {
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(3 + Math.random() * 2, 220 + Math.random() * 40, 1, 40),
      new THREE.MeshBasicMaterial({ color: 0xdff5ff, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide })
    );
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(-48 + i * 3 + Math.random() * 2, 0.05, 0);
    foam.userData.isFoam = true;
    foam.userData.foamPhase = i * 1.2;
    scene.add(foam);
  }
}

// ─── Detalles de playa: sombrillas y reposeras, dentro de la franja de arena ─
function _buildBeachDetails() {
  const umbrellaSpots = [[-42, -45], [-38, -20], [-43, 5], [-39, 28], [-42, 48]];
  umbrellaSpots.forEach(([x, z]) => _buildUmbrella(x, z));

  const chairSpots = [[-40, -44], [-36, -19], [-41, 6], [-37, 29]];
  chairSpots.forEach(([x, z]) => _buildBeachChair(x, z));
}

function _buildUmbrella(x, z) {
  const colors = [0xe83b2a, 0xf5a623, 0x4ecdc4, 0x2ecc71, 0x9b59b6];
  const color = colors[Math.floor(Math.random() * colors.length)];

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.05, 2.6, 8),
    new THREE.MeshStandardMaterial({ color: 0xd4c9a8, roughness: 0.6 })
  );
  pole.position.set(x, 1.3, z);
  pole.castShadow = true;
  scene.add(pole);

  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(1.4, 0.5, 12),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide })
  );
  canopy.position.set(x, 2.4, z);
  canopy.castShadow = true;
  scene.add(canopy);

  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  tip.position.set(x, 2.68, z);
  scene.add(tip);
}

function _buildBeachChair(x, z) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xf0d080, roughness: 0.9 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.7), mat);
  frame.position.set(x, 0.2, z);
  frame.rotation.z = -0.15;
  frame.castShadow = true;
  scene.add(frame);
}

// ─── Calles: avenida principal corre en Z, paralela a la costa ─────────────
function _buildRoads() {
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.85, metalness: 0.05 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const yellowMat = new THREE.MeshBasicMaterial({ color: 0xf0c820 });

  const mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 96), roadMat);
  mainRoad.rotation.x = -Math.PI / 2;
  mainRoad.position.set(0, 0.015, 0);
  mainRoad.receiveShadow = true;
  scene.add(mainRoad);
  _dashedLineZ(0, 0, 90, lineMat);

  [-2, 2].forEach(ox => {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 96), yellowMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(ox, 0.025, 0);
    scene.add(edge);
  });

  const curbMat = new THREE.MeshStandardMaterial({ color: 0xc8c2b5, roughness: 0.9 });
  [-2.45, 2.45].forEach(cx => {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 96), curbMat);
    curb.position.set(cx, 0.06, 0);
    scene.add(curb);
  });

  const accessRoad = new THREE.Mesh(new THREE.PlaneGeometry(20, 4.4), roadMat);
  accessRoad.rotation.x = -Math.PI / 2;
  accessRoad.position.set(11, 0.015, L.PARKING.z);
  accessRoad.receiveShadow = true;
  scene.add(accessRoad);
  _dashedLineX(11, L.PARKING.z, 18, lineMat);
}

function _dashedLineZ(cx, cz, length, mat) {
  const dashLen = 1.6, gap = 1.2;
  const count = Math.floor(length / (dashLen + gap));
  for (let i = 0; i < count; i++) {
    const offset = -length / 2 + i * (dashLen + gap);
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, dashLen), mat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(cx, 0.022, cz + offset);
    scene.add(dash);
  }
}

function _dashedLineX(cx, cz, length, mat) {
  const dashLen = 1.6, gap = 1.2;
  const count = Math.floor(length / (dashLen + gap));
  for (let i = 0; i < count; i++) {
    const offset = -length / 2 + i * (dashLen + gap);
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(dashLen, 0.12), mat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(cx + offset, 0.022, cz);
    scene.add(dash);
  }
}

// ─── Cerro + Estanque — tierra adentro, lejos del agua ───────────────────────
function _buildMountainAndTank() {
  const { x: mx, z: mz } = L.ESTANQUE;

  const mountainBase = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xc8b080, roughness: 0.97 })
  );
  mountainBase.scale.set(1, 0.55, 1);
  mountainBase.position.set(mx, 0, mz);
  mountainBase.castShadow = true;
  mountainBase.receiveShadow = true;
  scene.add(mountainBase);

  const mountainMid = new THREE.Mesh(
    new THREE.SphereGeometry(6.5, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xb8a070, roughness: 0.95 })
  );
  mountainMid.scale.set(1, 0.65, 1);
  mountainMid.position.set(mx, 1.8, mz);
  mountainMid.castShadow = true;
  scene.add(mountainMid);

  const mountainTop = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xa09065, roughness: 0.93 })
  );
  mountainTop.scale.set(1, 0.72, 1);
  mountainTop.position.set(mx + 0.5, 3.8, mz + 0.5);
  mountainTop.castShadow = true;
  scene.add(mountainTop);

  const tankGroup = new THREE.Group();
  const tankBody = new THREE.Mesh(
    new THREE.CylinderGeometry(3.0, 3.2, 4.2, 24),
    new THREE.MeshStandardMaterial({ color: 0x3a7058, metalness: 0.25, roughness: 0.55 })
  );
  tankBody.position.y = 2.1;
  tankBody.castShadow = true;
  tankGroup.add(tankBody);

  const tankRoof = new THREE.Mesh(
    new THREE.SphereGeometry(3.0, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2d5a44, metalness: 0.3, roughness: 0.5 })
  );
  tankRoof.position.y = 4.2;
  tankRoof.castShadow = true;
  tankGroup.add(tankRoof);

  const tankBase = new THREE.Mesh(
    new THREE.CylinderGeometry(3.3, 3.5, 0.4, 24),
    new THREE.MeshStandardMaterial({ color: 0x2a4a38, metalness: 0.2, roughness: 0.7 })
  );
  tankBase.position.y = 0.2;
  tankGroup.add(tankBase);

  const ladderMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.3 });
  for (let i = 0; i < 8; i++) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), ladderMat);
    rung.position.set(3.1, 0.4 + i * 0.55, 0);
    rung.rotation.z = Math.PI / 2;
    tankGroup.add(rung);
  }

  const vent = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8),
    new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.7 })
  );
  vent.position.set(1.5, 5.0, 0);
  tankGroup.add(vent);

  tankGroup.position.set(mx, 5.2, mz);
  scene.add(tankGroup);

  _label(scene, 'Estanque Principal', mx, 12.5, mz);
}

// ─── Helpers genéricos ────────────────────────────────────────────────────────
function _label(parent, text, x, y, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 34px Arial';
  const tw = ctx.measureText(text).width;
  const padX = 20, padY = 10;
  const bw = Math.min(500, tw + padX * 2);
  const bx = (512 - bw) / 2;
  ctx.fillStyle = 'rgba(8,18,28,0.82)';
  _canvasRoundRect(ctx, bx, padY, bw, 76, 12);
  ctx.fill();
  ctx.fillStyle = '#e8f4ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
  ctx.fillText(text, 256, 48);

  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  const scale = Math.max(4.5, text.length * 0.3);
  sprite.scale.set(scale, scale * (96 / 512), 1);
  sprite.position.set(x, y, z);
  sprite.renderOrder = 10;
  parent.add(sprite);
}

function _canvasRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ─── Casa detallada — reutilizable, mira hacia +facingSign en X ─────────────
// facingSign = 1 → la fachada (puerta/ventanas) mira hacia +X (hacia la calle,
// para casas del lado playa, que están al oeste de la calle).
// facingSign = -1 → la fachada mira hacia -X (para casas del lado tierra).
function _buildDetailedHouse({ w, h, d, wallColor, roofColor, accentColor, hasTerrace, label, facingSign = 1 }) {
  const group = new THREE.Group();

  const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.85, metalness: 0.0 });
  const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.8, metalness: 0.05 });
  const winMat = new THREE.MeshStandardMaterial({
    color: 0x3d6888, transparent: true, opacity: 0.8,
    metalness: 0.4, roughness: 0.1, emissive: 0x1a2e3a, emissiveIntensity: 0.15,
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });

  // La "fachada" (dimensión que mira hacia la calle) es w; d es la profundidad.
  // Construimos en orientación local con la fachada en +X, luego rotamos el
  // grupo entero si facingSign === -1.
  const walls = new THREE.Mesh(new RoundedBoxGeometry(d, h, w, 2, 0.06), wallMat);
  walls.position.y = h / 2;
  walls.castShadow = true; walls.receiveShadow = true;
  group.add(walls);

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(d + 0.3, 0.25, w + 0.3),
    new THREE.MeshStandardMaterial({ color: 0xb0a890, roughness: 0.9 })
  );
  plinth.position.y = 0.125;
  group.add(plinth);

  const roofW = Math.max(w, d) * 0.75;
  const roofH = h * 0.55;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(roofW, roofH, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + roofH * 0.5;
  roof.castShadow = true;
  group.add(roof);

  const overhang = new THREE.Mesh(
    new THREE.BoxGeometry(d + 0.6, 0.12, w + 0.6),
    new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.8 })
  );
  overhang.position.y = h + 0.05;
  group.add(overhang);

  // Ventanas y puerta en la cara +X local (fachada hacia la calle)
  const winSize = Math.min(0.7, h * 0.22);
  const winPositions = w > 4
    ? [[-w * 0.28, h * 0.55], [w * 0.28, h * 0.55], [-w * 0.28, h * 0.25], [w * 0.28, h * 0.25]]
    : [[-w * 0.22, h * 0.55], [w * 0.22, h * 0.55]];

  winPositions.forEach(([wz, wy]) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, winSize * 1.2, winSize * 1.2), frameMat);
    frame.position.set(d / 2 + 0.04, wy, wz);
    group.add(frame);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(winSize, winSize), winMat);
    win.position.set(d / 2 + 0.09, wy, wz);
    win.rotation.y = Math.PI / 2;
    group.add(win);
  });

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, h * 0.45, w * 0.22),
    new THREE.MeshStandardMaterial({ color: accentColor || 0x6a4520, roughness: 0.6 })
  );
  door.position.set(d / 2 + 0.04, h * 0.225, 0);
  group.add(door);

  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xd4aa40, metalness: 0.9, roughness: 0.1 })
  );
  knob.position.set(d / 2 + 0.1, h * 0.24, -w * 0.09);
  group.add(knob);

  if (Math.random() > 0.4) {
    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, h * 0.5, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x8a6050, roughness: 0.9 })
    );
    chimney.position.set(0, h + h * 0.25, w * 0.25);
    chimney.castShadow = true;
    group.add(chimney);
  }

  if (hasTerrace) {
    const terrMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb0, roughness: 0.9 });
    const terrace = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.15, w + 2), terrMat);
    terrace.position.set(d / 2 + 1.25, 0.075, 0);
    group.add(terrace);
    const rMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    [-w / 2 - 0.8, w / 2 + 0.8].forEach(rz => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.7, 0.08), rMat);
      rail.position.set(d / 2 + 1.25, 0.43, rz);
      group.add(rail);
    });
    const frontRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, w + 2), rMat);
    frontRail.position.set(d / 2 + 2.5, 0.75, 0);
    group.add(frontRail);
  }

  if (label) _label(group, label, d / 2 + 0.5, h + roofH + 1.2, 0);

  // Acometida visible: pequeña llave de paso junto a la puerta, donde el
  // ramal de tubería conecta con la casa.
  const stopcock = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.25, 8),
    new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.3 })
  );
  stopcock.rotation.z = Math.PI / 2;
  stopcock.position.set(d / 2 + 0.15, 0.3, w * 0.4);
  group.add(stopcock);

  if (facingSign === -1) group.rotation.y = Math.PI;

  return group;
}

// ─── Casa Principal — extremo norte de la fila tierra, mirando a la calle ───
function _buildCasaPrincipal() {
  const house = _buildDetailedHouse({
    w: 7, h: 4.6, d: 6.5,
    wallColor: 0xf4ede0, roofColor: 0x2f6b4f, accentColor: 0x6a4520,
    hasTerrace: true, label: 'Casa Principal', facingSign: -1,
  });
  house.position.set(L.CASA_PRINCIPAL.x, 0, L.CASA_PRINCIPAL.z);
  scene.add(house);
}

// ─── Sala de Máquinas — extremo sur de la fila tierra ────────────────────────
function _buildSalaDeMaquinas() {
  const house = _buildDetailedHouse({
    w: 5, h: 3.4, d: 4.5,
    wallColor: 0xc7ccd1, roofColor: 0x454a4d, accentColor: 0x333333,
    hasTerrace: false, label: 'Sala de Máquinas', facingSign: -1,
  });
  house.position.set(L.SALA_MAQUINAS.x, 0, L.SALA_MAQUINAS.z);
  scene.add(house);

  // Tablero eléctrico y bomba exterior (detalle industrial)
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 1.0, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.4, roughness: 0.5 })
  );
  panel.position.set(L.SALA_MAQUINAS.x - 2.4, 0.5, L.SALA_MAQUINAS.z - 2.0);
  scene.add(panel);

  const pump = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.6, 12),
    new THREE.MeshStandardMaterial({ color: 0x3a6ea5, metalness: 0.5, roughness: 0.4 })
  );
  pump.position.set(L.SALA_MAQUINAS.x - 2.6, 0.3, L.SALA_MAQUINAS.z + 1.5);
  pump.castShadow = true;
  scene.add(pump);
}

// ─── Planta Desalinizadora — en la playa, capta agua de mar ─────────────────
function _buildPlantaDesalinizadora() {
  const { x, z } = L.PLANTA_DESAL;
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(7, 4.2, 9),
    new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.2, roughness: 0.55 })
  );
  base.position.set(0, 2.1, 0);
  base.castShadow = true; base.receiveShadow = true;
  group.add(base);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(7.1, 0.5, 9.1),
    new THREE.MeshStandardMaterial({ color: 0x2f6f8f, metalness: 0.25, roughness: 0.5 })
  );
  stripe.position.set(0, 3.2, 0);
  group.add(stripe);

  for (let i = 0; i < 3; i++) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 3.6, 18),
      new THREE.MeshStandardMaterial({ color: 0x8fa6b3, metalness: 0.5, roughness: 0.3 })
    );
    tank.position.set(0, 1.9, -5.6 + i * 1.9);
    tank.castShadow = true;
    group.add(tank);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), tank.material);
    cap.position.set(0, 3.7, -5.6 + i * 1.9);
    group.add(cap);
  }

  // Tubería de captación de agua de mar (entra hacia el oeste, hasta el agua)
  const intakeMat = new THREE.MeshStandardMaterial({ color: 0x2a6b8f, metalness: 0.3, roughness: 0.4 });
  const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 20, 10), intakeMat);
  intake.rotation.z = Math.PI / 2;
  intake.position.set(-10, 0.4, 0);
  intake.castShadow = true;
  group.add(intake);
  const intakeGrate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12),
    new THREE.MeshStandardMaterial({ color: 0x1a4a60, metalness: 0.5, roughness: 0.4 })
  );
  intakeGrate.rotation.z = Math.PI / 2;
  intakeGrate.position.set(-20, 0.4, 0);
  group.add(intakeGrate);

  group.position.set(x, 0, z);
  scene.add(group);
  _label(group, 'Planta Desalinizadora', 0, 6.2, 0);
}

// ─── Casitas — filas a ambos lados de la calle, cada una mirando hacia ella ──
const HOUSE_PALETTE = [
  { wall: 0xf7f1e3, roof: 0x2f6b4f, accent: 0x6a4520 },
  { wall: 0xf2e8d8, roof: 0x3a5a8a, accent: 0x4a3018 },
  { wall: 0xfbeee0, roof: 0x8a3a3a, accent: 0x553322 },
  { wall: 0xeef0e8, roof: 0x4a7a6a, accent: 0x6a4520 },
  { wall: 0xf5e6cc, roof: 0x5a4a8a, accent: 0x442a18 },
];

function _buildCasitas() {
  L.HOUSE_ROWS_Z.forEach((z, i) => {
    const palette = HOUSE_PALETTE[i % HOUSE_PALETTE.length];

    // Lado playa (oeste de la calle): fachada mira hacia +X (hacia la calle)
    const west = _buildDetailedHouse({
      w: 3.6, h: 2.7, d: 3.4,
      wallColor: palette.wall, roofColor: palette.roof, accentColor: palette.accent,
      hasTerrace: i % 2 === 0, facingSign: 1,
    });
    west.position.set(L.HOUSE_SIDE_X.west, 0, z);
    scene.add(west);

    // Lado tierra (este de la calle): fachada mira hacia -X (hacia la calle)
    const eastPalette = HOUSE_PALETTE[(i + 2) % HOUSE_PALETTE.length];
    const east = _buildDetailedHouse({
      w: 3.6, h: 2.7, d: 3.4,
      wallColor: eastPalette.wall, roofColor: eastPalette.roof, accentColor: eastPalette.accent,
      hasTerrace: i % 2 === 1, facingSign: -1,
    });
    east.position.set(L.HOUSE_SIDE_X.east, 0, z);
    scene.add(east);
  });

  _label(scene, 'Cabañas — Sector Norte', L.HOUSE_SIDE_X.west, 4.2, L.HOUSE_ROWS_Z[0] - 4);
  _label(scene, 'Cabañas — Sector Sur', L.HOUSE_SIDE_X.west, 4.2, L.HOUSE_ROWS_Z[L.HOUSE_ROWS_Z.length - 1] + 4);
}

// ─── Red de tuberías — colector principal bajo la calle + ramales a CADA casa ─
// Exportamos las posiciones para que leaks.js pueda usarlas como puntos de
// fuga reales sobre la geometría visible.
export const PIPE_NETWORK_POINTS = [];

function _buildPipeNetwork() {
  pipeGroup     = new THREE.Group();
  pipeGlowGroup = new THREE.Group();
  pipeFlowGroup = new THREE.Group();
  pipeGroup.visible = false;
  scene.add(pipeGroup);
  scene.add(pipeGlowGroup);
  scene.add(pipeFlowGroup);

  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0x1f9e7a, emissive: 0x0c4f3c, emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.35,
  });
  const pipeY = 0.22;
  const houseStopX = 3.4 / 2 + 0.15; // distancia del centro de la casa a su acometida

  // 1) Bajada desde el estanque (tierra adentro) hasta el colector principal
  _addPipe(new THREE.Vector3(L.ESTANQUE.x, 5.2, L.ESTANQUE.z), new THREE.Vector3(L.ESTANQUE.x, pipeY, L.ESTANQUE.z), pipeMat);
  _addPipe(new THREE.Vector3(L.ESTANQUE.x, pipeY, L.ESTANQUE.z), new THREE.Vector3(L.COLLECTOR_X, pipeY, L.ESTANQUE.z), pipeMat);

  // 2) Colector principal: corre en Z bajo la calle, de norte a sur
  _addPipe(
    new THREE.Vector3(L.COLLECTOR_X, pipeY, L.COLLECTOR_Z_MIN),
    new THREE.Vector3(L.COLLECTOR_X, pipeY, L.COLLECTOR_Z_MAX),
    pipeMat
  );

  // 3) Ramal a Casa Principal y Sala de Máquinas (en el lado este, x=7)
  [L.CASA_PRINCIPAL, L.SALA_MAQUINAS].forEach(node => {
    const stopX = node.x - houseStopX; // acometida (fachada mira a -X)
    _addPipe(new THREE.Vector3(L.COLLECTOR_X, pipeY, node.z), new THREE.Vector3(stopX, pipeY, node.z), pipeMat);
    PIPE_NETWORK_POINTS.push({ pos: new THREE.Vector3((L.COLLECTOR_X + stopX) / 2, pipeY, node.z), label: 'Ramal — Casa Principal/Sala' });
  });

  // 4) Ramal a la Planta Desalinizadora (cruza desde el colector hasta la playa)
  _addPipe(
    new THREE.Vector3(L.COLLECTOR_X, pipeY, L.PLANTA_DESAL.z),
    new THREE.Vector3(L.PLANTA_DESAL.x + 3.6, pipeY, L.PLANTA_DESAL.z),
    pipeMat
  );

  // 5) Ramales a CADA fila de casitas, ambos lados de la calle
  L.HOUSE_ROWS_Z.forEach(z => {
    const westStop = L.HOUSE_SIDE_X.west + houseStopX; // -7 + 1.85 = -5.15
    const eastStop = L.HOUSE_SIDE_X.east - houseStopX; //  7 - 1.85 =  5.15

    _addPipe(new THREE.Vector3(westStop, pipeY, z), new THREE.Vector3(L.COLLECTOR_X, pipeY, z), pipeMat);
    _addPipe(new THREE.Vector3(L.COLLECTOR_X, pipeY, z), new THREE.Vector3(eastStop, pipeY, z), pipeMat);

    PIPE_NETWORK_POINTS.push({ pos: new THREE.Vector3((westStop + L.COLLECTOR_X) / 2, pipeY, z), label: `Ramal cabaña oeste — fila z=${z}` });
    PIPE_NETWORK_POINTS.push({ pos: new THREE.Vector3((L.COLLECTOR_X + eastStop) / 2, pipeY, z), label: `Ramal cabaña este — fila z=${z}` });

    // Válvula visible en cada acometida
    [westStop, eastStop].forEach(vx => {
      const valve = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xcc3322, metalness: 0.5, roughness: 0.4 })
      );
      valve.position.set(vx, pipeY, z);
      pipeGroup.add(valve);
    });
  });
}

function _addPipe(a, b, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 0.01) return;
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, len, 12), mat);
  tube.position.copy(mid);
  tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  tube.castShadow = true;
  pipeGroup.add(tube);

  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, len, 12),
    new THREE.MeshBasicMaterial({ color: 0x3fffc0, transparent: true, opacity: 0, depthTest: false })
  );
  glow.position.copy(mid);
  glow.quaternion.copy(tube.quaternion);
  pipeGlowGroup.add(glow);

  // Partícula de "flujo de agua" animada en Modo Radiografía — recorre el
  // tramo de a hacia b para visualizar que el agua efectivamente fluye/cae.
  const flowDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x9fffe8, transparent: true, opacity: 0.9 })
  );
  flowDot.userData.from = a.clone();
  flowDot.userData.to = b.clone();
  flowDot.userData.offset = Math.random();
  flowDot.visible = false;
  pipeFlowGroup.add(flowDot);
}

// ─── Estacionamiento + Servicios — tierra adentro, cerca del acceso ─────────
function _buildParkingYBanos() {
  const { x: px, z: pz } = L.PARKING;
  const lot = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 9),
    new THREE.MeshStandardMaterial({ color: 0x53575a, roughness: 0.88 })
  );
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(px, 0.015, pz);
  lot.receiveShadow = true;
  scene.add(lot);

  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = -2; i <= 2; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 6), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(px + i * 2.6, 0.02, pz);
    scene.add(line);
  }

  const bath = _buildDetailedHouse({
    w: 3, h: 2.3, d: 2.4, wallColor: 0xffffff, roofColor: 0x2f6f8f, accentColor: 0x2f6f8f,
    hasTerrace: false, label: 'Servicios', facingSign: 1,
  });
  bath.position.set(px, 0, pz - 7);
  scene.add(bath);

  const aljibe = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 1.8, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x4a6a3a, metalness: 0.3, roughness: 0.6 })
  );
  aljibe.position.set(px - 6, 0.9, pz - 1);
  aljibe.castShadow = true;
  scene.add(aljibe);
  _label(scene, 'Aljibe', px - 6, 2.4, pz - 1);

  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 2.2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }));
  sign.position.set(px - 8.2, 2.4, pz);
  scene.add(sign);
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 20px Arial';
  ctx.fillText('Baño: $200', 14, 50);
  ctx.fillText('Baño+Auto: $500', 14, 90);
  ctx.fillText('Estac.+Baño: $1.000', 14, 130);
  sign.material = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), roughness: 0.7 });

  _label(scene, 'Estacionamiento', px, 0.6, pz + 6);
}

// ─── Pier — perpendicular a la costa, se adentra en el mar ──────────────────
function _buildPier() {
  const { x: pierX, z: pierZ, length: pierLen } = L.PIER;
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.85 });

  const pier = new THREE.Mesh(new THREE.BoxGeometry(pierLen, 0.4, 3.2), woodMat);
  pier.position.set(pierX, 0.4, pierZ);
  pier.castShadow = true; pier.receiveShadow = true;
  scene.add(pier);

  const plankMat = new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.18 });
  for (let x = pierX - pierLen / 2 + 1; x <= pierX + pierLen / 2 - 1; x += 1.1) {
    const plank = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 3.2), plankMat);
    plank.rotation.x = -Math.PI / 2;
    plank.position.set(x, 0.605, pierZ);
    scene.add(plank);
  }

  const pileMat = new THREE.MeshStandardMaterial({ color: 0x4a3522, roughness: 0.9 });
  for (let zo = -1; zo <= 1; zo += 2) {
    for (let x = pierX - pierLen / 2 + 2; x <= pierX + pierLen / 2 - 2; x += 6) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.2, 10), pileMat);
      pile.position.set(x, -0.2, pierZ + zo * 1.4);
      pile.castShadow = true;
      scene.add(pile);
    }
  }

  // Botes amarrados al pier, de distintos tamaños y colores (cerca del extremo en el mar)
  const tipX = pierX - pierLen / 2;
  const boatConfigs = [
    { x: tipX + 6, z: pierZ - 5, color: 0xd44a3a, scale: 1.0 },
    { x: tipX + 12, z: pierZ + 6, color: 0xe8e8e8, scale: 1.2 },
    { x: tipX + 4, z: pierZ - 8, color: 0x2a6ea0, scale: 0.85 },
  ];
  boatConfigs.forEach(cfg => _buildBoat(cfg.x, cfg.z, cfg.color, cfg.scale));
}

function _buildBoat(x, z, color, scale = 1) {
  const group = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.ConeGeometry(0.8, 2.6, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 })
  );
  hull.rotation.x = Math.PI / 2;
  hull.castShadow = true;
  group.add(hull);
  const trim = new THREE.Mesh(
    new THREE.TorusGeometry(0.78, 0.05, 6, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
  );
  trim.position.y = 0.15;
  group.add(trim);
  group.scale.setScalar(scale);
  group.position.set(x, 0.15, z);
  group.rotation.y = Math.random() * 0.5 - 0.25;
  scene.add(group);
}

// ─── Duchas de playa — en la arena, cerca del acceso desde estacionamiento ──
function _buildDuchas() {
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.75, roughness: 0.3 });
  const baseZ = L.PARKING.z + 4;
  [0, 1].forEach(i => {
    const x = -41, z = baseZ + i * 2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 10), metalMat);
    pole.position.set(x, 1.2, z);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), metalMat);
    head.position.set(x, 2.4, z);
    scene.add(head);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.1, 10), metalMat);
    base.position.set(x, 0.05, z);
    scene.add(base);
  });
}

// ─── Palmeras — a lo largo de la calle principal y la arena ─────────────────
function _buildPalmTrees() {
  const spots = [];
  // Borde de la calle, frente a cada casa
  L.HOUSE_ROWS_Z.forEach(z => {
    spots.push([-3.2, z + 4]);
    spots.push([3.2, z - 4]);
  });
  // En la arena, cerca del agua
  for (let z = -50; z <= 50; z += 14) spots.push([-41 + (Math.random() - 0.5) * 6, z]);
  // Cerca del pier
  spots.push([-32, L.PIER.z + 8], [-32, L.PIER.z - 10]);

  spots.forEach(([x, z]) => _palmTree(x, z));
}

function _palmTree(x, z) {
  const group = new THREE.Group();
  const h = 2.8 + Math.random() * 1.3;
  const lean = (Math.random() - 0.5) * 0.5;

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.3, h * 0.45, 0),
    new THREE.Vector3(lean * 0.8, h * 0.8, 0),
    new THREE.Vector3(lean, h, 0),
  ]);
  const trunkGeo = new THREE.TubeGeometry(curve, 12, 0.13, 8, false);
  const trunk = new THREE.Mesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x8a6a3f, roughness: 0.8 }));
  trunk.castShadow = true;
  group.add(trunk);

  const topPos = curve.getPoint(1);
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 0.7, side: THREE.DoubleSide });
  const darkFrondMat = new THREE.MeshStandardMaterial({ color: 0x2f5e38, roughness: 0.75, side: THREE.DoubleSide });
  const frondCount = 7;
  for (let i = 0; i < frondCount; i++) {
    const frond = new THREE.Mesh(_palmFrondGeometry(), i % 2 === 0 ? frondMat : darkFrondMat);
    frond.position.copy(topPos);
    frond.rotation.y = (i / frondCount) * Math.PI * 2;
    frond.rotation.z = -Math.PI / 2.5 + (Math.random() - 0.5) * 0.15;
    frond.castShadow = true;
    group.add(frond);
  }

  group.position.set(x, 0, z);
  group.rotation.y = Math.random() * Math.PI * 2;
  scene.add(group);
}

function _palmFrondGeometry() {
  const length = 1.5 + Math.random() * 0.6;
  const geo = new THREE.PlaneGeometry(0.34, length, 2, 8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = Math.min(1, Math.max(0, (y + length / 2) / length));
    const droop = Math.pow(t, 1.6) * 0.55;
    const taper = (1 - t * 0.75);
    pos.setX(i, pos.getX(i) * taper);
    pos.setZ(i, -droop);
  }
  geo.translate(0, length / 2, 0);
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ─── Vegetación adicional: arbustos en el jardín/césped ──────────────────────
function _buildVegetation() {
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x4a7a4a, roughness: 0.9 });
  for (let i = 0; i < 18; i++) {
    const x = 10 + Math.random() * 20;
    const z = -38 + Math.random() * 76;
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.5 + Math.random() * 0.4, 8, 8), bushMat);
    bush.position.set(x, 0.4, z);
    bush.scale.y = 0.7;
    bush.castShadow = true;
    scene.add(bush);
  }
}

// ─── Vehículos — circulan por la avenida principal (eje Z) ───────────────────
let vehicleGroup = [];
function _buildVehicles() {
  vehicleGroup.push(_buildCar(0, -20, 0xc0392b, false));
  vehicleGroup.push(_buildCar(0, 15, 0x2e7d4f, true)); // "patrulla" verde/blanco
}

function _buildCar(x, z, color, isPatrol) {
  const group = new THREE.Group();
  const bodyColor = isPatrol ? 0xffffff : color;

  // Carrocería principal: caja redondeada baja y alargada (más orgánica que un cubo)
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(1.7, 0.55, 0.92, 4, 0.12),
    new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.5, roughness: 0.28 })
  );
  body.position.y = 0.42;
  body.castShadow = true;
  group.add(body);

  if (isPatrol) {
    const stripe = new THREE.Mesh(
      new RoundedBoxGeometry(1.72, 0.16, 0.94, 2, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x2e7d4f, metalness: 0.3, roughness: 0.4 })
    );
    stripe.position.y = 0.42;
    group.add(stripe);
    const lightbar = new THREE.Mesh(
      new RoundedBoxGeometry(0.5, 0.1, 0.3, 2, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    lightbar.position.set(0, 0.76, 0);
    group.add(lightbar);
    [-0.12, 0.12].forEach((dz, i) => {
      const beacon = new THREE.Mesh(
        new RoundedBoxGeometry(0.18, 0.08, 0.12, 2, 0.03),
        new THREE.MeshStandardMaterial({ color: i === 0 ? 0xff2020 : 0x2050ff, emissive: i === 0 ? 0xff2020 : 0x2050ff, emissiveIntensity: 0.6 })
      );
      beacon.position.set(0, 0.82, dz);
      group.add(beacon);
    });
  }

  // Cabina: más angosta que la carrocería y con techo redondeado, da el
  // efecto de "domo" en vez de bloque cúbico encima del cuerpo.
  const cabin = new THREE.Mesh(
    new RoundedBoxGeometry(0.95, 0.38, 0.78, 4, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x232323, metalness: 0.25, roughness: 0.45 })
  );
  cabin.position.set(-0.05, 0.78, 0);
  cabin.scale.set(1, 1, 0.92);
  cabin.castShadow = true;
  group.add(cabin);

  // Parabrisas inclinado (no vertical) — plano rotado para simular el rake real
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x9fd0e8, metalness: 0.3, roughness: 0.08, transparent: true, opacity: 0.72,
  });
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.34), glassMat);
  windshield.position.set(0.42, 0.78, 0);
  windshield.rotation.y = Math.PI / 2;
  windshield.rotation.z = -0.32; // inclinación tipo parabrisas real
  group.add(windshield);
  const rearWindow = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), glassMat);
  rearWindow.position.set(-0.52, 0.78, 0);
  rearWindow.rotation.y = -Math.PI / 2;
  rearWindow.rotation.z = 0.26;
  group.add(rearWindow);

  const headlightMat = new THREE.MeshStandardMaterial({ color: 0xfff6cc, emissive: 0xfff6cc, emissiveIntensity: 0.3 });
  [[-1, 0.28], [-1, -0.28]].forEach(([dx, dz]) => {
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), headlightMat);
    hl.position.set(dx * 0.78, 0.42, dz * 0.85);
    group.add(hl);
  });
  const taillightMat = new THREE.MeshStandardMaterial({ color: 0xaa1818, emissive: 0xaa1818, emissiveIntensity: 0.4 });
  [[1, 0.28], [1, -0.28]].forEach(([dx, dz]) => {
    const tl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), taillightMat);
    tl.position.set(dx * 0.78, 0.42, dz * 0.85);
    group.add(tl);
  });

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.7, roughness: 0.25 });
  [[-0.62, -0.42], [0.62, -0.42], [-0.62, 0.42], [0.62, 0.42]].forEach(([wx, wz]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.19, 20), wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.24, wz);
    wheel.castShadow = true;
    group.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12), hubMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.copy(wheel.position);
    hub.position.z += wz > 0 ? 0.1 : -0.1;
    group.add(hub);
  });

  group.position.set(x, 0, z);
  group.rotation.y = Math.PI / 2; // orientado a lo largo del eje Z (la calle)
  group.userData.driveBaseZ = z;
  group.userData.driveSpeed = 3 + Math.random() * 2;
  group.userData.driveDir = Math.random() > 0.5 ? 1 : -1;
  group.userData.driveRange = 38;
  scene.add(group);
  return group;
}

// ─── Postes de luz — con PointLight real, activa en Modo Noche ─────────────
function _buildLampPosts() {
  const positions = [];
  L.HOUSE_ROWS_Z.forEach(z => {
    positions.push([-2.3, z + 2]);
    positions.push([2.3, z - 2]);
  });
  positions.push([-2.3, L.PARKING.z], [2.3, L.PARKING.z - 8]);

  positions.forEach(([x, z]) => {
    const group = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.4 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 8), poleMat);
    pole.position.y = 1.6;
    pole.castShadow = true;
    group.add(pole);

    const armDir = x < 0 ? 1 : -1;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), poleMat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(armDir * 0.3, 3.15, 0);
    group.add(arm);

    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfff4cc, emissive: 0xfff4cc, emissiveIntensity: 0, roughness: 0.3,
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), bulbMat);
    bulb.position.set(armDir * 0.6, 3.1, 0);
    group.add(bulb);

    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.5, roughness: 0.5 })
    );
    shade.position.set(armDir * 0.6, 3.22, 0);
    group.add(shade);

    const light = new THREE.PointLight(0xfff4cc, 0, 9, 2);
    light.position.set(armDir * 0.6, 3.0, 0);
    light.castShadow = false; // muchos postes con sombra dinámica saldría caro en GPU
    group.add(light);

    group.position.set(x, 0, z);
    scene.add(group);
    lampLights.push({ mesh: bulb, light });
  });
}

// ─── Peces — pequeños bancos nadando bajo la superficie del agua ───────────
function _buildFish() {
  fishGroup = new THREE.Group();
  const fishMat = new THREE.MeshStandardMaterial({ color: 0x6fa8c8, roughness: 0.4, metalness: 0.3 });
  const schoolCount = 5;
  for (let s = 0; s < schoolCount; s++) {
    const schoolCenter = new THREE.Vector3(-90 - Math.random() * 60, -0.6 - Math.random() * 0.8, (Math.random() - 0.5) * 80);
    const fishCount = 4 + Math.floor(Math.random() * 5);
    const school = new THREE.Group();
    school.userData.center = schoolCenter.clone();
    school.userData.radius = 2 + Math.random() * 2;
    school.userData.speed = 0.3 + Math.random() * 0.3;
    school.userData.phase = Math.random() * Math.PI * 2;
    for (let i = 0; i < fishCount; i++) {
      const fish = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 6), fishMat);
      fish.rotation.z = Math.PI / 2;
      fish.userData.phase = Math.random() * Math.PI * 2;
      fish.userData.radius = 0.6 + Math.random() * 1.2;
      fish.userData.speed = 0.6 + Math.random() * 0.5;
      fish.userData.yOff = (Math.random() - 0.5) * 0.4;
      school.add(fish);
    }
    school.position.copy(schoolCenter);
    fishGroup.add(school);
  }
  scene.add(fishGroup);
}

function _updateFish(t) {
  if (!fishGroup) return;
  fishGroup.children.forEach(school => {
    const orbitAngle = t * school.userData.speed + school.userData.phase;
    school.position.x = school.userData.center.x + Math.cos(orbitAngle) * school.userData.radius * 3;
    school.position.z = school.userData.center.z + Math.sin(orbitAngle) * school.userData.radius * 3;
    school.children.forEach(fish => {
      const a = t * fish.userData.speed + fish.userData.phase;
      fish.position.x = Math.cos(a) * fish.userData.radius;
      fish.position.z = Math.sin(a) * fish.userData.radius;
      fish.position.y = fish.userData.yOff + Math.sin(a * 2) * 0.06;
      fish.rotation.y = -a - Math.PI / 2;
    });
  });
}

// ─── Barco grande — aparece aleatoriamente en el horizonte (megabuque/crucero) ─
function _spawnBigShip() {
  if (bigShipGroup) { scene.remove(bigShipGroup); bigShipGroup = null; }

  const isCruise = Math.random() > 0.5;
  const group = new THREE.Group();

  if (isCruise) {
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.2, 14),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.2 })
    );
    hull.position.y = 0.6;
    group.add(hull);
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.42, 0.25, 14.1),
      new THREE.MeshStandardMaterial({ color: 0x1a5fa0, roughness: 0.5 })
    );
    stripe.position.y = 0.2;
    group.add(stripe);
    for (let d = 0; d < 4; d++) {
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(2.0 - d * 0.3, 0.5, 11 - d * 1.8),
        new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.5 })
      );
      deck.position.set(0, 1.2 + d * 0.5, -1 + d * 0.3);
      group.add(deck);
    }
    const funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.4, 1.2, 12),
      new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 })
    );
    funnel.position.set(0, 3.6, 2);
    group.add(funnel);
  } else {
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(3.0, 1.6, 22),
      new THREE.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.6, metalness: 0.3 })
    );
    hull.position.y = 0.8;
    group.add(hull);
    for (let c = 0; c < 5; c++) {
      const container = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.5, 1.6),
        new THREE.MeshStandardMaterial({ color: [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12][c % 4], roughness: 0.7 })
      );
      container.position.set(0, 1.85, -8 + c * 4);
      group.add(container);
    }
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.8, 2.4),
      new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 })
    );
    bridge.position.set(0, 2.5, 9.5);
    group.add(bridge);
  }

  const startZ = -110, endZ = 110;
  const shipX = -190 - Math.random() * 40; // bien en el horizonte, lejos de la costa
  group.position.set(shipX, 0, startZ);
  group.userData.startZ = startZ;
  group.userData.endZ = endZ;
  group.userData.speed = 4 + Math.random() * 2;
  scene.add(group);
  bigShipGroup = group;
}

function _updateBigShip(dt, t) {
  bigShipTimer -= dt;
  if (bigShipTimer <= 0) {
    if (!bigShipGroup) {
      _spawnBigShip();
      bigShipTimer = 25 + Math.random() * 20; // tiempo navegando antes de desaparecer
    } else {
      scene.remove(bigShipGroup);
      bigShipGroup = null;
      bigShipTimer = 30 + Math.random() * 40; // tiempo de espera antes del próximo barco
    }
  }
  if (bigShipGroup) {
    bigShipGroup.position.z += bigShipGroup.userData.speed * dt;
    if (bigShipGroup.position.z > bigShipGroup.userData.endZ) {
      scene.remove(bigShipGroup);
      bigShipGroup = null;
      bigShipTimer = 30 + Math.random() * 40;
    }
  }
}

// ─── Pozo de excavación — aparece sobre el punto exacto de la fuga ──────────
function _buildExcavationPit() {
  const group = new THREE.Group();

  // Hueco visual: disco oscuro con borde de tierra removida apilada alrededor
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.95 });
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.7, 0.5, 16), holeMat);
  hole.position.y = -0.2;
  group.add(hole);

  // Borde de tierra excavada (montículo irregular alrededor del hueco)
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0x6a5a3e, roughness: 0.95 });
  for (let i = 0; i < 5; i++) {
    const clump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28 + Math.random() * 0.18, 0), dirtMat);
    const a = (i / 5) * Math.PI * 2 + Math.random() * 0.4;
    clump.position.set(Math.cos(a) * 1.15, 0.1, Math.sin(a) * 1.15);
    clump.rotation.set(Math.random(), Math.random(), Math.random());
    group.add(clump);
  }

  // Tramo de tubería rota, visible dentro del pozo
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x1f9e7a, metalness: 0.3, roughness: 0.4 });
  const brokenPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 12), pipeMat);
  brokenPipe.rotation.z = Math.PI / 2;
  brokenPipe.position.y = -0.15;
  group.add(brokenPipe);
  // Grieta visible: dos mitades del tubo levemente separadas
  brokenPipe.scale.x = 0.46;
  const brokenPipe2 = brokenPipe.clone();
  brokenPipe.position.x = -0.42;
  brokenPipe2.position.x = 0.42;
  group.add(brokenPipe2);

  // Conos de seguridad alrededor
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6a1f, roughness: 0.7 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  [[1.6, 1.6], [-1.6, 1.6], [1.6, -1.6], [-1.6, -1.6]].forEach(([cx, cz]) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 10), coneMat);
    cone.position.set(cx, 0.225, cz);
    cone.castShadow = true;
    group.add(cone);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 10), stripeMat);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.set(cx, 0.27, cz);
    group.add(stripe);
  });

  // Cinta de seguridad perimetral (naranja/blanca)
  const tapeMat = new THREE.MeshBasicMaterial({ color: 0xff5500, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const a1 = (i / 4) * Math.PI * 2, a2 = ((i + 1) / 4) * Math.PI * 2;
    const p1 = new THREE.Vector3(Math.cos(a1) * 1.6, 0.35, Math.sin(a1) * 1.6);
    const p2 = new THREE.Vector3(Math.cos(a2) * 1.6, 0.35, Math.sin(a2) * 1.6);
    const mid = p1.clone().add(p2).multiplyScalar(0.5);
    const dist = p1.distanceTo(p2);
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(dist, 0.15), tapeMat);
    tape.position.copy(mid);
    tape.lookAt(p2.x, mid.y, p2.z);
    group.add(tape);
  }

  group.visible = false;
  scene.add(group);
  return group;
}

// ─── Chorro de agua a presión — sale del punto de la rotura ─────────────────
function _buildWaterJet() {
  const jetMat = new THREE.MeshBasicMaterial({ color: 0xbfe8f5, transparent: true, opacity: 0.55 });
  const jet = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 10, 1, true), jetMat);
  jet.position.y = 1.1;
  jet.visible = false;
  scene.add(jet);
  return jet;
}

// ─── Técnico de reparación — camioneta + DOS figuras humanas + pozo + chorro ─
let repairGroup = null;
let repairState = null; // null | 'driving_in' | 'working' | 'driving_out'
let repairTarget = new THREE.Vector3();
let waterJet = null;
let pitGroup = null;
const REPAIR_BASE = new THREE.Vector3(L.PARKING.x, 0, L.PARKING.z); // sale del estacionamiento

function _buildRepairTech() {
  const group = new THREE.Group();

  const truck = new THREE.Group();
  const truckBody = new THREE.Mesh(
    new RoundedBoxGeometry(2.0, 0.8, 1.1, 4, 0.1),
    new THREE.MeshStandardMaterial({ color: 0xe8a020, metalness: 0.35, roughness: 0.4 })
  );
  truckBody.position.y = 0.55;
  truckBody.castShadow = true;
  truck.add(truckBody);
  const truckCabin = new THREE.Mesh(
    new RoundedBoxGeometry(0.85, 0.5, 1.0, 4, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xf0f0f0, metalness: 0.2, roughness: 0.4 })
  );
  truckCabin.position.set(0.6, 1.0, 0);
  truck.add(truckCabin);
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0xff8800, emissiveIntensity: 0.7 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), beaconMat);
  beacon.position.set(0.6, 1.32, 0);
  truck.add(beacon);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
  [[-0.7, -0.5], [0.7, -0.5], [-0.7, 0.5], [0.7, 0.5]].forEach(([wx, wz]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.22, 16), wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.26, wz);
    truck.add(wheel);
  });
  truck.userData.beacon = beacon;
  truck.position.set(-1.8, 0, -1.8);
  group.add(truck);
  group.userData.truck = truck;

  // Dos técnicos: uno cavando/reparando junto al pozo, otro supervisando
  const tools = [];
  [
    { pos: [0.5, 0, 1.2], toolType: 'wrench' },
    { pos: [-0.6, 0, 0.9], toolType: 'shovel' },
  ].forEach(({ pos, toolType }) => {
    const tech = new THREE.Group();
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2a3a5a, roughness: 0.8 });
    const vestMat = new THREE.MeshStandardMaterial({ color: 0xff8800, roughness: 0.7 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd8a878, roughness: 0.8 });
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0xf0d020, roughness: 0.4, metalness: 0.2 });

    [-0.08, 0.08].forEach(dx => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), legMat);
      leg.position.set(dx, 0.25, 0);
      tech.add(leg);
    });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.4, 8), vestMat);
    torso.position.y = 0.7;
    tech.add(torso);
    [-0.18, 0.18].forEach(dx => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.38, 8), skinMat);
      arm.position.set(dx, 0.65, 0);
      arm.rotation.z = dx > 0 ? -0.15 : 0.15;
      tech.add(arm);
    });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), skinMat);
    head.position.y = 1.0;
    tech.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.8), helmetMat);
    helmet.position.y = 1.04;
    tech.add(helmet);

    const tool = toolType === 'shovel'
      ? new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.14), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.6 }))
      : new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.04), new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.3 }));
    tool.position.set(0.2, 0.45, 0.1);
    tech.add(tool);
    tech.userData.tool = tool;
    tech.userData.toolType = toolType;

    tech.position.set(...pos);
    group.add(tech);
    tools.push(tech);
  });
  group.userData.techs = tools;

  group.visible = false;
  scene.add(group);
  return group;
}

export function setActiveLeakPosition(pos) {
  leakActivePos = pos ? pos.clone() : null;
}
export function clearActiveLeakPosition() {
  leakActivePos = null;
}

export function dispatchRepairTech(targetPos) {
  if (!repairGroup) repairGroup = _buildRepairTech();
  if (!pitGroup) pitGroup = _buildExcavationPit();
  if (!waterJet) waterJet = _buildWaterJet();

  repairTarget.copy(targetPos).add(new THREE.Vector3(1.2, 0, 1.2));
  repairGroup.position.copy(REPAIR_BASE);
  repairGroup.rotation.y = Math.atan2(repairTarget.x - REPAIR_BASE.x, repairTarget.z - REPAIR_BASE.z);
  repairGroup.visible = true;
  repairState = 'driving_in';

  pitGroup.position.copy(targetPos);
  pitGroup.visible = false; // se revela al llegar el técnico, no antes

  waterJet.position.copy(targetPos).add(new THREE.Vector3(0, 0.2, 0));
  waterJet.visible = true; // el chorro sale desde que se activa la fuga
}

export function recallRepairTech() {
  if (!repairGroup || !repairGroup.visible) return;
  repairGroup.rotation.y = Math.atan2(REPAIR_BASE.x - repairGroup.position.x, REPAIR_BASE.z - repairGroup.position.z);
  repairState = 'driving_out';
  if (waterJet) waterJet.visible = false; // se corta el chorro: válvula cerrada
}

function _updateRepairTech(t, dt) {
  if (waterJet && waterJet.visible) {
    waterJet.scale.y = 0.85 + Math.sin(t * 22) * 0.18;
    waterJet.material.opacity = 0.45 + Math.sin(t * 16) * 0.15;
  }
  if (!repairGroup || !repairState) return;
  const speed = 9;

  if (repairState === 'driving_in') {
    const dir = new THREE.Vector3().subVectors(repairTarget, repairGroup.position);
    const dist = dir.length();
    if (dist < 0.3) {
      repairState = 'working';
      if (pitGroup) pitGroup.visible = true; // se abre la tierra al llegar el equipo
    } else {
      dir.normalize();
      repairGroup.position.addScaledVector(dir, speed * dt);
    }
  } else if (repairState === 'working') {
    (repairGroup.userData.techs || []).forEach((tech, i) => {
      const tool = tech.userData.tool;
      if (!tool) return;
      if (tech.userData.toolType === 'shovel') {
        tool.position.y = 0.4 + Math.sin(t * 6 + i) * 0.12;
        tool.rotation.x = Math.sin(t * 6 + i) * 0.4;
      } else {
        tool.rotation.z = Math.sin(t * 14 + i) * 0.5;
      }
    });
    const beacon = repairGroup.userData.truck?.userData.beacon;
    if (beacon) beacon.material.emissiveIntensity = 0.5 + Math.sin(t * 10) * 0.4;
  } else if (repairState === 'driving_out') {
    const dir = new THREE.Vector3().subVectors(REPAIR_BASE, repairGroup.position);
    const dist = dir.length();
    if (dist < 0.5) {
      repairGroup.visible = false;
      if (pitGroup) pitGroup.visible = false; // se rellena/cierra el pozo
      repairState = null;
    } else {
      dir.normalize();
      repairGroup.position.addScaledVector(dir, speed * dt);
    }
  }
}

// ─── Modos visuales: día/noche, radiografía, vista limpia, red de tuberías ──
export function toggleDayNight() {
  isNight = !isNight;
  const sky = scene.children.find(o => o.userData.isSky);
  const stars = scene.children.find(o => o.userData.isStars);

  if (isNight) {
    if (sky) { sky.material.uniforms.uTopColor.value.set(0x0a1230); sky.material.uniforms.uHorizonColor.value.set(0x1a2a4a); }
    scene.fog.color.set(0x0a1230);
    hemiLight.intensity = 0.22; hemiLight.color.set(0x335577); hemiLight.groundColor.set(0x14202c);
    sunLight.intensity = 0.05;
    fillLight.intensity = 0.08;
    sun.visible = false;
    moon.visible = true;
    if (stars) stars.material.opacity = 0.9;
    renderer.toneMappingExposure = 0.8;
  } else {
    if (sky) { sky.material.uniforms.uTopColor.value.set(0x4a8fcb); sky.material.uniforms.uHorizonColor.value.set(0x9cd2e8); }
    scene.fog.color.set(0xb9e6f2);
    hemiLight.intensity = 1.0; hemiLight.color.set(0x9ecfea); hemiLight.groundColor.set(0xc8b870);
    sunLight.intensity = 2.2;
    fillLight.intensity = 0.35;
    sun.visible = true;
    moon.visible = false;
    if (stars) stars.material.opacity = 0;
    renderer.toneMappingExposure = 1.1;
  }
  lampLights.forEach(l => { l.light.intensity = isNight ? 2.2 : 0; l.mesh.material.emissiveIntensity = isNight ? 1.0 : 0; });
  return isNight;
}

export function toggleXray() {
  isXray = !isXray;
  [sandMat, gardenMat].forEach(m => {
    if (!m) return;
    m.transparent = isXray;
    m.opacity = isXray ? 0.35 : 1;
  });
  if (isXray) pipeGroup.visible = true;
  else if (!pipesVisible) pipeGroup.visible = false;
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

// ─── UI: conecta los botones (listeners adicionales — no reemplaza los que
// main.js ya conecta a leaks.js para btn-daynight/btn-xray/btn-clean) ────────
function _wireUI() {
  // El modo noche real lo dispara leaks.js (toggleNightMode), que emite un
  // evento custom. scene.js escucha ese evento para sincronizar el cielo.
  window.addEventListener('leaks:nightMode', (e) => {
    if (e.detail.active !== isNight) toggleDayNight();
  });

  // btn-xray ya dispara runDiagnostic() desde main.js; aquí agregamos el
  // efecto visual de radiografía (transparencia + tuberías) sin pisar eso.
  const btnXray = document.getElementById('btn-xray');
  if (btnXray) btnXray.addEventListener('click', () => {
    const xray = toggleXray();
    btnXray.classList.toggle('active', xray);
  });

  // btn-pipes: no está conectado por main.js, así que lo controlamos aquí.
  const btnPipes = document.getElementById('btn-pipes');
  if (btnPipes) btnPipes.addEventListener('click', () => {
    const visible = togglePipes();
    btnPipes.classList.toggle('active', visible);
    btnPipes.innerHTML = visible
      ? '<span class="cam-icon">📐</span> Ocultar Red de Tuberías'
      : '<span class="cam-icon">📐</span> Mostrar Red de Tuberías';
  });
}

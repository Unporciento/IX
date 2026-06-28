import * as THREE from 'three';
import { initControls, updateControls } from './controls.js';
import { initLeaks, updateLeaks } from './leaks.js';
import * as L from './layout.js';

// ─── Estado del módulo ────────────────────────────────────────────────────────
let scene, camera, renderer, clock, composer;
let sun, moon, hemiLight, sunLight, fillLight, rimLight;
let oceanMat, sandMat, grassMat;
let cloudGroup = [];
let isNight = false;
let isXray  = false;
let isClean = false;
let pipesVisible = false;
let pipeGroup, pipeGlowGroup, pipeFlowGroup;
let repairGroup, leakFxGroup;
let threeInitDone = false;
let frameCount = 0;

// Estado de fuga / flujo / reparación
let _activeLeakPos     = null;
let _flowParticles     = [];
let _closedValves      = new Set();
let _repairTechs       = [];
let _fishGroup         = null;
let _boatGroups        = [];
let _leakSpray         = null;
let _excavationGroup   = null;
let _brokenPipeGroup   = null;

// Instanced meshes para vegetación
let palmInstances = [];
let environmentalObjects = [];

// ─── Texturas procedurales ────────────────────────────────────────────────────
function _makeNoiseTexture(size = 256, scale = 8, octaves = 4) {
  const data = new Uint8Array(size * size * 4);
  // Hash function for pseudo-random noise
  const hash = (x, y) => {
    let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const smoothNoise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return hash(ix, iy) * (1-ux) * (1-uy) +
           hash(ix+1, iy) * ux * (1-uy) +
           hash(ix, iy+1) * (1-ux) * uy +
           hash(ix+1, iy+1) * ux * uy;
  };

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      let val = 0, amp = 1, freq = 1, max = 0;
      for (let o = 0; o < octaves; o++) {
        val += smoothNoise(i / size * scale * freq, j / size * scale * freq) * amp;
        max += amp; amp *= 0.5; freq *= 2;
      }
      val /= max;
      const idx = (i * size + j) * 4;
      data[idx] = data[idx+1] = data[idx+2] = Math.floor(val * 255);
      data[idx+3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function _makeSandTexture() {
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  const hash = (x, y) => { let n = Math.sin(x*127.1+y*311.7)*43758.5; return n-Math.floor(n); };
  const noise = (x, y) => {
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
    const ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy);
    return hash(ix,iy)*(1-ux)*(1-uy)+hash(ix+1,iy)*ux*(1-uy)+hash(ix,iy+1)*(1-ux)*uy+hash(ix+1,iy+1)*ux*uy;
  };
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      let v = 0, a = 1, f = 1, m = 0;
      for (let o = 0; o < 5; o++) { v += noise(i/size*12*f, j/size*12*f)*a; m+=a; a*=0.5; f*=2; }
      v /= m;
      const sandy = 0.78 + v * 0.22;
      const idx = (i * size + j) * 4;
      data[idx]   = Math.floor(233 * sandy);
      data[idx+1] = Math.floor(210 * sandy);
      data[idx+2] = Math.floor(168 * sandy);
      data[idx+3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  return tex;
}

function _makeGrassTexture() {
  // Pese al nombre (se mantiene para no romper referencias), esta textura ya
  // NO es pasto: genera un suelo de playa/terreno arenoso tierra adentro —
  // arena compactada con manchas dispersas de matorral seco (vegetación rala),
  // 100% procedural (dos capas de ruido: una fina para grano de arena, otra
  // grande y de baja frecuencia para las manchas de matorral).
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  const hash = (x, y) => { let n = Math.sin(x*357.1+y*521.7)*43758.5; return n-Math.floor(n); };
  const noise = (x, y) => {
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
    const ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy);
    return hash(ix,iy)*(1-ux)*(1-uy)+hash(ix+1,iy)*ux*(1-uy)+hash(ix,iy+1)*(1-ux)*uy+hash(ix+1,iy+1)*ux*uy;
  };
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      // Grano fino de arena/tierra compactada
      let v = 0, a = 1, f = 1, m = 0;
      for (let o = 0; o < 5; o++) { v += noise(i/size*14*f, j/size*14*f)*a; m+=a; a*=0.5; f*=2; }
      v /= m;

      // Manchas grandes y dispersas de matorral/vegetación seca
      let patch = 0, a2 = 1, f2 = 1, m2 = 0;
      for (let o = 0; o < 3; o++) { patch += noise(i/size*5*f2 + 41, j/size*5*f2 + 17)*a2; m2+=a2; a2*=0.5; f2*=2; }
      patch /= m2;

      const sandy = 0.72 + v * 0.28;
      let r = 213 * sandy, g = 188 * sandy, b = 140 * sandy;

      if (patch > 0.6) {
        const mix = Math.min(1, (patch - 0.6) / 0.28) * 0.5;
        r = r * (1 - mix) + 118 * mix;
        g = g * (1 - mix) + 124 * mix;
        b = b * (1 - mix) + 76  * mix;
      }

      const idx = (i * size + j) * 4;
      data[idx]   = Math.floor(r);
      data[idx+1] = Math.floor(g);
      data[idx+2] = Math.floor(b);
      data[idx+3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  return tex;
}

function _makeRoughTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const hash = (x,y)=>{let n=Math.sin(x*127.1+y*311.7)*43758.5;return n-Math.floor(n);};
  for(let i=0;i<size;i++) for(let j=0;j<size;j++){
    const v=Math.floor(hash(i*0.5,j*0.5)*80+170);
    const idx=(i*size+j)*4;
    data[idx]=data[idx+1]=data[idx+2]=v; data[idx+3]=255;
  }
  const tex=new THREE.DataTexture(data,size,size);
  tex.needsUpdate=true; tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  return tex;
}

// ─── Punto de entrada ─────────────────────────────────────────────────────────
export function initThree() {
  if (threeInitDone) return;
  threeInitDone = true;

  const canvas = document.getElementById('maqueta-canvas');
  scene  = new THREE.Scene();
  clock  = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(42, canvas.clientWidth / canvas.clientHeight, 0.1, 800);
  camera.position.set(35, 28, 50);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
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
  _buildPipeFlow();
  _buildRepairCrew();
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
  _buildOceanFoam();
  _buildWaves();
  _buildMarineLife();
  _buildRocks();
  _buildLampPosts();

  initControls(camera, renderer.domElement);
  initLeaks(scene);

  window.addEventListener('resize', _resize);
  _wireUI();

  renderer.setAnimationLoop(_tick);
}

// ─── Loop ──────────────────────────────────────────────────────────────────────
function _tick() {
  const t = clock.getElapsedTime();
  frameCount++;

  if (oceanMat) {
    oceanMat.uniforms.uTime.value = t;
  }

  // Nubes
  cloudGroup.forEach((c, i) => {
    c.position.x += 0.006 * (0.6 + i * 0.08);
    if (c.position.x > 130) c.position.x = -130;
    c.position.y = 28 + Math.sin(t * 0.15 + i) * 0.4;
  });

  // Pipe glow
  if (pipeGlowGroup) {
    pipeGlowGroup.children.forEach((m, i) => {
      m.material.opacity = (isXray && pipesVisible)
        ? (0.45 + Math.sin(t * 2.5 + i * 0.7) * 0.2)
        : 0;
    });
  }

  _updatePipeFlow(t);
  _updateRepairCrew(t);
  _updateMarineLife(t);
  _updateLeakFx(t);
  _updateBoats(t);

  // Animate waves (costa oeste — se mueven en X)
  scene.traverse(obj => {
    if (obj.userData.isWave) {
      obj.position.x = obj.userData.waveX + Math.sin(t * 0.8 + obj.userData.wavePhase) * 0.4;
      obj.material.opacity = 0.3 + Math.sin(t * 1.2 + obj.userData.wavePhase) * 0.12;
    }
    if (obj.userData.isFoam) {
      obj.material.opacity = 0.55 + Math.sin(t * 1.8 + obj.userData.foamPhase) * 0.25;
    }
    if (obj.userData.isLamp) {
      if (isNight) {
        obj.material.emissiveIntensity = 1.5 + Math.sin(t * 30 + obj.userData.lampIdx) * 0.05;
      }
    }
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

// ─── Cielo con gradiente atmosférico ─────────────────────────────────────────
function _buildSky() {
  // Shader sky dome — gradient from zenith to horizon
  const skyGeo = new THREE.SphereGeometry(400, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTopColor:    { value: new THREE.Color(0x4a8fcb) },
      uHorizonColor:{ value: new THREE.Color(0x9cd2e8) },
      uFogColor:    { value: new THREE.Color(0xb9e6f2) },
      uFogDensity:  { value: 0.004 },
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

  // Sol con halo
  sun = new THREE.Group();
  const sunCore = new THREE.Mesh(
    new THREE.SphereGeometry(2.5, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xfffde8 })
  );
  sun.add(sunCore);

  // Halo exterior del sol
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xffd080, transparent: true, opacity: 0.18, side: THREE.DoubleSide
  });
  for (let i = 0; i < 3; i++) {
    const halo = new THREE.Mesh(new THREE.SphereGeometry(3.5 + i * 1.8, 24, 24), haloMat);
    sun.add(halo);
  }
  sun.position.set(50, 48, -60);
  scene.add(sun);

  // Moon
  moon = new THREE.Group();
  const moonCore = new THREE.Mesh(
    new THREE.SphereGeometry(2.0, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0xd8e4f2, emissive: 0x8899bb, emissiveIntensity: 0.3, roughness: 0.8 })
  );
  moon.add(moonCore);
  moon.position.set(-50, 45, -60);
  moon.visible = false;
  scene.add(moon);

  // Stars (only visible at night, initially invisible)
  const starGeo = new THREE.BufferGeometry();
  const starCount = 800;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const phi = Math.acos(-1 + (2 * i) / starCount);
    const theta = Math.sqrt(starCount * Math.PI) * phi;
    starPos[i*3] = 300 * Math.sin(phi) * Math.cos(theta);
    starPos[i*3+1] = Math.abs(300 * Math.cos(phi)) + 10;
    starPos[i*3+2] = 300 * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.9, transparent: true, opacity: 0,
    sizeAttenuation: false
  }));
  stars.userData.isStars = true;
  scene.add(stars);
}

function _buildClouds() {
  // High-quality volumetric-looking clouds using layered spheres
  const cloudConfigs = [
    { x: -80, y: 32, z: -60, s: 1.8 },
    { x:  20, y: 30, z: -80, s: 2.2 },
    { x:  60, y: 34, z: -40, s: 1.5 },
    { x: -30, y: 31, z: -50, s: 2.0 },
    { x:  90, y: 35, z: -70, s: 1.6 },
    { x: -110,y: 29, z: -55, s: 1.9 },
    { x:  40, y: 33, z: -90, s: 1.4 },
    { x: -60, y: 36, z: -75, s: 2.1 },
  ];

  cloudConfigs.forEach((cfg, ci) => {
    const group = new THREE.Group();
    const puffCount = 5 + Math.floor(Math.random() * 4);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88,
      roughness: 1.0,
      metalness: 0.0,
    });

    for (let j = 0; j < puffCount; j++) {
      const s = (1.2 + Math.random() * 2.2) * cfg.s;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 10), baseMat.clone());
      puff.position.set(
        (j - puffCount/2) * 2.8 + (Math.random()-0.5) * 2,
        (Math.random()-0.3) * 1.8,
        (Math.random()-0.5) * 2.5
      );
      puff.material.opacity = 0.75 + Math.random() * 0.2;
      puff.castShadow = false;
      group.add(puff);
    }

    // Soft shadow under cloud
    const shadowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(cfg.s * puffCount * 0.3, 20),
      new THREE.MeshBasicMaterial({ color: 0x7ab0cc, transparent: true, opacity: 0.08, depthWrite: false })
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.set(0, -cfg.y + 0.1, 0);

    group.position.set(cfg.x, cfg.y, cfg.z);
    scene.add(group);
    cloudGroup.push(group);
  });
}

// ─── Iluminación cinematográfica PBR ─────────────────────────────────────────
function _buildLights() {
  // Hemisphere — sky/ground color bleed
  hemiLight = new THREE.HemisphereLight(0x9ecfea, 0xc8b870, 1.0);
  scene.add(hemiLight);

  // Key light — warm afternoon sun
  sunLight = new THREE.DirectionalLight(0xfff0d0, 2.2);
  sunLight.position.set(50, 48, -60);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(4096, 4096);
  sunLight.shadow.camera.left   = -70;
  sunLight.shadow.camera.right  =  70;
  sunLight.shadow.camera.top    =  70;
  sunLight.shadow.camera.bottom = -70;
  sunLight.shadow.camera.far    = 250;
  sunLight.shadow.bias = -0.0003;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight);

  // Fill light — bounced light from ocean/sky
  fillLight = new THREE.DirectionalLight(0x88c8e8, 0.35);
  fillLight.position.set(-30, 10, 30);
  scene.add(fillLight);

  // Rim light — soft backlight to separate objects
  rimLight = new THREE.DirectionalLight(0xffc8a0, 0.2);
  rimLight.position.set(-20, 20, -80);
  scene.add(rimLight);

  // Ambient occlusion approximation — subtle dark fill from below
  const ambOcc = new THREE.HemisphereLight(0x000000, 0x223344, 0.25);
  scene.add(ambOcc);
}

// ─── Océano mejorado: oleaje orgánico, gradiente profundo→bajío, reflejo cielo ─
function _buildOcean() {
  const geo = new THREE.PlaneGeometry(160, L.COAST_Z_MAX - L.COAST_Z_MIN + 40, 100, 64);
  oceanMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:        { value: 0 },
      uDeepColor:   { value: new THREE.Color(0x063d5c) },
      uMidColor:    { value: new THREE.Color(0x0e7a9a) },
      uShallowColor:{ value: new THREE.Color(0x28b8c8) },
      uFoamColor:   { value: new THREE.Color(0xe8f8ff) },
      uSkyColor:    { value: new THREE.Color(0x7ec8e8) },
      uSunDir:      { value: new THREE.Vector3(0.5, 0.85, 0.3).normalize() },
    },
    vertexShader: `
      uniform float uTime;
      varying float vH;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
                   mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0; float a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.1; a *= 0.48; }
        return v;
      }
      float waveH(vec2 xz) {
        float t = uTime;
        float h = sin(xz.x*0.06 + t*0.7) * cos(xz.y*0.05 + t*0.55) * 0.35;
        h += sin(xz.x*0.11 + t*1.0) * sin(xz.y*0.09 + t*0.8) * 0.18;
        h += fbm(xz * 0.08 + vec2(t*0.04, t*0.03)) * 0.22 - 0.11;
        return h;
      }

      void main() {
        vec3 p = position;
        float h = waveH(p.xy);
        p.z += h;
        vH = h;
        vUv = uv;
        vWorldPos = (modelMatrix * vec4(p, 1.0)).xyz;
        float eps = 0.35;
        float hL = waveH(vec2(p.x-eps, p.y));
        float hR = waveH(vec2(p.x+eps, p.y));
        float hD = waveH(vec2(p.x, p.y-eps));
        float hU = waveH(vec2(p.x, p.y+eps));
        vNormal = normalize(vec3(hL - hR, 2.0, hD - hU));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uDeepColor;
      uniform vec3 uMidColor;
      uniform vec3 uShallowColor;
      uniform vec3 uFoamColor;
      uniform vec3 uSkyColor;
      uniform vec3 uSunDir;
      uniform float uTime;
      varying float vH;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
                   mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
      }

      void main() {
        float shore = smoothstep(0.0, 0.55, vUv.x);
        vec3 waterColor = mix(uDeepColor, uMidColor, shore * 0.6);
        waterColor = mix(waterColor, uShallowColor, shore * shore);

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = 0.04 + 0.96 * pow(1.0 - max(0.0, dot(vNormal, viewDir)), 4.0);
        vec3 halfVec = normalize(uSunDir + viewDir);
        float spec = pow(max(0.0, dot(vNormal, halfVec)), 220.0);

        float foamN = noise(vWorldPos.xz * 0.35 + uTime * 0.15);
        float foam = smoothstep(0.08, 0.32, vH + foamN * 0.12) * (0.4 + shore * 0.6);

        float caustic = noise(vWorldPos.xz * 2.8 + uTime * 0.6) * noise(vWorldPos.xz * 3.4 - uTime * 0.45);
        caustic = smoothstep(0.35, 0.75, caustic) * 0.2 * shore;

        vec3 col = mix(waterColor, uFoamColor, foam);
        col += spec * vec3(1.2, 1.1, 0.9) * (1.0 - foam * 0.7);
        col = mix(col, uSkyColor, fresnel * 0.45);
        col += caustic * uShallowColor;

        gl_FragColor = vec4(col, 0.97);
      }
    `,
    transparent: true,
  });

  const ocean = new THREE.Mesh(geo, oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(L.OCEAN_X, -0.12, 0);
  scene.add(ocean);
}

// ─── Espuma de olas cerca de la orilla ───────────────────────────────────────
function _buildOceanFoam() {
  for (let i = 0; i < 6; i++) {
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(4, L.COAST_Z_MAX - L.COAST_Z_MIN + 20, 1, 32),
      new THREE.MeshBasicMaterial({
        color: 0xdff5ff, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide
      })
    );
    foam.rotation.x = -Math.PI / 2;
    foam.rotation.z = Math.PI / 2;
    foam.position.set(L.BEACH_CENTER_X + 8 + i * 2.5, 0.06, 0);
    foam.userData.isFoam = true;
    foam.userData.foamPhase = i * 1.2;
    scene.add(foam);
  }
}

function _buildWaves() {
  for (let i = 0; i < 5; i++) {
    const geo = new THREE.PlaneGeometry(3.5, L.COAST_Z_MAX - L.COAST_Z_MIN + 16, 1, 48);
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v);
      pos.setZ(v, Math.sin(y * 0.15 + i) * 0.12);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xa8e8f5, transparent: true, opacity: 0.35,
      roughness: 0.08, metalness: 0.15, side: THREE.DoubleSide
    });
    const wave = new THREE.Mesh(geo, mat);
    wave.rotation.x = -Math.PI / 2;
    wave.rotation.z = Math.PI / 2;
    const waveX = L.BEACH_CENTER_X + 4 + i * 2.2;
    wave.position.set(waveX, 0.07, 0);
    wave.userData.isWave = true;
    wave.userData.waveX = waveX;
    wave.userData.wavePhase = i * 1.1;
    scene.add(wave);
  }
}

// ─── Terreno con materiales PBR y texturas procedurales ──────────────────────
function _buildTerrain() {
  const sandTex   = _makeSandTexture();
  const roughTex  = _makeRoughTexture();
  const grassTex  = _makeGrassTexture();

  sandMat = new THREE.MeshStandardMaterial({
    map: sandTex,
    roughnessMap: roughTex,
    roughness: 0.92,
    metalness: 0.0,
    normalScale: new THREE.Vector2(0.3, 0.3),
  });

  const coastLen = L.COAST_Z_MAX - L.COAST_Z_MIN + 24;

  const sandGeo = new THREE.PlaneGeometry(L.BEACH_WIDTH, coastLen, 24, 48);
  const sandPos = sandGeo.attributes.position;
  for (let i = 0; i < sandPos.count; i++) {
    const x = sandPos.getX(i), y = sandPos.getY(i);
    const dune = Math.sin(x * 0.25) * Math.cos(y * 0.08) * 0.15 + Math.sin(x * 0.1 + 1) * 0.1;
    sandPos.setZ(i, dune);
  }
  sandGeo.computeVertexNormals();

  const sand = new THREE.Mesh(sandGeo, sandMat);
  sand.rotation.x = -Math.PI / 2;
  sand.rotation.z = Math.PI / 2;
  sand.position.set(L.BEACH_CENTER_X, 0, 0);
  sand.receiveShadow = true;
  scene.add(sand);

  // Jardín frente a casas (lado playa)
  const gardenMat = new THREE.MeshStandardMaterial({
    map: grassTex, roughness: 0.88, metalness: 0.0,
  });
  const gardenGeo = new THREE.PlaneGeometry(L.GARDEN_MAX_X - (-L.BEACH_CENTER_X - L.BEACH_WIDTH/2 + 4), coastLen, 20, 40);
  const garden = new THREE.Mesh(gardenGeo, gardenMat);
  garden.rotation.x = -Math.PI / 2;
  garden.rotation.z = Math.PI / 2;
  garden.position.set((L.GARDEN_MAX_X + L.BEACH_CENTER_X - L.BEACH_WIDTH/2) / 2 - 2, 0.008, 0);
  garden.receiveShadow = true;
  scene.add(garden);

  grassMat = new THREE.MeshStandardMaterial({
    map: grassTex, roughness: 0.88, metalness: 0.0,
  });

  const groundGeo = new THREE.PlaneGeometry(55, coastLen, 40, 48);
  const groundPos = groundGeo.attributes.position;
  for (let i = 0; i < groundPos.count; i++) {
    const x = groundPos.getX(i), y = groundPos.getY(i);
    const dune = Math.sin(x * 0.1 + 2) * Math.cos(y * 0.06) * 0.1;
    groundPos.setZ(i, dune);
  }
  groundGeo.computeVertexNormals();

  const grass = new THREE.Mesh(groundGeo, grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.rotation.z = Math.PI / 2;
  grass.position.set(28, 0.01, 0);
  grass.receiveShadow = true;
  scene.add(grass);

  const transitionMat = new THREE.MeshStandardMaterial({ color: 0xcdb888, roughness: 0.95 });
  const transition = new THREE.Mesh(new THREE.PlaneGeometry(4, coastLen), transitionMat);
  transition.rotation.x = -Math.PI / 2;
  transition.rotation.z = Math.PI / 2;
  transition.position.set(L.GARDEN_MAX_X - 2, 0.005, 0);
  scene.add(transition);
}

// ─── Detalles de playa ────────────────────────────────────────────────────────
function _buildBeachDetails() {
  const umbrellaSpots = [[-48,-25], [-46,-5], [-50,8], [-44,22], [-47,35]];
  umbrellaSpots.forEach(([x, z]) => _buildUmbrella(x, z));

  const chairSpots = [[-47,-24], [-45,-4], [-49,9], [-43,21]];
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

  // Canopy - cone with segments for realistic look
  const canopyGeo = new THREE.ConeGeometry(1.4, 0.5, 12);
  const canopyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.set(x, 2.4, z);
  canopy.castShadow = true;
  scene.add(canopy);

  // Canopy tip
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  tip.position.set(x, 2.68, z);
  scene.add(tip);
}

function _buildBeachChair(x, z) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xf0d080, roughness: 0.9 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 1.4), mat);
  frame.position.set(x, 0.2, z);
  frame.rotation.x = -0.15;
  frame.castShadow = true;
  scene.add(frame);
}

// ─── Calles PBR con trazado más rico ─────────────────────────────────────────
function _buildRoads() {
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x4a4e52, roughness: 0.85, metalness: 0.05,
  });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const yellowMat = new THREE.MeshBasicMaterial({ color: 0xf0c820 });
  const coastLen = L.COAST_Z_MAX - L.COAST_Z_MIN + 20;

  // Avenida principal (paralela a la costa, eje Z)
  const mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(4.6, coastLen), roadMat);
  mainRoad.rotation.x = -Math.PI / 2;
  mainRoad.position.set(0, 0.015, 0);
  mainRoad.receiveShadow = true;
  scene.add(mainRoad);
  _dashedLine(0, 0, coastLen - 4, 'z', lineMat);

  [-2.3, 2.3].forEach(ox => {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.12, coastLen), yellowMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(ox, 0.025, 0);
    scene.add(edge);
  });

  // Calle transversal
  const crossRoad = new THREE.Mesh(new THREE.PlaneGeometry(38, 4.4), roadMat);
  crossRoad.rotation.x = -Math.PI / 2;
  crossRoad.position.set(0, 0.015, 0);
  crossRoad.receiveShadow = true;
  scene.add(crossRoad);
  _dashedLine(0, 0, 36, 'x', lineMat);

  const curbMat = new THREE.MeshStandardMaterial({ color: 0xc8c2b5, roughness: 0.9 });
  [-2.45, 2.45].forEach(ox => {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, coastLen), curbMat);
    curb.position.set(ox, 0.06, 0);
    scene.add(curb);
  });
}

function _dashedLine(cx, cz, length, axis, mat) {
  const dashLen = 1.6, gap = 1.2;
  const count = Math.floor(length / (dashLen + gap));
  for (let i = 0; i < count; i++) {
    const offset = -length / 2 + i * (dashLen + gap);
    const dash = new THREE.Mesh(
      new THREE.PlaneGeometry(axis === 'z' ? 0.12 : dashLen, axis === 'z' ? dashLen : 0.12),
      mat
    );
    dash.rotation.x = -Math.PI / 2;
    if (axis === 'z') dash.position.set(cx, 0.022, cz + offset);
    else dash.position.set(cx + offset, 0.022, cz);
    scene.add(dash);
  }
}

// ─── Cerro + Estanque con rocas y vegetación ─────────────────────────────────
function _buildMountainAndTank() {
  // Layered mountain — multiple meshes for geological strata look
  const mountainBase = new THREE.Mesh(
    new THREE.SphereGeometry(10, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0xc8b080, roughness: 0.97, metalness: 0.0,
    })
  );
  mountainBase.scale.set(1, 0.55, 1);
  mountainBase.position.set(L.ESTANQUE.x - 2, 0, L.ESTANQUE.z);
  mountainBase.castShadow = true;
  mountainBase.receiveShadow = true;
  scene.add(mountainBase);

  // Mid stratum
  const mountainMid = new THREE.Mesh(
    new THREE.SphereGeometry(6.5, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xb8a070, roughness: 0.95 })
  );
  mountainMid.scale.set(1, 0.65, 1);
  mountainMid.position.set(L.ESTANQUE.x - 2, 1.8, L.ESTANQUE.z);
  mountainMid.castShadow = true;
  scene.add(mountainMid);

  // Summit cap (slightly darker)
  const mountainTop = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xa09065, roughness: 0.93 })
  );
  mountainTop.scale.set(1, 0.72, 1);
  mountainTop.position.set(L.ESTANQUE.x - 1.5, 3.8, L.ESTANQUE.z + 0.5);
  mountainTop.castShadow = true;
  scene.add(mountainTop);

  // Water tank — realistic industrial tank
  const tankGroup = new THREE.Group();

  const tankBody = new THREE.Mesh(
    new THREE.CylinderGeometry(3.0, 3.2, 4.2, 24),
    new THREE.MeshStandardMaterial({
      color: 0x3a7058, metalness: 0.25, roughness: 0.55,
    })
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

  // Ladder detail
  const ladderMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.3 });
  for (let i = 0; i < 8; i++) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), ladderMat);
    rung.position.set(3.1, 0.4 + i * 0.55, 0);
    rung.rotation.z = Math.PI / 2;
    tankGroup.add(rung);
  }

  // Vent pipe
  const vent = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8),
    new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.7 })
  );
  vent.position.set(1.5, 5.0, 0);
  tankGroup.add(vent);

  tankGroup.position.set(L.ESTANQUE.x, 5.2, L.ESTANQUE.z);
  scene.add(tankGroup);

  _label(scene, 'Estanque Principal', L.ESTANQUE.x, 12.5, L.ESTANQUE.z);
}

// ─── Red de tuberías con materiales PBR ──────────────────────────────────────
function _buildPipeNetwork() {
  pipeGroup     = new THREE.Group();
  pipeGlowGroup = new THREE.Group();
  pipeGroup.visible = false;
  scene.add(pipeGroup);
  scene.add(pipeGlowGroup);

  const pipeMat = new THREE.MeshStandardMaterial({
    color: 0x1a9070, emissive: 0x0a3828, emissiveIntensity: 0.5,
    metalness: 0.35, roughness: 0.4,
  });
  const jointMat = new THREE.MeshStandardMaterial({
    color: 0x157555, metalness: 0.5, roughness: 0.3,
  });

  L.getPipeSegments().forEach(([a, b]) => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    _addPipe(va, vb, pipeMat);
    [va, vb].forEach(pt => {
      const joint = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), jointMat);
      joint.position.copy(pt);
      pipeGroup.add(joint);
    });
  });

  Object.entries(L.getValvePositions()).forEach(([id, v]) => {
    const valve = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.1, 8, 12),
      new THREE.MeshStandardMaterial({
        color: 0xff6622, metalness: 0.6, roughness: 0.3,
        emissive: 0x441100, emissiveIntensity: 0.3,
      })
    );
    valve.position.set(v.pos[0], v.pos[1] + 0.5, v.pos[2]);
    valve.rotation.x = Math.PI / 2;
    valve.userData.valveId = id;
    pipeGroup.add(valve);
  });
}

function _addPipe(a, b, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 0.01) return;
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, len, 12), mat);
  tube.position.copy(mid);
  tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  tube.castShadow = true;
  pipeGroup.add(tube);

  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.38, len, 12),
    new THREE.MeshBasicMaterial({ color: 0x2fffb8, transparent: true, opacity: 0, depthTest: false })
  );
  glow.position.copy(mid);
  glow.quaternion.copy(tube.quaternion);
  pipeGlowGroup.add(glow);
}

// ─── Casa Principal — arquitectura detallada ──────────────────────────────────
function _buildCasaPrincipal() {
  const house = _buildDetailedHouse({
    w: 7, h: 4.5, d: 5.5,
    wallColor: 0xf5ede0,
    roofColor: 0x2a5e42,
    accentColor: 0x8b6b4a,
    hasGarage: false,
    hasTerrace: true,
    label: 'Casa Principal',
  });
  house.position.set(L.CASA_PRINCIPAL.x, 0, L.CASA_PRINCIPAL.z);
  house.rotation.y = -Math.PI / 2;
  scene.add(house);
}

function _buildSalaDeMaquinas() {
  const house = _buildDetailedHouse({
    w: 5, h: 3.5, d: 4.5,
    wallColor: 0xd0d5da,
    roofColor: 0x3d4247,
    accentColor: 0x555a5e,
    hasGarage: false,
    hasTerrace: false,
    label: 'Sala de Máquinas',
  });
  house.position.set(L.SALA_MAQUINAS.x, 0, L.SALA_MAQUINAS.z);
  house.rotation.y = -Math.PI / 2;
  scene.add(house);

  const pipeMat2 = new THREE.MeshStandardMaterial({ color: 0x1a9070, metalness: 0.4, roughness: 0.3 });
  [[L.SALA_MAQUINAS.x - 1, 1.5, L.SALA_MAQUINAS.z - 2], [L.SALA_MAQUINAS.x + 1, 1.5, L.SALA_MAQUINAS.z + 2]].forEach(([x, y, z]) => {
    const pip = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2, 8), pipeMat2);
    pip.position.set(x, y, z);
    scene.add(pip);
  });
}

// ─── Planta Desalinizadora — edificio industrial detallado ───────────────────
function _buildPlantaDesalinizadora() {
  const group = new THREE.Group();

  // Main building body
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xd5dce3, metalness: 0.08, roughness: 0.75,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(11, 5.5, 8), wallMat);
  body.position.set(0, 2.75, 0);
  body.castShadow = true; body.receiveShadow = true;
  group.add(body);

  // Flat roof with equipment
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xbbc3cb, roughness: 0.8 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.35, 8.4), roofMat);
  roof.position.set(0, 5.68, 0);
  roof.castShadow = true;
  group.add(roof);

  // Industrial tanks (RO membranes)
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x7a9aaa, metalness: 0.55, roughness: 0.35 });
  for (let i = 0; i < 4; i++) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 5, 20), tankMat);
    tank.position.set(-3.8 + i * 2.55, 2.5, -5.2);
    tank.castShadow = true;
    group.add(tank);

    // Tank end caps
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 8, 0, Math.PI*2, 0, Math.PI/2), tankMat);
    cap.position.set(-3.8 + i * 2.55, 5.0, -5.2);
    group.add(cap);
  }

  // Pressure vessels on roof
  const vesselMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, metalness: 0.2, roughness: 0.6 });
  for (let i = 0; i < 3; i++) {
    const vessel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.8, 14), vesselMat);
    vessel.position.set(-2.5 + i * 2.5, 6.9, 0);
    vessel.castShadow = true;
    group.add(vessel);
  }

  // Intake pipe from ocean
  const intakeMat = new THREE.MeshStandardMaterial({ color: 0x4488aa, metalness: 0.5, roughness: 0.3 });
  const intake = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 8, 12), intakeMat);
  intake.rotation.z = Math.PI / 2;
  intake.position.set(-7, 1.2, 0);
  group.add(intake);

  // Brine discharge pipe
  const brine = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 6, 10), intakeMat);
  brine.rotation.z = Math.PI / 2;
  brine.position.set(-7, 0.6, 2.5);
  group.add(brine);

  // Windows
  const winMat = new THREE.MeshStandardMaterial({ color: 0x3d6a88, metalness: 0.5, roughness: 0.2, emissive: 0x1a3344, emissiveIntensity: 0.2 });
  for (let i = -1; i <= 1; i++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 1.8), winMat);
    win.position.set(-5.55, 2.8, i * 2.5);
    group.add(win);
  }

  // Door
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 1.2), new THREE.MeshStandardMaterial({ color: 0x445566 }));
  door.position.set(-5.55, 1.2, -2.5);
  group.add(door);

  // Signage
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512; signCanvas.height = 128;
  const sctx = signCanvas.getContext('2d');
  sctx.fillStyle = '#1a3c5a';
  sctx.fillRect(0, 0, 512, 128);
  sctx.fillStyle = '#ffffff';
  sctx.font = 'bold 36px Arial';
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  sctx.fillText('PLANTA DESALINIZADORA', 256, 64);
  const signTex = new THREE.CanvasTexture(signCanvas);
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.7, 4.0),
    new THREE.MeshStandardMaterial({ map: signTex })
  );
  sign.position.set(-5.54, 4.5, 0);
  group.add(sign);

  group.position.set(L.PLANTA_DESAL.x, 0, L.PLANTA_DESAL.z);
  scene.add(group);
  _label(group, 'Planta Desalinizadora', 0, 8.5, 0);
}

// ─── Casitas detalladas ───────────────────────────────────────────────────────
function _buildCasitas() {
  const roofColors = [0x2a5e42, 0x3a5a7a, 0x6a3a2a, 0x4a5030];

  L.HOUSE_ROWS_Z.forEach((z, zi) => {
    const rc = roofColors[zi % roofColors.length];
    ['west', 'east'].forEach(side => {
      const hx = L.HOUSE_SIDE_X[side];
      const house = _buildDetailedHouse({
        w: 3.6, h: 2.8, d: 3.4,
        wallColor: [0xf7f1e3, 0xeee8d8, 0xf0ece0][zi % 3],
        roofColor: rc,
        accentColor: 0x8b7250,
        hasGarage: false, hasTerrace: false, label: null,
      });
      house.position.set(hx, 0, z);
      house.rotation.y = side === 'west' ? Math.PI / 2 : -Math.PI / 2;
      scene.add(house);
    });
  });

  _label(scene, 'Cabañas (lado playa)', L.HOUSE_SIDE_X.west - 2, 2.5, 0);
  _label(scene, 'Cabañas (lado cerro)', L.HOUSE_SIDE_X.east + 2, 2.5, 0);
}

// ─── Estacionamiento + servicios ──────────────────────────────────────────────
function _buildParkingYBanos() {
  // Asphalt
  const lotMat = new THREE.MeshStandardMaterial({ color: 0x505458, roughness: 0.9 });
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(20, 10), lotMat);
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(L.PARKING.x, 0.018, L.PARKING.z);
  lot.receiveShadow = true;
  scene.add(lot);

  // Painted parking lines
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = -3; i <= 3; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 6), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(L.PARKING.x + i * 2.8, 0.025, L.PARKING.z);
    scene.add(line);
  }

  // Disabled parking symbol
  const dpMat = new THREE.MeshBasicMaterial({ color: 0x2255cc });
  const dp = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 5.8), dpMat);
  dp.rotation.x = -Math.PI / 2;
  dp.position.set(L.PARKING.x + 3 * 2.8 + 1.4, 0.026, L.PARKING.z);
  scene.add(dp);

  // Bathroom building
  const bath = _buildDetailedHouse({
    w: 2.5, h: 2.4, d: 2.2,
    wallColor: 0xfafafa,
    roofColor: 0x2a5a6e,
    accentColor: 0x336688,
    hasGarage: false,
    hasTerrace: false,
    label: 'Servicios',
  });
  bath.position.set(L.PARKING.x, 0, L.PARKING.z - 6);
  scene.add(bath);

  // Price sign with canvas
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 300; signCanvas.height = 200;
  const ctx = signCanvas.getContext('2d');
  ctx.fillStyle = '#f0ede5';
  _canvasRoundRect(ctx, 0, 0, 300, 200, 14);
  ctx.fill();
  ctx.strokeStyle = '#aaa'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#1a3050'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'center';
  ctx.fillText('Tarifas', 150, 38);
  ctx.font = '18px Arial';
  ctx.fillStyle = '#333';
  ctx.fillText('🚽 Baño: $200', 150, 80);
  ctx.fillText('🚿 Ducha: $500', 150, 112);
  ctx.fillText('🚗 Estac.: $1.000', 150, 144);
  ctx.fillText('📦 Completo: $1.500', 150, 176);
  const signTex = new THREE.CanvasTexture(signCanvas);

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.5, 0.06),
    new THREE.MeshStandardMaterial({ map: signTex })
  );
  sign.position.set(L.PARKING.x, 2.2, L.PARKING.z - 4.5);
  scene.add(sign);

  _label(scene, 'Estacionamiento', L.PARKING.x, 0.5, L.PARKING.z + 4.5);
}

function _canvasRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}

// ─── Pier + botes + muelle ────────────────────────────────────────────────────
function _buildPier() {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a5533, roughness: 0.85, metalness: 0.0 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.9 });
  const pierX = L.PIER.x;
  const pierZ = L.PIER.z;
  const pierLen = L.PIER.length;

  const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(pierLen, 0.28, 3.6), woodMat);
  pierDeck.position.set(pierX - pierLen / 2, 0.5, pierZ);
  pierDeck.castShadow = true;
  pierDeck.receiveShadow = true;
  scene.add(pierDeck);

  for (let i = 0; i < Math.floor(pierLen / 2); i++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.06, 3.4),
      new THREE.MeshStandardMaterial({ color: 0x8a6040, roughness: 0.9 })
    );
    plank.position.set(pierX - i * 2, 0.65, pierZ);
    scene.add(plank);
  }

  for (let side = -1; side <= 1; side += 2) {
    for (let x = pierX; x > pierX - pierLen; x -= 4.5) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 2.2, 10), poleMat);
      pile.position.set(x, -0.3, pierZ + side * 1.65);
      pile.castShadow = true;
      scene.add(pile);
    }
  }

  const railMat = new THREE.MeshStandardMaterial({ color: 0x8a6040, roughness: 0.7, metalness: 0.05 });
  for (let side = -1; side <= 1; side += 2) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(pierLen, 0.8, 0.1), railMat);
    rail.position.set(pierX - pierLen / 2, 1.05, pierZ + side * 1.7);
    scene.add(rail);
  }

  const boat1 = _buildBoat(pierX - pierLen + 6, pierZ - 5, 0xe83020, false);
  const boat2 = _buildBoat(pierX - 8, pierZ + 6, 0x2255aa, true);
  const boat3 = _buildBoat(L.OCEAN_X + 25, -15, 0xf5a623, false);
  _boatGroups.push(boat1, boat2, boat3);

  [[pierX - 2, 0.65, pierZ - 1.8], [pierX - 2, 0.65, pierZ + 1.8]].forEach(([x, y, z]) => {
    const bollard = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.22, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6 })
    );
    bollard.position.set(x, y, z);
    scene.add(bollard);
  });
}

function _buildBoat(x, z, color, isSailboat) {
  const group = new THREE.Group();

  // Hull — elongated shape
  const hullMat = new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.5 });
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 3.5, 8, 1, false, -0.3, Math.PI * 1.8), hullMat);
  hull.scale.set(1, 0.6, 1);
  hull.position.y = 0.3;
  hull.castShadow = true;
  group.add(hull);

  // Deck
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e8, roughness: 0.7 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 2.8), deckMat);
  deck.position.y = 0.6;
  group.add(deck);

  if (isSailboat) {
    // Mast
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 4.5, 8),
      new THREE.MeshStandardMaterial({ color: 0xddd0b8, metalness: 0.3 })
    );
    mast.position.y = 3.0;
    group.add(mast);

    // Sail
    const sailGeo = new THREE.BufferGeometry();
    const verts = new Float32Array([
      0, 0.8, 0,   0.04, 4.5, 0,   1.2, 0.8, 1.5,
    ]);
    sailGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    sailGeo.setIndex([0,1,2]);
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({
      color: 0xfaf5e8, side: THREE.DoubleSide, roughness: 0.8
    }));
    group.add(sail);
  } else {
    // Outboard motor
    const motor = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.5, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6 })
    );
    motor.position.set(0, 0.5, 1.5);
    group.add(motor);
  }

  group.position.set(x, 0.05, z);
  group.rotation.y = Math.PI * (0.15 + Math.random() * 0.25);
  group.userData.isBoat = true;
  group.userData.boatPhase = Math.random() * Math.PI * 2;
  scene.add(group);
  return group;
}

function _buildDuchas() {
  const positions = [[L.PARKING.x + 4, L.PARKING.z - 10], [L.PARKING.x + 6, L.PARKING.z - 12], [L.PARKING.x + 2, L.PARKING.z - 8]];
  positions.forEach(([x, z]) => {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.08, 2.6, 10),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.7, roughness: 0.25 })
    );
    pole.position.set(x, 1.3, z);
    pole.castShadow = true;
    scene.add(pole);

    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.7 })
    );
    arm.rotation.z = Math.PI / 2;
    arm.position.set(x + 0.25, 2.4, z);
    scene.add(arm);

    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.12, 0.15, 14),
      new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8, roughness: 0.2 })
    );
    head.position.set(x + 0.5, 2.4, z);
    head.rotation.z = Math.PI / 2;
    scene.add(head);

    // Water droplets (small spheres)
    for (let d = 0; d < 5; d++) {
      const drop = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x88bbff, transparent: true, opacity: 0.7, roughness: 0.1 })
      );
      drop.position.set(
        x + 0.5 + (Math.random()-0.5)*0.3,
        2.0 - d * 0.3,
        z + (Math.random()-0.5)*0.3
      );
      scene.add(drop);
    }
  });
}

// ─── Palmeras con geometría realista ─────────────────────────────────────────
function _buildPalmTrees() {
  const spots = [];
  L.HOUSE_ROWS_Z.forEach(z => {
    spots.push([L.HOUSE_SIDE_X.west - 3.5, z], [L.HOUSE_SIDE_X.east + 3.5, z]);
  });
  [[L.BEACH_CENTER_X + 4, -20], [L.BEACH_CENTER_X + 2, 5], [L.BEACH_CENTER_X + 6, 25], [-42, -30], [-44, 10]].forEach(p => spots.push(p));
  spots.forEach(([x, z]) => _palmTree(x, z));
}

function _palmTree(x, z) {
  const group = new THREE.Group();
  const h = 3.2 + Math.random() * 1.8;
  const lean = (Math.random()-0.5) * 0.2;

  // Trunk — tapered with slight curve
  const trunkPoints = [];
  const trunkRadii = [];
  const segments = 8;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    trunkPoints.push(new THREE.Vector3(lean * t * h * 0.5, t * h, 0));
    trunkRadii.push(0.22 - t * 0.12);
  }

  const curve = new THREE.CatmullRomCurve3(trunkPoints);
  const trunkGeo = new THREE.TubeGeometry(curve, 10, 0.16, 8, false);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x8a6230, roughness: 0.95, metalness: 0.0,
  });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.castShadow = true;
  group.add(trunk);

  // Fronds — more detailed
  const frondColors = [0x2d7030, 0x358038, 0x3a7832];
  const tipPos = curve.getPoint(1);
  const frondCount = 7 + Math.floor(Math.random() * 4);

  for (let i = 0; i < frondCount; i++) {
    const frondGroup = new THREE.Group();
    const frondLen = 1.8 + Math.random() * 0.8;

    // Main frond stem
    const stemPoints = [];
    for (let s = 0; s <= 6; s++) {
      const st = s / 6;
      stemPoints.push(new THREE.Vector3(
        st * frondLen * 0.8,
        -st * frondLen * 0.4,
        (Math.random()-0.5) * 0.1
      ));
    }
    const stemCurve = new THREE.CatmullRomCurve3(stemPoints);
    const stemGeo = new THREE.TubeGeometry(stemCurve, 6, 0.03, 5, false);
    const frond = new THREE.Mesh(stemGeo, new THREE.MeshStandardMaterial({
      color: frondColors[Math.floor(Math.random()*3)],
      roughness: 0.9, side: THREE.DoubleSide
    }));
    frondGroup.add(frond);

    // Leaflets
    for (let l = 1; l <= 8; l++) {
      const lt = l / 8;
      const lp = stemCurve.getPoint(lt);
      const leafGeo = new THREE.PlaneGeometry(0.08 * (1-lt*0.5), 0.6 * (1-lt*0.3));
      const leaf = new THREE.Mesh(leafGeo, new THREE.MeshStandardMaterial({
        color: frondColors[Math.floor(Math.random()*3)],
        roughness: 0.85, side: THREE.DoubleSide
      }));
      leaf.position.copy(lp);
      leaf.rotation.z = Math.PI / 6;
      frondGroup.add(leaf);
    }

    frondGroup.position.copy(tipPos);
    frondGroup.rotation.y = (i / frondCount) * Math.PI * 2;
    frondGroup.rotation.z = 0.4 + Math.random() * 0.2;
    frondGroup.castShadow = true;
    group.add(frondGroup);
  }

  // Coconuts
  if (Math.random() > 0.4) {
    const nutMat = new THREE.MeshStandardMaterial({ color: 0x5a3a10, roughness: 0.9 });
    for (let n = 0; n < 3; n++) {
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), nutMat);
      const angle = (n / 3) * Math.PI * 2;
      nut.position.set(
        tipPos.x + Math.cos(angle) * 0.35,
        tipPos.y - 0.3,
        Math.sin(angle) * 0.35
      );
      group.add(nut);
    }
  }

  group.position.set(x, 0, z);
  scene.add(group);
}

// ─── Vegetación adicional ─────────────────────────────────────────────────────
function _buildVegetation() {
  // Bushes — matorral costero, tonos más secos/olivo (no verde de jardín)
  const bushColors = [0x6a7a42, 0x7c8550, 0x596a3a, 0x8a8a5a];
  const bushSpots = [
    [L.HOUSE_SIDE_X.west - 2, -20], [L.HOUSE_SIDE_X.east + 2, -20],
    [L.HOUSE_SIDE_X.west - 2, 10], [L.HOUSE_SIDE_X.east + 2, 10],
    [L.ESTANQUE.x - 5, L.ESTANQUE.z], [L.PARKING.x, L.PARKING.z + 5],
    [-40, -15], [-38, 20],
  ];

  bushSpots.forEach(([x, z]) => {
    const color = bushColors[Math.floor(Math.random() * bushColors.length)];
    const bushMat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    const size = 0.5 + Math.random() * 0.8;
    const puffs = 2 + Math.floor(Math.random() * 3);
    for (let p = 0; p < puffs; p++) {
      const bush = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), bushMat);
      bush.position.set(
        x + (Math.random()-0.5) * 0.8,
        size * 0.6,
        z + (Math.random()-0.5) * 0.8
      );
      bush.scale.set(1, 0.75, 1);
      bush.castShadow = true;
      scene.add(bush);
    }
  });

  // Matas de pasto de dunas — dorado/verde pálido, no césped de jardín
  const tuftMat = new THREE.MeshStandardMaterial({ color: 0x9a9550, roughness: 0.95, side: THREE.DoubleSide });
  for (let i = 0; i < 60; i++) {
    const tuft = new THREE.Mesh(
      new THREE.ConeGeometry(0.08 + Math.random() * 0.06, 0.4 + Math.random() * 0.3, 5),
      tuftMat
    );
    const angle = (Math.random()-0.5) * 0.3;
    tuft.rotation.z = angle;
    tuft.position.set(
      L.BEACH_CENTER_X - 8 + Math.random() * 20,
      0.2,
      L.COAST_Z_MIN + Math.random() * (L.COAST_Z_MAX - L.COAST_Z_MIN)
    );
    scene.add(tuft);
  }
}

// ─── Rocks scattered around ───────────────────────────────────────────────────
function _buildRocks() {
  const rockSpots = [
    [L.BEACH_CENTER_X - 4, -28, 0.8], [L.BEACH_CENTER_X + 2, 8, 1.0],
    [L.BEACH_CENTER_X - 6, 22, 0.7], [-42, -18, 0.9], [-45, 12, 0.6],
    [L.PIER.x - 4, L.PIER.z - 8, 0.8], [L.OCEAN_X + 30, -10, 1.1],
  ];

  const rockMats = [
    new THREE.MeshStandardMaterial({ color: 0x8a8278, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ color: 0x7a7068, roughness: 0.97 }),
    new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.92 }),
  ];

  rockSpots.forEach(([x, z, s]) => {
    const geo = new THREE.DodecahedronGeometry(s, 0);
    // Deform vertices for natural rock look
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setX(i, pos.getX(i) * (0.8 + Math.random() * 0.4));
      pos.setY(i, pos.getY(i) * (0.6 + Math.random() * 0.3));
      pos.setZ(i, pos.getZ(i) * (0.8 + Math.random() * 0.4));
    }
    geo.computeVertexNormals();
    const mat = rockMats[Math.floor(Math.random() * rockMats.length)];
    const rock = new THREE.Mesh(geo, mat);
    rock.position.set(x, s * 0.4, z);
    rock.rotation.set(Math.random(), Math.random() * Math.PI * 2, Math.random());
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  });
}

// ─── Postes de luz ────────────────────────────────────────────────────────────
function _buildLampPosts() {
  const lampSpots = [
    [-2.5, -30], [2.5, -25], [-2.5, -10], [2.5, 0],
    [-2.5, 15], [2.5, 25], [L.HOUSE_SIDE_X.west - 1, 0], [L.HOUSE_SIDE_X.east + 1, 0],
  ];

  lampSpots.forEach(([x, z], idx) => {
    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 4.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a4e52, metalness: 0.7, roughness: 0.3 })
    );
    pole.position.set(x, 2.25, z);
    pole.castShadow = true;
    scene.add(pole);

    // Arm
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.8, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a3e42, metalness: 0.7 })
    );
    arm.rotation.z = -Math.PI / 5;
    arm.position.set(x + 0.3, 4.7, z);
    scene.add(arm);

    // Lamp head
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfff0a0,
      emissive: 0xffcc44,
      emissiveIntensity: isNight ? 3.0 : 0.0,
      roughness: 0.2,
    });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 0.3, 8), lampMat);
    lamp.position.set(x + 0.55, 4.75, z);
    lamp.castShadow = false;
    lamp.userData.isLamp = true;
    lamp.userData.lampIdx = idx;
    scene.add(lamp);

    // Point light (small, for glow effect at night)
    if (isNight) {
      const light = new THREE.PointLight(0xffe080, 2.5, 8);
      light.position.set(x + 0.55, 4.75, z);
      light.userData.isNightLight = true;
      scene.add(light);
    }
  });
}

// ─── Vehículos realistas ──────────────────────────────────────────────────────
function _buildVehicles() {
  _buildCar(2.3, -5, 0xc0392b, false);
  _buildCar(L.HOUSE_SIDE_X.east + 5, 15, 0x3466aa, false);
  _buildCar(L.REPAIR_BASE.x, L.REPAIR_BASE.z, 0x4a7a35, true);
  _buildCar(L.CASA_PRINCIPAL.x + 4, L.CASA_PRINCIPAL.z, 0xcccccc, false);
}

function _buildCar(x, z, color, isTruck) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color, metalness: 0.45, roughness: 0.3,
  });

  // Body
  const bodyW = isTruck ? 2.8 : 2.0, bodyD = isTruck ? 1.45 : 1.1;
  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, 0.7, bodyD), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  // Cabin roof
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(isTruck ? 1.0 : 1.2, 0.45, bodyD * 0.9),
    new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.35 })
  );
  cabin.position.set(isTruck ? -0.7 : 0, 1.13, 0);
  cabin.castShadow = true;
  group.add(cabin);

  // Windows
  const winMat = new THREE.MeshStandardMaterial({ color: 0x223344, transparent: true, opacity: 0.7, metalness: 0.3, roughness: 0.1 });
  const frontWin = new THREE.Mesh(new THREE.PlaneGeometry(isTruck ? 0.85 : 1.0, 0.32), winMat);
  frontWin.rotation.y = Math.PI;
  frontWin.position.set(isTruck ? -0.7 : 0, 1.1, bodyD * 0.455 + 0.01);
  group.add(frontWin);

  // Wheels
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
  const rimMat   = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
  const positions = [[-0.75,-0.45], [0.75,-0.45], [-0.75, 0.45], [0.75, 0.45]];
  positions.forEach(([wx, wz]) => {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 16), wheelMat);
    tire.rotation.x = Math.PI / 2;
    tire.position.set(wx * (isTruck ? 1.15 : 0.95), 0.28, wz);
    group.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 10), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(tire.position);
    group.add(rim);
  });

  // Headlights
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffffdd, emissive: 0xffffaa, emissiveIntensity: 0.3 });
  [-0.35, 0.35].forEach(lx => {
    const light = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10), lightMat);
    light.position.set(lx, 0.6, bodyD * 0.5 + 0.01);
    group.add(light);
  });

  if (isTruck) {
    // Water tank on truck
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x224466, metalness: 0.4, roughness: 0.4 });
    const waterTank = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.8, 16), tankMat);
    waterTank.rotation.z = Math.PI / 2;
    waterTank.position.set(0.4, 1.2, 0);
    group.add(waterTank);
    _label(group, 'Aljibe', 0, 2.2, 0);
  }

  group.position.set(x, 0, z);
  group.rotation.y = isTruck ? Math.PI / 2 : Math.PI * 1.5;
  scene.add(group);
}

// ─── Helper: casa detallada con elementos arquitectónicos ────────────────────
function _buildDetailedHouse({ w, h, d, wallColor, roofColor, accentColor, hasGarage, hasTerrace, label }) {
  const group = new THREE.Group();

  const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.85, metalness: 0.0 });
  const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.8, metalness: 0.05 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accentColor || 0x8b6b4a, roughness: 0.75 });
  const winMat = new THREE.MeshStandardMaterial({
    color: 0x3d6888, transparent: true, opacity: 0.8,
    metalness: 0.4, roughness: 0.1, emissive: 0x1a2e3a, emissiveIntensity: 0.15
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });

  // Main walls
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  walls.position.y = h / 2;
  walls.castShadow = true; walls.receiveShadow = true;
  group.add(walls);

  // Foundation/plinth
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.3, 0.25, d + 0.3),
    new THREE.MeshStandardMaterial({ color: 0xb0a890, roughness: 0.9 })
  );
  plinth.position.y = 0.125;
  group.add(plinth);

  // Gabled roof
  const roofW = Math.max(w, d) * 0.75;
  const roofH = h * 0.55;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(roofW, roofH, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = h + roofH * 0.5;
  roof.castShadow = true;
  group.add(roof);

  // Roof overhang
  const overhang = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.6, 0.12, d + 0.6),
    new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.8 })
  );
  overhang.position.y = h + 0.05;
  group.add(overhang);

  // Windows — front face
  const winSize = Math.min(0.7, h * 0.22);
  const winPositions = w > 4
    ? [[-w*0.28, h*0.55], [w*0.28, h*0.55], [-w*0.28, h*0.25], [w*0.28, h*0.25]]
    : [[-w*0.22, h*0.55], [w*0.22, h*0.55]];

  winPositions.forEach(([wx, wy]) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(winSize*1.2, winSize*1.2, 0.08), frameMat);
    frame.position.set(wx, wy, d/2 + 0.04);
    group.add(frame);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(winSize, winSize), winMat);
    win.position.set(wx, wy, d/2 + 0.09);
    group.add(win);
  });

  // Door
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.22, h * 0.45, 0.08),
    new THREE.MeshStandardMaterial({ color: accentColor || 0x6a4520, roughness: 0.6 })
  );
  door.position.set(0, h * 0.225, d/2 + 0.04);
  group.add(door);

  // Door knob
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xd4aa40, metalness: 0.9, roughness: 0.1 })
  );
  knob.position.set(w*0.09, h*0.24, d/2 + 0.1);
  group.add(knob);

  // Chimney
  if (Math.random() > 0.4) {
    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, h * 0.5, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x8a6050, roughness: 0.9 })
    );
    chimney.position.set(w * 0.25, h + h * 0.25, 0);
    chimney.castShadow = true;
    group.add(chimney);
  }

  // Terrace
  if (hasTerrace) {
    const terrMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb0, roughness: 0.9 });
    const terrace = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 0.15, 2.5), terrMat);
    terrace.position.set(0, 0.075, d/2 + 1.25);
    group.add(terrace);
    // Terrace railing
    const rMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    [-w/2-0.8, w/2+0.8].forEach(rx => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 2.5), rMat);
      rail.position.set(rx, 0.43, d/2 + 1.25);
      group.add(rail);
    });
    const frontRail = new THREE.Mesh(new THREE.BoxGeometry(w+2, 0.08, 0.08), rMat);
    frontRail.position.set(0, 0.75, d/2 + 2.5);
    group.add(frontRail);
  }

  if (label) _label(group, label, 0, h + roofH + 1.2, 0);

  return group;
}

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
  sprite.scale.set(scale, scale * (96/512), 1);
  sprite.position.set(x, y, z);
  sprite.renderOrder = 10;
  parent.add(sprite);
}

// ─── Flujo de agua en tuberías (partículas) ───────────────────────────────────
function _buildPipeFlow() {
  pipeFlowGroup = new THREE.Group();
  scene.add(pipeFlowGroup);
  _flowParticles = [];

  const dotGeo = new THREE.SphereGeometry(0.08, 6, 6);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x44ffcc, transparent: true, opacity: 0.85 });

  L.getPipeSegments().forEach(([a, b], segIdx) => {
    const start = new THREE.Vector3(...a);
    const end   = new THREE.Vector3(...b);
    const dir   = new THREE.Vector3().subVectors(end, start);
    const len   = dir.length();
    if (len < 0.5) return;
    dir.normalize();

    const count = Math.max(2, Math.floor(len / 2.5));
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(dotGeo, dotMat.clone());
      pipeFlowGroup.add(mesh);
      _flowParticles.push({
        mesh, start, end, dir, len,
        t: i / count,
        speed: 0.35 + (segIdx % 3) * 0.08,
        segIdx,
      });
    }
  });
}

function _isFlowBlocked(start, end) {
  if (_closedValves.size === 0 && !_activeLeakPos) return false;

  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

  if (_activeLeakPos && mid.distanceTo(_activeLeakPos) < 5) return true;

  for (const valveId of _closedValves) {
    const vp = L.getValvePositions()[valveId];
    if (!vp) continue;
    const vPos = new THREE.Vector3(...vp.pos);
    if (mid.distanceTo(vPos) < 6 || start.distanceTo(vPos) < 4) return true;
    if (_activeLeakPos && vPos.distanceTo(_activeLeakPos) < 8) return true;
  }
  return false;
}

function _updatePipeFlow(t) {
  if (!pipeFlowGroup) return;
  _flowParticles.forEach(p => {
    const blocked = _isFlowBlocked(p.start, p.end);
    p.t += blocked ? 0 : p.speed * 0.016;
    if (p.t > 1) p.t -= 1;
    p.mesh.position.copy(p.start).addScaledVector(p.dir, p.t * p.len);
    p.mesh.material.color.setHex(blocked ? 0xff3333 : 0x44ffcc);
    p.mesh.material.opacity = blocked ? 0.35 : 0.85;
    p.mesh.visible = pipesVisible || isXray || _activeLeakPos !== null;
  });
}

// ─── Equipo de reparación ─────────────────────────────────────────────────────
function _buildRepairCrew() {
  repairGroup = new THREE.Group();
  repairGroup.visible = false;
  scene.add(repairGroup);
  leakFxGroup = new THREE.Group();
  leakFxGroup.visible = false;
  scene.add(leakFxGroup);
}

function _createRepairTech(color = 0xff8800) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2255aa, roughness: 0.8 });
  const vestMat = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0x331100, emissiveIntensity: 0.2 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1.2, 8), bodyMat);
  body.position.y = 0.85;
  group.add(body);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.7, 0.45), vestMat);
  vest.position.y = 1.0;
  group.add(vest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), new THREE.MeshStandardMaterial({ color: 0xffcc99 }));
  head.position.y = 1.65;
  group.add(head);

  const tool = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7 })
  );
  tool.position.set(0.45, 0.9, 0);
  tool.userData.isTool = true;
  group.add(tool);

  // Camioneta mini
  const truck = new THREE.Group();
  const truckBody = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.9, 1.2),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
  );
  truckBody.position.y = 0.55;
  truck.add(truckBody);

  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.2, 8),
    new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 2 })
  );
  beacon.position.set(0, 1.15, 0);
  beacon.userData.isBeacon = true;
  truck.add(beacon);

  truck.position.set(0, 0, -1.8);
  group.add(truck);

  group.userData.state = 'idle';
  group.userData.target = new THREE.Vector3();
  group.userData.speed = 0.12;
  group.visible = false;
  repairGroup.add(group);
  return group;
}

function _buildMarineLife() {
  _fishGroup = new THREE.Group();
  scene.add(_fishGroup);

  const fishColors = [0xffaa44, 0x44aaff, 0xff6688, 0xaaff66, 0xffdd55];
  for (let i = 0; i < 24; i++) {
    const fish = new THREE.Group();
    const col = fishColors[i % fishColors.length];
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.25 + Math.random() * 0.2, 6, 6),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 })
    );
    body.scale.set(1.8, 0.7, 0.6);
    fish.add(body);

    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.35, 4),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 })
    );
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.45;
    fish.add(tail);

    fish.position.set(
      L.OCEAN_X + 15 + Math.random() * 45,
      -0.5 - Math.random() * 1.5,
      L.COAST_Z_MIN + Math.random() * (L.COAST_Z_MAX - L.COAST_Z_MIN)
    );
    fish.userData.phase = Math.random() * Math.PI * 2;
    fish.userData.speed = 0.4 + Math.random() * 0.8;
    fish.userData.dir = Math.random() > 0.5 ? 1 : -1;
    _fishGroup.add(fish);
  }
}

function _updateMarineLife(t) {
  if (!_fishGroup) return;
  _fishGroup.children.forEach(fish => {
    fish.position.z += fish.userData.dir * fish.userData.speed * 0.04;
    fish.position.y = -0.8 + Math.sin(t * fish.userData.speed + fish.userData.phase) * 0.3;
    fish.rotation.y = fish.userData.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    fish.rotation.z = Math.sin(t * 2 + fish.userData.phase) * 0.15;
    if (fish.position.z > L.COAST_Z_MAX + 5) fish.position.z = L.COAST_Z_MIN - 5;
    if (fish.position.z < L.COAST_Z_MIN - 5) fish.position.z = L.COAST_Z_MAX + 5;
  });
}

function _updateBoats(t) {
  _boatGroups.forEach(boat => {
    if (!boat.userData.isBoat) return;
    boat.position.y = 0.05 + Math.sin(t * 0.9 + boat.userData.boatPhase) * 0.08;
    boat.rotation.z = Math.sin(t * 0.7 + boat.userData.boatPhase) * 0.04;
    boat.rotation.x = Math.sin(t * 0.5 + boat.userData.boatPhase) * 0.03;
  });
}

function _buildLeakVisuals(pos, severity = 1) {
  if (!leakFxGroup) return;
  _clearLeakVisuals();

  // Pozo excavado
  _excavationGroup = new THREE.Group();
  const pitMat = new THREE.MeshStandardMaterial({ color: 0x6a5030, roughness: 0.95 });
  const pit = new THREE.Mesh(new THREE.CylinderGeometry(1.8 * severity, 2.2 * severity, 0.6, 16, 1, true), pitMat);
  pit.position.copy(pos).setY(-0.15);
  _excavationGroup.add(pit);

  const dirtRing = new THREE.Mesh(
    new THREE.RingGeometry(1.5 * severity, 2.8 * severity, 20),
    new THREE.MeshStandardMaterial({ color: 0x8a6840, roughness: 0.9, side: THREE.DoubleSide })
  );
  dirtRing.rotation.x = -Math.PI / 2;
  dirtRing.position.copy(pos).setY(-0.05);
  _excavationGroup.add(dirtRing);

  // Tubería rota expuesta
  _brokenPipeGroup = new THREE.Group();
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x1a9070, metalness: 0.4 });
  const crackMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });

  const pipeL = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 10), pipeMat);
  pipeL.rotation.z = Math.PI / 2;
  pipeL.position.copy(pos).add(new THREE.Vector3(-0.5, -0.05, 0));
  _brokenPipeGroup.add(pipeL);

  const pipeR = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 10), pipeMat);
  pipeR.rotation.z = Math.PI / 2;
  pipeR.position.copy(pos).add(new THREE.Vector3(0.5, -0.05, 0));
  pipeR.rotation.y = 0.3;
  _brokenPipeGroup.add(pipeR);

  const gap = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.35), crackMat);
  gap.position.copy(pos).setY(0.05);
  _brokenPipeGroup.add(gap);

  // Chorro de agua (partículas)
  const sprayCount = Math.floor(40 * severity);
  const sprayGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(sprayCount * 3);
  const velocities = [];
  for (let i = 0; i < sprayCount; i++) {
    positions[i * 3]     = pos.x + (Math.random() - 0.5) * 0.3;
    positions[i * 3 + 1] = pos.y + 0.1;
    positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.3;
    velocities.push({
      vx: (Math.random() - 0.5) * 0.06,
      vy: 0.12 + Math.random() * 0.15,
      vz: (Math.random() - 0.5) * 0.06,
    });
  }
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  _leakSpray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({
    color: 0x88ccff, size: 0.18, transparent: true, opacity: 0.85, depthWrite: false,
  }));
  _leakSpray.userData.velocities = velocities;
  _leakSpray.userData.origin = pos.clone();

  leakFxGroup.add(_excavationGroup, _brokenPipeGroup, _leakSpray);
  leakFxGroup.visible = true;
}

function _clearLeakVisuals() {
  if (!leakFxGroup) return;
  while (leakFxGroup.children.length) leakFxGroup.remove(leakFxGroup.children[0]);
  _excavationGroup = null;
  _brokenPipeGroup = null;
  _leakSpray = null;
}

function _updateLeakFx(t) {
  if (!_leakSpray?.visible) return;
  const pos = _leakSpray.geometry.attributes.position;
  const origin = _leakSpray.userData.origin;
  const vels = _leakSpray.userData.velocities;

  for (let i = 0; i < vels.length; i++) {
    let x = pos.getX(i) + vels[i].vx;
    let y = pos.getY(i) + vels[i].vy;
    let z = pos.getZ(i) + vels[i].vz;
    vels[i].vy -= 0.004;

    if (y < -0.1) {
      x = origin.x + (Math.random() - 0.5) * 0.2;
      y = origin.y + 0.15;
      z = origin.z + (Math.random() - 0.5) * 0.2;
      vels[i].vy = 0.1 + Math.random() * 0.12;
      vels[i].vx = (Math.random() - 0.5) * 0.06;
      vels[i].vz = (Math.random() - 0.5) * 0.06;
    }
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
}

function _updateRepairCrew(t) {
  if (!repairGroup) return;

  _repairTechs.forEach(tech => {
    if (!tech.visible) return;

    const beacon = tech.children.find(c => c.userData?.isBeacon);
    if (beacon) {
      beacon.material.emissiveIntensity = 1.5 + Math.sin(t * 12) * 1.2;
      beacon.visible = Math.sin(t * 8) > -0.2;
    }

    const tool = tech.children.find(c => c.userData?.isTool);
    if (tech.userData.state === 'working' && tool) {
      tool.rotation.z = Math.sin(t * 6) * 0.8;
      tool.position.y = 0.9 + Math.abs(Math.sin(t * 6)) * 0.2;
    }

    if (tech.userData.state === 'traveling') {
      const target = tech.userData.target;
      const dist = tech.position.distanceTo(target);
      if (dist > 0.5) {
        const dir = new THREE.Vector3().subVectors(target, tech.position).normalize();
        tech.position.addScaledVector(dir, tech.userData.speed);
        tech.rotation.y = Math.atan2(dir.x, dir.z);
      } else {
        tech.userData.state = 'working';
      }
    }
  });
}

// ─── API pública para leaks.js ────────────────────────────────────────────────
export function setActiveLeakPosition(pos, severity = 1) {
  _activeLeakPos = pos.clone();
  pipeGroup.visible = true;
  _buildLeakVisuals(pos, severity);
}

export function clearActiveLeakPosition() {
  _activeLeakPos = null;
  _clearLeakVisuals();
  leakFxGroup.visible = false;
}

export function setValveFlowClosed(valveId, closed) {
  if (closed) _closedValves.add(valveId);
  else _closedValves.delete(valveId);
}

export function dispatchRepairTech(pos, count = 1) {
  if (!repairGroup) return;
  repairGroup.visible = true;

  while (_repairTechs.length < count) {
    _repairTechs.push(_createRepairTech());
  }

  _repairTechs.slice(0, count).forEach((tech, i) => {
    tech.visible = true;
    tech.position.set(
      L.REPAIR_BASE.x + i * 2,
      0,
      L.REPAIR_BASE.z + i * 1.5
    );
    tech.userData.target = pos.clone().add(new THREE.Vector3(i * 1.5 - 1, 0, i * 0.8));
    tech.userData.state = 'traveling';
  });
}

export function recallRepairTech() {
  _repairTechs.forEach(tech => {
    tech.userData.target.set(L.REPAIR_BASE.x, 0, L.REPAIR_BASE.z);
    tech.userData.state = 'traveling';
    setTimeout(() => { tech.visible = false; tech.userData.state = 'idle'; }, 4000);
  });
  setTimeout(() => { if (repairGroup) repairGroup.visible = false; }, 4500);
}

// ─── Modos: día/noche, radiografía, limpio, tuberías ─────────────────────────
export function toggleDayNight() {
  isNight = !isNight;

  // Find sky mesh and update
  scene.traverse(obj => {
    if (obj.userData.isSky && obj.material.uniforms) {
      if (isNight) {
        obj.material.uniforms.uTopColor.value.set(0x020820);
        obj.material.uniforms.uHorizonColor.value.set(0x0a1830);
      } else {
        obj.material.uniforms.uTopColor.value.set(0x4a8fcb);
        obj.material.uniforms.uHorizonColor.value.set(0x9cd2e8);
      }
    }
    if (obj.userData.isStars) {
      obj.material.opacity = isNight ? 0.85 : 0;
    }
    if (obj.userData.isLamp) {
      obj.material.emissiveIntensity = isNight ? 3.5 : 0;
    }
  });

  if (isNight) {
    scene.fog = new THREE.FogExp2(0x060c1e, 0.008);
    hemiLight.intensity = 0.15;
    hemiLight.color.set(0x223355);
    hemiLight.groundColor.set(0x111122);
    sunLight.intensity = 0.08;
    sunLight.color.set(0x3355aa);
    if (fillLight) { fillLight.intensity = 0.05; }
    sun.visible = false;
    moon.visible = true;

    // Add lamp post lights at night
    scene.traverse(obj => {
      if (obj.userData.isLamp) {
        const pointLight = new THREE.PointLight(0xffe080, 3.0, 10);
        pointLight.position.copy(obj.position);
        pointLight.position.y += 0.5;
        pointLight.userData.isNightAddedLight = true;
        scene.add(pointLight);
      }
    });
  } else {
    scene.fog = new THREE.FogExp2(0xb9e6f2, 0.0035);
    hemiLight.intensity = 1.0;
    hemiLight.color.set(0x9ecfea);
    hemiLight.groundColor.set(0xc8b870);
    sunLight.intensity = 2.2;
    sunLight.color.set(0xfff0d0);
    if (fillLight) { fillLight.intensity = 0.35; }
    sun.visible = true;
    moon.visible = false;

    // Remove added night lights
    const toRemove = [];
    scene.traverse(obj => { if (obj.userData.isNightAddedLight) toRemove.push(obj); });
    toRemove.forEach(obj => scene.remove(obj));
  }
  return isNight;
}

export function toggleXray() {
  isXray = !isXray;
  [sandMat, grassMat].forEach(m => {
    if (!m) return;
    m.transparent = isXray;
    m.opacity = isXray ? 0.28 : 1;
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

// ─── Wiring UI ────────────────────────────────────────────────────────────────
function _wireUI() {
  window.addEventListener('leaks:nightMode', e => {
    const night = e.detail.active;
    if (isNight !== night) toggleDayNight();
  });

  window.addEventListener('leaks:valveChange', e => {
    setValveFlowClosed(e.detail.id, !e.detail.open);
  });
}
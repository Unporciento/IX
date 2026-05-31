import * as THREE from 'three';
import { initControls, updateControls } from './controls.js';
import { initLeaks, updateLeaks } from './leaks.js';

export function initThree() {
  const canvas  = document.getElementById('three-canvas');
  const wrapper = canvas.parentElement;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xcec9bc, 0.009);

  const camera = new THREE.PerspectiveCamera(45, wrapper.clientWidth / wrapper.clientHeight, 0.1, 300);
  camera.position.set(0, 28, 42);
  initControls(camera, renderer.domElement);

  // ═══════════════════════════════════════════════════════════════════════════
  //  SISTEMA DÍA / NOCHE
  // ═══════════════════════════════════════════════════════════════════════════
  let isNight = false;

  // Colores de fondo
  const DAY_FOG   = new THREE.Color(0xcec9bc);
  const NIGHT_FOG = new THREE.Color(0x0a0e1a);
  const DAY_BG    = new THREE.Color(0xcec9bc);
  const NIGHT_BG  = new THREE.Color(0x0a0e1a);

  // Luz ambiental
  const ambientLight = new THREE.AmbientLight(0xf0ebe0, 0.75);
  scene.add(ambientLight);

  // Sol (DirectionalLight)
  const sunLight = new THREE.DirectionalLight(0xfff4d0, 2.2);
  sunLight.position.set(20, 60, 30);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left   = -60;
  sunLight.shadow.camera.right  =  60;
  sunLight.shadow.camera.top    =  60;
  sunLight.shadow.camera.bottom = -60;
  scene.add(sunLight);

  // Luna (DirectionalLight tenue azulada)
  const moonLight = new THREE.DirectionalLight(0x8899cc, 0);
  moonLight.position.set(-20, 40, -20);
  scene.add(moonLight);

  // Astro visual (sol o luna) — esfera que se desplaza en arco
  const sunSphere = new THREE.Mesh(
    new THREE.SphereGeometry(2.8, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffe877 })
  );
  sunSphere.position.set(20, 60, -60);
  scene.add(sunSphere);
  // MEJORA 3: Halo del sol (esfera grande semitransparente que pulsa)
  const sunHaloMat = new THREE.MeshBasicMaterial({
    color: 0xfff0aa, transparent: true, opacity: 0.08, side: THREE.BackSide,
  });
  const sunHalo = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 10), sunHaloMat);
  sunSphere.add(sunHalo);

  const moonSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.8, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xdde8ff })
  );
  moonSphere.position.set(-20, 40, -60);
  moonSphere.visible = false;
  scene.add(moonSphere);

  let rainbowTimer = 0;

  // Estrellas (solo de noche)
  const starGeo = new THREE.BufferGeometry();
  const starCount = 300;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1) * 0.45; // solo hemisferio superior
    const r     = 200;
    starPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 10;
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true })
  );
  stars.visible = false;
  scene.add(stars);

  // ── Transición día/noche ──────────────────────────────────────────────────
  let dayNightProgress = 0;  // 0 = día, 1 = noche (se interpola suavemente)
  let dayNightTarget   = 0;

  function toggleDayNight() {
    isNight = !isNight;
    dayNightTarget = isNight ? 1 : 0;
    const _dnLbl = btnDayNight.querySelector?.('.sb-label');
    if (_dnLbl) { _dnLbl.textContent = isNight ? 'Modo Día' : 'Modo Noche'; }
    else btnDayNight.innerHTML = isNight ? '☀️ Modo Día' : '🌙 Modo Noche';
    stars.visible      = isNight;
    moonSphere.visible = isNight;
    sunSphere.visible  = !isNight;
    // MEJORA 2: Arcoíris breve al volver al día

  }

  function updateDayNight(delta) {
    if (Math.abs(dayNightProgress - dayNightTarget) < 0.001) return;
    dayNightProgress += (dayNightTarget - dayNightProgress) * Math.min(delta * 1.2, 1);

    const t = dayNightProgress;

    // Fondo y niebla
    scene.background = DAY_BG.clone().lerp(NIGHT_BG, t);
    scene.fog.color.copy(DAY_FOG).lerp(NIGHT_FOG, t);

    // Luces
    ambientLight.intensity = THREE.MathUtils.lerp(0.75, 0.08, t);
    ambientLight.color.set(t < 0.5 ? 0xf0ebe0 : 0x2233aa);
    sunLight.intensity  = THREE.MathUtils.lerp(2.2, 0, t);
    moonLight.intensity = THREE.MathUtils.lerp(0, 0.6, t);

    // Postes de luz: se encienden de noche con más potencia
    streetLampLights.forEach(l => {
      l.intensity = THREE.MathUtils.lerp(0, 2.8, t);
    });
    // Halos y conos de luz visible
    lampHalos.forEach(mat => {
      mat.opacity = THREE.MathUtils.lerp(0, 0.10, t);
    });
    // Ventanas de las casas: se iluminan de noche
    windowGlows.forEach(m => {
      m.material.emissiveIntensity = THREE.MathUtils.lerp(0, 1.0, t);
    });
  }

  // ─── Límites ──────────────────────────────────────────────────────────────
  const LAND_MAX_X = 19;
  const SEA_START  = 20;

  // ─── Suelo ────────────────────────────────────────────────────────────────
  const mGround  = new THREE.MeshLambertMaterial({ color: 0xc4b28a });
  const ground   = new THREE.Mesh(new THREE.PlaneGeometry(75, 110), mGround);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-17.5, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  const mBeach = new THREE.MeshLambertMaterial({ color: 0xd9cc98 });
  const beach  = new THREE.Mesh(new THREE.PlaneGeometry(3, 110), mBeach);
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(SEA_START - 1.5, 0.01, 0);
  scene.add(beach);
  // MEJORA 4: Línea de marea (franja húmeda oscura en el borde del agua)
  const mWetSand = new THREE.MeshLambertMaterial({ color: 0xb8a878, transparent: true, opacity: 0.7 });
  const wetSand  = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 110), mWetSand);
  wetSand.rotation.x = -Math.PI / 2;
  wetSand.position.set(SEA_START + 0.1, 0.02, 0);
  scene.add(wetSand);

  // ─── Mar animado ──────────────────────────────────────────────────────────
  const seaVertexShader = `
    uniform float uTime;
    varying vec2  vUv;
    varying float vElevation;
    varying float vDistFromShore;
    void main() {
      vUv = uv;
      vDistFromShore = uv.x;
      vec3 pos = position;
      float depthFactor = smoothstep(0.0, 0.35, vDistFromShore);
      float wave1 = sin(pos.x * 0.14 + uTime * 0.9)  * 0.22 * depthFactor;
      float wave2 = sin(pos.z * 0.18 + uTime * 0.65) * 0.18 * depthFactor;
      float wave3 = sin((pos.x * 0.7 + pos.z * 0.5) * 0.10 + uTime * 1.2) * 0.12 * depthFactor;
      float rippleV = sin(pos.x * 0.55 + uTime * 2.1) * sin(pos.z * 0.45 + uTime * 1.8) * 0.04;
      pos.y += wave1 + wave2 + wave3 + rippleV;
      vElevation = wave1 + wave2 + wave3;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;
  const seaFragmentShader = `
    uniform float uTime;
    uniform float uNight;
    varying vec2  vUv;
    varying float vElevation;
    varying float vDistFromShore;
    void main() {
      vec3 shoreColor = mix(vec3(0.38,0.82,0.78), vec3(0.05,0.12,0.25), uNight);
      vec3 midColor   = mix(vec3(0.10,0.55,0.72), vec3(0.03,0.08,0.20), uNight);
      vec3 deepColor  = mix(vec3(0.04,0.28,0.52), vec3(0.01,0.04,0.14), uNight);
      float d = vDistFromShore;
      vec3 col = mix(shoreColor, midColor,  smoothstep(0.0, 0.4, d));
      col      = mix(col,        deepColor, smoothstep(0.4, 1.0, d));
      float crest = smoothstep(0.10, 0.30, vElevation);
      col = mix(col, vec3(0.55,0.88,0.90), crest * 0.35 * (1.0 - uNight * 0.6));
      float foam = smoothstep(0.28, 0.38, vElevation);
      col = mix(col, vec3(0.92,0.97,1.00), foam * 0.7);
      float sunRefl = pow(max(vElevation,0.0),2.5) * smoothstep(0.5,1.0,vDistFromShore)*0.5;
      col += vec3(sunRefl*0.9, sunRefl*0.75, sunRefl*0.3) * (1.0 - uNight);
      // reflejo lunar de noche
      col += vec3(sunRefl*0.2, sunRefl*0.3, sunRefl*0.6) * uNight;
      float alpha = mix(0.60, 0.95, smoothstep(0.0, 0.3, d));
      gl_FragColor = vec4(col, alpha);
    }
  `;
  const seaUniforms = { uTime: { value: 0 }, uNight: { value: 0 } };
  const seaMat  = new THREE.ShaderMaterial({
    vertexShader: seaVertexShader, fragmentShader: seaFragmentShader,
    uniforms: seaUniforms, transparent: true, depthWrite: false, side: THREE.FrontSide,
  });
  const seaMesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 130, 64, 64), seaMat);
  seaMesh.rotation.x = -Math.PI / 2;
  seaMesh.position.set(SEA_START + 30, -0.08, 0);
  scene.add(seaMesh);

  // ─── Materiales ───────────────────────────────────────────────────────────
  const mRoad     = new THREE.MeshLambertMaterial({ color: 0x888070 });
  const mPath     = new THREE.MeshLambertMaterial({ color: 0xd4c090 });
  const mRoadLine = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mPlant    = new THREE.MeshLambertMaterial({ color: 0xddd7ca });
  const mRoof     = new THREE.MeshLambertMaterial({ color: 0x1b3d2d });
  const mRoofMain = new THREE.MeshLambertMaterial({ color: 0x2a5c40 });
  const mTank     = new THREE.MeshLambertMaterial({ color: 0x4a7c6f });
  const mTankRing = new THREE.MeshLambertMaterial({ color: 0x2e4f45 });
  const mTankCap  = new THREE.MeshLambertMaterial({ color: 0x3a6358 });
  const mResort   = new THREE.MeshLambertMaterial({ color: 0xf0ead8 });
  const mMain     = new THREE.MeshLambertMaterial({ color: 0xfaf5ec });
  const mWin      = new THREE.MeshLambertMaterial({ color: 0x223344, emissive: 0x000000 });
  const mDoor     = new THREE.MeshLambertMaterial({ color: 0x5c3d1e });
  const mSill     = new THREE.MeshLambertMaterial({ color: 0xd4c9a8 });
  const mTrunk    = new THREE.MeshLambertMaterial({ color: 0x8b6914 });
  const mLeaf     = new THREE.MeshLambertMaterial({ color: 0x2d6a1f, side: THREE.DoubleSide });
  const mCactus   = new THREE.MeshLambertMaterial({ color: 0x3a7a3a });
  const mRock     = new THREE.MeshLambertMaterial({ color: 0x9e9484 });
  const mHill     = new THREE.MeshLambertMaterial({ color: 0xb8a070 });
  const mHillDk   = new THREE.MeshLambertMaterial({ color: 0xa08860 });
  const mHuman    = new THREE.MeshLambertMaterial({ color: 0xf4a460 });
  const mGrass    = new THREE.MeshLambertMaterial({ color: 0x7a9a5a });
  const mCar      = new THREE.MeshLambertMaterial({ color: 0x8b2020 });
  const mGlass    = new THREE.MeshLambertMaterial({ color: 0x334455, transparent: true, opacity: 0.7 });
  const mWheel    = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const mManhole  = new THREE.MeshLambertMaterial({ color: 0x666055 });

  // Material de tubería animada
  const pipeCanvas = document.createElement('canvas');
  pipeCanvas.width  = 64;
  pipeCanvas.height = 256;
  const pipeCtx = pipeCanvas.getContext('2d');
  function drawPipeTexture(offsetY) {
    pipeCtx.clearRect(0, 0, 64, 256);
    pipeCtx.fillStyle = '#b8903a';
    pipeCtx.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 5; i++) {
      const y = ((offsetY + i * 52) % 256);
      const grad = pipeCtx.createLinearGradient(0, y, 0, y + 28);
      grad.addColorStop(0,   'rgba(70,160,220,0)');
      grad.addColorStop(0.3, 'rgba(70,160,220,0.55)');
      grad.addColorStop(0.7, 'rgba(70,160,220,0.55)');
      grad.addColorStop(1,   'rgba(70,160,220,0)');
      pipeCtx.fillStyle = grad;
      pipeCtx.fillRect(0, y - 28, 64, 56);
    }
  }
  const pipeTex = new THREE.CanvasTexture(pipeCanvas);
  pipeTex.wrapS = THREE.RepeatWrapping;
  pipeTex.wrapT = THREE.RepeatWrapping;
  const mPipe = new THREE.MeshLambertMaterial({ map: pipeTex });

  // ── Textura XRAY — agua neón brillante animada ──────────────────────────────
  const xrayCanvas = document.createElement('canvas');
  xrayCanvas.width  = 64;
  xrayCanvas.height = 256;
  const xrayCtx = xrayCanvas.getContext('2d');
  function drawXrayTexture(offsetY) {
    xrayCtx.clearRect(0, 0, 64, 256);
    // Fondo oscuro translúcido del tubo
    xrayCtx.fillStyle = 'rgba(0, 30, 60, 0.92)';
    xrayCtx.fillRect(0, 0, 64, 256);
    // Reflejo lateral (efecto tubo cilíndrico)
    const sideGrad = xrayCtx.createLinearGradient(0, 0, 64, 0);
    sideGrad.addColorStop(0,    'rgba(0,180,255,0.08)');
    sideGrad.addColorStop(0.25, 'rgba(0,180,255,0.22)');
    sideGrad.addColorStop(0.5,  'rgba(0,220,255,0.06)');
    sideGrad.addColorStop(0.75, 'rgba(0,180,255,0.22)');
    sideGrad.addColorStop(1,    'rgba(0,180,255,0.08)');
    xrayCtx.fillStyle = sideGrad;
    xrayCtx.fillRect(0, 0, 64, 256);
    // Burbujas / pulsos de agua fluyendo — 6 ondas
    for (let i = 0; i < 6; i++) {
      const y = ((offsetY * 1.6 + i * 42) % 256);
      const grad = xrayCtx.createLinearGradient(0, y - 18, 0, y + 18);
      grad.addColorStop(0,    'rgba(0,220,255,0)');
      grad.addColorStop(0.35, 'rgba(0,220,255,0.85)');
      grad.addColorStop(0.5,  'rgba(180,240,255,1.0)');
      grad.addColorStop(0.65, 'rgba(0,220,255,0.85)');
      grad.addColorStop(1,    'rgba(0,220,255,0)');
      xrayCtx.fillStyle = grad;
      xrayCtx.fillRect(8, y - 18, 48, 36);
    }
    // Brillo central (highlight)
    const hGrad = xrayCtx.createLinearGradient(0, 0, 64, 0);
    hGrad.addColorStop(0.4, 'rgba(255,255,255,0)');
    hGrad.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    hGrad.addColorStop(0.6, 'rgba(255,255,255,0)');
    xrayCtx.fillStyle = hGrad;
    xrayCtx.fillRect(0, 0, 64, 256);
  }
  const xrayTex = new THREE.CanvasTexture(xrayCanvas);
  xrayTex.wrapS = THREE.RepeatWrapping;
  xrayTex.wrapT = THREE.RepeatWrapping;
  // Material para tuberías principales en modo XRAY
  const mPipeXray = new THREE.MeshBasicMaterial({
    map: xrayTex, transparent: true, opacity: 0.95, depthWrite: false,
  });
  // Material para red de distribución en modo XRAY (más tenue)
  const mPipeNetXray = new THREE.MeshBasicMaterial({
    map: xrayTex, transparent: true, opacity: 0.80, depthWrite: false,
  });
  let xrayTexOffset = 0;

  // ─── Layout ───────────────────────────────────────────────────────────────
  const HILL_CX    =  0;
  const HILL_CZ    = -32;
  const HILL_TOP_Y =  5.2;

  // Arrays de meshes animados — declarados antes de cualquier uso
  const windowGlows      = [];
  const streetLampLights = [];
  const lampHalos        = [];

  // ─── Planta Desalinizadora ────────────────────────────────────────────────
  const plantG = new THREE.Group();
  plantG.position.set(12, 0, -8);
  const bldg = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 7), mPlant);
  bldg.position.y = 2; bldg.castShadow = true; bldg.receiveShadow = true;
  plantG.add(bldg);
  [[-2.5, 1.5], [1, 1.5]].forEach(([ox, oz]) => {
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 3.2, 8), mPlant);
    ch.position.set(ox, 5.6, oz); ch.castShadow = true; plantG.add(ch);
  });
  // MEJORA 5: Ventanas y cartel en la planta desalinizadora
  [[-3.5,2],[-1,2],[1.5,2]].forEach(([ox,oy]) => {
    const pw = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.7,0.1),
      new THREE.MeshLambertMaterial({ color:0x223344, emissive:0xffcc66, emissiveIntensity:0 }));
    pw.position.set(ox, oy, 3.55); plantG.add(pw);
    windowGlows.push(pw);
  });
  // Cartel "DESALINIZADORA"
  const signMat = new THREE.MeshLambertMaterial({ color: 0x1b3d2d });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 0.7, 0.1), signMat);
  sign.position.set(0, 4.6, 3.55); plantG.add(sign);
  scene.add(plantG);

  // ─── Montaña ──────────────────────────────────────────────────────────────
  function buildMeseta(cx, cz) {
    const g = new THREE.Group(); g.position.set(cx, 0, cz);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(10, 15, 2.8, 18), mGround);
    base.position.y = 1.4; base.castShadow = true; base.receiveShadow = true; g.add(base);
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(7, 10, 2.0, 16), mHill);
    mid.position.y = 3.8; mid.castShadow = true; g.add(mid);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 7, 0.8, 16), mHillDk);
    top.position.y = 5.2; top.castShadow = true; g.add(top);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.12, 18), mHill);
    cap.position.y = HILL_TOP_Y + 0.06; g.add(cap);
    scene.add(g);
  }
  buildMeseta(HILL_CX, HILL_CZ);

  // ─── Estanque ─────────────────────────────────────────────────────────────
  const TANK_R      = 3.0;
  const TANK_H      = 5.5;
  const TANK_BASE_Y = HILL_TOP_Y + 0.12;
  const TANK_CY     = TANK_BASE_Y + TANK_H / 2;

  function buildBigTank(wx, wz) {
    const g = new THREE.Group(); g.position.set(wx, TANK_CY, wz);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(TANK_R, TANK_R, TANK_H, 24), mTank);
    body.castShadow = true; g.add(body);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(TANK_R, TANK_R + 0.8, 0.5, 24), mTankRing);
    skirt.position.y = -TANK_H / 2 - 0.15; g.add(skirt);
    [-2, 0, 2].forEach(ry => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(TANK_R + 0.06, 0.11, 8, 28), mTankRing);
      ring.rotation.x = Math.PI / 2; ring.position.y = ry; g.add(ring);
    });
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(TANK_R + 0.06, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), mTankCap
    );
    dome.position.y = TANK_H / 2; dome.castShadow = true; g.add(dome);
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.8, 8), mTankRing);
    vent.position.y = TANK_H / 2 + 2.0; g.add(vent);
    scene.add(g);
  }
  buildBigTank(HILL_CX, HILL_CZ);
  // MEJORA 6: Nivel de agua visible dentro del estanque (disco azul)
  const mWaterLevel = new THREE.MeshBasicMaterial({
    color: 0x2288cc, transparent: true, opacity: 0.75,
  });
  const waterDisc = new THREE.Mesh(new THREE.CylinderGeometry(TANK_R - 0.12, TANK_R - 0.12, 0.08, 20), mWaterLevel);
  waterDisc.position.set(HILL_CX, TANK_BASE_Y + TANK_H * 0.72, HILL_CZ);
  scene.add(waterDisc);
  // Ondita en el disco
  let waterDiscTimer = 0;

  // ─── Tuberías ─────────────────────────────────────────────────────────────
  function makePipe(from, to, r = 0.20) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.05) return null;
    const mid  = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    const geo  = new THREE.CylinderGeometry(r, r, len, 10, 12);
    const mesh = new THREE.Mesh(geo, mPipe);
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
  }
  function makeCodo(x, y, z, r = 0.28) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), mPipe);
    m.position.set(x, y, z); scene.add(m);
  }
  function makeManhole(x, z) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 14), mManhole);
    base.position.set(x, 0.03, z);
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.02, 0.06), mRock);
    b1.position.set(x, 0.07, z);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.48), mRock);
    b2.position.set(x, 0.07, z);
    scene.add(base); scene.add(b1); scene.add(b2);
  }

  const pTankOut  = new THREE.Vector3(HILL_CX + TANK_R * 0.5, TANK_BASE_Y, HILL_CZ);
  const pSlopeMid = new THREE.Vector3(HILL_CX + 2, 3.2, HILL_CZ + 9);
  const pHillFoot = new THREE.Vector3(HILL_CX, 0.3, HILL_CZ + 14);
  const pMainIn   = new THREE.Vector3(0, 0.3, -20);
  makePipe(pTankOut, pSlopeMid, 0.28);
  makePipe(pSlopeMid, pHillFoot, 0.28);
  makePipe(pHillFoot, pMainIn, 0.28);
  makeCodo(pSlopeMid.x, pSlopeMid.y, pSlopeMid.z, 0.32);
  makeCodo(pHillFoot.x, pHillFoot.y, pHillFoot.z, 0.32);
  makeCodo(pMainIn.x, pMainIn.y, pMainIn.z, 0.32);

  // Red de distribución (toggle)
  const pipeNetGroup = new THREE.Group();
  scene.add(pipeNetGroup);
  pipeNetGroup.visible = false;

  function makePipeNet(from, to, r = 0.18) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.05) return;
    const mid  = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10, 12), mPipe);
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    mesh.castShadow = true;
    pipeNetGroup.add(mesh);
  }
  function makeCodoNet(x, y, z, r = 0.22) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), mPipe);
    m.position.set(x, y, z); pipeNetGroup.add(m);
  }

  const NY = 0.28;
  makePipeNet(new THREE.Vector3(0, NY, -12), new THREE.Vector3(0, NY, -6), 0.22);
  makeCodoNet(0, NY, -12, 0.26); makeCodoNet(0, NY, -6, 0.26);
  makePipeNet(new THREE.Vector3(-14, NY, -6), new THREE.Vector3(14, NY, -6), 0.18);
  const cabinXs = [-10, -3, 5];
  cabinXs.forEach(cx => {
    makePipeNet(new THREE.Vector3(cx, NY, -6), new THREE.Vector3(cx, NY, 2),  0.13);
    makePipeNet(new THREE.Vector3(cx, NY, -6), new THREE.Vector3(cx, NY, 6),  0.13);
    makePipeNet(new THREE.Vector3(cx, NY,  6), new THREE.Vector3(cx, NY, 11), 0.13);
    makeCodoNet(cx, NY, -6, 0.17); makeCodoNet(cx, NY, 6, 0.17);
  });
  [[0,-9],[0,-6],[-7,-6],[7,-6],[-10,-6],[-10,0],[-10,6],
   [-3,-6],[-3,0],[-3,6],[5,-6],[5,0],[5,6]].forEach(([x,z]) => makeManhole(x,z));

  // btnPipe now lives in the sidebar
  const btnPipe = document.getElementById('btn-toggle-pipes') || (() => {
    const b = document.createElement('button'); b.id = 'btn-toggle-pipes'; return b;
  })();
  btnPipe.addEventListener('click', () => {
    pipeNetGroup.visible = !pipeNetGroup.visible;
    btnPipe.classList.toggle('sb-active', pipeNetGroup.visible);
    btnPipe.querySelector?.('.sb-label') && (btnPipe.querySelector('.sb-label').textContent =
      pipeNetGroup.visible ? 'Ocultar Tuberías' : 'Mostrar Tuberías');
  });
  wrapper.style.position = 'relative';

  // ─── Calles ───────────────────────────────────────────────────────────────
  const roadMain = new THREE.Mesh(new THREE.PlaneGeometry(52, 5.5), mRoad);
  roadMain.rotation.x = -Math.PI / 2;
  roadMain.position.set(-10, 0.06, -6);
  roadMain.receiveShadow = true;
  scene.add(roadMain);

  const roadSide = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 45), mRoad);
  roadSide.rotation.x = -Math.PI / 2;
  roadSide.position.set(-14, 0.06, 2);
  roadSide.receiveShadow = true;
  scene.add(roadSide);

  const pathC = new THREE.Mesh(new THREE.PlaneGeometry(40, 2.4), mPath);
  pathC.rotation.x = -Math.PI / 2;
  pathC.position.set(-5, 0.07, 8.5);
  pathC.receiveShadow = true;
  scene.add(pathC);

  const pathA = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 6), mPath);
  pathA.rotation.x = -Math.PI / 2;
  pathA.position.set(0, 0.07, -9);
  scene.add(pathA);

  for (let x = -33; x <= 14; x += 5) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.2), mRoadLine);
    d.rotation.x = -Math.PI / 2; d.position.set(x, 0.08, -6); scene.add(d);
  }
  for (let z = -18; z <= 22; z += 5) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 2.5), mRoadLine);
    d.rotation.x = -Math.PI / 2; d.position.set(-14, 0.08, z); scene.add(d);
  }
  [-3.0, 3.0].forEach(dz => {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(52, 0.14, 0.35), mPath);
    curb.position.set(-10, 0.07, -6 + dz); scene.add(curb);
  });
  // MEJORA 7: Paso de cebra en la intersección
  for (let i = 0; i < 5; i++) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 4.8), mRoadLine);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(-14 + (i - 2) * 0.9 + 0.3, 0.09, -6);
    scene.add(stripe);
  }

  // ─── Casa principal ───────────────────────────────────────────────────────
  function buildMainHouse(px, pz) {
    const g = new THREE.Group(); g.position.set(px, 0, pz);
    const sw = 10, sh = 5, sd = 8;
    const body = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), mMain);
    body.position.y = sh / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
    const eave = new THREE.Mesh(new THREE.BoxGeometry(sw+1.4, 0.2, sd+1.4), mRoofMain);
    eave.position.y = sh + 0.1; g.add(eave);
    const roofFlat = new THREE.Mesh(new THREE.BoxGeometry(sw+0.6, 0.4, sd+0.6), mRoofMain);
    roofFlat.position.y = sh + 0.3; roofFlat.castShadow = true; g.add(roofFlat);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(sw*0.5, 0.65, 0.5), mRoofMain);
    crest.position.y = sh + 0.65; g.add(crest);
    [-1.1, 1.1].forEach(dx => {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, sh*0.55, 0.1), mDoor);
      door.position.set(dx, sh*0.275, sd/2+0.05); g.add(door);
    });
    [-3.5,-1.2,1.2,3.5].forEach(wx => {
      // Ventana con brillo nocturno
      const winMat = new THREE.MeshLambertMaterial({ color: 0x223344, emissive: 0xffcc66, emissiveIntensity: 0 });
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.1), winMat);
      win.position.set(wx, sh*0.65, sd/2+0.05); g.add(win);
      windowGlows.push(win);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.22), mSill);
      sill.position.set(wx, sh*0.65-0.75, sd/2+0.13); g.add(sill);
    });
    const winBack = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 0.1), mWin);
    winBack.position.set(0, sh*0.6, -(sd/2+0.05)); g.add(winBack);
    // MEJORA 9: Antena de comunicaciones en la azotea
    const mAnt = new THREE.MeshLambertMaterial({ color:0x888888 });
    const antPost = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,2.2,6), mAnt);
    antPost.position.set(3.5, sh+1.6, 0); g.add(antPost);
    [-0.5,0,0.5].forEach(h => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.8,4), mAnt);
      arm.rotation.z = Math.PI/2; arm.position.set(3.5, sh+1.2+h*0.5, 0); g.add(arm);
    });
    // Luz roja parpadeante en la cima de la antena
    const blinkMat = new THREE.MeshBasicMaterial({ color:0xff2200 });
    const blinkLight = new THREE.Mesh(new THREE.SphereGeometry(0.08,6,4), blinkMat);
    blinkLight.position.set(3.5, sh+2.8, 0);
    blinkLight.userData.isBlink = true;
    g.add(blinkLight);
    const terrace = new THREE.Mesh(new THREE.BoxGeometry(sw+1, 0.15, 2.8), mSill);
    terrace.position.set(0, 0.075, sd/2+1.4); g.add(terrace);
    [-4,-1.3,1.3,4].forEach(px2 => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,sh*0.5,6), mSill);
      post.position.set(px2, sh*0.25, sd/2+2.7); g.add(post);
    });
    scene.add(g);
  }


  buildMainHouse(0, -16);

  // ─── Casitas huéspedes ────────────────────────────────────────────────────
  function buildHouse(px, pz, sw, sh, sd) {
    const g = new THREE.Group(); g.position.set(px, 0, pz);
    const body = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), mResort);
    body.position.y = sh/2; body.castShadow = true; body.receiveShadow = true; g.add(body);
    const rb = new THREE.Mesh(new THREE.BoxGeometry(sw+0.7, 0.22, sd+0.7), mRoof);
    rb.position.y = sh+0.11; g.add(rb);
    const rt = new THREE.Mesh(new THREE.CylinderGeometry(0.0, (sw+0.7)*0.72, sh*0.45, 4), mRoof);
    rt.position.y = sh+0.22+(sh*0.45)/2; rt.rotation.y = Math.PI/4; rt.castShadow = true; g.add(rt);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.75, sh*0.55, 0.08), mDoor);
    door.position.set(0, sh*0.55/2, sd/2+0.04); g.add(door);
    [-sw*0.28, sw*0.28].forEach(wx => {
      const winMat = new THREE.MeshLambertMaterial({ color: 0x223344, emissive: 0xffcc66, emissiveIntensity: 0 });
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.85, 0.08), winMat);
      win.position.set(wx, sh*0.62, sd/2+0.04); g.add(win);
      windowGlows.push(win);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.18), mSill);
      sill.position.set(wx, sh*0.62-0.47, sd/2+0.09); g.add(sill);
    });
    scene.add(g);
  }
  buildHouse(-10, 4, 4.5, 3.2, 4); buildHouse(-3, 4, 4.5, 3.2, 4); buildHouse(5, 4, 4.5, 3.2, 4);
  buildHouse(-10,13, 4.5, 3.2, 4); buildHouse(-3,13, 4.5, 3.2, 4); buildHouse(5,13, 4.5, 3.2, 4);

  [[-10,4],[-3,4],[5,4],[-10,13],[-3,13],[5,13]].forEach(([gx,gz]) => {
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.5), mGrass);
    grass.rotation.x = -Math.PI/2; grass.position.set(gx, 0.05, gz-3.5); scene.add(grass);
  });
  // MEJORA 8: Piscina comunitaria entre las dos filas de casitas
  const mPool     = new THREE.MeshBasicMaterial({ color:0x1a8acc, transparent:true, opacity:0.82 });
  const mPoolEdge = new THREE.MeshLambertMaterial({ color:0xe8e0d0 });
  const poolGeo   = new THREE.PlaneGeometry(5.5, 3.2);
  const pool      = new THREE.Mesh(poolGeo, mPool);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(8, 0.06, 8.5);
  scene.add(pool);
  // Borde de la piscina
  const poolEdge = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.2, 3.8), mPoolEdge);
  poolEdge.position.set(8, 0.1, 8.5);
  scene.add(poolEdge);
  // Agua interior (rebaje)
  const poolInner = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.18, 3.0), mPool);
  poolInner.position.set(8, 0.01, 8.5);
  scene.add(poolInner);

  // ─── Autos ────────────────────────────────────────────────────────────────
  function buildCar(px, pz, rotY = 0) {
    const g = new THREE.Group(); g.position.set(px, 0, pz); g.rotation.y = rotY;
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.7, 1.8), mCar);
    chassis.position.y = 0.55; chassis.castShadow = true; g.add(chassis);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 1.6), mCar);
    cabin.position.set(-0.2, 1.28, 0); cabin.castShadow = true; g.add(cabin);
    const windF = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, 1.4), mGlass);
    windF.position.set(0.88, 1.28, 0); g.add(windF);
    const windR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, 1.4), mGlass);
    windR.position.set(-1.22, 1.28, 0); g.add(windR);
    [-0.82, 0.82].forEach(dz => {
      const ws = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 0.06), mGlass);
      ws.position.set(-0.2, 1.3, dz); g.add(ws);
    });
    [[-1.2,-0.9],[-1.2,0.9],[1.0,-0.9],[1.0,0.9]].forEach(([wx,wz]) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12), mWheel);
      wheel.rotation.z = Math.PI/2; wheel.position.set(wx, 0.36, wz); g.add(wheel);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.30, 8), mSill);
      rim.rotation.z = Math.PI/2; rim.position.set(wx, 0.36, wz); g.add(rim);
    });
    [-0.5,0.5].forEach(dz => {
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.22,0.35), mRoadLine);
      light.position.set(1.9, 0.7, dz); g.add(light);
    });
    scene.add(g);
  }
  buildCar(-7, -6, 0);
  buildCar( 3, -6, Math.PI);

  // ══ NUBES QUE SE MUEVEN ══════════════════════════════════════════════════
  const mCloud = new THREE.MeshLambertMaterial({ color:0xffffff, transparent:true, opacity:0.82 });
  const clouds = [];
  [
    { x:-30, y:28, z:-15, sx:5,   sy:2,   sz:3.5, spd:0.8  },
    { x:  5, y:32, z: -8, sx:7,   sy:2.2, sz:4,   spd:0.55 },
    { x: 20, y:26, z: 12, sx:4,   sy:1.8, sz:3,   spd:1.1  },
    { x:-10, y:30, z: 22, sx:6,   sy:2,   sz:3.8, spd:0.7  },
    { x: 35, y:29, z:-20, sx:5,   sy:1.9, sz:3.2, spd:0.9  },
  ].forEach(c => {
    const g = new THREE.Group();
    [[0,0,0],[c.sx*0.25,0.4,0],[c.sx*0.5,0,0]].forEach(([ox,oy]) => {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1,8,6),
        new THREE.MeshLambertMaterial({ color:0xffffff, transparent:true, opacity:0.82 }));
      puff.scale.set(c.sx*0.38+ox*0.05, c.sy*0.5, c.sz*0.38);
      puff.position.set(ox, oy, 0);
      g.add(puff);
    });
    g.position.set(c.x, c.y, c.z);
    scene.add(g);
    clouds.push({ group:g, spd:c.spd, baseX:c.x });
  });

  // ══ BANCO DE PECES bajo el mar ════════════════════════════════════════════
  const mFish = new THREE.MeshLambertMaterial({ color:0x1a6688 });
  const fishGroup = new THREE.Group();
  const fishMeshes = [];
  for (let i=0; i<14; i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.18,6,4), mFish);
    f.scale.set(1.8, 0.6, 0.7);
    f.position.set((Math.random()-0.5)*8, -1.2+Math.random()*0.6, (Math.random()-0.5)*6);
    f.userData.phase = Math.random()*Math.PI*2;
    fishGroup.add(f);
    fishMeshes.push(f);
  }
  fishGroup.position.set(38, 0, 5);
  scene.add(fishGroup);

  // ══ HUMO DE CHIMENEAS de la planta ════════════════════════════════════════
  const smokeParticles = [];
  // Chimeneas en plantG.position=(12,0,-8), offsets [[-2.5,1.5],[1,1.5]]
  [[12-2.5, -8+1.5],[12+1, -8+1.5]].forEach(([cx,cz]) => {
    for (let i=0; i<8; i++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.22+Math.random()*0.18, 6, 5),
        new THREE.MeshBasicMaterial({ color:0xbbbbbb, transparent:true, opacity:0 })
      );
      puff.position.set(cx+(Math.random()-0.5)*0.3, 7+Math.random()*2, cz+(Math.random()-0.5)*0.3);
      puff._baseY = puff.position.y;
      puff._life  = Math.random();
      puff._speed = 0.006+Math.random()*0.005;
      scene.add(puff);
      smokeParticles.push(puff);
    }
  });

  // ══ AUTO AZUL — circula por la calle LATERAL (X=-14, eje Z) ════════════
  const movingCar = new THREE.Group();
  const mCarBlue = new THREE.MeshLambertMaterial({ color:0x224488 });
  const mc_chassis = new THREE.Mesh(new THREE.BoxGeometry(3.8,0.7,1.8), mCarBlue);
  mc_chassis.position.y=0.55; mc_chassis.castShadow=true; movingCar.add(mc_chassis);
  const mc_cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2,0.75,1.6), mCarBlue);
  mc_cabin.position.set(-0.2,1.28,0); movingCar.add(mc_cabin);
  const mc_glassM = new THREE.MeshLambertMaterial({ color:0x334455, transparent:true, opacity:0.7 });
  const mc_wf = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.65,1.4), mc_glassM);
  mc_wf.position.set(0.88,1.28,0); movingCar.add(mc_wf);
  [[-1.2,-0.9],[-1.2,0.9],[1.0,-0.9],[1.0,0.9]].forEach(([wx,wz]) => {
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.36,0.36,0.28,10), mWheel);
    wh.rotation.z=Math.PI/2; wh.position.set(wx,0.36,wz); movingCar.add(wh);
  });
  movingCar.position.set(-14, 0, -18);
  movingCar.rotation.y = Math.PI / 2;
  scene.add(movingCar);
  let carDirZ = 1;
  const CAR_MIN_Z = -17, CAR_MAX_Z = 20;

  // ─── Peatones ─────────────────────────────────────────────────────────────
  function buildHuman(px, py, pz, rotY = 0) {
    const g = new THREE.Group(); g.position.set(px, py, pz); g.rotation.y = rotY;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.9, 8), mHuman);
    body.position.y = 0.45; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), mHuman);
    head.position.y = 1.05; g.add(head);
    [-0.1,0.1].forEach(dx => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.07,0.55,6), mHuman);
      leg.position.set(dx, -0.3, 0); g.add(leg);
    });
    scene.add(g);
  }
  buildHuman(-6, 0, 8.5,  0.3); buildHuman(-1, 0, 8.5, Math.PI);
  buildHuman( 4, 0, 8.5,  0.5); buildHuman( 9, 0, 8.5, -0.4);
  buildHuman( 1.5, 0, -9.5, Math.PI*0.9);
  buildHuman(-1.2, 0, -10,  0.1);
  buildHuman(-5, 0, -4, -0.5); buildHuman(6, 0, -4, 0.8);

  // ─── Palmeras ─────────────────────────────────────────────────────────────
  function buildPalm(px, pz, height = 6) {
    const g = new THREE.Group(); g.position.set(px, 0, pz);
    for (let i = 0; i < 5; i++) {
      const t = i/5, segH = height/5;
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22-((i+1)/5)*0.10, 0.22-(i/5)*0.10, segH, 7), mTrunk
      );
      seg.position.set(Math.sin(t*0.5)*0.4, i*segH+segH/2, Math.cos(t*0.3)*0.2);
      seg.rotation.z = t*0.08; seg.castShadow = true; g.add(seg);
    }
    for (let i = 0; i < 7; i++) {
      const angle = (i/7)*Math.PI*2;
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.8), mLeaf);
      frond.position.set(Math.sin(angle)*0.6+Math.sin(0.5)*0.4, height-0.4, Math.cos(angle)*0.6+Math.cos(0.3)*0.2);
      frond.rotation.y = angle; frond.rotation.z = -Math.PI/4 - Math.random()*0.3;
      frond.castShadow = true; g.add(frond);
    }
    scene.add(g);
  }
  // Palmeras reubicadas:
  //  · (-16,4) y (-16,13) → (-19,4) y (-19,13): lejos de calle lateral (X=-14)
  //  · (-13,14) → (-18,16): alejada del borde de la calle
  //  · (-18,-5) → (-20,-2): fuera de la calle principal (Z=-6)
  //  · (9,-5) → (11,-3): fuera del carril de la calle principal
  buildPalm(-19, 4, 5.5); buildPalm(-19,13, 6.2);
  buildPalm( -7, 9, 6.0); buildPalm(  2, 9, 5.5);
  buildPalm(  9,13, 6.5); buildPalm(-18,16, 5.8);
  buildPalm( 12, 4, 6.0); buildPalm( 12,13, 5.5);
  buildPalm( 14,20, 6.5); buildPalm( -2,20, 5.8);
  buildPalm(-20,-2, 5.0); buildPalm( 11,-3, 5.5);
  buildPalm( 16, 8, 7.0); buildPalm( 16,-2, 6.0);
  buildPalm(-20,22, 5.5); buildPalm( -5,25, 6.0);

  // ─── Cactus ───────────────────────────────────────────────────────────────
  function buildCactus(px, pz, h = 3) {
    const g = new THREE.Group(); g.position.set(px, 0, pz);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, h, 8), mCactus);
    body.position.y = h/2; body.castShadow = true; g.add(body);
    [[-1],[1]].forEach(([s]) => {
      const av = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,h*0.45,7), mCactus);
      av.position.set(s*0.4, h*0.5+(h*0.45)/2, 0); g.add(av);
      const ah = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.15,0.55,7), mCactus);
      ah.rotation.z = Math.PI/2; ah.position.set(s*0.18, h*0.5, 0); g.add(ah);
    });
    scene.add(g);
  }
  buildCactus(-18,-22,3.2); buildCactus(10,-26,2.8);
  buildCactus(-10,-28,3.0); buildCactus( 5,-20,2.5);
  buildCactus(-22, 10,2.8); buildCactus(14, 20,3.0);
  buildCactus(-25, -5,3.4);

  // ─── Rocas ────────────────────────────────────────────────────────────────
  function addRocks(cx, cz, count = 5, spread = 10) {
    for (let i = 0; i < count; i++) {
      const sx=0.3+Math.random()*0.8, sy=0.2+Math.random()*0.5, sz=0.3+Math.random()*0.7;
      const rock = new THREE.Mesh(new THREE.SphereGeometry(1,5,4), mRock);
      rock.scale.set(sx,sy,sz);
      rock.position.set(cx+(Math.random()-0.5)*spread, sy*0.5, cz+(Math.random()-0.5)*spread);
      rock.rotation.y = Math.random()*Math.PI;
      rock.castShadow = true; rock.receiveShadow = true;
      scene.add(rock);
    }
  }
  addRocks(HILL_CX, HILL_CZ, 12, 22);
  addRocks(-20, 18, 5, 8);
  addRocks(14, -5, 4, 6);

  // ═══════════════════════════════════════════════════════════════════════════
  //  POSTES DE LUZ
  //  Reglas de ubicación:
  //   - Solo en tierra firme (X < 18)
  //   - Sobre calles o senderos, nunca dentro de edificios ni jardines
  //   - Espaciado ~8–10 unidades a lo largo de la calle principal (Z=-6)
  //   - Calle lateral (X=-14) cada ~6 unidades en Z
  //   - Sendero de huéspedes (Z=8.5) dos postes flanqueando
  //   - Ninguno en Z < -24 (zona de montaña/tierra seca)
  // ═══════════════════════════════════════════════════════════════════════════
  const mPole    = new THREE.MeshLambertMaterial({ color: 0x555550 });
  const mLampCap = new THREE.MeshLambertMaterial({ color: 0x444440 });
  // La esfera del farol cambia de color con emissive en updateDayNight
  const mLampGlo = new THREE.MeshBasicMaterial({ color: 0x776633 });

  function buildStreetLamp(px, pz, rotY = 0) {
    const g = new THREE.Group();
    g.position.set(px, 0, pz);
    g.rotation.y = rotY;

    // Poste cónico
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 5.5, 7), mPole);
    pole.position.y = 2.75; pole.castShadow = true; g.add(pole);

    // Brazo
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), mPole);
    arm.rotation.z = Math.PI / 2; arm.position.set(0.5, 5.5, 0); g.add(arm);

    // Capuchón cónico
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.28, 8), mLampCap);
    cap.position.set(1.0, 5.38, 0); g.add(cap);

    // Bombilla (esfera pequeña, emissive de noche)
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xffee88,
      emissive: 0x000000,      // se enciende con updateDayNight
      emissiveIntensity: 0,
    });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), glowMat);
    glow.position.set(1.0, 5.22, 0); g.add(glow);
    windowGlows.push(glow);   // reutilizamos el array, se anima igual

    // Halo esférico grande semitransparente (solo visible de noche)
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffdd66, transparent: true, opacity: 0, side: THREE.BackSide,
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.8, 10, 8), haloMat);
    halo.position.set(1.0, 5.2, 0); g.add(halo);
    // Guardamos referencia al halo para animarlo
    halo.userData.isLampHalo = true;
    lampHalos.push(haloMat);

    // Cono de luz proyectado hacia abajo (spotlight visual)
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffee88, transparent: true, opacity: 0, side: THREE.BackSide,
    });
    const lightCone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4.5, 10, 1, true), coneMat);
    lightCone.position.set(1.0, 3.0, 0); g.add(lightCone);
    lampHalos.push(coneMat);  // misma animación

    scene.add(g);

    // PointLight real — mayor intensidad y radio para iluminar el suelo
    const light = new THREE.PointLight(0xffdd88, 0, 18);
    light.position.set(px + Math.sin(rotY) * 1.0, 5.2, pz + Math.cos(rotY) * 1.0);
    light.castShadow = false; // desactivar sombras en postes para no saturar la GPU
    scene.add(light);
    streetLampLights.push(light);

    return g;
  }

  // ── Calle principal (Z=-6), postes en el borde norte (Z=-3.5), lado tierra ─
  // De X=-30 a X=13, cada 9 unidades — evitando X≥18 (mar) y X≤-35 (fuera)
  for (let x = -30; x <= 13; x += 9) {
    buildStreetLamp(x, -3.5, 0);    // borde norte de la calle
  }
  // Borde sur de la calle (Z=-8.5), misma lógica pero rotados
  for (let x = -27; x <= 10; x += 9) {
    buildStreetLamp(x, -8.5, Math.PI);
  }

  // ── Calle lateral (X=-11.5), de Z=-16 a Z=19, cada 7 unidades ─────────────
  //    Movidas al borde DERECHO de la calle para no obstruir al auto azul (X=-14)
  for (let z = -16; z <= 19; z += 7) {
    buildStreetLamp(-11.5, z, Math.PI / 2);
  }

  // ── Sendero de huéspedes (Z=8.5), flanqueando ─────────────────────────────
  [-20, -12, -4, 4, 12].forEach(x => {
    buildStreetLamp(x, 6.8, 0);
  });

  // ── Acceso a casa principal (X=0, Z de -12 a -8) ──────────────────────────
  buildStreetLamp(-2.5, -11, Math.PI * 0.25);
  buildStreetLamp( 2.5, -11, -Math.PI * 0.25);

  // ── Zona planta desalinizadora (X≈12, Z≈-8), 2 postes industriales ────────
  buildStreetLamp(7,  -8, Math.PI / 2);
  buildStreetLamp(7, -12, Math.PI / 2);

  // ── Botón día / noche ──────────────────────────────────────────────────────
  // btnDayNight now lives in the sidebar
  const btnDayNight = document.getElementById('btn-day-night') || document.createElement('button');
  if (!btnDayNight.isConnected) btnDayNight.id = 'btn-day-night';
  btnDayNight.addEventListener('click', toggleDayNight);

  // ═══════════════════════════════════════════════════════════════════════════
  //  IDEA 1 — GAVIOTAS animadas sobrevolando la escena
  //  3 gaviotas en formación suelta, trazan arcos sobre el complejo
  // ═══════════════════════════════════════════════════════════════════════════
  const mBird = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const birds = [];
  function buildSeagull(orbitR, orbitY, orbitSpeed, phase) {
    const g = new THREE.Group();
    // Cuerpo
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.55, 6), mBird);
    body.rotation.z = Math.PI / 2; g.add(body);
    // Alas (dos triángulos planos)
    [-1, 1].forEach(side => {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.18), mBird);
      wing.position.set(0, 0, side * 0.28);
      wing.rotation.x = side * 0.25;
      wing.userData.side = side;
      g.add(wing);
    });
    scene.add(g);
    birds.push({ group: g, orbitR, orbitY, orbitSpeed, phase, wingPhase: Math.random() * Math.PI * 2 });
    return g;
  }
  buildSeagull(22, 14, 0.18, 0);
  buildSeagull(18, 17, 0.22, 2.1);
  buildSeagull(26, 12, 0.14, 4.3);

  // ═══════════════════════════════════════════════════════════════════════════
  //  IDEA 2 — VELERO en el mar, se balancea suavemente
  // ═══════════════════════════════════════════════════════════════════════════
  const mHull    = new THREE.MeshLambertMaterial({ color: 0xf5f0e8 });
  const mMast    = new THREE.MeshLambertMaterial({ color: 0xd4c090 });
  const mSail    = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  const mSailRed = new THREE.MeshLambertMaterial({ color: 0xcc3322, side: THREE.DoubleSide });

  const sailboat = new THREE.Group();
  sailboat.position.set(34, 0, 8);  // en el mar

  // Casco
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.0, 0.8, 8), mHull);
  hull.position.y = 0.2; sailboat.add(hull);
  // Cubierta
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.15, 8), mMast);
  deck.position.y = 0.65; sailboat.add(deck);
  // Mástil
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 5.5, 6), mMast);
  mast.position.y = 3.5; sailboat.add(mast);
  // Vela principal (triángulo: ConeGeometry con radio=0 en la punta)
  const sail = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4.2, 3, 1, true), mSail);
  sail.position.set(0.4, 3.2, 0); sail.rotation.y = Math.PI / 6; sailboat.add(sail);
  // Banderín rojo en la cima
  const pennant = new THREE.Mesh(new THREE.ConeGeometry(0, 0.4, 3, 1, true), mSailRed);
  pennant.position.y = 6.0; sailboat.add(pennant);

  scene.add(sailboat);

  // ═══════════════════════════════════════════════════════════════════════════
  //  IDEA 3 — PALMERAS QUE SE MECEN con el viento (fronds oscilan)
  //  Buscamos los grupos de palmeras ya creados y les añadimos animación
  // ═══════════════════════════════════════════════════════════════════════════
  // Recopilamos las palmas en un array para animarlas
  const palmGroups = [];
  scene.traverse(obj => {
    // Las palmeras son Groups con position.y=0 y tienen PlaneGeometry (fronds)
    if (obj.isGroup && obj.children.some(c => c.isMesh && c.geometry?.parameters?.width === 0.5)) {
      palmGroups.push({ group: obj, phase: Math.random() * Math.PI * 2 });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  IDEA 4 — INDICADOR DÍA/NOCHE en el canvas (top-left)
  // ═══════════════════════════════════════════════════════════════════════════
  const dayNightHUD = document.createElement('div');
  dayNightHUD.id = 'day-night-indicator';
  dayNightHUD.textContent = '☀️ Día';
  wrapper.appendChild(dayNightHUD);

  // Actualizar el indicador cuando cambia el modo
  const _origToggle = toggleDayNight;
  // Parcheamos toggleDayNight para también actualizar el HUD
  const _hudUpdate = () => {
    dayNightHUD.textContent = isNight ? '🌙 Noche' : '☀️ Día';
    dayNightHUD.classList.toggle('night', isNight);
  };
  btnDayNight.addEventListener('click', _hudUpdate);

  // ══ PANEL DE PRESIÓN del sistema ════════════════════════════════════════
  const pressureHUD = document.createElement('div');
  pressureHUD.id = 'pressure-hud';
  pressureHUD.innerHTML = `
    <div class="ph-title">⚙️ Presión del Sistema</div>
    <div class="ph-row"><span>Estanque</span>
      <div class="ph-bar-wrap"><div class="ph-bar" id="ph-bar-1" style="width:92%"></div></div>
      <span id="ph-val-1">9.2 bar</span></div>
    <div class="ph-row"><span>Casa Princ.</span>
      <div class="ph-bar-wrap"><div class="ph-bar" id="ph-bar-2" style="width:78%"></div></div>
      <span id="ph-val-2">7.8 bar</span></div>
    <div class="ph-row"><span>Cabañas</span>
      <div class="ph-bar-wrap"><div class="ph-bar" id="ph-bar-3" style="width:65%"></div></div>
      <span id="ph-val-3">6.5 bar</span></div>`;
  wrapper.appendChild(pressureHUD);
  window._pressureDrop = false;

  // ══ REFLEJO LUNAR en el mar (de noche) ════════════════════════════════════
  const moonReflectMat = new THREE.MeshBasicMaterial({
    color:0xddeeff, transparent:true, opacity:0, depthWrite:false,
  });
  const moonReflect = new THREE.Mesh(new THREE.PlaneGeometry(3, 12), moonReflectMat);
  moonReflect.rotation.x = -Math.PI/2;
  moonReflect.position.set(38, 0.05, -10);
  scene.add(moonReflect);

  // ══ MUELLE / EMBARCADERO ══════════════════════════════════════════════════
  const mWood   = new THREE.MeshLambertMaterial({ color:0x8B6334 });
  const mWoodDk = new THREE.MeshLambertMaterial({ color:0x5c3d1e });
  const mBuoy   = new THREE.MeshLambertMaterial({ color:0xee4422 });
  const pier    = new THREE.Group();
  pier.position.set(20, 0, 18);
  for (let i=0; i<9; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.1,0.12,0.22), mWood);
    plank.position.set(i*1.1, 0.55, 0); pier.add(plank);
  }
  [-0.5,0.5].forEach(z => {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(10,0.16,0.12), mWoodDk);
    beam.position.set(4.5, 0.48, z); pier.add(beam);
  });
  [[0,0],[4.5,0],[9,0]].forEach(([x,z]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,1.2,6), mWoodDk);
    post.position.set(x, 0, z); pier.add(post);
  });
  const buoyGroup = new THREE.Group();
  const buoyBody  = new THREE.Mesh(new THREE.SphereGeometry(0.28,8,6), mBuoy);
  buoyGroup.add(buoyBody);
  const buoyTop = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.5,6), mBuoy);
  buoyTop.position.y=0.55; buoyGroup.add(buoyTop);
  buoyGroup.position.set(10.5, 0.28, 0);
  pier.add(buoyGroup);
  scene.add(pier);

  // ══ MODO RADIOGRAFÍA ══════════════════════════════════════════════════════
  let xrayMode = false;
  const xrayMeshes = [];
  scene.traverse(obj => {
    if (obj.isMesh && obj.geometry) {
      const p = obj.position;
      if (p.y > 0.2 && p.x > -22 && p.x < 18 && p.z > -22 && p.z < 18) {
        xrayMeshes.push({ mesh:obj, origMat:obj.material });
      }
    }
  });

  // Cache blink meshes to avoid scene.traverse every frame
  const blinkMeshes = [];
  scene.traverse(obj => { if (obj.userData?.isBlink) blinkMeshes.push(obj); });
  // btnXray now lives in the sidebar
  const btnXray = document.getElementById('btn-xray') || (() => {
    const b = document.createElement('button'); b.id = 'btn-xray'; return b;
  })();
  // Guardamos materiales originales de la red de distribución para restaurarlos
  const pipeNetOrigMats = [];
  pipeNetGroup.traverse(obj => {
    if (obj.isMesh) pipeNetOrigMats.push({ mesh: obj, orig: obj.material });
  });

  btnXray.addEventListener('click', () => {
    xrayMode = !xrayMode;
    btnXray.classList.toggle('sb-active', xrayMode);
    const lbl = btnXray.querySelector('.sb-label');
    if (lbl) lbl.textContent = xrayMode ? 'Vista Normal' : 'Radiografía';
    else { btnXray.innerHTML = xrayMode ? '🔬 Vista Normal' : '🔬 Radiografía'; }

    const xrayBodyMat = new THREE.MeshLambertMaterial({
      color: 0x223344, transparent: true, opacity: 0.10, depthWrite: false,
    });

    // Edificios y objetos → casi transparentes
    xrayMeshes.forEach(({ mesh, origMat }) => {
      mesh.material = xrayMode ? xrayBodyMat : origMat;
    });

    // Tuberías principales → textura de agua neón animada
    scene.traverse(obj => {
      if (obj.isMesh && obj.material === mPipe) {
        obj.material = xrayMode ? mPipeXray : mPipe;
      }
    });

    // Red de distribución → siempre visible en xray, con su propia textura
    if (xrayMode) {
      pipeNetGroup.visible = true;
      pipeNetOrigMats.forEach(({ mesh }) => { mesh.material = mPipeNetXray; });
    } else {
      pipeNetOrigMats.forEach(({ mesh, orig }) => { mesh.material = orig; });
      // No ocultar la red si el usuario la activó manualmente
    }
  });
  // btnXray is in sidebar

  // ══ BOTÓN VISTA LIMPIA ════════════════════════════════════════════════════
  let uiHidden = false;
  const getUiElements = () => [
    document.getElementById('day-night-indicator'),
    document.getElementById('canvas-tooltip'),
    document.getElementById('cam-minimap'),
    document.getElementById('leak-timer-badge'),
  ].filter(Boolean);

  // btnClean now lives in the sidebar
  const btnClean = document.getElementById('btn-clean-view') || (() => {
    const b = document.createElement('button'); b.id = 'btn-clean-view'; return b;
  })();

  // Floating "exit" button injected on the canvas when Vista Limpia is active
  // (the sidebar is collapsed so we need another way to escape)
  function _buildCleanExitBtn() {
    if (document.getElementById('clean-exit-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'clean-exit-btn';
    btn.title = 'Salir de Vista Limpia (tecla V)';
    btn.innerHTML = '✦ <span>Mostrar UI</span>';
    btn.style.cssText = `
      position:absolute; top:0.7rem; left:50%; transform:translateX(-50%);
      background:rgba(15,30,22,.88); color:rgba(184,144,58,.9);
      border:1px solid rgba(184,144,58,.4); border-radius:20px;
      padding:0.32rem 1.1rem; font-family:'Playfair Display',serif;
      font-size:0.78rem; letter-spacing:0.1em; cursor:pointer;
      z-index:200; display:flex; align-items:center; gap:0.4rem;
      transition:background .18s, color .18s;
      box-shadow:0 2px 12px rgba(0,0,0,.4);
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(27,61,45,.97)';
      btn.style.color = '#ddb85a';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(15,30,22,.88)';
      btn.style.color = 'rgba(184,144,58,.9)';
    });
    btn.addEventListener('click', () => btnClean.click());
    wrapper.appendChild(btn);
  }
  function _removeCleanExitBtn() {
    document.getElementById('clean-exit-btn')?.remove();
  }

  btnClean.addEventListener('click', () => {
    uiHidden = !uiHidden;
    // Collapse/expand both sidebars via .collapsed (canvas resizes correctly)
    const sidebarL = document.getElementById('sidebar-left');
    const sidebarR = document.getElementById('sidebar-right');
    [sidebarL, sidebarR].forEach(sb => {
      if (!sb) return;
      if (uiHidden) {
        sb.dataset.wasCollapsed = sb.classList.contains('collapsed') ? '1' : '0';
        sb.classList.add('collapsed');
      } else {
        if (sb.dataset.wasCollapsed === '0') sb.classList.remove('collapsed');
      }
    });
    // Hide/show floating canvas UI elements
    getUiElements().forEach(el => {
      el.style.transition = 'opacity 0.3s ease';
      el.style.opacity    = uiHidden ? '0' : '1';
      el.style.pointerEvents = uiHidden ? 'none' : '';
    });
    // Show/hide the floating escape button
    if (uiHidden) _buildCleanExitBtn(); else _removeCleanExitBtn();
    btnClean.classList.toggle('sb-active', uiHidden);
    const lbl = btnClean.querySelector('.sb-label');
    if (lbl) lbl.textContent = uiHidden ? 'Mostrar UI' : 'Vista Limpia';
    else btnClean.innerHTML = uiHidden ? '✦ Mostrar UI' : '✦ Vista Limpia';
    // Trigger canvas resize after sidebar CSS transition finishes (0.28s)
    setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
  });

  // Keyboard shortcut V to toggle clean view
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'v' || e.key === 'V') btnClean.click();
  });
  // btnClean is in sidebar

  // ─── Init Leaks ───────────────────────────────────────────────────────────
  initLeaks(scene);

  // ─── Resize ───────────────────────────────────────────────────────────────
  function resize() {
    renderer.setSize(wrapper.clientWidth, wrapper.clientHeight, false);
    camera.aspect = wrapper.clientWidth / wrapper.clientHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ─── Loop ─────────────────────────────────────────────────────────────────
  const clock3 = new THREE.Clock();
  let pipeOffset = 0;

  function animate() {
    requestAnimationFrame(animate);
    const delta   = clock3.getDelta();
    const elapsed = clock3.getElapsedTime();

    seaUniforms.uTime.value  = elapsed;
    seaUniforms.uNight.value = dayNightProgress;

    // Tuberías: flujo se DETIENE cuando hay fuga activa (realismo hidráulico)
    // window._leakActive es seteado por leaks.js
    const leakActive = !!window._leakActive;

    const prevPipeOffset = pipeOffset;
    if (!leakActive) {
      pipeOffset = ((pipeOffset - delta * 55) % 256 + 256) % 256;
    }
    // Solo redibujar si el offset realmente cambió (optimización de rendimiento)
    if (pipeOffset !== prevPipeOffset) {
      drawPipeTexture(pipeOffset);
      pipeTex.needsUpdate = true;
    }

    const prevXrayOffset = xrayTexOffset;
    if (!leakActive) {
      xrayTexOffset = ((xrayTexOffset - delta * 80) % 256 + 256) % 256;
    }
    if (xrayTexOffset !== prevXrayOffset) {
      drawXrayTexture(xrayTexOffset);
      xrayTex.needsUpdate = true;
    }

    updateDayNight(delta);

    // ── Gaviotas orbitando ─────────────────────────────────────────
    birds.forEach(b => {
      const t = elapsed * b.orbitSpeed + b.phase;
      b.group.position.set(
        Math.cos(t) * b.orbitR,
        b.orbitY + Math.sin(elapsed * 0.6 + b.phase) * 0.8,
        Math.sin(t) * b.orbitR
      );
      // Orientar en la dirección del vuelo
      b.group.rotation.y = -t - Math.PI / 2;
      // Batir de alas (oscilar las PlaneGeometry en Z local)
      b.wingPhase += delta * 3.5;
      b.group.children.forEach(c => {
        if (c.userData?.side !== undefined)
          c.rotation.x = c.userData.side * (0.15 + Math.sin(b.wingPhase) * 0.35);
      });
    });

    // ── Velero balanceándose ────────────────────────────────────────
    sailboat.rotation.z = Math.sin(elapsed * 0.4) * 0.06;
    sailboat.rotation.x = Math.sin(elapsed * 0.3 + 1.2) * 0.04;
    sailboat.position.x = 34 + Math.sin(elapsed * 0.15) * 1.2;
    sailboat.position.z =  8 + Math.cos(elapsed * 0.18) * 0.8;

    // ── Palmeras meciéndose con el viento ──────────────────────────
    palmGroups.forEach(p => {
      const sway = Math.sin(elapsed * 0.7 + p.phase) * 0.025;
      p.group.children.forEach(c => {
        // Solo fronds (PlaneGeometry)
        if (c.isMesh && c.geometry?.parameters?.width === 0.5)
          c.rotation.z += (sway - c.rotation.z) * 0.08;
      });
    });

    // ── Nubes moviéndose ───────────────────────────────────────────
    const t = dayNightProgress;
    clouds.forEach(c => {
      c.group.position.x += c.spd * delta;
      if (c.group.position.x > 70) c.group.position.x = c.baseX - 70;
      c.group.children.forEach(ch => {
        if (ch.isMesh) {
          ch.material.color.setRGB(1-t*0.7, 1-t*0.7, 1-t*0.5);
          ch.material.opacity = 0.82 - t*0.3;
        }
      });
    });

    // ── Peces nadando ──────────────────────────────────────────────
    fishMeshes.forEach(f => {
      f.userData.phase += delta * 0.9;
      f.position.x += Math.sin(f.userData.phase * 1.1) * delta * 0.5;
      f.position.z += Math.cos(f.userData.phase * 0.8) * delta * 0.3;
      f.position.y  = -1.2 + Math.sin(f.userData.phase * 1.5) * 0.3;
      if (Math.abs(f.position.x) > 5) f.position.x *= -0.95;
      if (Math.abs(f.position.z) > 4) f.position.z *= -0.95;
      f.rotation.y = Math.atan2(Math.sin(f.userData.phase*1.1), Math.cos(f.userData.phase*0.8));
    });

    // ── Humo de chimeneas ──────────────────────────────────────────
    smokeParticles.forEach(p => {
      p._life += p._speed;
      if (p._life > 1) p._life = 0;
      const ph = p._life;
      p.position.y = p._baseY + ph * 3.5;
      p.position.x += Math.sin(elapsed * 0.4 + p._baseY) * delta * 0.08;
      p.material.opacity = ph < 0.3 ? ph / 0.3 * 0.35 : (1 - ph) * 0.35;
      p.scale.setScalar(0.5 + ph * 1.5);
    });

    // ── Auto azul por calle lateral (eje Z) ──────────────────────
    movingCar.position.z += carDirZ * 4.2 * delta;
    movingCar.rotation.y = carDirZ > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (movingCar.position.z > CAR_MAX_Z) { carDirZ = -1; movingCar.position.z = CAR_MAX_Z; }
    if (movingCar.position.z < CAR_MIN_Z) { carDirZ =  1; movingCar.position.z = CAR_MIN_Z; }

    // MEJORA 10: Animaciones de sol, arcoíris, agua, antena
    // Halo del sol pulsa suavemente
    sunHaloMat.opacity = (0.06 + Math.sin(elapsed * 0.8) * 0.03) * (1 - dayNightProgress);



    // Disco de agua del estanque sube y baja levemente
    waterDiscTimer += delta;
    waterDisc.position.y = TANK_BASE_Y + TANK_H * 0.72 + Math.sin(waterDiscTimer * 0.9) * 0.04;
    waterDisc.material.opacity = 0.75 + Math.sin(waterDiscTimer * 1.5) * 0.1;

    // Luz parpadeante de antena (usa caché, sin traverse por frame)
    const blinkOn = Math.sin(elapsed * 4) > 0.6;
    blinkMeshes.forEach(m => { m.visible = blinkOn; });

    // Piscina: reflejo sutil de luz (ondas de color)
    pool.material.color.setHSL(0.58, 0.7, 0.35 + Math.sin(elapsed*0.6)*0.04);

    // ── Reflejo lunar ──────────────────────────────────────────────
    moonReflectMat.opacity = dayNightProgress * 0.35 * (0.85 + Math.sin(elapsed*0.5)*0.15);

    // ── Boya del muelle subiendo y bajando ─────────────────────────
    buoyGroup.position.y = 0.28 + Math.sin(elapsed * 1.1) * 0.12;

    // ── Panel de presión: pulsa de día / cae dramáticamente en fuga ───────
    if (!window._pressureDrop) {
      const p1 = 88 + Math.sin(elapsed*0.4)*4;
      const p2 = 74 + Math.sin(elapsed*0.5+1)*3;
      const p3 = 61 + Math.sin(elapsed*0.6+2)*3;
      const b1 = document.getElementById('ph-bar-1');
      const b2 = document.getElementById('ph-bar-2');
      const b3 = document.getElementById('ph-bar-3');
      const v1 = document.getElementById('ph-val-1');
      const v2 = document.getElementById('ph-val-2');
      const v3 = document.getElementById('ph-val-3');
      if (b1) { b1.style.width=p1+'%'; b1.style.background=''; v1.textContent=(p1/10).toFixed(1)+' bar'; }
      if (b2) { b2.style.width=p2+'%'; b2.style.background=''; v2.textContent=(p2/10).toFixed(1)+' bar'; }
      if (b3) { b3.style.width=p3+'%'; b3.style.background=''; v3.textContent=(p3/10).toFixed(1)+' bar'; }
    } else {
      // Fuga activa: presión cae hacia 0 en el sector afectado
      const drop = Math.max(0, 1 - (elapsed % 10) / 8); // baja progresivamente
      const p1 = (88 + Math.sin(elapsed*0.4)*4) * 0.92;  // estanque: poca afectación
      const p2 = (74 + Math.sin(elapsed*0.5+1)*3) * 0.55; // casa: moderada
      const p3 = Math.max(2, 61 * drop * 0.3);            // cabañas: colapso
      const b1 = document.getElementById('ph-bar-1');
      const b2 = document.getElementById('ph-bar-2');
      const b3 = document.getElementById('ph-bar-3');
      const v1 = document.getElementById('ph-val-1');
      const v2 = document.getElementById('ph-val-2');
      const v3 = document.getElementById('ph-val-3');
      if (b1) { b1.style.width=p1+'%'; b1.style.background=''; v1.textContent=(p1/10).toFixed(1)+' bar'; }
      if (b2) { b2.style.width=p2+'%'; b2.style.background='#e06020'; v2.textContent=(p2/10).toFixed(1)+' bar ⚠️'; }
      if (b3) { b3.style.width=Math.max(p3,2)+'%'; b3.style.background='#cc2222'; v3.textContent=(p3/10).toFixed(2)+' bar 🚨'; }
    }

    updateControls(delta);
    updateLeaks();
    renderer.render(scene, camera);
  }
  animate();
}
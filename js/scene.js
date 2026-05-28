import * as THREE from 'three';
import { initControls, updateControls } from './controls.js';
import { initLeaks, updateLeaks } from './leaks.js';

export function initThree() {
  const canvas = document.getElementById('three-canvas');
  const wrapper = canvas.parentElement;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcec9bc);
  scene.fog = new THREE.FogExp2(0xcec9bc, 0.010);

  const camera = new THREE.PerspectiveCamera(45, wrapper.clientWidth / wrapper.clientHeight, 0.1, 300);
  camera.position.set(0, 28, 42);
  initControls(camera, renderer.domElement);

  // ─── LUCES ────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xf0ebe0, 0.8));
  const sunLight = new THREE.DirectionalLight(0xfff4d0, 2.0);
  sunLight.position.set(20, 50, 30);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left   = -55;
  sunLight.shadow.camera.right  =  55;
  sunLight.shadow.camera.top    =  55;
  sunLight.shadow.camera.bottom = -55;
  scene.add(sunLight);

  // ─── MATERIALES ───────────────────────────────────────────────────
  const mGround    = new THREE.MeshLambertMaterial({ color: 0xc4b28a });
  const mSea       = new THREE.MeshLambertMaterial({ color: 0x3e88aa, transparent: true, opacity: 0.82 });
  const mRoad      = new THREE.MeshLambertMaterial({ color: 0x888070 });
  const mPath      = new THREE.MeshLambertMaterial({ color: 0xd4c090 });
  const mRoadLine  = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mPlant     = new THREE.MeshLambertMaterial({ color: 0xddd7ca });
  const mRoof      = new THREE.MeshLambertMaterial({ color: 0x1b3d2d });
  const mRoofMain  = new THREE.MeshLambertMaterial({ color: 0x2a5c40 });
  const mTank      = new THREE.MeshLambertMaterial({ color: 0x4a7c6f });
  const mTankRing  = new THREE.MeshLambertMaterial({ color: 0x2e4f45 });
  const mTankCap   = new THREE.MeshLambertMaterial({ color: 0x3a6358 });
  const mPipe      = new THREE.MeshLambertMaterial({ color: 0xb8903a });
  // Agua animada: transparente azul, se anima su opacidad/posición en el loop
  const mWater     = new THREE.MeshLambertMaterial({ color: 0x4ab0e0, transparent: true, opacity: 0.75 });
  const mResort    = new THREE.MeshLambertMaterial({ color: 0xf0ead8 });
  const mMainHouse = new THREE.MeshLambertMaterial({ color: 0xfaf5ec });
  const mWin       = new THREE.MeshLambertMaterial({ color: 0x223344 });
  const mDoor      = new THREE.MeshLambertMaterial({ color: 0x5c3d1e });
  const mSill      = new THREE.MeshLambertMaterial({ color: 0xd4c9a8 });
  const mPalmTrunk = new THREE.MeshLambertMaterial({ color: 0x8b6914 });
  const mPalmLeaf  = new THREE.MeshLambertMaterial({ color: 0x2d6a1f, side: THREE.DoubleSide });
  const mCactus    = new THREE.MeshLambertMaterial({ color: 0x3a7a3a });
  const mRock      = new THREE.MeshLambertMaterial({ color: 0x9e9484 });
  const mHill      = new THREE.MeshLambertMaterial({ color: 0xb8a070 });
  const mHillDark  = new THREE.MeshLambertMaterial({ color: 0xa08860 });
  const mHuman     = new THREE.MeshLambertMaterial({ color: 0xf4a460 });
  const mGrass     = new THREE.MeshLambertMaterial({ color: 0x7a9a5a });
  const mCar       = new THREE.MeshLambertMaterial({ color: 0x8b2020 }); // auto rojo
  const mCarGlass  = new THREE.MeshLambertMaterial({ color: 0x334455, transparent: true, opacity: 0.7 });
  const mCarWheel  = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const mManhole   = new THREE.MeshLambertMaterial({ color: 0x666055 }); // tapa registro

  // ═══════════════════════════════════════════════════════════════════
  // LAYOUT (Z negativo = fondo, Z positivo = frente/mar)
  //  Z≈-32  Montaña + estanque
  //  Z≈-16  Casa Principal
  //  Z≈ -6  Calle vehicular
  //  Z≈  0  Camino peatonal
  //  Z≈  4  Fila casitas norte
  //  Z≈ 13  Fila casitas sur
  // ═══════════════════════════════════════════════════════════════════

  // ─── SUELO ────────────────────────────────────────────────────────
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), mGround);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ─── MAR ──────────────────────────────────────────────────────────
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(30, 110), mSea);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(32, 0.02, 0);
  scene.add(sea);

  // ─── PLANTA DESALINIZADORA ────────────────────────────────────────
  const plantGroup = new THREE.Group();
  plantGroup.position.set(18, 0, -5);
  const mainBldg = new THREE.Mesh(new THREE.BoxGeometry(11, 4, 7.5), mPlant);
  mainBldg.position.y = 2;
  mainBldg.castShadow = true; mainBldg.receiveShadow = true;
  plantGroup.add(mainBldg);
  [[-3, 2], [1, 2]].forEach(([ox, oz]) => {
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 3, 8), mPlant);
    ch.position.set(ox, 5.5, oz); ch.castShadow = true;
    plantGroup.add(ch);
  });
  scene.add(plantGroup);

  // ─── MONTAÑA CON MESETA ───────────────────────────────────────────
  const HILL_CX    =  0;
  const HILL_CZ    = -32;
  const HILL_TOP_Y =  5.2;

  function buildMeseta(cx, cz) {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(10, 15, 2.8, 18), mGround);
    base.position.y = 1.4; base.castShadow = true; base.receiveShadow = true;
    g.add(base);
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(7, 10, 2.0, 16), mHill);
    mid.position.y = 3.8; mid.castShadow = true;
    g.add(mid);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 7, 0.8, 16), mHillDark);
    top.position.y = 5.2; top.castShadow = true;
    g.add(top);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.12, 18), mHill);
    cap.position.y = HILL_TOP_Y + 0.06;
    g.add(cap);
    scene.add(g);
  }
  buildMeseta(HILL_CX, HILL_CZ);

  // ─── ESTANQUE ÚNICO ───────────────────────────────────────────────
  const TANK_R      = 3.0;
  const TANK_H      = 5.5;
  const TANK_BASE_Y = HILL_TOP_Y + 0.12;
  const TANK_CY     = TANK_BASE_Y + TANK_H / 2;

  function buildBigTank(wx, wz) {
    const g = new THREE.Group();
    g.position.set(wx, TANK_CY, wz);
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
    return g;
  }
  buildBigTank(HILL_CX, HILL_CZ);

  // ─── UTILIDADES TUBERÍAS ──────────────────────────────────────────
  function makePipe(from, to, r = 0.20, mat = mPipe) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.05) return null;
    const mid  = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    const geo  = new THREE.CylinderGeometry(r, r, len, 10);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function makeCodo(x, y, z, r = 0.26) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), mPipe);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  }

  // Tapa de registro (alcantarilla) en el suelo — marca tuberías subterráneas
  function makeManhole(x, z) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 14), mManhole);
    base.position.set(x, 0.03, z);
    // Cruz grabada en la tapa
    const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.02, 0.06), mRock);
    bar1.position.set(x, 0.07, z);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.48), mRock);
    bar2.position.set(x, 0.07, z);
    scene.add(base); scene.add(bar1); scene.add(bar2);
    return [base, bar1, bar2];
  }

  // ══════════════════════════════════════════════════════════════════
  // ─── TUBERÍAS SIEMPRE VISIBLES (ladera cerro → casa principal) ────
  // ══════════════════════════════════════════════════════════════════
  // Punto de salida en la base del tanque (lateral sur)
  const pTankOut   = new THREE.Vector3(HILL_CX + TANK_R * 0.5, TANK_BASE_Y, HILL_CZ);
  // Punto en mitad de la ladera
  const pSlopeMid  = new THREE.Vector3(HILL_CX + 2,  3.2, HILL_CZ + 9);
  // Pie de la colina
  const pHillFoot  = new THREE.Vector3(HILL_CX,      0.3, HILL_CZ + 14);
  // Entrada trasera de la Casa Principal (Z=-16, sd=8 → trasera Z=-20)
  const pMainIn    = new THREE.Vector3(0, 0.3, -20);

  // Estos tubos son SIEMPRE visibles (el flujo principal que vale la pena ver)
  makePipe(pTankOut,  pSlopeMid, 0.26);   // A1: ladera alta
  makePipe(pSlopeMid, pHillFoot, 0.26);   // A2: ladera baja
  makePipe(pHillFoot, pMainIn,   0.26);   // A3: horizontal al fondo casa
  makeCodo(pSlopeMid.x, pSlopeMid.y, pSlopeMid.z, 0.30);
  makeCodo(pHillFoot.x, pHillFoot.y, pHillFoot.z, 0.30);
  makeCodo(pMainIn.x,   pMainIn.y,   pMainIn.z,   0.30);

  // ── AGUA ANIMADA en el tubo de bajada ─────────────────────────────
  // Pequeñas esferas azules que "fluyen" a lo largo del tubo A1→A2
  const waterDrops = [];
  const waterPath = [pTankOut, pSlopeMid, pHillFoot, pMainIn];

  for (let i = 0; i < 6; i++) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), mWater);
    drop.castShadow = false;
    // Guardamos el offset de fase para cada gota (0..1)
    drop.userData.phase = i / 6;
    scene.add(drop);
    waterDrops.push(drop);
  }

  // Interpola a lo largo del camino waterPath según t ∈ [0,1]
  function getWaterPos(t) {
    const segments = waterPath.length - 1;
    const scaled   = t * segments;
    const seg      = Math.min(Math.floor(scaled), segments - 1);
    const frac     = scaled - seg;
    const from     = waterPath[seg];
    const to       = waterPath[seg + 1];
    return new THREE.Vector3().lerpVectors(from, to, frac);
  }

  // ══════════════════════════════════════════════════════════════════
  // ─── RED DE DISTRIBUCIÓN (oculta por defecto, botón la activa) ────
  // ══════════════════════════════════════════════════════════════════
  // Agrupamos TODOS los objetos de la red subterránea en un Group
  const pipeNetGroup = new THREE.Group();
  scene.add(pipeNetGroup);
  pipeNetGroup.visible = false; // ← OCULTO por defecto

  // Helper para crear tubo dentro del group
  function makePipeNet(from, to, r = 0.18) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.05) return null;
    const mid  = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    const geo  = new THREE.CylinderGeometry(r, r, len, 10);
    const mesh = new THREE.Mesh(geo, mPipe);
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    mesh.castShadow = true;
    pipeNetGroup.add(mesh);
    return mesh;
  }
  function makeCodoNet(x, y, z, r = 0.22) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), mPipe);
    m.position.set(x, y, z);
    pipeNetGroup.add(m);
  }

  const NY = 0.28; // altura tuberías red

  // B) Casa Principal → colector central
  const pMainOut = new THREE.Vector3(0, NY, -12);
  const pCollect = new THREE.Vector3(0, NY, -6);
  makePipeNet(pMainOut, pCollect, 0.22);
  makeCodoNet(0, NY, -12, 0.26);
  makeCodoNet(0, NY, -6,  0.26);

  // C) Colector transversal X: -14 a +14 en Z=-6
  makePipeNet(new THREE.Vector3(-14, NY, -6), new THREE.Vector3(14, NY, -6), 0.18);

  // D) Ramales a casitas (fila norte Z=4, fila sur Z=13)
  const cabinXs = [-10, -3, 5];
  cabinXs.forEach(cx => {
    // Fila norte
    makePipeNet(new THREE.Vector3(cx, NY, -6), new THREE.Vector3(cx, NY, 2), 0.13);
    makeCodoNet(cx, NY, -6, 0.17);
    // Fila sur: dobla en Z=6
    makePipeNet(new THREE.Vector3(cx, NY, -6), new THREE.Vector3(cx, NY,  6), 0.13);
    makePipeNet(new THREE.Vector3(cx, NY,  6), new THREE.Vector3(cx, NY, 11), 0.13);
    makeCodoNet(cx, NY, 6, 0.17);
  });

  // Tapas de registro (siempre visibles, sutiles — marcan el recorrido)
  const manholePositions = [
    [0, -9], [0, -6], [-7, -6], [7, -6],
    [-10, -6], [-10, 0], [-10, 6],
    [-3, -6],  [-3, 0],  [-3, 6],
    [5, -6],   [5, 0],   [5, 6],
  ];
  manholePositions.forEach(([x, z]) => makeManhole(x, z));

  // ══════════════════════════════════════════════════════════════════
  // ─── BOTÓN TOGGLE RED DE TUBERÍAS ─────────────────────────────────
  // ══════════════════════════════════════════════════════════════════
  const btnPipe = document.createElement('button');
  btnPipe.id = 'btn-toggle-pipes';
  btnPipe.innerHTML = '🔧 Mostrar Red de Tuberías';
  btnPipe.style.cssText = `
    position: absolute;
    bottom: 80px;
    right: 20px;
    padding: 10px 18px;
    background: #1b3d2d;
    color: #f0ead8;
    border: 2px solid #b8903a;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.03em;
    transition: background 0.2s;
    z-index: 100;
  `;
  btnPipe.addEventListener('mouseenter', () => btnPipe.style.background = '#2a5c40');
  btnPipe.addEventListener('mouseleave', () => {
    btnPipe.style.background = pipeNetGroup.visible ? '#b8903a' : '#1b3d2d';
  });
  btnPipe.addEventListener('click', () => {
    pipeNetGroup.visible = !pipeNetGroup.visible;
    btnPipe.innerHTML = pipeNetGroup.visible
      ? '🔧 Ocultar Red de Tuberías'
      : '🔧 Mostrar Red de Tuberías';
    btnPipe.style.background = pipeNetGroup.visible ? '#b8903a' : '#1b3d2d';
  });
  // Insertarlo dentro del wrapper del canvas
  wrapper.style.position = 'relative';
  wrapper.appendChild(btnPipe);

  // ─── CARRETERAS Y CAMINOS ─────────────────────────────────────────
  // Calle vehicular principal (Z=-6)
  const roadMain = new THREE.Mesh(new THREE.PlaneGeometry(70, 5.5), mRoad);
  roadMain.rotation.x = -Math.PI / 2;
  roadMain.position.set(0, 0.06, -6);
  roadMain.receiveShadow = true;
  scene.add(roadMain);

  // Calle lateral izquierda (X=-14)
  const roadSide = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 45), mRoad);
  roadSide.rotation.x = -Math.PI / 2;
  roadSide.position.set(-14, 0.06, 2);
  roadSide.receiveShadow = true;
  scene.add(roadSide);

  // Camino peatonal entre filas de casitas (Z=8.5)
  const pathCentral = new THREE.Mesh(new THREE.PlaneGeometry(45, 2.4), mPath);
  pathCentral.rotation.x = -Math.PI / 2;
  pathCentral.position.set(-2, 0.07, 8.5);
  pathCentral.receiveShadow = true;
  scene.add(pathCentral);

  // Acceso peatonal a la casa principal
  const pathAccess = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 6), mPath);
  pathAccess.rotation.x = -Math.PI / 2;
  pathAccess.position.set(0, 0.07, -9);
  pathAccess.receiveShadow = true;
  scene.add(pathAccess);

  // Líneas blancas discontinuas — calle principal
  for (let x = -32; x <= 32; x += 5) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.2), mRoadLine);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, 0.08, -6);
    scene.add(dash);
  }
  // Líneas calle lateral
  for (let z = -18; z <= 22; z += 5) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 2.5), mRoadLine);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(-14, 0.08, z);
    scene.add(dash);
  }
  // Bordillos calle principal
  [-3.0, 3.0].forEach(dz => {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(70, 0.14, 0.35), mPath);
    curb.position.set(0, 0.07, -6 + dz);
    scene.add(curb);
  });

  // ─── CASA PRINCIPAL ───────────────────────────────────────────────
  function buildMainHouse(px, pz) {
    const g = new THREE.Group();
    g.position.set(px, 0, pz);
    const sw = 10, sh = 5, sd = 8;

    const body = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), mMainHouse);
    body.position.y = sh / 2;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    const eave = new THREE.Mesh(new THREE.BoxGeometry(sw + 1.4, 0.2, sd + 1.4), mRoofMain);
    eave.position.y = sh + 0.1; g.add(eave);

    const roofFlat = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.6, 0.4, sd + 0.6), mRoofMain);
    roofFlat.position.y = sh + 0.3; roofFlat.castShadow = true; g.add(roofFlat);

    const crest = new THREE.Mesh(new THREE.BoxGeometry(sw * 0.5, 0.65, 0.5), mRoofMain);
    crest.position.y = sh + 0.65; g.add(crest);

    // Puertas dobles frente
    [-1.1, 1.1].forEach(dx => {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, sh * 0.55, 0.1), mDoor);
      door.position.set(dx, sh * 0.275, sd / 2 + 0.05); g.add(door);
    });
    // Ventanas frente
    [-3.5, -1.2, 1.2, 3.5].forEach(wx => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.1), mWin);
      win.position.set(wx, sh * 0.65, sd / 2 + 0.05); g.add(win);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.22), mSill);
      sill.position.set(wx, sh * 0.65 - 0.75, sd / 2 + 0.13); g.add(sill);
    });
    // Ventana trasera (donde llega la tubería)
    const winBack = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 0.1), mWin);
    winBack.position.set(0, sh * 0.6, -(sd / 2 + 0.05)); g.add(winBack);

    // Terraza delantera
    const terrace = new THREE.Mesh(new THREE.BoxGeometry(sw + 1, 0.15, 2.8), mSill);
    terrace.position.set(0, 0.075, sd / 2 + 1.4); g.add(terrace);
    [-4, -1.3, 1.3, 4].forEach(px2 => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, sh * 0.5, 6), mSill);
      post.position.set(px2, sh * 0.25, sd / 2 + 2.7); g.add(post);
    });

    scene.add(g);
    return g;
  }
  buildMainHouse(0, -16);

  // ─── CASITAS HUÉSPEDES ────────────────────────────────────────────
  function buildHouse(px, pz, sw, sh, sd) {
    const g = new THREE.Group();
    g.position.set(px, 0, pz);

    const body = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), mResort);
    body.position.y = sh / 2;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);

    const roofBase = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.7, 0.22, sd + 0.7), mRoof);
    roofBase.position.y = sh + 0.11; g.add(roofBase);

    const roofTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0, (sw + 0.7) * 0.72, sh * 0.45, 4), mRoof
    );
    roofTop.position.y = sh + 0.22 + (sh * 0.45) / 2;
    roofTop.rotation.y = Math.PI / 4; roofTop.castShadow = true;
    g.add(roofTop);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.75, sh * 0.55, 0.08), mDoor);
    door.position.set(0, sh * 0.55 / 2, sd / 2 + 0.04); g.add(door);

    [-sw * 0.28, sw * 0.28].forEach(wx => {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.85, 0.08), mWin);
      win.position.set(wx, sh * 0.62, sd / 2 + 0.04); g.add(win);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.18), mSill);
      sill.position.set(wx, sh * 0.62 - 0.47, sd / 2 + 0.09); g.add(sill);
    });
    const winBack = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.85, 0.08), mWin);
    winBack.position.set(0, sh * 0.62, -(sd / 2 + 0.04)); g.add(winBack);

    scene.add(g);
    return g;
  }

  // Fila norte (Z=4)
  buildHouse(-10, 4, 4.5, 3.2, 4);
  buildHouse( -3, 4, 4.5, 3.2, 4);
  buildHouse(  5, 4, 4.5, 3.2, 4);
  // Fila sur (Z=13)
  buildHouse(-10, 13, 4.5, 3.2, 4);
  buildHouse( -3, 13, 4.5, 3.2, 4);
  buildHouse(  5, 13, 4.5, 3.2, 4);

  // Césped entre casitas y camino
  [[-10, 4], [-3, 4], [5, 4], [-10, 13], [-3, 13], [5, 13]].forEach(([gx, gz]) => {
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.5), mGrass);
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(gx, 0.05, gz - 3.5);
    scene.add(grass);
  });

  // ─── AUTO ─────────────────────────────────────────────────────────
  function buildCar(px, pz, rotY = 0) {
    const g = new THREE.Group();
    g.position.set(px, 0, pz);
    g.rotation.y = rotY;

    // Carrocería baja
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.7, 1.8), mCar);
    chassis.position.y = 0.55; chassis.castShadow = true; g.add(chassis);

    // Cabina
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 1.6), mCar);
    cabin.position.set(-0.2, 1.28, 0); cabin.castShadow = true; g.add(cabin);

    // Vidrios (parabrisas delantero y trasero)
    const windF = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, 1.4), mCarGlass);
    windF.position.set(0.88, 1.28, 0); g.add(windF);
    const windR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.65, 1.4), mCarGlass);
    windR.position.set(-1.22, 1.28, 0); g.add(windR);

    // Ventanas laterales
    [-0.82, 0.82].forEach(dz => {
      const winS = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 0.06), mCarGlass);
      winS.position.set(-0.2, 1.3, dz); g.add(winS);
    });

    // Ruedas
    [[-1.2, -0.9], [-1.2, 0.9], [1.0, -0.9], [1.0, 0.9]].forEach(([wx, wz]) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12), mCarWheel);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.36, wz);
      g.add(wheel);
      // Aro plateado
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.30, 8), mSill);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(wx, 0.36, wz);
      g.add(rim);
    });

    // Faros delanteros
    [-0.5, 0.5].forEach(dz => {
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.35), mRoadLine);
      light.position.set(1.9, 0.7, dz); g.add(light);
    });

    scene.add(g);
    return g;
  }

  // Auto estacionado en la calle
  buildCar(-7, -6, 0);           // estacionado frente a casitas
  buildCar( 3, -6, Math.PI);     // otro auto en sentido contrario

  // ─── PEATONES ─────────────────────────────────────────────────────
  function buildHuman(px, py, pz, rotY = 0) {
    const g = new THREE.Group();
    g.position.set(px, py, pz);
    g.rotation.y = rotY;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.9, 8), mHuman);
    body.position.y = 0.45; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), mHuman);
    head.position.y = 1.05; g.add(head);
    [-0.1, 0.1].forEach(dx => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 6), mHuman);
      leg.position.set(dx, -0.3, 0); g.add(leg);
    });
    scene.add(g);
    return g;
  }

  buildHuman(-6,  0, 8.5, 0.3);
  buildHuman(-1,  0, 8.5, Math.PI);
  buildHuman( 4,  0, 8.5, 0.5);
  buildHuman( 9,  0, 8.5, -0.4);
  buildHuman( 1.5, 0, -9.5, Math.PI * 0.9);
  buildHuman(-1.2, 0, -10,  0.1);
  // Personas cerca del auto
  buildHuman(-5, 0, -4, -0.5);
  buildHuman( 6, 0, -4,  0.8);

  // ─── PALMERAS ─────────────────────────────────────────────────────
  function buildPalm(px, pz, height = 6) {
    const g = new THREE.Group();
    g.position.set(px, 0, pz);
    const segments = 5;
    for (let i = 0; i < segments; i++) {
      const t    = i / segments;
      const segH = height / segments;
      const botR = 0.22 - t * 0.10;
      const topR = 0.22 - (t + 1 / segments) * 0.10;
      const seg  = new THREE.Mesh(new THREE.CylinderGeometry(topR, botR, segH, 7), mPalmTrunk);
      seg.position.set(Math.sin(t * 0.5) * 0.4, i * segH + segH / 2, Math.cos(t * 0.3) * 0.2);
      seg.rotation.z = t * 0.08; seg.castShadow = true;
      g.add(seg);
    }
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.8), mPalmLeaf);
      frond.position.set(
        Math.sin(angle) * 0.6 + Math.sin(0.5) * 0.4,
        height - 0.4,
        Math.cos(angle) * 0.6 + Math.cos(0.3) * 0.2
      );
      frond.rotation.y = angle;
      frond.rotation.z = -Math.PI / 4 - Math.random() * 0.3;
      frond.castShadow = true;
      g.add(frond);
    }
    scene.add(g);
  }

  // Distribución mejorada de palmeras
  buildPalm(-16,  4,   5.5);
  buildPalm(-16, 13,   6.2);
  buildPalm( -7,  9,   6.0);
  buildPalm(  2,  9,   5.5);
  buildPalm(  9, 13,   6.5);
  buildPalm(-13, 14,   5.8);
  buildPalm( 12,  4,   6.0);
  buildPalm( 12, 13,   5.5);
  buildPalm( 15, 20,   6.5);
  buildPalm( -2, 20,   5.8);
  buildPalm(-18, -5,   5.0);
  buildPalm(  9, -5,   5.5);
  buildPalm( 22,  5,   7.0);
  buildPalm( 26, -3,   6.5);
  buildPalm( 26, 14,   6.0);
  buildPalm(-20, 22,   5.5);

  // ─── CACTUS ───────────────────────────────────────────────────────
  function buildCactus(px, pz, h = 3) {
    const g = new THREE.Group();
    g.position.set(px, 0, pz);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, h, 8), mCactus);
    body.position.y = h / 2; body.castShadow = true; g.add(body);
    [[-1], [1]].forEach(([side]) => {
      const armV = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, h * 0.45, 7), mCactus);
      armV.position.set(side * 0.4, h * 0.5 + (h * 0.45) / 2, 0); g.add(armV);
      const armH = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.55, 7), mCactus);
      armH.rotation.z = Math.PI / 2; armH.position.set(side * 0.18, h * 0.5, 0); g.add(armH);
    });
    scene.add(g);
  }

  buildCactus(-18, -22, 3.2);
  buildCactus( 14, -26, 2.8);
  buildCactus(-10, -28, 3.0);
  buildCactus(  8, -20, 2.5);
  buildCactus(-22,  10, 2.8);
  buildCactus( 18,  20, 3.0);
  buildCactus(-25,  -5, 3.4);

  // ─── ROCAS ────────────────────────────────────────────────────────
  function addRocks(cx, cz, count = 5, spread = 10) {
    for (let i = 0; i < count; i++) {
      const sx = 0.3 + Math.random() * 0.8;
      const sy = 0.2 + Math.random() * 0.5;
      const sz = 0.3 + Math.random() * 0.7;
      const rock = new THREE.Mesh(new THREE.SphereGeometry(1, 5, 4), mRock);
      rock.scale.set(sx, sy, sz);
      rock.position.set(
        cx + (Math.random() - 0.5) * spread,
        sy * 0.5,
        cz + (Math.random() - 0.5) * spread
      );
      rock.rotation.y = Math.random() * Math.PI;
      rock.castShadow = true; rock.receiveShadow = true;
      scene.add(rock);
    }
  }
  addRocks(HILL_CX, HILL_CZ, 12, 22);
  addRocks(-20, 18, 5, 8);
  addRocks(20, -10, 4, 8);

  // ─── LOOP ─────────────────────────────────────────────────────────
  initLeaks(scene);

  function resize() {
    renderer.setSize(wrapper.clientWidth, wrapper.clientHeight, false);
    camera.aspect = wrapper.clientWidth / wrapper.clientHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let clock = 0;

  function animate() {
    requestAnimationFrame(animate);
    clock += 0.008; // velocidad del flujo

    // Animar gotas de agua fluyendo por el tubo ladera→casa principal
    waterDrops.forEach(drop => {
      const t = (drop.userData.phase + clock) % 1.0;
      const pos = getWaterPos(t);
      drop.position.copy(pos);
      // Pulsar suavemente la opacidad
      mWater.opacity = 0.55 + Math.sin(clock * 4 + drop.userData.phase * 6) * 0.25;
    });

    updateControls();
    updateLeaks();
    renderer.render(scene, camera);
  }
  animate();
}
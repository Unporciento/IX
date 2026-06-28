import * as THREE from 'three';
import { initControls, updateControls } from './controls.js';
import { initLeaks, updateLeaks } from './leaks.js';
import * as L from './layout.js';

// ─── Estado del módulo ────────────────────────────────────────────────────────
let scene, camera, renderer, clock;
let sun, moon, hemiLight, sunLight, fillLight, rimLight;
let sandMat, dunesMat, earthMat;
let cloudGroup = [];
let birds = [];
let isNight = false;
let isXray  = false;
let isClean = false;
let pipesVisible = false;
let pipeGroup, pipeGlowGroup;
let threeInitDone = false;

// Red hídrica / flujo de agua
let flowParticles = [];
let mainValveClosed = false;
let activeLeakPos = null;

// Fuga: excavación + tubería rota + chorro de agua
let pitGroup, brokenPipeGroup, sprayGroup;
let sprayParticles = [];

// Cuadrilla de reparación
let repairBaseGroup;
let repairTechs = [];
let repairTruck = null;

// Mar / animación
let oceanMat;
let boats = [];
let fishList = [];

// ─── Texturas procedurales ────────────────────────────────────────────────────
function _hash2(x, y) {
  let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function _smoothNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return _hash2(ix, iy)*(1-ux)*(1-uy) + _hash2(ix+1,iy)*ux*(1-uy) +
         _hash2(ix,iy+1)*(1-ux)*uy   + _hash2(ix+1,iy+1)*ux*uy;
}
function _fbm(x, y, octaves = 4) {
  let val=0, amp=1, freq=1, max=0;
  for (let o=0; o<octaves; o++) {
    val += _smoothNoise(x*freq, y*freq)*amp;
    max += amp; amp *= 0.5; freq *= 2;
  }
  return val/max;
}

function _makeSandTexture() {
  const size=512, data=new Uint8Array(size*size*4);
  for (let i=0; i<size; i++) for (let j=0; j<size; j++) {
    const v = _fbm(i/size*12, j/size*12, 5);
    const sandy = 0.78 + v*0.22;
    const idx=(i*size+j)*4;
    data[idx]=Math.floor(233*sandy); data[idx+1]=Math.floor(210*sandy);
    data[idx+2]=Math.floor(168*sandy); data[idx+3]=255;
  }
  const tex=new THREE.DataTexture(data,size,size);
  tex.needsUpdate=true; tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.repeat.set(8,8); return tex;
}
function _makeEarthTexture({ size=512, repeat=10, baseR=213,baseG=188,baseB=140,
  patchR=118,patchG=124,patchB=76, patchAmount=0.6 }={}) {
  const data=new Uint8Array(size*size*4);
  for (let i=0; i<size; i++) for (let j=0; j<size; j++) {
    const v=_fbm(i/size*14+5, j/size*14+5,5);
    const patch=_fbm(i/size*5+41, j/size*5+17,3);
    const sandy=0.72+v*0.28;
    let r=baseR*sandy, g=baseG*sandy, b=baseB*sandy;
    if (patch > patchAmount) {
      const mix=Math.min(1,(patch-patchAmount)/0.28)*0.5;
      r=r*(1-mix)+patchR*mix; g=g*(1-mix)+patchG*mix; b=b*(1-mix)+patchB*mix;
    }
    const idx=(i*size+j)*4;
    data[idx]=Math.floor(r); data[idx+1]=Math.floor(g);
    data[idx+2]=Math.floor(b); data[idx+3]=255;
  }
  const tex=new THREE.DataTexture(data,size,size);
  tex.needsUpdate=true; tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.repeat.set(repeat,repeat); return tex;
}
function _makeRoughTexture() {
  const size=128, data=new Uint8Array(size*size*4);
  for (let i=0; i<size; i++) for (let j=0; j<size; j++) {
    const v=Math.floor(_hash2(i*0.5,j*0.5)*80+170);
    const idx=(i*size+j)*4;
    data[idx]=data[idx+1]=data[idx+2]=v; data[idx+3]=255;
  }
  const tex=new THREE.DataTexture(data,size,size);
  tex.needsUpdate=true; tex.wrapS=tex.wrapT=THREE.RepeatWrapping; return tex;
}

// ─── Punto de entrada ─────────────────────────────────────────────────────────
export function initThree() {
  if (threeInitDone) return;
  threeInitDone = true;

  const canvas = document.getElementById('maqueta-canvas');
  scene  = new THREE.Scene();
  clock  = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(42, canvas.clientWidth/canvas.clientHeight, 0.1, 900);
  camera.position.set(35, 38, 38);

  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, logarithmicDepthBuffer:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  _resize();

  _buildSky();
  _buildLights();
  _buildOcean();
  _buildTerrain();
  _buildRoads();
  _buildBeachDetails();
  _buildMountainAndTank();
  _buildPipeNetwork();
  _buildCasaPrincipal();
  _buildSalaDeMaquinas();
  _buildPlantaDesalinizadora();
  _buildCasitas();
  _buildParkingYBanos();
  _buildRepairBase();
  _buildPier();
  _buildLighthouse();
  _buildLifeguardTower();
  _buildVolleyballCourt();
  _buildKiosk();
  _buildFlagpole();
  _buildCabinFences();
  _buildBoats();
  _buildFish();
  _buildDuchas();
  _buildPalmTrees();
  _buildVegetation();
  _buildCacti();
  _buildVehicles();
  _buildClouds();
  _buildBirds();
  _buildOceanFoam();
  _buildWaves();
  _buildRocks();
  _buildLampPosts();
  _buildLeakEffectsRig();
  _buildRepairTechs();

  initControls(camera, renderer.domElement, renderer);
  initLeaks(scene);

  window.addEventListener('resize', _resize);
  _wireUI();

  renderer.setAnimationLoop(_tick);
}

// ─── Loop ──────────────────────────────────────────────────────────────────────
function _tick() {
  const t  = clock.getElapsedTime();
  const dt = Math.min(0.05, clock.getDelta());

  if (oceanMat) oceanMat.uniforms.uTime.value = t;

  // Nubes
  cloudGroup.forEach((c, i) => {
    c.position.x += 0.005 * (0.7 + i * 0.06);
    if (c.position.x > 220) c.position.x = -220;
    c.position.y = 30 + Math.sin(t*0.12 + i)*0.5;
  });

  // Pájaros
  birds.forEach((b, i) => {
    b.t = (b.t + dt * b.speed) % (Math.PI * 2);
    b.group.position.x = b.cx + Math.cos(b.t) * b.rx;
    b.group.position.z = b.cz + Math.sin(b.t) * b.rz;
    b.group.position.y = b.hy + Math.sin(t * 1.5 + i * 0.7) * 0.8;
    b.group.rotation.y = -b.t - Math.PI / 2;
    // Aleteo
    b.group.children.forEach((wing, wi) => {
      if (wing.userData.isWing) {
        wing.rotation.z = Math.sin(t * 8 + i) * 0.35 * (wi === 0 ? 1 : -1);
      }
    });
  });

  // Glow de tuberías
  if (pipeGlowGroup) {
    pipeGlowGroup.children.forEach((m, i) => {
      if (mainValveClosed) {
        m.material.opacity = 0.4 + Math.sin(t*9+i*0.5)*0.25;
        m.material.color.setHex(0xff3322);
      } else if (isXray && pipesVisible) {
        m.material.opacity = 0.45 + Math.sin(t*2.5+i*0.7)*0.2;
        m.material.color.setHex(0x2fffb8);
      } else {
        m.material.opacity = 0;
      }
    });
  }

  _updateFlowParticles(t, dt);
  _updateSpray(dt);
  _updateRepairTechs(t, dt);
  _updateBoatsAndFish(t);

  scene.traverse(obj => {
    if (obj.userData.isWave) {
      obj.position.z = obj.userData.waveZ + Math.sin(t*0.8+obj.userData.wavePhase)*0.3;
      obj.material.opacity = 0.35 + Math.sin(t*1.2+obj.userData.wavePhase)*0.15;
    }
    if (obj.userData.isFoam) {
      obj.material.opacity = 0.55 + Math.sin(t*1.8+obj.userData.foamPhase)*0.25;
    }
    if (obj.userData.isLamp && isNight) {
      obj.material.emissiveIntensity = 1.5 + Math.sin(t*30+obj.userData.lampIdx)*0.05;
    }
    if (obj.userData.isBeacon) {
      const cycle = (t*2.4+obj.userData.beaconPhase) % 1;
      const flash = (cycle < 0.12 || (cycle>0.22 && cycle<0.30)) ? 1 : 0.08;
      obj.material.emissiveIntensity = flash * 2.6;
      if (obj.userData.light) obj.userData.light.intensity = flash * 4.5;
    }
    if (obj.userData.isLighthouseBeam) {
      obj.rotation.y = t * 1.2;
      obj.material.opacity = 0.18 + Math.sin(t*3)*0.05;
    }
    if (obj.userData.isFlag) {
      const pts = obj.geometry.attributes.position;
      for (let i=0; i<pts.count; i++) {
        const px = pts.getX(i);
        pts.setZ(i, Math.sin(t*2.2 + px*1.2)*0.15*(px/1.5));
      }
      pts.needsUpdate = true;
    }
    if (obj.userData.isLifeguardFlag) {
      obj.rotation.z = Math.sin(t*1.8)*0.12;
    }
  });

  updateControls();
  updateLeaks();
  renderer.render(scene, camera);
}

function _resize() {
  const canvas = renderer.domElement;
  const parent = canvas.parentElement;
  const w=parent.clientWidth, h=parent.clientHeight;
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
}

// ─── Cielo con gradiente atmosférico ─────────────────────────────────────────
function _buildSky() {
  const skyGeo = new THREE.SphereGeometry(420,32,16);
  const skyMat = new THREE.ShaderMaterial({
    uniforms:{
      uTopColor:    {value:new THREE.Color(0x3a7bc8)},
      uHorizonColor:{value:new THREE.Color(0x8ecce8)},
    },
    vertexShader:`
      varying vec3 vWorldPos;
      void main(){vWorldPos=(modelMatrix*vec4(position,1.0)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      uniform vec3 uTopColor,uHorizonColor;
      varying vec3 vWorldPos;
      void main(){
        float h=normalize(vWorldPos).y;
        vec3 col=mix(uHorizonColor,uTopColor,smoothstep(0.0,0.55,h));
        gl_FragColor=vec4(col,1.0);}`,
    side:THREE.BackSide, depthWrite:false,
  });
  const sky=new THREE.Mesh(skyGeo,skyMat);
  sky.userData.isSky=true; scene.add(sky);

  // Franja de horizonte cálida (bruma costera)
  const hazeGeo=new THREE.PlaneGeometry(900,30);
  const hazeMat=new THREE.MeshBasicMaterial({color:0xd4e8f0,transparent:true,opacity:0.18,side:THREE.DoubleSide,depthWrite:false});
  const haze=new THREE.Mesh(hazeGeo,hazeMat);
  haze.rotation.x=-Math.PI/2; haze.position.set(0,0.3,0); scene.add(haze);

  scene.fog = new THREE.FogExp2(0xb9e6f2, 0.003);

  // Sol con corona más suave
  sun = new THREE.Group();
  sun.add(new THREE.Mesh(new THREE.SphereGeometry(2.5,32,32), new THREE.MeshBasicMaterial({color:0xfffde8})));
  const haloColors=[0xffd080,0xffc060,0xffaa40];
  haloColors.forEach((c,i)=>{
    const h=new THREE.Mesh(new THREE.SphereGeometry(3.5+i*2.2,24,24),
      new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:0.12-i*0.03,side:THREE.DoubleSide}));
    sun.add(h);
  });
  sun.position.set(60,55,40); scene.add(sun);

  // Luna
  moon=new THREE.Group();
  moon.add(new THREE.Mesh(new THREE.SphereGeometry(2.0,32,32),
    new THREE.MeshStandardMaterial({color:0xd8e4f2,emissive:0x8899bb,emissiveIntensity:0.3,roughness:0.8})));
  moon.position.set(-60,50,-40); moon.visible=false; scene.add(moon);

  // Estrellas
  const starGeo=new THREE.BufferGeometry();
  const starCount=1200, starPos=new Float32Array(starCount*3);
  for (let i=0; i<starCount; i++) {
    const phi=Math.acos(-1+(2*i)/starCount);
    const theta=Math.sqrt(starCount*Math.PI)*phi;
    starPos[i*3]=320*Math.sin(phi)*Math.cos(theta);
    starPos[i*3+1]=Math.abs(320*Math.cos(phi))+10;
    starPos[i*3+2]=320*Math.sin(phi)*Math.sin(theta);
  }
  starGeo.setAttribute('position',new THREE.BufferAttribute(starPos,3));
  const stars=new THREE.Points(starGeo,new THREE.PointsMaterial({
    color:0xffffff,size:0.8,transparent:true,opacity:0,sizeAttenuation:false}));
  stars.userData.isStars=true; scene.add(stars);
}

function _buildClouds() {
  const cfgs=[
    {x:-120,y:33,z:-65,s:1.9},{x:65,y:31,z:-95,s:2.3},
    {x:95,y:35,z:55,s:1.6},{x:-155,y:32,z:22,s:2.1},
    {x:32,y:36,z:88,s:1.7},{x:-185,y:30,z:-42,s:2.0},
    {x:115,y:34,z:-22,s:1.5},{x:-95,y:37,z:72,s:2.2},
    {x:145,y:32,z:40,s:1.3},{x:-60,y:38,z:-80,s:1.8},
  ];
  cfgs.forEach(cfg=>{
    const group=new THREE.Group();
    const puffCount=5+Math.floor(Math.random()*5);
    const baseMat=new THREE.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:0.88,roughness:1.0});
    for (let j=0; j<puffCount; j++) {
      const s=(1.2+Math.random()*2.4)*cfg.s;
      const puff=new THREE.Mesh(new THREE.SphereGeometry(s,12,10),baseMat.clone());
      puff.position.set((j-puffCount/2)*2.9+(Math.random()-0.5)*2,(Math.random()-0.3)*2,(Math.random()-0.5)*2.5);
      puff.material.opacity=0.72+Math.random()*0.22;
      group.add(puff);
    }
    group.position.set(cfg.x,cfg.y,cfg.z); scene.add(group); cloudGroup.push(group);
  });
}

// ─── Pájaros sobre el océano ──────────────────────────────────────────────────
function _buildBirds() {
  const birdMat=new THREE.MeshStandardMaterial({color:0x222233,roughness:0.8});
  for (let i=0; i<8; i++) {
    const group=new THREE.Group();
    // Cuerpo pequeño
    const body=new THREE.Mesh(new THREE.SphereGeometry(0.12,8,6),birdMat);
    body.scale.set(1.5,0.6,1); group.add(body);
    // Alas
    [-1,1].forEach(side=>{
      const wingGeo=new THREE.PlaneGeometry(0.7,0.2);
      const wing=new THREE.Mesh(wingGeo,new THREE.MeshStandardMaterial({color:0x333344,side:THREE.DoubleSide,roughness:0.9}));
      wing.position.set(side*0.35,0,0); wing.rotation.z=side*0.3;
      wing.userData.isWing=true; group.add(wing);
    });
    scene.add(group);
    birds.push({
      group, t:Math.random()*Math.PI*2,
      cx:L.OCEAN_X+30+Math.random()*50, cz:(Math.random()-0.5)*100,
      rx:10+Math.random()*20, rz:6+Math.random()*12,
      hy:12+Math.random()*10, speed:0.15+Math.random()*0.15,
    });
  }
}

// ─── Iluminación cinematográfica PBR ─────────────────────────────────────────
function _buildLights() {
  hemiLight=new THREE.HemisphereLight(0x9ecfea,0xc8b870,1.05); scene.add(hemiLight);
  sunLight=new THREE.DirectionalLight(0xfff0d0,2.3);
  sunLight.position.set(60,55,40); sunLight.castShadow=true;
  sunLight.shadow.mapSize.set(4096,4096);
  sunLight.shadow.camera.left=-90; sunLight.shadow.camera.right=90;
  sunLight.shadow.camera.top=90;  sunLight.shadow.camera.bottom=-90;
  sunLight.shadow.camera.far=280; sunLight.shadow.bias=-0.0003;
  sunLight.shadow.normalBias=0.02; scene.add(sunLight);
  fillLight=new THREE.DirectionalLight(0x88c8e8,0.38);
  fillLight.position.set(-40,10,20); scene.add(fillLight);
  rimLight=new THREE.DirectionalLight(0xffc8a0,0.22);
  rimLight.position.set(-30,20,-60); scene.add(rimLight);
  scene.add(new THREE.HemisphereLight(0x000000,0x223344,0.25));
}

// ─── Océano ───────────────────────────────────────────────────────────────────
function _buildOcean() {
  const widthX=(L.BEACH_START_X+6)-(L.OCEAN_X-140);
  const centerX=((L.BEACH_START_X+6)+(L.OCEAN_X-140))/2;
  const lengthZ=(L.WORLD_Z_MAX-L.WORLD_Z_MIN)+220;
  const geo=new THREE.PlaneGeometry(widthX,lengthZ,160,110);
  oceanMat=new THREE.ShaderMaterial({
    uniforms:{
      uTime:{value:0},
      uDeepColor:{value:new THREE.Color(0x053448)},
      uMidColor:{value:new THREE.Color(0x0a6080)},
      uShallowColor:{value:new THREE.Color(0x2abccc)},
      uFoamColor:{value:new THREE.Color(0xeaf7ff)},
      uSkyColor:{value:new THREE.Color(0xb9e6f2)},
      uSunDir:{value:new THREE.Vector3(0.5,0.75,0.4).normalize()},
      uShoreX:{value:L.BEACH_START_X},
    },
    vertexShader:`
      uniform float uTime;
      varying float vH; varying vec3 vNormal,vWorldPos;
      float wave(vec2 p,float freq,float speed,float amp,float steep){
        float s=sin(p.x*freq+uTime*speed)*cos(p.y*freq*0.65+uTime*speed*0.85);
        return sign(s)*pow(abs(s),steep)*amp;}
      float heightAt(vec2 p){
        return wave(p,0.075,0.85,0.30,1.0)+wave(p*1.4+11.0,0.11,1.05,0.16,1.0)
              +wave(p*0.55-7.0,0.045,0.55,0.22,1.2)+wave(p*2.3+3.0,0.21,1.7,0.07,0.8)
              +wave(p*3.6-5.0,0.34,2.3,0.035,0.7);}
      void main(){
        vec3 p=position; float h=heightAt(p.xy); p.z+=h; vH=h;
        vWorldPos=(modelMatrix*vec4(p,1.0)).xyz;
        float eps=0.6;
        float hL=heightAt(p.xy-vec2(eps,0.0)),hR=heightAt(p.xy+vec2(eps,0.0));
        float hD=heightAt(p.xy-vec2(0.0,eps)),hU=heightAt(p.xy+vec2(0.0,eps));
        vNormal=normalize(vec3(hL-hR,2.4,hD-hU));
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
    fragmentShader:`
      uniform vec3 uDeepColor,uMidColor,uShallowColor,uFoamColor,uSkyColor,uSunDir;
      uniform float uTime,uShoreX;
      varying float vH; varying vec3 vNormal,vWorldPos;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
      void main(){
        float distToShore=clamp((uShoreX-vWorldPos.x)/26.0,0.0,1.0);
        float depthMix=smoothstep(0.0,1.0,distToShore);
        vec3 waterColor=mix(uShallowColor,uMidColor,depthMix);
        waterColor=mix(waterColor,uDeepColor,smoothstep(0.35,1.0,depthMix));
        vec3 viewDir=normalize(cameraPosition-vWorldPos);
        float fresnel=0.03+0.97*pow(1.0-max(0.0,dot(vNormal,viewDir)),5.0);
        vec3 halfVec=normalize(uSunDir+viewDir);
        float spec=pow(max(0.0,dot(vNormal,halfVec)),200.0)*2.4;
        float specWide=pow(max(0.0,dot(vNormal,halfVec)),24.0)*0.28;
        float foamNoise=noise(vWorldPos.xz*0.35+uTime*0.25);
        float crestFoam=smoothstep(0.16,0.32,vH+foamNoise*0.12);
        float shoreFoam=smoothstep(20.0,2.0,uShoreX-vWorldPos.x)*(0.4+0.3*noise(vWorldPos.xz*0.5+uTime*0.4));
        float foam=clamp(crestFoam+shoreFoam,0.0,1.0);
        float caustic=noise(vWorldPos.xz*2.4+uTime*0.7)*noise(vWorldPos.xz*3.0-uTime*0.5);
        caustic=smoothstep(0.45,0.85,caustic)*0.22*(1.0-depthMix*0.7);
        vec3 col=mix(waterColor,uFoamColor,foam);
        col+=vec3(spec+specWide)*(1.0-foam*0.6);
        col=mix(col,uSkyColor,fresnel*0.45);
        col+=caustic*uShallowColor;
        gl_FragColor=vec4(col,1.0);}`,
  });
  const ocean=new THREE.Mesh(geo,oceanMat);
  ocean.rotation.x=-Math.PI/2; ocean.rotation.z=Math.PI/2;
  ocean.position.set(centerX,-0.15,0); scene.add(ocean);
}

function _buildOceanFoam() {
  for (let i=0; i<5; i++) {
    const foam=new THREE.Mesh(
      new THREE.PlaneGeometry(3+Math.random()*2,(L.WORLD_Z_MAX-L.WORLD_Z_MIN)+60,1,60),
      new THREE.MeshBasicMaterial({color:0xdff5ff,transparent:true,opacity:0.45,depthWrite:false,side:THREE.DoubleSide}));
    foam.rotation.x=-Math.PI/2; foam.rotation.z=Math.PI/2;
    foam.position.set(L.BEACH_START_X+2+i*1.8+Math.random(),0.05,0);
    foam.userData.isFoam=true; foam.userData.foamPhase=i*1.2; scene.add(foam);
  }
}
function _buildWaves() {
  for (let i=0; i<7; i++) {
    const geo=new THREE.PlaneGeometry(1.6,(L.WORLD_Z_MAX-L.WORLD_Z_MIN)+40,1,90);
    const pos=geo.attributes.position;
    for (let v=0; v<pos.count; v++) {
      const z=pos.getY(v);
      pos.setZ(v,Math.sin(z*0.08)*0.15); pos.setX(v,0.1+Math.sin(z*0.12)*0.08);
    }
    geo.computeVertexNormals();
    const mat=new THREE.MeshStandardMaterial({color:0xc8eef8,transparent:true,opacity:0.38,roughness:0.1,metalness:0.2,side:THREE.DoubleSide});
    const wave=new THREE.Mesh(geo,mat);
    wave.rotation.x=-Math.PI/2;
    wave.position.set(L.SURF_X+i*2.4,0.08,0);
    wave.userData.isWave=true; wave.userData.waveZ=0; wave.userData.wavePhase=i*1.1; scene.add(wave);
  }
}

// ─── Embarcaciones ────────────────────────────────────────────────────────────
function _buildBoats() {
  const tipX=L.BEACH_START_X-L.PIER.length;
  const spots=[
    {x:tipX+4, z:L.PIER.z-8,  color:0xe83020, sail:false},
    {x:tipX+1, z:L.PIER.z+9,  color:0x2255aa, sail:true},
    {x:tipX-14,z:L.PIER.z-22, color:0xf0a830, sail:false},
    {x:tipX-10,z:L.PIER.z+28, color:0x2e8b57, sail:true},
    {x:tipX-22,z:L.PIER.z+5,  color:0x8833aa, sail:false},
  ];
  spots.forEach(s=>boats.push(_buildBoat(s.x,s.z,s.color,s.sail)));
}
function _buildBoat(x,z,color,isSailboat) {
  const group=new THREE.Group();
  const hullMat=new THREE.MeshStandardMaterial({color,metalness:0.1,roughness:0.5});
  const hull=new THREE.Mesh(new THREE.CylinderGeometry(0.6,0.9,3.5,8,1,false,-0.3,Math.PI*1.8),hullMat);
  hull.scale.set(1,0.6,1); hull.position.y=0.3; hull.castShadow=true; group.add(hull);
  const deck=new THREE.Mesh(new THREE.BoxGeometry(1.0,0.1,2.8),new THREE.MeshStandardMaterial({color:0xf5f0e8,roughness:0.7}));
  deck.position.y=0.6; group.add(deck);
  if (isSailboat) {
    const mast=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,5.0,8),new THREE.MeshStandardMaterial({color:0xddd0b8,metalness:0.3}));
    mast.position.y=3.2; group.add(mast);
    const sailGeo=new THREE.BufferGeometry();
    sailGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array([0,0.8,0,0.04,4.8,0,1.4,0.8,1.6]),3));
    sailGeo.setIndex([0,1,2]); sailGeo.computeVertexNormals();
    group.add(new THREE.Mesh(sailGeo,new THREE.MeshStandardMaterial({color:0xfaf5e8,side:THREE.DoubleSide,roughness:0.8})));
  } else {
    const motor=new THREE.Mesh(new THREE.BoxGeometry(0.3,0.5,0.3),new THREE.MeshStandardMaterial({color:0x333333,metalness:0.6}));
    motor.position.set(0,0.5,1.5); group.add(motor);
  }
  group.position.set(x,0.05,z);
  group.rotation.y=Math.PI*(0.2+Math.random()*0.3);
  group.userData.basePos=group.position.clone();
  group.userData.phase=Math.random()*Math.PI*2;
  scene.add(group); return group;
}

// ─── Peces ─────────────────────────────────────────────────────────────────
function _buildFish() {
  const fishMat=[0x4488cc,0xe8a23a,0x55aa77,0xcc4488].map(c=>
    new THREE.MeshStandardMaterial({color:c,roughness:0.5,metalness:0.1}));
  for (let i=0; i<16; i++) {
    const group=new THREE.Group();
    const mat=fishMat[i%fishMat.length];
    const body=new THREE.Mesh(new THREE.ConeGeometry(0.12,0.5,8),mat);
    body.rotation.z=Math.PI/2; group.add(body);
    const tail=new THREE.Mesh(new THREE.ConeGeometry(0.12,0.22,4),mat);
    tail.rotation.z=-Math.PI/2; tail.position.x=-0.32; group.add(tail);
    const cx=L.OCEAN_X+20+Math.random()*90;
    const cz=(Math.random()-0.5)*(L.WORLD_Z_MAX-L.WORLD_Z_MIN)*0.8;
    group.position.set(cx,-1.2-Math.random()*2.5,cz);
    scene.add(group);
    fishList.push({group,cx,cz,radius:2+Math.random()*4,speed:0.3+Math.random()*0.4,phase:Math.random()*Math.PI*2,depth:group.position.y});
  }
}
function _updateBoatsAndFish(t) {
  boats.forEach(b=>{
    const base=b.userData.basePos;
    b.position.y=base.y+Math.sin(t*0.9+b.userData.phase)*0.06;
    b.rotation.z=Math.sin(t*0.7+b.userData.phase)*0.04;
    b.rotation.x=Math.sin(t*0.5+b.userData.phase)*0.03;
  });
  fishList.forEach(f=>{
    const ang=t*f.speed+f.phase;
    f.group.position.x=f.cx+Math.cos(ang)*f.radius;
    f.group.position.z=f.cz+Math.sin(ang)*f.radius;
    f.group.position.y=f.depth+Math.sin(t*1.5+f.phase)*0.15;
    f.group.rotation.y=-ang-Math.PI/2;
  });
}

// ─── Terreno ──────────────────────────────────────────────────────────────────
function _buildTerrain() {
  const sandTex=_makeSandTexture();
  const roughTex=_makeRoughTexture();
  const duneTex=_makeEarthTexture({repeat:12,baseR:222,baseG:200,baseB:156,patchAmount:0.66});
  const earthTex=_makeEarthTexture({repeat:14,baseR:196,baseG:170,baseB:122,patchR:100,patchG:108,patchB:64,patchAmount:0.55});
  sandMat=new THREE.MeshStandardMaterial({map:sandTex,roughnessMap:roughTex,roughness:0.92,metalness:0.0});
  dunesMat=new THREE.MeshStandardMaterial({map:duneTex,roughness:0.93,metalness:0.0});
  earthMat=new THREE.MeshStandardMaterial({map:earthTex,roughness:0.9,metalness:0.0});

  const lenZ=(L.WORLD_Z_MAX-L.WORLD_Z_MIN)+60;
  const zCenter=(L.WORLD_Z_MAX+L.WORLD_Z_MIN)/2;

  const _duned=(geo,ampA,ampB,freqA,freqB)=>{
    const pos=geo.attributes.position;
    for (let i=0; i<pos.count; i++) {
      const x=pos.getX(i), y=pos.getY(i);
      pos.setZ(i,Math.sin(x*freqA)*Math.cos(y*freqA*1.6)*ampA+Math.sin(x*freqB+1)*ampB);
    }
    geo.computeVertexNormals();
  };

  // Arena
  const sandW=(L.BEACH_START_X)-(L.BEACH_END_X);
  const sandGeo=new THREE.PlaneGeometry(sandW+6,lenZ,80,50);
  _duned(sandGeo,0.22,0.14,0.18,0.06);
  const sand=new THREE.Mesh(sandGeo,sandMat);
  sand.rotation.x=-Math.PI/2; sand.rotation.z=Math.PI/2;
  sand.position.set((L.BEACH_START_X+L.BEACH_END_X)/2,0,zCenter);
  sand.receiveShadow=true; scene.add(sand);

  // Duna/jardín
  const duneW=L.BEACH_END_X-L.GARDEN_END_X;
  const duneGeo=new THREE.PlaneGeometry(duneW+4,lenZ,50,35);
  _duned(duneGeo,0.14,0.09,0.2,0.05);
  const dune=new THREE.Mesh(duneGeo,dunesMat);
  dune.rotation.x=-Math.PI/2; dune.rotation.z=Math.PI/2;
  dune.position.set((L.BEACH_END_X+L.GARDEN_END_X)/2,0.01,zCenter);
  dune.receiveShadow=true; scene.add(dune);

  // Tierra adentro
  const eastW=90-L.INLAND_START_X;
  const eastGeo=new THREE.PlaneGeometry(eastW+4,lenZ,70,35);
  _duned(eastGeo,0.1,0.07,0.16,0.04);
  const east=new THREE.Mesh(eastGeo,earthMat);
  east.rotation.x=-Math.PI/2; east.rotation.z=Math.PI/2;
  east.position.set((L.INLAND_START_X+90)/2,0.01,zCenter);
  east.receiveShadow=true; scene.add(east);

  // Franja húmeda
  const wetMat=new THREE.MeshStandardMaterial({color:0xcdb888,roughness:0.95});
  const wet=new THREE.Mesh(new THREE.PlaneGeometry(2.2,lenZ),wetMat);
  wet.rotation.x=-Math.PI/2; wet.rotation.z=Math.PI/2;
  wet.position.set(L.BEACH_END_X,0.012,zCenter); scene.add(wet);
}

// ─── Detalles de playa: sombrillas, sillas, castillos de arena ───────────────
function _buildBeachDetails() {
  const midBeach=(L.BEACH_START_X+L.BEACH_END_X)/2;
  const spots=[
    [midBeach-4,-42],[midBeach+2,-22],[midBeach-2,2],
    [midBeach+4,22],[midBeach-3,42],[midBeach+1,62],
  ];
  spots.forEach(([x,z])=>_buildUmbrella(x,z));
  const chairSpots=[[midBeach-3,-38],[midBeach+3,-18],[midBeach-1,6],[midBeach+5,26],[midBeach-2,48]];
  chairSpots.forEach(([x,z])=>_buildBeachChair(x,z));

  // Castillos de arena
  [[midBeach-6,-10],[midBeach+5,35]].forEach(([x,z])=>{
    const base=new THREE.Mesh(new THREE.ConeGeometry(0.7,0.4,5),new THREE.MeshStandardMaterial({color:0xe8d8a0,roughness:1}));
    base.position.set(x,0.2,z); scene.add(base);
    const tower=new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.3,0.6,8),new THREE.MeshStandardMaterial({color:0xdcc880,roughness:1}));
    tower.position.set(x,0.5,z); scene.add(tower);
    const top=new THREE.Mesh(new THREE.ConeGeometry(0.28,0.35,8),new THREE.MeshStandardMaterial({color:0xd4b860,roughness:0.9}));
    top.position.set(x,0.95,z); scene.add(top);
  });

  // Tabla de surf apoyada
  [midBeach-1,-50].forEach(()=>{});
  const surfMat=new THREE.MeshStandardMaterial({color:0xff4422,roughness:0.5,metalness:0.05});
  const surfboard=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.04,1.8),surfMat);
  surfboard.position.set(midBeach+3,-35,0);
  surfboard.rotation.z=0.15; surfboard.rotation.y=0.3;
  scene.add(surfboard);
}
function _buildUmbrella(x,z) {
  const colors=[0xe83b2a,0xf5a623,0x4ecdc4,0x2ecc71,0x9b59b6,0x3498db];
  const color=colors[Math.floor(Math.random()*colors.length)];
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,2.6,8),new THREE.MeshStandardMaterial({color:0xd4c9a8,roughness:0.6}));
  pole.position.set(x,1.3,z); pole.castShadow=true; scene.add(pole);
  const canopy=new THREE.Mesh(new THREE.ConeGeometry(1.5,0.55,12),new THREE.MeshStandardMaterial({color,roughness:0.8,side:THREE.DoubleSide}));
  canopy.position.set(x,2.4,z); canopy.castShadow=true; scene.add(canopy);
  // Franja decorativa
  const stripe=new THREE.Mesh(new THREE.ConeGeometry(1.5,0.12,12),new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.8,side:THREE.DoubleSide}));
  stripe.position.set(x,2.15,z); scene.add(stripe);
  const tip=new THREE.Mesh(new THREE.SphereGeometry(0.08,8,8),new THREE.MeshStandardMaterial({color:0xffffff}));
  tip.position.set(x,2.7,z); scene.add(tip);
}
function _buildBeachChair(x,z) {
  const mat=new THREE.MeshStandardMaterial({color:0xf0d080,roughness:0.9});
  const frame=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.06,0.7),mat);
  frame.position.set(x,0.22,z); frame.rotation.z=-0.12; frame.castShadow=true; scene.add(frame);
  const back=new THREE.Mesh(new THREE.BoxGeometry(1.35,0.06,0.5),mat);
  back.position.set(x,0.5,z+0.22); back.rotation.x=-0.5; scene.add(back);
}

// ─── Calles mejoradas ────────────────────────────────────────────────────────
function _buildRoads() {
  const roadMat=new THREE.MeshStandardMaterial({color:0x484c50,roughness:0.88,metalness:0.04});
  const lineMat=new THREE.MeshBasicMaterial({color:0xffffff});
  const yellowMat=new THREE.MeshBasicMaterial({color:0xf0c820});
  const zLen=L.WORLD_Z_MAX-L.WORLD_Z_MIN;
  const zCenter=(L.WORLD_Z_MAX+L.WORLD_Z_MIN)/2;

  // Calle principal
  const mainRoad=new THREE.Mesh(new THREE.PlaneGeometry(L.STREET_HALF_W*2+0.8,zLen+4),roadMat);
  mainRoad.rotation.x=-Math.PI/2; mainRoad.position.set(0,0.015,zCenter);
  mainRoad.receiveShadow=true; scene.add(mainRoad);
  _dashedLine(0,zCenter,zLen,'z',lineMat);

  // Bordes amarillos
  [-L.STREET_HALF_W,L.STREET_HALF_W].forEach(ox=>{
    const edge=new THREE.Mesh(new THREE.PlaneGeometry(0.14,zLen+4),yellowMat);
    edge.rotation.x=-Math.PI/2; edge.position.set(ox,0.025,zCenter); scene.add(edge);
  });

  // Vereda/Sendero peatonal
  const pathMat=new THREE.MeshStandardMaterial({color:0xd5c9b0,roughness:0.92});
  const path=new THREE.Mesh(new THREE.PlaneGeometry(1.8,zLen),pathMat);
  path.rotation.x=-Math.PI/2; path.rotation.z=Math.PI/2;
  path.position.set((L.GARDEN_END_X+L.BEACH_END_X)/2,0.016,zCenter); scene.add(path);

  // Baldosas de acceso a la playa (cruces transversales)
  for (let z=L.WORLD_Z_MIN+10; z<=L.WORLD_Z_MAX-10; z+=18) {
    const cross=new THREE.Mesh(new THREE.PlaneGeometry(2.5,1.0),new THREE.MeshStandardMaterial({color:0xcbbfa0,roughness:0.9}));
    cross.rotation.x=-Math.PI/2;
    cross.position.set((L.BEACH_END_X+L.BEACH_START_X)/2,0.017,z); scene.add(cross);
  }

  // Bordillos
  const curbMat=new THREE.MeshStandardMaterial({color:0xc8c2b5,roughness:0.9});
  [-L.STREET_HALF_W-0.45,L.STREET_HALF_W+0.45].forEach(cx=>{
    const curb=new THREE.Mesh(new THREE.BoxGeometry(0.38,0.14,zLen+4),curbMat);
    curb.position.set(cx,0.07,zCenter); scene.add(curb);
  });

  // Señal de límite de velocidad
  _buildSpeedSign(-L.STREET_HALF_W-1.2, L.WORLD_Z_MIN+10);
  _buildSpeedSign( L.STREET_HALF_W+1.2, L.WORLD_Z_MAX-10);
}
function _buildSpeedSign(x,z) {
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,2.4,6),
    new THREE.MeshStandardMaterial({color:0x888888,metalness:0.7}));
  pole.position.set(x,1.2,z); scene.add(pole);
  const sign=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,0.05,32),
    new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.5}));
  sign.position.set(x,2.6,z);
  // Borde rojo
  const border=new THREE.Mesh(new THREE.TorusGeometry(0.4,0.06,8,32),
    new THREE.MeshStandardMaterial({color:0xcc1111,roughness:0.5}));
  border.rotation.x=Math.PI/2; border.position.set(x,2.62,z); scene.add(border);
  scene.add(sign);
}
function _dashedLine(cx,cz,length,axis,mat) {
  const dashLen=1.6, gap=1.2;
  const count=Math.floor(length/(dashLen+gap));
  for (let i=0; i<count; i++) {
    const offset=-length/2+i*(dashLen+gap);
    const dash=new THREE.Mesh(new THREE.PlaneGeometry(axis==='z'?0.12:dashLen,axis==='z'?dashLen:0.12),mat);
    dash.rotation.x=-Math.PI/2;
    if (axis==='z') dash.position.set(cx,0.022,cz+offset);
    else dash.position.set(cx+offset,0.022,cz);
    scene.add(dash);
  }
}

// ─── Cerro + Estanque mejorado ────────────────────────────────────────────────
function _buildMountainAndTank() {
  const {x,z}=L.ESTANQUE;
  const rockMat=new THREE.MeshStandardMaterial({color:0xb8a070,roughness:0.97});
  const rockMat2=new THREE.MeshStandardMaterial({color:0xa09060,roughness:0.95});

  // Base del cerro — varias capas para forma más natural
  [[10,0.55,0xc8b080],[7,0.65,0xb8a070],[4.5,0.75,0xa89060],[2.5,0.85,0x998050]].forEach(([r,sy,col],i)=>{
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,32,24,0,Math.PI*2,0,Math.PI/2),
      new THREE.MeshStandardMaterial({color:col,roughness:0.97-i*0.01}));
    mesh.scale.set(1,sy,1); mesh.position.set(x,i*1.8,z);
    mesh.castShadow=mesh.receiveShadow=true; scene.add(mesh);
  });

  // Rocas decorativas en la base
  for (let i=0; i<6; i++) {
    const ang=(i/6)*Math.PI*2, r=8+Math.random()*3;
    const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(0.6+Math.random()*0.5,0),rockMat2);
    rock.position.set(x+Math.cos(ang)*r,0.2,z+Math.sin(ang)*r);
    rock.rotation.set(Math.random(),Math.random()*Math.PI*2,Math.random());
    scene.add(rock);
  }

  // Sendero en espiral hasta el estanque
  const pathMat=new THREE.MeshStandardMaterial({color:0x9a8860,roughness:0.95});
  for (let i=0; i<12; i++) {
    const ang=(i/12)*Math.PI*1.5, r=7-i*0.4, h=i*0.55;
    const step=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.12,0.5),pathMat);
    step.position.set(x+Math.cos(ang)*r,h,z+Math.sin(ang)*r);
    step.rotation.y=-ang; scene.add(step);
  }

  // Estanque
  const tankGroup=new THREE.Group();
  const tankBody=new THREE.Mesh(new THREE.CylinderGeometry(3.0,3.2,4.5,28),
    new THREE.MeshStandardMaterial({color:0x3a7058,metalness:0.28,roughness:0.52}));
  tankBody.position.y=2.25; tankBody.castShadow=true; tankGroup.add(tankBody);

  // Bandas horizontales en el estanque
  [0.8,1.6,2.4,3.2].forEach(hy=>{
    const band=new THREE.Mesh(new THREE.TorusGeometry(3.1,0.08,8,28),
      new THREE.MeshStandardMaterial({color:0x2d5a44,metalness:0.4}));
    band.rotation.x=Math.PI/2; band.position.y=hy; tankGroup.add(band);
  });

  const tankRoof=new THREE.Mesh(new THREE.SphereGeometry(3.0,28,12,0,Math.PI*2,0,Math.PI/2),
    new THREE.MeshStandardMaterial({color:0x2d5a44,metalness:0.32,roughness:0.48}));
  tankRoof.position.y=4.5; tankRoof.castShadow=true; tankGroup.add(tankRoof);

  const tankBase=new THREE.Mesh(new THREE.CylinderGeometry(3.3,3.6,0.5,28),
    new THREE.MeshStandardMaterial({color:0x2a4a38,metalness:0.22,roughness:0.7}));
  tankBase.position.y=0.25; tankGroup.add(tankBase);

  // Escalera
  const ladderMat=new THREE.MeshStandardMaterial({color:0x777777,metalness:0.75,roughness:0.25});
  const ladderRailL=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,4.8,6),ladderMat);
  ladderRailL.position.set(3.15,2.4,0.2); tankGroup.add(ladderRailL);
  const ladderRailR=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,4.8,6),ladderMat);
  ladderRailR.position.set(3.15,2.4,-0.2); tankGroup.add(ladderRailR);
  for (let i=0; i<9; i++) {
    const rung=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,0.45,6),ladderMat);
    rung.position.set(3.15,0.4+i*0.52,0); rung.rotation.z=Math.PI/2; tankGroup.add(rung);
  }

  // Venteos y cañerías del estanque
  [[1.5,5.1,0],[−1.2,5.0,1.0]].forEach(([ox,oy,oz])=>{
    const vent=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,0.9,8),
      new THREE.MeshStandardMaterial({color:0x555555,metalness:0.7}));
    vent.position.set(ox,oy,oz); tankGroup.add(vent);
  });

  tankGroup.position.set(x,5.8,z); scene.add(tankGroup);
  _label(scene,'Estanque Principal',x,14.5,z);
}

// ─── Red de tuberías ──────────────────────────────────────────────────────────
function _buildPipeNetwork() {
  pipeGroup=new THREE.Group();
  pipeGlowGroup=new THREE.Group();
  pipeGroup.visible=false;
  scene.add(pipeGroup); scene.add(pipeGlowGroup);
  const pipeMat=new THREE.MeshStandardMaterial({color:0x1a9070,emissive:0x0a3828,emissiveIntensity:0.5,metalness:0.35,roughness:0.4});
  const jointMat=new THREE.MeshStandardMaterial({color:0x157555,metalness:0.5,roughness:0.3});
  const {segments,leakPoints}=L.getPipeNetwork();
  segments.forEach(([a,b])=>{
    const av=new THREE.Vector3(a.x,a.y,a.z);
    const bv=new THREE.Vector3(b.x,b.y,b.z);
    _addPipe(av,bv,pipeMat);
    [av,bv].forEach(pt=>{
      const joint=new THREE.Mesh(new THREE.SphereGeometry(0.27,12,12),jointMat);
      joint.position.copy(pt); pipeGroup.add(joint);
    });
  });
  const valveSpots=[leakPoints[0],leakPoints[1],leakPoints[2],leakPoints[3]];
  valveSpots.forEach(p=>{
    if (!p) return;
    const valve=new THREE.Mesh(new THREE.TorusGeometry(0.34,0.1,8,14),
      new THREE.MeshStandardMaterial({color:0xff6622,metalness:0.6,roughness:0.3,emissive:0x441100,emissiveIntensity:0.3}));
    valve.position.set(p.pos.x,p.pos.y+0.5,p.pos.z);
    valve.rotation.x=Math.PI/2; pipeGroup.add(valve);
  });
  _buildFlowParticles(segments);
}
function _addPipe(a,b,mat) {
  const dir=new THREE.Vector3().subVectors(b,a);
  const len=dir.length(); if (len<0.01) return;
  const mid=new THREE.Vector3().addVectors(a,b).multiplyScalar(0.5);
  const tube=new THREE.Mesh(new THREE.CylinderGeometry(0.21,0.21,len,12),mat);
  tube.position.copy(mid);
  tube.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());
  tube.castShadow=true; pipeGroup.add(tube);
  const glow=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,len,12),
    new THREE.MeshBasicMaterial({color:0x2fffb8,transparent:true,opacity:0,depthTest:false}));
  glow.position.copy(mid); glow.quaternion.copy(tube.quaternion); pipeGlowGroup.add(glow);
}
function _buildFlowParticles(segments) {
  const flowMat=new THREE.MeshBasicMaterial({color:0x4af0c8});
  segments.forEach(([a,b])=>{
    const av=new THREE.Vector3(a.x,a.y+0.02,a.z);
    const bv=new THREE.Vector3(b.x,b.y+0.02,b.z);
    const n=Math.max(2,Math.floor(av.distanceTo(bv)/4));
    for (let i=0; i<n; i++) {
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(0.14,8,8),flowMat.clone());
      pipeGroup.add(mesh);
      flowParticles.push({mesh,a:av,b:bv,t:i/n,speed:0.12+Math.random()*0.05});
    }
  });
}
function _updateFlowParticles() {
  flowParticles.forEach(p=>{
    if (!mainValveClosed) {
      p.t=(p.t+p.speed*0.016)%1;
      p.mesh.material.color.setHex(0x4af0c8);
    } else {
      p.mesh.material.color.setHex(0x554444);
    }
    p.mesh.position.lerpVectors(p.a,p.b,p.t);
  });
}

// ─── Edificios principales ────────────────────────────────────────────────────
function _buildCasaPrincipal() {
  const cfg=L.CASA_PRINCIPAL;
  const house=_buildDetailedHouse({w:cfg.w,h:cfg.h,d:cfg.d,wallColor:0xf5ede0,roofColor:0x2a5e42,accentColor:0x8b6b4a,hasTerrace:true,label:'Casa Principal'});
  house.position.set(cfg.x,0,cfg.z); scene.add(house);
  // Jardín delante
  const gardenMat=new THREE.MeshStandardMaterial({color:0x5a8030,roughness:0.95});
  const garden=new THREE.Mesh(new THREE.PlaneGeometry(cfg.w+2,3),gardenMat);
  garden.rotation.x=-Math.PI/2; garden.position.set(cfg.x,0.02,cfg.z+cfg.d/2+1.5); scene.add(garden);
}
function _buildSalaDeMaquinas() {
  const cfg=L.SALA_MAQUINAS;
  const house=_buildDetailedHouse({w:cfg.w,h:cfg.h,d:cfg.d,wallColor:0xd0d5da,roofColor:0x3d4247,accentColor:0x555a5e,hasTerrace:false,label:'Sala de Máquinas'});
  house.position.set(cfg.x,0,cfg.z); scene.add(house);
  // Chimenea de escape
  const pipeMat2=new THREE.MeshStandardMaterial({color:0x1a9070,metalness:0.4,roughness:0.3});
  [[-2,-1.5],[2,1.5]].forEach(([ox,oz])=>{
    const pip=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,2.2,8),pipeMat2);
    pip.position.set(cfg.x+ox,1.6,cfg.z+oz); scene.add(pip);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.14,0.15,8),
      new THREE.MeshStandardMaterial({color:0x222222,metalness:0.6}));
    cap.position.set(cfg.x+ox,2.75,cfg.z+oz); scene.add(cap);
  });
}

// ─── Planta Desalinizadora ────────────────────────────────────────────────────
function _buildPlantaDesalinizadora() {
  const group=new THREE.Group();
  const wallMat=new THREE.MeshStandardMaterial({color:0xd5dce3,metalness:0.08,roughness:0.75});
  const body=new THREE.Mesh(new THREE.BoxGeometry(11,5.5,8),wallMat);
  body.position.set(0,2.75,0); body.castShadow=body.receiveShadow=true; group.add(body);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(11.6,0.38,8.6),
    new THREE.MeshStandardMaterial({color:0xbbc3cb,roughness:0.8}));
  roof.position.set(0,5.7,0); roof.castShadow=true; group.add(roof);

  const tankMat=new THREE.MeshStandardMaterial({color:0x7a9aaa,metalness:0.55,roughness:0.35});
  for (let i=0; i<4; i++) {
    const tank=new THREE.Mesh(new THREE.CylinderGeometry(0.85,0.85,5,22),tankMat);
    tank.position.set(-3.8+i*2.55,2.5,-5.2); tank.castShadow=true; group.add(tank);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(0.85,18,8,0,Math.PI*2,0,Math.PI/2),tankMat);
    cap.position.set(-3.8+i*2.55,5.0,-5.2); group.add(cap);
  }

  const vesselMat=new THREE.MeshStandardMaterial({color:0xe8e0d0,metalness:0.2,roughness:0.6});
  for (let i=0; i<3; i++) {
    const vessel=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,1.8,14),vesselMat);
    vessel.position.set(-2.5+i*2.5,7.0,0); vessel.castShadow=true; group.add(vessel);
    const flange=new THREE.Mesh(new THREE.CylinderGeometry(0.6,0.6,0.1,14),
      new THREE.MeshStandardMaterial({color:0xaaaaaa,metalness:0.5}));
    flange.position.set(-2.5+i*2.5,6.05,0); group.add(flange);
  }

  const intakeMat=new THREE.MeshStandardMaterial({color:0x4488aa,metalness:0.5,roughness:0.3});
  const intake=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,10,12),intakeMat);
  intake.rotation.z=Math.PI/2; intake.position.set(-8,1.2,0); group.add(intake);
  const brine=new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.25,7,10),intakeMat);
  brine.rotation.z=Math.PI/2; brine.position.set(-7.5,0.6,2.5); group.add(brine);

  const winMat=new THREE.MeshStandardMaterial({color:0x3d6a88,metalness:0.5,roughness:0.2,emissive:0x1a3344,emissiveIntensity:0.2});
  for (let i=-1; i<=1; i++) {
    const win=new THREE.Mesh(new THREE.BoxGeometry(0.08,1.2,1.8),winMat);
    win.position.set(5.55,2.8,i*2.5); group.add(win);
  }
  const door=new THREE.Mesh(new THREE.BoxGeometry(0.08,2.4,1.2),new THREE.MeshStandardMaterial({color:0x445566}));
  door.position.set(5.55,1.2,-2.5); group.add(door);

  // Letrero iluminado
  const signCanvas=document.createElement('canvas');
  signCanvas.width=512; signCanvas.height=128;
  const sctx=signCanvas.getContext('2d');
  sctx.fillStyle='#1a3c5a'; sctx.fillRect(0,0,512,128);
  sctx.fillStyle='#4ac8f0'; sctx.fillRect(0,120,512,8);
  sctx.fillStyle='#ffffff'; sctx.font='bold 34px Arial';
  sctx.textAlign='center'; sctx.textBaseline='middle';
  sctx.shadowColor='#4ac8f0'; sctx.shadowBlur=12;
  sctx.fillText('PLANTA DESALINIZADORA',256,64);
  const sign=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.8,4.2),
    new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(signCanvas),emissive:0x1a3c5a,emissiveIntensity:0.4}));
  sign.position.set(5.55,4.7,0); group.add(sign);

  group.rotation.y=Math.PI;
  group.position.set(L.PLANTA_DESAL.x,0,L.PLANTA_DESAL.z);
  scene.add(group);
  _label(group,'Planta Desalinizadora',0,9.0,0);
}

// ─── Cabañas ──────────────────────────────────────────────────────────────────
function _buildCasitas() {
  L.HOUSES.forEach(h=>{
    const house=_buildDetailedHouse({w:h.w,h:h.h,d:h.d,wallColor:h.wallColor,roofColor:h.roofColor,accentColor:0x8b7250,hasTerrace:false,label:h.label});
    house.position.set(h.x,0,h.z); scene.add(house);
    // Pequeño jardín frontal por cabaña
    const gMat=new THREE.MeshStandardMaterial({color:0x6a8840,roughness:0.95});
    const gPatch=new THREE.Mesh(new THREE.PlaneGeometry(h.w+0.5,1.5),gMat);
    gPatch.rotation.x=-Math.PI/2;
    gPatch.position.set(h.x,0.02,h.z+(h.side==='west'?h.d/2+0.75:-(h.d/2+0.75)));
    scene.add(gPatch);
  });
}

// ─── Cercas entre cabañas ─────────────────────────────────────────────────────
function _buildCabinFences() {
  const fenceMat=new THREE.MeshStandardMaterial({color:0xddd0b0,roughness:0.8});
  const postMat=new THREE.MeshStandardMaterial({color:0xc8b890,roughness:0.7});

  L.HOUSE_ROWS_Z.forEach((z,i)=>{
    if (i===L.HOUSE_ROWS_Z.length-1) return;
    const midZ=(L.HOUSE_ROWS_Z[i]+L.HOUSE_ROWS_Z[i+1])/2;
    // Valla entre casas oeste y este en cada fila
    [L.HOUSE_SIDE_X.west-2.2, L.HOUSE_SIDE_X.east+2.2].forEach(fx=>{
      const fenceLen=Math.abs(L.HOUSE_ROWS_Z[i+1]-z)*0.7;
      const rail=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.6,fenceLen),fenceMat);
      rail.position.set(fx,0.55,midZ); scene.add(rail);
      const rail2=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.4,fenceLen),fenceMat);
      rail2.position.set(fx,0.25,midZ); scene.add(rail2);
      const postCount=Math.ceil(fenceLen/2.5);
      for (let p=0; p<postCount; p++) {
        const post=new THREE.Mesh(new THREE.BoxGeometry(0.12,1.0,0.12),postMat);
        post.position.set(fx,0.5,z+3.5+p*2.5); scene.add(post);
      }
    });
  });
}

// ─── Estacionamiento + servicios ──────────────────────────────────────────────
function _buildParkingYBanos() {
  const {x:px,z:pz}=L.PARKING;
  const lotMat=new THREE.MeshStandardMaterial({color:0x505458,roughness:0.9});
  const lot=new THREE.Mesh(new THREE.PlaneGeometry(22,16),lotMat);
  lot.rotation.x=-Math.PI/2; lot.position.set(px,0.018,pz);
  lot.receiveShadow=true; scene.add(lot);

  const lineMat=new THREE.MeshBasicMaterial({color:0xffffff});
  for (let i=-3; i<=3; i++) {
    const line=new THREE.Mesh(new THREE.PlaneGeometry(0.1,8),lineMat);
    line.rotation.x=-Math.PI/2; line.position.set(px+i*2.8,0.025,pz); scene.add(line);
  }

  // Zona discapacitados
  const dp=new THREE.Mesh(new THREE.PlaneGeometry(2.6,7.8),new THREE.MeshBasicMaterial({color:0x2255cc}));
  dp.rotation.x=-Math.PI/2; dp.position.set(px+3*2.8+1.5,0.026,pz); scene.add(dp);

  // Sombra/marquesina del estacionamiento
  const shadeMat=new THREE.MeshStandardMaterial({color:0x446688,transparent:true,opacity:0.35,side:THREE.DoubleSide});
  const shade=new THREE.Mesh(new THREE.PlaneGeometry(22,16),shadeMat);
  shade.rotation.x=-Math.PI/2; shade.position.set(px,3.5,pz); scene.add(shade);
  // Postes de la marquesina
  [[px-9,pz-7],[px-9,pz+7],[px+9,pz-7],[px+9,pz+7]].forEach(([sx,sz])=>{
    const post=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.12,3.5,8),
      new THREE.MeshStandardMaterial({color:0x445566,metalness:0.5}));
    post.position.set(sx,1.75,sz); scene.add(post);
  });

  // Baño/servicios
  const bath=_buildDetailedHouse({w:2.5,h:2.4,d:2.2,wallColor:0xfafafa,roofColor:0x2a5a6e,accentColor:0x336688,hasTerrace:false,label:'Servicios'});
  bath.position.set(px-12,0,pz-5); scene.add(bath);

  // Letrero tarifas
  const signCanvas=document.createElement('canvas');
  signCanvas.width=300; signCanvas.height=200;
  const ctx=signCanvas.getContext('2d');
  ctx.fillStyle='#f0ede5'; _canvasRoundRect(ctx,0,0,300,200,14); ctx.fill();
  ctx.strokeStyle='#aaa'; ctx.lineWidth=3; ctx.stroke();
  ctx.fillStyle='#1a3050'; ctx.font='bold 24px Arial'; ctx.textAlign='center';
  ctx.fillText('Tarifas',150,38);
  ctx.font='18px Arial'; ctx.fillStyle='#333';
  ctx.fillText('🚽 Baño: $200',150,80);
  ctx.fillText('🚿 Ducha: $500',150,112);
  ctx.fillText('🚗 Estac.: $1.000',150,144);
  ctx.fillText('📦 Completo: $1.500',150,176);
  const sign=new THREE.Mesh(new THREE.BoxGeometry(2.2,1.5,0.06),
    new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(signCanvas)}));
  sign.position.set(px-12,2.2,pz-3.8); scene.add(sign);
  _label(scene,'Estacionamiento',px,1.0,pz+9);
}

// ─── Kiosco de playa ──────────────────────────────────────────────────────────
function _buildKiosk() {
  const kx=L.BEACH_END_X-3, kz=10;
  const group=new THREE.Group();
  // Mostrador
  const counter=new THREE.Mesh(new THREE.BoxGeometry(2.5,1.0,1.2),
    new THREE.MeshStandardMaterial({color:0x8b5e2a,roughness:0.8}));
  counter.position.y=0.5; counter.castShadow=true; group.add(counter);
  const top=new THREE.Mesh(new THREE.BoxGeometry(2.7,0.08,1.4),
    new THREE.MeshStandardMaterial({color:0xf0e8cc,roughness:0.7}));
  top.position.y=1.0; group.add(top);
  // Techo palma
  const techo=new THREE.Mesh(new THREE.ConeGeometry(2.0,0.8,10),
    new THREE.MeshStandardMaterial({color:0x8a6020,roughness:1.0}));
  techo.position.y=2.2; techo.castShadow=true; group.add(techo);
  const techo2=new THREE.Mesh(new THREE.ConeGeometry(2.3,0.3,10),
    new THREE.MeshStandardMaterial({color:0x7a5010,roughness:1.0,side:THREE.DoubleSide}));
  techo2.position.y=1.7; group.add(techo2);
  // Postes
  [[-1,0.5],[-1,-0.5],[1,0.5],[1,-0.5]].forEach(([px,pz])=>{
    const post=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.07,2.2,8),
      new THREE.MeshStandardMaterial({color:0x7a5525,roughness:0.9}));
    post.position.set(px,1.1,pz); group.add(post);
  });
  // Letrero "Kiosco"
  const canvas=document.createElement('canvas');
  canvas.width=256; canvas.height=64;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#e8a020'; ctx.fillRect(0,0,256,64);
  ctx.fillStyle='#fff'; ctx.font='bold 28px Arial';
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('🍹 KIOSCO',128,32);
  const signMesh=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.45,0.05),
    new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(canvas)}));
  signMesh.position.set(0,0.85,0.62); group.add(signMesh);
  group.position.set(kx,0,kz); scene.add(group);
}

// ─── Mástil con bandera ───────────────────────────────────────────────────────
function _buildFlagpole() {
  const fx=L.CASA_PRINCIPAL.x-4, fz=L.CASA_PRINCIPAL.z+6;
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,8,8),
    new THREE.MeshStandardMaterial({color:0xcccccc,metalness:0.7,roughness:0.3}));
  pole.position.set(fx,4,fz); scene.add(pole);
  // Bandera procedural (con vértices animables)
  const flagGeo=new THREE.PlaneGeometry(1.5,0.8,8,4);
  const flagMat=new THREE.MeshStandardMaterial({color:0xcc2020,side:THREE.DoubleSide,roughness:0.7});
  const flag=new THREE.Mesh(flagGeo,flagMat);
  // Franja blanca y azul
  const stripe1=new THREE.Mesh(new THREE.PlaneGeometry(1.5,0.26,8,2),
    new THREE.MeshStandardMaterial({color:0xffffff,side:THREE.DoubleSide}));
  stripe1.position.z=0.01;
  const stripe2=new THREE.Mesh(new THREE.PlaneGeometry(1.5,0.26,8,2),
    new THREE.MeshStandardMaterial({color:0x1c3fa8,side:THREE.DoubleSide}));
  stripe2.position.set(0,-0.27,0.01);
  flag.add(stripe1); flag.add(stripe2);
  flag.position.set(fx+0.75,7.6,fz);
  flag.userData.isFlag=true;
  scene.add(flag);
  // Bola en la cima
  const ball=new THREE.Mesh(new THREE.SphereGeometry(0.12,10,10),
    new THREE.MeshStandardMaterial({color:0xddaa00,metalness:0.8}));
  ball.position.set(fx,8.1,fz); scene.add(ball);
}

// ─── Torre de salvavidas ──────────────────────────────────────────────────────
function _buildLifeguardTower() {
  const lx=L.BEACH_START_X-8, lz=-20;
  const group=new THREE.Group();
  const woodMat=new THREE.MeshStandardMaterial({color:0xe8d090,roughness:0.85});
  const redMat=new THREE.MeshStandardMaterial({color:0xdd2222,roughness:0.7});

  // Patas
  [[-0.8,-0.6],[0.8,-0.6],[-0.8,0.6],[0.8,0.6]].forEach(([px,pz])=>{
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.1,2.8,8),woodMat);
    leg.position.set(px,1.4,pz); leg.rotation.x=pz*0.12; scene.add(leg);
  });
  // Plataforma
  const platform=new THREE.Mesh(new THREE.BoxGeometry(2.2,0.15,1.6),woodMat);
  platform.position.y=2.8; group.add(platform);
  // Cabina
  const cabin=new THREE.Mesh(new THREE.BoxGeometry(2.0,1.5,1.4),
    new THREE.MeshStandardMaterial({color:0xfaf0d0,roughness:0.85}));
  cabin.position.y=3.65; group.add(cabin);
  // Techo rojo
  const roof=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.18,1.8),redMat);
  roof.position.y=4.48; group.add(roof);
  // Ventanas
  const winMat=new THREE.MeshStandardMaterial({color:0x4488cc,transparent:true,opacity:0.7,roughness:0.1});
  [[-0.6,3.65,0.71],[0.6,3.65,0.71]].forEach(([wx,wy,wz])=>{
    const win=new THREE.Mesh(new THREE.PlaneGeometry(0.55,0.65),winMat);
    win.position.set(wx,wy,wz); group.add(win);
  });
  // Banderita roja (para indicar condición del mar)
  const flagMast=new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,1.2,6),
    new THREE.MeshStandardMaterial({color:0x888888,metalness:0.6}));
  flagMast.position.set(0.8,4.6,0); group.add(flagMast);
  const lifeguardFlag=new THREE.Mesh(new THREE.PlaneGeometry(0.4,0.25),redMat);
  lifeguardFlag.position.set(1.1,4.95,0);
  lifeguardFlag.userData.isLifeguardFlag=true;
  scene.add(lifeguardFlag);

  group.position.set(lx,0,lz); scene.add(group);
  // Tabla de surf apoyada
  const surf=new THREE.Mesh(new THREE.BoxGeometry(0.15,0.04,1.9),
    new THREE.MeshStandardMaterial({color:0xff8c00,roughness:0.5}));
  surf.position.set(lx+1.5,0.2,lz); surf.rotation.z=0.15; scene.add(surf);
}

// ─── Faro ─────────────────────────────────────────────────────────────────────
function _buildLighthouse() {
  const pierTip=L.BEACH_START_X-L.PIER.length;
  const lhx=pierTip+2, lhz=L.PIER.z+5;
  const group=new THREE.Group();

  // Base cuadrada de hormigón
  const base=new THREE.Mesh(new THREE.BoxGeometry(2.8,1.2,2.8),
    new THREE.MeshStandardMaterial({color:0xd0cabb,roughness:0.9}));
  base.position.y=0.6; base.castShadow=true; group.add(base);

  // Torre — troncocónica con listones blancos y rojos
  const tower=new THREE.Mesh(new THREE.CylinderGeometry(0.6,0.85,7.5,16),
    new THREE.MeshStandardMaterial({color:0xfaf5f0,roughness:0.85}));
  tower.position.y=5.05; tower.castShadow=true; group.add(tower);

  // Franjas rojas
  [1.2,2.6,3.9].forEach(hy=>{
    const stripe=new THREE.Mesh(new THREE.CylinderGeometry(0.72-hy*0.02,0.74-hy*0.02,0.6,16),
      new THREE.MeshStandardMaterial({color:0xcc2222,roughness:0.7}));
    stripe.position.y=1.2+hy*1.6; group.add(stripe);
  });

  // Balcón
  const balcony=new THREE.Mesh(new THREE.CylinderGeometry(1.0,1.0,0.18,20),
    new THREE.MeshStandardMaterial({color:0x888888,metalness:0.5,roughness:0.4}));
  balcony.position.y=8.4; group.add(balcony);
  const balconyRail=new THREE.Mesh(new THREE.TorusGeometry(1.0,0.05,8,20),
    new THREE.MeshStandardMaterial({color:0x666666,metalness:0.6}));
  balconyRail.rotation.x=Math.PI/2; balconyRail.position.y=8.65; group.add(balconyRail);

  // Linterna (cabeza del faro)
  const lantern=new THREE.Mesh(new THREE.CylinderGeometry(0.65,0.65,1.2,16),
    new THREE.MeshStandardMaterial({color:0xbbccdd,metalness:0.4,roughness:0.2,transparent:true,opacity:0.7}));
  lantern.position.y=9.2; group.add(lantern);
  const lanternRoof=new THREE.Mesh(new THREE.ConeGeometry(0.75,0.8,16),
    new THREE.MeshStandardMaterial({color:0x444455,metalness:0.5,roughness:0.3}));
  lanternRoof.position.y=10.2; group.add(lanternRoof);

  // Luz giratoria del faro
  const beamGeo=new THREE.ConeGeometry(0.2,8,6,1,true);
  const beamMat=new THREE.MeshBasicMaterial({color:0xffffaa,transparent:true,opacity:0.2,side:THREE.DoubleSide,depthWrite:false});
  const beam=new THREE.Mesh(beamGeo,beamMat);
  beam.rotation.x=Math.PI/2; beam.position.y=9.2; beam.position.z=4;
  beam.userData.isLighthouseBeam=true; group.add(beam);

  // Luz puntual
  const lighthouseLight=new THREE.PointLight(0xffffcc,isNight?3.5:0.5,50);
  lighthouseLight.position.y=9.2; group.add(lighthouseLight);

  group.position.set(lhx,0,lhz); scene.add(group);
  _label(scene,'Faro',lhx,12.5,lhz);
}

// ─── Cancha de voleibol playa ─────────────────────────────────────────────────
function _buildVolleyballCourt() {
  const vx=(L.BEACH_START_X+L.BEACH_END_X)/2, vz=55;
  // Arena marcada
  const courtMat=new THREE.MeshBasicMaterial({color:0xe0d090,side:THREE.DoubleSide});
  const lineMat=new THREE.MeshBasicMaterial({color:0xfaf0d0});
  const court=new THREE.Mesh(new THREE.PlaneGeometry(9,18),courtMat);
  court.rotation.x=-Math.PI/2; court.position.set(vx,0.02,vz); scene.add(court);
  // Líneas
  [[9,0.1,0],[0.1,18,0],[0,0.1,0],[0,0,9]].forEach((_,i)=>{
    const w=i<2?9:0.1, h=i<2?0.1:18;
    const lines=[[w,0.1],[0.1,h]];
  });
  // Contorno
  const lineGeo=[
    new THREE.PlaneGeometry(9,0.1), new THREE.PlaneGeometry(9,0.1),
    new THREE.PlaneGeometry(0.1,18),new THREE.PlaneGeometry(0.1,18)
  ];
  const offsets=[[vx,vz-9],[vx,vz+9],[vx-4.5,vz],[vx+4.5,vz]];
  lineGeo.forEach((g,i)=>{
    const m=new THREE.Mesh(g,lineMat);
    m.rotation.x=-Math.PI/2; m.position.set(offsets[i][0],0.025,offsets[i][1]); scene.add(m);
  });
  // Red central
  const netPoleMat=new THREE.MeshStandardMaterial({color:0x888888,metalness:0.6});
  const netMat=new THREE.MeshStandardMaterial({color:0xffffff,wireframe:true,transparent:true,opacity:0.8});
  [vx-4.5,vx+4.5].forEach(px=>{
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,2.4,8),netPoleMat);
    pole.position.set(px,1.2,vz); scene.add(pole);
  });
  const net=new THREE.Mesh(new THREE.PlaneGeometry(9,0.9,9,3),netMat);
  net.position.set(vx,1.6,vz); scene.add(net);
  // Balón (en el suelo)
  const ball=new THREE.Mesh(new THREE.SphereGeometry(0.2,12,12),
    new THREE.MeshStandardMaterial({color:0xf5e040,roughness:0.7}));
  ball.position.set(vx+1.5,0.22,vz+2); scene.add(ball);
}

// ─── Base cuadrilla ───────────────────────────────────────────────────────────
function _buildRepairBase() {
  const {x,z}=L.REPAIR_BASE;
  const shed=_buildDetailedHouse({w:4,h:2.6,d:3.2,wallColor:0xe2cf9a,roofColor:0xb44a2a,accentColor:0x6a4a2a,hasTerrace:false,label:'Depósito Cuadrilla'});
  shed.position.set(x,0,z+6); scene.add(shed);
  // Zona asfaltada detrás del depósito
  const apron=new THREE.Mesh(new THREE.PlaneGeometry(8,6),
    new THREE.MeshStandardMaterial({color:0x484c50,roughness:0.9}));
  apron.rotation.x=-Math.PI/2; apron.position.set(x,0.017,z+2); scene.add(apron);
  // Contenedor de herramientas
  const crate=new THREE.Mesh(new THREE.BoxGeometry(1.5,1.0,0.9),
    new THREE.MeshStandardMaterial({color:0x2244aa,metalness:0.2,roughness:0.6}));
  crate.position.set(x+3.5,0.5,z+6); scene.add(crate);
}

// ─── Pier mejorado ────────────────────────────────────────────────────────────
function _buildPier() {
  const woodMat=new THREE.MeshStandardMaterial({color:0x7a5533,roughness:0.85});
  const poleMat=new THREE.MeshStandardMaterial({color:0x4a3220,roughness:0.9});
  const {length,z:pz}=L.PIER;
  const startX=L.BEACH_START_X, endX=startX-length;
  const midX=(startX+endX)/2;

  const pierDeck=new THREE.Mesh(new THREE.BoxGeometry(length,0.3,3.8),woodMat);
  pierDeck.position.set(midX,0.5,pz); pierDeck.castShadow=pierDeck.receiveShadow=true; scene.add(pierDeck);

  // Tablas del piso con pequeñas grietas/separaciones
  for (let i=0; i<12; i++) {
    const plank=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.07,3.6),
      new THREE.MeshStandardMaterial({color:0x8a6040,roughness:0.9}));
    plank.position.set(startX-i*(length/12),0.66,pz); scene.add(plank);
  }

  // Pilotes
  for (let side=-1; side<=1; side+=2) {
    for (let xx=startX-1; xx>=endX+1; xx-=4.5) {
      const pile=new THREE.Mesh(new THREE.CylinderGeometry(0.23,0.28,2.4,10),poleMat);
      pile.position.set(xx,-0.3,pz+side*1.75); pile.castShadow=true; scene.add(pile);
    }
  }

  // Barandas
  const railMat=new THREE.MeshStandardMaterial({color:0x8a6040,roughness:0.7});
  for (let side=-1; side<=1; side+=2) {
    const rail=new THREE.Mesh(new THREE.BoxGeometry(length,0.8,0.1),railMat);
    rail.position.set(midX,1.08,pz+side*1.8); scene.add(rail);
    for (let post=0; post<9; post++) {
      const p=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.95,6),railMat);
      p.position.set(startX-post*(length/9),0.67,pz+side*1.8); scene.add(p);
    }
  }

  // Bancos en el muelle
  const benchMat=new THREE.MeshStandardMaterial({color:0x9a7040,roughness:0.85});
  [startX-5, startX-12, startX-20].forEach(bx=>{
    const bench=new THREE.Mesh(new THREE.BoxGeometry(0.25,0.08,1.4),benchMat);
    bench.position.set(bx,0.72,pz+1.3); scene.add(bench);
    const leg1=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.4,6),benchMat);
    leg1.position.set(bx-0.08,0.5,pz+1.3); scene.add(leg1);
  });

  // Cañas de pescar asomadas al costado
  [startX-4, startX-11, endX+5].forEach(fx=>{
    const rod=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.02,3.5,6),
      new THREE.MeshStandardMaterial({color:0x558822,roughness:0.8,metalness:0.1}));
    rod.position.set(fx,1.5,pz+1.9); rod.rotation.z=1.2; rod.rotation.y=0.2; scene.add(rod);
  });

  // Bolardos
  [[startX-1,pz-1.7],[startX-1,pz+1.7],[endX+1,pz-1.7],[endX+1,pz+1.7]].forEach(([x,z])=>{
    const bollard=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.25,0.75,8),
      new THREE.MeshStandardMaterial({color:0x555555,metalness:0.6}));
    bollard.position.set(x,0.65,z); scene.add(bollard);
    // Anilla
    const ring=new THREE.Mesh(new THREE.TorusGeometry(0.14,0.03,6,12),
      new THREE.MeshStandardMaterial({color:0x888888,metalness:0.7}));
    ring.position.set(x,0.98,z); ring.rotation.x=Math.PI/2; scene.add(ring);
  });

  _label(scene,'Muelle',midX,2.8,pz);
}

// ─── Duchas ───────────────────────────────────────────────────────────────────
function _buildDuchas() {
  const {x:px,z:pz}=L.PARKING;
  [[px-6,pz+9],[px-8,pz+7],[px-10,pz+11]].forEach(([x,z])=>{
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.08,2.6,10),
      new THREE.MeshStandardMaterial({color:0xcccccc,metalness:0.7,roughness:0.25}));
    pole.position.set(x,1.3,z); pole.castShadow=true; scene.add(pole);
    const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.5,8),
      new THREE.MeshStandardMaterial({color:0xbbbbbb,metalness:0.7}));
    arm.rotation.z=Math.PI/2; arm.position.set(x+0.25,2.4,z); scene.add(arm);
    const head=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.12,0.15,14),
      new THREE.MeshStandardMaterial({color:0x999999,metalness:0.8,roughness:0.2}));
    head.position.set(x+0.5,2.4,z); head.rotation.z=Math.PI/2; scene.add(head);
    for (let d=0; d<5; d++) {
      const drop=new THREE.Mesh(new THREE.SphereGeometry(0.04,6,6),
        new THREE.MeshStandardMaterial({color:0x88bbff,transparent:true,opacity:0.7,roughness:0.1}));
      drop.position.set(x+0.5+(Math.random()-0.5)*0.3,2.0-d*0.3,z+(Math.random()-0.5)*0.3);
      scene.add(drop);
    }
  });
}

// ─── Palmeras ─────────────────────────────────────────────────────────────────
function _buildPalmTrees() {
  const spots=[];
  for (let z=L.WORLD_Z_MIN+4; z<=L.WORLD_Z_MAX-4; z+=5.5) {
    spots.push([L.BEACH_END_X-1.5,z]);
    if (z%11<5.5) spots.push([L.GARDEN_END_X+1.5,z]);
  }
  // Palmeras junto al kiosco
  [[L.BEACH_END_X-1,14],[L.BEACH_END_X-2,6]].forEach(p=>spots.push(p));
  // Junto al muelle
  [[L.BEACH_START_X-6,L.PIER.z-14],[L.BEACH_START_X-4,L.PIER.z+16]].forEach(p=>spots.push(p));
  // Junto al faro
  [[L.BEACH_START_X-L.PIER.length-1,L.PIER.z+10]].forEach(p=>spots.push(p));
  spots.forEach(([x,z])=>_palmTree(x,z));
}
function _palmTree(x,z) {
  const group=new THREE.Group();
  const h=3.2+Math.random()*2.0;
  const lean=(Math.random()-0.5)*0.22;
  const trunkPoints=[];
  for (let i=0; i<=8; i++) {
    const t=i/8;
    trunkPoints.push(new THREE.Vector3(lean*t*h*0.5,t*h+Math.sin(t*Math.PI)*0.2,0));
  }
  const curve=new THREE.CatmullRomCurve3(trunkPoints);
  const trunk=new THREE.Mesh(new THREE.TubeGeometry(curve,10,0.17,8,false),
    new THREE.MeshStandardMaterial({color:0x8a6230,roughness:0.95}));
  trunk.castShadow=true; group.add(trunk);
  const frondColors=[0x2d7030,0x358038,0x3a7832,0x2a6828];
  const tipPos=curve.getPoint(1);
  const frondCount=7+Math.floor(Math.random()*4);
  for (let i=0; i<frondCount; i++) {
    const frondGroup=new THREE.Group();
    const frondLen=1.9+Math.random()*0.9;
    const stemPoints=[];
    for (let s=0; s<=6; s++) {
      const st=s/6;
      stemPoints.push(new THREE.Vector3(st*frondLen*0.8,-st*frondLen*0.4,(Math.random()-0.5)*0.1));
    }
    const stemCurve=new THREE.CatmullRomCurve3(stemPoints);
    const frond=new THREE.Mesh(new THREE.TubeGeometry(stemCurve,6,0.03,5,false),
      new THREE.MeshStandardMaterial({color:frondColors[Math.floor(Math.random()*frondColors.length)],roughness:0.9,side:THREE.DoubleSide}));
    frondGroup.add(frond);
    for (let l=1; l<=8; l++) {
      const lt=l/8, lp=stemCurve.getPoint(lt);
      const leaf=new THREE.Mesh(new THREE.PlaneGeometry(0.08*(1-lt*0.5),0.6*(1-lt*0.3)),
        new THREE.MeshStandardMaterial({color:frondColors[Math.floor(Math.random()*frondColors.length)],roughness:0.85,side:THREE.DoubleSide}));
      leaf.position.copy(lp); leaf.rotation.z=Math.PI/6; frondGroup.add(leaf);
    }
    frondGroup.position.copy(tipPos);
    frondGroup.rotation.y=(i/frondCount)*Math.PI*2;
    frondGroup.rotation.z=0.38+Math.random()*0.22;
    frondGroup.castShadow=true; group.add(frondGroup);
  }
  if (Math.random()>0.35) {
    const nutMat=new THREE.MeshStandardMaterial({color:0x5a3a10,roughness:0.9});
    for (let n=0; n<3; n++) {
      const ang=(n/3)*Math.PI*2;
      const nut=new THREE.Mesh(new THREE.SphereGeometry(0.15,8,8),nutMat);
      nut.position.set(tipPos.x+Math.cos(ang)*0.38,tipPos.y-0.32,Math.sin(ang)*0.38);
      group.add(nut);
    }
  }
  group.position.set(x,0,z); scene.add(group);
}

// ─── Vegetación ───────────────────────────────────────────────────────────────
function _buildVegetation() {
  const bushColors=[0x6a7a42,0x7c8550,0x596a3a,0x8a8a5a,0x758040];
  for (let z=L.WORLD_Z_MIN+6; z<=L.WORLD_Z_MAX-6; z+=8) {
    [[L.GARDEN_END_X-1,z],[L.BEACH_END_X+1.5,z+3.5]].forEach(([x,bz])=>{
      const color=bushColors[Math.floor(Math.random()*bushColors.length)];
      const bushMat=new THREE.MeshStandardMaterial({color,roughness:0.95});
      const size=0.5+Math.random()*0.9;
      for (let p=0; p<2+Math.floor(Math.random()*3); p++) {
        const bush=new THREE.Mesh(new THREE.SphereGeometry(size,8,8),bushMat);
        bush.position.set(x+(Math.random()-0.5)*0.9,size*0.6,bz+(Math.random()-0.5)*0.9);
        bush.scale.set(1,0.75,1); bush.castShadow=true; scene.add(bush);
      }
    });
  }
  // Pastos/matorral seco
  const tuftMat=new THREE.MeshStandardMaterial({color:0x9a9550,roughness:0.95,side:THREE.DoubleSide});
  for (let i=0; i<100; i++) {
    const tuft=new THREE.Mesh(new THREE.ConeGeometry(0.08+Math.random()*0.06,0.4+Math.random()*0.35,5),tuftMat);
    tuft.rotation.z=(Math.random()-0.5)*0.35;
    tuft.position.set(
      L.BEACH_END_X+Math.random()*(L.INLAND_START_X-L.BEACH_END_X+32),0.22,
      L.WORLD_Z_MIN+Math.random()*(L.WORLD_Z_MAX-L.WORLD_Z_MIN));
    scene.add(tuft);
  }
}

// ─── Cactus ───────────────────────────────────────────────────────────────────
function _buildCacti() {
  const cactusMat=new THREE.MeshStandardMaterial({color:0x4a7a38,roughness:0.8});
  const positions=[
    [L.INLAND_START_X+8,-70],[L.INLAND_START_X+12,-60],[L.INLAND_START_X+18,-45],
    [L.INLAND_START_X+6, 60],[L.INLAND_START_X+14,72],[L.INLAND_START_X+22,55],
    [L.ESTANQUE.x-12,L.ESTANQUE.z+12],[L.ESTANQUE.x+10,L.ESTANQUE.z-8],
  ];
  positions.forEach(([x,z])=>{
    const h=1.5+Math.random();
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.18,h,8),cactusMat);
    trunk.position.set(x,h/2,z); trunk.castShadow=true; scene.add(trunk);
    // Brazos
    if (Math.random()>0.3) {
      [-1,1].forEach(side=>{
        const armH=h*0.4+Math.random()*0.2;
        const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.12,armH,8),cactusMat);
        arm.position.set(x+side*0.4,h*0.4+armH/2,z);
        arm.rotation.z=side*Math.PI*0.22; scene.add(arm);
        const armTop=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,0.4,8),cactusMat);
        armTop.position.set(x+side*(0.4+Math.sin(side*Math.PI*0.22)*armH*0.5),h*0.4+armH+0.2,z);
        scene.add(armTop);
      });
    }
    // Espinas decorativas (pequeños conos)
    for (let i=0; i<5; i++) {
      const spine=new THREE.Mesh(new THREE.ConeGeometry(0.015,0.12,4),
        new THREE.MeshStandardMaterial({color:0xddcc88,roughness:0.5}));
      const ang=Math.random()*Math.PI*2, hh=Math.random()*h;
      spine.position.set(x+Math.cos(ang)*0.18,hh,z+Math.sin(ang)*0.18);
      spine.rotation.z=Math.PI/2+ang; scene.add(spine);
    }
  });
}

// ─── Rocas ────────────────────────────────────────────────────────────────────
function _buildRocks() {
  const rockSpots=[];
  for (let z=L.WORLD_Z_MIN+8; z<=L.WORLD_Z_MAX-8; z+=12) {
    rockSpots.push([L.SURF_X+(Math.random()-0.5)*4,z,0.6+Math.random()*0.65]);
  }
  [[L.ESTANQUE.x+8,L.ESTANQUE.z+7,0.9],[L.ESTANQUE.x-6,L.ESTANQUE.z-5,0.75],
   [L.BEACH_START_X-5,20,0.5],[L.BEACH_START_X-8,-30,0.6]].forEach(s=>rockSpots.push(s));

  const rockMats=[0x8a8278,0x7a7068,0x6a6258].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:0.95}));
  rockSpots.forEach(([x,z,s])=>{
    const geo=new THREE.DodecahedronGeometry(s,0);
    const pos=geo.attributes.position;
    for (let i=0; i<pos.count; i++) {
      pos.setX(i,pos.getX(i)*(0.8+Math.random()*0.4));
      pos.setY(i,pos.getY(i)*(0.55+Math.random()*0.3));
      pos.setZ(i,pos.getZ(i)*(0.8+Math.random()*0.4));
    }
    geo.computeVertexNormals();
    const rock=new THREE.Mesh(geo,rockMats[Math.floor(Math.random()*rockMats.length)]);
    rock.position.set(x,s*0.38,z);
    rock.rotation.set(Math.random(),Math.random()*Math.PI*2,Math.random());
    rock.castShadow=rock.receiveShadow=true; scene.add(rock);
  });
}

// ─── Postes de luz ────────────────────────────────────────────────────────────
function _buildLampPosts() {
  const lampSpots=[];
  for (let z=L.WORLD_Z_MIN+6; z<=L.WORLD_Z_MAX-6; z+=12) {
    lampSpots.push([-L.STREET_HALF_W-0.7,z]);
    lampSpots.push([L.STREET_HALF_W+0.7,z+6]);
  }
  lampSpots.forEach(([x,z],idx)=>{
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.11,5.0,8),
      new THREE.MeshStandardMaterial({color:0x4a4e52,metalness:0.7,roughness:0.3}));
    pole.position.set(x,2.5,z); pole.castShadow=true; scene.add(pole);
    // Base del poste
    const base=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.25,0.3,8),
      new THREE.MeshStandardMaterial({color:0x3a3e42,metalness:0.5}));
    base.position.set(x,0.15,z); scene.add(base);
    const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.05,1.0,6),
      new THREE.MeshStandardMaterial({color:0x3a3e42,metalness:0.7}));
    arm.rotation.z=-Math.PI/5; arm.position.set(x+0.4,5.1,z); scene.add(arm);
    const lampMat=new THREE.MeshStandardMaterial({color:0xfff0a0,emissive:0xffcc44,emissiveIntensity:isNight?3.0:0.0,roughness:0.2});
    const lamp=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.38,0.32,8),lampMat);
    lamp.position.set(x+0.65,5.18,z);
    lamp.userData.isLamp=true; lamp.userData.lampIdx=idx; scene.add(lamp);
    // Reflector cónico bajo la lámpara
    const reflector=new THREE.Mesh(new THREE.ConeGeometry(0.28,0.2,8,1,true),
      new THREE.MeshStandardMaterial({color:0x888888,metalness:0.6,roughness:0.3,side:THREE.BackSide}));
    reflector.position.set(x+0.65,5.04,z); scene.add(reflector);
  });
}

// ─── Vehículos ────────────────────────────────────────────────────────────────
function _buildVehicles() {
  _buildCar(L.CASA_PRINCIPAL.x-6,L.CASA_PRINCIPAL.z+2,0xc0392b,false);
  _buildCar(L.HOUSE_SIDE_X.east+5,L.HOUSE_ROWS_Z[0]-3,0x3466aa,false);
  _buildCar(L.PARKING.x-4,L.PARKING.z,0x4a7a35,true);
  _buildCar(L.PARKING.x+4,L.PARKING.z+3,0xcccccc,false);
  _buildCar(L.PARKING.x-6,L.PARKING.z-4,0x882222,false);
}
function _buildCar(x,z,color,isTruck) {
  const group=new THREE.Group();
  const bodyMat=new THREE.MeshStandardMaterial({color,metalness:0.48,roughness:0.28});
  const bodyW=isTruck?2.8:2.0, bodyD=isTruck?1.45:1.1;
  const body=new THREE.Mesh(new THREE.BoxGeometry(bodyW,0.72,bodyD),bodyMat);
  body.position.y=0.55; body.castShadow=true; group.add(body);
  const cabin=new THREE.Mesh(new THREE.BoxGeometry(isTruck?1.0:1.2,0.46,bodyD*0.9),
    new THREE.MeshStandardMaterial({color,metalness:0.42,roughness:0.33}));
  cabin.position.set(isTruck?-0.7:0,1.14,0); cabin.castShadow=true; group.add(cabin);
  const winMat=new THREE.MeshStandardMaterial({color:0x223344,transparent:true,opacity:0.7,metalness:0.3,roughness:0.1});
  const frontWin=new THREE.Mesh(new THREE.PlaneGeometry(isTruck?0.88:1.05,0.34),winMat);
  frontWin.rotation.y=Math.PI; frontWin.position.set(isTruck?-0.7:0,1.12,bodyD*0.455+0.01); group.add(frontWin);
  const wheelMat=new THREE.MeshStandardMaterial({color:0x1a1a1a,roughness:0.8});
  const rimMat=new THREE.MeshStandardMaterial({color:0xcccccc,metalness:0.82,roughness:0.18});
  [[-0.75,-0.45],[0.75,-0.45],[-0.75,0.45],[0.75,0.45]].forEach(([wx,wz])=>{
    const tire=new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.28,0.2,16),wheelMat);
    tire.rotation.x=Math.PI/2; tire.position.set(wx*(isTruck?1.15:0.95),0.28,wz); group.add(tire);
    const rim=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.17,0.22,10),rimMat);
    rim.rotation.x=Math.PI/2; rim.position.copy(tire.position); group.add(rim);
  });
  const lightMat=new THREE.MeshStandardMaterial({color:0xffffdd,emissive:0xffffaa,emissiveIntensity:0.3});
  [-0.35,0.35].forEach(lx=>{
    const l=new THREE.Mesh(new THREE.CircleGeometry(0.1,10),lightMat);
    l.position.set(lx,0.6,bodyD*0.5+0.01); group.add(l);
  });
  if (isTruck) {
    const wt=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,1.9,18),
      new THREE.MeshStandardMaterial({color:0x224466,metalness:0.42,roughness:0.38}));
    wt.rotation.z=Math.PI/2; wt.position.set(0.4,1.22,0); group.add(wt);
    _label(group,'Aljibe',0,2.3,0);
  }
  group.position.set(x,0,z);
  group.rotation.y=isTruck?Math.PI/2:Math.PI*1.5;
  scene.add(group);
}

// ─── Helper: casa detallada ───────────────────────────────────────────────────
function _buildDetailedHouse({w,h,d,wallColor,roofColor,accentColor,hasTerrace,label}) {
  const group=new THREE.Group();
  const wallMat=new THREE.MeshStandardMaterial({color:wallColor,roughness:0.85,metalness:0.0});
  const roofMat=new THREE.MeshStandardMaterial({color:roofColor,roughness:0.78,metalness:0.05});
  const winMat=new THREE.MeshStandardMaterial({color:0x3d6888,transparent:true,opacity:0.82,metalness:0.4,roughness:0.1,emissive:0x1a2e3a,emissiveIntensity:0.15});
  const frameMat=new THREE.MeshStandardMaterial({color:0xfefefe,roughness:0.7});

  const walls=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),wallMat);
  walls.position.y=h/2; walls.castShadow=walls.receiveShadow=true; group.add(walls);

  const plinth=new THREE.Mesh(new THREE.BoxGeometry(w+0.32,0.28,d+0.32),
    new THREE.MeshStandardMaterial({color:0xb0a890,roughness:0.9}));
  plinth.position.y=0.14; group.add(plinth);

  // Techo con cumbrera
  const roofW=Math.max(w,d)*0.78;
  const roofH=h*0.58;
  const roof=new THREE.Mesh(new THREE.ConeGeometry(roofW,roofH,4),roofMat);
  roof.rotation.y=Math.PI/4; roof.position.y=h+roofH*0.5;
  roof.castShadow=true; group.add(roof);

  const overhang=new THREE.Mesh(new THREE.BoxGeometry(w+0.7,0.14,d+0.7),
    new THREE.MeshStandardMaterial({color:roofColor,roughness:0.8}));
  overhang.position.y=h+0.06; group.add(overhang);

  // Ventanas con marco
  const winSize=Math.min(0.75,h*0.22);
  const winPositions=w>4
    ?[[-w*0.28,h*0.56],[w*0.28,h*0.56],[-w*0.28,h*0.24],[w*0.28,h*0.24]]
    :[[-w*0.22,h*0.56],[w*0.22,h*0.56]];
  winPositions.forEach(([wx,wy])=>{
    const frame=new THREE.Mesh(new THREE.BoxGeometry(winSize*1.25,winSize*1.25,0.09),frameMat);
    frame.position.set(wx,wy,d/2+0.045); group.add(frame);
    const win=new THREE.Mesh(new THREE.PlaneGeometry(winSize,winSize),winMat);
    win.position.set(wx,wy,d/2+0.1); group.add(win);
    // Cruz de ventana
    const crossH=new THREE.Mesh(new THREE.BoxGeometry(winSize,0.04,0.01),frameMat);
    crossH.position.set(wx,wy,d/2+0.1); group.add(crossH);
    const crossV=new THREE.Mesh(new THREE.BoxGeometry(0.04,winSize,0.01),frameMat);
    crossV.position.set(wx,wy,d/2+0.1); group.add(crossV);
  });

  // Puerta con dintel
  const door=new THREE.Mesh(new THREE.BoxGeometry(w*0.23,h*0.46,0.09),
    new THREE.MeshStandardMaterial({color:accentColor||0x6a4520,roughness:0.58}));
  door.position.set(0,h*0.23,d/2+0.045); group.add(door);
  const doorFrame=new THREE.Mesh(new THREE.BoxGeometry(w*0.28,h*0.5,0.06),frameMat);
  doorFrame.position.set(0,h*0.25,d/2+0.02); group.add(doorFrame);
  const knob=new THREE.Mesh(new THREE.SphereGeometry(0.06,8,8),
    new THREE.MeshStandardMaterial({color:0xd4aa40,metalness:0.9,roughness:0.1}));
  knob.position.set(w*0.09,h*0.24,d/2+0.11); group.add(knob);

  // Chimenea
  if (Math.random()>0.35) {
    const chimney=new THREE.Mesh(new THREE.BoxGeometry(0.38,h*0.52,0.38),
      new THREE.MeshStandardMaterial({color:0x8a6050,roughness:0.9}));
    chimney.position.set(w*0.25,h+h*0.26,0); chimney.castShadow=true; group.add(chimney);
    const chimneyTop=new THREE.Mesh(new THREE.BoxGeometry(0.48,0.12,0.48),
      new THREE.MeshStandardMaterial({color:0x6a4840,roughness:0.85}));
    chimneyTop.position.set(w*0.25,h+h*0.52+0.06,0); group.add(chimneyTop);
  }

  // Terraza
  if (hasTerrace) {
    const terrace=new THREE.Mesh(new THREE.BoxGeometry(w+2,0.16,2.6),
      new THREE.MeshStandardMaterial({color:0xd8cdb0,roughness:0.9}));
    terrace.position.set(0,0.08,d/2+1.3); group.add(terrace);
    const rMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.7});
    [-w/2-0.85,w/2+0.85].forEach(rx=>{
      const rail=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.72,2.6),rMat);
      rail.position.set(rx,0.44,d/2+1.3); group.add(rail);
    });
    const frontRail=new THREE.Mesh(new THREE.BoxGeometry(w+2,0.09,0.09),rMat);
    frontRail.position.set(0,0.76,d/2+2.6); group.add(frontRail);
    // Mesa de terraza
    const tableTop=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,0.05,10),
      new THREE.MeshStandardMaterial({color:0xd0c090,roughness:0.7}));
    tableTop.position.set(-0.5,0.7,d/2+1.3); group.add(tableTop);
  }

  if (label) _label(group,label,0,h+roofH+1.3,0);
  return group;
}

function _label(parent,text,x,y,z) {
  const canvas=document.createElement('canvas');
  canvas.width=512; canvas.height=96;
  const ctx=canvas.getContext('2d');
  ctx.font='bold 34px Arial';
  const tw=ctx.measureText(text).width;
  const padX=20, padY=10;
  const bw=Math.min(500,tw+padX*2), bx=(512-bw)/2;
  ctx.fillStyle='rgba(8,18,28,0.82)';
  _canvasRoundRect(ctx,bx,padY,bw,76,12); ctx.fill();
  ctx.fillStyle='#e8f4ff'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=4;
  ctx.fillText(text,256,48);
  const tex=new THREE.CanvasTexture(canvas);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
  const scale=Math.max(4.5,text.length*0.3);
  sprite.scale.set(scale,scale*(96/512),1);
  sprite.position.set(x,y,z); sprite.renderOrder=10;
  parent.add(sprite);
}
function _canvasRoundRect(ctx,x,y,w,h,r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}

// ─── Rig de efectos de fuga ───────────────────────────────────────────────────
function _buildLeakEffectsRig() {
  pitGroup=new THREE.Group(); pitGroup.visible=false;
  const hole=new THREE.Mesh(new THREE.CylinderGeometry(1.1,0.9,0.5,20),
    new THREE.MeshStandardMaterial({color:0x14100c,roughness:1.0}));
  hole.position.y=-0.22; pitGroup.add(hole);
  const dirtMat=new THREE.MeshStandardMaterial({color:0x5a4326,roughness:0.95});
  for (let i=0; i<12; i++) {
    const clod=new THREE.Mesh(new THREE.DodecahedronGeometry(0.18+Math.random()*0.22,0),dirtMat);
    const ang=(i/12)*Math.PI*2, r=1.4+Math.random()*0.5;
    clod.position.set(Math.cos(ang)*r,0.05+Math.random()*0.15,Math.sin(ang)*r);
    clod.rotation.set(Math.random(),Math.random(),Math.random()); pitGroup.add(clod);
  }
  const cone=new THREE.Mesh(new THREE.ConeGeometry(0.28,0.6,10),
    new THREE.MeshStandardMaterial({color:0xff6a1a,roughness:0.7}));
  cone.position.set(1.6,0.3,1.0); pitGroup.add(cone);
  const coneStripe=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.24,0.12,10),
    new THREE.MeshStandardMaterial({color:0xffffff}));
  coneStripe.position.set(1.6,0.4,1.0); pitGroup.add(coneStripe);
  // Segundo cono de seguridad
  const cone2=new THREE.Mesh(new THREE.ConeGeometry(0.28,0.6,10),
    new THREE.MeshStandardMaterial({color:0xff6a1a,roughness:0.7}));
  cone2.position.set(-1.8,0.3,-0.8); pitGroup.add(cone2);
  // Cinta de peligro entre conos
  const tapeMat=new THREE.MeshBasicMaterial({color:0xffdd00,transparent:true,opacity:0.9,side:THREE.DoubleSide});
  const tape=new THREE.Mesh(new THREE.PlaneGeometry(4.2,0.12),tapeMat);
  tape.position.set(-0.1,0.55,0.1); tape.rotation.y=0.4; pitGroup.add(tape);
  scene.add(pitGroup);

  brokenPipeGroup=new THREE.Group(); brokenPipeGroup.visible=false;
  const brokenMat=new THREE.MeshStandardMaterial({color:0x1a9070,metalness:0.35,roughness:0.5});
  const stubA=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,1.2,12),brokenMat);
  stubA.position.set(-0.7,-0.2,0); stubA.rotation.z=Math.PI/2+0.18; brokenPipeGroup.add(stubA);
  const stubB=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,1.2,12),brokenMat);
  stubB.position.set(0.7,-0.2,0); stubB.rotation.z=Math.PI/2-0.18; brokenPipeGroup.add(stubB);
  [-1,1].forEach(side=>{
    const jag=new THREE.Mesh(new THREE.DodecahedronGeometry(0.22,0),brokenMat);
    jag.position.set(side*0.05,-0.05,0); brokenPipeGroup.add(jag);
  });
  scene.add(brokenPipeGroup);

  sprayGroup=new THREE.Group(); sprayGroup.visible=false; scene.add(sprayGroup);
  const sprayMat=new THREE.MeshBasicMaterial({color:0xbfe9ff,transparent:true,opacity:0.85});
  for (let i=0; i<50; i++) {
    const drop=new THREE.Mesh(new THREE.SphereGeometry(0.06+Math.random()*0.05,6,6),sprayMat.clone());
    drop.visible=false; sprayGroup.add(drop);
    sprayParticles.push({mesh:drop,vel:new THREE.Vector3(),life:0,maxLife:1});
  }
}

export function setActiveLeakPosition(pos, severity=1) {
  activeLeakPos=pos.clone?pos.clone():new THREE.Vector3(pos.x,pos.y,pos.z);
  mainValveClosed=true;
  pitGroup.position.set(activeLeakPos.x,0,activeLeakPos.z); pitGroup.visible=true;
  brokenPipeGroup.position.set(activeLeakPos.x,0.34,activeLeakPos.z); brokenPipeGroup.visible=true;
  sprayGroup.position.set(activeLeakPos.x,0.3,activeLeakPos.z); sprayGroup.visible=true;
  sprayParticles.forEach(p=>{p.life=Math.random()*0.4;});
  sprayGroup.userData.intensity=severity;
}
export function clearActiveLeakPosition() {
  activeLeakPos=null; mainValveClosed=false;
  pitGroup.visible=false; brokenPipeGroup.visible=false; sprayGroup.visible=false;
  sprayParticles.forEach(p=>{p.mesh.visible=false; p.life=0;});
}
function _updateSpray() {
  if (!sprayGroup.visible) return;
  const intensity=sprayGroup.userData.intensity||1;
  sprayParticles.forEach(p=>{
    p.life-=0.016;
    if (p.life<=0) {
      p.mesh.position.set((Math.random()-0.5)*0.1,0,(Math.random()-0.5)*0.1);
      const ang=Math.random()*Math.PI*2, spread=0.6+intensity*0.55;
      p.vel.set(Math.cos(ang)*spread*Math.random(),3.4+intensity*1.4+Math.random()*1.6,Math.sin(ang)*spread*Math.random());
      p.maxLife=0.7+Math.random()*0.55; p.life=p.maxLife; p.mesh.visible=true;
    }
    p.vel.y-=0.16; p.mesh.position.addScaledVector(p.vel,0.016);
    p.mesh.material.opacity=Math.max(0,p.life/p.maxLife)*0.85;
    if (p.mesh.position.y<-0.3){p.life=0; p.mesh.visible=false;}
  });
}

// ─── Cuadrilla de reparación ──────────────────────────────────────────────────
function _buildRepairTechs() {
  repairBaseGroup=new THREE.Group();
  repairBaseGroup.position.set(L.REPAIR_BASE.x,0,L.REPAIR_BASE.z);
  scene.add(repairBaseGroup);
  const truck=new THREE.Group();
  const tBody=new THREE.Mesh(new THREE.BoxGeometry(2.7,1.15,1.55),
    new THREE.MeshStandardMaterial({color:0xffcc33,metalness:0.32,roughness:0.48}));
  tBody.position.y=0.78; tBody.castShadow=true; truck.add(tBody);
  const tCab=new THREE.Mesh(new THREE.BoxGeometry(1.05,0.72,1.44),
    new THREE.MeshStandardMaterial({color:0xffcc33,metalness:0.32,roughness:0.48}));
  tCab.position.set(-1.12,1.05,0); truck.add(tCab);
  const wheelMat=new THREE.MeshStandardMaterial({color:0x1a1a1a,roughness:0.85});
  [[-1.1,-0.56],[-1.1,0.56],[0.9,-0.56],[0.9,0.56]].forEach(([x,z])=>{
    const w=new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.32,0.24,14),wheelMat);
    w.rotation.x=Math.PI/2; w.position.set(x,0.32,z); truck.add(w);
  });
  const beacon=new THREE.Mesh(new THREE.SphereGeometry(0.19,10,10),
    new THREE.MeshStandardMaterial({color:0xff6a1a,emissive:0xff5500,emissiveIntensity:0.3}));
  beacon.position.set(-0.3,1.44,0);
  beacon.userData.isBeacon=true; beacon.userData.beaconPhase=0;
  const beaconLight=new THREE.PointLight(0xff6a1a,0,7);
  beaconLight.position.copy(beacon.position);
  beacon.userData.light=beaconLight;
  truck.add(beacon); truck.add(beaconLight);
  truck.visible=false; scene.add(truck); repairTruck=truck;
  for (let i=0; i<4; i++) repairTechs.push(_makeTech(i));
}
function _makeTech(idx) {
  const group=new THREE.Group();
  const skinMat=new THREE.MeshStandardMaterial({color:0xd8a878,roughness:0.7});
  const overallMat=new THREE.MeshStandardMaterial({color:0xff8c1a,roughness:0.8});
  const helmetMat=new THREE.MeshStandardMaterial({color:0xffe066,roughness:0.4,metalness:0.2});
  const body=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.21,0.68,8),overallMat);
  body.position.y=0.64; group.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.14,10,10),skinMat);
  head.position.y=1.05; group.add(head);
  const helmet=new THREE.Mesh(new THREE.SphereGeometry(0.18,10,10,0,Math.PI*2,0,Math.PI/1.8),helmetMat);
  helmet.position.y=1.08; group.add(helmet);
  const armL=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.5,6),overallMat);
  armL.position.set(-0.21,0.62,0); armL.rotation.z=0.3; group.add(armL);
  const armR=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.5,6),overallMat);
  armR.position.set(0.21,0.62,0); armR.rotation.z=-0.4;
  armR.userData.isToolArm=true; group.add(armR);
  const tool=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.32,0.06),
    new THREE.MeshStandardMaterial({color:0x888888,metalness:0.7}));
  tool.position.set(0.33,0.44,0); group.add(tool);
  const legMat=new THREE.MeshStandardMaterial({color:0x2a3a4a,roughness:0.8});
  [-0.07,0.07].forEach(lx=>{
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.055,0.56,6),legMat);
    leg.position.set(lx,0.16,0); group.add(leg);
  });
  group.visible=false; group.userData.armR=armR; scene.add(group);
  return {group,state:'idle',t:0,from:new THREE.Vector3(),to:new THREE.Vector3(),
    spawnOffset:new THREE.Vector3((idx%2===0?-1:1)*(0.65+idx*0.32),0,(idx<2?-1:1)*0.65)};
}

export function dispatchRepairTech(pos, severity=1) {
  const count=Math.min(repairTechs.length,Math.max(1,severity));
  const target=pos.clone?pos.clone():new THREE.Vector3(pos.x,pos.y,pos.z);
  const base=new THREE.Vector3(L.REPAIR_BASE.x,0,L.REPAIR_BASE.z);
  repairTruck.visible=true;
  repairTruck.userData.state='moving';
  repairTruck.userData.from=repairTruck.userData.arrived?repairTruck.position.clone():base.clone();
  repairTruck.userData.to=target.clone().add(new THREE.Vector3(2.2,0,1.4));
  repairTruck.userData.t=0;
  repairTruck.position.copy(repairTruck.userData.from);
  repairTruck.lookAt(repairTruck.userData.to.x,0,repairTruck.userData.to.z);
  for (let i=0; i<count; i++) {
    const tech=repairTechs[i];
    tech.group.visible=true; tech.state='moving'; tech.t=0;
    tech.from=tech.group.userData.arrived?tech.group.position.clone():base.clone().add(tech.spawnOffset);
    tech.to=target.clone().add(tech.spawnOffset.clone().multiplyScalar(0.7));
    tech.group.position.copy(tech.from);
  }
  for (let i=count; i<repairTechs.length; i++) {
    repairTechs[i].group.visible=false; repairTechs[i].state='idle';
  }
}
export function recallRepairTech() {
  const base=new THREE.Vector3(L.REPAIR_BASE.x,0,L.REPAIR_BASE.z);
  if (repairTruck.visible) {
    repairTruck.userData.state='returning';
    repairTruck.userData.from=repairTruck.position.clone();
    repairTruck.userData.to=base.clone(); repairTruck.userData.t=0;
  }
  repairTechs.forEach(tech=>{
    if (!tech.group.visible) return;
    tech.state='returning'; tech.from=tech.group.position.clone();
    tech.to=base.clone().add(tech.spawnOffset); tech.t=0;
  });
}
function _updateRepairTechs(t, dt) {
  const speed=0.44;
  if (repairTruck&&repairTruck.visible) {
    const ud=repairTruck.userData;
    if (ud.state==='moving'||ud.state==='returning') {
      ud.t=Math.min(1,(ud.t||0)+dt*speed);
      repairTruck.position.lerpVectors(ud.from,ud.to,_ease(ud.t));
      if (ud.t>=1) {
        if (ud.state==='returning'){repairTruck.visible=false; ud.arrived=false;}
        else {ud.state='working'; ud.arrived=true;}
      }
    }
  }
  repairTechs.forEach(tech=>{
    if (!tech.group.visible) return;
    if (tech.state==='moving'||tech.state==='returning') {
      tech.t=Math.min(1,tech.t+dt*speed);
      tech.group.position.lerpVectors(tech.from,tech.to,_ease(tech.t));
      const dir=new THREE.Vector3().subVectors(tech.to,tech.from);
      if (dir.lengthSq()>0.0001) tech.group.rotation.y=Math.atan2(dir.x,dir.z);
      tech.group.position.y=Math.abs(Math.sin(t*9))*0.05;
      if (tech.t>=1) {
        if (tech.state==='returning'){tech.group.visible=false; tech.group.userData.arrived=false;}
        else {tech.state='working'; tech.group.userData.arrived=true;}
      }
    } else if (tech.state==='working') {
      const arm=tech.group.userData.armR;
      if (arm) arm.rotation.x=Math.sin(t*10)*0.6;
      tech.group.position.y=0;
    }
  });
}
function _ease(x){return x<0.5?4*x*x*x:1-Math.pow(-2*x+2,3)/2;}

// ─── Modos ────────────────────────────────────────────────────────────────────
export function toggleDayNight() {
  isNight=!isNight;
  scene.traverse(obj=>{
    if (obj.userData.isSky&&obj.material.uniforms) {
      obj.material.uniforms.uTopColor.value.set(isNight?0x020820:0x3a7bc8);
      obj.material.uniforms.uHorizonColor.value.set(isNight?0x0a1830:0x8ecce8);
    }
    if (obj.userData.isStars) obj.material.opacity=isNight?0.9:0;
    if (obj.userData.isLamp)  obj.material.emissiveIntensity=isNight?3.5:0;
  });
  if (isNight) {
    scene.fog=new THREE.FogExp2(0x060c1e,0.007);
    hemiLight.intensity=0.12; hemiLight.color.set(0x223355); hemiLight.groundColor.set(0x111122);
    sunLight.intensity=0.06; sunLight.color.set(0x3355aa);
    if (fillLight) fillLight.intensity=0.04;
    sun.visible=false; moon.visible=true;
    scene.traverse(obj=>{
      if (obj.userData.isLamp) {
        const pl=new THREE.PointLight(0xffe080,3.2,11);
        pl.position.copy(obj.position); pl.position.y+=0.5;
        pl.userData.isNightAddedLight=true; scene.add(pl);
      }
    });
  } else {
    scene.fog=new THREE.FogExp2(0xb9e6f2,0.003);
    hemiLight.intensity=1.05; hemiLight.color.set(0x9ecfea); hemiLight.groundColor.set(0xc8b870);
    sunLight.intensity=2.3; sunLight.color.set(0xfff0d0);
    if (fillLight) fillLight.intensity=0.38;
    sun.visible=true; moon.visible=false;
    const toRemove=[];
    scene.traverse(obj=>{if (obj.userData.isNightAddedLight) toRemove.push(obj);});
    toRemove.forEach(obj=>scene.remove(obj));
  }
  return isNight;
}
export function toggleXray() {
  isXray=!isXray;
  [sandMat,dunesMat,earthMat].forEach(m=>{
    if (!m) return; m.transparent=isXray; m.opacity=isXray?0.28:1;
  });
  if (isXray) pipeGroup.visible=true;
  return isXray;
}
export function toggleCleanView() {
  isClean=!isClean;
  document.body.classList.toggle('clean-mode',isClean);
  return isClean;
}
export function togglePipes() {
  pipesVisible=!pipesVisible;
  pipeGroup.visible=pipesVisible||isXray;
  return pipesVisible;
}

// ─── Wiring UI ────────────────────────────────────────────────────────────────
function _wireUI() {
  const btnDayNight=document.getElementById('btn-daynight');
  const btnXray=document.getElementById('btn-xray');
  const btnClean=document.getElementById('btn-clean');
  const btnPipes=document.getElementById('btn-pipes');
  if (btnDayNight) btnDayNight.addEventListener('click',()=>{
    const night=toggleDayNight();
    btnDayNight.innerHTML=night?'<span class="cam-icon">☀️</span> Modo Día':'<span class="cam-icon">🌙</span> Modo Noche';
  });
  if (btnXray) btnXray.addEventListener('click',()=>btnXray.classList.toggle('active',toggleXray()));
  if (btnClean) btnClean.addEventListener('click',()=>btnClean.classList.toggle('active',toggleCleanView()));
  if (btnPipes) btnPipes.addEventListener('click',()=>{
    const visible=togglePipes();
    btnPipes.classList.toggle('active',visible);
    btnPipes.innerHTML=visible?'<span class="cam-icon">📐</span> Ocultar Red de Tuberías':'<span class="cam-icon">📐</span> Mostrar Red de Tuberías';
  });
  window.addEventListener('leaks:nightMode',()=>{
    const night=toggleDayNight();
    if (btnDayNight) {
      btnDayNight.classList.toggle('active',night);
      btnDayNight.innerHTML=night?'<span class="cam-icon">☀️</span> Modo Día':'<span class="cam-icon">🌙</span> Modo Noche';
    }
  });
}

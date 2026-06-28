// ════════════════════════════════════════════════════════════════════════════
// LAYOUT.js — Única fuente de verdad para las coordenadas de la maqueta.
//
// Orientación: el mar queda al COSTADO (oeste, X negativo). La costa corre en
// el eje Z. La calle principal corre en Z, centrada en X=0.
//
//   X < OCEAN_X            mar profundo
//   OCEAN_X..BEACH_START_X transición mar→arena (rompiente, espuma)
//   BEACH_START_X..BEACH_END_X   arena de playa
//   BEACH_END_X..GARDEN_END_X    duna/jardín de transición
//   -STREET_HALF_W..STREET_HALF_W  calle principal (vehicular)
//   INLAND_START_X en adelante      tierra adentro: casas, estanque, planta no,
//                                   parking, sala de máquinas
//
// IMPORTANTE: scene.js, leaks.js y controls.js DEBEN importar estos valores
// (import * as L from './layout.js') en vez de hardcodear sus propias
// coordenadas. Antes no era así (scene.js tenía sus propias coordenadas
// desconectadas de este archivo) y por eso la maqueta se veía desordenada y
// las cámaras de controls.js apuntaban a vacío. Si agregas un edificio nuevo,
// agrégalo aquí primero.
// ════════════════════════════════════════════════════════════════════════════

export const OCEAN_X        = -76;  // x < esto: mar profundo / horizonte
export const SURF_X         = -58;  // banda de rompiente / espuma de olas
export const BEACH_START_X  = -54;  // arena seca empieza
export const BEACH_END_X    = -30;  // arena termina
export const GARDEN_END_X   = -4;   // fin de duna/jardín, empieza la calle
export const STREET_HALF_W  = 3;    // calle: -3..3
export const INLAND_START_X = 4;

export const WORLD_Z_MIN = -90;
export const WORLD_Z_MAX = 90;

// ─── Filas de cabañas ─────────────────────────────────────────────────────────
// Una fila = 2 cabañas, una al lado playa (west) y otra tierra adentro (east),
// ambas mirando hacia la calle central. Antes estaban metidas casi en la
// calle y muy lejos de la arena; ahora el lado "west" queda pegado al borde
// del jardín/duna, mucho más cerca de la playa.
export const HOUSE_ROWS_Z  = [-27, -13.5, 0, 13.5, 27];
export const HOUSE_SIDE_X  = { west: -14, east: 14 };
const CABANA_DIMS = { w: 3.6, d: 3.4, h: 2.8 };

const ROOF_PALETTE = [0x2a5e42, 0x3a5a7a, 0x6a3a2a, 0x4a4a55, 0x6a4a78];
const WALL_PALETTE = [0xf7f1e3, 0xeee8d8, 0xf0ece0, 0xf4ecdc];

export const HOUSES = HOUSE_ROWS_Z.flatMap((z, rowIdx) => ([
  {
    id: `cabana-w-${rowIdx}`, kind: 'cabana', side: 'west', sector: 'B',
    x: HOUSE_SIDE_X.west, z, ...CABANA_DIMS,
    wallColor: WALL_PALETTE[rowIdx % WALL_PALETTE.length],
    roofColor: ROOF_PALETTE[rowIdx % ROOF_PALETTE.length],
    label: rowIdx === 0 ? 'Cabañas — Lado Playa' : null,
  },
  {
    id: `cabana-e-${rowIdx}`, kind: 'cabana', side: 'east', sector: 'C',
    x: HOUSE_SIDE_X.east, z, ...CABANA_DIMS,
    wallColor: WALL_PALETTE[(rowIdx + 2) % WALL_PALETTE.length],
    roofColor: ROOF_PALETTE[(rowIdx + 1) % ROOF_PALETTE.length],
    label: rowIdx === 0 ? 'Cabañas — Lado Tierra' : null,
  },
]));

export const CASA_PRINCIPAL = { x: 16, z: -50, w: 7,   d: 5.5, h: 4.5, sector: 'D' };
export const SALA_MAQUINAS  = { x: 24, z: -50, w: 5,   d: 4.5, h: 3.5, sector: 'D' };
export const ESTANQUE       = { x: 30, z: 4,           sector: 'D' };   // cerro + estanque
export const PLANTA_DESAL   = { x: -46, z: 50,         sector: 'A' };   // junto a la playa, sur
export const PARKING        = { x: 22, z: 46 };
export const PIER           = { x: BEACH_START_X, z: -56, length: 30 }; // sale desde la playa hacia el mar
export const REPAIR_BASE    = { x: 22, z: 36 };                         // base de cuadrilla, junto al parking

// ─── Colector principal ──────────────────────────────────────────────────────
export const COLLECTOR_X     = 0;
export const COLLECTOR_Z_MIN = -56;
export const COLLECTOR_Z_MAX = 56;
const PIPE_Y = 0.28;

// ─── Red de tuberías derivada ─────────────────────────────────────────────────
// Único lugar donde se calculan los tramos de tubería. scene.js los dibuja,
// leaks.js usa los mismos nodos como puntos de fuga posibles y sensores —
// así garantizamos que la tubería SIEMPRE llega exactamente a cada casa, sin
// duplicar coordenadas a mano en cada archivo.
export function getPipeNetwork() {
  const segments = [];
  const leakPoints = [];
  const sensorPoints = [];

  const tankNode      = { x: ESTANQUE.x, y: PIPE_Y, z: ESTANQUE.z };
  const collectorAtTk = { x: COLLECTOR_X, y: PIPE_Y, z: ESTANQUE.z };
  segments.push([tankNode, collectorAtTk]);
  leakPoints.push({ pos: collectorAtTk, label: 'Salida del estanque', sector: 'D' });
  sensorPoints.push({ id: 'S01', label: 'Salida estanque', pos: collectorAtTk, sector: 'D', basePressure: 4.8 });

  // Colector principal corriendo en Z
  segments.push([
    { x: COLLECTOR_X, y: PIPE_Y, z: COLLECTOR_Z_MIN },
    { x: COLLECTOR_X, y: PIPE_Y, z: COLLECTOR_Z_MAX },
  ]);
  leakPoints.push({ pos: { x: COLLECTOR_X, y: PIPE_Y, z: 0 }, label: 'Colector central', sector: 'A' });
  sensorPoints.push({ id: 'S02', label: 'Colector central', pos: { x: COLLECTOR_X, y: PIPE_Y, z: 0 }, sector: 'A', basePressure: 4.2 });

  // Planta desaladora -> colector
  const plantOut  = { x: PLANTA_DESAL.x + 6, y: PIPE_Y, z: PLANTA_DESAL.z };
  const plantStub = { x: COLLECTOR_X, y: PIPE_Y, z: PLANTA_DESAL.z };
  segments.push([plantOut, plantStub]);
  leakPoints.push({ pos: plantStub, label: 'Salida planta desaladora', sector: 'A' });
  sensorPoints.push({ id: 'S03', label: 'Entrada planta', pos: plantOut, sector: 'A', basePressure: 6.0 });

  // Casa principal y sala de máquinas
  const casaStub = { x: CASA_PRINCIPAL.x - CASA_PRINCIPAL.w / 2 - 0.4, y: PIPE_Y, z: CASA_PRINCIPAL.z };
  segments.push([{ x: COLLECTOR_X, y: PIPE_Y, z: CASA_PRINCIPAL.z }, casaStub]);
  leakPoints.push({ pos: casaStub, label: 'Acometida Casa Principal', sector: 'D' });
  sensorPoints.push({ id: 'S04', label: 'Casa principal', pos: casaStub, sector: 'D', basePressure: 4.3 });

  const salaStub = { x: SALA_MAQUINAS.x - SALA_MAQUINAS.w / 2 - 0.4, y: PIPE_Y, z: SALA_MAQUINAS.z };
  segments.push([{ x: COLLECTOR_X, y: PIPE_Y, z: SALA_MAQUINAS.z }, salaStub]);
  leakPoints.push({ pos: salaStub, label: 'Acometida Sala de Máquinas', sector: 'D' });

  // Ramales a cada cabaña — SIEMPRE llegan hasta la fachada real de la casa
  let sIdx = 5;
  HOUSES.forEach(h => {
    const stop = h.x + (h.side === 'west' ? (h.w / 2 + 0.4) : -(h.w / 2 + 0.4));
    const node = { x: stop, y: PIPE_Y, z: h.z };
    segments.push([{ x: COLLECTOR_X, y: PIPE_Y, z: h.z }, node]);
    leakPoints.push({ pos: node, label: `Acometida ${h.id}`, sector: h.sector });
    if (sIdx <= 9) {
      sensorPoints.push({
        id: `S0${sIdx}`, label: `Ramal ${h.side === 'west' ? 'playa' : 'tierra'} z${h.z}`,
        pos: node, sector: h.sector, basePressure: 3.7 + Math.random() * 0.5,
      });
      sIdx++;
    }
  });

  return { segments, leakPoints, sensorPoints, tankNode };
}

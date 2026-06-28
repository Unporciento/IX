// ════════════════════════════════════════════════════════════════════════════
// LAYOUT.js — Única fuente de verdad para las coordenadas de la maqueta.
//
// Orientación: el mar queda al COSTADO OESTE (X negativo), paralelo al eje Z.
// La calle principal corre en el eje Z, centrada en x ≈ 0.
//
//   X < -78   océano
//   -78..-52  playa (arena)
//   -52..-12  jardín frente a casas (lado playa)
//   -2..2     calle principal
//    2..50    tierra adentro (casas este, estanque, parking)
// ════════════════════════════════════════════════════════════════════════════

export const OCEAN_X       = -88;
export const BEACH_CENTER_X = -58;
export const BEACH_WIDTH    = 28;
export const GARDEN_MAX_X   = -12;
export const STREET_HALF    = 2.3;
export const COAST_Z_MIN    = -42;
export const COAST_Z_MAX    = 42;

export const HOUSE_ROWS_Z = [-30, -20, -10, 0, 10, 20, 30];
export const HOUSE_SIDE_X = { west: -11, east: 11 };
export const HOUSE_DEPTH  = 4.2; // distancia fachada → acometida

export const CASA_PRINCIPAL = { x: 11, z: -30 };
export const SALA_MAQUINAS  = { x: 11, z: 38 };
export const ESTANQUE       = { x: 38, z: 0 };
export const PLANTA_DESAL   = { x: -52, z: 28 };
export const PARKING        = { x: 28, z: -28 };
export const REPAIR_BASE    = { x: 28, z: -28 };
export const PIER           = { x: -66, z: 0, length: 36 };

export const COLLECTOR_X    = 0;
export const COLLECTOR_Z_MIN = -36;
export const COLLECTOR_Z_MAX = 38;
export const PIPE_Y         = 0.28;

/** Punto de acometida frente a cada casa */
export function houseServicePoint(side, z) {
  const hx = side === 'west' ? HOUSE_SIDE_X.west : HOUSE_SIDE_X.east;
  const dir = side === 'west' ? -1 : 1;
  return { x: hx + dir * HOUSE_DEPTH, z };
}

/** Segmentos de tubería [a, b] como arrays [x,y,z] */
export function getPipeSegments() {
  const y = PIPE_Y;
  const segs = [];

  // Colector principal bajo la calle
  segs.push([[COLLECTOR_X, y, COLLECTOR_Z_MIN], [COLLECTOR_X, y, COLLECTOR_Z_MAX]]);

  // Planta desalinizadora → colector
  segs.push([[PLANTA_DESAL.x + 5.5, y, PLANTA_DESAL.z], [COLLECTOR_X, y, PLANTA_DESAL.z]]);
  segs.push([[COLLECTOR_X, y, PLANTA_DESAL.z], [COLLECTOR_X, y, COLLECTOR_Z_MIN]]);

  // Estanque en cerro → colector
  segs.push([[ESTANQUE.x, 4.2, ESTANQUE.z], [ESTANQUE.x, y, ESTANQUE.z]]);
  segs.push([[ESTANQUE.x, y, ESTANQUE.z], [COLLECTOR_X, y, ESTANQUE.z]]);

  // Ramales a cada fila de casas
  HOUSE_ROWS_Z.forEach(z => {
    segs.push([[COLLECTOR_X, y, z], [HOUSE_SIDE_X.west, y, z]]);
    segs.push([[COLLECTOR_X, y, z], [HOUSE_SIDE_X.east, y, z]]);
    const wSvc = houseServicePoint('west', z);
    const eSvc = houseServicePoint('east', z);
    segs.push([[HOUSE_SIDE_X.west, y, z], [wSvc.x, y, z]]);
    segs.push([[HOUSE_SIDE_X.east, y, z], [eSvc.x, y, z]]);
  });

  // Casa principal
  const cp = houseServicePoint('east', CASA_PRINCIPAL.z);
  segs.push([[COLLECTOR_X, y, CASA_PRINCIPAL.z], [cp.x, y, CASA_PRINCIPAL.z]]);

  return segs;
}

/** Nodos donde puede ocurrir una fuga */
export function getLeakNodes() {
  const y = PIPE_Y;
  const nodes = [
    { pos: [COLLECTOR_X, y, -10], label: 'Colector central',   sector: 'A' },
    { pos: [COLLECTOR_X, y,  10], label: 'Colector sur',     sector: 'A' },
    { pos: [COLLECTOR_X, y, PLANTA_DESAL.z], label: 'Entrada planta', sector: 'A' },
    { pos: [HOUSE_SIDE_X.west, y, -20], label: 'Ramal oeste Z-20', sector: 'B' },
    { pos: [HOUSE_SIDE_X.east, y, -20], label: 'Ramal este Z-20',  sector: 'B' },
    { pos: [HOUSE_SIDE_X.west, y,  10], label: 'Ramal oeste Z10',  sector: 'C' },
    { pos: [HOUSE_SIDE_X.east, y,  10], label: 'Ramal este Z10',   sector: 'C' },
    { pos: [houseServicePoint('east', CASA_PRINCIPAL.z).x, y, CASA_PRINCIPAL.z], label: 'Acometida casa ppal.', sector: 'D' },
    { pos: [ESTANQUE.x, y, ESTANQUE.z], label: 'Salida estanque', sector: 'D' },
  ];
  return nodes;
}

/** Posiciones de sensores */
export function getSensorDefs() {
  const y = PIPE_Y;
  return [
    { id: 'S01', label: 'Colector Z0',      pos: [COLLECTOR_X, y, 0],           pressure: 4.1, sector: 'A' },
    { id: 'S02', label: 'Entrada planta',   pos: [COLLECTOR_X, y, PLANTA_DESAL.z], pressure: 6.0, sector: 'A' },
    { id: 'S03', label: 'Estanque mont.',   pos: [ESTANQUE.x, y, ESTANQUE.z],   pressure: 4.8, sector: 'D' },
    { id: 'S04', label: 'Ramal oeste N',    pos: [HOUSE_SIDE_X.west, y, -20],   pressure: 4.0, sector: 'B' },
    { id: 'S05', label: 'Ramal este N',     pos: [HOUSE_SIDE_X.east, y, -20],   pressure: 3.9, sector: 'B' },
    { id: 'S06', label: 'Ramal oeste S',    pos: [HOUSE_SIDE_X.west, y, 10],    pressure: 3.8, sector: 'C' },
    { id: 'S07', label: 'Ramal este S',     pos: [HOUSE_SIDE_X.east, y, 10],    pressure: 3.7, sector: 'C' },
    { id: 'S08', label: 'Casa ppal.',       pos: [houseServicePoint('east', CASA_PRINCIPAL.z).x, y, CASA_PRINCIPAL.z], pressure: 4.2, sector: 'D' },
    { id: 'S09', label: 'Distribución',     pos: [COLLECTOR_X, y, -15],         pressure: 4.1, sector: 'A' },
  ];
}

/** Válvulas en la red 3D */
export function getValvePositions() {
  const y = PIPE_Y;
  return {
    V01: { pos: [COLLECTOR_X, y, PLANTA_DESAL.z], name: 'Planta → Colector', sector: 'A' },
    V02: { pos: [COLLECTOR_X, y, -15],          name: 'Colector → Norte',  sector: 'B' },
    V03: { pos: [COLLECTOR_X, y, 15],           name: 'Colector → Sur',    sector: 'C' },
    V04: { pos: [houseServicePoint('east', CASA_PRINCIPAL.z).x, y, CASA_PRINCIPAL.z], name: 'Casa principal', sector: 'D' },
    V05: { pos: [ESTANQUE.x, y, ESTANQUE.z],    name: 'Estanque → Red',    sector: 'D' },
  };
}

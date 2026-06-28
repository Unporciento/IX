// ════════════════════════════════════════════════════════════════════════════
// LAYOUT.js — Única fuente de verdad para las coordenadas de la maqueta.
//
// Orientación: el mar queda al COSTADO (oeste, X negativo), no al fondo.
// La calle principal corre en el eje Z, paralela a la línea de costa.
//
//   X < -70   océano
//   -70..-44  playa (arena)
//   -44..-2   jardín/césped frente a casas
//    -2..2    calle principal (vehicular)
//    2..45    tierra adentro (casas lado este, estanque, planta, parking)
//
// Las casas se reparten en filas perpendiculares a la calle (eje Z fijo,
// recorriendo X), mirando hacia la calle central.
// ════════════════════════════════════════════════════════════════════════════

// Filas de casitas (cada fila tiene 2 casas: una al oeste de la calle —lado
// playa— y otra al este —lado tierra—, ambas mirando hacia la calle).
export const HOUSE_ROWS_Z = [-28, -18, -8, 4, 14, 24, 34];

export const HOUSE_SIDE_X = { west: -7, east: 7 };

export const CASA_PRINCIPAL = { x: 7, z: -40 };
export const SALA_MAQUINAS  = { x: 7, z: 40 };
export const ESTANQUE       = { x: 32, z: 0 };
export const PLANTA_DESAL   = { x: -50, z: 36 };
export const PARKING        = { x: 22, z: -34 };
export const PIER = { x: -68, z: -2, length: 44 };

// Colector principal: corre bajo la calle en x=0 a lo largo de Z.
export const COLLECTOR_X = 0;
export const COLLECTOR_Z_MIN = -40;
export const COLLECTOR_Z_MAX = 40;

// Acometida a cada casa: punto donde el ramal sale del colector hacia la
// fachada de la casa (a media distancia entre la calle y la casa).
// (Cálculo real usado en scene.js: houseStopX = w_casa/2 + 0.15)

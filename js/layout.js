// ════════════════════════════════════════════════════════════════════════════
// LAYOUT.js — Única fuente de verdad para las coordenadas de la maqueta.
//
// Orientación: el mar queda al COSTADO (oeste, X negativo), no al fondo.
// La calle principal corre en el eje Z, paralela a la línea de costa.
//
//   X < -50    océano
//   -50..-32   playa (arena), pier, sombrillas
//   -32..-3    paseo costero — la fila de casas "vista al mar" vive aquí,
//              a distancia caminable real del agua (antes quedaba a 60+
//              unidades, demasiado lejos; ahora a ~20-25)
//    -3..3     calle principal (corre en Z, paralela a la costa)
//     3..45    tierra adentro: segunda fila de casas, estanque, planta, parking
//
// ════════════════════════════════════════════════════════════════════════════

export const HOUSE_ROWS_Z = [-28, -18, -8, 4, 14, 24, 34];

export const HOUSE_SIDE_X = { west: -10, east: 10 };

export const CASA_PRINCIPAL = { x: 10, z: -40 };
export const SALA_MAQUINAS  = { x: 10, z: 40 };
export const ESTANQUE       = { x: 30, z: 0 };
export const PLANTA_DESAL   = { x: -38, z: 36 }; // en la playa, junto al pier
export const PARKING        = { x: 24, z: -34 };
export const PIER           = { x: -46, z: -2, length: 30 };

// Colector principal: corre bajo la calle en x=0 a lo largo de Z.
export const COLLECTOR_X = 0;
export const COLLECTOR_Z_MIN = -40;
export const COLLECTOR_Z_MAX = 40;

// Distancia del centro de una casa (ancho 3.6) a su acometida de agua.
export const HOUSE_SERVICE_OFFSET = 3.4 / 2 + 0.15;

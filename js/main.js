import { initThree } from './scene.js';
import { simulateLeak } from './leaks.js';
import { goToView } from './controls.js';

document.addEventListener('DOMContentLoaded', () => {

  // ─── Lógica de pestañas ────────────────────────────────────────────────────
  const tabs     = document.querySelectorAll('.nav-tab');
  const sections = document.querySelectorAll('.section');
  let threeReady = false;

  tabs.forEach(tab => {
    tab.addEventListener('click', function () {
      tabs.forEach(t => t.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      this.classList.add('active');

      let targetId = 'section-comic';
      if (this.id === 'tab-3d')  targetId = 'section-3d';
      if (this.id === 'tab-cdm') targetId = 'section-cdm';

      document.getElementById(targetId).classList.add('active');

      // Inicializa Three.js solo la primera vez
      if (targetId === 'section-3d' && !threeReady) {
        threeReady = true;
        setTimeout(initThree, 100);
      }
    });
  });

  // ─── Botones de cámara ─────────────────────────────────────────────────────
  document.getElementById('btn-general').addEventListener('click', () => goToView('general'));
  document.getElementById('btn-plant').addEventListener('click',   () => goToView('plant'));
  document.getElementById('btn-network').addEventListener('click', () => goToView('network'));
  document.getElementById('btn-fuga').addEventListener('click', simulateLeak);

  // ─── Atajos de teclado globales (navegación de pestañas) ──────────────────
  document.addEventListener('keydown', e => {
    // Ignorar si el foco está en un input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Tab izquierdo/derecho con flechas (solo cuando no hay fuga activa)
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const activeTab = document.querySelector('.nav-tab.active');
      if (!activeTab) return;
      const allTabs = [...tabs];
      const idx = allTabs.indexOf(activeTab);
      const next = e.key === 'ArrowRight'
        ? allTabs[(idx + 1) % allTabs.length]
        : allTabs[(idx - 1 + allTabs.length) % allTabs.length];
      next?.click();
    }
  });

  // ─── Tooltip de atajos de teclado (aparece 2s al cargar la sección 3D) ────
  const tab3d = document.getElementById('tab-3d');
  tab3d?.addEventListener('click', () => {
    if (threeReady) return; // ya inicializado, no mostrar de nuevo
    setTimeout(() => {
      const tip = document.getElementById('canvas-tooltip');
      if (tip && tip.textContent.includes('Arrastra')) {
        // Añadir hint de teclado
        tip.textContent = 'Arrastra para rotar · Scroll para zoom · Teclas 1 2 3 para vistas';
      }
    }, 200);
  }, { once: true });

});
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

      // Mapeo de tab → sección
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
});
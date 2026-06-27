import { initThree } from './scene.js';
import { simulateLeak } from './leaks.js';
import { goToView } from './controls.js';

document.addEventListener('DOMContentLoaded', () => {
  // ─── Lógica de pestañas ────────────────────────────────────────────
  const tabs     = document.querySelectorAll('.nav-tab');
  const sections = document.querySelectorAll('.section');
  let threeReady = false;

  tabs.forEach(tab => {
    tab.addEventListener('click', function () {
      tabs.forEach(t => t.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      this.classList.add('active');

      const targetId = this.id === 'tab-comic' ? 'section-comic' : 'section-3d';
      document.getElementById(targetId).classList.add('active');

      if (targetId === 'section-3d' && !threeReady) {
        threeReady = true;
        setTimeout(initThree, 100);
      }
    });
  });

  // ─── Botones de cámara ─────────────────────────────────────────────
  //
  //  btn-general  → Vista isométrica de toda la urbanización
  //  btn-plant    → Zoom a la Planta Desalinizadora (derecha, junto al mar)
  //  btn-network  → Vista trasera enfocando la montaña + estanque + tubos
  //  btn-fuga     → Simula fuga aleatoria en la red subterránea
  //
  // (btn-daynight, btn-xray y btn-clean se conectan dentro de scene.js,
  //  ya que dependen directamente del estado de Three.js)
  //
  document.getElementById('btn-general').addEventListener('click', () => goToView('general'));
  document.getElementById('btn-plant').addEventListener('click',   () => goToView('plant'));
  document.getElementById('btn-network').addEventListener('click', () => goToView('network'));
  document.getElementById('btn-fuga').addEventListener('click', simulateLeak);
});

import { initThree }    from './scene.js';
import { simulateLeak } from './leaks.js';
import { goToView, goBack, startTour, stopTour, isTourActive } from './controls.js';

/* ═══════════════════════════════════════════════════════════════════════════
   main.js  —  Orquestador principal: pestañas, botones, atajos, onboarding
   ═══════════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  // ═══════════════════════════════════════════════════════════════════════════
  //  PESTAÑAS
  // ═══════════════════════════════════════════════════════════════════════════
  const tabs     = document.querySelectorAll('.nav-tab');
  const sections = document.querySelectorAll('.section');
  let threeReady = false;

  const TAB_MAP = {
    'tab-comic': 'section-comic',
    'tab-3d':    'section-3d',
    'tab-cdm':   'section-cdm',
  };

  function switchTab(tabId) {
    const targetId = TAB_MAP[tabId];
    if (!targetId) return;

    tabs.forEach(t => t.classList.remove('active'));
    sections.forEach(s => s.classList.remove('active'));

    document.getElementById(tabId)?.classList.add('active');
    document.getElementById(targetId)?.classList.add('active');

    // Inicializar Three.js solo la primera vez que se abre la pestaña 3D
    if (targetId === 'section-3d' && !threeReady) {
      threeReady = true;
      // Pequeño delay para que el layout se estabilice antes de crear el canvas
      setTimeout(initThree, 120);
    }

    // Actualizar URL hash para que el navegador recuerde la pestaña
    history.replaceState(null, '', `#${tabId}`);
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.id));
  });

  // Restaurar pestaña desde hash al cargar
  const hashTab = location.hash.replace('#', '');
  if (hashTab && TAB_MAP[hashTab]) {
    switchTab(hashTab);
  }

  // Navegación con flechas izquierda/derecha
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

    const allTabs = [...tabs];
    const active  = document.querySelector('.nav-tab.active');
    const idx     = allTabs.indexOf(active);
    const next    = e.key === 'ArrowRight'
      ? allTabs[(idx + 1) % allTabs.length]
      : allTabs[(idx - 1 + allTabs.length) % allTabs.length];
    next?.click();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  BOTONES DE CÁMARA
  // ═══════════════════════════════════════════════════════════════════════════
  document.getElementById('btn-general')?.addEventListener('click', () => goToView('general'));
  document.getElementById('btn-plant')?.addEventListener('click',   () => goToView('plant'));
  document.getElementById('btn-network')?.addEventListener('click', () => goToView('network'));
  document.getElementById('btn-fuga')?.addEventListener('click', simulateLeak);

  // ═══════════════════════════════════════════════════════════════════════════
  //  BOTONES EXTRA EN EL PANEL DE CÁMARA
  //  Se inyectan dinámicamente para no tocar el HTML base
  // ═══════════════════════════════════════════════════════════════════════════
  function _injectExtraCamButtons() {
    const panel = document.querySelector('.cam-panel');
    if (!panel) return;

    // ── Botón: Volver atrás ────────────────────────────────────────────────
    const btnBack = document.createElement('button');
    btnBack.id = 'btn-cam-back';
    btnBack.className = 'cam-btn';
    btnBack.style.opacity = '0.4';
    btnBack.style.marginTop = '6px';
    btnBack.innerHTML = '<span class="cam-icon">↩</span> Cámara Anterior';
    btnBack.addEventListener('click', goBack);
    panel.appendChild(btnBack);

    // ── Botón: Tour automático ─────────────────────────────────────────────
    const btnTour = document.createElement('button');
    btnTour.id = 'btn-tour';
    btnTour.className = 'cam-btn';
    btnTour.innerHTML = '<span class="cam-icon">▶</span> Tour Automático';
    btnTour.addEventListener('click', () => {
      isTourActive() ? stopTour() : startTour();
    });
    panel.appendChild(btnTour);
  }

  // Esperar a que la sección 3D esté lista para inyectar
  window.addEventListener('camera:arrived', () => {}, { once: true });
  // Inyectar siempre que se abra la sección 3D por primera vez
  document.getElementById('tab-3d')?.addEventListener('click', () => {
    setTimeout(_injectExtraCamButtons, 200);
  }, { once: true });

  // ═══════════════════════════════════════════════════════════════════════════
  //  TOOLTIP DEL CANVAS — primera visita a la sección 3D
  // ═══════════════════════════════════════════════════════════════════════════
  document.getElementById('tab-3d')?.addEventListener('click', () => {
    if (threeReady) return;
    setTimeout(() => {
      const tip = document.getElementById('canvas-tooltip');
      if (tip) {
        tip.textContent = 'Arrastra · Scroll · Teclas 1 2 3 para vistas · T para tour · ? para atajos';
        tip.style.opacity = '1';
      }
    }, 300);
  }, { once: true });

  // ═══════════════════════════════════════════════════════════════════════════
  //  ONBOARDING — primera vez que el usuario carga la página
  //  Muestra un toast suave y desaparece
  // ═══════════════════════════════════════════════════════════════════════════
  const ONBOARDING_KEY = 'plv_onboarding_seen';
  if (!sessionStorage.getItem(ONBOARDING_KEY)) {
    sessionStorage.setItem(ONBOARDING_KEY, '1');
    _showOnboardingToast();
  }

  function _showOnboardingToast() {
    const toast = document.createElement('div');
    toast.id = 'onboarding-toast';
    toast.style.cssText = `
      position:fixed; bottom:2rem; left:50%; transform:translateX(-50%);
      background:rgba(27,61,45,.95); color:#fff;
      font-family:'Crimson Pro',serif; font-size:0.95rem; line-height:1.6;
      padding:1rem 2rem; border-radius:8px; text-align:center;
      border:1px solid rgba(184,144,58,.5);
      box-shadow:0 8px 32px rgba(0,0,0,.3);
      z-index:9999; max-width:520px; width:90%;
      animation: toastIn 0.4s ease both;
    `;
    toast.innerHTML = `
      <div style="color:#ddb85a;font-family:'Playfair Display',serif;font-weight:700;font-size:1.05rem;margin-bottom:.3rem">
        Bienvenido al Sistema Hídrico 3D
      </div>
      Explora el complejo turístico Playa La Virgen · Navega las pestañas para ver el cómic,
      la maqueta interactiva y el análisis CDM
      <div style="margin-top:.6rem;font-size:.78rem;opacity:.6">Click en cualquier lugar para continuar</div>
    `;

    // Agregar keyframe si no existe
    if (!document.getElementById('toast-keyframe')) {
      const style = document.createElement('style');
      style.id = 'toast-keyframe';
      style.textContent = `
        @keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(12px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    // Desaparecer al hacer click o tras 5s
    const dismiss = () => {
      toast.style.transition = 'opacity 0.4s ease';
      toast.style.opacity    = '0';
      setTimeout(() => toast.remove(), 400);
      document.removeEventListener('click', dismiss);
    };
    setTimeout(dismiss, 5000);
    document.addEventListener('click', dismiss);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ATAJO GLOBAL: Escape cierra cualquier modal / detiene fuga
  // ═══════════════════════════════════════════════════════════════════════════
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // Si hay fuga activa, simular click en el botón para detenerla
    if (window._leakActive) {
      document.getElementById('btn-fuga')?.click();
    }
    // Detener tour si está activo
    if (isTourActive()) stopTour();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  INDICADOR DE CARGA para la sección 3D
  // ═══════════════════════════════════════════════════════════════════════════
  document.getElementById('tab-3d')?.addEventListener('click', () => {
    if (threeReady) return;
    const wrap = document.querySelector('.canvas-wrap');
    if (!wrap) return;

    const loader = document.createElement('div');
    loader.id = 'three-loader';
    loader.style.cssText = `
      position:absolute; inset:0; z-index:50;
      background:rgba(27,61,45,.92);
      display:flex; flex-direction:column;
      align-items:center; justify-content:center;
      gap:1rem; transition:opacity 0.5s ease;
    `;
    loader.innerHTML = `
      <div style="
        width:40px; height:40px; border-radius:50%;
        border:3px solid rgba(184,144,58,.3);
        border-top-color:#ddb85a;
        animation:spin .8s linear infinite;
      "></div>
      <div style="color:#ddb85a;font-family:'Playfair Display',serif;font-size:.9rem;letter-spacing:.1em">
        Cargando Maqueta 3D…
      </div>
    `;

    if (!document.getElementById('spin-keyframe')) {
      const style = document.createElement('style');
      style.id = 'spin-keyframe';
      style.textContent = `@keyframes spin { to { transform:rotate(360deg); } }`;
      document.head.appendChild(style);
    }

    wrap.appendChild(loader);

    // Remover loader cuando Three.js esté listo
    window.addEventListener('camera:arrived', () => {
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 500);
    }, { once: true });
  }, { once: true });

});

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORTACIÓN — se agrega fuera del DOMContentLoaded para que funcione
//  aunque el evento ya haya disparado
// ═══════════════════════════════════════════════════════════════════════════

// ── Ctrl+P → PDF de presentación ──────────────────────────────────────────
// ── Ctrl+Shift+P → Captura PNG del canvas 3D ──────────────────────────────
(function _initExportShortcuts() {

  function _showStatusToast(title, body, duration = 2500) {
    const existing = document.getElementById('status-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'status-toast';
    toast.style.cssText = `
      position:fixed;top:1.5rem;left:50%;transform:translateX(-50%);
      background:rgba(27,61,45,.97);color:#fff;
      font-family:'Crimson Pro',serif;font-size:.9rem;line-height:1.5;
      padding:.9rem 1.8rem;border-radius:8px;text-align:center;
      border:1px solid rgba(184,144,58,.5);
      box-shadow:0 6px 24px rgba(0,0,0,.35);
      z-index:99999;max-width:420px;width:90%;
      animation:toastIn .3s ease both;
    `;
    toast.innerHTML = `
      <div style="color:#ddb85a;font-family:'Playfair Display',serif;font-weight:700;margin-bottom:.25rem">${title}</div>
      <div style="font-size:.82rem;opacity:.85">${body}</div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity .35s ease';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 350);
    }, duration);
  }

  function _captureCanvas3D() {
    const canvas = document.getElementById('three-canvas');
    if (!canvas) {
      _showStatusToast('⚠️ Canvas no disponible', 'Abre primero la sección Maqueta 3D.', 2500);
      return;
    }
    // Solicitar un frame extra a scene.js para asegurar que el canvas tiene imagen
    window.dispatchEvent(new CustomEvent('capture:request'));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          const dataURL = canvas.toDataURL('image/png');
          const link    = document.createElement('a');
          const fecha   = new Date().toLocaleDateString('es-CL').replace(/\//g, '-');
          link.download = `maqueta-3D-playa-la-virgen-${fecha}.png`;
          link.href     = dataURL;
          link.click();
          _showStatusToast('✅ Captura descargada', 'La imagen PNG de la maqueta fue guardada.', 2800);
        } catch {
          _showStatusToast(
            '⚠️ No se pudo capturar',
            'El canvas tiene restricciones CORS. Ejecuta desde localhost.',
            3500
          );
        }
      });
    });
  }

  function _printPresentation() {
    _showStatusToast(
      '📄 Preparando PDF…',
      'Se abrirá el diálogo de impresión. Elige «Guardar como PDF» como destino.',
      1800
    );
    setTimeout(() => window.print(), 1900);
  }

  document.addEventListener('keydown', e => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;

    // Ctrl+Shift+P → captura PNG
    if (e.shiftKey && e.key === 'P') {
      e.preventDefault();
      _captureCanvas3D();
      return;
    }

    // Ctrl+P → PDF
    if (!e.shiftKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      _printPresentation();
    }
  });

})();
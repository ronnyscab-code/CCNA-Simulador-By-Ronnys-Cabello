/**
 * WelcomePanel.js
 *
 * A first-run "Cómo empezar" (getting started) modal that explains the core
 * gestures — placing devices, cabling, opening a CLI, and the Labs/Trainer
 * modes. It appears automatically the first time the app is opened (tracked
 * in localStorage) and can be reopened any time from the toolbar "?" button.
 *
 * Presentation only; reuses the shared modal styling.
 */

const SEEN_KEY = 'openccna:seen-welcome';

const STEPS = [
  {
    icon: '🖥️',
    title: 'Coloca dispositivos',
    body: 'Haz <strong>clic</strong> en un dispositivo del panel izquierdo (Router, Switch, PC…) y aparecerá en el lienzo. También puedes arrastrarlo.',
  },
  {
    icon: '⌁',
    title: 'Conéctalos',
    body: 'Pulsa el botón <strong>⌁ (Connect)</strong> de la barra, luego haz clic en un dispositivo y después en otro para tender un cable.',
  },
  {
    icon: '⌨️',
    title: 'Abre la consola (CLI)',
    body: 'Selecciona un dispositivo y pulsa <strong>Enter</strong> (o el botón <strong>Open CLI</strong> del panel derecho). Escribe comandos Cisco reales: <code>enable</code>, <code>configure terminal</code>, <code>ip address …</code>, <code>no shutdown</code>, <code>ping …</code>, <code>show …</code>.',
  },
  {
    icon: '🧪',
    title: 'Practica y estudia',
    body: '<strong>Labs</strong> te da redes averiadas para arreglar y puntuar. <strong>Trainer</strong> es el estudio y examen teórico (banco de preguntas del CCNA 200-301).',
  },
  {
    icon: '💾',
    title: 'Guarda tu trabajo',
    body: '<strong>New</strong> empieza de cero, <strong>Save/Load</strong> guarda en el navegador y <strong>Export/Import</strong> usa archivos JSON.',
  },
];

export class WelcomePanel {
  constructor() {
    this.overlay = document.getElementById('welcome-overlay');

    document
      .querySelector('[data-action="open-help"]')
      ?.addEventListener('click', () => this.open());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.overlay.hidden) this.close();
    });

    // Auto-show on the very first visit.
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      seen = false;
    }
    if (!seen) this.open();
  }

  open() {
    this.overlay.hidden = false;
    this.render();
  }

  close() {
    this.overlay.hidden = true;
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* storage unavailable — fine */
    }
  }

  render() {
    this.overlay.innerHTML = '';
    const modal = el('div', 'labs-modal welcome-modal');

    const header = el('div', 'labs-header');
    const title = el('h2', 'labs-title');
    title.textContent = 'Cómo empezar';
    const close = el('button', 'btn icon-btn');
    close.textContent = '✕';
    close.addEventListener('click', () => this.close());
    header.append(title, close);
    modal.appendChild(header);

    const body = el('div', 'labs-detail');
    const intro = el('p', 'labs-intro');
    intro.textContent =
      'Bienvenido a OpenCCNA Simulator: un simulador de redes CCNA que funciona 100% en el navegador. En 4 pasos ya estás practicando.';
    body.appendChild(intro);

    const list = el('div', 'welcome-steps');
    for (const [i, step] of STEPS.entries()) {
      const row = el('div', 'welcome-step');
      row.innerHTML = `<span class="welcome-step-num">${i + 1}</span><span class="welcome-step-icon">${step.icon}</span><span class="welcome-step-text"><strong class="welcome-step-title">${step.title}</strong><span>${step.body}</span></span>`;
      list.appendChild(row);
    }
    body.appendChild(list);

    const actions = el('div', 'labs-actions');
    const start = el('button', 'btn labs-check');
    start.textContent = '¡Entendido, empezar!';
    start.addEventListener('click', () => this.close());
    actions.appendChild(start);
    body.appendChild(actions);

    const tip = el('p', 'labs-tip');
    tip.textContent = 'Puedes reabrir esta ayuda cuando quieras con el botón “?” de la barra.';
    body.appendChild(tip);

    modal.appendChild(body);
    this.overlay.appendChild(modal);
  }
}

/**
 * @param {string} tag
 * @param {string} [className]
 * @returns {HTMLElement}
 */
function el(tag, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

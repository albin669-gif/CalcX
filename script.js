/* ============================================================
   CalcX — Premium Calculator Logic
   ============================================================
   Handles: expression building, evaluation, history, keyboard
   input, theme toggle, copy result, animated background.
   ============================================================ */

(function () {
  'use strict';

  /* ==========================================================
     DOM References
     ========================================================== */
  const displayExpression = document.getElementById('display-expression');
  const displayResult     = document.getElementById('display-result');
  const btnGrid           = document.getElementById('btn-grid');
  const copyBtn           = document.getElementById('copy-btn');
  const themeToggle       = document.getElementById('theme-toggle');
  const historyList       = document.getElementById('history-list');
  const historyEmpty      = document.getElementById('history-empty');
  const clearHistoryBtn   = document.getElementById('clear-history-btn');
  const toast             = document.getElementById('toast');
  const bgCanvas          = document.getElementById('bg-canvas');

  /* ==========================================================
     Calculator State
     ========================================================== */
  let expression    = '';     // The raw expression string (uses ×, ÷, −)
  let currentInput  = '0';   // Current number being entered
  let lastOperator  = '';    // Last operator pressed
  let shouldReset   = false; // Whether next digit should reset currentInput
  let justEvaluated = false; // Whether we just pressed equals
  let history       = [];    // Array of { expression, result }

  /* Operator display → internal mapping */
  const OPS_DISPLAY = ['÷', '×', '−', '+'];
  const OPS_CALC    = { '÷': '/', '×': '*', '−': '-', '+': '+' };

  /* ==========================================================
     Initialization
     ========================================================== */
  function init() {
    loadTheme();
    loadHistory();
    setupEventListeners();
    initBackground();
    updateDisplay();
  }

  /* ==========================================================
     Event Listeners
     ========================================================== */
  function setupEventListeners() {
    /* Button grid clicks (delegated) */
    btnGrid.addEventListener('click', handleButtonClick);

    /* Ripple tracking for buttons */
    btnGrid.addEventListener('pointerdown', trackRipple);

    /* Copy result */
    copyBtn.addEventListener('click', copyResult);

    /* Theme toggle */
    themeToggle.addEventListener('click', toggleTheme);

    /* Clear history */
    clearHistoryBtn.addEventListener('click', clearHistory);

    /* History item click (delegated) */
    historyList.addEventListener('click', handleHistoryClick);

    /* Keyboard support */
    document.addEventListener('keydown', handleKeyboard);
  }

  /* ==========================================================
     Button Click Handler
     ========================================================== */
  function handleButtonClick(e) {
    const btn = e.target.closest('.btn');
    if (!btn) return;

    const action = btn.dataset.action;
    const value  = btn.dataset.value;

    /* Animate button press */
    animatePress(btn);

    switch (action) {
      case 'number':    inputNumber(value);    break;
      case 'operator':  inputOperator(value);  break;
      case 'decimal':   inputDecimal();        break;
      case 'equals':    evaluate();            break;
      case 'clear':     clearAll();            break;
      case 'backspace': backspace();           break;
      case 'plus-minus': toggleSign();         break;
      case 'percent':   applyPercent();        break;
    }
  }

  /* ==========================================================
     Input Handling
     ========================================================== */

  /**
   * Append a digit to the current number.
   */
  function inputNumber(digit) {
    if (justEvaluated) {
      /* Start a brand-new calculation after pressing = */
      expression   = '';
      currentInput = digit;
      justEvaluated = false;
    } else if (shouldReset) {
      currentInput = digit;
      shouldReset  = false;
    } else {
      /* Prevent leading zeros like "007" */
      currentInput = currentInput === '0' ? digit : currentInput + digit;
    }
    /* Limit input length to 18 digits */
    if (currentInput.replace(/[^0-9]/g, '').length > 18) {
      currentInput = currentInput.slice(0, -1);
    }
    updateDisplay();
  }

  /**
   * Handle operator input (+, −, ×, ÷).
   */
  function inputOperator(op) {
    if (justEvaluated) {
      /* Continue with the result */
      expression    = currentInput + ' ' + op + ' ';
      justEvaluated = false;
      shouldReset   = true;
      lastOperator  = op;
      updateDisplay();
      highlightOperator(op);
      return;
    }

    if (shouldReset && lastOperator) {
      /* Replace the last operator */
      expression = expression.trimEnd();
      /* Remove the trailing operator */
      const parts = expression.split(' ');
      parts.pop();
      expression = parts.join(' ') + ' ' + op + ' ';
      lastOperator = op;
      updateDisplay();
      highlightOperator(op);
      return;
    }

    expression  += currentInput + ' ' + op + ' ';
    shouldReset  = true;
    lastOperator = op;
    updateDisplay();
    highlightOperator(op);
  }

  /**
   * Append a decimal point.
   */
  function inputDecimal() {
    if (justEvaluated) {
      expression    = '';
      currentInput  = '0.';
      justEvaluated = false;
      updateDisplay();
      return;
    }
    if (shouldReset) {
      currentInput = '0.';
      shouldReset  = false;
      updateDisplay();
      return;
    }
    if (!currentInput.includes('.')) {
      currentInput += '.';
    }
    updateDisplay();
  }

  /**
   * Toggle the sign of the current number.
   */
  function toggleSign() {
    if (currentInput === '0') return;

    if (currentInput.startsWith('-')) {
      currentInput = currentInput.slice(1);
    } else {
      currentInput = '-' + currentInput;
    }

    if (justEvaluated) {
      expression = '';
    }
    updateDisplay();
  }

  /**
   * Convert the current number to a percentage.
   */
  function applyPercent() {
    const num = parseFloat(currentInput);
    if (isNaN(num)) return;
    currentInput = formatResult(num / 100);

    if (justEvaluated) {
      expression = '';
    }
    updateDisplay();
  }

  /**
   * Delete the last character from the current input.
   */
  function backspace() {
    if (justEvaluated) {
      clearAll();
      return;
    }

    if (shouldReset) return;

    if (currentInput.length <= 1 || (currentInput.length === 2 && currentInput.startsWith('-'))) {
      currentInput = '0';
    } else {
      currentInput = currentInput.slice(0, -1);
    }
    updateDisplay();
  }

  /**
   * Clear everything.
   */
  function clearAll() {
    expression    = '';
    currentInput  = '0';
    lastOperator  = '';
    shouldReset   = false;
    justEvaluated = false;
    clearOperatorHighlight();
    updateDisplay();
  }

  /* ==========================================================
     Evaluation
     ========================================================== */

  /**
   * Evaluate the current expression.
   */
  function evaluate() {
    if (justEvaluated) return;

    let fullExpr = expression + currentInput;

    /* Nothing to evaluate if there's no operator */
    if (!hasOperator(fullExpr)) return;

    /* Convert display operators to calculation operators */
    let calcExpr = fullExpr;
    for (const [disp, calc] of Object.entries(OPS_CALC)) {
      calcExpr = calcExpr.split(disp).join(calc);
    }

    /* Check for division by zero */
    if (hasDivisionByZero(calcExpr)) {
      showToast('Cannot divide by zero');
      return;
    }

    try {
      const result = safeEval(calcExpr);

      if (result === null || !isFinite(result)) {
        showToast('Invalid expression');
        return;
      }

      const formatted = formatResult(result);

      /* Add to history */
      addHistory(fullExpr.trim(), formatted);

      /* Update state */
      displayExpression.textContent = fullExpr + ' =';
      currentInput  = formatted;
      expression    = '';
      lastOperator  = '';
      shouldReset   = true;
      justEvaluated = true;

      clearOperatorHighlight();
      updateResultDisplay();
    } catch {
      showToast('Invalid expression');
    }
  }

  /**
   * Check if expression contains any operator.
   */
  function hasOperator(expr) {
    return OPS_DISPLAY.some(op => expr.includes(op));
  }

  /**
   * Check for division by zero patterns.
   */
  function hasDivisionByZero(expr) {
    /* Match / followed by optional spaces and a zero (not followed by digits or .) */
    return /\/\s*0(?![0-9.])/.test(expr) || /\/\s*\(0\)/.test(expr);
  }

  /**
   * Safely evaluate a mathematical expression.
   * Uses the Function constructor with strict validation.
   */
  function safeEval(expr) {
    /* Remove all whitespace */
    let cleaned = expr.replace(/\s+/g, '');

    /* Validate: only allow digits, operators, decimal points, parens, and minus for negatives */
    if (!/^[-+*/.\d()]+$/.test(cleaned)) {
      return null;
    }

    /* Handle edge: double minus (e.g., 5 - -3) → 5 - (-3) */
    cleaned = cleaned.replace(/--/g, '+');
    cleaned = cleaned.replace(/\+-/g, '-');
    cleaned = cleaned.replace(/-\+/g, '-');

    try {
      /* Use Function constructor for evaluation (safer than eval) */
      const fn = new Function('return (' + cleaned + ')');
      return fn();
    } catch {
      return null;
    }
  }

  /**
   * Format a numeric result, trimming unnecessary decimals.
   */
  function formatResult(num) {
    if (Number.isInteger(num)) {
      return num.toString();
    }

    /* Round to 12 decimal places to avoid floating-point noise */
    const rounded = parseFloat(num.toPrecision(12));

    /* If the number is very small or very large, use exponential notation */
    if (Math.abs(rounded) > 1e15 || (Math.abs(rounded) < 1e-10 && rounded !== 0)) {
      return rounded.toExponential(6);
    }

    return rounded.toString();
  }

  /* ==========================================================
     Display Updates
     ========================================================== */

  /**
   * Update both expression and result displays.
   */
  function updateDisplay() {
    /* Expression line */
    displayExpression.textContent = expression || '\u00A0';

    /* Result line */
    updateResultDisplay();
  }

  /**
   * Update just the result display with adaptive font sizing.
   */
  function updateResultDisplay() {
    displayResult.textContent = currentInput;

    /* Adaptive font size based on length */
    displayResult.classList.remove('shrink-1', 'shrink-2', 'shrink-3');
    const len = currentInput.length;
    if (len > 16)     displayResult.classList.add('shrink-3');
    else if (len > 12) displayResult.classList.add('shrink-2');
    else if (len > 8)  displayResult.classList.add('shrink-1');
  }

  /* ==========================================================
     Operator Highlight
     ========================================================== */

  /**
   * Highlight the active operator button.
   */
  function highlightOperator(op) {
    clearOperatorHighlight();
    const btn = btnGrid.querySelector(`.btn--op[data-value="${op}"]`);
    if (btn) btn.classList.add('btn--active-op');
  }

  /**
   * Remove active operator highlight from all operator buttons.
   */
  function clearOperatorHighlight() {
    btnGrid.querySelectorAll('.btn--active-op').forEach(b => b.classList.remove('btn--active-op'));
  }

  /* ==========================================================
     Button Animations
     ========================================================== */

  /**
   * Animate a button press.
   */
  function animatePress(btn) {
    btn.classList.add('btn--pressed');
    setTimeout(() => btn.classList.remove('btn--pressed'), 120);
  }

  /**
   * Track pointer position for the ripple effect.
   */
  function trackRipple(e) {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
    const y = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);
    btn.style.setProperty('--ripple-x', x + '%');
    btn.style.setProperty('--ripple-y', y + '%');
  }

  /* ==========================================================
     Keyboard Support
     ========================================================== */

  function handleKeyboard(e) {
    const key = e.key;

    /* Prevent default for calculator keys to avoid page scrolling etc. */
    if (['Enter', 'Escape', 'Backspace', '+', '-', '*', '/', '%', '.'].includes(key) ||
        (key >= '0' && key <= '9')) {
      e.preventDefault();
    }

    /* Digits */
    if (key >= '0' && key <= '9') {
      simulateButton(`[data-action="number"][data-value="${key}"]`);
      inputNumber(key);
      return;
    }

    /* Operators */
    const keyToOp = { '+': '+', '-': '−', '*': '×', '/': '÷' };
    if (keyToOp[key]) {
      simulateButton(`[data-action="operator"][data-value="${keyToOp[key]}"]`);
      inputOperator(keyToOp[key]);
      return;
    }

    switch (key) {
      case '.':
        simulateButton('[data-action="decimal"]');
        inputDecimal();
        break;
      case '%':
        simulateButton('[data-action="percent"]');
        applyPercent();
        break;
      case 'Enter':
      case '=':
        simulateButton('[data-action="equals"]');
        evaluate();
        break;
      case 'Escape':
        simulateButton('[data-action="clear"]');
        clearAll();
        break;
      case 'Backspace':
        simulateButton('[data-action="backspace"]');
        backspace();
        break;
    }
  }

  /**
   * Visually simulate a button press via keyboard.
   */
  function simulateButton(selector) {
    const btn = btnGrid.querySelector(selector);
    if (btn) animatePress(btn);
  }

  /* ==========================================================
     History
     ========================================================== */

  /**
   * Add a calculation to the history.
   */
  function addHistory(expr, result) {
    history.unshift({ expression: expr, result: result });

    /* Keep max 50 entries */
    if (history.length > 50) history.pop();

    saveHistory();
    renderHistory();
  }

  /**
   * Render history items into the DOM.
   */
  function renderHistory() {
    historyList.innerHTML = '';

    if (history.length === 0) {
      historyList.classList.remove('has-items');
      historyEmpty.classList.remove('hidden');
      return;
    }

    historyList.classList.add('has-items');
    historyEmpty.classList.add('hidden');

    history.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'history__item';
      li.dataset.index = index;
      li.style.animationDelay = (index * 30) + 'ms';
      li.innerHTML = `
        <div class="history__item-expr">${escapeHtml(item.expression)}</div>
        <div class="history__item-result">= ${escapeHtml(item.result)}</div>
      `;
      historyList.appendChild(li);
    });
  }

  /**
   * Handle clicking a history item → load result.
   */
  function handleHistoryClick(e) {
    const item = e.target.closest('.history__item');
    if (!item) return;

    const idx = parseInt(item.dataset.index, 10);
    if (isNaN(idx) || !history[idx]) return;

    currentInput  = history[idx].result;
    expression    = '';
    shouldReset   = true;
    justEvaluated = true;
    lastOperator  = '';
    clearOperatorHighlight();
    updateDisplay();

    showToast('Loaded from history');
  }

  /**
   * Clear all history.
   */
  function clearHistory() {
    history = [];
    saveHistory();
    renderHistory();
    showToast('History cleared');
  }

  /**
   * Save history to localStorage.
   */
  function saveHistory() {
    try {
      localStorage.setItem('calcx-history', JSON.stringify(history));
    } catch {
      /* Silently fail if storage is unavailable */
    }
  }

  /**
   * Load history from localStorage.
   */
  function loadHistory() {
    try {
      const data = localStorage.getItem('calcx-history');
      if (data) {
        history = JSON.parse(data);
        renderHistory();
      }
    } catch {
      history = [];
    }
  }

  /* ==========================================================
     Copy Result
     ========================================================== */

  function copyResult() {
    const text = currentInput;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Copied: ' + text);
      }).catch(() => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  /**
   * Fallback copy method for older browsers.
   */
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('Copied: ' + text);
    } catch {
      showToast('Failed to copy');
    }
    document.body.removeChild(ta);
  }

  /* ==========================================================
     Theme
     ========================================================== */

  function toggleTheme() {
    const html  = document.documentElement;
    const theme = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('calcx-theme', theme);
    } catch {
      /* Silently fail */
    }
  }

  function loadTheme() {
    try {
      const saved = localStorage.getItem('calcx-theme');
      if (saved === 'light' || saved === 'dark') {
        document.documentElement.setAttribute('data-theme', saved);
      }
    } catch {
      /* Default dark theme */
    }
  }

  /* ==========================================================
     Toast Notification
     ========================================================== */

  let toastTimer = null;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
  }

  /* ==========================================================
     Animated Background (Floating Particles)
     ========================================================== */

  function initBackground() {
    const ctx = bgCanvas.getContext('2d');
    let width, height;
    const particles = [];
    const PARTICLE_COUNT = 40;

    function resize() {
      width  = bgCanvas.width  = window.innerWidth;
      height = bgCanvas.height = window.innerHeight;
    }

    function createParticle() {
      return {
        x:  Math.random() * width,
        y:  Math.random() * height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r:  Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.3 + 0.05,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: Math.random() * 0.01 + 0.005
      };
    }

    function initParticles() {
      particles.length = 0;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push(createParticle());
      }
    }

    function drawParticle(p) {
      const pulsedAlpha = p.alpha * (0.5 + 0.5 * Math.sin(p.pulse));
      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      const color = isDark ? `rgba(124, 92, 252, ${pulsedAlpha})` : `rgba(108, 76, 224, ${pulsedAlpha})`;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      /* Glow */
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
      ctx.fillStyle = color.replace(/[\d.]+\)$/, (pulsedAlpha * 0.3).toFixed(3) + ')');
      ctx.fill();
    }

    function connectParticles() {
      const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      const maxDist = 120;

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.06;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = isDark
              ? `rgba(124, 92, 252, ${alpha})`
              : `rgba(108, 76, 224, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
    }

    function animate() {
      ctx.clearRect(0, 0, width, height);

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += p.pulseSpeed;

        /* Wrap around edges */
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;

        drawParticle(p);
      });

      connectParticles();
      requestAnimationFrame(animate);
    }

    resize();
    initParticles();
    animate();
    window.addEventListener('resize', () => {
      resize();
      initParticles();
    });
  }

  /* ==========================================================
     Utility
     ========================================================== */

  /**
   * Escape HTML entities for safe DOM insertion.
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ==========================================================
     Boot
     ========================================================== */
  document.addEventListener('DOMContentLoaded', init);
})();

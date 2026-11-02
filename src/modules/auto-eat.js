window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

// Auto Eat: actua SOLO cuando el contador visible de Food llega exactamente a 0.
// Si no encuentra el dato o hay lecturas contradictorias, no activa la hotbar.
window.__minibiaCopilotBundle.installAutoEatModule = function installAutoEatModule(bot) {
  "use strict";

  const storageKey = "minibiaCopilot.eat.config";
  const config = Object.assign({
    enabled: false,
    eatHotbarSlot: 10,
    tickMs: 1000,
    confirmMs: 1800,
    retryMs: 3000,
    maxFailedAttempts: 2,
  }, bot.storage?.get?.(storageKey, {}) || {});

  // Migración desde versiones que utilizaban un temporizador fijo.
  delete config.eatIntervalMs;

  const state = {
    running: false,
    timerId: null,
    pending: null,
    lastFood: null,
    lastFoodRaw: null,
    lastFoodSource: null,
    lastError: null,
    lastAction: null,
    lastAttemptAt: 0,
    failedAttempts: 0,
    awaitingFoodReset: false,
  };

  function save() {
    bot.storage?.set?.(storageKey, { ...config });
  }

  function visible(node) {
    if (!node?.isConnected || !node.getClientRects().length) return false;
    const style = window.getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  // Selector confirmado en la sesión real de Minibia:
  // <div class="outer-skill-wrapper" skill="food"> ... <span class="skill">00:00</span>
  // Solo leemos el indicador Food de la interfaz visible; nunca gameClient.
  function parseFoodClock(value) {
    const text = String(value ?? "").trim();
    const match = text.match(/^(\d{1,5}):(\d{2})$/);
    if (!match) return null;
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (!Number.isSafeInteger(first) || second >= 60) return null;
    // El valor solo se utiliza para reconocer el cero y confirmar el cambio.
    return first * 60 + second;
  }

  function foodCandidates() {
    return [...document.querySelectorAll('.outer-skill-wrapper[skill="food"] .skill')]
      .filter(visible)
      .map(node => ({
        food: parseFoodClock(node.textContent),
        raw: String(node.textContent ?? "").trim(),
        source: '.outer-skill-wrapper[skill="food"] .skill',
      }));
  }

  function readFood() {
    const candidates = foodCandidates();
    if (candidates.length === 0) {
      return { value: null, raw: null, source: null, reason: "Food no está visible en el cliente" };
    }
    if (candidates.some(item => item.food === null)) {
      return { value: null, raw: null, source: null, reason: "Formato del contador Food desconocido" };
    }
    const values = [...new Set(candidates.map(item => item.food))];
    if (values.length !== 1) {
      return { value: null, raw: null, source: null, reason: "Hay varios contadores Food con valores distintos" };
    }
    return { value: values[0], raw: candidates[0].raw, source: candidates[0].source, reason: null };
  }

  function findFoodHotbar() {
    const slot = Number(config.eatHotbarSlot);
    if (!Number.isInteger(slot) || slot < 1 || slot > 12) return null;
    const key = "F" + slot;
    const matches = [...document.querySelectorAll(".hotbar-item")].filter(node => {
      const title = node.getAttribute("title") || "";
      return visible(node) && node.querySelector(".hotbar-key")?.textContent?.trim() === key && /^(Use Item|Eat Food|Eat|Comer)$/i.test(title.trim());
    });
    return matches.length === 1 ? matches[0] : null;
  }

  function itemCount(node) {
    const raw = node?.querySelector(".hotbar-text")?.getAttribute("data-count");
    return typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : null;
  }

  function stop(options = {}) {
    state.running = false;
    if (state.timerId !== null) window.clearTimeout(state.timerId);
    state.timerId = null;
    state.pending = null;
    if (options.reason) state.lastError = String(options.reason);
    if (options.persistEnabled !== false) {
      config.enabled = false;
      save();
    }
    return true;
  }

  function verifyPending(now, foodResult) {
    const pending = state.pending;
    if (!pending || now - pending.at < config.confirmMs) return;
    const after = itemCount(findFoodHotbar());
    const consumed = pending.countBefore !== null && after !== null && after < pending.countBefore;
    const foodIncreased = foodResult.value !== null && foodResult.value > 0;
    // Solo el contador Food confirma que el personaje volvió a estar alimentado.
    // Consumir un objeto sin aumentar Food no confirma la acción.
    const confirmed = foodIncreased;

    state.lastAction = {
      slot: pending.slot,
      foodBefore: pending.foodBefore,
      foodAfter: foodResult.value,
      countBefore: pending.countBefore,
      countAfter: after,
      itemConsumed: consumed,
      confirmed,
      at: new Date(pending.at).toISOString(),
    };
    state.pending = null;
    if (confirmed) {
      state.failedAttempts = 0;
      // Después de comer, exigir observar Food > 0 antes de permitir otro uso.
      state.awaitingFoodReset = true;
    } else {
      state.failedAttempts++;
      if (state.failedAttempts >= config.maxFailedAttempts) {
        stop({ reason: "Food sigue en 0 y no se confirmó el consumo. Auto Eat detenido." });
      }
    }
  }

  function check() {
    const now = Date.now();
    const foodResult = readFood();
    state.lastFood = foodResult.value;
    state.lastFoodRaw = foodResult.raw;
    state.lastFoodSource = foodResult.source;

    if (foodResult.value !== null && foodResult.value > 0) {
      state.awaitingFoodReset = false;
    }
    if (!state.running) return false;
    if (state.pending) {
      verifyPending(now, foodResult);
      return false;
    }
    if (foodResult.value === null) {
      state.lastError = foodResult.reason;
      return false;
    }
    state.lastError = null;
    if (foodResult.value !== 0 || state.awaitingFoodReset) return false;
    if (now - state.lastAttemptAt < config.retryMs) return false;

    const button = findFoodHotbar();
    if (!button) {
      stop({ reason: `No se encontró Use Item/Eat en F${config.eatHotbarSlot}.` });
      return false;
    }
    const countBefore = itemCount(button);
    if (countBefore === 0) {
      stop({ reason: `Se terminó la comida de F${config.eatHotbarSlot}.` });
      return false;
    }
    state.pending = {
      at: now, slot: Number(config.eatHotbarSlot),
      foodBefore: foodResult.value, countBefore,
    };
    state.lastAttemptAt = now;
    try {
      button.click();
      return true;
    } catch (error) {
      state.pending = null;
      stop({ reason: `Error al usar comida: ${String(error)}` });
      return false;
    }
  }

  function tick() {
    if (!state.running) return;
    try { check(); }
    catch (error) { stop({ reason: `Error Auto Eat: ${String(error)}` }); }
    if (state.running) state.timerId = window.setTimeout(tick, config.tickMs);
  }

  function updateConfig(next = {}) {
    const patch = { ...next };
    if (Object.prototype.hasOwnProperty.call(patch, "eatHotbarSlot")) {
      const slot = Number(patch.eatHotbarSlot);
      patch.eatHotbarSlot = Number.isInteger(slot) && slot >= 1 && slot <= 12 ? slot : config.eatHotbarSlot;
    }
    for (const [key, min, max] of [["tickMs", 500, 5000], ["confirmMs", 800, 10000], ["retryMs", 2000, 60000], ["maxFailedAttempts", 1, 10]]) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        const n = Number(patch[key]);
        patch[key] = Number.isFinite(n) ? Math.round(Math.max(min, Math.min(max,n))) : config[key];
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, "enabled")) patch.enabled = !!patch.enabled;
    delete patch.eatIntervalMs; // Intervalo obsoleto: solo se come cuando Food = 0.
    Object.assign(config, patch);
    save();
    return { ...config };
  }

  function start(overrides = {}) {
    if (state.running) return false;
    updateConfig({ ...overrides, enabled: true });
    if (!findFoodHotbar()) {
      config.enabled = false;
      save();
      state.lastError = `Asigna comida a F${config.eatHotbarSlot} como Use Item.`;
      return false;
    }
    state.running = true;
    state.lastError = null;
    state.failedAttempts = 0;
    state.awaitingFoodReset = false;
    state.lastAttemptAt = 0;
    tick();
    return true;
  }

  function inspectFood() {
    return { ...readFood(), candidates: foodCandidates().slice(0, 15) };
  }

  function inspectHotbarSlot(slot = config.eatHotbarSlot) {
    const key = "F" + slot;
    return [...document.querySelectorAll(".hotbar-item")]
      .filter(node => visible(node) && node.querySelector(".hotbar-key")?.textContent?.trim() === key)
      .map(node => ({ key, title: node.getAttribute("title"), count: itemCount(node) }));
  }

  function status() {
    const current = readFood();
    return {
      running: state.running,
      config: { ...config },
      food: current.value,
      foodRaw: current.raw,
      foodSource: current.source,
      waitingForFoodReset: state.awaitingFoodReset,
      lastAction: state.lastAction,
      lastAttemptAt: state.lastAttemptAt,
      lastError: state.lastError,
      failedAttempts: state.failedAttempts,
    };
  }

  if (bot.eat?.status?.().running) bot.eat.stop();
  bot.eat = { start, stop, status, updateConfig, check, inspectFood, inspectHotbarSlot, readFood, config };
  if (typeof bot.addCleanup === "function") bot.addCleanup(() => stop({ persistEnabled: false }));
  if (config.enabled) start();
  return bot.eat;
};
window.__minibiaCopilotBundle.installEatModule = window.__minibiaCopilotBundle.installAutoEatModule;

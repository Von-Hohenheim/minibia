// Magic Level Trainer — integrado con Runtime Adapter; condición única: maná (%).
// No accede a window.gameClient ni utiliza bot.sendChat().
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installRuneModule = function installRuneModule(bot) {
  "use strict";

  // Nueva clave: evita reutilizar configuraciones antiguas basadas en maná absoluto.
  const configStorageKey = "minibiaCopilot.rune.config.v2";
  const defaults = {
    tickMs: 350,
    runeHotbarSlot: 3,
    minManaPercent: 90,
    runeCooldownMs: 3500,
    confirmMs: 1500,
    enabled: false,
  };

  const config = Object.assign(
    {}, defaults, bot.storage?.get?.(configStorageKey, {}) || {}
  );
  // Configuraciones de versiones previas pudieron contener minHpPercent.
  // Se elimina: este entrenador depende exclusivamente del porcentaje de maná.
  delete config.minHpPercent;

  const state = {
    running: false,
    timerId: null,
    pending: null,
    lastRuneAt: 0,
    lastAttemptAt: 0,
    lastAction: null,
    lastError: null,
    failedAttempts: 0,
  };

  function persistConfig() {
    bot.storage?.set?.(configStorageKey, { ...config });
  }

  function validSlot(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
  }

  function percent(value) {
    return typeof value === "number" && Number.isFinite(value) &&
      value >= 0 && value <= 100 ? value : null;
  }

  function clamp(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n)
      ? Math.min(max, Math.max(min, n))
      : fallback;
  }

  function readStats() {
    let player = null;
    try {
      player = bot.runtimeAdapter?.getStats?.() || null;
    } catch (error) {
      state.lastError = `Lectura DOM: ${String(error)}`;
    }

    const manaPercent = percent(player?.manaPercent);

    // Lectura informativa; no usar como fuente de datos del GameClient.
    const foodText = document.querySelector(
      '#skill-window div[skill="food"] .skill'
    )?.textContent?.trim() || null;
    const foodMatch = foodText?.match(/^(\d{1,2}):(\d{2})$/);
    const food = foodMatch
      ? { text: foodText, seconds: Number(foodMatch[1]) * 60 + Number(foodMatch[2]) }
      : { text: foodText, seconds: null };

    return {
      name: player?.name ?? null,
      mana: null,
      manaPercent,
      food,
      source: "runtime-adapter",
    };
  }

  function findSpellButton(slot = config.runeHotbarSlot) {
    const number = validSlot(slot);
    if (!number) return null;

    const key = `F${number}`;
    const matches = Array.from(document.querySelectorAll(".hotbar-item"))
      .filter((element) => {
        if (!element.isConnected || !element.getClientRects().length) return false;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return false;
        return element.querySelector(".hotbar-key")?.textContent?.trim() === key;
      });

    // No escoger arbitrariamente si aparecen dos hotbars F3.
    if (matches.length !== 1) return null;

    const button = matches[0];
    const title = String(button.getAttribute("title") || "").trim();

    // Las entradas Use Item son objetos, runas consumibles o fluidos.
    // Para entrenar ML se requiere un hechizo de la hotbar.
    if (!title || /^use item$/i.test(title) || /^use on/i.test(title)) {
      return null;
    }

    return button;
  }

  function inspectHotbarSlot(slot = config.runeHotbarSlot) {
    const number = validSlot(slot);
    if (!number) return [];
    return Array.from(document.querySelectorAll(".hotbar-item"))
      .filter((node) => node.querySelector(".hotbar-key")
        ?.textContent?.trim() === `F${number}`)
      .map((node) => ({
        key: `F${number}`,
        title: node.getAttribute("title") || "",
        visible: !!(node.isConnected && node.getClientRects().length),
        spellSupported: findSpellButton(number) === node,
      }));
  }

  function canMakeRune(stats = readStats(), now = Date.now()) {
    return !!(
      stats.manaPercent !== null &&
      stats.manaPercent >= config.minManaPercent &&
      state.pending === null &&
      now - state.lastAttemptAt >= config.runeCooldownMs
    );
  }

  function resolvePending(stats, now) {
    const pending = state.pending;
    if (!pending) return;
    if (now - pending.attemptedAt < config.confirmMs) return;

    // Hechizos de entrenamiento consumen maná. No basta con que click() no falle.
    const decreased = stats.manaPercent !== null &&
      pending.manaBefore !== null &&
      stats.manaPercent < pending.manaBefore;

    state.lastAction = {
      key: pending.key,
      title: pending.title,
      at: new Date(pending.attemptedAt).toISOString(),
      manaBefore: pending.manaBefore,
      manaAfter: stats.manaPercent,
      confirmed: decreased,
    };
    state.pending = null;

    if (decreased) {
      state.lastRuneAt = now;
      state.failedAttempts = 0;
    } else {
      state.failedAttempts += 1;
      if (state.failedAttempts >= 2) {
        stop({ reason: "Dos intentos sin consumo de maná confirmado; entrenador detenido." });
      }
    }
  }

  function tryMakeRune() {
    const now = Date.now();
    const stats = readStats();

    resolvePending(stats, now);
    if (!state.running || state.pending || !canMakeRune(stats, now)) return false;

    const button = findSpellButton();
    if (!button) {
      stop({ reason: `No se detectó un único hechizo en F${config.runeHotbarSlot}.` });
      return false;
    }

    state.pending = {
      attemptedAt: now,
      key: `F${config.runeHotbarSlot}`,
      title: button.getAttribute("title") || "",
      manaBefore: stats.manaPercent,
    };
    state.lastAttemptAt = now;

    try {
      button.click();
      return true;
    } catch (error) {
      state.pending = null;
      stop({ reason: `Error activando hotbar: ${String(error)}` });
      return false;
    }
  }

  function tick() {
    if (!state.running) return;
    try {
      tryMakeRune();
    } catch (error) {
      stop({ reason: `Error del entrenador: ${String(error)}` });
    } finally {
      if (state.running) {
        state.timerId = window.setTimeout(
          tick, Math.max(250, Number(config.tickMs) || 350)
        );
      }
    }
  }

  function start(overrides = {}) {
    if (state.running) return false;
    updateConfig({ ...overrides, enabled: false });

    const stats = readStats();
    if (stats.manaPercent === null) {
      state.lastError = "Runtime Adapter no proporciona porcentaje de maná.";
      return false;
    }
    if (!findSpellButton()) {
      state.lastError = `F${config.runeHotbarSlot} no es un hechizo válido o es ambiguo.`;
      return false;
    }
    state.lastError = null;
    state.failedAttempts = 0;
    state.running = true;
    config.enabled = true;
    persistConfig();
    tick();
    return true;
  }

  function stop(options = {}) {
    state.running = false;
    if (state.timerId !== null) window.clearTimeout(state.timerId);
    state.timerId = null;
    state.pending = null;
    config.enabled = false;
    persistConfig();
    if (options.reason) state.lastError = options.reason;
    return true;
  }

  function updateConfig(next = {}) {
    const patch = { ...next };
    if (Object.prototype.hasOwnProperty.call(patch, "runeHotbarSlot")) {
      patch.runeHotbarSlot = validSlot(patch.runeHotbarSlot) ?? config.runeHotbarSlot;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "minManaPercent")) {
      patch.minManaPercent = clamp(patch.minManaPercent, 1, 100, config.minManaPercent);
    }
    // Ignorar el parámetro legado de HP, aunque lo envíe otro módulo.
    delete patch.minHpPercent;
    if (Object.prototype.hasOwnProperty.call(patch, "runeCooldownMs")) {
      patch.runeCooldownMs = clamp(patch.runeCooldownMs, 2000, 60000, config.runeCooldownMs);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "confirmMs")) {
      patch.confirmMs = clamp(patch.confirmMs, 800, 10000, config.confirmMs);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "tickMs")) {
      patch.tickMs = clamp(patch.tickMs, 250, 10000, config.tickMs);
    }
    // Nunca activar por un updateConfig aislado; solo start() inicia acciones.
    delete patch.enabled;
    Object.assign(config, patch);
    persistConfig();
    return { ...config };
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      stats: readStats(),
      lastRuneAt: state.lastRuneAt,
      lastAttemptAt: state.lastAttemptAt,
      lastAction: state.lastAction,
      lastError: state.lastError,
      pending: state.pending ? { ...state.pending } : null,
      failedAttempts: state.failedAttempts,
      hotbar: inspectHotbarSlot(),
    };
  }

  // APIs anteriores conservadas; alimentación pertenece al módulo Auto Eat.
  const startAutoEat = (overrides = {}) => bot.eat?.start?.(overrides) ?? false;
  const stopAutoEat = () => bot.eat?.stop?.() ?? false;
  const tryEat = () => bot.eat?.tryEat?.() ?? false;

  bot.rune = {
    start, stop, status, updateConfig, readStats,
    canMakeRune, tryMakeRune, inspectHotbarSlot, findSpellButton,
    startAutoEat, stopAutoEat, tryEat,
    config,
  };
  bot.startRuneLoop = start;
  bot.stopRuneLoop = stop;
  bot.startAutoEat = startAutoEat;
  bot.stopAutoEat = stopAutoEat;
  bot.addCleanup?.(() => stop());
};

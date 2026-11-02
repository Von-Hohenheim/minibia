window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installHealModule = function installHealModule(bot) {
  "use strict";

  const configStorageKey = "minibiaCopilot.heal.config";
  const defaults = {
    tickMs: 300,
    healCooldownMs: 3000,
    healRetryMs: 3000,
    healConfirmMs: 1500,
    minHp: 250,               // Campo antiguo, conservado para compatibilidad.
    minHpPercent: 60,         // Porcentaje real que controla Auto Heal.
    hpHotbarSlot: 1,
    healMode: "auto",           // auto: detecta poción o magia curativa en la tecla.
    minMana: 150,              // Conservado para compatibilidad; requiere maná absoluto.
    minManaPercent: 25,        // El Runtime Adapter actual solo proporciona porcentaje.
    manaEnabled: false,        // Evita consumir pociones de maná sin autorización explícita.
    manaHotbarSlot: 2,
    enabled: false,
  };

  const config = Object.assign({}, defaults, bot.storage.get(configStorageKey, {}) || {});
  config.healMode = ["auto", "potion", "spell"].includes(config.healMode) ? config.healMode : "auto";
  const state = {
    running: false,
    monitorOnly: false,
    timerId: null,
    pendingAttempt: null,
    lastHpHealAt: 0,
    lastManaHealAt: 0,
    lastHpAttemptAt: 0,
    lastManaAttemptAt: 0,
    lastResult: null,
    lastDecision: null,
    lastAction: null,
    lastError: null,
    failedAttempts: 0,
  };

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeHotbarSlot(value) {
    const slot = Number(value);
    return Number.isInteger(slot) && slot >= 1 && slot <= 12 ? slot : null;
  }

  function normalizeHealMode(value) {
    return ["auto", "potion", "spell"].includes(value) ? value : "auto";
  }

  function boundedNumber(value, min, max) {
    return typeof value === "number" && Number.isFinite(value) &&
      value >= min && value <= max ? value : null;
  }

  function readStats() {
    // Nunca consultar gameClient ni getters protegidos.
    let raw = null;
    try {
      raw = bot.runtimeAdapter?.getStats?.() || null;
    } catch (error) {
      state.lastError = "Runtime Adapter: " + String(error);
    }

    const current = boundedNumber(raw?.health, 0, Number.MAX_SAFE_INTEGER);
    const maximum = boundedNumber(raw?.maxHealth, 1, Number.MAX_SAFE_INTEGER);
    const hp = current !== null && maximum !== null && current <= maximum
      ? { current, max: maximum } : null;

    const manaCurrent = boundedNumber(raw?.mana, 0, Number.MAX_SAFE_INTEGER);
    const manaMaximum = boundedNumber(raw?.maxMana, 1, Number.MAX_SAFE_INTEGER);
    const mana = manaCurrent !== null && manaMaximum !== null && manaCurrent <= manaMaximum
      ? { current: manaCurrent, max: manaMaximum } : null;

    return {
      name: raw?.name || null,
      hp,
      mana,
      manaPercent: boundedNumber(raw?.manaPercent, 0, 100),
      source: hp || mana ? "runtime-adapter" : "unavailable",
    };
  }

  function evaluateDom(stats = readStats()) {
    const hpLimit = Math.min(100, Math.max(0, Number(config.minHpPercent) || 0));
    const hpPercent = stats.hp ? (stats.hp.current / stats.hp.max) * 100 : null;
    const hpRequired = stats.hp
      ? stats.hp.current > 0 && stats.hp.current < stats.hp.max && hpPercent <= hpLimit
      : null;

    let manaRequired = null;
    if (config.manaEnabled) {
      if (stats.manaPercent !== null) {
        manaRequired = stats.manaPercent <= Math.min(100, Math.max(0, Number(config.minManaPercent) || 0));
      } else if (stats.mana) {
        manaRequired = stats.mana.current <= Math.max(0, Number(config.minMana) || 0);
      }
    }

    return {
      available: !!stats.hp,
      name: stats.name,
      health: stats.hp?.current ?? null,
      maxHealth: stats.hp?.max ?? null,
      healthPercent: stats.hp
        ? Math.round((stats.hp.current / stats.hp.max) * 10000) / 100 : null,
      mana: stats.mana?.current ?? null,
      maxMana: stats.mana?.max ?? null,
      manaPercent: stats.manaPercent,
      minHpPercent: hpLimit,
      healMode: normalizeHealMode(config.healMode),
      minHp: config.minHp, // Compatibilidad, no controla el disparador.
      minManaPercent: config.minManaPercent,
      shouldHeal: hpRequired,
      shouldRefillMana: manaRequired,
      actionExecuted: false,
      source: stats.source,
    };
  }

  function isVisibleHotbarButton(node) {
    if (!node?.isConnected || node.getClientRects().length === 0) return false;
    const style = getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  // Inspecciona el texto que Minibia publica en el propio botón.
  // No mantiene una lista de magias y no lee GameClient ni propiedades protegidas.
  // Si no hay evidencia de curación, no selecciona el botón automáticamente.
  function detectHotbarAction(node) {
    const title = String(node?.getAttribute("title") || "").trim();
    if (title === "Use Item") return "potion";
    if (!title) return null;

    // Ejemplos aceptados: "Ultimate Healing: Heals all damage",
    // "Exura Vita: Restores health", "Curación: Recupera vida".
    // Excluye etiquetas que indiquen un objeto o una acción ofensiva.
    const healingText = /\bheal(?:s|ed|ing)?\b|\b(?:restor(?:e|es|ed|ing)|recover(?:s|ed|ing)?|regenerat(?:e|es|ed|ing))\s+(?:hp|health|life)\b|\bexura\b|\bcuraci[oó]n\b|\bcura(?:r)?\b|\b(?:recupera|restaura)(?:r)?\s+vida\b/i;
    const negativeText = /\b(?:deal(?:s)?\s+damage|damage\s+to|attack|fireball|summon|teleport)\b/i;

    return healingText.test(title) && !negativeText.test(title)
      ? "spell"
      : null; 
  }

  function matchesHealMode(node, mode) {
    const detected = detectHotbarAction(node);
    return detected !== null &&
      (mode === "auto" || detected === mode);
  }

  function findHotbarButton(slot, mode = "auto") {
    const normalized = normalizeHotbarSlot(slot);
    if (!normalized) return null;
    const hotkey = "F" + normalized;
    const found = Array.from(document.querySelectorAll(".hotbar-item"))
      .filter((node) => isVisibleHotbarButton(node) &&
        node.querySelector(".hotbar-key")?.textContent?.trim() === hotkey &&
        matchesHealMode(node, mode));
    // Evitar selecciones ambiguas (varias hotbars o presets visibles).
    return found.length === 1 ? found[0] : null;
  }

  function inspectHotbarSlot(slot) {
    const normalized = normalizeHotbarSlot(slot);
    if (!normalized) return [];
    return Array.from(document.querySelectorAll(".hotbar-item"))
      .filter((node) => isVisibleHotbarButton(node) &&
        node.querySelector(".hotbar-key")?.textContent?.trim() === "F" + normalized)
      .map((node) => ({
        key: "F" + normalized,
        title: node.getAttribute("title"),
        text: node.textContent?.trim().slice(0, 90) || "",
        detectedType: detectHotbarAction(node),
        autoSupported: matchesHealMode(node, "auto"),
        potionSupported: matchesHealMode(node, "potion"),
        spellSupported: matchesHealMode(node, "spell"),
      }));
  }

  function readItemCount(button) {
    const value = button?.querySelector(".hotbar-text")?.getAttribute("data-count");
    return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : null;
  }

  function attempt(kind, slot, stats, now) {
    const selectedMode = kind === "hp"
      ? normalizeHealMode(config.healMode)
      : "potion";
    const button = findHotbarButton(slot, selectedMode);
    const actionType = kind === "hp"
      ? detectHotbarAction(button)
      : "potion";
    if (!button) {
      stop({ reason: "No hay un único botón de " +
        (selectedMode === "auto" ? "curación" : selectedMode === "spell" ? "magia" : "poción") +
        " compatible con F" + slot +
        ". Inspecciona el slot con heal.inspectHotbarSlot(" + slot + ")." });
      return false;
    }

    // Las magias no consumen ítems; confirmar por variación de HP.
    const countBefore = actionType === "potion" ? readItemCount(button) : null;
    if (actionType === "potion" && countBefore === 0) {
      stop({ reason: "No quedan objetos en F" + slot });
      return false;
    }

    state.pendingAttempt = {
      kind,
      slot,
      actionType,
      buttonTitle: button.getAttribute("title"),
      attemptedAt: now,
      hpBefore: stats.hp?.current ?? null,
      manaBefore: stats.mana?.current ?? null,
      manaPercentBefore: stats.manaPercent,
      countBefore,
    };

    if (kind === "hp") state.lastHpAttemptAt = now;
    else state.lastManaAttemptAt = now;

    try {
      button.click();
      return true;
    } catch (error) {
      state.pendingAttempt = null;
      stop({ reason: "No se pudo activar F" + slot + ": " + String(error) });
      return false;
    }
  }

  function verifyPending(stats, now) {
    const pending = state.pendingAttempt;
    if (!pending) return false;
    if (now - pending.attemptedAt < Math.max(1200, Number(config.healConfirmMs) || 1500)) {
      return true;
    }

    const countAfter = pending.actionType === "potion"
      ? readItemCount(findHotbarButton(pending.slot, "potion"))
      : null;
    const itemConsumed = pending.actionType === "potion" &&
      pending.countBefore !== null && countAfter !== null &&
      countAfter < pending.countBefore;
    const hpIncreased = stats.hp && pending.hpBefore !== null &&
      stats.hp.current > pending.hpBefore;
    const manaIncreased = stats.mana && pending.manaBefore !== null &&
      stats.mana.current > pending.manaBefore;
    const manaPercentIncreased = stats.manaPercent !== null &&
      pending.manaPercentBefore !== null && stats.manaPercent > pending.manaPercentBefore;

    const confirmed = !!(itemConsumed || (pending.kind === "hp"
      ? hpIncreased : (manaIncreased || manaPercentIncreased)));

    state.lastAction = {
      kind: pending.kind,
      slot: pending.slot,
      actionType: pending.actionType,
      buttonTitle: pending.buttonTitle,
      attemptedAt: new Date(pending.attemptedAt).toISOString(),
      hpBefore: pending.hpBefore,
      hpAfter: stats.hp?.current ?? null,
      manaPercentBefore: pending.manaPercentBefore,
      manaPercentAfter: stats.manaPercent,
      countBefore: pending.countBefore,
      countAfter,
      confirmed,
    };
    state.pendingAttempt = null;

    if (confirmed) {
      state.failedAttempts = 0;
      if (pending.kind === "hp") state.lastHpHealAt = now;
      else state.lastManaHealAt = now;
    } else {
      state.failedAttempts++;
      if (state.failedAttempts >= 2) {
        stop({ reason: "Dos usos sin efecto confirmado; Auto Heal detenido" });
      }
    }
    return false;
  }

  function canUseHpHeal(now = Date.now(), stats = readStats()) {
    const limit = Math.min(100, Math.max(0, Number(config.minHpPercent) || 0));
    return !!(
      stats.hp && stats.hp.current > 0 && stats.hp.current < stats.hp.max &&
      (stats.hp.current / stats.hp.max) * 100 <= limit &&
      normalizeHotbarSlot(config.hpHotbarSlot) &&
      !(detectHotbarAction(findHotbarButton(config.hpHotbarSlot, normalizeHealMode(config.healMode))) === "spell" && stats.manaPercent === 0) &&
      !state.pendingAttempt &&
      now - state.lastHpAttemptAt >= Math.max(3000, Number(config.healCooldownMs) || 0)
    );
  }

  function canUseManaHeal(now = Date.now(), stats = readStats()) {
    const needed = evaluateDom(stats).shouldRefillMana;
    return !!(
      stats.hp && stats.hp.current > 0 &&
      config.manaEnabled && needed === true &&
      normalizeHotbarSlot(config.manaHotbarSlot) &&
      !state.pendingAttempt &&
      now - state.lastManaAttemptAt >= Math.max(3000, Number(config.healCooldownMs) || 0)
    );
  }

  function triggerHpHeal(now = Date.now(), stats = readStats()) {
    return canUseHpHeal(now, stats) && attempt("hp", config.hpHotbarSlot, stats, now);
  }

  function triggerManaHeal(now = Date.now(), stats = readStats()) {
    return canUseManaHeal(now, stats) && attempt("mana", config.manaHotbarSlot, stats, now);
  }

  function tryHeal() {
    const now = Date.now();
    const stats = readStats();
    const result = evaluateDom(stats);
    state.lastResult = result;
    state.lastDecision = result.shouldHeal;

    if (state.pendingAttempt) {
      verifyPending(stats, now);
      return false;
    }

    if (!state.running || state.monitorOnly || !config.enabled) return false;
    if (triggerHpHeal(now, stats)) return true;
    if (!state.running) return false;
    return triggerManaHeal(now, stats);
  }

  function tick() {
    if (!state.running) return;
    try {
      tryHeal();
    } catch (error) {
      stop({ reason: "Error del monitor: " + String(error) });
    } finally {
      if (state.running) {
        state.timerId = window.setTimeout(tick, Math.max(250, Number(config.tickMs) || 300));
      }
    }
  }

  function start(overrides = {}) {
    if (state.running && !state.monitorOnly) return false;
    if (state.running && state.monitorOnly) stop({ persistEnabled: false });
    updateConfig({ ...overrides, enabled: true });

    const first = evaluateDom();
    if (!first.available) {
      config.enabled = false;
      persistConfig();
      state.lastError = "No hay HP válido en Runtime Adapter";
      return false;
    }
    const selectedMode = normalizeHealMode(config.healMode);
    if (!findHotbarButton(config.hpHotbarSlot, selectedMode)) {
      config.enabled = false;
      persistConfig();
      state.lastError = "F" + config.hpHotbarSlot +
        " no tiene un control compatible con " +
        (selectedMode === "auto" ? "Auto" : selectedMode === "spell" ? "Magia" : "Poción") +
        ". Consulta heal.inspectHotbarSlot(" + config.hpHotbarSlot + ").";
      return false;
    }
    if (config.manaEnabled && config.manaHotbarSlot === config.hpHotbarSlot) {
      config.enabled = false;
      persistConfig();
      state.lastError = "Configura teclas diferentes para curación y maná";
      return false;
    }
    if (config.manaEnabled && !findHotbarButton(config.manaHotbarSlot, "potion")) {
      config.enabled = false;
      persistConfig();
      state.lastError = "El slot de maná no es un botón Use Item visible y único";
      return false;
    }

    state.running = true;
    state.monitorOnly = false;
    state.failedAttempts = 0;
    state.lastError = null;
    tick();
    return true;
  }

  function startMonitor() {
    if (state.running) return false;
    state.running = true;
    state.monitorOnly = true;
    state.lastError = null;
    tick();
    return true;
  }

  function stop(options = {}) {
    state.running = false;
    state.monitorOnly = false;
    if (state.timerId !== null) window.clearTimeout(state.timerId);
    state.timerId = null;
    state.pendingAttempt = null;
    if (options.persistEnabled !== false) {
      config.enabled = false;
      persistConfig();
    }
    if (options.reason) state.lastError = options.reason;
    return true;
  }

  function status() {
    return {
      running: state.running,
      monitorOnly: state.monitorOnly,
      config: { ...config },
      detectedHealType: detectHotbarAction(findHotbarButton(config.hpHotbarSlot, "auto")),
      stats: readStats(),
      lastResult: state.lastResult,
      lastDecision: state.lastDecision,
      lastAction: state.lastAction,
      lastError: state.lastError,
      failedAttempts: state.failedAttempts,
      pendingHpAttempt: state.pendingAttempt?.kind === "hp" ? { ...state.pendingAttempt } : null,
      pendingManaAttempt: state.pendingAttempt?.kind === "mana" ? { ...state.pendingAttempt } : null,
      lastHpHealAt: state.lastHpHealAt,
      lastManaHealAt: state.lastManaHealAt,
      lastHpAttemptAt: state.lastHpAttemptAt,
      lastManaAttemptAt: state.lastManaAttemptAt,
    };
  }

  function updateConfig(next = {}) {
    const patch = { ...next };
    for (const prop of ["hpHotbarSlot", "manaHotbarSlot"]) {
      if (Object.prototype.hasOwnProperty.call(patch, prop)) {
        patch[prop] = normalizeHotbarSlot(patch[prop]) ?? config[prop];
      }
    }
    for (const prop of ["minHp", "minMana"]) {
      if (Object.prototype.hasOwnProperty.call(patch, prop)) {
        patch[prop] = Math.max(0, Number(patch[prop]) || 0);
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, "healMode")) {
      patch.healMode = normalizeHealMode(patch.healMode);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "minHpPercent")) {
      patch.minHpPercent = Math.min(100, Math.max(0, Number(patch.minHpPercent) || 0));
    }
    if (Object.prototype.hasOwnProperty.call(patch, "minManaPercent")) {
      patch.minManaPercent = Math.min(100, Math.max(0, Number(patch.minManaPercent) || 0));
    }
    if (Object.prototype.hasOwnProperty.call(patch, "manaEnabled")) {
      patch.manaEnabled = !!patch.manaEnabled;
    }
    for (const [prop, floor] of [
      ["tickMs", 250], ["healCooldownMs", 3000],
      ["healRetryMs", 200], ["healConfirmMs", 1200]
    ]) {
      if (Object.prototype.hasOwnProperty.call(patch, prop)) {
        patch[prop] = Math.max(floor, Number(patch[prop]) || floor);
      }
    }
    Object.assign(config, patch);
    persistConfig();
    return { ...config };
  }

  bot.heal = {
    start, stop, status, updateConfig, readStats, evaluateDom, tryHeal,
    canUseHpHeal, canUseManaHeal, triggerHpHeal, triggerManaHeal,
    normalizeHotbarSlot, inspectHotbarSlot, config,
    // Alias de compatibilidad: todos usan un único temporizador.
    domMonitor: {
      start: startMonitor,
      stop,
      check: () => evaluateDom(),
      status: () => ({ ...status(), running: state.running }),
    },
    autoDomHeal: { start, stop, status },
  };

  if (typeof bot.addCleanup === "function") {
    bot.addCleanup(() => stop({ persistEnabled: false }));
  }
  // No autoencender tras recompilar: verificar personaje y ranuras al iniciar manualmente.
  if (config.enabled) {
    config.enabled = false;
    persistConfig();
  }
};

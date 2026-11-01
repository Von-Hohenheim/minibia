(() => {
  const bundle = window.__minibiaCopilotBundle || window.__minibiaCopilotReloadBundle || {};

  function migrateLegacyStorage() {
    const legacyPrefix = "minibiaBot.";
    const newPrefix = "minibiaCopilot.";
    let migrated = 0;
    try {
      const keys = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key && key.startsWith(legacyPrefix)) keys.push(key);
      }
      keys.forEach((legacyKey) => {
        const newKey = newPrefix + legacyKey.slice(legacyPrefix.length);
        if (window.localStorage.getItem(newKey) != null) return;
        const value = window.localStorage.getItem(legacyKey);
        if (value != null) {
          window.localStorage.setItem(newKey, value);
          migrated += 1;
        }
      });
      if (migrated > 0) {
        console.log("[minibia-copilot] migrated " + migrated + " legacy settings from minibiaBot.* (originals kept)");
      }
    } catch (error) {
      console.error("[minibia-copilot] legacy storage migration failed", error);
    }
  }

  const persistedEnabledModules = [
    ["rune", "minibiaCopilot.rune.config"],
    ["heal", "minibiaCopilot.heal.config"],
    ["invisible", "minibiaCopilot.invisible.config"],
    ["magicShield", "minibiaCopilot.magicShield.config"],
    ["attack", "minibiaCopilot.attack.config"],
    ["cave", "minibiaCopilot.cave.config"],
    ["equipRing", "minibiaCopilot.equipRing.config"],
    ["equipAmulet", "minibiaCopilot.equipAmulet.config"],
    ["eat", "minibiaCopilot.eat.config"],
    ["talk", "minibiaCopilot.talk.config"],
    ["magicWall", "minibiaCopilot.magicWall.config"],
    ["hunt", "minibiaCopilot.hunt.config"],
    ["tracker", "minibiaCopilot.tracker.config"],
    ["alphaWatch", "minibiaCopilot.alphaWatch.config"],
    ["lootbag", "minibiaCopilot.lootbag.config"],
    ["antiBot", "minibiaCopilot.antiBot.config"], 
  ];

  function getPersistedEnabledSnapshot(bot) {
    const snapshot = {};
    const status = typeof bot?.status === "function" ? bot.status() : null;

    persistedEnabledModules.forEach(([moduleName]) => {
      const enabled = status?.[moduleName]?.config?.enabled;
      if (typeof enabled === "boolean") {
        snapshot[moduleName] = enabled;
      }
    });

    return snapshot;
  }

  function restorePersistedEnabledSnapshot(snapshot) {
    persistedEnabledModules.forEach(([moduleName, storageKey]) => {
      if (typeof snapshot?.[moduleName] !== "boolean") {
        return;
      }

      try {
        const rawValue = window.localStorage.getItem(storageKey);
        const config = rawValue ? JSON.parse(rawValue) : {};
        config.enabled = snapshot[moduleName];
        window.localStorage.setItem(storageKey, JSON.stringify(config));
      } catch (error) {
        console.error("[minibia-copilot] failed to restore persisted enabled state", {
          module: moduleName,
          error,
        });
      }
    });
  }

  function boot(currentBundle = bundle) {
    const previousEnabledSnapshot = getPersistedEnabledSnapshot(
      window.minibiaCopilot || window.minibiaBot
    );

    if (window.minibiaCopilot?.destroy) {
      window.minibiaCopilot.destroy();
    }
    if (window.minibiaBot && window.minibiaBot !== window.minibiaCopilot && window.minibiaBot.destroy) {
      try { window.minibiaBot.destroy(); } catch (error) {}
    }

    restorePersistedEnabledSnapshot(previousEnabledSnapshot);

    const bot = currentBundle.createBot();
if (typeof currentBundle.installRuntimeInspectorModule === "function") {
  currentBundle.installRuntimeInspectorModule(bot);
}
if (typeof currentBundle.installRuntimeAdapterModule === "function") {
  currentBundle.installRuntimeAdapterModule(bot);
}

    currentBundle.installPzModule(bot);
    currentBundle.installXrayModule(bot);
    currentBundle.installPanicModule(bot);
    currentBundle.installRuneModule(bot);
    currentBundle.installHealModule(bot);
/**
 * Auto Heal + Runtime Adapter
 * Evaluación de curación mediante datos del DOM.
 * No ejecuta habilidades ni accede a GameClient.
 */
bot.heal.evaluateDom = function evaluateDom() {
  const adapter = bot.runtimeAdapter;

  if (!adapter || typeof adapter.getStats !== "function") {
    return {
      available: false,
      reason: "Runtime Adapter no disponible",
      shouldHeal: null
    };
  }

  const stats = adapter.getStats();

  if (!stats) {
    return {
      available: false,
      reason: "Personaje no encontrado en el DOM",
      shouldHeal: null
    };
  }

  let config = {};

  try {
    config = bot.heal.status()?.config || {};
  } catch (error) {
    console.warn("[Heal DOM] Error de configuración:", error);
  }

  const minHp = Number.isFinite(config.minHp)
    ? config.minHp
    : null;

  const hpValid =
    Number.isFinite(stats.health) &&
    Number.isFinite(stats.maxHealth) &&
    stats.maxHealth > 0 &&
    stats.health >= 0 &&
    stats.health <= stats.maxHealth;

  const manaPercentValid =
    Number.isFinite(stats.manaPercent) &&
    stats.manaPercent >= 0 &&
    stats.manaPercent <= 100;

  const shouldHeal = hpValid && minHp !== null
    ? stats.health <= minHp &&
      stats.health < stats.maxHealth
    : null;

  return {
    available: hpValid,
    name: stats.name,
    health: hpValid ? stats.health : null,
    maxHealth: hpValid ? stats.maxHealth : null,
    healthPercent: hpValid ? stats.healthPercent : null,
    manaPercent: manaPercentValid
      ? stats.manaPercent
      : null,
    minHp,
    shouldHeal,
    manaRefillRequired: null,
    actionExecuted: false,
    source: "runtime-adapter"
  };
};

/**
 * Monitor periódico de Auto Heal mediante Runtime Adapter.
 * Solo evalúa y registra cambios; no ejecuta curaciones.
 */
if (bot.heal && typeof bot.heal.evaluateDom === "function") {
  const monitorState = {
    timer: null,
    lastResult: null,
    lastDecision: null,
    lastError: null
  };

  function checkHeal() {
    let result;

    try {
      result = bot.heal.evaluateDom();
      monitorState.lastError = null;
    } catch (error) {
      monitorState.lastError = String(error);
      result = null;
    }

    monitorState.lastResult = result;

    const decision =
      result?.available === true &&
      typeof result.shouldHeal === "boolean"
        ? result.shouldHeal
        : null;

    if (decision !== monitorState.lastDecision) {
      monitorState.lastDecision = decision;

      if (decision === true) {
        console.warn(
          "[Auto Heal] Curación necesaria:",
          result.health,
          "/",
          result.maxHealth,
          "HP"
        );
      } else if (decision === false) {
        console.info(
          "[Auto Heal] HP fuera del umbral de curación:",
          result.health,
          "/",
          result.maxHealth
        );
      }
    }

    return result;
  }

  const domMonitor = {
    start() {
      if (monitorState.timer !== null) return false;

      checkHeal();

      monitorState.timer = setInterval(
        checkHeal,
        300
      );

      return true;
    },

    stop() {
      if (monitorState.timer === null) return false;

      clearInterval(monitorState.timer);
      monitorState.timer = null;
      return true;
    },

    check: checkHeal,

    status() {
      return {
        running: monitorState.timer !== null,
        lastResult: monitorState.lastResult,
        lastDecision: monitorState.lastDecision,
        lastError: monitorState.lastError,
        actionExecuted: false
      };
    }
  };

  bot.heal.domMonitor = domMonitor;

  if (typeof bot.addCleanup === "function") {
    bot.addCleanup(() => domMonitor.stop());
  }
}


    currentBundle.installAutoInvisibleModule(bot);
    currentBundle.installAutoMagicShieldModule(bot);
    currentBundle.installAutoAttackModule(bot);
    currentBundle.installCaveModule(bot);
    currentBundle.installEquipRingModule(bot);
    currentBundle.installEquipAmuletModule(bot);
    currentBundle.installAutoEatModule(bot);
    currentBundle.installTalkModule(bot);
    currentBundle.installMagicWallModule(bot);
    currentBundle.installHuntModule(bot);
    currentBundle.installTrackerModule(bot);
    currentBundle.installAlphaWatchModule(bot);
    currentBundle.installFightEstimatorModule(bot);
    currentBundle.installLootbagModule(bot);
	  currentBundle.installAntiBotModule(bot);
    currentBundle.installPanel(bot);

    bot.ui.inject();

    bot.start = (...args) => bot.rune.start(...args);
    bot.stop = (...args) => bot.rune.stop(...args);
    bot.reload = () => window.minibiaCopilotReload?.();

    bot.__pauseSnapshot = null;
    const PAUSEABLE_MODULES = [
      "rune", "heal", "attack", "eat", "invisible", "magicShield",
      "equipRing", "equipAmulet", "talk", "lootbag",
      "panic", "hunt", "magicWall", "alphaWatch", "tracker",
    ];

    bot.pauseAll = function pauseAll() {
      if (bot.__pauseSnapshot) return false;
      const snapshot = {};
      PAUSEABLE_MODULES.forEach((name) => {
        const mod = bot[name];
        if (!mod || typeof mod.stop !== "function") return;
        const wasRunning = !!mod.status?.().running;
        snapshot[name] = wasRunning;
        if (wasRunning) {
          try { mod.stop({ persistEnabled: false }); } catch (error) {}
        }
      });
      if (bot.cave?.pause && bot.cave?.isPaused) {
        snapshot.cave = !bot.cave.isPaused();
        if (snapshot.cave) {
          try { bot.cave.pause(); } catch (error) {}
        }
      }
      bot.__pauseSnapshot = snapshot;
      bot.log("everything paused", snapshot);
      return true;
    };

    bot.resumeAll = function resumeAll() {
      if (!bot.__pauseSnapshot) return false;
      const snapshot = bot.__pauseSnapshot;
      PAUSEABLE_MODULES.forEach((name) => {
        if (!snapshot[name]) return;
        const mod = bot[name];
        if (mod && typeof mod.start === "function") {
          try { mod.start(); } catch (error) {}
        }
      });
      if (snapshot.cave && bot.cave?.resume) {
        try { bot.cave.resume(); } catch (error) {}
      }
      bot.__pauseSnapshot = null;
      bot.log("everything resumed");
      return true;
    };

    bot.toggleAllPaused = function toggleAllPaused() {
      if (bot.__pauseSnapshot) {
        bot.resumeAll();
        return false;
      }
      bot.pauseAll();
      return true;
    };

    bot.isAllPaused = function isAllPaused() {
      return !!bot.__pauseSnapshot;
    };

    bot.status = () => ({
      version: bot.version,
      pz: {
        home: bot.pz.getHomePz(),
      },
      xray: bot.xray.status(),
      panic: bot.panic.status(),
      rune: bot.rune.status(),
      heal: bot.heal.status(),
      invisible: bot.invisible.status(),
      magicShield: bot.magicShield.status(),
      attack: bot.attack.status(),
      cave: bot.cave.status(),
      equipRing: bot.equipRing.status(),
      equipAmulet: bot.equipAmulet.status(),
      eat: bot.eat.status(),
      talk: bot.talk.status(),
      magicWall: bot.magicWall.status(),
      hunt: bot.hunt.status(),
      tracker: bot.tracker.status(),
      alphaWatch: bot.alphaWatch.status(),
      fightEstimator: bot.fightEstimator.status(),
      lootbag: bot.lootbag.status(),
	    antiBot: bot.antiBot.status(),
    });

    window.minibiaCopilot = bot;
    window.minibiaBot = bot;
    window.pzBot = bot.pz;

    console.log("[minibia-copilot] ready", {
      version: bot.version,
      modules: ["pz", "xray", "panic", "rune", "heal", "invisible", "magicShield", "attack", "cave", "equipRing", "equipAmulet", "eat", "talk", "magicWall", "hunt", "tracker", "alphaWatch", "ui"],
    });
    console.log("minibiaCopilot.reload()");
    console.log("minibiaCopilot.xray.status()");
    console.log("minibiaCopilot.panic.status()");
    console.log("minibiaCopilot.pz.goToNearestPz()");
    console.log("minibiaCopilot.pz.setHomePzCurrentSpot()");
    console.log("minibiaCopilot.pz.goToHomePz()");
    console.log("minibiaCopilot.rune.start()");
    console.log("minibiaCopilot.rune.stop()");
    console.log("minibiaCopilot.heal.start()");
    console.log("minibiaCopilot.heal.stop()");
    console.log("minibiaCopilot.invisible.start()");
    console.log("minibiaCopilot.invisible.stop()");
    console.log("minibiaCopilot.magicShield.start()");
    console.log("minibiaCopilot.magicShield.stop()");
    console.log("minibiaCopilot.attack.start()");
    console.log("minibiaCopilot.attack.stop()");
    console.log("minibiaCopilot.cave.addWaypointCurrentSpot()");
    console.log("minibiaCopilot.cave.start()");
    console.log("minibiaCopilot.cave.stop()");
    console.log("minibiaCopilot.equipRing.start()");
    console.log("minibiaCopilot.equipRing.stop()");
    console.log("minibiaCopilot.eat.start()");
    console.log("minibiaCopilot.eat.stop()");
    console.log("minibiaCopilot.talk.updateConfig({ apiKey: \"...\" })");
    console.log("minibiaCopilot.talk.start()");
    console.log("minibiaCopilot.talk.stop()");
    console.log("minibiaCopilot.magicWall.start()");
    console.log("minibiaCopilot.magicWall.stop()");
    console.log("minibiaCopilot.cave.addRopeWaypointCurrentSpot()");
    console.log("minibiaCopilot.cave.addLadderWaypointCurrentSpot()");
    console.log("minibiaCopilot.cave.addShovelWaypointCurrentSpot()");
    console.log("minibiaCopilot.cave.addUseWaypointCurrentSpot()");
    return bot;
  }

  window.__minibiaCopilotReloadBundle = bundle;
  window.minibiaCopilotReload = () => boot(window.__minibiaCopilotReloadBundle || bundle);
  window.minibiaBotReload = window.minibiaCopilotReload;
  delete window.__minibiaCopilotBundle;
  migrateLegacyStorage();
  boot(bundle);
})();

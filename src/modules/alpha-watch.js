window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installAlphaWatchModule = function installAlphaWatchModule(bot) {
  const configStorageKey = "minibiaCopilot.alphaWatch.config";

  const state = {
    running: false,
    pollTimerId: null,
    seenIds: new Map(),
    lastSighting: null,
  };

  const config = Object.assign(
    {
      enabled: false,
      pollIntervalMs: 2000,
      pattern: "^alpha\\b",
      patternFlags: "i",
      sightingCooldownMs: 90000,
    },
    bot.storage.get(configStorageKey, {})
  );

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function getMatcher() {
    try {
      return new RegExp(String(config.pattern || "^alpha\\b"), String(config.patternFlags || "i"));
    } catch (error) {
      bot.log("alpha watch: invalid pattern, falling back to /^alpha\\b/i", { error: error?.message || error });
      return /^alpha\b/i;
    }
  }

  function pruneSeen(now) {
    const cutoff = now - Math.max(15000, Number(config.sightingCooldownMs) || 90000);
    for (const [id, seenAt] of state.seenIds.entries()) {
      if (seenAt < cutoff) state.seenIds.delete(id);
    }
  }

  function getVisibleAlphas() {
    const monsters = bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || [];
    const matcher = getMatcher();
    const playerId = window.gameClient?.player?.id;
    return monsters.filter((creature) => {
      if (!creature || creature.masterId === playerId) return false;
      const name = String(creature.name || "").trim();
      return matcher.test(name);
    });
  }

  function tick() {
    if (!state.running) return;
    try {
      const now = Date.now();
      pruneSeen(now);

      const alphas = getVisibleAlphas();
      const playerPosition = bot.getPlayerPosition?.();

      for (const creature of alphas) {
        const id = Number(creature.id);
        if (!Number.isFinite(id)) continue;
        if (state.seenIds.has(id)) continue;
        state.seenIds.set(id, now);

        const pos = creature.getPosition?.() || creature.__position || null;
        let distance = null;
        if (pos && playerPosition && pos.z === playerPosition.z) {
          distance = Math.max(Math.abs(pos.x - playerPosition.x), Math.abs(pos.y - playerPosition.y));
        }

        state.lastSighting = {
          name: String(creature.name || "Alpha"),
          id,
          at: now,
          distance,
          position: pos ? { x: pos.x, y: pos.y, z: pos.z } : null,
        };

        bot.log("alpha watch: sighting", state.lastSighting);
        try {
          bot.ui?.showTrackerNotification?.("alpha", state.lastSighting.name, state.lastSighting);
        } catch (error) {}
      }

      try { bot.ui?.refreshAlphaWatchStatus?.(); } catch (error) {}
    } catch (error) {
      bot.log("alpha watch tick failed", error?.message || error);
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides);
    config.enabled = true;
    persistConfig();
    if (state.running) return false;
    state.running = true;
    const interval = Math.max(500, Math.min(10000, Number(config.pollIntervalMs) || 2000));
    state.pollTimerId = window.setInterval(tick, interval);
    bot.log("alpha watch started", { pollIntervalMs: interval, pattern: config.pattern });
    tick();
    return true;
  }

  function stop(options = {}) {
    const persistEnabled = options.persistEnabled !== false;
    state.running = false;
    if (state.pollTimerId != null) {
      window.clearInterval(state.pollTimerId);
      state.pollTimerId = null;
    }
    state.seenIds.clear();
    if (persistEnabled) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("alpha watch stopped");
    return true;
  }

  function status() {
    const alphas = state.running ? getVisibleAlphas() : [];
    return {
      running: state.running,
      config: { ...config },
      visibleAlphas: alphas.map((c) => ({
        id: c.id,
        name: c.name,
        position: c.getPosition?.() || c.__position || null,
      })),
      lastSighting: state.lastSighting,
      seenRecently: state.seenIds.size,
    };
  }

  function updateConfig(nextConfig = {}) {
    Object.assign(config, nextConfig);
    persistConfig();
    if (state.running) {
      stop({ persistEnabled: false });
      start();
    }
    bot.log("alpha watch config updated", { ...config });
    return { ...config };
  }

  function clearSeen() {
    state.seenIds.clear();
    bot.log("alpha watch: cleared seen-creature memory");
    return true;
  }

  bot.addCleanup(() => {
    if (state.pollTimerId != null) {
      window.clearInterval(state.pollTimerId);
      state.pollTimerId = null;
    }
  });

  if (config.enabled) start();

  bot.alphaWatch = {
    start,
    stop,
    status,
    updateConfig,
    clearSeen,
    getVisibleAlphas,
    config,
  };
};

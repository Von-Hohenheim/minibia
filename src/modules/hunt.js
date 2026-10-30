window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installHuntModule = function installHuntModule(bot) {
  const configStorageKey = "minibiaCopilot.hunt.config";

  const state = {
    enabled: false,
    pollTimerId: null,
    installRetryTimerId: null,
    patches: null,
    lastInfo: null,
    lastUpdatedAt: 0,
    suppressNextModalOpen: false,
  };

  const config = Object.assign(
    {
      autoPoll: false,
      pollIntervalMs: 10000,
      suppressModalOnRefresh: true,
    },
    bot.storage.get(configStorageKey, {})
  );

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function captureHuntInfo(info) {
    if (!info || typeof info !== "object") return;
    state.lastInfo = info;
    state.lastUpdatedAt = Date.now();
    try { bot.ui?.refreshHuntStatus?.(); } catch (error) {}
  }

  function getPacketReaderPrototype() {
    try {
      if (typeof PacketReader !== "undefined" && PacketReader?.prototype) {
        return PacketReader.prototype;
      }
    } catch (error) {}
    return null;
  }

  function getModalManager() {
    return window.gameClient?.interface?.modalManager || null;
  }

  function installPatches() {
    if (state.patches) return true;

    const reader = getPacketReaderPrototype();
    const mgr = getModalManager();
    if (!reader || typeof reader.readHuntInfo !== "function") return false;
    if (!mgr || typeof mgr.open !== "function") return false;

    const originalReadHuntInfo = reader.readHuntInfo;
    const originalOpen = mgr.open;

    reader.readHuntInfo = function patchedReadHuntInfo() {
      const result = originalReadHuntInfo.call(this);
      try {
        if (result) captureHuntInfo(result);
      } catch (error) {
        console.error("[minibia-copilot] hunt readHuntInfo hook failed", error);
      }
      return result;
    };

    mgr.open = function patchedOpen(key, data) {
      if (
        key === "hunt-info-modal" &&
        state.suppressNextModalOpen &&
        !this.isOpened?.()
      ) {
        state.suppressNextModalOpen = false;
        if (data) {
          try { captureHuntInfo(data); } catch (error) {}
        }
        return null;
      }
      return originalOpen.apply(this, arguments);
    };

    state.patches = {
      reader,
      originalReadHuntInfo,
      mgr,
      originalOpen,
    };
    bot.log("hunt analyzer hooks installed");
    return true;
  }

  function stopInstallRetry() {
    if (state.installRetryTimerId != null) {
      window.clearInterval(state.installRetryTimerId);
      state.installRetryTimerId = null;
    }
  }

  function tryInstallWithRetry() {
    if (installPatches()) return;
    bot.log("hunt analyzer: dependencies not ready, retrying");
    stopInstallRetry();
    state.installRetryTimerId = window.setInterval(() => {
      if (!state.enabled) {
        stopInstallRetry();
        return;
      }
      if (installPatches()) stopInstallRetry();
    }, 1000);
  }

  function uninstallPatches() {
    stopInstallRetry();
    if (!state.patches) return;
    const { reader, originalReadHuntInfo, mgr, originalOpen } = state.patches;
    if (reader.readHuntInfo !== originalReadHuntInfo) reader.readHuntInfo = originalReadHuntInfo;
    if (mgr.open !== originalOpen) mgr.open = originalOpen;
    state.patches = null;
  }

  function refresh(options = {}) {
    const suppress = options.suppressModal !== false && config.suppressModalOnRefresh;
    if (suppress) state.suppressNextModalOpen = true;
    const sent = bot.sendChat?.("/hunt");
    if (!sent && suppress) state.suppressNextModalOpen = false;
    return !!sent;
  }

  function sendCommand(command, options = {}) {
    const suppress = options.suppressModal !== false && config.suppressModalOnRefresh;
    if (suppress) state.suppressNextModalOpen = true;
    const sent = bot.sendChat?.(command);
    if (!sent && suppress) state.suppressNextModalOpen = false;
    return !!sent;
  }

  function startAutoPoll() {
    if (state.pollTimerId != null) return;
    state.pollTimerId = window.setInterval(() => {
      try {
        refresh();
      } catch (error) {
        bot.log("hunt auto-poll failed", error?.message || error);
      }
    }, Math.max(2000, Number(config.pollIntervalMs) || 10000));
  }

  function stopAutoPoll() {
    if (state.pollTimerId != null) {
      window.clearInterval(state.pollTimerId);
      state.pollTimerId = null;
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides);
    config.autoPoll = true;
    persistConfig();
    if (state.enabled) {
      bot.log("hunt analyzer already running");
      return false;
    }
    state.enabled = true;
    tryInstallWithRetry();
    if (config.autoPoll) {
      startAutoPoll();
      refresh();
    }
    bot.log("hunt analyzer started", { pollIntervalMs: config.pollIntervalMs });
    return true;
  }

  function stop(options = {}) {
    const persistEnabled = options.persistEnabled !== false;
    state.enabled = false;
    stopAutoPoll();
    uninstallPatches();
    if (persistEnabled) {
      config.autoPoll = false;
      persistConfig();
    }
    bot.log("hunt analyzer stopped");
    return true;
  }

  function status() {
    return {
      running: state.enabled,
      config: { ...config },
      hasInfo: !!state.lastInfo,
      lastUpdatedAt: state.lastUpdatedAt,
      lastInfo: state.lastInfo,
    };
  }

  function updateConfig(nextConfig = {}) {
    const wasAutoPoll = config.autoPoll;
    Object.assign(config, nextConfig);
    persistConfig();
    if (state.enabled) {
      if (config.autoPoll && !wasAutoPoll) {
        startAutoPoll();
      } else if (!config.autoPoll && wasAutoPoll) {
        stopAutoPoll();
      }
    }
    bot.log("hunt analyzer config updated", { ...config });
    return { ...config };
  }

  function startSession() {
    return sendCommand("/hunt start");
  }
  function stopSession() {
    return sendCommand("/hunt stop");
  }
  function pauseSession() {
    return sendCommand("/hunt pause");
  }
  function resumeSession() {
    return sendCommand("/hunt resume");
  }
  function resetSession() {
    return sendCommand("/hunt reset");
  }

  bot.addCleanup(() => {
    stopAutoPoll();
    uninstallPatches();
  });

  state.enabled = true;
  tryInstallWithRetry();
  if (config.autoPoll) {
    startAutoPoll();
  }

  bot.hunt = {
    start,
    stop,
    status,
    updateConfig,
    refresh,
    startSession,
    stopSession,
    pauseSession,
    resumeSession,
    resetSession,
    config,
    getLastInfo: () => state.lastInfo,
  };
};

window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installAntiBotModule = function installAntiBotModule(bot) {
  const configStorageKey = "minibiaCopilot.antiBot.config";
  const bannerId = "minibia-copilot-antibot-banner";
  const originalTitle = document.title;
  const seenEntries = new WeakSet();
  const state = {
    running: false,
    pollTimerId: null,
    alarmTimerId: null,
    titleTimerId: null,
    clearTimerId: null,
    alerting: false,
    secondsLeft: null,
    lastWarningAt: 0,
    pausedByUs: false,
  };

  const config = Object.assign(
    {
      enabled: true,
      pollMs: 500,
      // Se guardan como texto porque localStorage no puede almacenar RegExp.
      warnPattern: "anti-?bot rune check in (\\d+) seconds?",
      passedPattern: "verification passed",
      urgentAtSec: 30,
      alarmEveryMs: 3000,
      urgentAlarmEveryMs: 1200,
      autoClearMs: 120000,
      notify: true,
      pauseAllOnWarning: false, // pausa todo el bot al primer aviso
      resumeAfterPassed: true,  // reanuda solo si lo pausó este módulo y llega "Verification passed"
    },
    bot.storage.get(configStorageKey, {})
  );

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  // ---------------------------------------------------------------------------
  // Lectura del chat (misma fuente que usa el módulo panic)
  // ---------------------------------------------------------------------------

  function getChannelEntries() {
    const out = [];
    const channels = window.gameClient?.interface?.channelManager?.channels || [];
    for (const channel of channels) {
      for (const entry of channel?.__contents || []) {
        if (entry && typeof entry === "object") out.push(entry);
      }
    }
    return out;
  }

  function recentMessages(limit = 10) {
    return getChannelEntries()
      .slice(-limit)
      .map((entry) => ({ message: String(entry.message || ""), time: entry.__time || null }));
  }

  function markExistingAsSeen() {
    getChannelEntries().forEach((entry) => seenEntries.add(entry));
  }

  // ---------------------------------------------------------------------------
  // Alerta (banner, sonido, título, notificación)
  // ---------------------------------------------------------------------------

  function setBanner(text, urgent) {
    let el = document.getElementById(bannerId);
    if (!el) {
      el = document.createElement("div");
      el.id = bannerId;
      el.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:12px;" +
        "color:#fff;font:bold 16px sans-serif;text-align:center;cursor:pointer";
      el.onclick = () => clearAlert("dismissed");
      document.body.appendChild(el);
    }
    el.style.background = urgent ? "#c00" : "#d98200";
    el.textContent = text;
  }

  function scheduleAlarm(urgent) {
    if (state.alarmTimerId != null) window.clearInterval(state.alarmTimerId);
    const every = urgent ? config.urgentAlarmEveryMs : config.alarmEveryMs;
    bot.playAlarm?.();
    state.alarmTimerId = window.setInterval(() => bot.playAlarm?.(), Math.max(500, every));
  }

  function startTitleFlash() {
    if (state.titleTimerId != null) return;
    let on = false;
    state.titleTimerId = window.setInterval(() => {
      on = !on;
      document.title = on ? "\u26A0 ANTI-BOT \u26A0" : originalTitle;
    }, 800);
  }

  function pauseBot() {
    if (!config.pauseAllOnWarning) return;
    state.pausedByUs = !!bot.pauseAll?.(); // false si ya estaba pausado por ti
  }

  function onWarning(seconds, text) {
    const urgent = seconds <= config.urgentAtSec;
    const first = !state.alerting;

    state.alerting = true;
    state.secondsLeft = seconds;
    state.lastWarningAt = Date.now();

    if (first) {
      pauseBot();
      startTitleFlash();
    }

    setBanner(`\u26A0 ANTI-BOT RUNE \u2014 verificación en ${seconds}s`, urgent);
    scheduleAlarm(urgent);

    if (config.notify && "Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("Minibia: anti-bot rune", { body: `Verificación en ${seconds} segundos` });
      } catch (error) {}
    }

    if (state.clearTimerId != null) window.clearTimeout(state.clearTimerId);
    state.clearTimerId = window.setTimeout(() => clearAlert("timeout"), config.autoClearMs);

    bot.log("anti-bot warning", { seconds, text });
  }

  function clearAlert(reason = "manual") {
    const wasAlerting = state.alerting;
    state.alerting = false;
    state.secondsLeft = null;

    if (state.pausedByUs) {
      if (reason === "verification passed" && config.resumeAfterPassed) {
        bot.resumeAll?.();
      }
      state.pausedByUs = false;
    }

    [
      ["alarmTimerId", window.clearInterval],
      ["titleTimerId", window.clearInterval],
      ["clearTimerId", window.clearTimeout],
    ].forEach(([key, fn]) => {
      if (state[key] != null) {
        fn.call(window, state[key]);
        state[key] = null;
      }
    });

    document.title = originalTitle;
    document.getElementById(bannerId)?.remove();
    if (wasAlerting) bot.log("anti-bot alert cleared", reason);
    return wasAlerting;
  }

  // ---------------------------------------------------------------------------
  // Escaneo periódico
  // ---------------------------------------------------------------------------

  function scan() {
    let warnRe;
    let passedRe;
    try {
      warnRe = new RegExp(config.warnPattern, "i");
      passedRe = new RegExp(config.passedPattern, "i");
    } catch (error) {
      return;
    }

    for (const entry of getChannelEntries()) {
      if (seenEntries.has(entry)) continue;
      seenEntries.add(entry);

      const text = String(entry.message || "");
      const match = text.match(warnRe);
      if (match) {
        onWarning(Number(match[1]), text);
      } else if (state.alerting && passedRe.test(text)) {
        clearAlert("verification passed");
      }
    }
  }

  function tick() {
    if (!state.running) return;
    try {
      scan();
    } catch (error) {
      bot.log("anti-bot scan failed", error?.message || error);
    } finally {
      if (state.running) {
        state.pollTimerId = window.setTimeout(tick, Math.max(200, Number(config.pollMs) || 500));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();
    if (state.running) return false;

    state.running = true;
    markExistingAsSeen(); // no reaccionar a mensajes viejos del chat
    if (config.notify && "Notification" in window && Notification.permission === "default") {
      try {
        Notification.requestPermission();
      } catch (error) {}
    }
    bot.log("anti-bot alert started");
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;
    if (state.pollTimerId != null) {
      window.clearTimeout(state.pollTimerId);
      state.pollTimerId = null;
    }
    clearAlert("stopped");
    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("anti-bot alert stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      alerting: state.alerting,
      secondsLeft: state.secondsLeft,
      lastWarningAt: state.lastWarningAt,
      pausedByUs: state.pausedByUs,
      config: { ...config },
    };
  }

  function updateConfig(nextConfig = {}) {
    Object.assign(config, nextConfig);
    persistConfig();
    bot.log("anti-bot config updated", { ...config });
    return { ...config };
  }

  bot.antiBot = {
    start,
    stop,
    status,
    updateConfig,
    recentMessages,
    ack: () => clearAlert("manual"),
    test: (seconds = 60) => onWarning(Number(seconds) || 60, "test"),
    config,
  };

  bot.addCleanup(() => stop({ persistEnabled: false }));

  if (config.enabled) {
    start();
  }
};

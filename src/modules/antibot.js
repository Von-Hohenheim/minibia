window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installAntiBotModule = function installAntiBotModule(bot) {
  const configStorageKey = "minibiaCopilot.antiBot.config";
  const noticeId = "minibia-antibot-notice";
  const checkRe = /(?:anti-?bot\s+rune\s+check|anti-?bot\s+verification\s+will\s+appear)(?:\s+in\s+(\d+)\s+seconds?)?/i;
  const passedRe = /verification passed/i;

  const config = Object.assign(
    { enabled: true, cooldownMs: 3000, noticeMaxMs: 90000, pollMs: 1000, debug: false },
    bot.storage.get(configStorageKey, {})
  );

  const state = {
    running: false,
    lastAlertAt: 0,
    lastSeconds: null,
    lastSource: null,
    debugLogged: 0,
  };

  let packetHook = null;       // { proto, original, wrapper }
  let cancelUnsub = null;
  let installTimer = null;
  let installAttempts = 0;
  let pollTimer = null;
  let noticeTimer = null;
  let audioCtx = null;
  let originalTitle = null;
  let titleTimer = null;
  const seen = new Set();
  const gestureEvents = ["pointerdown", "keydown"];

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  // ---------- Extracción de texto ----------
  function extractText(value, depth = 0) {
    if (value == null || depth > 2) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map((v) => extractText(v, depth + 1)).join(" ");
    if (typeof value === "object") {
      const direct = value.message ?? value.text ?? value.msg ?? value.content;
      if (direct != null) return extractText(direct, depth + 1);
      try {
        return JSON.stringify(value).slice(0, 2000);
      } catch (error) {
        return "";
      }
    }
    return "";
  }

  // ---------- Alarma ----------
  function beep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      audioCtx = audioCtx || new Ctx();
      audioCtx.resume?.();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 1);
      return true;
    } catch (error) {
      return false;
    }
  }

  function raiseAlarm() {
    let played = false;
    try {
      played = !!bot.playAlarm?.();
    } catch (error) {
      console.error("[AntiBot] alarm error", error);
    }
    beep(); // respaldo siempre: si el audio principal fue bloqueado, esto avisa igual
    return played;
  }

  function unlockOnGesture() {
    try { bot.unlockAudio?.(); } catch (error) {}
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        audioCtx = audioCtx || new Ctx();
        audioCtx.resume?.();
      }
    } catch (error) {}
  }

  function attachGestureListeners() {
    gestureEvents.forEach((name) =>
      window.addEventListener(name, unlockOnGesture, { once: true, capture: true })
    );
  }

  function detachGestureListeners() {
    gestureEvents.forEach((name) =>
      window.removeEventListener(name, unlockOnGesture, { capture: true })
    );
  }

  // ---------- Aviso visual ----------
  function startTitleFlash() {
    if (titleTimer != null) return;
    originalTitle = document.title;
    let on = false;
    titleTimer = window.setInterval(() => {
      on = !on;
      document.title = on ? "⚠ ANTI-BOT CHECK" : originalTitle;
    }, 700);
  }

  function stopTitleFlash() {
    if (titleTimer != null) {
      window.clearInterval(titleTimer);
      titleTimer = null;
    }
    if (originalTitle != null) {
      document.title = originalTitle;
      originalTitle = null;
    }
  }

  function showNotice(seconds) {
    let notice = document.getElementById(noticeId);
    if (!notice) {
      notice = document.createElement("div");
      notice.id = noticeId;
      Object.assign(notice.style, {
        position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)",
        zIndex: "2147483647", background: "#8b0000", color: "#fff",
        padding: "16px 24px", border: "2px solid #ff5555", borderRadius: "8px",
        font: "bold 18px sans-serif", boxShadow: "0 4px 20px #0009", textAlign: "center",
        pointerEvents: "none",
      });
      document.body.appendChild(notice);
    }

    notice.textContent = seconds != null
      ? `⚠ ANTI-BOT RUNE CHECK en ${seconds}s — Atiéndelo manualmente`
      : "⚠ ANTI-BOT RUNE CHECK — Atiéndelo manualmente";

    startTitleFlash();
    if (noticeTimer != null) window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(hideNotice, config.noticeMaxMs);
  }

  function hideNotice() {
    if (noticeTimer != null) {
      window.clearTimeout(noticeTimer);
      noticeTimer = null;
    }
    document.getElementById(noticeId)?.remove();
    stopTitleFlash();
  }

  // ---------- Lógica de detección ----------
  function handleText(text, source) {
    if (!state.running || !text) return false;

    if (passedRe.test(text)) {
      hideNotice();
      bot.log("anti-bot verification passed", { source });
      return true;
    }

    const match = checkRe.exec(text);
    if (!match) return false;

    const now = Date.now();
    if (now - state.lastAlertAt < config.cooldownMs) return true; // misma alerta vista por otra vía

    state.lastAlertAt = now;
    state.lastSeconds = match[1] != null ? Number(match[1]) : null;
    state.lastSource = source;

    console.warn("[AntiBot] ¡Comprobación detectada!", { text, source });
    raiseAlarm();
    showNotice(state.lastSeconds);
    return true;
  }

  // ---------- Hook 1: PacketHandler.handleServerMessage ----------
  function installPacketHook() {
    if (packetHook) return true;

    const Handler = typeof PacketHandler !== "undefined" ? PacketHandler : window.PacketHandler;
    const proto = Handler?.prototype;
    if (!proto || typeof proto.handleServerMessage !== "function") return false;

    const original = proto.handleServerMessage;
    const wrapper = function () {
      if (state.running) {
        try {
          for (let i = 0; i < arguments.length; i += 1) {
            const text = extractText(arguments[i]);
            if (config.debug && state.debugLogged < 20) {
              state.debugLogged += 1;
              console.log("[AntiBot][debug] handleServerMessage arg", typeof arguments[i], arguments[i], "->", text);
            }
            if (handleText(text, "packet")) break;
          }
        } catch (error) {
          console.error("[AntiBot] packet hook error", error);
        }
      }
      return original.apply(this, arguments);
    };

    proto.handleServerMessage = wrapper;
    packetHook = { proto, original, wrapper };
    bot.log("anti-bot packet hook installed");
    return true;
  }

  function removePacketHook() {
    if (!packetHook) return;
    const { proto, original, wrapper } = packetHook;
    // Solo restauramos si nadie parcheó encima; si no, el wrapper queda inerte (running=false).
    if (proto.handleServerMessage === wrapper) {
      proto.handleServerMessage = original;
    }
    packetHook = null;
  }

  // ---------- Hook 2: mensajes rojos (setCancelMessage) ----------
  function installCancelHook() {
    if (cancelUnsub || typeof bot.onCancelMessage !== "function") return;
    cancelUnsub = bot.onCancelMessage((message) => handleText(extractText(message), "cancel-message"));
  }

  function removeCancelHook() {
    if (cancelUnsub) {
      try { cancelUnsub(); } catch (error) {}
      cancelUnsub = null;
    }
  }

  // ---------- Hook 3: sondeo del chat ----------
  function readChannelEntries() {
    const channels = window.__minibiaGameClient?.interface?.channelManager?.channels || [];
    const out = [];
    for (const channel of channels) {
      for (const entry of channel?.__contents || []) {
        out.push({
          key: `${channel?.name}|${entry?.__time}|${entry?.message}`,
          text: String(entry?.message || ""),
        });
      }
    }
    return out;
  }

  function seedSeen() {
    readChannelEntries().forEach((entry) => seen.add(entry.key));
  }

  function pollChannels() {
    if (!state.running) return;
    try {
      for (const entry of readChannelEntries()) {
        if (seen.has(entry.key)) continue;
        seen.add(entry.key);
        handleText(entry.text, "channel");
      }
      if (seen.size > 2000) {
        seen.clear();
        seedSeen();
      }
    } catch (error) {
      console.error("[AntiBot] poll error", error);
    }
  }

  function logHookDiagnostics() {
    const Handler = typeof PacketHandler !== "undefined" ? PacketHandler : window.PacketHandler;
    console.warn("[AntiBot] no se pudo instalar el hook de PacketHandler.handleServerMessage", {
      hasPacketHandler: !!Handler,
      methods: Handler?.prototype
        ? Object.getOwnPropertyNames(Handler.prototype).filter((n) => /message|chat|text/i.test(n))
        : [],
    });
  }

  // ---------- Ciclo de vida ----------
  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();

    if (state.running) return false;
    state.running = true;
    state.debugLogged = 0;

    seedSeen();
    attachGestureListeners();
    installCancelHook();

    installAttempts = 0;
    if (!installPacketHook()) {
      installTimer = window.setInterval(() => {
        installAttempts += 1;
        if (installPacketHook()) {
          window.clearInterval(installTimer);
          installTimer = null;
        } else if (installAttempts === 30) {
          logHookDiagnostics(); // el sondeo del chat sigue cubriendo mientras tanto
        }
      }, 1000);
    }

    pollTimer = window.setInterval(pollChannels, Math.max(250, Number(config.pollMs) || 1000));
    bot.log("anti-bot started");
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (installTimer != null) { window.clearInterval(installTimer); installTimer = null; }
    if (pollTimer != null) { window.clearInterval(pollTimer); pollTimer = null; }

    removePacketHook();
    removeCancelHook();
    detachGestureListeners();
    hideNotice();
    seen.clear();

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }

    bot.log("anti-bot stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      hooks: {
        packet: !!packetHook,
        cancelMessage: !!cancelUnsub,
        channelPoll: pollTimer != null,
      },
      lastAlertAt: state.lastAlertAt,
      lastSeconds: state.lastSeconds,
      lastSource: state.lastSource,
    };
  }

  function updateConfig(next = {}) {
    Object.assign(config, next);
    persistConfig();
    return { ...config };
  }

  bot.addCleanup(() => stop({ persistEnabled: false }));

  bot.antiBot = {
    start,
    stop,
    status,
    updateConfig,
    checkMessage: (text) => handleText(String(text || ""), "manual"),
    debug(enabled = true) {
      config.debug = !!enabled;
      state.debugLogged = 0;
      persistConfig();
      return config.debug;
    },
    config,
  };

  if (config.enabled) start();
};
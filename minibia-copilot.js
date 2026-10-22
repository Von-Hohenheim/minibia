window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.createBot = function createBot() {
  const cleanups = [];
  const defaultAlarmAudioSrc = "https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3f/ACA_Allertor_125_video.ogv/ACA_Allertor_125_video.ogv.480p.vp9.webm";
  const alarmAudioSrcStorageKey = "minibiaCopilot.audio.alarmSrc";
  const recentSentChats = [];
  const reconnectButtonSelectors = [
    "button",
    "[role=\"button\"]",
    "input[type=\"button\"]",
    "input[type=\"submit\"]",
    "a",
    ".button",
    ".btn",
  ];
  let alarmAudio = null;
  let reconnectObserver = null;
  let reconnectPollTimerId = null;
  let lastReconnectClickAt = 0;

  function addCleanup(fn) {
    if (typeof fn === "function") {
      cleanups.push(fn);
    }
  }

  function runCleanups() {
    while (cleanups.length) {
      const fn = cleanups.pop();
      try {
        fn();
      } catch (error) {
        console.error("[minibia-copilot] cleanup failed", error);
      }
    }
  }

  function getStoredAlarmAudioSrc() {
    try {
      const value = window.localStorage.getItem(alarmAudioSrcStorageKey);
      return value == null ? defaultAlarmAudioSrc : JSON.parse(value);
    } catch (error) {
      return defaultAlarmAudioSrc;
    }
  }

  function setStoredAlarmAudioSrc(src) {
    window.localStorage.setItem(alarmAudioSrcStorageKey, JSON.stringify(src));
    return src;
  }

  function destroyAlarmAudio() {
    if (!alarmAudio) {
      return;
    }

    try {
      alarmAudio.pause();
      alarmAudio.removeAttribute("src");
      alarmAudio.load();
    } catch (error) {
      console.error("[minibia-copilot] audio cleanup failed", error);
    }

    alarmAudio = null;
  }

  function getAlarmAudio() {
    const src = getStoredAlarmAudioSrc();
    if (!src) {
      return null;
    }

    if (!alarmAudio) {
      alarmAudio = new Audio(src);
      alarmAudio.preload = "auto";
    } else if (alarmAudio.src !== src) {
      alarmAudio.pause();
      alarmAudio = new Audio(src);
      alarmAudio.preload = "auto";
    }

    return alarmAudio;
  }

  function normalizeChatText(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function rememberSentChat(text) {
    const normalized = normalizeChatText(text);
    if (!normalized) {
      return;
    }

    recentSentChats.push({
      text: normalized,
      at: Date.now(),
    });

    const maxEntries = 20;
    if (recentSentChats.length > maxEntries) {
      recentSentChats.splice(0, recentSentChats.length - maxEntries);
    }
  }

  function isRecentSentChat(text, withinMs = 45000) {
    const normalized = normalizeChatText(text);
    if (!normalized) {
      return false;
    }

    const cutoff = Date.now() - withinMs;
    for (let index = recentSentChats.length - 1; index >= 0; index -= 1) {
      const entry = recentSentChats[index];
      if (entry.at < cutoff) {
        continue;
      }

      if (entry.text === normalized) {
        return true;
      }
    }

    return false;
  }

  function normalizeUiText(text) {
    return String(text || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function getSkillWindowValue(skillNames = []) {
    for (const skillName of skillNames) {
      const value =
        document.querySelector(`#skill-window div[skill="${skillName}"] .skill`)?.textContent?.trim() ||
        null;
      if (value) {
        return value;
      }
    }

    return null;
  }

  function parseNumberText(value) {
    if (value == null) {
      return null;
    }

    const normalized = String(value).replace(/[^\d.-]/g, "");
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function isVisibleElement(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function getElementUiText(element) {
    if (!(element instanceof Element)) {
      return "";
    }

    return normalizeUiText(
      element.textContent ||
      element.innerText ||
      element.getAttribute("value") ||
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      ""
    );
  }

  function findReconnectElement() {
    for (const selector of reconnectButtonSelectors) {
      const candidates = document.querySelectorAll(selector);
      for (const candidate of candidates) {
        if (!isVisibleElement(candidate)) {
          continue;
        }

        if (getElementUiText(candidate) === "reconnect") {
          return candidate;
        }
      }
    }

    return null;
  }

  function tryClickReconnect() {
    const now = Date.now();
    if (now - lastReconnectClickAt < 3000) {
      return false;
    }

    const reconnectElement = findReconnectElement();
    if (!reconnectElement) {
      return false;
    }

    reconnectElement.click();
    lastReconnectClickAt = now;
    console.log("[minibia-copilot] clicked reconnect");
    return true;
  }

  function startReconnectWatcher() {
    if (reconnectObserver || reconnectPollTimerId) {
      return;
    }

    const runCheck = () => {
      try {
        tryClickReconnect();
      } catch (error) {
        console.error("[minibia-copilot] reconnect watcher failed", error);
      }
    };

    reconnectObserver = new MutationObserver(runCheck);
    reconnectObserver.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden", "value"],
    });

    reconnectPollTimerId = window.setInterval(runCheck, 2000);
    runCheck();
  }

  function stopReconnectWatcher() {
    if (reconnectObserver) {
      reconnectObserver.disconnect();
      reconnectObserver = null;
    }

    if (reconnectPollTimerId) {
      window.clearInterval(reconnectPollTimerId);
      reconnectPollTimerId = null;
    }
  }

  startReconnectWatcher();

  const cancelMessageListeners = new Set();
  let cancelMessageHookInstalled = false;
  let cancelMessageInstallRetryId = null;
  let patchedNotificationProto = null;
  let originalNotificationCancel = null;
  let patchedInterfaceProto = null;
  let originalInterfaceCancel = null;

  function fireCancelMessage(text) {
    const value = typeof text === "string" ? text : String(text ?? "");
    cancelMessageListeners.forEach((cb) => {
      try { cb(value); } catch (error) {
        console.error("[minibia-copilot] cancel-message listener failed", error);
      }
    });
  }

  function tryInstallCancelMessageHook() {
    if (cancelMessageHookInstalled) return true;

    // Prefer the prototype patch because the server packet handler calls
    // NotificationManager.setCancelMessage directly, bypassing Interface.
    let notificationProto = null;
    try {
      if (typeof NotificationManager !== "undefined" && NotificationManager?.prototype?.setCancelMessage) {
        notificationProto = NotificationManager.prototype;
      }
    } catch (error) {}
    if (!notificationProto) {
      const live = window.gameClient?.interface?.notificationManager;
      if (live) notificationProto = Object.getPrototypeOf(live);
    }

    let interfaceProto = null;
    try {
      if (typeof Interface !== "undefined" && Interface?.prototype?.setCancelMessage) {
        interfaceProto = Interface.prototype;
      }
    } catch (error) {}
    if (!interfaceProto) {
      const live = window.gameClient?.interface;
      if (live) interfaceProto = Object.getPrototypeOf(live);
    }

    if (notificationProto?.setCancelMessage) {
      originalNotificationCancel = notificationProto.setCancelMessage;
      patchedNotificationProto = notificationProto;
      notificationProto.setCancelMessage = function patchedNotificationCancel(message) {
        fireCancelMessage(message);
        return originalNotificationCancel.apply(this, arguments);
      };
    }

    if (interfaceProto?.setCancelMessage) {
      originalInterfaceCancel = interfaceProto.setCancelMessage;
      patchedInterfaceProto = interfaceProto;
      interfaceProto.setCancelMessage = function patchedInterfaceCancel(message) {
        // Fire here too in case the NotificationManager prototype wasn't
        // available; downstream call will hit our notification patch
        // and de-dup is fine because listeners just react/throttle.
        if (!patchedNotificationProto) fireCancelMessage(message);
        return originalInterfaceCancel.apply(this, arguments);
      };
    }

    if (patchedNotificationProto || patchedInterfaceProto) {
      cancelMessageHookInstalled = true;
      console.log("[minibia-copilot] cancel-message hook installed", {
        notificationProto: !!patchedNotificationProto,
        interfaceProto: !!patchedInterfaceProto,
      });
      return true;
    }
    return false;
  }

  function installCancelMessageHook() {
    if (tryInstallCancelMessageHook()) return;
    if (cancelMessageInstallRetryId != null) return;
    cancelMessageInstallRetryId = window.setInterval(() => {
      if (tryInstallCancelMessageHook()) {
        window.clearInterval(cancelMessageInstallRetryId);
        cancelMessageInstallRetryId = null;
      }
    }, 1000);
  }

  function uninstallCancelMessageHook() {
    if (cancelMessageInstallRetryId != null) {
      window.clearInterval(cancelMessageInstallRetryId);
      cancelMessageInstallRetryId = null;
    }
    if (patchedNotificationProto && originalNotificationCancel) {
      if (patchedNotificationProto.setCancelMessage !== originalNotificationCancel) {
        patchedNotificationProto.setCancelMessage = originalNotificationCancel;
      }
    }
    if (patchedInterfaceProto && originalInterfaceCancel) {
      if (patchedInterfaceProto.setCancelMessage !== originalInterfaceCancel) {
        patchedInterfaceProto.setCancelMessage = originalInterfaceCancel;
      }
    }
    cancelMessageHookInstalled = false;
    patchedNotificationProto = null;
    originalNotificationCancel = null;
    patchedInterfaceProto = null;
    originalInterfaceCancel = null;
  }

  addCleanup(uninstallCancelMessageHook);

  return {
    version: "0.3.0",
    onCancelMessage(callback) {
      if (typeof callback !== "function") return () => {};
      cancelMessageListeners.add(callback);
      installCancelMessageHook();
      return () => cancelMessageListeners.delete(callback);
    },
    addCleanup,
    destroy() {
      if (this.panic?.stop) {
        this.panic.stop();
      }

      if (this.rune?.stop) {
        this.rune.stop({ persistEnabled: false });
      }

      if (this.heal?.stop) {
        this.heal.stop({ persistEnabled: false });
      }

      if (this.invisible?.stop) {
        this.invisible.stop({ persistEnabled: false });
      }

      if (this.attack?.stop) {
        this.attack.stop({ persistEnabled: false });
      }

      if (this.cave?.stop) {
        this.cave.stop({ persistEnabled: false });
      }

      if (this.equipRing?.stop) {
        this.equipRing.stop({ persistEnabled: false });
      }

      if (this.equipAmulet?.stop) {
        this.equipAmulet.stop({ persistEnabled: false });
      }

      if (this.lootbag?.stop) {
        this.lootbag.stop({ persistEnabled: false });
      }

      if (this.eat?.stop) {
        this.eat.stop({ persistEnabled: false });
      }

      if (this.talk?.stop) {
        this.talk.stop({ persistEnabled: false });
      }

      if (this.ui?.destroy) {
        this.ui.destroy();
      }

      stopReconnectWatcher();
      destroyAlarmAudio();
      runCleanups();
    },
    log(...args) {
      console.log("[minibia-copilot]", ...args);
    },
    storage: {
      get(key, fallback = null) {
        try {
          const value = window.localStorage.getItem(key);
          return value == null ? fallback : JSON.parse(value);
        } catch (error) {
          return fallback;
        }
      },
      set(key, value) {
        window.localStorage.setItem(key, JSON.stringify(value));
        return value;
      },
      remove(key) {
        window.localStorage.removeItem(key);
      },
    },
    getPlayerPosition() {
      return window.gameClient?.player?.getPosition?.() || null;
    },
    getPlayerState() {
      return window.gameClient?.player?.state || null;
    },
    getPlayerName() {
      return (
        String(
          this.getPlayerState()?.name ||
          window.gameClient?.player?.name ||
          window.gameClient?.player?.state?.name ||
          ""
        ).trim() || null
      );
    },
    getPlayerSnapshot() {
      const playerState = this.getPlayerState() || {};
      const levelText = getSkillWindowValue(["level"]);
      const magicLevelText = getSkillWindowValue(["magic", "magic-level", "mlvl"]);
      const experienceText = getSkillWindowValue(["experience", "exp"]);
      const capacityText = getSkillWindowValue(["capacity", "cap"]);

      return {
        name: this.getPlayerName(),
        level: parseNumberText(playerState.level) ?? parseNumberText(levelText),
        magicLevel: parseNumberText(playerState.magicLevel ?? playerState.magic_level) ?? parseNumberText(magicLevelText),
        health: parseNumberText(playerState.health),
        maxHealth: parseNumberText(playerState.maxHealth),
        mana: parseNumberText(playerState.mana),
        maxMana: parseNumberText(playerState.maxMana),
        experience: parseNumberText(playerState.experience ?? playerState.exp) ?? parseNumberText(experienceText),
        capacity: parseNumberText(playerState.capacity ?? playerState.cap) ?? parseNumberText(capacityText),
        food: getSkillWindowValue(["food"]),
      };
    },
    sendChat(text) {
      const channelManager = window.gameClient?.interface?.channelManager;
      if (!channelManager || !text) {
        return false;
      }

      channelManager.sendMessageText(text);
      rememberSentChat(text);
      this.log("sent chat:", text);
      return true;
    },
    isRecentSentChat(text, withinMs) {
      return isRecentSentChat(text, withinMs);
    },
    clickReconnect() {
      return tryClickReconnect();
    },
    clickHotbar(index) {
      const button = window.gameClient?.interface?.hotbarManager?.slots?.[index]?.canvas?.canvas;
      if (!button) {
        return false;
      }

      button.click();
      return true;
    },
    getAlarmAudioSrc() {
      return getStoredAlarmAudioSrc();
    },
    setAlarmAudioSrc(src) {
      const nextSrc = String(src || "").trim();
      if (!nextSrc) {
        return false;
      }

      setStoredAlarmAudioSrc(nextSrc);
      destroyAlarmAudio();
      this.log("alarm audio updated", nextSrc);
      return true;
    },
    unlockAudio() {
      try {
        const audio = getAlarmAudio();
        if (!audio) {
          return false;
        }

        audio.muted = true;
        const playResult = audio.play();

        if (playResult && typeof playResult.then === "function") {
          playResult
            .then(() => {
              audio.pause();
              audio.currentTime = 0;
              audio.muted = false;
            })
            .catch((error) => {
              audio.muted = false;
              this.log("audio unlock failed", error?.message || error);
            });
        } else {
          audio.pause();
          audio.currentTime = 0;
          audio.muted = false;
        }

        return true;
      } catch (error) {
        console.error("[minibia-copilot] audio unlock failed", error);
        return false;
      }
    },
    playAlarm() {
      try {
        const audio = getAlarmAudio();
        if (!audio) {
          return false;
        }

        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        const playResult = audio.play();

        if (playResult && typeof playResult.catch === "function") {
          playResult.catch((error) => {
            this.log("alarm playback failed", error?.message || error);
          });
        }

        return true;
      } catch (error) {
        console.error("[minibia-copilot] alarm failed", error);
        return false;
      }
    },
  };
};
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installPzModule = function installPzModule(bot) {
  const homeStorageKey = "minibiaCopilot.pz.home";

  function getLoadedTiles() {
    const chunks = window.gameClient?.world?.chunks || [];
    const tiles = [];

    for (const chunk of chunks) {
      if (!chunk?.tiles) continue;

      for (const tile of chunk.tiles) {
        if (tile?.__position) {
          tiles.push(tile);
        }
      }
    }

    return tiles;
  }

  function hasPzFlag(tile) {
    return !!tile && ((tile.flags || 0) & 1) !== 0;
  }

  function getPzCandidates() {
    const me = bot.getPlayerPosition();
    if (!me) return [];

    return getLoadedTiles()
      .filter((tile) => hasPzFlag(tile) && tile.__position?.z === me.z)
      .map((tile) => {
        const p = tile.__position;
        return {
          tile,
          x: p.x,
          y: p.y,
          z: p.z,
          flags: tile.flags || 0,
          dist: Math.abs(p.x - me.x) + Math.abs(p.y - me.y),
        };
      })
      .sort((a, b) => a.dist - b.dist);
  }

  function goToTile(tile) {
    if (!tile?.__position) return false;

    const from = bot.getPlayerPosition();
    if (!from) return false;

    const p = tile.__position;
    const to = new Position(p.x, p.y, p.z);

    try {
      window.gameClient?.world?.pathfinder?.findPath?.(from, to);
      bot.log("pathing to", { x: p.x, y: p.y, z: p.z, flags: tile.flags });
      return true;
    } catch (error) {
      bot.log("pathing failed", { x: p.x, y: p.y, z: p.z, error: error?.message });
      return false;
    }
  }

  function goToNearestPz(maxAttempts = 20) {
    const candidates = getPzCandidates().slice(0, maxAttempts);

    if (!candidates.length) {
      bot.log("No PZ candidates found");
      return false;
    }

    for (const candidate of candidates) {
      if (goToTile(candidate.tile)) {
        bot.log("selected PZ", {
          x: candidate.x,
          y: candidate.y,
          z: candidate.z,
          flags: candidate.flags,
          dist: candidate.dist,
        });
        return true;
      }
    }

    bot.log("No PZ candidate accepted by pathfinder");
    return false;
  }

  function setHomePz(x, y, z) {
    const home = { x, y, z };
    bot.storage.set(homeStorageKey, home);
    bot.log("home PZ set", home);
    return home;
  }

  function setHomePzCurrentSpot() {
    const pos = bot.getPlayerPosition();
    if (!pos) {
      bot.log("Could not read current position");
      return null;
    }

    return setHomePz(pos.x, pos.y, pos.z);
  }

  function getHomePz() {
    return bot.storage.get(homeStorageKey, null);
  }

  function clearHomePz() {
    bot.storage.remove(homeStorageKey);
    bot.log("home PZ cleared");
  }

  function getNearestPzTo(x, y, z) {
    const candidates = getLoadedTiles()
      .filter((tile) => hasPzFlag(tile) && tile.__position?.z === z)
      .map((tile) => {
        const p = tile.__position;
        return {
          tile,
          x: p.x,
          y: p.y,
          z: p.z,
          flags: tile.flags || 0,
          dist: Math.abs(p.x - x) + Math.abs(p.y - y),
        };
      })
      .sort((a, b) => a.dist - b.dist);

    return candidates[0] || null;
  }

  function goToHomePz() {
    const home = getHomePz();
    if (!home) {
      bot.log("No home PZ set");
      return false;
    }

    const candidate = getNearestPzTo(home.x, home.y, home.z);
    if (!candidate) {
      bot.log("No loaded PZ found near saved home", home);
      return false;
    }

    bot.log("home candidate", {
      x: candidate.x,
      y: candidate.y,
      z: candidate.z,
      flags: candidate.flags,
      distFromHome: candidate.dist,
    });

    return goToTile(candidate.tile);
  }

  function printPzCandidates(limit = 10) {
    const rows = getPzCandidates()
      .slice(0, limit)
      .map((candidate) => ({
        x: candidate.x,
        y: candidate.y,
        z: candidate.z,
        flags: candidate.flags,
        dist: candidate.dist,
      }));

    console.table(rows);
    return rows;
  }

  bot.pz = {
    getLoadedTiles,
    getPzCandidates,
    goToTile,
    goToNearestPz,
    setHomePz,
    setHomePzCurrentSpot,
    getHomePz,
    clearHomePz,
    getNearestPzTo,
    goToHomePz,
    printPzCandidates,
  };

  bot.goToNearestPz = goToNearestPz;
  bot.setHomePz = setHomePz;
  bot.setHomePzCurrentSpot = setHomePzCurrentSpot;
  bot.getHomePz = getHomePz;
  bot.clearHomePz = clearHomePz;
  bot.goToHomePz = goToHomePz;
};
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installXrayModule = function installXrayModule(bot) {
  const configStorageKey = "minibiaCopilot.xray.config";
  const overlayRootId = "minibia-copilot-xray-overlay";
  const overlayStyleId = "minibia-copilot-xray-overlay-style";
  const overlayState = {
    running: false,
    timerId: null,
  };
  const config = Object.assign(
    {
      overlayEnabled: false,
      selectedFloor: null,
    },
    bot.storage.get(configStorageKey, {})
  );

  config.selectedFloor = normalizeSelectedFloor(config.selectedFloor);

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function normalizeSelectedFloor(value) {
    if (value == null || value === "" || value === "all") {
      return null;
    }

    const floor = Number(value);
    if (!Number.isFinite(floor)) {
      return null;
    }

    return Math.trunc(floor);
  }

  function isWithinVisibleRange(me, pos) {
    if (!me || !pos) {
      return false;
    }

    const dx = Math.abs(pos.x - me.x);
    const dy = Math.abs(pos.y - me.y);
    return dx <= 8 && dy <= 6;
  }

  function getTrackedCreatures() {
    const myState = bot.getPlayerState();
    const myId = window.gameClient?.player?.id;
    const myName = normalizeName(myState?.name);

    return Object.values(window.gameClient?.world?.activeCreatures || {}).filter((creature) => {
      if (!creature) return false;
      if (creature.id === myId) return false;

      const name = normalizeName(creature.name);
      if (name && name === myName) return false;

      return true;
    });
  }

  function getVisibleCreatures() {
    const me = bot.getPlayerPosition();
    if (!me) {
      return [];
    }

    // Keep the visible query strict; panic logic relies on this staying screen-limited.
    return getTrackedCreatures().filter((creature) => isWithinVisibleRange(me, creature.__position));
  }

  function getVisiblePlayers(options = {}) {
    const { sameFloorOnly = false } = options;
    const me = bot.getPlayerPosition();
    if (!me) {
      return [];
    }

    return getVisibleCreatures().filter((creature) => {
      if (creature?.type !== 0) {
        return false;
      }

      if (!sameFloorOnly) {
        return true;
      }

      return creature.__position?.z === me.z;
    });
  }

  function getVisibleMonsters(options = {}) {
    const { sameFloorOnly = false } = options;
    const me = bot.getPlayerPosition();
    if (!me) {
      return [];
    }

    return getVisibleCreatures().filter((creature) => {
      if (creature?.type === 0) {
        return false;
      }

      if (!sameFloorOnly) {
        return true;
      }

      return creature.__position?.z === me.z;
    });
  }

  function readCreatureHealth(creature) {
    if (!creature) {
      return null;
    }

    const current = [
      creature.health,
      creature.hp,
      creature.currentHealth,
      creature.state?.health,
    ].find((value) => Number.isFinite(Number(value)));

    const max = [
      creature.maxHealth,
      creature.maxHp,
      creature.maximumHealth,
      creature.state?.maxHealth,
    ].find((value) => Number.isFinite(Number(value)));

    const percent = [
      creature.healthPercent,
      creature.hpPercent,
      creature.healthpercentage,
      creature.state?.healthPercent,
    ].find((value) => Number.isFinite(Number(value)));

    if (current != null && max != null) {
      return `${Number(current)}/${Number(max)} HP`;
    }

    if (percent != null) {
      return `${Math.round(Number(percent))}% HP`;
    }

    if (current != null) {
      return `${Number(current)} HP`;
    }

    return null;
  }

  function getCreatureLabel(creature) {
    if (creature?.name) {
      return creature.name;
    }

    return creature?.type === 0 ? "Player" : "Mob";
  }

  function getOverlayCreatures() {
    const me = bot.getPlayerPosition();
    if (!me) {
      return [];
    }

    return getTrackedCreatures().filter((creature) => {
      const pos = creature?.__position;
      if (!pos || pos.z == null) {
        return false;
      }

      if (config.selectedFloor != null && pos.z !== config.selectedFloor) {
        return false;
      }

      if (pos.z !== me.z) {
        return isWithinVisibleRange(me, pos);
      }

      return !isWithinVisibleRange(me, pos);
    });
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getSameFloorOffscreenMarkerText(creature, healthLabel) {
    return healthLabel
      ? `${getCreatureLabel(creature)} ${healthLabel}`
      : `${getCreatureLabel(creature)}`;
  }

  function ensureOverlayStyle() {
    if (document.getElementById(overlayStyleId)) {
      return;
    }

    const style = document.createElement("style");
    style.id = overlayStyleId;
    style.textContent = `
      #${overlayRootId} {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 999998;
      }

      #${overlayRootId} .mc-xray-marker {
        position: fixed;
        transform: translate(-50%, -50%);
        padding: 2px 6px;
        border: 1px solid rgba(255, 211, 128, 0.85);
        border-radius: 999px;
        background: rgba(65, 24, 12, 0.72);
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
        color: #ffe7ae;
        font: 11px/1.2 Verdana, sans-serif;
        white-space: nowrap;
      }

      #${overlayRootId} .mc-xray-marker.mc-xray-marker-offscreen {
        border-color: rgba(123, 235, 178, 0.92);
        background: rgba(11, 61, 43, 0.8);
        color: #d8ffea;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureOverlayRoot() {
    let root = document.getElementById(overlayRootId);
    if (root) {
      return root;
    }

    root = document.createElement("div");
    root.id = overlayRootId;
    document.body.appendChild(root);
    return root;
  }

  function destroyOverlayElements() {
    document.getElementById(overlayRootId)?.remove();
    document.getElementById(overlayStyleId)?.remove();
  }

  function getViewportRect() {
    const canvases = Array.from(document.querySelectorAll("canvas"))
      .map((canvas) => ({ canvas, rect: canvas.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width >= 200 && rect.height >= 150)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));

    return canvases[0]?.rect || null;
  }

  function renderOverlay() {
    if (!overlayState.running) {
      return;
    }

    const root = ensureOverlayRoot();
    const me = bot.getPlayerPosition();
    const viewportRect = getViewportRect();
    const creatures = getOverlayCreatures();
    root.innerHTML = "";

    if (!me || !viewportRect || !creatures.length) {
      return;
    }

    const tileWidth = viewportRect.width / 17;
    const tileHeight = viewportRect.height / 13;
    const edgePadding = 48;

    creatures.forEach((creature) => {
      const pos = creature?.__position;
      if (!pos) return;

      const dx = pos.x - me.x;
      const dy = pos.y - me.y;
      const healthLabel = readCreatureHealth(creature);
      const marker = document.createElement("div");
      marker.className = "mc-xray-marker";

      if (pos.z === me.z) {
        marker.classList.add("mc-xray-marker-offscreen");
        marker.textContent = getSameFloorOffscreenMarkerText(creature, healthLabel);
        marker.style.left = `${clamp(
          viewportRect.left + ((dx + 8.5) * tileWidth),
          viewportRect.left + edgePadding,
          viewportRect.right - edgePadding
        )}px`;
        marker.style.top = `${clamp(
          viewportRect.top + ((dy + 6.5) * tileHeight),
          viewportRect.top + edgePadding,
          viewportRect.bottom - edgePadding
        )}px`;
      } else {
        const floorOffset = me.z - pos.z;
        const floorLabel = floorOffset === 0 ? "0" : floorOffset > 0 ? `+${floorOffset}` : `${floorOffset}`;
        marker.textContent = healthLabel
          ? `${getCreatureLabel(creature)} (${floorLabel}) ${healthLabel}`
          : `${getCreatureLabel(creature)} (${floorLabel})`;
        marker.style.left = `${viewportRect.left + ((dx + 8.5) * tileWidth)}px`;
        marker.style.top = `${viewportRect.top + ((dy + 6.5) * tileHeight)}px`;
      }

      root.appendChild(marker);
    });
  }

  function startOverlay() {
    config.overlayEnabled = true;
    persistConfig();

    if (overlayState.running) {
      return false;
    }

    overlayState.running = true;
    ensureOverlayStyle();
    renderOverlay();
    overlayState.timerId = window.setInterval(renderOverlay, 250);
    return true;
  }

  function stopOverlay() {
    config.overlayEnabled = false;
    persistConfig();

    if (!overlayState.running && overlayState.timerId == null) {
      return false;
    }

    overlayState.running = false;
    if (overlayState.timerId != null) {
      window.clearInterval(overlayState.timerId);
      overlayState.timerId = null;
    }

    destroyOverlayElements();
    return true;
  }

  function setOverlayEnabled(enabled) {
    const nextEnabled = !!enabled;

    if (nextEnabled) {
      if (overlayState.running) {
        config.overlayEnabled = true;
        persistConfig();
        return true;
      }

      return startOverlay();
    }

    if (!overlayState.running) {
      config.overlayEnabled = false;
      persistConfig();
      destroyOverlayElements();
      return true;
    }

    return stopOverlay();
  }

  function setSelectedFloor(floor) {
    config.selectedFloor = normalizeSelectedFloor(floor);
    persistConfig();

    if (overlayState.running) {
      renderOverlay();
    }

    return config.selectedFloor;
  }

  function status() {
    return {
      visibleCreatures: getVisibleCreatures().map((creature) => ({
        id: creature.id,
        name: creature.name,
        type: creature.type,
        position: creature.__position || null,
      })),
      visiblePlayers: getVisiblePlayers().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      visiblePlayersCurrentFloor: getVisiblePlayers({ sameFloorOnly: true }).map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      visibleMonsters: getVisibleMonsters().map((creature) => ({
        id: creature.id,
        name: creature.name,
        type: creature.type,
        position: creature.__position || null,
      })),
      visibleMonstersCurrentFloor: getVisibleMonsters({ sameFloorOnly: true }).map((creature) => ({
        id: creature.id,
        name: creature.name,
        type: creature.type,
        position: creature.__position || null,
      })),
      overlayCreatures: getOverlayCreatures().map((creature) => ({
        id: creature.id,
        name: creature.name,
        type: creature.type,
        position: creature.__position || null,
      })),
      config: { ...config },
      overlayRunning: overlayState.running,
    };
  }

  bot.xray = {
    getVisibleCreatures,
    getVisiblePlayers,
    getVisibleMonsters,
    getOverlayCreatures,
    startOverlay,
    stopOverlay,
    setOverlayEnabled,
    setSelectedFloor,
    status,
    config,
  };

  if (config.overlayEnabled) {
    startOverlay();
  } else {
    destroyOverlayElements();
  }
  bot.addCleanup(stopOverlay);
};
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installPanicModule = function installPanicModule(bot) {
  const configStorageKey = "minibiaCopilot.panic.config";
  const state = {
    running: false,
    timerId: null,
    lastHealth: null,
    lastTriggerAt: 0,
    lastDamageEventKey: null,
    pendingReturnOrigin: null,
    pendingReturnModules: null,
    returnNotBeforeAt: 0,
    lastThreatAt: 0,
    lastReturnAttemptAt: 0,
  };

  const config = Object.assign(
    {
      tickMs: 200,
      triggerCooldownMs: 4000,
      returnToOriginEnabled: false,
      returnDelayMs: 300000,
      returnDelayJitterMs: 30000,
      returnRetryCooldownMs: 2000,
      unknownPlayerEnabled: false,
      healthLossEnabled: false,
      trustedNames: [],
      gameMasterNames: [],
    },
    bot.storage.get(configStorageKey, {})
  );

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function normalizeDelayMs(value, fallback = 0) {
    const next = Math.trunc(Number(value));
    return Number.isFinite(next) ? Math.max(0, next) : fallback;
  }

  function normalizePosition(position) {
    const x = Number(position?.x);
    const y = Number(position?.y);
    const z = Number(position?.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }

    return { x, y, z };
  }

  function isSamePosition(left, right) {
    return !!left && !!right && left.x === right.x && left.y === right.y && left.z === right.z;
  }

  function getTrustedNames() {
    return Array.from(
      new Set(
        (config.trustedNames || [])
          .map((name) => normalizeName(name))
          .filter(Boolean)
      )
    );
  }

  function getGameMasterNames() {
    return Array.from(
      new Set(
        (config.gameMasterNames || [])
          .map((name) => normalizeName(name))
          .filter(Boolean)
      )
    );
  }

  function getVisiblePlayers() {
    const me = bot.getPlayerPosition();
    const players = bot.xray?.getVisiblePlayers?.() || [];
    if (!me) {
      return players;
    }

    return players.filter((creature) => {
      const z = Number(creature?.__position?.z);
      return Number.isFinite(z) && Math.abs(z - me.z) <= 1;
    });
  }

  function getUnknownVisiblePlayers() {
    const trusted = new Set(getTrustedNames());

    return getVisiblePlayers().filter((creature) => {
      const name = normalizeName(creature?.name);
      return !!name && !trusted.has(name);
    });
  }

  function getTrustedVisiblePlayers() {
    const trusted = new Set(getTrustedNames());

    return getVisiblePlayers().filter((creature) => {
      const name = normalizeName(creature?.name);
      return !!name && trusted.has(name);
    });
  }

  function getVisibleGameMasters() {
    const gameMasters = new Set(getGameMasterNames());

    return getVisiblePlayers().filter((creature) => {
      const name = normalizeName(creature?.name);
      return !!name && gameMasters.has(name);
    });
  }

  function getRecentChannelMessages() {
    return (window.gameClient?.interface?.channelManager?.channels || []).flatMap((channel) =>
      (channel?.__contents || []).map((entry) => ({
        channelName: channel?.name || null,
        message: String(entry?.message || ""),
        time: entry?.__time || null,
      }))
    );
  }

  function parseDamageMessage(entry) {
    const match = entry.message.match(
      /^You lose\s+(\d+)\s+hitpoints\s+due to an attack by\s+(.+?)\.$/i
    );

    if (!match) {
      return null;
    }

    return {
      amount: Number(match[1]),
      attackerName: match[2].trim(),
      time: entry.time,
      channelName: entry.channelName,
      key: `${entry.time || "no-time"}|${entry.message}`,
      message: entry.message,
    };
  }

  function getLatestDamageEvent() {
    const messages = getRecentChannelMessages()
      .map(parseDamageMessage)
      .filter(Boolean)
      .sort((a, b) => {
        const aTime = a.time ? Date.parse(a.time) : 0;
        const bTime = b.time ? Date.parse(b.time) : 0;
        return bTime - aTime;
      });

    return messages[0] || null;
  }

  function getReturnDelayMs() {
    const baseDelayMs = normalizeDelayMs(config.returnDelayMs, 0);
    const jitterMs = normalizeDelayMs(config.returnDelayJitterMs, 0);
    if (!jitterMs) {
      return baseDelayMs;
    }

    const randomOffset = Math.floor(Math.random() * ((jitterMs * 2) + 1)) - jitterMs;
    return Math.max(0, baseDelayMs + randomOffset);
  }

  function clearPendingReturn() {
    state.pendingReturnOrigin = null;
    state.pendingReturnModules = null;
    state.returnNotBeforeAt = 0;
    state.lastThreatAt = 0;
    state.lastReturnAttemptAt = 0;
  }

  function snapshotInterruptedModules() {
    return {
      caveRunning: !!bot.cave?.status?.().running,
      equipRingRunning: !!bot.equipRing?.status?.().running,
    };
  }

  function armPendingReturn(now = Date.now(), origin = normalizePosition(bot.getPlayerPosition())) {
    if (!config.returnToOriginEnabled) {
      clearPendingReturn();
      return;
    }

    if (!state.pendingReturnOrigin && origin) {
      state.pendingReturnOrigin = origin;
      state.pendingReturnModules = snapshotInterruptedModules();
    }

    if (!state.pendingReturnOrigin) {
      return;
    }

    state.lastThreatAt = now;
    state.returnNotBeforeAt = now + getReturnDelayMs();
  }

  function isReturnCoastClear() {
    return !getVisibleGameMasters().length && !getUnknownVisiblePlayers().length;
  }

  function restoreInterruptedModules() {
    if (state.pendingReturnModules?.caveRunning) {
      bot.cave?.start?.();
    }

    if (state.pendingReturnModules?.equipRingRunning) {
      bot.equipRing?.start?.();
      bot.ui?.refreshEquipRingStatus?.();
    }
  }

  function tryReturnToOrigin(now = Date.now()) {
    if (!config.returnToOriginEnabled || !state.pendingReturnOrigin || !state.returnNotBeforeAt) {
      return false;
    }

    if (now < state.returnNotBeforeAt) {
      return false;
    }

    if (!isReturnCoastClear()) {
      return false;
    }

    if (now - state.lastReturnAttemptAt < normalizeDelayMs(config.returnRetryCooldownMs, 2000)) {
      return false;
    }

    const currentPosition = normalizePosition(bot.getPlayerPosition());
    if (isSamePosition(currentPosition, state.pendingReturnOrigin)) {
      bot.log("panic return completed", {
        origin: state.pendingReturnOrigin,
        threatAgeMs: now - state.lastThreatAt,
      });
      restoreInterruptedModules();
      clearPendingReturn();
      return true;
    }

    state.lastReturnAttemptAt = now;
    const moved =
      !!bot.cave?.goToPosition?.(state.pendingReturnOrigin) ||
      !!bot.pz?.goToTile?.({ __position: state.pendingReturnOrigin });

    if (moved) {
      bot.log("panic returning to origin", {
        origin: state.pendingReturnOrigin,
        threatAgeMs: now - state.lastThreatAt,
      });
      return true;
    }

    bot.log("panic return pathing failed", { origin: state.pendingReturnOrigin });
    return false;
  }

  function triggerPanic(reason, details = {}) {
    const now = Date.now();
    armPendingReturn(now);

    if (now - state.lastTriggerAt < config.triggerCooldownMs) {
      return false;
    }

    state.lastTriggerAt = now;
    bot.playAlarm?.();
    bot.log("panic triggered", { reason, ...details });

    if (bot.cave?.stop) {
      bot.cave.stop({ persistEnabled: false });
    }

    if (bot.equipRing?.stop) {
      bot.equipRing.stop({ persistEnabled: false });
      bot.ui?.refreshEquipRingStatus?.();
    }

    return !!bot.pz?.goToHomePz?.();
  }

  function triggerGameMasterKillSwitch(players) {
    const detectedPlayers = (players || []).map((player) => player?.name).filter(Boolean);

    bot.playAlarm?.();
    bot.log("game master kill switch triggered", { players: detectedPlayers });

    if (bot.rune?.stop) {
      bot.rune.stop();
    }

    if (bot.eat?.stop) {
      bot.eat.stop();
    }

    if (bot.invisible?.stop) {
      bot.invisible.stop();
    }

    if (bot.magicShield?.stop) {
      bot.magicShield.stop();
    }

    if (bot.cave?.stop) {
      bot.cave.stop();
    }

    if (bot.attack?.stop) {
      bot.attack.stop();
    }

    if (bot.equipRing?.stop) {
      bot.equipRing.stop();
    }

    clearPendingReturn();
    config.unknownPlayerEnabled = false;
    config.healthLossEnabled = false;
    persistConfig();
    stop();

    bot.ui?.refreshPanicStatus?.();
    bot.ui?.refreshRuneStatus?.();
    bot.ui?.refreshAutoEatStatus?.();
    bot.ui?.refreshAutoInvisibleStatus?.();
    bot.ui?.refreshAutoMagicShieldStatus?.();
    bot.ui?.refreshAutoAttackStatus?.();
    bot.ui?.refreshCaveStatus?.();
    bot.ui?.refreshEquipRingStatus?.();
    return true;
  }

  function checkGameMasters() {
    if (!getGameMasterNames().length) {
      return false;
    }

    const visibleGameMasters = getVisibleGameMasters();
    if (!visibleGameMasters.length) {
      return false;
    }

    return triggerGameMasterKillSwitch(visibleGameMasters);
  }

  function checkUnknownPlayers() {
    if (!config.unknownPlayerEnabled) {
      return false;
    }

    const unknownPlayers = getUnknownVisiblePlayers();
    if (!unknownPlayers.length) {
      return false;
    }

    return triggerPanic("unknown-player", {
      players: unknownPlayers.map((player) => player.name),
    });
  }

  function checkHealthLoss() {
    if (!config.healthLossEnabled) {
      return false;
    }

    const playerState = bot.getPlayerState();
    const currentHealth = Number(playerState?.health ?? 0);

    if (state.lastHealth == null) {
      state.lastHealth = currentHealth;
      return false;
    }

    const lostHealth = currentHealth < state.lastHealth;
    state.lastHealth = currentHealth;

    if (!lostHealth) {
      return false;
    }

    const latestDamageEvent = getLatestDamageEvent();
    if (latestDamageEvent && latestDamageEvent.key !== state.lastDamageEventKey) {
      state.lastDamageEventKey = latestDamageEvent.key;

      const trustedNames = new Set(getTrustedNames());
      const attackerName = normalizeName(latestDamageEvent.attackerName);

      if (attackerName && trustedNames.has(attackerName)) {
        bot.log("ignored health-loss panic because attacker is trusted", {
          attacker: latestDamageEvent.attackerName,
          amount: latestDamageEvent.amount,
          currentHealth,
        });
        return false;
      }

      return triggerPanic("health-loss", {
        currentHealth,
        attacker: latestDamageEvent.attackerName,
        amount: latestDamageEvent.amount,
      });
    }

    const unknownPlayers = getUnknownVisiblePlayers();
    if (!unknownPlayers.length) {
      const trustedPlayers = getTrustedVisiblePlayers();
      if (trustedPlayers.length) {
        bot.log("ignored health-loss panic because only trusted players are nearby", {
          players: trustedPlayers.map((player) => player.name),
          currentHealth,
        });
        return false;
      }
    }

    return triggerPanic("health-loss", { currentHealth });
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function tick() {
    if (!state.running) return;

    try {
      const triggered = checkGameMasters() || checkUnknownPlayers() || checkHealthLoss();
      if (!triggered) {
        tryReturnToOrigin();
      }
    } finally {
      scheduleNextTick();
    }
  }

  function shouldRun() {
    return !!(getGameMasterNames().length || config.unknownPlayerEnabled || config.healthLossEnabled);
  }

  function start() {
    if (state.running) {
      return false;
    }

    state.running = true;
    state.lastHealth = Number(bot.getPlayerState()?.health ?? 0);
    state.lastDamageEventKey = getLatestDamageEvent()?.key || null;
    bot.log("panic runner started", { ...config });
    tick();
    return true;
  }

  function stop() {
    if (!state.running && state.timerId == null) {
      state.lastHealth = null;
      return false;
    }

    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    state.lastHealth = null;
    state.lastDamageEventKey = null;
    clearPendingReturn();
    bot.log("panic runner stopped");
    return true;
  }

  function syncRunningState() {
    if (shouldRun()) {
      start();
    } else {
      stop();
    }
  }

  function updateConfig(nextConfig = {}) {
    const next = { ...nextConfig };

    if (Array.isArray(next.trustedNames)) {
      next.trustedNames = next.trustedNames
        .map((name) => String(name || "").trim())
        .filter(Boolean);
    }

    if (Array.isArray(next.gameMasterNames)) {
      next.gameMasterNames = next.gameMasterNames
        .map((name) => String(name || "").trim())
        .filter(Boolean);
    }

    if ("triggerCooldownMs" in next) {
      next.triggerCooldownMs = normalizeDelayMs(next.triggerCooldownMs, config.triggerCooldownMs);
    }

    if ("returnDelayMs" in next) {
      next.returnDelayMs = normalizeDelayMs(next.returnDelayMs, config.returnDelayMs);
    }

    if ("returnDelayJitterMs" in next) {
      next.returnDelayJitterMs = normalizeDelayMs(next.returnDelayJitterMs, config.returnDelayJitterMs);
    }

    if ("returnRetryCooldownMs" in next) {
      next.returnRetryCooldownMs = normalizeDelayMs(
        next.returnRetryCooldownMs,
        config.returnRetryCooldownMs
      );
    }

    Object.assign(config, next);
    if (!config.returnToOriginEnabled) {
      clearPendingReturn();
    }
    persistConfig();
    syncRunningState();
    bot.log("panic runner config updated", { ...config });
    return { ...config };
  }

  function status() {
    return {
      running: state.running,
      config: {
        ...config,
        trustedNames: [...config.trustedNames],
        gameMasterNames: [...config.gameMasterNames],
      },
      visiblePlayers: getVisiblePlayers().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      unknownVisiblePlayers: getUnknownVisiblePlayers().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      trustedVisiblePlayers: getTrustedVisiblePlayers().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      visibleGameMasters: getVisibleGameMasters().map((player) => ({
        id: player.id,
        name: player.name,
        position: player.__position || null,
      })),
      latestDamageEvent: getLatestDamageEvent(),
      lastTriggerAt: state.lastTriggerAt,
      pendingReturn: state.pendingReturnOrigin
        ? {
            origin: { ...state.pendingReturnOrigin },
            modules: state.pendingReturnModules ? { ...state.pendingReturnModules } : null,
            returnNotBeforeAt: state.returnNotBeforeAt,
            lastThreatAt: state.lastThreatAt,
            lastReturnAttemptAt: state.lastReturnAttemptAt,
            coastClear: isReturnCoastClear(),
          }
        : null,
    };
  }

  if (shouldRun()) {
    start();
  }

  bot.panic = {
    start,
    stop,
    status,
    updateConfig,
    getVisiblePlayers,
    getUnknownVisiblePlayers,
    getTrustedVisiblePlayers,
    getVisibleGameMasters,
    getTrustedNames,
    getGameMasterNames,
    config,
  };
};
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installRuneModule = function installRuneModule(bot) {
  const configStorageKey = "minibiaCopilot.rune.config";
  const state = {
    running: false,
    timerId: null,
    autoEatRunning: false,
    autoEatTimerId: null,
    lastRuneAt: 0,
    lastFoodAt: 0,
  };

  const config = Object.assign(
    {
      tickMs: 1000,
      minHpPercent: 50,
      minFoodSeconds: 30,
      autoEatEnabled: false,
      eatHotbarSlot: 10,
      eatCooldownMs: 60000,
      runeSpellWords: "adori vita vis",
      runeManaCost: 600,
      runeCooldownMs: 3500,
    },
    bot.storage.get(configStorageKey, {})
  );

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function readStats() {
    const state = bot.getPlayerState();

    const hp = state
      ? { current: state.health ?? 0, max: state.maxHealth ?? 0 }
      : null;

    const mana = state
      ? { current: state.mana ?? 0, max: state.maxMana ?? 0 }
      : null;

    const foodText =
      document.querySelector('#skill-window div[skill="food"] .skill')?.textContent?.trim() ||
      null;

    let food = null;
    if (foodText) {
      const match = foodText.match(/^(\d{1,2}):(\d{2})$/);
      food = match
        ? {
            text: foodText,
            seconds: Number(match[1]) * 60 + Number(match[2]),
          }
        : { text: foodText, seconds: null };
    }

    return { hp, mana, food };
  }

  function canMakeRune() {
    const { hp, mana, food } = readStats();
    if (!hp || !mana) return false;

    const hpPercent = hp.max > 0 ? (hp.current / hp.max) * 100 : 0;
    const enoughHp = hpPercent >= config.minHpPercent;
    const enoughMana = mana.current >= config.runeManaCost;
    const enoughFood = food?.seconds == null || food.seconds >= config.minFoodSeconds;
    const cooldownReady = Date.now() - state.lastRuneAt >= config.runeCooldownMs;

    return enoughHp && enoughMana && enoughFood && cooldownReady;
  }

  function isSated() {
    const player = window.gameClient?.player;
    const conditions = player?.conditions;

    if (conditions?.has && conditions.SATED != null) {
      return conditions.has(conditions.SATED);
    }

    const food = readStats().food;
    if (food?.seconds != null) {
      return food.seconds > 0;
    }

    return true;
  }

  function getOpenContainers() {
    return Array.from(window.gameClient?.player?.__openedContainers || []);
  }

  function getItemDefinition(item) {
    if (!item) return null;

    return (
      window.gameClient?.itemDefinitionsBySid?.[item.sid] ||
      window.gameClient?.itemDefinitions?.[item.id] ||
      null
    );
  }

  function getItemName(item) {
    const definition = getItemDefinition(item);
    return definition?.properties?.name || item?.name || "";
  }

  function isFoodItem(item) {
    const name = getItemName(item).toLowerCase();
    return /(ham|meat|mushroom|fish|egg|pear|toast|shrimp|food)/i.test(name);
  }

  function getFoodSlots() {
    return getOpenContainers().flatMap((container) =>
      (container?.slots || [])
        .filter((slot) => slot?.item && slot?.element && isFoodItem(slot.item))
        .map((slot) => ({
          container,
          slot,
          item: slot.item,
          name: getItemName(slot.item),
          count: slot.item.count || 0,
        }))
    );
  }

  function openSlotContextMenu(slot) {
    if (!slot?.element) return false;

    const rect = slot.element.getBoundingClientRect();
    slot.element.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        buttons: 2,
        clientX: rect.left + 5,
        clientY: rect.top + 5,
      })
    );

    return true;
  }

  function clickContainerUse() {
    const menu = window.gameClient?.interface?.menuManager?.menus?.["container-menu"];
    const root = menu?.element;
    if (!root) return false;

    const useEntry = Array.from(root.querySelectorAll("*")).find((element) =>
      /^use$/i.test((element.textContent || "").trim())
    );

    if (!useEntry) {
      return false;
    }

    useEntry.click();
    return true;
  }

  function eatFromOpenContainers() {
    const foodSlots = getFoodSlots().sort((a, b) => a.count - b.count);
    const target = foodSlots[0];

    if (!target) {
      return false;
    }

    if (!openSlotContextMenu(target.slot)) {
      return false;
    }

    const used = clickContainerUse();
    if (used) {
      state.lastFoodAt = Date.now();
      bot.log("used food from open container", {
        name: target.name,
        count: target.count,
        sid: target.item.sid,
      });
    }

    return used;
  }

  function tryEat() {
    if (!config.autoEatEnabled) {
      return false;
    }

    if (isSated()) {
      return false;
    }

    if (Date.now() - state.lastFoodAt < config.eatCooldownMs) {
      return false;
    }

    if (eatFromOpenContainers()) {
      return true;
    }

    const slotIndex = Math.max(0, Number(config.eatHotbarSlot) - 1);
    const clicked = bot.clickHotbar(slotIndex);

    if (clicked) {
      state.lastFoodAt = Date.now();
      bot.log("clicked food hotbar slot", config.eatHotbarSlot);
    }

    return clicked;
  }

  function tryMakeRune() {
    if (!canMakeRune()) {
      return false;
    }

    const sent = bot.sendChat(config.runeSpellWords);
    if (sent) {
      state.lastRuneAt = Date.now();
    }

    return sent;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tickRuneLoop();
    }, config.tickMs);
  }

  function tickRuneLoop() {
    if (!state.running) return;

    tryMakeRune();
    scheduleNextTick();
  }

  function scheduleNextAutoEatTick() {
    if (!state.autoEatRunning) return;

    state.autoEatTimerId = window.setTimeout(() => {
      tickAutoEatLoop();
    }, config.tickMs);
  }

  function tickAutoEatLoop() {
    if (!state.autoEatRunning) return;

    tryEat();
    scheduleNextAutoEatTick();
  }

  function start(overrides = {}) {
    Object.assign(config, overrides);
    persistConfig();

    if (state.running) {
      bot.log("rune loop already running");
      return false;
    }

    state.running = true;
    bot.log("rune loop started", { ...config });
    tickRuneLoop();
    return true;
  }

  function stop() {
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    bot.log("rune loop stopped");
    return true;
  }

  function startAutoEat(overrides = {}) {
    Object.assign(config, overrides, { autoEatEnabled: true });
    persistConfig();

    if (state.autoEatRunning) {
      bot.log("auto eat already running");
      return false;
    }

    state.autoEatRunning = true;
    bot.log("auto eat started", { eatCooldownMs: config.eatCooldownMs });
    tickAutoEatLoop();
    return true;
  }

  function stopAutoEat() {
    state.autoEatRunning = false;

    if (state.autoEatTimerId != null) {
      window.clearTimeout(state.autoEatTimerId);
      state.autoEatTimerId = null;
    }

    config.autoEatEnabled = false;
    persistConfig();
    bot.log("auto eat stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      autoEatRunning: state.autoEatRunning,
      config: { ...config },
      stats: readStats(),
      lastRuneAt: state.lastRuneAt,
      lastFoodAt: state.lastFoodAt,
      isSated: isSated(),
    };
  }

  function updateConfig(nextConfig = {}) {
    Object.assign(config, nextConfig);
    persistConfig();
    bot.log("rune config updated", { ...config });
    return { ...config };
  }

  if (config.autoEatEnabled) {
    startAutoEat();
  }

  bot.rune = {
    start,
    stop,
    startAutoEat,
    stopAutoEat,
    status,
    readStats,
    canMakeRune,
    tryMakeRune,
    isSated,
    tryEat,
    getOpenContainers,
    getFoodSlots,
    eatFromOpenContainers,
    config,
    updateConfig,
  };

  bot.startRuneLoop = start;
  bot.stopRuneLoop = stop;
  bot.startAutoEat = startAutoEat;
  bot.stopAutoEat = stopAutoEat;
};
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installHealModule = function installHealModule(bot) {
  const configStorageKey = "minibiaCopilot.heal.config";
  const state = {
    running: false,
    timerId: null,
    lastHpHealAt: 0,
    lastManaHealAt: 0,
    lastHpAttemptAt: 0,
    lastManaAttemptAt: 0,
    pendingHpAttempt: null,
    pendingManaAttempt: null,
  };

  const config = Object.assign(
    {
      tickMs: 50,
      healCooldownMs: 1200,
      healRetryMs: 200,
      healConfirmMs: 250,
      minHp: 250,
      hpHotbarSlot: 1,
      minMana: 150,
      manaHotbarSlot: 2,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function readStats() {
    const playerState = bot.getPlayerSnapshot?.();

    return playerState
      ? {
          hp: {
            current: Number(playerState.health ?? 0),
            max: Number(playerState.maxHealth ?? 0),
          },
          mana: {
            current: Number(playerState.mana ?? 0),
            max: Number(playerState.maxMana ?? 0),
          },
        }
      : { hp: null, mana: null };
  }

  function normalizeHotbarSlot(slot) {
    const value = Number(slot);
    if (!Number.isFinite(value)) {
      return null;
    }

    const normalized = Math.trunc(value);
    if (normalized < 1 || normalized > 12) {
      return null;
    }

    return normalized;
  }

  function hasPendingAttempt() {
    return !!(state.pendingHpAttempt || state.pendingManaAttempt);
  }

  function didHpHealSucceed(stats, attempt) {
    if (!stats?.hp || !attempt) {
      return false;
    }

    return (
      stats.hp.current > attempt.hpBefore ||
      (Number.isFinite(attempt.manaBefore) && Number.isFinite(stats.mana?.current) && stats.mana.current < attempt.manaBefore)
    );
  }

  function didManaHealSucceed(stats, attempt) {
    if (!stats?.mana || !attempt) {
      return false;
    }

    return (
      stats.mana.current > attempt.manaBefore ||
      (Number.isFinite(attempt.hpBefore) && Number.isFinite(stats.hp?.current) && stats.hp.current > attempt.hpBefore)
    );
  }

  function resolvePendingAttempts(stats, now = Date.now()) {
    const hpAttempt = state.pendingHpAttempt;
    if (hpAttempt) {
      if (didHpHealSucceed(stats, hpAttempt)) {
        state.lastHpHealAt = hpAttempt.attemptedAt;
        state.pendingHpAttempt = null;
        bot.log("confirmed hp heal", { slot: hpAttempt.slot });
      } else if (now - hpAttempt.attemptedAt >= Math.max(50, Number(config.healConfirmMs) || 0)) {
        state.pendingHpAttempt = null;
        bot.log("hp heal did not register", { slot: hpAttempt.slot });
      }
    }

    const manaAttempt = state.pendingManaAttempt;
    if (manaAttempt) {
      if (didManaHealSucceed(stats, manaAttempt)) {
        state.lastManaHealAt = manaAttempt.attemptedAt;
        state.pendingManaAttempt = null;
        bot.log("confirmed mana heal", { slot: manaAttempt.slot });
      } else if (now - manaAttempt.attemptedAt >= Math.max(50, Number(config.healConfirmMs) || 0)) {
        state.pendingManaAttempt = null;
        bot.log("mana heal did not register", { slot: manaAttempt.slot });
      }
    }
  }

  function canUseHpHeal(now = Date.now(), stats = readStats()) {
    const { hp } = stats;
    const slot = normalizeHotbarSlot(config.hpHotbarSlot);
    if (!hp || !slot || state.pendingHpAttempt) return false;

    return (
      hp.current > 0 &&
      hp.current <= Math.max(0, Number(config.minHp) || 0) &&
      now - state.lastHpHealAt >= config.healCooldownMs &&
      now - state.lastHpAttemptAt >= Math.max(50, Number(config.healRetryMs) || 0)
    );
  }

  function canUseManaHeal(now = Date.now(), stats = readStats()) {
    const { mana } = stats;
    const slot = normalizeHotbarSlot(config.manaHotbarSlot);
    if (!mana || !slot || state.pendingManaAttempt || state.pendingHpAttempt) return false;

    return (
      mana.current <= Math.max(0, Number(config.minMana) || 0) &&
      now - state.lastManaHealAt >= config.healCooldownMs &&
      now - state.lastManaAttemptAt >= Math.max(50, Number(config.healRetryMs) || 0)
    );
  }

  function triggerHpHeal(now = Date.now(), stats = readStats()) {
    if (!canUseHpHeal(now, stats)) {
      return false;
    }

    const slot = normalizeHotbarSlot(config.hpHotbarSlot);
    const clicked = bot.clickHotbar(slot - 1);
    if (clicked) {
      state.lastHpAttemptAt = now;
      state.pendingHpAttempt = {
        attemptedAt: now,
        slot,
        hpBefore: Number(stats.hp?.current ?? 0),
        manaBefore: Number(stats.mana?.current ?? 0),
      };
      bot.log("pressed hp heal hotkey", { slot, minHp: config.minHp });
    }

    return clicked;
  }

  function triggerManaHeal(now = Date.now(), stats = readStats()) {
    if (!canUseManaHeal(now, stats)) {
      return false;
    }

    const slot = normalizeHotbarSlot(config.manaHotbarSlot);
    const clicked = bot.clickHotbar(slot - 1);
    if (clicked) {
      state.lastManaAttemptAt = now;
      state.pendingManaAttempt = {
        attemptedAt: now,
        slot,
        hpBefore: Number(stats.hp?.current ?? 0),
        manaBefore: Number(stats.mana?.current ?? 0),
      };
      bot.log("pressed mana heal hotkey", { slot, minMana: config.minMana });
    }

    return clicked;
  }

  function tryHeal() {
    if (!config.enabled) {
      return false;
    }

    const now = Date.now();
    const stats = readStats();

    resolvePendingAttempts(stats, now);

    if (hasPendingAttempt()) {
      return false;
    }

    if (triggerHpHeal(now, stats)) {
      return true;
    }

    return triggerManaHeal(now, stats);
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function tick() {
    if (!state.running) return;

    try {
      tryHeal();
    } catch (error) {
      bot.log("auto heal tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();

    if (state.running) {
      bot.log("auto heal already running");
      return false;
    }

    state.running = true;
    bot.log("auto heal started", { ...config });
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("auto heal stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      stats: readStats(),
      lastHpHealAt: state.lastHpHealAt,
      lastManaHealAt: state.lastManaHealAt,
      lastHpAttemptAt: state.lastHpAttemptAt,
      lastManaAttemptAt: state.lastManaAttemptAt,
      pendingHpAttempt: state.pendingHpAttempt ? { ...state.pendingHpAttempt } : null,
      pendingManaAttempt: state.pendingManaAttempt ? { ...state.pendingManaAttempt } : null,
    };
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "hpHotbarSlot")) {
      nextConfig.hpHotbarSlot = normalizeHotbarSlot(nextConfig.hpHotbarSlot) ?? config.hpHotbarSlot;
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "manaHotbarSlot")) {
      nextConfig.manaHotbarSlot = normalizeHotbarSlot(nextConfig.manaHotbarSlot) ?? config.manaHotbarSlot;
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "minHp")) {
      nextConfig.minHp = Math.max(0, Number(nextConfig.minHp) || 0);
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "minMana")) {
      nextConfig.minMana = Math.max(0, Number(nextConfig.minMana) || 0);
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "healRetryMs")) {
      nextConfig.healRetryMs = Math.max(50, Number(nextConfig.healRetryMs) || 50);
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "healConfirmMs")) {
      nextConfig.healConfirmMs = Math.max(50, Number(nextConfig.healConfirmMs) || 50);
    }

    Object.assign(config, nextConfig);
    persistConfig();
    bot.log("auto heal config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.heal = {
    start,
    stop,
    status,
    updateConfig,
    readStats,
    tryHeal,
    canUseHpHeal,
    canUseManaHeal,
    triggerHpHeal,
    triggerManaHeal,
    normalizeHotbarSlot,
    config,
  };
};
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installAutoInvisibleModule = function installAutoInvisibleModule(bot) {
  const configStorageKey = "minibiaCopilot.invisible.config";
  const INVISIBLE_CONDITION_ID = 4;
  const state = {
    running: false,
    timerId: null,
    lastCastAt: 0,
  };
  let resumeListenersAttached = false;

  const config = Object.assign(
    {
      tickMs: 250,
      spellWords: "utana vid",
      recastCooldownMs: 1000,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 250;

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function getInvisibleConditionId() {
    return window.ConditionManager?.prototype?.INVISIBLE ?? INVISIBLE_CONDITION_ID;
  }

  function isInvisibleActive() {
    const player = window.gameClient?.player;
    const conditions = player?.conditions;
    const invisibleConditionId = getInvisibleConditionId();

    if (conditions?.has) {
      return conditions.has(invisibleConditionId);
    }

    if (player?.hasCondition) {
      return player.hasCondition(invisibleConditionId);
    }

    return false;
  }

  function getGateStatus(now = Date.now()) {
    const cooldownRemainingMs = Math.max(0, config.recastCooldownMs - (now - state.lastCastAt));
    const cooldownReady = cooldownRemainingMs === 0;
    const invisibleActive = isInvisibleActive();

    return {
      invisibleActive,
      cooldownReady,
      cooldownRemainingMs,
      canCast: !invisibleActive && cooldownReady,
    };
  }

  function canCastInvisible(now = Date.now()) {
    return getGateStatus(now).canCast;
  }

  function tryCastInvisible(now = Date.now()) {
    if (!config.enabled || !canCastInvisible(now)) {
      return false;
    }

    const sent = bot.sendChat(config.spellWords);
    if (sent) {
      state.lastCastAt = now;
      bot.log("cast invisible spell", { spellWords: config.spellWords });
    }

    return sent;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function runImmediateTick() {
    if (!state.running) return;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    tick();
  }

  function handleResume() {
    if (document.hidden) {
      return;
    }

    runImmediateTick();
  }

  function attachResumeListeners() {
    if (resumeListenersAttached) {
      return;
    }

    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    resumeListenersAttached = true;
  }

  function detachResumeListeners() {
    if (!resumeListenersAttached) {
      return;
    }

    document.removeEventListener("visibilitychange", handleResume);
    window.removeEventListener("focus", handleResume);
    window.removeEventListener("pageshow", handleResume);
    resumeListenersAttached = false;
  }

  function tick() {
    if (!state.running) return;

    try {
      tryCastInvisible();
    } catch (error) {
      bot.log("auto invisible tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 250;
    persistConfig();

    if (state.running) {
      bot.log("auto invisible already running");
      return false;
    }

    state.running = true;
    attachResumeListeners();
    bot.log("auto invisible started", { ...config });
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    detachResumeListeners();

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }

    bot.log("auto invisible stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      gates: getGateStatus(),
      lastCastAt: state.lastCastAt,
    };
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "spellWords")) {
      nextConfig.spellWords = String(nextConfig.spellWords || "").trim() || config.spellWords;
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "recastCooldownMs")) {
      nextConfig.recastCooldownMs = Math.max(0, Number(nextConfig.recastCooldownMs) || 0);
    }

    Object.assign(config, nextConfig);
    config.tickMs = 250;
    persistConfig();
    bot.log("auto invisible config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.invisible = {
    start,
    stop,
    status,
    updateConfig,
    isInvisibleActive,
    canCastInvisible,
    tryCastInvisible,
    config,
  };
};
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installAutoMagicShieldModule = function installAutoMagicShieldModule(bot) {
  const configStorageKey = "minibiaCopilot.magicShield.config";
  const MAGIC_SHIELD_FALLBACK_DURATION_MS = 180000;
  const state = {
    running: false,
    timerId: null,
    lastCastAt: 0,
    assumedActiveUntil: 0,
  };
  let resumeListenersAttached = false;

  const config = Object.assign(
    {
      tickMs: 250,
      spellWords: "utamo vita",
      recastCooldownMs: 1000,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 250;

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function getMagicShieldConditionId() {
    const conditionManagerPrototype = window.ConditionManager?.prototype;
    const playerConditions = window.gameClient?.player?.conditions;
    const candidateKeys = [
      "MAGIC_SHIELD",
      "MANA_SHIELD",
      "MAGICSHIELD",
      "MANASHIELD",
      "UTAMO_VITA",
    ];

    for (const key of candidateKeys) {
      const value = conditionManagerPrototype?.[key] ?? playerConditions?.[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }

    return null;
  }

  function isMagicShieldActive(now = Date.now()) {
    const player = window.gameClient?.player;
    const conditions = player?.conditions;
    const magicShieldConditionId = getMagicShieldConditionId();

    if (magicShieldConditionId != null) {
      if (conditions?.has) {
        return conditions.has(magicShieldConditionId);
      }

      if (player?.hasCondition) {
        return player.hasCondition(magicShieldConditionId);
      }
    }

    return now < state.assumedActiveUntil;
  }

  function getGateStatus(now = Date.now()) {
    const cooldownRemainingMs = Math.max(0, config.recastCooldownMs - (now - state.lastCastAt));
    const cooldownReady = cooldownRemainingMs === 0;
    const magicShieldActive = isMagicShieldActive(now);

    return {
      magicShieldActive,
      cooldownReady,
      cooldownRemainingMs,
      canCast: !magicShieldActive && cooldownReady,
    };
  }

  function canCastMagicShield(now = Date.now()) {
    return getGateStatus(now).canCast;
  }

  function tryCastMagicShield(now = Date.now()) {
    if (!config.enabled || !canCastMagicShield(now)) {
      return false;
    }

    const sent = bot.sendChat(config.spellWords);
    if (sent) {
      state.lastCastAt = now;
      state.assumedActiveUntil = now + MAGIC_SHIELD_FALLBACK_DURATION_MS;
      bot.log("cast magic shield spell", { spellWords: config.spellWords });
    }

    return sent;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function runImmediateTick() {
    if (!state.running) return;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    tick();
  }

  function handleResume() {
    if (document.hidden) {
      return;
    }

    runImmediateTick();
  }

  function attachResumeListeners() {
    if (resumeListenersAttached) {
      return;
    }

    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    resumeListenersAttached = true;
  }

  function detachResumeListeners() {
    if (!resumeListenersAttached) {
      return;
    }

    document.removeEventListener("visibilitychange", handleResume);
    window.removeEventListener("focus", handleResume);
    window.removeEventListener("pageshow", handleResume);
    resumeListenersAttached = false;
  }

  function tick() {
    if (!state.running) return;

    try {
      tryCastMagicShield();
    } catch (error) {
      bot.log("auto magic shield tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 250;
    persistConfig();

    if (state.running) {
      bot.log("auto magic shield already running");
      return false;
    }

    state.running = true;
    attachResumeListeners();
    bot.log("auto magic shield started", { ...config });
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    detachResumeListeners();

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }

    bot.log("auto magic shield stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      gates: getGateStatus(),
      lastCastAt: state.lastCastAt,
      assumedActiveUntil: state.assumedActiveUntil,
    };
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "spellWords")) {
      nextConfig.spellWords = String(nextConfig.spellWords || "").trim() || config.spellWords;
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "recastCooldownMs")) {
      nextConfig.recastCooldownMs = Math.max(0, Number(nextConfig.recastCooldownMs) || 0);
    }

    Object.assign(config, nextConfig);
    config.tickMs = 250;
    persistConfig();
    bot.log("auto magic shield config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.magicShield = {
    start,
    stop,
    status,
    updateConfig,
    isMagicShieldActive,
    canCastMagicShield,
    tryCastMagicShield,
    config,
  };
};
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installAutoAttackModule = function installAutoAttackModule(bot) {
  const configStorageKey = "minibiaCopilot.attack.config";
  const state = {
    running: false,
    timerId: null,
    lastTargetHotkeyAt: 0,
    lastRuneHotkeyAt: 0,
    engagedTargetId: null,
    combatStartedAt: 0,
    lastChaseAt: 0,
    lastChaseDestinationKey: null,
    lastFollowTargetId: null,
    lastFollowDistance: Number.POSITIVE_INFINITY,
    lastFollowProgressAt: 0,
    lastFollowStallAt: 0,
    lastFollowSentAt: 0,
    lastFollowSentTargetId: null,
    lastChasePlayerPosKey: null,
    lastChaseProgressAt: 0,
    lastChaseStalledTargetId: null,
    lastChaseDestinationKey: null,
    lastCancelKey: null,
    lastCancelAt: 0,
    skippedTargetIds: new Map(),
  };

  const storedConfig = bot.storage.get(configStorageKey, {}) || {};
  if (storedConfig.tickMs === 500) delete storedConfig.tickMs;
  if (storedConfig.tickMs === 250) delete storedConfig.tickMs;
  if (storedConfig.targetCooldownMs === 1200) delete storedConfig.targetCooldownMs;
  if (storedConfig.targetCooldownMs === 500) delete storedConfig.targetCooldownMs;
  if (storedConfig.runeCooldownMs === 1200) delete storedConfig.runeCooldownMs;
  if (storedConfig.runeCooldownMs === 500) delete storedConfig.runeCooldownMs;
  delete storedConfig.targetingStrategy;
  delete storedConfig.preemptPriority;
  delete storedConfig.attackRange;
  delete storedConfig.chaseInNonMelee;
  if (storedConfig.tickMs === 150 || storedConfig.tickMs === 100 || storedConfig.tickMs === 250) {
    delete storedConfig.tickMs;
  }
  if (storedConfig.targetCooldownMs === 300 || storedConfig.targetCooldownMs === 200 || storedConfig.targetCooldownMs === 500) {
    delete storedConfig.targetCooldownMs;
  }
  if (storedConfig.runeCooldownMs === 300 || storedConfig.runeCooldownMs === 250 || storedConfig.runeCooldownMs === 500) {
    delete storedConfig.runeCooldownMs;
  }
  const config = Object.assign(
    {
      tickMs: 500,
      runeHotbarSlot: null,
      targetCooldownMs: 1500,
      runeCooldownMs: 2000,
      maxTargetDistance: 7,
      meleeMode: true,
      enabled: false,
      safeDistance: 4,
      kitingEnabled: true,
      targetPriority: [],
    },
    storedConfig
  );

  if (!Array.isArray(config.targetPriority)) config.targetPriority = [];
  if (config.targetHotbarSlot == null && storedConfig.hotbarSlot != null) {
    config.targetHotbarSlot = storedConfig.hotbarSlot;
  }

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeHotbarSlot(slot) {
    const value = Number(slot);
    if (!Number.isFinite(value)) {
      return null;
    }

    const normalized = Math.trunc(value);
    if (normalized < 1 || normalized > 12) {
      return null;
    }

    return normalized;
  }

  function getNearbyMonsters() {
    // Use the in-game battle list as the source of truth — it's the same
    // set the player sees as engageable.
    const battleWindow = window.gameClient?.interface?.windowManager?.getWindow?.("battle-window");
    const body = typeof battleWindow?.getBody === "function" ? battleWindow.getBody() : null;
    if (!body) return [];

    const playerId = window.gameClient?.player?.id;
    const out = [];
    for (const child of body.children) {
      const id = Number(child.id);
      if (!Number.isFinite(id)) continue;
      const creature = window.gameClient?.world?.getCreature?.(id);
      if (!creature) continue;
      if (creature === window.gameClient?.player) continue;
      // type 1 = monster in Minibia (CONST.TYPES.MONSTER)
      if (creature.type !== 1) continue;
      if (creature.masterId === playerId) continue;
      out.push(creature);
    }
    return out;
  }

  function normalizePosition(value) {
    if (!value) {
      return null;
    }

    const x = Number(value.x);
    const y = Number(value.y);
    const z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }

    return {
      x: Math.trunc(x),
      y: Math.trunc(y),
      z: Math.trunc(z),
    };
  }

  function getPositionKey(position) {
    return position ? `${position.x},${position.y},${position.z}` : null;
  }

  function isAdjacentTile(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) {
      return false;
    }

    const dx = Math.abs(Number(from.x) - Number(to.x));
    const dy = Math.abs(Number(from.y) - Number(to.y));
    return (dx !== 0 || dy !== 0) && dx <= 1 && dy <= 1;
  }

  function getTileDistance(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) {
      return Number.POSITIVE_INFINITY;
    }

    return Math.max(
      Math.abs(Number(from.x) - Number(to.x)),
      Math.abs(Number(from.y) - Number(to.y))
    );
  }

  function isSameCreature(left, right) {
    if (!left || !right) {
      return false;
    }

    return left === right || left.id === right.id;
  }

  function findNearbyMonster(creature) {
    if (!creature) {
      return null;
    }

    const nearbyMonsters = getNearbyMonsters();
    return nearbyMonsters.find((monster) => isSameCreature(monster, creature)) || null;
  }

  function findNearbyMonsterById(id) {
    if (id == null) {
      return null;
    }

    return getNearbyMonsters().find((monster) => monster?.id === id) || null;
  }

  function getCurrentTarget() {
    return window.gameClient?.player?.__target || null;
  }

  function getCurrentFollowTarget() {
    return window.gameClient?.player?.__followTarget || null;
  }

  function pruneSkippedTargets(now = Date.now()) {
    for (const [id, expiresAt] of state.skippedTargetIds.entries()) {
      if (expiresAt <= now) {
        state.skippedTargetIds.delete(id);
      }
    }
  }

  function resetFollowProgress() {
    state.lastFollowTargetId = null;
    state.lastFollowDistance = Number.POSITIVE_INFINITY;
    state.lastFollowProgressAt = 0;
    state.lastFollowStallAt = 0;
  }

  function clearEngagedTarget() {
    state.engagedTargetId = null;
    state.combatStartedAt = 0;
    state.lastChaseDestinationKey = null;
    resetFollowProgress();
  }

  function clearCurrentFollowTarget() {
    if (!window.gameClient?.player || typeof window.gameClient.send !== "function") {
      return false;
    }

    if (typeof FollowPacket !== "function") {
      return false;
    }

    if (!getCurrentFollowTarget()) {
      return false;
    }

    window.gameClient.player.setFollowTarget(null);
    window.gameClient.send(new FollowPacket(0));
    state.lastFollowSentAt = 0;
    state.lastFollowSentTargetId = null;
    return true;
  }

  function clearCurrentTarget() {
    if (!window.gameClient?.player || typeof window.gameClient.send !== "function") {
      return false;
    }

    if (typeof TargetPacket !== "function") {
      return false;
    }

    if (!getCurrentTarget()) {
      return false;
    }

    window.gameClient.player.setTarget(null);
    window.gameClient.send(new TargetPacket(0));
    return true;
  }

  function markCombatActive(now = Date.now()) {
    if (!state.combatStartedAt) {
      state.combatStartedAt = now;
    }
  }

  function getCombatTargetCount() {
    return getEngagedTarget() ? 1 : 0;
  }

  function isCombatActive() {
    if (!config.enabled || !state.running) {
      return false;
    }

    return !!getEngagedTarget();
  }

  function syncCombatState(now = Date.now()) {
    if (isCombatActive()) {
      markCombatActive(now);
      return true;
    }

    state.combatStartedAt = 0;
    return false;
  }

  function getEngagedTarget() {
    const currentTarget = getCurrentTarget();
    if (currentTarget) {
      state.engagedTargetId = currentTarget.id;
      return currentTarget;
    }

    if (state.engagedTargetId == null) {
      return null;
    }

    const followTarget = getCurrentFollowTarget();
    if (followTarget && followTarget.id === state.engagedTargetId) {
      return findNearbyMonster(followTarget) || followTarget;
    }

    const nearbyTarget = findNearbyMonsterById(state.engagedTargetId);
    if (nearbyTarget) {
      return nearbyTarget;
    }

    clearEngagedTarget();
    return null;
  }

  function setCurrentTarget(target) {
    if (!target || !window.gameClient?.player || typeof window.gameClient.send !== "function") {
      return false;
    }

    if (typeof TargetPacket !== "function") {
      return false;
    }

    window.gameClient.player.setTarget(target);
    window.gameClient.send(new TargetPacket(target.id));
    state.engagedTargetId = target.id;
    return true;
  }

  function setCurrentFollowTarget(target) {
    if (!target || !window.gameClient?.player || typeof window.gameClient.send !== "function") {
      return false;
    }

    if (typeof FollowPacket !== "function") {
      return false;
    }

    const now = Date.now();
    const targetId = target.id;
    const isSameTarget = state.lastFollowSentTargetId === targetId;
    if (isSameTarget && now - state.lastFollowSentAt < 350) {
      return true;
    }

    window.gameClient.player.setFollowTarget(target);
    window.gameClient.send(new FollowPacket(targetId));
    state.lastFollowSentAt = now;
    state.lastFollowSentTargetId = targetId;

    if (!isSameTarget) {
      bot.log("follow target set", { id: targetId, name: target.name || "Mob" });
    }
    return true;
  }

  function skipTarget(target, reason, now = Date.now(), skipMs = 4000) {
    if (!target?.id) {
      return false;
    }

    const until = now + Math.max(500, Number(skipMs) || 0);
    state.skippedTargetIds.set(target.id, until);

    const clearedTarget = isSameCreature(getCurrentTarget(), target) ? clearCurrentTarget() : false;
    const clearedFollow = isSameCreature(getCurrentFollowTarget(), target) ? clearCurrentFollowTarget() : false;

    if (state.engagedTargetId === target.id) {
      clearEngagedTarget();
    } else if (state.lastFollowTargetId === target.id) {
      resetFollowProgress();
    }

    bot.log("skipping auto attack target", {
      id: target.id,
      name: target.name || "Mob",
      reason,
      skippedForMs: Math.max(500, Number(skipMs) || 0),
      clearedTarget,
      clearedFollow,
    });
    return true;
  }

  function isTargetSkipped(target, now = Date.now()) {
    pruneSkippedTargets(now);
    return !!target?.id && (state.skippedTargetIds.get(target.id) || 0) > now;
  }

  function normalizeMonsterName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function getPriorityIndex(monster) {
    if (!monster?.name) return Number.POSITIVE_INFINITY;
    const list = Array.isArray(config.targetPriority) ? config.targetPriority : [];
    if (!list.length) return Number.POSITIVE_INFINITY;
    const lower = normalizeMonsterName(monster.name);
    for (let index = 0; index < list.length; index += 1) {
      if (normalizeMonsterName(list[index]) === lower) return index;
    }
    return Number.POSITIVE_INFINITY;
  }

  function isPriorityMonster(monster) {
    return Number.isFinite(getPriorityIndex(monster));
  }

  function compareCandidatesByPriority(left, right, playerPosition) {
    const leftDistance = getTileDistance(
      playerPosition,
      normalizePosition(left?.getPosition?.() || left?.__position)
    );
    const rightDistance = getTileDistance(
      playerPosition,
      normalizePosition(right?.getPosition?.() || right?.__position)
    );

    const leftBlocker = leftDistance <= 1;
    const rightBlocker = rightDistance <= 1;
    if (leftBlocker !== rightBlocker) return leftBlocker ? -1 : 1;
    if (leftBlocker && rightBlocker) {
      return leftDistance - rightDistance || Number(left?.id || 0) - Number(right?.id || 0);
    }

    const priorityDelta = getPriorityIndex(left) - getPriorityIndex(right);
    if (priorityDelta !== 0) return priorityDelta;

    return leftDistance - rightDistance || Number(left?.id || 0) - Number(right?.id || 0);
  }

  function getMonsterCandidates(now = Date.now()) {
    pruneSkippedTargets(now);

    const playerPosition = normalizePosition(bot.getPlayerPosition());
    return getNearbyMonsters()
      .filter((monster) => !isTargetSkipped(monster, now))
      .sort((left, right) => compareCandidatesByPriority(left, right, playerPosition));
  }

  function shouldGiveUpTarget(target) {
    const maxTargetDistance = Math.max(1, Number(config.maxTargetDistance) || 8);
    const playerPosition = normalizePosition(bot.getPlayerPosition());
    const targetPosition = normalizePosition(target?.getPosition?.() || target?.__position);
    if (!playerPosition || !targetPosition) {
      return false;
    }

    return getTileDistance(playerPosition, targetPosition) > maxTargetDistance;
  }

  function resetTargetIfTooFar() {
    const currentTarget = getCurrentTarget();
    if (currentTarget && shouldGiveUpTarget(currentTarget)) {
      skipTarget(currentTarget, "target too far", Date.now(), 800);
      bot.log("gave up distant auto attack target", {
        id: currentTarget.id,
        name: currentTarget.name || "Mob",
        position: normalizePosition(currentTarget.getPosition?.() || currentTarget.__position),
        maxTargetDistance: Math.max(1, Number(config.maxTargetDistance) || 8),
      });
      return true;
    }

    const engagedTarget = getEngagedTarget();
    if (engagedTarget && shouldGiveUpTarget(engagedTarget)) {
      skipTarget(engagedTarget, "engaged target too far", Date.now(), 800);
      bot.log("gave up distant auto attack target", {
        id: engagedTarget.id,
        name: engagedTarget.name || "Mob",
        position: normalizePosition(engagedTarget.getPosition?.() || engagedTarget.__position),
        maxTargetDistance: Math.max(1, Number(config.maxTargetDistance) || 8),
      });
      return true;
    }

    return false;
  }

  function getTileFromPosition(position) {
    if (!position || typeof Position !== "function") {
      return null;
    }

    return window.gameClient?.world?.getTileFromWorldPosition?.(
      new Position(position.x, position.y, position.z)
    ) || null;
  }

  function findReachableAdjacentPosition(targetPosition, playerPosition) {
    if (!targetPosition || !playerPosition) {
      return null;
    }

    const offsets = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    ];

    offsets.sort((a, b) => {
      const da = Math.abs(targetPosition.x + a.x - playerPosition.x) +
        Math.abs(targetPosition.y + a.y - playerPosition.y);
      const db = Math.abs(targetPosition.x + b.x - playerPosition.x) +
        Math.abs(targetPosition.y + b.y - playerPosition.y);
      return da - db;
    });

    const pathfinder = window.gameClient?.world?.pathfinder;
    const startTile = getTileFromPosition(playerPosition);
    if (!pathfinder || !startTile || typeof pathfinder.search !== "function") {
      return null;
    }

    for (const offset of offsets) {
      const candidatePosition = {
        x: targetPosition.x + offset.x,
        y: targetPosition.y + offset.y,
        z: targetPosition.z,
      };
      const tile = getTileFromPosition(candidatePosition);
      if (!tile?.isWalkable?.()) {
        continue;
      }

      if (candidatePosition.x === playerPosition.x && candidatePosition.y === playerPosition.y) {
        return candidatePosition;
      }

      try {
        const path = pathfinder.search(startTile, tile);
        if (Array.isArray(path) && path.length > 0) {
          return candidatePosition;
        }
      } catch (error) {
        bot.log("auto attack reachability check failed", {
          ...candidatePosition,
          error: error?.message || error,
        });
        return null;
      }
    }

    return null;
  }

  function findFleePosition(playerPosition, monsters, desiredDistance) {
    const pathfinder = window.gameClient?.world?.pathfinder;
    const startTile = getTileFromPosition(playerPosition);
    if (!pathfinder || !startTile || typeof pathfinder.search !== "function") return null;

    let bestCandidate = null;
    let bestScore = -Infinity;
    const searchRadius = Math.max(2, desiredDistance + 1);

    for (let dx = -searchRadius; dx <= searchRadius; dx += 1) {
      for (let dy = -searchRadius; dy <= searchRadius; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        const candidatePosition = {
          x: playerPosition.x + dx,
          y: playerPosition.y + dy,
          z: playerPosition.z,
        };
        const tile = getTileFromPosition(candidatePosition);
        if (!tile?.isWalkable?.()) continue;

        let minMonsterDistance = Infinity;
        for (const monster of monsters) {
          const monsterPosition = normalizePosition(monster.getPosition?.() || monster.__position);
          if (!monsterPosition || monsterPosition.z !== candidatePosition.z) continue;
          const distance = Math.max(
            Math.abs(monsterPosition.x - candidatePosition.x),
            Math.abs(monsterPosition.y - candidatePosition.y)
          );
          if (distance < minMonsterDistance) minMonsterDistance = distance;
        }

        if (!Number.isFinite(minMonsterDistance)) continue;
        if (minMonsterDistance <= 0) continue;

        const score = minMonsterDistance - 0.1 * (Math.abs(dx) + Math.abs(dy));
        if (score > bestScore) {
          try {
            const path = pathfinder.search(startTile, tile);
            if (Array.isArray(path) && path.length > 0) {
              bestScore = score;
              bestCandidate = candidatePosition;
            }
          } catch (error) {}
        }
      }
    }

    return bestCandidate;
  }

  function syncKite(now = Date.now()) {
    if (config.meleeMode || !config.kitingEnabled) return false;
    const target = getEngagedTarget();
    if (!target) return false;

    const playerPosition = normalizePosition(bot.getPlayerPosition());
    const targetPosition = normalizePosition(target.getPosition?.() || target.__position);
    if (!playerPosition || !targetPosition || playerPosition.z !== targetPosition.z) return false;

    const desiredDistance = Math.max(1, Math.min(7, Math.trunc(Number(config.safeDistance) || 4)));
    const currentDistance = getTileDistance(playerPosition, targetPosition);
    if (currentDistance >= desiredDistance) return false;

    if (now - state.lastChaseAt < 150) return true;

    const monsters = getNearbyMonsters();
    const fleeTo = findFleePosition(playerPosition, monsters, desiredDistance);
    if (!fleeTo) {
      bot.log("kite: no safe tile found", { currentDistance, desiredDistance });
      return false;
    }

    try {
      window.gameClient?.world?.pathfinder?.findPath?.(
        new Position(playerPosition.x, playerPosition.y, playerPosition.z),
        new Position(fleeTo.x, fleeTo.y, fleeTo.z)
      );
      state.lastChaseAt = now;
      bot.log("kite: backing away to safe tile", { from: playerPosition, to: fleeTo, currentDistance, desiredDistance });
      return true;
    } catch (error) {
      bot.log("kite path failed", { error: error?.message || error });
      return false;
    }
  }

  function syncRangedChase(now = Date.now()) {
    if (config.meleeMode) return false;
    const target = getEngagedTarget();
    if (!target) return false;

    const playerPosition = normalizePosition(bot.getPlayerPosition());
    const targetPosition = normalizePosition(target.getPosition?.() || target.__position);
    if (!playerPosition || !targetPosition || playerPosition.z !== targetPosition.z) return false;

    // Kite handles too-close case when enabled.
    if (config.kitingEnabled) {
      const safeDistance = Math.max(1, Math.min(7, Number(config.safeDistance) || 4));
      const currentDistance = getTileDistance(playerPosition, targetPosition);
      if (currentDistance < safeDistance) return false;
    }

    if (checkChaseStall(target, now)) return false;

    // Same conservative pathfind chase as melee — one click toward an
    // adjacent tile, no follow spam, no diagonal micromanagement.
    const chaseThrottle = Math.max(100, Number(config.chaseThrottleMs) || 300);
    if (now - state.lastChaseAt < chaseThrottle) return true;

    const adjacentPosition = findReachableAdjacentPosition(targetPosition, playerPosition);
    if (!adjacentPosition) return false;

    try {
      const pathfinder = window.gameClient?.world?.pathfinder;
      if (pathfinder?.findPath) {
        pathfinder.findPath(
          new Position(playerPosition.x, playerPosition.y, playerPosition.z),
          new Position(adjacentPosition.x, adjacentPosition.y, adjacentPosition.z)
        );
        state.lastChaseAt = now;
      }
    } catch (error) {
      bot.log("ranged chase pathfind failed", { error: error?.message || error });
    }
    return true;
  }

  function checkChaseStall(target, now) {
    const playerPosition = normalizePosition(bot.getPlayerPosition());
    if (!playerPosition) return false;
    const posKey = `${playerPosition.x},${playerPosition.y}`;
    if (posKey !== state.lastChasePlayerPosKey) {
      state.lastChasePlayerPosKey = posKey;
      state.lastChaseProgressAt = now;
      state.lastChaseStalledTargetId = null;
      return false;
    }
    if (!state.lastChaseProgressAt) {
      state.lastChaseProgressAt = now;
      return false;
    }
    if (now - state.lastChaseProgressAt < 1500) return false;
    if (state.lastChaseStalledTargetId === target.id) return false;
    state.lastChaseStalledTargetId = target.id;
    bot.log("chase stalled 2s, dropping target", { id: target.id, name: target.name || "Mob" });
    skipTarget(target, "chase stalled 2s", now, 1500);
    return true;
  }

  function syncMeleeChase(now = Date.now()) {
    if (!config.meleeMode) return false;
    const target = getEngagedTarget();
    if (!target) {
      clearEngagedTarget();
      return false;
    }

    const playerPosition = normalizePosition(bot.getPlayerPosition());
    const targetPosition = normalizePosition(target.getPosition?.() || target.__position);
    if (!playerPosition || !targetPosition || playerPosition.z !== targetPosition.z) return false;

    if (isAdjacentTile(playerPosition, targetPosition)) {
      state.lastChaseProgressAt = now;
      state.lastChaseStalledTargetId = null;
      state.lastChaseDestinationKey = null;
      return false;
    }

    if (checkChaseStall(target, now)) return false;

    // Throttled, single pathfind to an adjacent walkable tile. No
    // FollowPacket spam, no diagonal micromanagement — looks like a
    // player clicking once to walk to the monster.
    const chaseThrottle = Math.max(100, Number(config.chaseThrottleMs) || 300);
    if (now - state.lastChaseAt < chaseThrottle) return true;

    const adjacentPosition = findReachableAdjacentPosition(targetPosition, playerPosition);
    if (!adjacentPosition) return false;

    const destinationKey = `${adjacentPosition.x},${adjacentPosition.y},${adjacentPosition.z}`;
    if (
      destinationKey === state.lastChaseDestinationKey &&
      now - state.lastChaseAt < chaseThrottle * 2
    ) {
      return true;
    }

    try {
      const pathfinder = window.gameClient?.world?.pathfinder;
      if (pathfinder?.findPath) {
        pathfinder.findPath(
          new Position(playerPosition.x, playerPosition.y, playerPosition.z),
          new Position(adjacentPosition.x, adjacentPosition.y, adjacentPosition.z)
        );
        state.lastChaseAt = now;
        state.lastChaseDestinationKey = destinationKey;
      }
    } catch (error) {
      bot.log("chase pathfind failed", { error: error?.message || error });
    }
    return true;
  }

  function canAttack(now = Date.now()) {
    if (now - state.lastTargetHotkeyAt < Math.max(0, Number(config.targetCooldownMs) || 0)) {
      return false;
    }
    return getNearbyMonsters().length > 0;
  }

  function shouldPreemptCurrent(currentTarget, bestCandidate, playerPosition) {
    if (!currentTarget || !bestCandidate || !playerPosition) return false;
    if (isSameCreature(currentTarget, bestCandidate)) return false;

    const currentDistance = getTileDistance(
      playerPosition,
      normalizePosition(currentTarget?.getPosition?.() || currentTarget?.__position)
    );
    const bestDistance = getTileDistance(
      playerPosition,
      normalizePosition(bestCandidate?.getPosition?.() || bestCandidate?.__position)
    );
    const currentIsAdjacent = currentDistance <= 1;
    const bestIsAdjacent = bestDistance <= 1;
    const currentPriority = getPriorityIndex(currentTarget);
    const bestPriority = getPriorityIndex(bestCandidate);

    if (bestIsAdjacent && !currentIsAdjacent) return true;
    if (bestPriority < currentPriority) return true;
    return false;
  }

  function triggerAttack(now = Date.now()) {
    if (!canAttack(now)) return false;

    const candidates = getMonsterCandidates(now);
    if (!candidates.length) return false;

    const playerPosition = normalizePosition(bot.getPlayerPosition());
    const currentTarget = getCurrentTarget();
    const bestCandidate = candidates[0];

    if (currentTarget && !isTargetSkipped(currentTarget, now)) {
      if (shouldPreemptCurrent(currentTarget, bestCandidate, playerPosition)) {
        if (setCurrentTarget(bestCandidate)) {
          state.lastTargetHotkeyAt = now;
          markCombatActive(now);
          bot.log("preempting target", {
            from: currentTarget?.name || "Mob",
            to: bestCandidate.name || "Mob",
          });
          return true;
        }
      }
      return false;
    }

    if (setCurrentTarget(bestCandidate)) {
      state.lastTargetHotkeyAt = now;
      markCombatActive(now);
      bot.log("acquired target", {
        id: bestCandidate.id,
        name: bestCandidate.name || "Mob",
        priorityIndex: getPriorityIndex(bestCandidate),
      });
      return true;
    }

    return false;
  }

  function canUseRune(now = Date.now()) {
    const slot = normalizeHotbarSlot(config.runeHotbarSlot);
    if (!slot || !getCurrentTarget()) {
      return false;
    }

    if (now - state.lastRuneHotkeyAt < Math.max(0, Number(config.runeCooldownMs) || 0)) {
      return false;
    }

    return true;
  }

  function triggerRune(now = Date.now()) {
    if (!canUseRune(now)) {
      return false;
    }

    const slot = normalizeHotbarSlot(config.runeHotbarSlot);
    const clicked = bot.clickHotbar(slot - 1);
    if (clicked) {
      state.lastRuneHotkeyAt = now;
      markCombatActive(now);
      bot.log("used auto attack rune hotkey", {
        slot,
        target: getCurrentTarget()?.name || "Mob",
      });
    }

    return clicked;
  }

  function tryAttack() {
    if (!config.enabled) return false;

    const now = Date.now();
    if (resetTargetIfTooFar()) return true;
    syncCombatState(now);

    // Step 1: always try to acquire / preempt to the best target first.
    triggerAttack(now);

    // Step 2: if we have a target, position ourselves correctly.
    if (getCurrentTarget()) {
      if (config.meleeMode) {
        syncMeleeChase(now);
      } else {
        if (!syncKite(now)) {
          syncRangedChase(now);
        }
      }
      // Step 3: optional rune cast (no-op if no rune hotkey configured).
      triggerRune(now);
    }

    return true;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function tick() {
    if (!state.running) return;

    try {
      tryAttack();
    } catch (error) {
      bot.log("auto attack tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function handleServerCancel(message) {
    if (!state.running) return;
    const lower = String(message || "").toLowerCase();
    const target = getCurrentTarget() || getEngagedTarget();

    // Only react if the SAME cancel reason fires twice for the SAME target
    // within 4s. One isolated rejection could be a transient (chunk loading,
    // monster just moved, etc.) — reacting instantly looks bot-like.
    const reasonKey = (target?.id ?? "no-target") + "|" + (
      lower.includes("too far") ? "too_far" :
      lower.includes("no way") ? "no_way" :
      lower.includes("you cannot attack") ? "cannot_attack" :
      lower.includes("target lost") ? "target_lost" :
      ""
    );
    if (reasonKey.endsWith("|")) return;
    const now = Date.now();

    if (state.lastCancelKey !== reasonKey || now - state.lastCancelAt > 4000) {
      state.lastCancelKey = reasonKey;
      state.lastCancelAt = now;
      return;
    }

    // Same rejection twice — real problem. Skip / clear.
    if (reasonKey.endsWith("target_lost")) {
      clearEngagedTarget();
      clearCurrentTarget();
      clearCurrentFollowTarget();
      bot.log("auto-attack: 'target lost' confirmed — clearing");
    } else if (target) {
      skipTarget(target, "server confirmed: " + reasonKey.split("|")[1], now, 3000);
      bot.log("auto-attack: server rejected twice — skipping target", { name: target.name || "Mob", reason: reasonKey.split("|")[1] });
    }
    state.lastCancelKey = null;
    state.lastCancelAt = 0;
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();

    if (state.running) {
      bot.log("auto attack already running");
      return false;
    }

    state.running = true;
    if (!state.cancelMessageUnsubscribe && typeof bot.onCancelMessage === "function") {
      state.cancelMessageUnsubscribe = bot.onCancelMessage(handleServerCancel);
    }
    bot.log("auto attack started", { ...config });
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }

    clearEngagedTarget();
    state.lastChaseAt = 0;
    clearCurrentFollowTarget();
    state.skippedTargetIds.clear();

    if (state.cancelMessageUnsubscribe) {
      try { state.cancelMessageUnsubscribe(); } catch (error) {}
      state.cancelMessageUnsubscribe = null;
    }

    bot.log("auto attack stopped");
    return true;
  }

  function status() {
    const combatActive = syncCombatState(Date.now());
    return {
      running: state.running,
      config: { ...config },
      lastTargetHotkeyAt: state.lastTargetHotkeyAt,
      lastRuneHotkeyAt: state.lastRuneHotkeyAt,
      engagedTargetId: state.engagedTargetId,
      combatActive,
      combatStartedAt: state.combatStartedAt || 0,
      combatDurationMs: state.combatStartedAt ? Math.max(0, Date.now() - state.combatStartedAt) : 0,
      targetCount: getCombatTargetCount(),
      lastChaseAt: state.lastChaseAt,
      currentTarget: getCurrentTarget()
        ? {
            id: getCurrentTarget().id,
            name: getCurrentTarget().name,
            type: getCurrentTarget().type,
            position: getCurrentTarget().__position || null,
          }
        : null,
      nearbyMonsters: getNearbyMonsters().map((creature) => ({
        id: creature.id,
        name: creature.name,
        type: creature.type,
        position: creature.__position || null,
      })),
    };
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "runeHotbarSlot")) {
      nextConfig.runeHotbarSlot = normalizeHotbarSlot(nextConfig.runeHotbarSlot);
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "maxTargetDistance")) {
      nextConfig.maxTargetDistance = Math.max(1, Math.trunc(Number(nextConfig.maxTargetDistance) || config.maxTargetDistance || 8));
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "safeDistance")) {
      nextConfig.safeDistance = Math.max(1, Math.min(7, Math.trunc(Number(nextConfig.safeDistance) || config.safeDistance || 4)));
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "targetPriority")) {
      const list = Array.isArray(nextConfig.targetPriority) ? nextConfig.targetPriority : [];
      const seen = new Set();
      nextConfig.targetPriority = [];
      list.forEach((name) => {
        const trimmed = String(name || "").trim();
        const key = trimmed.toLowerCase();
        if (trimmed && !seen.has(key)) {
          seen.add(key);
          nextConfig.targetPriority.push(trimmed);
        }
      });
    }

    Object.assign(config, nextConfig);
    persistConfig();
    bot.log("auto attack config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.addCleanup(() => {
    stop({ persistEnabled: false });
  });

  function addPriorityTarget(name, index) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return false;
    const key = trimmed.toLowerCase();
    const list = Array.isArray(config.targetPriority) ? config.targetPriority.slice() : [];
    if (list.some((existing) => existing.toLowerCase() === key)) return false;
    if (Number.isFinite(Number(index))) {
      const at = Math.max(0, Math.min(list.length, Math.trunc(Number(index))));
      list.splice(at, 0, trimmed);
    } else {
      list.push(trimmed);
    }
    updateConfig({ targetPriority: list });
    return true;
  }

  function removePriorityTarget(name) {
    const key = String(name || "").trim().toLowerCase();
    if (!key) return false;
    const list = Array.isArray(config.targetPriority) ? config.targetPriority : [];
    const next = list.filter((existing) => existing.toLowerCase() !== key);
    if (next.length === list.length) return false;
    updateConfig({ targetPriority: next });
    return true;
  }

  function movePriorityTarget(name, delta) {
    const key = String(name || "").trim().toLowerCase();
    if (!key) return false;
    const list = Array.isArray(config.targetPriority) ? config.targetPriority.slice() : [];
    const current = list.findIndex((existing) => existing.toLowerCase() === key);
    if (current < 0) return false;
    const target = current + Number(delta);
    if (target < 0 || target >= list.length || target === current) return false;
    const [item] = list.splice(current, 1);
    list.splice(target, 0, item);
    updateConfig({ targetPriority: list });
    return true;
  }

  function getPriorityTargets() {
    return Array.isArray(config.targetPriority) ? config.targetPriority.slice() : [];
  }

  function clearSkipList() {
    state.skippedTargetIds.clear();
    state.lastChaseStalledTargetId = null;
    state.lastChaseProgressAt = 0;
    return true;
  }

  bot.attack = {
    clearSkipList,
    start,
    stop,
    status,
    updateConfig,
    tryAttack,
    canAttack,
    triggerAttack,
    canUseRune,
    triggerRune,
    getNearbyMonsters,
    getCurrentTarget,
    getCurrentFollowTarget,
    isCombatActive,
    syncMeleeChase,
    normalizeHotbarSlot,
    addPriorityTarget,
    removePriorityTarget,
    movePriorityTarget,
    getPriorityTargets,
    config,
  };
};
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installCaveModule = function installCaveModule(bot) {
  const configStorageKey = "minibiaCopilot.cave.config";
  const routeStorageKey = "minibiaCopilot.cave.route";
  const transitionStorageKey = "minibiaCopilot.cave.transitions";
  const presetStorageKey = "minibiaCopilot.cave.presets";
  const defaultPresetName = "Default";
  const minimapOverlayRootId = "minibia-copilot-cave-minimap-overlay";
  const minimapOverlayStyleId = "minibia-copilot-cave-minimap-overlay-style";
  const ladderItemIds = new Set([1948, 1968]);
  const ropeNamePattern = /\brope\b/i;
  const shovelNamePattern = /\bshovel\b/i;
  const shovelTargetNamePatterns = [
    /\bstone pile\b/i,
    /\bloose stone pile\b/i,
    /\bgravel pile\b/i,
    /\bdirt pile\b/i,
  ];
  const validWaypointActions = new Set([
    "node",
    "stand",
    "walk",
    "rope",
    "ladder",
    "shovel",
    "use",
    "label",
  ]);
  const defaultWaypointAction = "node";
  const WAYPOINT_ICON_STYLES = {
    node:   { fill: "#2bd1c4", stroke: "#083f49", shape: "circle",  letter: null,  textColor: "#ffffff" },
    stand:  { fill: "#84e08a", stroke: "#0c3a0f", shape: "square",  letter: null,  textColor: "#ffffff" },
    walk:   { fill: "#9fb3c8", stroke: "#1a2a38", shape: "circle",  letter: null,  textColor: "#ffffff" },
    rope:   { fill: "#c98b4b", stroke: "#3a230a", shape: "circle",  letter: "R",   textColor: "#ffffff" },
    ladder: { fill: "#f3c75a", stroke: "#5a3d0a", shape: "circle",  letter: "L",   textColor: "#1a1306" },
    shovel: { fill: "#8a5a2b", stroke: "#241405", shape: "circle",  letter: "S",   textColor: "#ffffff" },
    use:    { fill: "#b58cf2", stroke: "#2f1c5a", shape: "diamond", letter: "U",   textColor: "#ffffff" },
    label:  { fill: "#d6d6d6", stroke: "#2a2a2a", shape: "diamond", letter: "*",   textColor: "#1a1a1a" },
  };
  const state = {
    running: false,
    userPaused: false,
    timerId: null,
    observerTimerId: null,
    currentIndex: 0,
    direction: 1,
    lastPathAt: 0,
    lastPositionKey: null,
    lastProgressAt: 0,
    lastStairsUseAt: 0,
    lastObservedPosition: null,
    pendingTransitionSource: null,
    pausedForCombat: false,
  };
  const minimapOverlayState = {
    timerId: null,
  };

  const storedCaveConfig = bot.storage.get(configStorageKey, {}) || {};
  if (storedCaveConfig.idleSnapMs === 10000) delete storedCaveConfig.idleSnapMs;
  if (storedCaveConfig.idleSnapMs === 3000) delete storedCaveConfig.idleSnapMs;
  if (storedCaveConfig.tickMs === 500 || storedCaveConfig.tickMs === 250 || storedCaveConfig.tickMs === 150) {
    delete storedCaveConfig.tickMs;
  }
  if (storedCaveConfig.repathMs === 1500 || storedCaveConfig.repathMs === 600 || storedCaveConfig.repathMs === 400) {
    delete storedCaveConfig.repathMs;
  }
  if (storedCaveConfig.monsterPauseRange === 9) delete storedCaveConfig.monsterPauseRange;
  const config = Object.assign(
    {
      tickMs: 500,
      repathMs: 2000,
      waypointTolerance: 0,
      idleSnapMs: 5000,
      monsterPauseRange: 7,
      combatStallMs: 10000,
      enabled: false,
      activePresetName: defaultPresetName,
    },
    storedCaveConfig
  );

  function normalizePresetName(value) {
    const normalized = String(value || "").trim().replace(/\s+/g, " ");
    return normalized || null;
  }

  function cloneValue(value) {
    return value ? JSON.parse(JSON.stringify(value)) : null;
  }

  function normalizePreset(value) {
    if (!value) {
      return null;
    }

    const name = normalizePresetName(value.name);
    if (!name) {
      return null;
    }

    return {
      name,
      route: normalizeRoute(value.route),
      transitions: normalizeTransitions(value.transitions),
    };
  }

  function normalizePresets(value) {
    const entries = Array.isArray(value) ? value : [];
    const deduped = new Map();

    entries.map(normalizePreset).filter(Boolean).forEach((preset) => {
      deduped.set(preset.name.toLowerCase(), preset);
    });

    return Array.from(deduped.values());
  }

  let route = normalizeRoute(bot.storage.get(routeStorageKey, []));
  let transitions = normalizeTransitions(bot.storage.get(transitionStorageKey, []));
  let presets = normalizePresets(bot.storage.get(presetStorageKey, []));

  if (!presets.length && (route.length || transitions.length)) {
    presets = [{
      name: defaultPresetName,
      route: route.map((waypoint) => cloneValue(waypoint)),
      transitions: transitions.map((transition) => cloneValue(transition)),
    }];
  }

  function getPresetNames() {
    return presets.map((preset) => preset.name);
  }

  function getPresetByName(name) {
    const normalizedName = normalizePresetName(name);
    if (!normalizedName) {
      return null;
    }

    return presets.find((preset) => preset.name.toLowerCase() === normalizedName.toLowerCase()) || null;
  }

  function getActivePresetName() {
    const configuredName = normalizePresetName(config.activePresetName);
    if (configuredName && getPresetByName(configuredName)) {
      return getPresetByName(configuredName).name;
    }

    if (presets.length) {
      return presets[0].name;
    }

    return configuredName || defaultPresetName;
  }

  function persistPresets() {
    bot.storage.set(
      presetStorageKey,
      presets.map((preset) => ({
        name: preset.name,
        route: preset.route.map((waypoint) => ({ ...waypoint })),
        transitions: preset.transitions.map((transition) => cloneValue(transition)),
      }))
    );
  }

  function persistLegacyActivePreset() {
    bot.storage.set(routeStorageKey, route.map((waypoint) => ({ ...waypoint })));
    bot.storage.set(transitionStorageKey, transitions.map((transition) => cloneValue(transition)));
  }

  function setActivePresetName(name) {
    config.activePresetName = normalizePresetName(name) || defaultPresetName;
    persistConfig();
    return config.activePresetName;
  }

  function upsertPreset(name, nextRoute = route, nextTransitions = transitions) {
    const normalizedName = normalizePresetName(name);
    if (!normalizedName) {
      return null;
    }

    const preset = {
      name: normalizedName,
      route: normalizeRoute(nextRoute).map((waypoint) => cloneValue(waypoint)),
      transitions: normalizeTransitions(nextTransitions).map((transition) => cloneValue(transition)),
    };
    const existingIndex = presets.findIndex((entry) => entry.name.toLowerCase() === normalizedName.toLowerCase());

    if (existingIndex >= 0) {
      presets[existingIndex] = preset;
    } else {
      presets.push(preset);
    }

    persistPresets();
    return preset;
  }

  function persistActivePreset() {
    upsertPreset(getActivePresetName(), route, transitions);
    persistLegacyActivePreset();
  }

  function loadPresetState(name) {
    const preset = getPresetByName(name);
    if (!preset) {
      return null;
    }

    route = normalizeRoute(preset.route);
    transitions = normalizeTransitions(preset.transitions);
    state.currentIndex = 0;
    state.direction = 1;
    state.pendingTransitionSource = null;
    setActivePresetName(preset.name);
    persistLegacyActivePreset();
    return preset;
  }

  const initialActivePreset = getActivePresetName();
  if (loadPresetState(initialActivePreset)) {
    config.activePresetName = initialActivePreset;
  } else {
    setActivePresetName(initialActivePreset);
  }

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function persistRoute() {
    persistActivePreset();
  }

  function normalizePosition(value) {
    if (!value) {
      return null;
    }

    const x = Number(value.x);
    const y = Number(value.y);
    const z = Number(value.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }

    return {
      x: Math.trunc(x),
      y: Math.trunc(y),
      z: Math.trunc(z),
    };
  }

  function normalizeWaypointAction(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return defaultWaypointAction;
    return validWaypointActions.has(normalized) ? normalized : defaultWaypointAction;
  }

  function normalizeWaypoint(waypoint) {
    const position = normalizePosition(waypoint);
    if (!position) return null;
    const action = normalizeWaypointAction(waypoint?.action);
    const labelText = String(waypoint?.label || "").trim();
    const result = { ...position, action };
    if (labelText) result.label = labelText;
    return result;
  }

  function normalizeRoute(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map(normalizeWaypoint).filter(Boolean);
  }

  function normalizeTransition(transition) {
    if (!transition) {
      return null;
    }

    const from = normalizePosition(transition.from || transition);
    const to = normalizePosition(transition.to || {
      x: transition.targetX,
      y: transition.targetY,
      z: transition.targetZ,
    });

    if (!from || !to || from.z === to.z) {
      return null;
    }

    const count = Math.max(1, Math.trunc(Number(transition.count) || 1));
    const lastSeenAt = Math.max(0, Math.trunc(Number(transition.lastSeenAt) || Date.now()));

    return { from, to, count, lastSeenAt };
  }

  function normalizeTransitions(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    const deduped = new Map();
    value.map(normalizeTransition).filter(Boolean).forEach((transition) => {
      deduped.set(getPositionKey(transition.from), transition);
    });
    return Array.from(deduped.values());
  }

  function getRoute() {
    return route.map((waypoint) => cloneValue(waypoint));
  }

  function getTransitions() {
    return transitions.map((transition) => cloneValue(transition));
  }

  function persistTransitions() {
    persistActivePreset();
  }

  function savePreset(name, options = {}) {
    const preset = upsertPreset(name, route, transitions);
    if (!preset) {
      bot.log("cave preset name is required");
      return null;
    }

    if (options.activate !== false) {
      setActivePresetName(preset.name);
      persistLegacyActivePreset();
    }

    bot.log("cave preset saved", {
      name: preset.name,
      waypoints: preset.route.length,
      transitions: preset.transitions.length,
    });
    return {
      name: preset.name,
      route: preset.route.map((waypoint) => cloneValue(waypoint)),
      transitions: preset.transitions.map((transition) => cloneValue(transition)),
    };
  }

  function createPreset(name) {
    const normalizedName = normalizePresetName(name);
    if (!normalizedName) {
      bot.log("cave preset name is required");
      return null;
    }

    if (getPresetByName(normalizedName)) {
      bot.log("cave preset already exists", { name: normalizedName });
      return null;
    }

    if (state.running) {
      stop();
    }

    const preset = upsertPreset(normalizedName, [], []);
    if (!preset) {
      return null;
    }

    loadPresetState(preset.name);
    bot.log("cave preset created", { name: preset.name });
    return {
      name: preset.name,
      route: [],
      transitions: [],
    };
  }

  function loadPreset(name) {
    const preset = getPresetByName(name);
    if (!preset) {
      bot.log("cave preset not found", { name });
      return null;
    }

    if (state.running) {
      stop();
    }

    loadPresetState(preset.name);
    bot.log("cave preset loaded", {
      name: preset.name,
      waypoints: route.length,
      transitions: transitions.length,
    });
    return {
      name: preset.name,
      route: getRoute(),
      transitions: getTransitions(),
    };
  }

  function deletePreset(name) {
    const preset = getPresetByName(name);
    if (!preset) {
      bot.log("cave preset not found", { name });
      return false;
    }

    presets = presets.filter((entry) => entry.name.toLowerCase() !== preset.name.toLowerCase());
    persistPresets();

    if (preset.name.toLowerCase() === getActivePresetName().toLowerCase()) {
      const fallbackPreset = presets[0] || null;
      if (state.running) {
        stop();
      }

      if (fallbackPreset) {
        loadPresetState(fallbackPreset.name);
      } else {
        route = [];
        transitions = [];
        state.currentIndex = 0;
        state.direction = 1;
        state.pendingTransitionSource = null;
        setActivePresetName(defaultPresetName);
        persistLegacyActivePreset();
      }
    }

    bot.log("cave preset deleted", { name: preset.name });
    return true;
  }

  function getCurrentWaypoint() {
    if (!route.length) {
      return null;
    }

    if (state.currentIndex < 0 || state.currentIndex >= route.length) {
      state.currentIndex = 0;
    }

    return route[state.currentIndex] || null;
  }

  function getPositionKey(position) {
    return position ? `${position.x},${position.y},${position.z}` : null;
  }

  function getDistance(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) {
      return Number.POSITIVE_INFINITY;
    }

    return Math.abs(Number(from.x) - Number(to.x)) + Math.abs(Number(from.y) - Number(to.y));
  }

  function isBesideOrSameTile(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) {
      return false;
    }

    return Math.abs(Number(from.x) - Number(to.x)) <= 1 &&
      Math.abs(Number(from.y) - Number(to.y)) <= 1;
  }

  function isAdjacentTile(from, to) {
    if (!from || !to || Number(from.z) !== Number(to.z)) {
      return false;
    }

    const dx = Math.abs(Number(from.x) - Number(to.x));
    const dy = Math.abs(Number(from.y) - Number(to.y));
    return (dx !== 0 || dy !== 0) && dx <= 1 && dy <= 1;
  }

  function getDistanceToWaypoint(position, waypoint) {
    if (!position || !waypoint) {
      return null;
    }

    return getDistance(position, waypoint);
  }

  function isSameTile(a, b) {
    if (!a || !b) {
      return false;
    }

    return Number(a.x) === Number(b.x) &&
      Number(a.y) === Number(b.y) &&
      Number(a.z) === Number(b.z);
  }

  function findClosestWaypointIndex(position) {
    if (!position || !route.length) {
      return 0;
    }

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    route.forEach((waypoint, index) => {
      const distance = getDistanceToWaypoint(position, waypoint);
      if (!Number.isFinite(distance)) {
        return;
      }

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    return bestIndex;
  }

  function getTileAt(position) {
    if (!position) {
      return null;
    }

    return window.gameClient?.world?.getTileFromWorldPosition?.(
      new Position(position.x, position.y, position.z)
    ) || null;
  }

  function getTilePosition(tile) {
    return normalizePosition(tile?.__position);
  }

  function getThingDefinition(itemId) {
    if (!itemId) {
      return null;
    }

    return (
      window.gameClient?.itemDefinitionsByCid?.[itemId] ||
      window.gameClient?.itemDefinitionsBySid?.[itemId] ||
      window.gameClient?.itemDefinitions?.[itemId] ||
      null
    );
  }

  function getThingName(thing) {
    const definition = getThingDefinition(thing?.id);
    return String(definition?.properties?.name || thing?.name || "").trim().toLowerCase();
  }

  function isLadderThing(thing) {
    if (!thing?.id) {
      return false;
    }

    if (ladderItemIds.has(Number(thing.id))) {
      return true;
    }

    return getThingName(thing).includes("ladder");
  }

  function isFloorChangeThing(thing) {
    const definition = getThingDefinition(thing?.id);
    return !!definition?.properties?.floorchange || isLadderThing(thing);
  }

  function isFloorChangeTile(tile) {
    const tilePosition = getTilePosition(tile);
    if (!tilePosition) {
      return false;
    }

    if (isFloorChangeThing(tile)) {
      return true;
    }

    return Array.isArray(tile.items) && tile.items.some((item) => isFloorChangeThing(item));
  }

  function getTileThings(tile) {
    if (!tile) {
      return [];
    }

    const things = [];
    if (tile.id) {
      things.push(tile);
    }
    if (Array.isArray(tile.items)) {
      tile.items.forEach((item) => {
        if (item) {
          things.push(item);
        }
      });
    }
    return things;
  }

  function tileHasNamedThing(tile, needle) {
    const value = String(needle || "").trim().toLowerCase();
    if (!value) {
      return false;
    }

    return getTileThings(tile).some((thing) => getThingName(thing).includes(value));
  }

  function isLadderTile(tile) {
    return getTileThings(tile).some((thing) => isLadderThing(thing));
  }

  function isStairsTile(tile) {
    return tileHasNamedThing(tile, "stairs");
  }

  function isHoleTile(tile) {
    return tileHasNamedThing(tile, "hole");
  }

  function isRopeSpotTile(tile) {
    return tileHasNamedThing(tile, "rope spot");
  }

  function isRopeTargetTile(tile) {
    return isHoleTile(tile) || isRopeSpotTile(tile);
  }

  function isShovelTargetThing(thing) {
    const name = getThingName(thing);
    if (!name) {
      return false;
    }

    return shovelTargetNamePatterns.some((pattern) => pattern.test(name));
  }

  function isShovelTargetTile(tile) {
    return getTileThings(tile).some((thing) => isShovelTargetThing(thing));
  }

  function isTransitionCandidateTile(tile, waypoint, position) {
    if (!tile) {
      return false;
    }

    if (isFloorChangeTile(tile)) {
      return true;
    }

    const hasWaypointDelta =
      waypoint &&
      position &&
      Number.isFinite(waypoint.z) &&
      Number.isFinite(position.z);

    if (!hasWaypointDelta) {
      return false;
    }

    if (waypoint.z > position.z) {
      return isShovelTargetTile(tile);
    }

    if (waypoint.z < position.z) {
      return isRopeTargetTile(tile);
    }

    return false;
  }

  function getFloorChangeTileBias(tile, position, waypoint) {
    if (!tile || !position || !waypoint || position.z === waypoint.z) {
      return 0;
    }

    const goingDown = waypoint.z > position.z;
    const goingUp = waypoint.z < position.z;

    if (goingDown) {
      if (isLadderTile(tile)) return -30;
      if (isHoleTile(tile)) return -20;
      if (isStairsTile(tile)) return 25;
    }

    if (goingUp) {
      if (isStairsTile(tile)) return -20;
      if (isHoleTile(tile)) return 20;
    }

    return 0;
  }

  function getLoadedTiles() {
    const chunks = window.gameClient?.world?.chunks || [];
    const tiles = [];

    for (const chunk of chunks) {
      if (!chunk?.tiles) continue;

      for (const tile of chunk.tiles) {
        if (tile?.__position) {
          tiles.push(tile);
        }
      }
    }

    return tiles;
  }

  function ensureMinimapOverlayStyle() {
    if (document.getElementById(minimapOverlayStyleId)) {
      return;
    }

    const style = document.createElement("style");
    style.id = minimapOverlayStyleId;
    style.textContent = `
      #${minimapOverlayRootId} {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 999997;
      }

      #${minimapOverlayRootId} canvas {
        position: fixed;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureMinimapOverlayRoot() {
    let root = document.getElementById(minimapOverlayRootId);
    if (root) {
      return root;
    }

    root = document.createElement("div");
    root.id = minimapOverlayRootId;
    root.innerHTML = '<canvas></canvas>';
    document.body.appendChild(root);
    return root;
  }

  function destroyMinimapOverlayElements() {
    document.getElementById(minimapOverlayRootId)?.remove();
    document.getElementById(minimapOverlayStyleId)?.remove();
  }

  function getMinimapCanvas() {
    return window.gameClient?.renderer?.minimap?.minimap?.canvas || document.getElementById("minimap") || null;
  }

  function getMinimapViewport() {
    const canvas = getMinimapCanvas();
    if (!(canvas instanceof HTMLCanvasElement)) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return { canvas, rect };
  }

  function getWaypointCanvasPoint(waypoint, viewport, playerPosition, minimap) {
    if (!waypoint || !viewport || !playerPosition || !minimap) {
      return null;
    }

    if (waypoint.z !== minimap.__renderLayer) {
      return null;
    }

    const zoomScale = 1 << (Number(minimap.__zoomLevel) || 0);
    const center = minimap.center || { x: 0, y: 0 };
    const internalWidth = Number(viewport.canvas.width) || 160;
    const internalHeight = Number(viewport.canvas.height) || 160;
    const internalX = (internalWidth / 2) + (waypoint.x - playerPosition.x - Number(center.x || 0)) * zoomScale;
    const internalY = (internalHeight / 2) + (waypoint.y - playerPosition.y - Number(center.y || 0)) * zoomScale;

    return {
      x: internalX * (viewport.rect.width / internalWidth),
      y: internalY * (viewport.rect.height / internalHeight),
    };
  }

  function renderMinimapOverlay() {
    const viewport = getMinimapViewport();
    const minimap = window.gameClient?.renderer?.minimap;
    const playerPosition = normalizePosition(bot.getPlayerPosition());
    const root = ensureMinimapOverlayRoot();
    const canvas = root.querySelector("canvas");

    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }

    if (!viewport || !minimap || !playerPosition || !route.length) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }

    const rect = viewport.rect;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    canvas.style.left = `${Math.round(rect.left)}px`;
    canvas.style.top = `${Math.round(rect.top)}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const visibleWaypoints = route
      .map((waypoint, index) => ({
        waypoint,
        index,
        point: getWaypointCanvasPoint(waypoint, viewport, playerPosition, minimap),
      }))
      .filter((entry) => entry.point);

    if (!visibleWaypoints.length) {
      return;
    }

    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";

    for (let index = 1; index < visibleWaypoints.length; index += 1) {
      const previous = visibleWaypoints[index - 1];
      const current = visibleWaypoints[index];
      if (current.index !== previous.index + 1) {
        continue;
      }

      context.strokeStyle = "rgba(92, 228, 196, 0.7)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(previous.point.x, previous.point.y);
      context.lineTo(current.point.x, current.point.y);
      context.stroke();
    }

    visibleWaypoints.forEach(({ waypoint, point, index }) => {
      const isCurrent = state.running && index === state.currentIndex;
      const action = waypoint?.action || defaultWaypointAction;
      const style = WAYPOINT_ICON_STYLES[action] || WAYPOINT_ICON_STYLES[defaultWaypointAction];
      const radius = isCurrent ? 8 : 6;

      context.fillStyle = isCurrent ? "#ffcf5a" : style.fill;
      context.strokeStyle = isCurrent ? "#6a2400" : style.stroke;
      context.lineWidth = 2;

      if (style.shape === "square") {
        const size = radius * 2;
        context.beginPath();
        context.rect(point.x - radius, point.y - radius, size, size);
        context.fill();
        context.stroke();
      } else if (style.shape === "diamond") {
        context.beginPath();
        context.moveTo(point.x, point.y - radius);
        context.lineTo(point.x + radius, point.y);
        context.lineTo(point.x, point.y + radius);
        context.lineTo(point.x - radius, point.y);
        context.closePath();
        context.fill();
        context.stroke();
      } else {
        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      }

      const label = style.letter || String(index + 1);
      const fontSize = label.length > 1 ? 9 : 11;
      context.fillStyle = style.textColor || "#ffffff";
      context.font = `bold ${fontSize}px Verdana, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(label, point.x, point.y);
    });

    context.restore();
  }

  function startMinimapOverlay() {
    if (minimapOverlayState.timerId != null) {
      return;
    }

    ensureMinimapOverlayStyle();
    renderMinimapOverlay();
    minimapOverlayState.timerId = window.setInterval(renderMinimapOverlay, 250);
  }

  function stopMinimapOverlay() {
    if (minimapOverlayState.timerId != null) {
      window.clearInterval(minimapOverlayState.timerId);
      minimapOverlayState.timerId = null;
    }

    destroyMinimapOverlayElements();
  }

  function getNearbyTransitionTiles(position, waypoint, radius = 8) {
    if (!position) {
      return [];
    }

    return getLoadedTiles()
      .map((tile) => ({ tile, position: getTilePosition(tile) }))
      .filter((entry) =>
        entry.position &&
        entry.position.z === position.z &&
        Math.abs(entry.position.x - position.x) <= radius &&
        Math.abs(entry.position.y - position.y) <= radius &&
        isTransitionCandidateTile(entry.tile, waypoint, position)
      );
  }

  function findTransitionTileNearPosition(position, waypoint, radius = 1) {
    if (!position) {
      return null;
    }

    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    getNearbyTransitionTiles(position, waypoint, radius).forEach((entry) => {
      const distance = getDistance(position, entry.position);
      if (!Number.isFinite(distance)) {
        return;
      }

      if (distance < bestDistance) {
        bestDistance = distance;
        best = entry;
      }
    });

    return best;
  }

  function findBestKnownTransition(position, waypoint) {
    if (!position || !waypoint) {
      return null;
    }

    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    transitions.forEach((transition) => {
      if (transition.from.z !== position.z || transition.to.z !== waypoint.z) {
        return;
      }

      const playerDistance = getDistance(position, transition.from);
      const landingDistance = getDistance(transition.to, waypoint);
      if (!Number.isFinite(playerDistance) || !Number.isFinite(landingDistance)) {
        return;
      }

      const score = playerDistance * 10 + landingDistance;
      if (score < bestScore) {
        bestScore = score;
        best = transition;
      }
    });

    return best;
  }

  function findNearbyTransitionTile(position, waypoint) {
    if (!position || !waypoint) {
      return null;
    }

    const waypointDistance = Math.abs(position.x - waypoint.x) + Math.abs(position.y - waypoint.y);
    const radius = Math.max(4, Math.min(20, waypointDistance + 2));
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    getNearbyTransitionTiles(position, waypoint, radius).forEach((entry) => {
      const playerDistance = getDistance(position, entry.position);
      const tileToWaypointDistance =
        Math.abs(entry.position.x - waypoint.x) + Math.abs(entry.position.y - waypoint.y);
      const score =
        playerDistance * 10 +
        tileToWaypointDistance +
        getFloorChangeTileBias(entry.tile, position, waypoint);

      if (score < bestScore) {
        bestScore = score;
        best = {
          tile: entry.tile,
          position: entry.position,
          playerDistance,
          waypointDistance: tileToWaypointDistance,
        };
      }
    });

    return best;
  }

  function getWaypointTolerance(waypoint) {
    const action = waypoint?.action || defaultWaypointAction;
    const baseTolerance = Math.max(0, Number(config.waypointTolerance) || 0);
    if (action === "node") {
      return Math.max(baseTolerance, 2);
    }
    if (action === "walk") {
      return Math.max(baseTolerance, 1);
    }
    return baseTolerance;
  }

  function isAtWaypoint(position, waypoint) {
    const distance = getDistanceToWaypoint(position, waypoint);
    if (!Number.isFinite(distance)) {
      return false;
    }

    return distance <= getWaypointTolerance(waypoint);
  }

  function goToWaypoint(waypoint) {
    const from = bot.getPlayerPosition();
    if (!from || !waypoint) {
      return false;
    }

    const to = new Position(waypoint.x, waypoint.y, waypoint.z);

    try {
      window.gameClient?.world?.pathfinder?.findPath?.(from, to);
      state.lastPathAt = Date.now();
      bot.log("cave pathing to waypoint", {
        ...waypoint,
        index: state.currentIndex + 1,
        total: route.length,
      });
      return true;
    } catch (error) {
      bot.log("cave pathing failed", { ...waypoint, error: error?.message || error });
      return false;
    }
  }

  function goToPosition(position) {
    if (!position) {
      return false;
    }

    return goToWaypoint(position);
  }

  function markPendingTransitionSource(source) {
    const normalized = normalizePosition(source);
    if (!normalized) {
      return;
    }

    state.pendingTransitionSource = {
      ...normalized,
      at: Date.now(),
    };
  }

  function upsertTransition(from, to) {
    const normalizedFrom = normalizePosition(from);
    const normalizedTo = normalizePosition(to);
    if (!normalizedFrom || !normalizedTo || normalizedFrom.z === normalizedTo.z) {
      return null;
    }

    const key = getPositionKey(normalizedFrom);
    const index = transitions.findIndex((transition) => getPositionKey(transition.from) === key);
    const next = {
      from: normalizedFrom,
      to: normalizedTo,
      count: index >= 0 ? transitions[index].count + 1 : 1,
      lastSeenAt: Date.now(),
    };

    if (index >= 0) {
      transitions[index] = next;
    } else {
      transitions.push(next);
    }

    persistTransitions();
    bot.log("cave learned floor transition", next);
    return cloneValue(next);
  }

  function resolveObservedTransitionSource(previousPosition) {
    const pending = normalizePosition(state.pendingTransitionSource);
    if (pending && pending.z === previousPosition.z) {
      return pending;
    }

    const currentTile = getTileAt(previousPosition);
    if (currentTile && isFloorChangeTile(currentTile)) {
      return previousPosition;
    }

    const nearby = findTransitionTileNearPosition(previousPosition, null, 1);
    if (nearby?.position) {
      return nearby.position;
    }

    return null;
  }

  function observePosition() {
    const current = normalizePosition(bot.getPlayerPosition());
    if (!current) {
      return;
    }

    const previous = state.lastObservedPosition;
    if (previous && !isSameTile(previous, current) && previous.z !== current.z) {
      const source = resolveObservedTransitionSource(previous);
      if (source) {
        upsertTransition(source, current);
      }
      state.pendingTransitionSource = null;
    }

    state.lastObservedPosition = current;
  }

  function getEquipment() {
    return window.gameClient?.player?.equipment || null;
  }

  function getOpenContainers() {
    return Array.from(window.gameClient?.player?.__openedContainers || []);
  }

  function findAdjacentWalkablePosition(targetPosition, playerPosition) {
    if (!targetPosition || !playerPosition) {
      return null;
    }

    const offsets = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    ];

    offsets.sort((a, b) => {
      const da = Math.abs(targetPosition.x + a.x - playerPosition.x) +
        Math.abs(targetPosition.y + a.y - playerPosition.y);
      const db = Math.abs(targetPosition.x + b.x - playerPosition.x) +
        Math.abs(targetPosition.y + b.y - playerPosition.y);
      return da - db;
    });

    for (const offset of offsets) {
      const position = new Position(
        targetPosition.x + offset.x,
        targetPosition.y + offset.y,
        targetPosition.z
      );
      const tile = window.gameClient?.world?.getTileFromWorldPosition?.(position);
      if (tile?.isWalkable?.()) {
        return normalizePosition(position);
      }
    }

    return null;
  }

  function isRopeItem(item) {
    const name = getThingName(item);
    return !!name && ropeNamePattern.test(name);
  }

  function isShovelItem(item) {
    const name = getThingName(item);
    return !!name && shovelNamePattern.test(name);
  }

  function findToolSource(predicate) {
    const equipment = getEquipment();

    if (equipment?.slots) {
      for (let slotIndex = 0; slotIndex < equipment.slots.length; slotIndex += 1) {
        const item = equipment.getSlotItem?.(slotIndex);
        if (predicate(item)) {
          return { which: equipment, index: slotIndex, item, location: "equipment" };
        }
      }
    }

    for (const container of getOpenContainers()) {
      const slots = container?.slots || [];
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const item = container.getSlotItem?.(slotIndex);
        if (predicate(item)) {
          return { which: container, index: slotIndex, item, location: "container" };
        }
      }
    }

    return null;
  }

  function findRopeSource() {
    return findToolSource(isRopeItem);
  }

  function findShovelSource() {
    return findToolSource(isShovelItem);
  }

  function useToolOnTile(tool, targetTile, targetPosition, actionLabel, now = Date.now()) {
    if (!tool || !targetTile || !targetPosition) {
      return false;
    }

    const playerPosition = normalizePosition(bot.getPlayerPosition());
    if (!playerPosition) {
      return false;
    }

    if (!isAdjacentTile(playerPosition, targetPosition)) {
      const adjacentPosition = findAdjacentWalkablePosition(targetPosition, playerPosition);
      if (adjacentPosition) {
        return goToPosition(adjacentPosition);
      }
    }

    window.gameClient?.mouse?.__handleItemUseWith?.(
      { which: tool.which, index: tool.index },
      { which: targetTile, index: 0xFF }
    );
    state.lastStairsUseAt = now;
    state.lastPathAt = now;
    markPendingTransitionSource(targetPosition);
    bot.log(actionLabel, {
      source: targetPosition,
      toolLocation: tool.location,
      toolSlot: tool.index,
      toolName: getThingName(tool.item),
    });
    return true;
  }

  function useRopeOnTile(targetTile, targetPosition, now = Date.now()) {
    return useToolOnTile(
      findRopeSource(),
      targetTile,
      targetPosition,
      "cave roped transition tile",
      now
    );
  }

  function useShovelOnTile(targetTile, targetPosition, now = Date.now()) {
    return useToolOnTile(
      findShovelSource(),
      targetTile,
      targetPosition,
      "cave shoveled transition tile",
      now
    );
  }

  function useFloorChangeTile(target, waypoint, now = Date.now()) {
    const position = normalizePosition(bot.getPlayerPosition());
    const targetPosition = normalizePosition(target?.position);
    const targetTile = target?.tile || (targetPosition ? getTileAt(targetPosition) : null);
    if (!position || !targetPosition || !targetTile) {
      return false;
    }

    if (now - state.lastStairsUseAt < 1200) {
      return true;
    }

    if (waypoint?.z < position.z && isRopeTargetTile(targetTile)) {
      return useRopeOnTile(targetTile, targetPosition, now);
    }

    if (!isFloorChangeTile(targetTile)) {
      if (waypoint?.z > position.z && isShovelTargetTile(targetTile)) {
        return useShovelOnTile(targetTile, targetPosition, now);
      }
      return false;
    }

    if (isLadderTile(targetTile)) {
      window.gameClient?.mouse?.use?.({ which: targetTile, index: 0xFF });
      state.lastStairsUseAt = now;
      state.lastPathAt = now;
      markPendingTransitionSource(targetPosition);
      bot.log("cave used ladder tile", {
        source: targetPosition,
        targetZ: waypoint?.z ?? null,
      });
      return true;
    }

    if (!isSameTile(position, targetPosition)) {
      return goToPosition(targetPosition);
    }

    const currentTile = getTileAt(position);
    if (!currentTile || !isFloorChangeTile(currentTile)) {
      return false;
    }

    window.gameClient?.mouse?.use?.({ which: currentTile, index: 0xFF });
    state.lastStairsUseAt = now;
    state.lastPathAt = now;
    markPendingTransitionSource(position);
    bot.log("cave used floor-change tile", {
      source: position,
      targetZ: waypoint?.z ?? null,
    });
    return true;
  }

  function useTileDirect(targetTile, targetPosition, actionLabel, now = Date.now()) {
    if (!targetTile || !targetPosition) return false;
    const playerPosition = normalizePosition(bot.getPlayerPosition());
    if (!playerPosition) return false;

    if (!isAdjacentTile(playerPosition, targetPosition) && !isSameTile(playerPosition, targetPosition)) {
      const adjacentPosition = findAdjacentWalkablePosition(targetPosition, playerPosition);
      if (adjacentPosition) {
        return goToPosition(adjacentPosition);
      }
      return false;
    }

    window.gameClient?.mouse?.use?.({ which: targetTile, index: 0xFF });
    state.lastStairsUseAt = now;
    state.lastPathAt = now;
    markPendingTransitionSource(targetPosition);
    bot.log(actionLabel, { source: targetPosition });
    return true;
  }

  function handleActionWaypoint(waypoint, position, now = Date.now()) {
    const action = waypoint?.action || defaultWaypointAction;

    if (action === "label") {
      advanceWaypoint();
      return true;
    }

    if (action !== "rope" && action !== "ladder" && action !== "shovel" && action !== "use") {
      return false;
    }

    if (now - state.lastStairsUseAt < 1200) {
      return true;
    }

    const targetPosition = { x: waypoint.x, y: waypoint.y, z: waypoint.z };
    const targetTile = getTileAt(targetPosition);
    if (!targetTile) {
      const adjacentPosition = findAdjacentWalkablePosition(targetPosition, position);
      if (adjacentPosition) {
        return goToPosition(adjacentPosition);
      }
      return false;
    }

    if (action === "rope") {
      const rope = findRopeSource();
      if (!rope) {
        bot.log("cave waypoint needs rope but none found", { waypoint });
        return false;
      }
      return useToolOnTile(rope, targetTile, targetPosition, "cave waypoint rope", now);
    }

    if (action === "shovel") {
      const shovel = findShovelSource();
      if (!shovel) {
        bot.log("cave waypoint needs shovel but none found", { waypoint });
        return false;
      }
      return useToolOnTile(shovel, targetTile, targetPosition, "cave waypoint shovel", now);
    }

    if (action === "ladder") {
      return useTileDirect(targetTile, targetPosition, "cave waypoint ladder", now);
    }

    if (action === "use") {
      const fired = useTileDirect(targetTile, targetPosition, "cave waypoint use", now);
      if (fired) {
        advanceWaypoint();
      }
      return fired;
    }

    return false;
  }

  function isReachableForMelee(monster, playerPosition) {
    const pos = monster?.getPosition?.() || monster?.__position;
    if (!pos || pos.z !== playerPosition.z) return false;

    const offsets = [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
    ];

    const pathfinder = window.gameClient?.world?.pathfinder;
    const startTile = getTileAt(playerPosition);
    if (!pathfinder || !startTile || typeof pathfinder.search !== "function") {
      const dx = Math.abs(pos.x - playerPosition.x);
      const dy = Math.abs(pos.y - playerPosition.y);
      return Math.max(dx, dy) <= 1;
    }

    for (const offset of offsets) {
      const tx = pos.x + offset.x;
      const ty = pos.y + offset.y;
      if (tx === playerPosition.x && ty === playerPosition.y) return true;
      const tile = getTileAt({ x: tx, y: ty, z: pos.z });
      if (!tile?.isWalkable?.()) continue;
      try {
        const path = pathfinder.search(startTile, tile);
        if (Array.isArray(path) && path.length > 0) return true;
      } catch (error) {}
    }
    return false;
  }

  function getReachableMonsterCount() {
    const playerPosition = normalizePosition(bot.getPlayerPosition());
    if (!playerPosition) return 0;

    const monsters = bot.xray?.getVisibleMonsters?.({ sameFloorOnly: true }) || [];
    if (!monsters.length) return 0;

    const pauseRange = Math.max(1, Number(config.monsterPauseRange) || 10);
    const playerId = window.gameClient?.player?.id;

    let count = 0;
    for (const monster of monsters) {
      if (!monster) continue;
      if (monster.masterId === playerId) continue;
      const pos = monster.getPosition?.() || monster.__position;
      if (!pos || pos.z !== playerPosition.z) continue;
      const dist = Math.max(Math.abs(pos.x - playerPosition.x), Math.abs(pos.y - playerPosition.y));
      if (dist > pauseRange) continue;
      count += 1;
      if (count >= 8) return count;
    }
    return count;
  }

  function handleFloorChange(waypoint, now = Date.now()) {
    const position = normalizePosition(bot.getPlayerPosition());
    if (!position || !waypoint || position.z === waypoint.z) {
      return false;
    }

    const visibleCandidate = findNearbyTransitionTile(position, waypoint);
    if (visibleCandidate) {
      const moved = useFloorChangeTile(visibleCandidate, waypoint, now);
      if (moved) {
        bot.log("cave probing visible floor-change tile", {
          tileX: visibleCandidate.position.x,
          tileY: visibleCandidate.position.y,
          tileZ: visibleCandidate.position.z,
          targetZ: waypoint.z,
        });
        return true;
      }
    }

    const knownTransition = findBestKnownTransition(position, waypoint);
    if (knownTransition) {
      const target = {
        tile: getTileAt(knownTransition.from),
        position: knownTransition.from,
      };
      const moved = useFloorChangeTile(target, waypoint, now);
      if (moved) {
        bot.log("cave using learned floor transition", {
          from: knownTransition.from,
          to: knownTransition.to,
          waypoint,
        });
        return true;
      }

      bot.log("cave learned transition unavailable, falling back to live scan", {
        from: knownTransition.from,
        to: knownTransition.to,
        waypoint,
      });
    }
    return false;
  }

  function advanceWaypoint() {
    if (!route.length) {
      return null;
    }

    if (route.length === 1) {
      return route[0];
    }

    let nextIndex = state.currentIndex + state.direction;

    if (nextIndex >= route.length) {
      state.direction = -1;
      nextIndex = route.length - 2;
    } else if (nextIndex < 0) {
      state.direction = 1;
      nextIndex = 1;
    }

    state.currentIndex = Math.max(0, Math.min(route.length - 1, nextIndex));

    const nextWaypoint = getCurrentWaypoint();
    bot.log("cave advanced waypoint", {
      index: state.currentIndex + 1,
      total: route.length,
      direction: state.direction,
      waypoint: nextWaypoint,
    });
    return nextWaypoint;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function tick() {
    if (!state.running) return;

    try {
      observePosition();

      if (state.userPaused) {
        state.lastProgressAt = Date.now();
        return;
      }

      if (!route.length) {
        stop();
        return;
      }

      const position = normalizePosition(bot.getPlayerPosition());
      const positionKey = getPositionKey(position);
      const now = Date.now();

      // Update movement tracker every tick — needed for the combat-stall
      // failsafe below.
      if (positionKey && positionKey !== state.lastPositionKey) {
        state.lastPositionKey = positionKey;
        state.lastProgressAt = now;
      }

      const playerHasTarget = !!window.gameClient?.player?.__target;
      const attackStatus = bot.attack?.status?.() || null;
      const reachableMonsters = getReachableMonsterCount();
      const combatVisible =
        playerHasTarget ||
        reachableMonsters > 0 ||
        (!!attackStatus?.combatActive && Number(attackStatus?.combatDurationMs || 0) < 60000);

      // While ANY monster is on the battle list, cave stays parked so
      // auto-attack can engage them. BUT: if the player hasn't moved for
      // combatStallMs (default 5s), it means auto-attack is in a
      // skip/re-target loop on something it can't reach — force-resume so
      // the bot doesn't get permanently stuck. Combat that's actually
      // happening keeps moving the player (push from damage, diagonal
      // step, etc.) and resets lastProgressAt, so legitimate fights
      // don't trip this.
      const combatStallMs = Math.max(2000, Math.min(15000, Number(config.combatStallMs) || 5000));
      const stalledForMs = state.lastProgressAt ? (now - state.lastProgressAt) : 0;
      const combatStalled = combatVisible && stalledForMs >= combatStallMs;

      if (combatVisible && !combatStalled) {
        if (!state.pausedForCombat) {
          state.pausedForCombat = true;
          state.lastProgressAt = now;
          bot.log("cave paused for combat", {
            playerHasTarget,
            reachableMonsters,
            combatDurationMs: Number(attackStatus?.combatDurationMs || 0),
          });
        }
        return;
      }

      if (combatStalled) {
        bot.log("cave failsafe — combat stuck " + Math.round(stalledForMs / 1000) + "s, resuming", {
          reachableMonsters,
          stalledForMs,
        });
        try { bot.attack?.clearSkipList?.(); } catch (error) {}
      }

      if (state.pausedForCombat) {
        state.pausedForCombat = false;
        state.lastProgressAt = now;
      }

      const idleSnapMs = Math.max(2000, Number(config.idleSnapMs) || 10000);
      if (
        position &&
        state.lastProgressAt &&
        now - state.lastProgressAt >= idleSnapMs
      ) {
        const closestIndex = findClosestWaypointIndex(position);
        if (closestIndex !== state.currentIndex) {
          bot.log("cave idle: snapping to nearest waypoint", {
            fromIndex: state.currentIndex + 1,
            toIndex: closestIndex + 1,
            idleForMs: now - state.lastProgressAt,
          });
          state.currentIndex = closestIndex;
          state.direction = closestIndex >= route.length - 1 ? -1 : 1;
          if (route.length <= 1) state.direction = 1;
          state.lastPathAt = 0;
        } else if (route.length > 1) {
          // Snap says "you're already on the closest waypoint" yet we
          // haven't moved in idleSnapMs — the pathfinder can't reach the
          // current waypoint (closed door, blocked tile, isolated alcove).
          // Force-advance past it so the route keeps going.
          bot.log("cave idle failsafe: force-advancing past unreachable waypoint", {
            fromIndex: state.currentIndex + 1,
            total: route.length,
            idleForMs: now - state.lastProgressAt,
          });
          advanceWaypoint();
          state.lastPathAt = 0;
        }
        state.lastProgressAt = now;
      }

      let waypoint = getCurrentWaypoint();
      if (!waypoint) {
        stop();
        return;
      }

      const action = waypoint.action || defaultWaypointAction;
      const isFloorAction = action === "rope" || action === "ladder" || action === "shovel";
      const isPointAction = action === "use" || action === "label";

      if (isFloorAction && position && position.z === waypoint.z) {
        waypoint = advanceWaypoint();
        if (!waypoint) return;
      } else if (isAtWaypoint(position, waypoint) && !isFloorAction && !isPointAction) {
        waypoint = advanceWaypoint();
        if (!waypoint) return;
      }

      const currentAction = waypoint.action || defaultWaypointAction;
      const isAnyAction =
        currentAction === "rope" ||
        currentAction === "ladder" ||
        currentAction === "shovel" ||
        currentAction === "use" ||
        currentAction === "label";

      if (isAnyAction) {
        const handled = handleActionWaypoint(waypoint, position, now);
        if (handled) {
          return;
        }
      }

      if (position && waypoint.z !== position.z) {
        handleFloorChange(waypoint, now);
        return;
      }

      const shouldRepath =
        now - state.lastPathAt >= config.repathMs ||
        !state.lastProgressAt ||
        now - state.lastProgressAt >= config.repathMs;

      if (shouldRepath) {
        goToWaypoint(waypoint);
      }
    } catch (error) {
      bot.log("cave tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function startObserver() {
    if (state.observerTimerId != null) {
      return;
    }

    state.observerTimerId = window.setInterval(() => {
      try {
        observePosition();
      } catch (error) {
        bot.log("cave observer failed", error?.message || error);
      }
    }, 200);
  }

  function stopObserver() {
    if (state.observerTimerId == null) {
      return;
    }

    window.clearInterval(state.observerTimerId);
    state.observerTimerId = null;
  }

  function handleServerCancel(message) {
    if (!state.running) return;
    const lower = String(message || "").toLowerCase();
    if (!(lower.includes("there is no way") || lower.includes("no way"))) return;

    const now = Date.now();
    const waypointKey = "wp-" + state.currentIndex;
    // Require the SAME waypoint to fail twice within 5s before reacting —
    // single "no way" can fire during normal walking when a tile briefly
    // changes state.
    if (state.lastNoWayWaypoint !== waypointKey || now - state.lastNoWayAt > 5000) {
      state.lastNoWayWaypoint = waypointKey;
      state.lastNoWayAt = now;
      return;
    }
    if (route.length > 1) {
      bot.log("cave: 'no way' confirmed on waypoint — advancing", {
        fromIndex: state.currentIndex + 1,
      });
      advanceWaypoint();
      state.lastPathAt = 0;
      state.lastProgressAt = now;
    }
    state.lastNoWayWaypoint = null;
    state.lastNoWayAt = 0;
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();

    if (!route.length) {
      bot.log("cave bot cannot start without waypoints");
      return false;
    }

    if (state.running) {
      bot.log("cave bot already running");
      return false;
    }

    const position = normalizePosition(bot.getPlayerPosition());
    state.running = true;
    state.currentIndex = findClosestWaypointIndex(position);
    state.direction = state.currentIndex >= route.length - 1 ? -1 : 1;
    if (route.length <= 1) {
      state.direction = 1;
    }
    state.lastPathAt = 0;
    state.lastPositionKey = getPositionKey(position);
    state.lastProgressAt = Date.now();
    state.pausedForCombat = false;
    if (!state.cancelMessageUnsubscribe && typeof bot.onCancelMessage === "function") {
      state.cancelMessageUnsubscribe = bot.onCancelMessage(handleServerCancel);
    }
    bot.log("cave bot started", {
      waypoints: route.length,
      currentIndex: state.currentIndex + 1,
      direction: state.direction,
      waypoint: getCurrentWaypoint(),
    });
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }
    state.pausedForCombat = false;
    if (state.cancelMessageUnsubscribe) {
      try { state.cancelMessageUnsubscribe(); } catch (error) {}
      state.cancelMessageUnsubscribe = null;
    }
    bot.log("cave bot stopped");
    return true;
  }

  function addWaypoint(waypoint) {
    const normalized = normalizeWaypoint(waypoint);
    if (!normalized) {
      return null;
    }

    route.push(normalized);
    persistRoute();
    bot.log("cave waypoint added", { ...normalized, total: route.length });
    return cloneValue(normalized);
  }

  function addWaypointCurrentSpot(action = defaultWaypointAction, label = null) {
    const position = normalizePosition(bot.getPlayerPosition());
    if (!position) {
      bot.log("could not read current position for cave waypoint");
      return null;
    }

    const waypoint = { ...position, action };
    if (label) waypoint.label = label;
    return addWaypoint(waypoint);
  }

  function addRopeWaypointCurrentSpot() {
    return addWaypointCurrentSpot("rope");
  }

  function addLadderWaypointCurrentSpot() {
    return addWaypointCurrentSpot("ladder");
  }

  function addShovelWaypointCurrentSpot() {
    return addWaypointCurrentSpot("shovel");
  }

  function addUseWaypointCurrentSpot() {
    return addWaypointCurrentSpot("use");
  }

  function addStandWaypointCurrentSpot() {
    return addWaypointCurrentSpot("stand");
  }

  function addLabelWaypoint(label) {
    const position = normalizePosition(bot.getPlayerPosition());
    if (!position) {
      bot.log("could not read current position for label waypoint");
      return null;
    }

    return addWaypoint({ ...position, action: "label", label });
  }

  function setWaypointAction(index, action, label = null) {
    if (!route.length || index < 0 || index >= route.length) {
      return null;
    }

    const current = route[index];
    const next = normalizeWaypoint({ ...current, action, label: label ?? current.label });
    if (!next) return null;

    route[index] = next;
    persistRoute();
    bot.log("cave waypoint action updated", { index, ...next });
    return cloneValue(next);
  }

  function clearWaypoints() {
    route = [];
    state.currentIndex = 0;
    state.direction = 1;
    persistRoute();
    bot.log("cave route cleared");

    if (state.running) {
      stop();
    }

    return [];
  }

  function clearTransitions() {
    transitions = [];
    state.pendingTransitionSource = null;
    persistTransitions();
    bot.log("cave learned transitions cleared");
    return [];
  }

  function removeLastWaypoint() {
    if (!route.length) {
      return null;
    }

    const removed = route.pop();
    if (state.currentIndex >= route.length) {
      state.currentIndex = Math.max(0, route.length - 1);
    }
    if (route.length <= 1) {
      state.direction = 1;
    }
    persistRoute();
    bot.log("cave waypoint removed", removed);

    if (!route.length && state.running) {
      stop();
    }

    return removed;
  }

  function setCurrentIndex(index) {
    if (!route.length) {
      state.currentIndex = 0;
      state.direction = 1;
      return 0;
    }

    const nextIndex = Math.max(0, Math.min(route.length - 1, Math.trunc(Number(index) || 0)));
    state.currentIndex = nextIndex;
    state.direction = nextIndex >= route.length - 1 ? -1 : 1;
    if (route.length <= 1) {
      state.direction = 1;
    }
    return state.currentIndex;
  }

  function pause() {
    if (state.userPaused) return false;
    state.userPaused = true;
    bot.log("cave bot user-paused");
    return true;
  }

  function resume() {
    if (!state.userPaused) return false;
    state.userPaused = false;
    state.lastProgressAt = Date.now();
    state.lastPathAt = 0;
    bot.log("cave bot user-resumed");
    return true;
  }

  function togglePause() {
    if (state.userPaused) {
      resume();
      return false;
    }
    pause();
    return true;
  }

  function isPaused() {
    return !!state.userPaused;
  }

  function status() {
    const position = normalizePosition(bot.getPlayerPosition());
    const waypoint = getCurrentWaypoint();

    return {
      running: state.running,
      userPaused: state.userPaused,
      config: { ...config },
      route: getRoute(),
      transitions: getTransitions(),
      presetNames: getPresetNames(),
      activePresetName: getActivePresetName(),
      currentIndex: state.currentIndex,
      direction: state.direction,
      currentWaypoint: cloneValue(waypoint),
      distanceToWaypoint: getDistanceToWaypoint(position, waypoint),
      lastPathAt: state.lastPathAt,
      lastProgressAt: state.lastProgressAt,
      pendingTransitionSource: cloneValue(state.pendingTransitionSource),
      pausedForCombat: state.pausedForCombat,
    };
  }

  function updateConfig(nextConfig = {}) {
    Object.assign(config, nextConfig);
    persistConfig();
    bot.log("cave config updated", { ...config });
    return { ...config };
  }

  startObserver();
  bot.addCleanup(stopObserver);
  startMinimapOverlay();
  bot.addCleanup(stopMinimapOverlay);

  if (config.enabled && route.length) {
    start();
  }

  bot.cave = {
    start,
    stop,
    pause,
    resume,
    togglePause,
    isPaused,
    status,
    updateConfig,
    config,
    getRoute,
    getTransitions,
    getPresetNames,
    getActivePresetName,
    getCurrentWaypoint,
    createPreset,
    savePreset,
    loadPreset,
    deletePreset,
    addWaypoint,
    addWaypointCurrentSpot,
    addRopeWaypointCurrentSpot,
    addLadderWaypointCurrentSpot,
    addShovelWaypointCurrentSpot,
    addUseWaypointCurrentSpot,
    addStandWaypointCurrentSpot,
    addLabelWaypoint,
    setWaypointAction,
    waypointActions: Array.from(validWaypointActions),
    clearWaypoints,
    clearTransitions,
    removeLastWaypoint,
    setCurrentIndex,
    goToWaypoint,
    goToPosition,
    handleFloorChange,
    findClosestWaypointIndex,
    findRopeSource,
    findShovelSource,
    inspectNearbyTiles: (radius = 1) => {
      const position = normalizePosition(bot.getPlayerPosition());
      if (!position) {
        return [];
      }

      return getLoadedTiles()
        .map((tile) => ({ tile, position: getTilePosition(tile) }))
        .filter((entry) =>
          entry.position &&
          entry.position.z === position.z &&
          Math.abs(entry.position.x - position.x) <= radius &&
          Math.abs(entry.position.y - position.y) <= radius
        )
        .map((entry) => ({
          position: entry.position,
          isFloorChange: isFloorChangeTile(entry.tile),
          isHole: isHoleTile(entry.tile),
          isRopeTarget: isRopeTargetTile(entry.tile),
          isShovelTarget: isShovelTargetTile(entry.tile),
          names: getTileThings(entry.tile).map((thing) => getThingName(thing)).filter(Boolean),
        }));
    },
    isAtWaypoint,
  };
};
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installEquipRingModule = function installEquipRingModule(bot) {
  const configStorageKey = "minibiaCopilot.equipRing.config";
  const RING_SLOT = 8;
  const state = {
    running: false,
    timerId: null,
    lastEquipAt: 0,
  };
  let resumeListenersAttached = false;

  const config = Object.assign(
    {
      tickMs: 500,
      equipCooldownMs: 600,
      enabled: false,
      ringName: "",
      autoSwap: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 500;

  function normalizeRingName(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function matchesDesiredRing(item) {
    const desired = normalizeRingName(config.ringName);
    if (!desired) return true;
    const itemName = normalizeRingName(getItemName(item));
    if (!itemName) return false;
    return itemName === desired || itemName.startsWith(desired + " ") || itemName.startsWith(desired + "(");
  }

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function getEquipment() {
    return window.gameClient?.player?.equipment || null;
  }

  function getOpenContainers() {
    return Array.from(window.gameClient?.player?.__openedContainers || []);
  }

  function getItemDefinition(item) {
    if (!item) return null;

    return (
      window.gameClient?.itemDefinitionsBySid?.[item.sid] ||
      window.gameClient?.itemDefinitions?.[item.id] ||
      null
    );
  }

  function getItemName(item) {
    const definition = getItemDefinition(item);
    return definition?.properties?.name || item?.name || "";
  }

  function isRingItem(item) {
    if (!item) {
      return false;
    }

    const definition = getItemDefinition(item);
    const slotType = String(
      definition?.properties?.slotType ||
      definition?.properties?.slot ||
      ""
    ).trim().toLowerCase();

    if (slotType === "ring") {
      return true;
    }

    return /\bring\b/i.test(getItemName(item));
  }

  function getEquippedRing() {
    const equipment = getEquipment();
    return equipment?.getSlotItem?.(RING_SLOT) || null;
  }

  function hasEquippedRing() {
    return !!getEquippedRing();
  }

  function findBestRingSource() {
    const equipment = getEquipment();
    if (!equipment) {
      return null;
    }

    let best = null;
    let bestCount = -1;

    const consider = (container, slotIndex, item) => {
      if (!isRingItem(item)) {
        return;
      }
      if (!matchesDesiredRing(item)) {
        return;
      }

      const count = (typeof item.getCount === "function" ? item.getCount() : item.count) || 1;
      if (count > bestCount) {
        bestCount = count;
        best = { container, slotIndex, item, count, name: getItemName(item) };
      }
    };

    for (let slotIndex = 0; slotIndex < equipment.slots.length; slotIndex += 1) {
      if (slotIndex === RING_SLOT) continue;
      consider(equipment, slotIndex, equipment.getSlotItem(slotIndex));
    }

    getOpenContainers().forEach((container) => {
      (container?.slots || []).forEach((slot, slotIndex) => {
        consider(container, slotIndex, container.getSlotItem(slotIndex));
      });
    });

    return best;
  }

  function findEmptyContainerSlot() {
    for (const container of getOpenContainers()) {
      const slots = container?.slots || [];
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const item = container.getSlotItem?.(slotIndex);
        if (!item) {
          return { container, slotIndex };
        }
      }
    }
    return null;
  }

  function getGateStatus(now = Date.now()) {
    const equipment = getEquipment();
    const equippedRing = getEquippedRing();
    const source = findBestRingSource();
    const cooldownRemainingMs = Math.max(0, config.equipCooldownMs - (now - state.lastEquipAt));
    const wrongRingEquipped = !!equippedRing && !matchesDesiredRing(equippedRing);
    const emptyBackpackSlot = wrongRingEquipped && config.autoSwap ? findEmptyContainerSlot() : null;
    const canSwap = wrongRingEquipped && config.autoSwap && !!emptyBackpackSlot;

    return {
      hasEquipment: !!equipment,
      hasRingEquipped: !!equippedRing,
      wrongRingEquipped,
      hasRingAvailable: !!source,
      cooldownReady: cooldownRemainingMs === 0,
      cooldownRemainingMs,
      source,
      canEquip:
        !!equipment &&
        !!source &&
        cooldownRemainingMs === 0 &&
        (!equippedRing || canSwap),
      canSwap,
    };
  }

  function canEquipRing(now = Date.now()) {
    return getGateStatus(now).canEquip;
  }

  function tryEquipRing(now = Date.now()) {
    if (!config.enabled) return false;
    const cooldownRemainingMs = Math.max(0, config.equipCooldownMs - (now - state.lastEquipAt));
    if (cooldownRemainingMs > 0) return false;

    const equipment = getEquipment();
    if (!equipment) return false;

    const equippedRing = getEquippedRing();

    if (equippedRing) {
      if (matchesDesiredRing(equippedRing)) return false;
      if (!config.autoSwap) return false;

      const emptyBackpackSlot = findEmptyContainerSlot();
      if (!emptyBackpackSlot) {
        bot.log("equip ring: cannot swap, no empty backpack slot");
        return false;
      }

      const ringCount = (typeof equippedRing.getCount === "function" ? equippedRing.getCount() : equippedRing.count) || 1;
      window.gameClient.send(new ItemMovePacket(
        { which: equipment, index: RING_SLOT },
        { which: emptyBackpackSlot.container, index: emptyBackpackSlot.slotIndex },
        ringCount
      ));
      state.lastEquipAt = now;
      bot.log("equip ring: unequipped wrong ring", {
        name: getItemName(equippedRing),
        toContainerId: emptyBackpackSlot.container?.__containerId ?? null,
        toSlot: emptyBackpackSlot.slotIndex,
      });
      return true;
    }

    const source = findBestRingSource();
    if (!source) return false;

    window.gameClient.send(new ItemMovePacket(
      { which: source.container, index: source.slotIndex },
      { which: equipment, index: RING_SLOT },
      source.count || 1
    ));
    state.lastEquipAt = now;
    bot.log("equipped ring", {
      name: source.name,
      fromContainerId: source.container?.__containerId ?? null,
      fromSlot: source.slotIndex,
    });
    return true;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function runImmediateTick() {
    if (!state.running) return;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    tick();
  }

  function handleResume() {
    if (document.hidden) {
      return;
    }

    runImmediateTick();
  }

  function attachResumeListeners() {
    if (resumeListenersAttached) {
      return;
    }

    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    resumeListenersAttached = true;
  }

  function detachResumeListeners() {
    if (!resumeListenersAttached) {
      return;
    }

    document.removeEventListener("visibilitychange", handleResume);
    window.removeEventListener("focus", handleResume);
    window.removeEventListener("pageshow", handleResume);
    resumeListenersAttached = false;
  }

  function tick() {
    if (!state.running) return;

    try {
      tryEquipRing();
    } catch (error) {
      bot.log("equip ring tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 500;
    persistConfig();

    if (state.running) {
      bot.log("equip ring already running");
      return false;
    }

    state.running = true;
    attachResumeListeners();
    bot.log("equip ring started", { ...config });
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    detachResumeListeners();

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("equip ring stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      gates: getGateStatus(),
      equippedRing: getEquippedRing(),
      lastEquipAt: state.lastEquipAt,
    };
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "ringName")) {
      nextConfig.ringName = String(nextConfig.ringName || "").trim();
    }
    Object.assign(config, nextConfig);
    config.tickMs = 500;
    persistConfig();
    bot.log("equip ring config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.equipRing = {
    start,
    stop,
    status,
    updateConfig,
    config,
    getEquippedRing,
    hasEquippedRing,
    findBestRingSource,
    getGateStatus,
    canEquipRing,
    tryEquipRing,
  };
};
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installEquipAmuletModule = function installEquipAmuletModule(bot) {
  const configStorageKey = "minibiaCopilot.equipAmulet.config";
  const NECKLACE_SLOT = 7;
  const state = {
    running: false,
    timerId: null,
    lastEquipAt: 0,
  };
  let resumeListenersAttached = false;

  const config = Object.assign(
    {
      tickMs: 500,
      equipCooldownMs: 600,
      enabled: false,
      amuletName: "stone skin amulet",
      autoSwap: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 500;

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeAmuletName(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function getEquipment() {
    return window.gameClient?.player?.equipment || null;
  }

  function getOpenContainers() {
    return Array.from(window.gameClient?.player?.__openedContainers || []);
  }

  function getItemDefinition(item) {
    if (!item) return null;
    return (
      window.gameClient?.itemDefinitionsBySid?.[item.sid] ||
      window.gameClient?.itemDefinitions?.[item.id] ||
      null
    );
  }

  function getItemName(item) {
    const definition = getItemDefinition(item);
    return definition?.properties?.name || item?.name || "";
  }

  function isAmuletItem(item) {
    if (!item) return false;
    const definition = getItemDefinition(item);
    const slotType = String(
      definition?.properties?.slotType ||
      definition?.properties?.slot ||
      ""
    ).trim().toLowerCase();
    if (slotType === "necklace" || slotType === "amulet") return true;
    return /\b(amulet|necklace)\b/i.test(getItemName(item));
  }

  function matchesDesiredAmulet(item) {
    const desired = normalizeAmuletName(config.amuletName);
    if (!desired) return true;
    const itemName = normalizeAmuletName(getItemName(item));
    if (!itemName) return false;
    return itemName === desired || itemName.startsWith(desired + " ") || itemName.startsWith(desired + "(");
  }

  function getEquippedAmulet() {
    const equipment = getEquipment();
    return equipment?.getSlotItem?.(NECKLACE_SLOT) || null;
  }

  function hasEquippedAmulet() {
    return !!getEquippedAmulet();
  }

  function findBestAmuletSource() {
    const equipment = getEquipment();
    if (!equipment) return null;

    let best = null;
    let bestCount = -1;

    const consider = (container, slotIndex, item) => {
      if (!isAmuletItem(item)) return;
      if (!matchesDesiredAmulet(item)) return;
      const count = (typeof item.getCount === "function" ? item.getCount() : item.count) || 1;
      if (count > bestCount) {
        bestCount = count;
        best = { container, slotIndex, item, count, name: getItemName(item) };
      }
    };

    for (let slotIndex = 0; slotIndex < equipment.slots.length; slotIndex += 1) {
      if (slotIndex === NECKLACE_SLOT) continue;
      consider(equipment, slotIndex, equipment.getSlotItem(slotIndex));
    }

    getOpenContainers().forEach((container) => {
      (container?.slots || []).forEach((slot, slotIndex) => {
        consider(container, slotIndex, container.getSlotItem(slotIndex));
      });
    });

    return best;
  }

  function findEmptyContainerSlot() {
    for (const container of getOpenContainers()) {
      const slots = container?.slots || [];
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const item = container.getSlotItem?.(slotIndex);
        if (!item) return { container, slotIndex };
      }
    }
    return null;
  }

  function getGateStatus(now = Date.now()) {
    const equipment = getEquipment();
    const equippedAmulet = getEquippedAmulet();
    const source = findBestAmuletSource();
    const cooldownRemainingMs = Math.max(0, config.equipCooldownMs - (now - state.lastEquipAt));
    const wrongAmuletEquipped = !!equippedAmulet && !matchesDesiredAmulet(equippedAmulet);
    const emptyBackpackSlot = wrongAmuletEquipped && config.autoSwap ? findEmptyContainerSlot() : null;
    const canSwap = wrongAmuletEquipped && config.autoSwap && !!emptyBackpackSlot;

    return {
      hasEquipment: !!equipment,
      hasAmuletEquipped: !!equippedAmulet,
      wrongAmuletEquipped,
      hasAmuletAvailable: !!source,
      cooldownReady: cooldownRemainingMs === 0,
      cooldownRemainingMs,
      source,
      canEquip:
        !!equipment &&
        !!source &&
        cooldownRemainingMs === 0 &&
        (!equippedAmulet || canSwap),
      canSwap,
    };
  }

  function canEquipAmulet(now = Date.now()) {
    return getGateStatus(now).canEquip;
  }

  function tryEquipAmulet(now = Date.now()) {
    if (!config.enabled) return false;
    const cooldownRemainingMs = Math.max(0, config.equipCooldownMs - (now - state.lastEquipAt));
    if (cooldownRemainingMs > 0) return false;

    const equipment = getEquipment();
    if (!equipment) return false;

    const equippedAmulet = getEquippedAmulet();

    if (equippedAmulet) {
      if (matchesDesiredAmulet(equippedAmulet)) return false;
      if (!config.autoSwap) return false;

      const emptyBackpackSlot = findEmptyContainerSlot();
      if (!emptyBackpackSlot) {
        bot.log("equip amulet: cannot swap, no empty backpack slot");
        return false;
      }

      const amuletCount = (typeof equippedAmulet.getCount === "function" ? equippedAmulet.getCount() : equippedAmulet.count) || 1;
      window.gameClient.send(new ItemMovePacket(
        { which: equipment, index: NECKLACE_SLOT },
        { which: emptyBackpackSlot.container, index: emptyBackpackSlot.slotIndex },
        amuletCount
      ));
      state.lastEquipAt = now;
      bot.log("equip amulet: unequipped wrong amulet", {
        name: getItemName(equippedAmulet),
        toContainerId: emptyBackpackSlot.container?.__containerId ?? null,
        toSlot: emptyBackpackSlot.slotIndex,
      });
      return true;
    }

    const source = findBestAmuletSource();
    if (!source) return false;

    window.gameClient.send(new ItemMovePacket(
      { which: source.container, index: source.slotIndex },
      { which: equipment, index: NECKLACE_SLOT },
      source.count || 1
    ));
    state.lastEquipAt = now;
    bot.log("equipped amulet", {
      name: source.name,
      fromContainerId: source.container?.__containerId ?? null,
      fromSlot: source.slotIndex,
    });
    return true;
  }

  function scheduleNextTick() {
    if (!state.running) return;
    state.timerId = window.setTimeout(() => tick(), config.tickMs);
  }

  function runImmediateTick() {
    if (!state.running) return;
    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }
    tick();
  }

  function handleResume() {
    if (document.hidden) return;
    runImmediateTick();
  }

  function attachResumeListeners() {
    if (resumeListenersAttached) return;
    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    resumeListenersAttached = true;
  }

  function detachResumeListeners() {
    if (!resumeListenersAttached) return;
    document.removeEventListener("visibilitychange", handleResume);
    window.removeEventListener("focus", handleResume);
    window.removeEventListener("pageshow", handleResume);
    resumeListenersAttached = false;
  }

  function tick() {
    if (!state.running) return;
    try {
      tryEquipAmulet();
    } catch (error) {
      bot.log("equip amulet tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 500;
    persistConfig();
    if (state.running) {
      bot.log("equip amulet already running");
      return false;
    }
    state.running = true;
    attachResumeListeners();
    bot.log("equip amulet started", { ...config });
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;
    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }
    detachResumeListeners();
    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("equip amulet stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      gates: getGateStatus(),
      equippedAmulet: getEquippedAmulet(),
      lastEquipAt: state.lastEquipAt,
    };
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "amuletName")) {
      nextConfig.amuletName = String(nextConfig.amuletName || "").trim();
    }
    Object.assign(config, nextConfig);
    config.tickMs = 500;
    persistConfig();
    bot.log("equip amulet config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.equipAmulet = {
    start,
    stop,
    status,
    updateConfig,
    config,
    getEquippedAmulet,
    hasEquippedAmulet,
    findBestAmuletSource,
    getGateStatus,
    canEquipAmulet,
    tryEquipAmulet,
  };
};
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installAutoEatModule = function installAutoEatModule(bot) {
  const configStorageKey = "minibiaCopilot.eat.config";
  const state = {
    running: false,
    timerId: null,
    lastFoodAt: 0,
  };

  const config = Object.assign(
    {
      tickMs: 1000,
      eatCooldownMs: 60000,
      eatHotbarSlot: 10,
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );
  config.tickMs = 1000;

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeHotbarSlot(slot) {
    const value = Number(slot);
    if (!Number.isFinite(value)) {
      return null;
    }

    const normalized = Math.trunc(value);
    if (normalized < 1 || normalized > 12) {
      return null;
    }

    return normalized;
  }

  function readFoodTimer() {
    const foodText =
      document.querySelector('#skill-window div[skill="food"] .skill')?.textContent?.trim() ||
      null;

    if (!foodText) return null;

    const match = foodText.match(/^(\d{1,2}):(\d{2})$/);
    return match
      ? {
          text: foodText,
          seconds: Number(match[1]) * 60 + Number(match[2]),
        }
      : { text: foodText, seconds: null };
  }

  function isSated() {
    const player = window.gameClient?.player;
    const conditions = player?.conditions;

    if (conditions?.has && conditions.SATED != null) {
      return conditions.has(conditions.SATED);
    }

    const food = readFoodTimer();
    if (food?.seconds != null) {
      return food.seconds > 0;
    }

    return true;
  }

  function tryEat() {
    if (!config.enabled) {
      return false;
    }

    if (isSated()) {
      return false;
    }

    if (Date.now() - state.lastFoodAt < config.eatCooldownMs) {
      return false;
    }

    const slot = normalizeHotbarSlot(config.eatHotbarSlot);
    if (!slot) {
      return false;
    }

    const slotIndex = slot - 1;
    const clicked = bot.clickHotbar(slotIndex);

    if (clicked) {
      state.lastFoodAt = Date.now();
      bot.log("used eat hotkey", { slot });
    }

    return clicked;
  }

  function scheduleNextTick() {
    if (!state.running) return;

    state.timerId = window.setTimeout(() => {
      tick();
    }, config.tickMs);
  }

  function tick() {
    if (!state.running) return;

    try {
      tryEat();
    } catch (error) {
      bot.log("auto eat tick failed", error?.message || error);
    } finally {
      scheduleNextTick();
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    config.tickMs = 1000;
    persistConfig();

    if (state.running) {
      bot.log("auto eat already running");
      return false;
    }

    state.running = true;
    bot.log("auto eat started", { eatCooldownMs: config.eatCooldownMs, eatHotbarSlot: config.eatHotbarSlot });
    tick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("auto eat stopped");
    return true;
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      lastFoodAt: state.lastFoodAt,
      isSated: isSated(),
    };
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "eatHotbarSlot")) {
      nextConfig.eatHotbarSlot = normalizeHotbarSlot(nextConfig.eatHotbarSlot) ?? config.eatHotbarSlot;
    }

    if (Object.prototype.hasOwnProperty.call(nextConfig, "eatCooldownMs")) {
      nextConfig.eatCooldownMs = Math.max(0, Number(nextConfig.eatCooldownMs) || 0);
    }

    Object.assign(config, nextConfig);
    config.tickMs = 1000;
    persistConfig();
    bot.log("auto eat config updated", { ...config });
    return { ...config };
  }

  if (config.enabled) {
    start();
  }

  bot.eat = {
    start,
    stop,
    status,
    updateConfig,
    isSated,
    tryEat,
    normalizeHotbarSlot,
    config,
  };

  bot.startAutoEat = start;
  bot.stopAutoEat = stop;

  if (bot.rune) {
    bot.rune.startAutoEat = start;
    bot.rune.stopAutoEat = stop;
    bot.rune.tryEat = tryEat;
    bot.rune.isSated = isSated;
  }
};
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installTalkModule = function installTalkModule(bot) {
  const configStorageKey = "minibiaCopilot.talk.config";
  const legacyDefaultModels = ["gemini-3-pro-preview", "gemini-2.0-flash"];
  const defaultModel = "gemini-2.5-flash-lite";
  const defaultSystemPrompt =
    "You are a normal Tibia MMORPG player chatting in Minibia in live in-game chat. Every reply must sound like Tibia player chat: casual, brief, informal, fully lowercase, and natural for a real player typing quickly. Use plain text only. Keep it under 90 characters and under 12 words. Prefer short Tibia-style phrasing, light slang, abbreviations, and simple punctuation when natural. Avoid polished grammar, title case, or assistant-like wording. Write like someone typing mid-hunt or while afk for a sec. Never say you are a bot or AI.";
  const defaultGreetingPrompt =
    "Respond to greetings like a Tibia MMORPG player in chat. Be short, casual, friendly, and in-character for fast Tibia-style game chat. Use lowercase. One sentence only. Plain text only.";
  const defaultQuestionPrompt =
    "Respond to questions like a Tibia MMORPG player in chat, but stay vague and noncommittal. Keep it brief, casual, and a little evasive. Use lowercase and do not explain much. One short sentence only. Plain text only. If asked whether you are a bot, reply with no.";
  const defaultStatementPrompt =
    "Respond to statements like a Tibia MMORPG player in chat. Keep it short, casual, reactive, and natural for live Tibia-style game chat. Use lowercase. One sentence only. Plain text only.";
  const minPollMs = 1000;
  const maxMessageAgeMs = 2 * 60 * 1000;
  const state = {
    running: false,
    pending: false,
    timerId: null,
    lastReplyAt: 0,
    seenKeys: [],
    seenSignatures: [],
  };
  const greetingReplies = ["yo", "sup", "hey", "hiya", "yo lol"];
  const agreeReplies = ["true", "fr", "based", "ya", "real"];
  const vagueQuestionReplies = ["maybe", "not sure", "hard to say", "could be"];
  const denyBotReplies = ["no", "nope", "nah"];

  const config = Object.assign(
    {
      enabled: false,
      apiKey: "",
      model: defaultModel,
      pollMs: minPollMs,
      replyCooldownMs: 1500,
      systemPrompt: defaultSystemPrompt,
      greetingPrompt: defaultGreetingPrompt,
      questionPrompt: defaultQuestionPrompt,
      statementPrompt: defaultStatementPrompt,
    },
    bot.storage.get(configStorageKey, {})
  );

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function sanitizeConfig() {
    config.apiKey = String(config.apiKey || "").trim();
    config.model = String(config.model || defaultModel).trim() || defaultModel;
    if (legacyDefaultModels.includes(config.model)) {
      config.model = defaultModel;
    }
    config.pollMs = Math.max(minPollMs, Number(config.pollMs) || minPollMs);
    config.replyCooldownMs = Math.max(0, Number(config.replyCooldownMs) || 1500);
    config.systemPrompt = String(config.systemPrompt || defaultSystemPrompt).trim() || defaultSystemPrompt;
    config.greetingPrompt = String(config.greetingPrompt || defaultGreetingPrompt).trim() || defaultGreetingPrompt;
    config.questionPrompt = String(config.questionPrompt || defaultQuestionPrompt).trim() || defaultQuestionPrompt;
    config.statementPrompt = String(config.statementPrompt || defaultStatementPrompt).trim() || defaultStatementPrompt;
  }

  function trimSeen() {
    const maxSeenEntries = 200;
    if (state.seenKeys.length > maxSeenEntries) {
      state.seenKeys = state.seenKeys.slice(-maxSeenEntries);
    }

    if (state.seenSignatures.length > maxSeenEntries) {
      state.seenSignatures = state.seenSignatures.slice(-maxSeenEntries);
    }
  }

  function getSelfNames() {
    return new Set(
      ["you", bot.getPlayerName?.(), window.gameClient?.player?.name, window.gameClient?.player?.state?.name]
        .map((name) => normalizeText(name))
        .filter(Boolean)
    );
  }

  function extractSenderFromMessage(message) {
    const text = String(message || "").trim();
    if (!text) {
      return { sender: null, body: "" };
    }

    const patterns = [
      /^\[[^\]]+\]\s*([^:\n]{2,40}):\s+(.+)$/i,
      /^([^:\n]{2,40}):\s+(.+)$/i,
      /^([^:\n]{2,40})\s+says:\s+(.+)$/i,
      /^From\s+([^:\n]{2,40}):\s+(.+)$/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          sender: String(match[1] || "").trim() || null,
          body: String(match[2] || "").trim(),
        };
      }
    }

    return { sender: null, body: text };
  }

  function getRawChatEntries() {
    return (window.gameClient?.interface?.channelManager?.channels || []).flatMap((channel) =>
      (channel?.__contents || []).map((entry, index) => ({
        channelName: channel?.name || null,
        entry,
        index,
      }))
    );
  }

  function toChatMessage(rawEntry) {
    const entry = rawEntry?.entry || {};
    const rawMessage = String(entry?.message || entry?.text || "").trim();
    const parsed = extractSenderFromMessage(rawMessage);
    const sender =
      String(entry?.author || entry?.sender || entry?.name || parsed.sender || "").trim() || null;
    const body = String(entry?.text || parsed.body || rawMessage).trim();
    const time = entry?.__time || entry?.time || null;
    const senderType = entry?.type;
    const key = [
      rawEntry?.channelName || "",
      time || "",
      sender || "",
      rawMessage || "",
      rawEntry?.index || 0,
    ].join("|");

    return {
      key,
      channelName: rawEntry?.channelName || null,
      sender,
      body,
      rawMessage,
      time,
      senderType,
    };
  }

  function getChatMessages() {
    return getRawChatEntries().map(toChatMessage).filter((message) => message.body);
  }

  function getMessageTimestamp(message) {
    const rawTime = message?.time;
    if (typeof rawTime === "number" && Number.isFinite(rawTime)) {
      return rawTime < 1e12 ? rawTime * 1000 : rawTime;
    }

    if (rawTime instanceof Date) {
      return rawTime.getTime();
    }

    const parsed = Date.parse(String(rawTime || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getMessageSignature(message) {
    return [
      normalizeText(message?.channelName),
      normalizeText(message?.sender),
      normalizeText(message?.body || message?.rawMessage),
      String(getMessageTimestamp(message) || ""),
    ].join("|");
  }

  function hasSeenMessage(message) {
    return state.seenKeys.includes(message?.key) || state.seenSignatures.includes(getMessageSignature(message));
  }

  function rememberSeenMessage(message) {
    if (!message) {
      return;
    }

    if (message.key && !state.seenKeys.includes(message.key)) {
      state.seenKeys.push(message.key);
    }

    const signature = getMessageSignature(message);
    if (signature && !state.seenSignatures.includes(signature)) {
      state.seenSignatures.push(signature);
    }

    trimSeen();
  }

  function rememberSeenMessages(messages) {
    messages.forEach((message) => rememberSeenMessage(message));
  }

  function isSelfMessage(message) {
    if (getSelfNames().has(normalizeText(message?.sender))) {
      return true;
    }

    return [message?.body, message?.rawMessage].some((text) => bot.isRecentSentChat?.(text, 20000));
  }

  function isTrustedSender(message) {
    const senderName = normalizeText(message?.sender);
    if (!senderName) {
      return false;
    }

    const trustedNames = bot.panic?.getTrustedNames?.() || [];
    return trustedNames.includes(senderName);
  }

  function isNpcMessage(message) {
    const npcType = window.CONST?.TYPES?.NPC;
    return npcType != null && message?.senderType === npcType;
  }

  function isWithinVisibleRange(me, pos) {
    if (!me || !pos) {
      return false;
    }

    const dx = Math.abs(pos.x - me.x);
    const dy = Math.abs(pos.y - me.y);
    return dx <= 8 && dy <= 6;
  }

  function isSenderVisiblePlayer(message) {
    const me = bot.getPlayerPosition?.();
    const myId = window.gameClient?.player?.id;
    const senderName = normalizeText(message?.sender);
    const playerType = window.CONST?.TYPES?.PLAYER;

    if (!me || !senderName || playerType == null) {
      return false;
    }

    return Object.values(window.gameClient?.world?.activeCreatures || {}).some((creature) => {
      if (!creature) {
        return false;
      }

      if (creature.id === myId || creature.type !== playerType) {
        return false;
      }

      if (normalizeText(creature.name) !== senderName) {
        return false;
      }

      return isWithinVisibleRange(me, creature.__position);
    });
  }

  function getDefaultMessages() {
    return getChatMessages().filter((message) => message.channelName === "Default");
  }

  function getNewestPendingMessage() {
    const pendingMessages = getDefaultMessages().filter((message) => {
      if (!message?.body || !message?.key) {
        return false;
      }

      if (hasSeenMessage(message)) {
        return false;
      }

      if (!message.sender || isSelfMessage(message) || isNpcMessage(message) || isTrustedSender(message)) {
        rememberSeenMessage(message);
        return false;
      }

      const timestamp = getMessageTimestamp(message);
      if (timestamp && Date.now() - timestamp > maxMessageAgeMs) {
        rememberSeenMessage(message);
        return false;
      }

      return true;
    });

    if (!pendingMessages.length) {
      return null;
    }

    return {
      targetMessage: pendingMessages[pendingMessages.length - 1],
      pendingMessages,
    };
  }

  function buildClassifierPrompt(targetMessage, contextMessages) {
    const transcript = contextMessages
      .map((message) => `${message.sender || "player"}: ${message.body}`)
      .join("\n");

    return [
      "Channel: Default",
      "Recent chat:",
      transcript || "(none)",
      "",
      `Last message from ${targetMessage.sender}: ${targetMessage.body}`,
      "Classify the last message as exactly one label:",
      "greeting",
      "question",
      "statement",
      "Reply with the label only.",
    ].join("\n");
  }

  function getTypePrompt(messageType) {
    if (messageType === "greeting") {
      return config.greetingPrompt;
    }

    if (messageType === "question") {
      return config.questionPrompt;
    }

    return config.statementPrompt;
  }

  function buildReplyPrompt(targetMessage, contextMessages, messageType) {
    const transcript = contextMessages
      .map((message) => `${message.sender || "player"}: ${message.body}`)
      .join("\n");

    return [
      config.systemPrompt,
      getTypePrompt(messageType),
      "",
      "Channel: Default",
      `Message type: ${messageType}`,
      "Recent chat:",
      transcript || "(none)",
      "",
      `Last message from ${targetMessage.sender}: ${targetMessage.body}`,
      "Reply with one short sentence only.",
      "Avoid repeating the same wording again and again.",
      "Reply text only:",
    ].join("\n");
  }

  async function generateText(prompt, generationConfig = {}) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: Object.assign(
            {
              temperature: 0.9,
              topP: 0.95,
              maxOutputTokens: 40,
            },
            generationConfig
          ),
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return (
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => String(part?.text || ""))
        .join(" ")
        .trim() || ""
    );
  }

  async function classifyMessageType(targetMessage, contextMessages) {
    const rawType = normalizeText(
      await generateText(buildClassifierPrompt(targetMessage, contextMessages), {
        temperature: 0.1,
        topP: 0.8,
        maxOutputTokens: 8,
      })
    );

    if (rawType === "greeting" || rawType === "question" || rawType === "statement") {
      return rawType;
    }

    if (isGreeting(targetMessage?.body)) {
      return "greeting";
    }

    if (/\?/.test(String(targetMessage?.body || ""))) {
      return "question";
    }

    return "statement";
  }

  function sanitizeReply(text) {
    const singleLine = String(text || "")
      .replace(/\s+/g, " ")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();

    if (!singleLine) {
      return "";
    }

    const firstSentence = singleLine.split(/(?<=[.!?])\s+/)[0] || singleLine;
    const trimmed = firstSentence.slice(0, 90).trim();
    if (!trimmed) {
      return "";
    }

    if (trimmed === "?") {
      return bot.isRecentSentChat?.("?", 20000) ? "" : "?";
    }

    const styled = trimmed
      .toLowerCase()
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\bi am\b/g, "im")
      .replace(/\byou are\b/g, "youre")
      .replace(/\bdo not\b/g, "dont")
      .replace(/\bcannot\b/g, "cant")
      .replace(/\bgoing to\b/g, "gonna")
      .replace(/\bwant to\b/g, "wanna")
      .replace(/\s+([,.!?])/g, "$1")
      .replace(/([!?.,]){2,}/g, "$1")
      .trim();

    const normalized = normalizeText(styled);
    if (!normalized || /^[^a-z0-9]+$/i.test(styled)) {
      return "";
    }

    if (/\b(bot|ai|assistant|language model|automation|script)\b/i.test(styled)) {
      return "";
    }

    if (bot.isRecentSentChat?.(styled, 20000)) {
      return "";
    }

    return styled;
  }

  function pickUnusedReply(replies, withinMs = 30000, fallback = "?") {
    for (const reply of replies) {
      if (!bot.isRecentSentChat?.(reply, withinMs)) {
        return reply;
      }
    }

    return fallback;
  }

  function isGreeting(text) {
    return /^(hi|hey|yo|sup|howdy|hello|hiya)\b/i.test(String(text || "").trim());
  }

  function isBotQuestion(text) {
    return /\b(are you|u)\b.*\bbot\b|\bbot\b.*\?|\bare you a bot\b/i.test(String(text || ""));
  }

  function isSimpleReaction(text) {
    return /^(based|true|real|lol|lmao|xd|nice|ok|kk|k)\b[!.?]*$/i.test(String(text || "").trim());
  }

  function pickFallbackReply(targetMessage, messageType) {
    const messageText = String(targetMessage?.body || "").trim();

    if (isBotQuestion(messageText)) {
      return pickUnusedReply(denyBotReplies, 30000, "no");
    }

    if (messageType === "greeting" || isGreeting(messageText)) {
      return pickUnusedReply(greetingReplies, 15000, "yo");
    }

    if (isSimpleReaction(messageText)) {
      return pickUnusedReply(agreeReplies, 15000, "true");
    }

    if (messageType === "question" || /\?$/.test(messageText)) {
      return pickUnusedReply(vagueQuestionReplies, 20000, "maybe");
    }

    return pickUnusedReply(["lol", "maybe", "ya", "true", "kinda"], 30000, "lol");
  }

  async function maybeRespond() {
    if (!state.running || state.pending || !config.enabled || !config.apiKey) {
      return false;
    }

    if (Date.now() - state.lastReplyAt < config.replyCooldownMs) {
      return false;
    }

    const pending = getNewestPendingMessage();
    if (!pending?.targetMessage) {
      return false;
    }

    state.pending = true;

    try {
      const contextMessages = getDefaultMessages().slice(-6);
      if (!isSenderVisiblePlayer(pending.targetMessage)) {
        rememberSeenMessages(pending.pendingMessages);
        bot.log("talk skipped reply", {
          sender: pending.targetMessage.sender,
          message: pending.targetMessage.body,
          reason: "sender-not-visible",
        });
        return false;
      }

      const messageType = await classifyMessageType(pending.targetMessage, contextMessages);
      const rawReply = isBotQuestion(pending.targetMessage.body)
        ? "no"
        : await generateText(buildReplyPrompt(pending.targetMessage, contextMessages, messageType));
      const reply = sanitizeReply(rawReply) || pickFallbackReply(pending.targetMessage, messageType);

      rememberSeenMessages(pending.pendingMessages);

      if (!reply) {
        bot.log("talk skipped reply", {
          sender: pending.targetMessage.sender,
          message: pending.targetMessage.body,
          messageType,
          rawReply,
        });
        return false;
      }

      const sent = bot.sendChat(reply);
      if (sent) {
        state.lastReplyAt = Date.now();
        bot.log("talk replied", {
          sender: pending.targetMessage.sender,
          message: pending.targetMessage.body,
          messageType,
          reply,
        });
      }

      return sent;
    } finally {
      state.pending = false;
    }
  }

  function scheduleNextTick() {
    if (!state.running) {
      return;
    }

    state.timerId = window.setTimeout(async () => {
      try {
        await maybeRespond();
      } catch (error) {
        bot.log("talk request failed", error?.message || error);
      }

      scheduleNextTick();
    }, config.pollMs);
  }

  function seedSeenMessages() {
    rememberSeenMessages(getDefaultMessages());
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    sanitizeConfig();
    persistConfig();

    if (!config.apiKey) {
      bot.log("talk module requires a Gemini API key");
      return false;
    }

    if (state.running) {
      return false;
    }

    state.running = true;
    seedSeenMessages();
    bot.log("talk module started", {
      model: config.model,
      channel: "Default",
    });
    scheduleNextTick();
    return true;
  }

  function stop(options = {}) {
    const shouldPersistEnabled = options.persistEnabled !== false;
    state.running = false;

    if (shouldPersistEnabled) {
      config.enabled = false;
      persistConfig();
    }

    if (state.timerId != null) {
      window.clearTimeout(state.timerId);
      state.timerId = null;
    }

    return true;
  }

  function status() {
    return {
      running: state.running,
      pending: state.pending,
      lastReplyAt: state.lastReplyAt,
      config: {
        ...config,
        apiKey: config.apiKey ? "***configured***" : "",
      },
    };
  }

  function updateConfig(nextConfig = {}) {
    Object.assign(config, nextConfig);
    sanitizeConfig();
    persistConfig();
    return status().config;
  }

  sanitizeConfig();

  if (config.enabled && config.apiKey) {
    start();
  }

  bot.talk = {
    start,
    stop,
    status,
    updateConfig,
    getChatMessages,
    config,
  };
};
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installMagicWallModule = function installMagicWallModule(bot) {
  const configStorageKey = "minibiaCopilot.magicWall.config";
  const overlayRootId = "minibia-copilot-magic-wall-overlay";
  const overlayStyleId = "minibia-copilot-magic-wall-overlay-style";

  const defaultPatternSpecs = [
    { name: "magic wall", durationMs: 20000, color: "#7ec8ff" },
    { name: "wild growth", durationMs: 30000, color: "#9be38c" },
  ];

  const state = {
    enabled: false,
    rafId: null,
    overlayTimerId: null,
    timers: new Map(),
    patches: null,
    alarmedFor: new Set(),
    installRetryTimerId: null,
    debugSeen: [],
  };

  const config = Object.assign(
    {
      enabled: false,
      patternSpecs: defaultPatternSpecs.map((spec) => ({ ...spec })),
      audioOnExpiry: false,
      audioLeadMs: 3000,
      flashLeadMs: 3000,
      showFloorChanges: false,
      debugLogItems: false,
    },
    bot.storage.get(configStorageKey, {})
  );

  if (!Array.isArray(config.patternSpecs) || !config.patternSpecs.length) {
    config.patternSpecs = defaultPatternSpecs.map((spec) => ({ ...spec }));
  }

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeItemName(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getItemName(item) {
    if (!item) return "";
    const gc = window.gameClient || {};
    const id = item.id;
    const candidates = [];
    if (id != null) {
      const fromCid = gc.itemDefinitionsByCid?.[id];
      const fromSid = gc.itemDefinitionsBySid?.[id];
      const fromGeneric = gc.itemDefinitions?.[id];
      candidates.push(
        fromCid?.properties?.name,
        fromCid?.name,
        fromSid?.properties?.name,
        fromSid?.name,
        fromGeneric?.properties?.name,
        fromGeneric?.name
      );
    }
    candidates.push(item.name, item.properties?.name);
    for (const candidate of candidates) {
      if (candidate) return normalizeItemName(candidate);
    }
    return "";
  }

  function matchPatternSpec(itemName) {
    if (!itemName) return null;
    for (const spec of config.patternSpecs) {
      const needle = normalizeItemName(spec?.name);
      if (needle && itemName.includes(needle)) {
        return spec;
      }
    }
    return null;
  }

  function getTilePosition(tile) {
    const candidate =
      tile?.__position ||
      tile?.position ||
      (typeof tile?.getPosition === "function" ? tile.getPosition() : null);
    if (!candidate) return null;
    const x = Number(candidate.x);
    const y = Number(candidate.y);
    const z = Number(candidate.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }
    return { x: Math.trunc(x), y: Math.trunc(y), z: Math.trunc(z) };
  }

  function positionKey(position) {
    return position ? `${position.x},${position.y},${position.z}` : null;
  }

  function recordTimer(position, item, spec, now = Date.now()) {
    const key = positionKey(position);
    if (!key || !spec) return;

    const existing = state.timers.get(key);
    const durationMs = Math.max(1000, Math.trunc(Number(spec.durationMs) || 20000));
    if (existing && existing.expiresAt > now) {
      existing.startedAt = now;
      existing.expiresAt = now + durationMs;
      existing.spec = spec;
      existing.itemId = item?.id ?? existing.itemId;
      bot.log("magic wall timer refreshed", { position, durationMs });
      try { render(); } catch (error) {
        console.error("[minibia-copilot] magic-wall render failed", error);
      }
      return;
    }

    state.timers.set(key, {
      position,
      itemId: item?.id ?? null,
      itemName: getItemName(item),
      spec,
      startedAt: now,
      expiresAt: now + durationMs,
    });
    state.alarmedFor.delete(key);
    bot.log("magic wall timer started", { position, durationMs, itemName: getItemName(item) });
    try { render(); } catch (error) {
      console.error("[minibia-copilot] magic-wall render failed", error);
    }
  }

  function clearExpired(now = Date.now()) {
    for (const [key, entry] of state.timers) {
      if (entry.expiresAt <= now) {
        state.timers.delete(key);
        state.alarmedFor.delete(key);
      }
    }
  }

  function handleAddItem(position, item) {
    if (!config.enabled || !position || !item) return;
    const itemName = getItemName(item);

    if (config.debugLogItems) {
      const entry = { id: item.id, name: itemName, position: getTilePosition({ __position: position }) };
      state.debugSeen.push(entry);
      if (state.debugSeen.length > 50) state.debugSeen.shift();
      console.log("[minibia-copilot] magic-wall item added", entry);
    }

    const spec = matchPatternSpec(itemName);
    if (!spec) return;
    const normalized = getTilePosition({ __position: position });
    if (!normalized) return;
    recordTimer(normalized, item, spec);
  }

  function handleRemovedTile(tile, index) {
    if (!state.timers.size) return;
    const tilePosition = getTilePosition(tile);
    const key = positionKey(tilePosition);
    if (!key || !state.timers.has(key)) return;
    const items = Array.isArray(tile?.items) ? tile.items : [];
    const remaining = items.filter((_, itemIndex) => itemIndex !== index);
    const stillThere = remaining.some((item) => !!matchPatternSpec(getItemName(item)));
    if (!stillThere) {
      state.timers.delete(key);
      state.alarmedFor.delete(key);
    }
  }

  function getWorldPrototype() {
    try {
      if (typeof World !== "undefined" && World?.prototype) return World.prototype;
    } catch (error) {}
    const world = window.gameClient?.world;
    if (world) return Object.getPrototypeOf(world);
    return null;
  }

  function getTilePrototype() {
    try {
      if (typeof Tile !== "undefined" && Tile?.prototype) return Tile.prototype;
    } catch (error) {}
    const chunks = window.gameClient?.world?.chunks || [];
    for (const chunk of chunks) {
      const tiles = chunk?.tiles;
      if (Array.isArray(tiles)) {
        for (const tile of tiles) {
          if (tile) return Object.getPrototypeOf(tile);
        }
      }
    }
    return null;
  }

  function installPatches() {
    if (state.patches) return true;

    const WorldProto = getWorldPrototype();
    const TileProto = getTilePrototype();
    if (!WorldProto || !TileProto || typeof WorldProto.addItem !== "function" || typeof TileProto.removeItem !== "function") {
      return false;
    }

    const originalAddItem = WorldProto.addItem;
    const originalRemoveItem = TileProto.removeItem;

    WorldProto.addItem = function patchedAddItem(position, item, slot) {
      const result = originalAddItem.call(this, position, item, slot);
      try {
        handleAddItem(position, item);
      } catch (error) {
        console.error("[minibia-copilot] magic-wall addItem hook failed", error);
      }
      return result;
    };

    TileProto.removeItem = function patchedRemoveItem(index, count) {
      let resolvedIndex = index;
      if (resolvedIndex === 0xFF) {
        resolvedIndex = Array.isArray(this.items) ? this.items.length - 1 : -1;
      }
      try {
        handleRemovedTile(this, resolvedIndex);
      } catch (error) {
        console.error("[minibia-copilot] magic-wall removeItem hook failed", error);
      }
      return originalRemoveItem.call(this, index, count);
    };

    state.patches = {
      WorldProto,
      originalAddItem,
      TileProto,
      originalRemoveItem,
    };
    bot.log("magic wall hooks installed");
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
    bot.log("magic wall: world not ready, retrying every 1s");
    stopInstallRetry();
    state.installRetryTimerId = window.setInterval(() => {
      if (!state.enabled) {
        stopInstallRetry();
        return;
      }
      if (installPatches()) {
        stopInstallRetry();
      }
    }, 1000);
  }

  function uninstallPatches() {
    stopInstallRetry();
    if (!state.patches) return;
    const { WorldProto, originalAddItem, TileProto, originalRemoveItem } = state.patches;
    if (WorldProto.addItem !== originalAddItem) WorldProto.addItem = originalAddItem;
    if (TileProto.removeItem !== originalRemoveItem) TileProto.removeItem = originalRemoveItem;
    state.patches = null;
  }

  function ensureOverlayStyle() {
    if (document.getElementById(overlayStyleId)) return;
    const style = document.createElement("style");
    style.id = overlayStyleId;
    style.textContent = `
      #${overlayRootId} {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2147483646;
      }
      #${overlayRootId} canvas {
        position: fixed;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureOverlayRoot() {
    let root = document.getElementById(overlayRootId);
    if (root) return root;
    root = document.createElement("div");
    root.id = overlayRootId;
    root.innerHTML = '<canvas></canvas>';
    document.body.appendChild(root);
    return root;
  }

  function destroyOverlay() {
    document.getElementById(overlayRootId)?.remove();
    document.getElementById(overlayStyleId)?.remove();
  }

  function getGameViewport() {
    const canvas = window.gameClient?.renderer?.screen?.canvas;
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { canvas, rect };
  }

  function getScalingVector() {
    const scaling = window.gameClient?.interface?.getSpriteScalingVector?.();
    if (scaling && Number.isFinite(scaling.x) && Number.isFinite(scaling.y) && scaling.x > 0 && scaling.y > 0) {
      return { x: scaling.x, y: scaling.y };
    }
    return { x: 32, y: 32 };
  }

  function getPlayerMoveOffset() {
    const offset = window.gameClient?.player?.getMoveOffset?.();
    if (offset && Number.isFinite(offset.x) && Number.isFinite(offset.y)) {
      return { x: offset.x, y: offset.y };
    }
    return { x: 0, y: 0 };
  }

  function worldToCanvasTile(position, playerPosition, moveOffset) {
    const tileX = 7 + moveOffset.x + (position.x - playerPosition.x);
    const tileY = 5 + moveOffset.y + (position.y - playerPosition.y);
    return { tileX, tileY };
  }

  function render() {
    const root = ensureOverlayRoot();
    const canvas = root.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return;

    const viewport = getGameViewport();
    const playerPosition = window.gameClient?.player?.getPosition?.();

    if (!viewport || !playerPosition || !state.timers.size) {
      if (canvas.width !== 0) {
        canvas.width = 0;
        canvas.height = 0;
      }
      return;
    }

    const rect = viewport.rect;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    canvas.style.left = `${Math.round(rect.left)}px`;
    canvas.style.top = `${Math.round(rect.top)}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const scaling = getScalingVector();
    const moveOffset = getPlayerMoveOffset();
    const now = Date.now();
    const tilePixelWidth = Math.max(1, scaling.x);
    const tilePixelHeight = Math.max(1, scaling.y);
    const fontSize = Math.max(10, Math.round(tilePixelHeight * 0.45));

    context.save();
    context.font = `bold ${fontSize}px Verdana, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 3;

    for (const entry of state.timers.values()) {
      if (entry.position.z !== playerPosition.z && !config.showFloorChanges) continue;

      const { tileX, tileY } = worldToCanvasTile(entry.position, playerPosition, moveOffset);
      if (tileX < -1 || tileX > 16 || tileY < -1 || tileY > 12) continue;

      const cx = (tileX + 0.5) * tilePixelWidth;
      const cy = (tileY + 0.5) * tilePixelHeight;
      if (cx < -tilePixelWidth || cx > width + tilePixelWidth) continue;
      if (cy < -tilePixelHeight || cy > height + tilePixelHeight) continue;

      const remainingMs = Math.max(0, entry.expiresAt - now);
      const secondsLeft = Math.ceil(remainingMs / 1000);
      const isExpiring = remainingMs <= Math.max(0, Number(config.flashLeadMs) || 0);
      const flashOn = isExpiring && Math.floor(now / 250) % 2 === 0;
      const color = isExpiring && flashOn ? "#ff4d4d" : (entry.spec?.color || "#7ec8ff");

      const radius = Math.max(10, Math.round(tilePixelHeight * 0.4));
      context.beginPath();
      context.arc(cx, cy, radius, 0, Math.PI * 2);
      context.fillStyle = "rgba(0, 0, 0, 0.6)";
      context.fill();
      context.strokeStyle = color;
      context.stroke();

      context.fillStyle = color;
      context.fillText(String(secondsLeft), cx, cy);
    }

    context.restore();

    if (config.audioOnExpiry && Number.isFinite(config.audioLeadMs)) {
      for (const [key, entry] of state.timers) {
        const lead = Math.max(0, Number(config.audioLeadMs) || 0);
        if (entry.expiresAt - now <= lead && !state.alarmedFor.has(key)) {
          state.alarmedFor.add(key);
          bot.playAlarm?.();
        }
      }
    }
  }

  function tickOverlay() {
    try {
      clearExpired();
      render();
    } catch (error) {
      console.error("[minibia-copilot] magic-wall render failed", error);
    }
  }

  function startOverlay() {
    if (state.overlayTimerId != null) return;
    ensureOverlayStyle();
    tickOverlay();
    state.overlayTimerId = window.setInterval(tickOverlay, 200);
  }

  function stopOverlay() {
    if (state.overlayTimerId != null) {
      window.clearInterval(state.overlayTimerId);
      state.overlayTimerId = null;
    }
    destroyOverlay();
  }

  function start(overrides = {}) {
    Object.assign(config, overrides, { enabled: true });
    persistConfig();
    if (state.enabled) {
      bot.log("magic wall timer already running");
      return false;
    }
    state.enabled = true;
    tryInstallWithRetry();
    startOverlay();
    bot.log("magic wall timer started", { patternSpecs: config.patternSpecs });
    return true;
  }

  function stop(options = {}) {
    const persistEnabled = options.persistEnabled !== false;
    state.enabled = false;
    stopOverlay();
    uninstallPatches();
    state.timers.clear();
    state.alarmedFor.clear();
    if (persistEnabled) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("magic wall timer stopped");
    return true;
  }

  function clear() {
    state.timers.clear();
    state.alarmedFor.clear();
    return true;
  }

  function list() {
    const now = Date.now();
    return Array.from(state.timers.values()).map((entry) => ({
      position: { ...entry.position },
      itemId: entry.itemId,
      itemName: entry.itemName,
      remainingMs: Math.max(0, entry.expiresAt - now),
      expiresAt: entry.expiresAt,
      durationMs: entry.expiresAt - entry.startedAt,
      spec: entry.spec ? { ...entry.spec } : null,
    }));
  }

  function status() {
    return {
      running: state.enabled,
      hooksInstalled: !!state.patches,
      retryingInstall: state.installRetryTimerId != null,
      config: { ...config },
      timers: list(),
      recentItemsSeen: state.debugSeen.slice(-10),
    };
  }

  function debugEnable(on = true) {
    config.debugLogItems = !!on;
    persistConfig();
    bot.log("magic wall debug logging " + (on ? "ON" : "OFF"));
    return on;
  }

  function debugOverlay() {
    ensureOverlayStyle();
    const root = ensureOverlayRoot();
    const canvas = root.querySelector("canvas");
    const viewport = getGameViewport();
    const playerPosition = window.gameClient?.player?.getPosition?.();
    const diagnostic = {
      rootInDom: !!document.getElementById(overlayRootId),
      canvasInDom: !!canvas,
      viewportFound: !!viewport,
      gameCanvasFound: !!window.gameClient?.renderer?.screen?.canvas,
      gameCanvasRect: viewport ? {
        left: viewport.rect.left,
        top: viewport.rect.top,
        width: viewport.rect.width,
        height: viewport.rect.height,
      } : null,
      gameCanvasInternal: viewport ? {
        width: viewport.canvas.width,
        height: viewport.canvas.height,
      } : null,
      scaling: getScalingVector(),
      moveOffset: getPlayerMoveOffset(),
      playerPosition,
      overlayTimerRunning: state.overlayTimerId != null,
      hooksInstalled: !!state.patches,
      timersCount: state.timers.size,
    };
    console.log("[minibia-copilot] magic-wall debugOverlay", diagnostic);

    if (!canvas || !viewport) {
      console.warn("[minibia-copilot] magic-wall debugOverlay: cannot draw test pattern", { canvas, viewport });
      return diagnostic;
    }

    const rect = viewport.rect;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.left = `${Math.round(rect.left)}px`;
    canvas.style.top = `${Math.round(rect.top)}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext("2d");
    if (!context) {
      console.warn("[minibia-copilot] magic-wall debugOverlay: 2d context unavailable");
      return diagnostic;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.fillStyle = "rgba(255, 0, 0, 0.4)";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#ffff00";
    context.lineWidth = 6;
    context.strokeRect(3, 3, width - 6, height - 6);
    context.fillStyle = "#ffffff";
    context.font = "bold 32px Verdana, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("MW OVERLAY OK", width / 2, height / 2);

    console.log("[minibia-copilot] magic-wall debugOverlay: red rectangle drawn. If you see it on the game viewport, the overlay works; the issue is detection or projection. Call minibiaCopilot.magicWall.clear() to remove.");
    return diagnostic;
  }

  function testTimer(durationSeconds = 20) {
    const playerPosition = window.gameClient?.player?.getPosition?.();
    if (!playerPosition) {
      bot.log("magic wall test: no player position");
      return false;
    }
    const normalized = getTilePosition({ __position: playerPosition });
    if (!normalized) return false;
    const seconds = Math.max(1, Math.trunc(Number(durationSeconds) || 20));
    const spec = { name: "test timer", durationMs: seconds * 1000, color: "#ffcf5a" };
    recordTimer(normalized, { id: 0, name: "test timer" }, spec);
    bot.log("magic wall test timer placed", { position: normalized, seconds });
    return true;
  }

  function updateConfig(nextConfig = {}) {
    if (Array.isArray(nextConfig.patternSpecs)) {
      nextConfig.patternSpecs = nextConfig.patternSpecs
        .map((spec) => spec && typeof spec === "object" ? { ...spec } : null)
        .filter(Boolean);
      if (!nextConfig.patternSpecs.length) {
        delete nextConfig.patternSpecs;
      }
    }
    Object.assign(config, nextConfig);
    persistConfig();
    bot.log("magic wall config updated", { ...config });
    return { ...config };
  }

  bot.addCleanup(() => {
    stopOverlay();
    uninstallPatches();
    state.timers.clear();
  });

  if (config.enabled) {
    start();
  }

  bot.magicWall = {
    start,
    stop,
    status,
    list,
    clear,
    updateConfig,
    debugEnable,
    debugOverlay,
    testTimer,
    config,
  };
};
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
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installTrackerModule = function installTrackerModule(bot) {
  const configStorageKey = "minibiaCopilot.tracker.config";
  const deathsStorageKey = "minibiaCopilot.tracker.deaths";
  const trackedStorageKey = "minibiaCopilot.tracker.tracked";
  const seenDeathsStorageKey = "minibiaCopilot.tracker.seenDeathKeys";
  const infoStorageKey = "minibiaCopilot.tracker.info";

  const state = {
    running: false,
    pollTimerId: null,
    expireTimerId: null,
    lastPollAt: 0,
    lastOnlineSet: new Set(),
    lastError: null,
    pollInFlight: false,
  };

  const config = Object.assign(
    {
      pollIntervalMs: 120000,
      retentionMs: 30 * 60 * 1000,
      onlineUrl: "/api/online",
      characterApiUrlTemplate: "/api/character?name={name}",
      characterPageUrlTemplate: "/character.html?name={name}",
      enabled: false,
    },
    bot.storage.get(configStorageKey, {})
  );

  if (config.onlineUrl === "/online.html") {
    config.onlineUrl = "/api/online";
  }
  if (!config.characterApiUrlTemplate) {
    config.characterApiUrlTemplate = "/api/character?name={name}";
  }
  if (!config.characterPageUrlTemplate) {
    config.characterPageUrlTemplate = "/character.html?name={name}";
  }

  const validCategories = new Set(["enemy", "friendly"]);
  const defaultCategory = "enemy";

  function normalizeCategory(value) {
    const raw = String(value || "").trim().toLowerCase();
    return validCategories.has(raw) ? raw : defaultCategory;
  }

  function normalizeName(value) {
    return String(value || "").trim();
  }

  function normalizeKey(value) {
    return normalizeName(value).toLowerCase();
  }

  function normalizeTrackedNames(value) {
    const list = Array.isArray(value) ? value : [];
    const dedup = new Map();
    list.forEach((entry) => {
      if (entry == null) return;
      let name;
      let category;
      if (typeof entry === "string") {
        name = normalizeName(entry);
        category = defaultCategory;
      } else if (typeof entry === "object") {
        name = normalizeName(entry.name);
        category = normalizeCategory(entry.category);
      } else {
        return;
      }
      const key = normalizeKey(name);
      if (key) dedup.set(key, { name, category });
    });
    return Array.from(dedup.values());
  }

  let trackedPlayers = normalizeTrackedNames(bot.storage.get(trackedStorageKey, []));
  let recentDeaths = normalizeDeathRecords(bot.storage.get(deathsStorageKey, []));
  let seenDeathKeys = new Set(bot.storage.get(seenDeathsStorageKey, []) || []);

  function normalizeInfoCache(value) {
    const out = {};
    if (!value || typeof value !== "object") return out;
    Object.keys(value).forEach((key) => {
      const entry = value[key];
      if (!entry || typeof entry !== "object") return;
      out[String(key).toLowerCase()] = {
        level: Number.isFinite(Number(entry.level)) ? Number(entry.level) : null,
        vocation: entry.vocation ? String(entry.vocation).trim() : null,
        lastUpdatedAt: Number.isFinite(Number(entry.lastUpdatedAt)) ? Number(entry.lastUpdatedAt) : 0,
      };
    });
    return out;
  }

  let characterInfoCache = normalizeInfoCache(bot.storage.get(infoStorageKey, {}));

  function persistInfoCache() {
    bot.storage.set(infoStorageKey, characterInfoCache);
  }

  function getPlayerInfo(name) {
    const raw = characterInfoCache[normalizeKey(name)];
    if (!raw) return null;
    return {
      level: raw.level,
      vocation: resolveVocation(raw.vocation),
      lastUpdatedAt: raw.lastUpdatedAt || 0,
    };
  }

  function updatePlayerInfo(name, level, vocation, now = Date.now()) {
    const key = normalizeKey(name);
    if (!key) return;
    const current = characterInfoCache[key] || { level: null, vocation: null, lastUpdatedAt: 0 };
    const resolvedVocation = vocation != null && vocation !== ""
      ? resolveVocation(vocation)
      : current.vocation;
    const next = {
      level: Number.isFinite(Number(level)) ? Number(level) : current.level,
      vocation: resolvedVocation,
      lastUpdatedAt: now,
    };
    if (next.level === current.level && next.vocation === current.vocation) {
      current.lastUpdatedAt = now;
      return;
    }
    characterInfoCache[key] = next;
    persistInfoCache();
  }

  function getPlayerCategory(name) {
    const key = normalizeKey(name);
    const found = trackedPlayers.find((p) => normalizeKey(p.name) === key);
    return found?.category || defaultCategory;
  }

  function getTrackedNamesArray() {
    return trackedPlayers.map((p) => p.name);
  }

  function normalizeDeathRecords(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => {
        if (!entry) return null;
        const name = normalizeName(entry.name);
        const at = Number(entry.at);
        if (!name || !Number.isFinite(at)) return null;
        return {
          name,
          at,
          level: entry.level ?? null,
          description: String(entry.description || ""),
          dedupKey: String(entry.dedupKey || ""),
        };
      })
      .filter(Boolean);
  }

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }
  function persistTracked() {
    bot.storage.set(trackedStorageKey, trackedPlayers);
  }
  function persistDeaths() {
    bot.storage.set(deathsStorageKey, recentDeaths);
  }
  function persistSeenDeathKeys() {
    bot.storage.set(seenDeathsStorageKey, Array.from(seenDeathKeys));
  }

  function expireOldDeaths(now = Date.now()) {
    const cutoff = now - Math.max(60000, Number(config.retentionMs) || 1800000);
    const next = recentDeaths.filter((entry) => entry.at >= cutoff);
    if (next.length !== recentDeaths.length) {
      recentDeaths = next;
      persistDeaths();
      const keep = new Set(next.map((d) => d.dedupKey).filter(Boolean));
      const newSeen = new Set();
      seenDeathKeys.forEach((key) => {
        if (keep.has(key)) newSeen.add(key);
      });
      if (newSeen.size !== seenDeathKeys.size) {
        seenDeathKeys = newSeen;
        persistSeenDeathKeys();
      }
      try { bot.ui?.refreshTrackerStatus?.(); } catch (error) {}
    }
  }

  function buildCharacterApiUrl(name) {
    const template = String(config.characterApiUrlTemplate || "/api/character?name={name}");
    return template.replace("{name}", encodeURIComponent(name));
  }

  function buildCharacterPageUrl(name) {
    const template = String(config.characterPageUrlTemplate || "/character.html?name={name}");
    return template.replace("{name}", encodeURIComponent(name));
  }

  async function fetchAny(url) {
    const headers = {
      "Accept": "application/json, text/html;q=0.9, */*;q=0.5",
      "X-Requested-With": "XMLHttpRequest",
    };
    try {
      const sameOrigin = String(window.location?.origin || "").startsWith("http");
      if (sameOrigin) headers["Referer"] = window.location.href;
    } catch (error) {}

    const response = await fetch(url, {
      credentials: "include",
      headers,
      cache: "no-store",
      mode: "same-origin",
      redirect: "follow",
    });
    const contentType = String(response.headers.get("content-type") || "");
    const text = await response.text();
    if (!response.ok) {
      const snippet = text ? text.slice(0, 120).replace(/\s+/g, " ") : "";
      const cfRay = response.headers.get("cf-ray") || "";
      throw new Error(`HTTP ${response.status} fetching ${url}${cfRay ? ` (cf-ray ${cfRay})` : ""}${snippet ? ` — ${snippet}` : ""}`);
    }
    let json = null;
    if (contentType.includes("application/json")) {
      try { json = JSON.parse(text); } catch (error) {}
    }
    if (json == null && text && (text[0] === "{" || text[0] === "[")) {
      try { json = JSON.parse(text); } catch (error) {}
    }
    return { text, json, contentType };
  }

  function parseHtml(html) {
    try {
      const parser = new DOMParser();
      return parser.parseFromString(html, "text/html");
    } catch (error) {
      return null;
    }
  }

  function collectStrings(value, key, out) {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => collectStrings(entry, key, out));
      return;
    }
    if (typeof value === "object") {
      const candidate = value[key];
      if (typeof candidate === "string") {
        const trimmed = candidate.trim();
        if (trimmed) out.add(trimmed);
      }
      Object.keys(value).forEach((subKey) => collectStrings(value[subKey], key, out));
    }
  }

  function extractOnlineNamesFromJson(json) {
    if (!json) return new Set();
    const out = new Set();
    const arrayCandidate =
      (Array.isArray(json) && json) ||
      json.players ||
      json.online ||
      json.list ||
      json.results ||
      json.data ||
      null;
    if (Array.isArray(arrayCandidate)) {
      arrayCandidate.forEach((entry) => {
        if (typeof entry === "string") {
          const trimmed = entry.trim();
          if (trimmed) out.add(trimmed);
        } else if (entry && typeof entry === "object") {
          const candidates = [entry.name, entry.character, entry.playerName, entry.character_name, entry.charname];
          for (const candidate of candidates) {
            if (typeof candidate === "string" && candidate.trim()) {
              out.add(candidate.trim());
              break;
            }
          }
        }
      });
    }
    if (!out.size) {
      collectStrings(json, "name", out);
    }
    return out;
  }

  function extractOnlineNamesFromHtml(doc) {
    if (!doc) return new Set();
    const names = new Set();
    const anchors = doc.querySelectorAll('a[href*="character.html"]');
    anchors.forEach((anchor) => {
      const href = anchor.getAttribute("href") || "";
      const match = href.match(/[?&]name=([^&#]+)/i);
      const name = match
        ? decodeURIComponent(match[1].replace(/\+/g, " ")).trim()
        : (anchor.textContent || "").trim();
      if (name) names.add(name);
    });
    return names;
  }

  function extractOnlineNames(result) {
    if (!result) return new Set();
    if (result.json) {
      const fromJson = extractOnlineNamesFromJson(result.json);
      if (fromJson.size) return fromJson;
    }
    if (result.text) {
      return extractOnlineNamesFromHtml(parseHtml(result.text));
    }
    return new Set();
  }

  const VOCATION_NAMES = {
    0: "None",
    1: "Knight",
    2: "Paladin",
    3: "Sorcerer",
    4: "Druid",
    5: "Elite Knight",
    6: "Royal Paladin",
    7: "Master Sorcerer",
    8: "Elder Druid",
  };

  function resolveVocation(value) {
    if (value == null) return null;
    if (typeof value === "number" && Number.isFinite(value)) {
      return VOCATION_NAMES[value] || `Vocation ${value}`;
    }
    const str = String(value).trim();
    if (!str) return null;
    if (/^-?\d+$/.test(str)) {
      const n = Number(str);
      return VOCATION_NAMES[n] || `Vocation ${n}`;
    }
    return str;
  }

  function extractCharacterInfoFromJson(json) {
    if (!json || typeof json !== "object") return { level: null, vocation: null };
    const candidates = [json, json.character, json.player, json.data, json.profile].filter(Boolean);
    let level = null;
    let vocation = null;
    for (const candidate of candidates) {
      if (level == null) {
        const lvl = candidate.level ?? candidate.lvl ?? candidate.lvlValue ?? candidate.experienceLevel;
        if (lvl != null && Number.isFinite(Number(lvl))) level = Number(lvl);
      }
      if (vocation == null) {
        const voc = candidate.vocation ?? candidate.vocationName ?? candidate.class ?? candidate.profession ?? candidate.job;
        if (voc != null && voc !== "") vocation = resolveVocation(voc);
      }
      if (level != null && vocation) break;
    }
    return { level, vocation };
  }

  function extractCharacterInfoFromHtml(doc) {
    if (!doc) return { level: null, vocation: null };
    const text = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
    let level = null;
    let vocation = null;

    const levelMatch = text.match(/level\s*[:\-]?\s*(\d{1,4})/i);
    if (levelMatch) level = Number(levelMatch[1]);

    const vocationMatch = text.match(
      /vocation\s*[:\-]?\s*([A-Za-z][A-Za-z\s]{2,40}?)(?=\s+(?:level|world|residence|sex|gender|guild|last|account|profile|character|email|created|residence|status|premium|points|deaths|achievements|\d|$))/i
    );
    if (vocationMatch) {
      vocation = vocationMatch[1].trim().replace(/\s+/g, " ").replace(/[.,;:]+$/, "");
    }

    if (!vocation) {
      const tableMatch = text.match(/vocation\s+([A-Za-z][A-Za-z\s]{2,40})/i);
      if (tableMatch) vocation = tableMatch[1].trim().replace(/\s+/g, " ").replace(/[.,;:]+$/, "");
    }

    return { level, vocation };
  }

  function extractCharacterDeathsFromJson(json, name) {
    if (!json) return [];
    const out = [];
    const lowerName = name.toLowerCase();

    function tryArray(candidate) {
      if (!Array.isArray(candidate)) return;
      candidate.forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const dateRaw =
          entry.date || entry.time || entry.timestamp || entry.at || entry.died_at || entry.created_at || null;
        const at = dateRaw == null ? null :
          (typeof dateRaw === "number" ? (dateRaw < 1e12 ? dateRaw * 1000 : dateRaw) : parseDeathDate(String(dateRaw)));
        if (at == null) return;
        const level = entry.level != null ? Number(entry.level) : null;
        const description = String(
          entry.description || entry.cause || entry.killer || entry.text || entry.message || ""
        ).trim();
        const dedupKey = `${lowerName}|${at}|${description.slice(0, 60).toLowerCase()}`;
        out.push({ name, at, level: Number.isFinite(level) ? level : null, description, dedupKey });
      });
    }

    tryArray(json.deaths);
    if (!out.length) tryArray(json.death_history);
    if (!out.length) tryArray(json.deathlist);
    if (!out.length && json.character) {
      tryArray(json.character.deaths);
      tryArray(json.character.death_history);
    }
    return out;
  }

  function parseDeathDate(raw) {
    if (!raw) return null;
    const direct = Date.parse(raw);
    if (Number.isFinite(direct)) return direct;
    const isoLike = String(raw).trim().replace(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(:\d{2})?)/, "$1T$2");
    const second = Date.parse(isoLike);
    if (Number.isFinite(second)) return second;
    const monthMatch = String(raw).match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})[ ,]+(\d{1,2}):(\d{2})/);
    if (monthMatch) {
      const probe = Date.parse(`${monthMatch[2]} ${monthMatch[1]} ${monthMatch[3]} ${monthMatch[4]}:${monthMatch[5]}`);
      if (Number.isFinite(probe)) return probe;
    }
    return null;
  }

  function extractCharacterDeaths(doc, name) {
    if (!doc) return [];
    const lowerName = name.toLowerCase();
    const deaths = [];

    const rows = doc.querySelectorAll("tr, li, .death, .death-entry, [data-death]");
    rows.forEach((row) => {
      const text = (row.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) return;

      if (!/(died|killed by|slain|death)/i.test(text)) {
        if (!/\b\d{4}-\d{2}-\d{2}\b/.test(text) && !/\b\d{1,2}\s+\w+\s+\d{4}\b/.test(text)) {
          return;
        }
      }

      let at = null;
      const cells = row.querySelectorAll("td, span, time, .death-date, [data-date]");
      cells.forEach((cell) => {
        if (at != null) return;
        const candidate = cell.getAttribute?.("datetime") || cell.getAttribute?.("data-date") || cell.textContent;
        const parsed = parseDeathDate(candidate);
        if (parsed != null) at = parsed;
      });
      if (at == null) {
        const dateGuess = text.match(/(\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(?::\d{2})?)|(\d{1,2}\s+[A-Za-z]+\s+\d{4}[,\s]+\d{1,2}:\d{2})/);
        if (dateGuess) at = parseDeathDate(dateGuess[0]);
      }
      if (at == null) return;

      const levelMatch = text.match(/(?:level|lvl)\s*[:\-]?\s*(\d+)/i);
      const level = levelMatch ? Number(levelMatch[1]) : null;

      let description = text;
      const colonIndex = text.indexOf(",");
      if (colonIndex > 0 && colonIndex < 60) description = text.slice(colonIndex + 1).trim();
      if (description.length > 240) description = description.slice(0, 240) + "…";

      const dedupKey = `${lowerName}|${at}|${description.slice(0, 60).toLowerCase()}`;
      deaths.push({ name, at, level, description, dedupKey });
    });

    const dedup = new Map();
    deaths.forEach((entry) => {
      if (!dedup.has(entry.dedupKey)) dedup.set(entry.dedupKey, entry);
    });
    return Array.from(dedup.values()).sort((a, b) => a.at - b.at);
  }

  async function fetchCharacterDeaths(name) {
    let deaths = [];
    let info = null;

    try {
      const apiResult = await fetchAny(buildCharacterApiUrl(name));
      if (apiResult.json) {
        info = extractCharacterInfoFromJson(apiResult.json);
        const fromJson = extractCharacterDeathsFromJson(apiResult.json, name);
        if (fromJson.length) deaths = fromJson;
      } else if (apiResult.text) {
        const doc = parseHtml(apiResult.text);
        info = extractCharacterInfoFromHtml(doc);
        const fromHtml = extractCharacterDeaths(doc, name);
        if (fromHtml.length) deaths = fromHtml;
      }
    } catch (error) {
      bot.log("tracker: character api fetch failed, falling back to page", {
        name,
        error: error?.message || String(error),
      });
    }

    if (!deaths.length || !info || (info.level == null && !info.vocation)) {
      try {
        const pageResult = await fetchAny(buildCharacterPageUrl(name));
        let pageInfo = null;
        let pageDeaths = [];
        if (pageResult.json) {
          pageInfo = extractCharacterInfoFromJson(pageResult.json);
          pageDeaths = extractCharacterDeathsFromJson(pageResult.json, name);
        } else if (pageResult.text) {
          const doc = parseHtml(pageResult.text);
          pageInfo = extractCharacterInfoFromHtml(doc);
          pageDeaths = extractCharacterDeaths(doc, name);
        }
        if (!info) info = pageInfo;
        else {
          if (info.level == null && pageInfo?.level != null) info.level = pageInfo.level;
          if (!info.vocation && pageInfo?.vocation) info.vocation = pageInfo.vocation;
        }
        if (!deaths.length && pageDeaths.length) deaths = pageDeaths;
      } catch (error) {
        bot.log("tracker: character page fetch failed", {
          name,
          error: error?.message || String(error),
        });
      }
    }

    if (info && (info.level != null || info.vocation)) {
      updatePlayerInfo(name, info.level, info.vocation);
    }
    return deaths;
  }

  async function pollOnce(now = Date.now()) {
    if (state.pollInFlight) return false;
    state.pollInFlight = true;

    const previousOnlineKeys = state.lastOnlineSet;
    const isFirstPoll = previousOnlineKeys.size === 0 && !state.lastPollAt;

    try {
      const onlineResult = await fetchAny(config.onlineUrl);
      const onlineNames = extractOnlineNames(onlineResult);

      const onlineKeys = new Set();
      onlineNames.forEach((n) => onlineKeys.add(normalizeKey(n)));
      state.lastOnlineSet = onlineKeys;

      if (!isFirstPoll) {
        for (const trackedPlayer of trackedPlayers) {
          const trackedName = trackedPlayer.name;
          const key = normalizeKey(trackedName);
          const wasOnline = previousOnlineKeys.has(key);
          const isOnlineNow = onlineKeys.has(key);
          if (!wasOnline && isOnlineNow) {
            try {
              bot.ui?.showTrackerNotification?.("login", trackedName, { category: trackedPlayer.category });
            } catch (error) {}
            bot.log("tracker: login observed", { name: trackedName, category: trackedPlayer.category });
          }
        }
      }

      const cutoff = now - Math.max(60000, Number(config.retentionMs) || 1800000);
      let appended = 0;
      const newDeathsForNotifications = [];

      for (const trackedPlayer of trackedPlayers) {
        const trackedName = trackedPlayer.name;
        const deaths = await fetchCharacterDeaths(trackedName);
        for (const death of deaths) {
          if (death.at < cutoff) continue;
          if (seenDeathKeys.has(death.dedupKey)) continue;
          seenDeathKeys.add(death.dedupKey);
          recentDeaths.push(death);
          appended += 1;
          if (!isFirstPoll) newDeathsForNotifications.push(death);
          bot.log("tracker: new death observed", {
            name: death.name,
            at: new Date(death.at).toISOString(),
            level: death.level,
            description: death.description.slice(0, 80),
          });
        }
      }

      if (appended > 0) {
        recentDeaths.sort((a, b) => a.at - b.at);
        persistDeaths();
        persistSeenDeathKeys();
      }

      newDeathsForNotifications.forEach((death) => {
        const category = getPlayerCategory(death.name);
        try {
          bot.ui?.showTrackerNotification?.("death", death.name, { ...death, category });
        } catch (error) {}
      });

      state.lastPollAt = now;
      state.lastError = null;
      expireOldDeaths(now);
      try { bot.ui?.refreshTrackerStatus?.(); } catch (error) {}
      return true;
    } catch (error) {
      state.lastError = error?.message || String(error);
      bot.log("tracker: poll failed", { error: state.lastError });
      try { bot.ui?.refreshTrackerStatus?.(); } catch (error2) {}
      return false;
    } finally {
      state.pollInFlight = false;
    }
  }

  function schedulePoll() {
    stopPollTimer();
    if (!state.running) return;
    const interval = Math.max(30000, Math.min(600000, Number(config.pollIntervalMs) || 120000));
    state.pollTimerId = window.setInterval(() => {
      pollOnce().catch((error) => {
        bot.log("tracker: poll exception", error?.message || error);
      });
    }, interval);
  }

  function stopPollTimer() {
    if (state.pollTimerId != null) {
      window.clearInterval(state.pollTimerId);
      state.pollTimerId = null;
    }
  }

  function startExpireTimer() {
    if (state.expireTimerId != null) return;
    state.expireTimerId = window.setInterval(() => expireOldDeaths(), 30000);
  }

  function stopExpireTimer() {
    if (state.expireTimerId != null) {
      window.clearInterval(state.expireTimerId);
      state.expireTimerId = null;
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides);
    config.enabled = true;
    persistConfig();
    if (state.running) {
      bot.log("tracker already running");
      return false;
    }
    state.running = true;
    schedulePoll();
    startExpireTimer();
    pollOnce().catch(() => {});
    bot.log("tracker started", {
      pollIntervalMs: config.pollIntervalMs,
      retentionMs: config.retentionMs,
      tracked: trackedPlayers.length,
    });
    return true;
  }

  function stop(options = {}) {
    const persistEnabled = options.persistEnabled !== false;
    state.running = false;
    stopPollTimer();
    stopExpireTimer();
    if (persistEnabled) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("tracker stopped");
    return true;
  }

  function addTracked(name, category) {
    const normalized = normalizeName(name);
    if (!normalized) return null;
    const key = normalizeKey(normalized);
    const cat = normalizeCategory(category);
    if (trackedPlayers.some((p) => normalizeKey(p.name) === key)) return null;
    trackedPlayers.push({ name: normalized, category: cat });
    persistTracked();
    bot.log("tracker: added", { name: normalized, category: cat });
    if (state.running) pollOnce().catch(() => {});
    try { bot.ui?.refreshTrackerStatus?.(); } catch (error) {}
    return { name: normalized, category: cat };
  }

  function removeTracked(name) {
    const key = normalizeKey(name);
    const before = trackedPlayers.length;
    trackedPlayers = trackedPlayers.filter((p) => normalizeKey(p.name) !== key);
    if (before === trackedPlayers.length) return false;
    persistTracked();
    bot.log("tracker: removed", { name });
    try { bot.ui?.refreshTrackerStatus?.(); } catch (error) {}
    return true;
  }

  function setCategory(name, category) {
    const key = normalizeKey(name);
    const cat = normalizeCategory(category);
    const found = trackedPlayers.find((p) => normalizeKey(p.name) === key);
    if (!found) return false;
    if (found.category === cat) return true;
    found.category = cat;
    persistTracked();
    bot.log("tracker: category changed", { name: found.name, category: cat });
    try { bot.ui?.refreshTrackerStatus?.(); } catch (error) {}
    return true;
  }

  function getTrackedNames(category) {
    if (!category) return getTrackedNamesArray();
    const cat = normalizeCategory(category);
    return trackedPlayers.filter((p) => p.category === cat).map((p) => p.name);
  }

  function isOnline(name) {
    return state.lastOnlineSet.has(normalizeKey(name));
  }

  function getRecentDeaths(category, now = Date.now()) {
    expireOldDeaths(now);
    if (!category) return recentDeaths.slice().sort((a, b) => b.at - a.at);
    const cat = normalizeCategory(category);
    return recentDeaths
      .filter((d) => getPlayerCategory(d.name) === cat)
      .sort((a, b) => b.at - a.at);
  }

  function annotatePlayers(players) {
    return players.map((p) => {
      const info = getPlayerInfo(p.name);
      return {
        name: p.name,
        category: p.category,
        level: info?.level ?? null,
        vocation: info?.vocation ?? null,
        infoUpdatedAt: info?.lastUpdatedAt || 0,
      };
    })
    .sort((a, b) => {
      const onlineDelta = (isOnline(b.name) ? 1 : 0) - (isOnline(a.name) ? 1 : 0);
      if (onlineDelta !== 0) return onlineDelta;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }

  function sortDeaths(deaths) {
    return deaths.slice().sort((a, b) => {
      const onlineDelta = (isOnline(b.name) ? 1 : 0) - (isOnline(a.name) ? 1 : 0);
      if (onlineDelta !== 0) return onlineDelta;
      const nameDelta = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (nameDelta !== 0) return nameDelta;
      return Number(b.at || 0) - Number(a.at || 0);
    });
  }

  function status() {
    const allNames = getTrackedNamesArray();
    const enemyPlayers = trackedPlayers.filter((p) => p.category === "enemy");
    const friendlyPlayers = trackedPlayers.filter((p) => p.category === "friendly");
    return {
      running: state.running,
      config: { ...config },
      tracked: allNames,
      trackedPlayers: trackedPlayers.map((p) => ({ ...p })),
      enemy: enemyPlayers.map((p) => p.name),
      friendly: friendlyPlayers.map((p) => p.name),
      enemyDetails: annotatePlayers(enemyPlayers),
      friendlyDetails: annotatePlayers(friendlyPlayers),
      online: allNames.filter((n) => isOnline(n)),
      offline: allNames.filter((n) => !isOnline(n)),
      enemyDeaths: sortDeaths(getRecentDeaths("enemy")),
      friendlyDeaths: sortDeaths(getRecentDeaths("friendly")),
      recentDeaths: sortDeaths(getRecentDeaths()),
      lastPollAt: state.lastPollAt,
      lastError: state.lastError,
      pollInFlight: state.pollInFlight,
      onlineCount: state.lastOnlineSet.size,
    };
  }

  function updateConfig(nextConfig = {}) {
    Object.assign(config, nextConfig);
    persistConfig();
    if (state.running) schedulePoll();
    bot.log("tracker config updated", { ...config });
    return { ...config };
  }

  async function debugFetch(name) {
    if (!name) {
      const url = config.onlineUrl;
      try {
        const result = await fetchAny(url);
        const names = Array.from(extractOnlineNames(result));
        return {
          url,
          contentType: result.contentType,
          bodyLength: result.text?.length || 0,
          gotJson: !!result.json,
          sample: result.text?.slice(0, 600) || "",
          jsonSample: result.json ? JSON.stringify(result.json).slice(0, 600) : null,
          onlineSample: names.slice(0, 20),
          onlineCount: names.size || names.length,
        };
      } catch (error) {
        return { url, error: error?.message || String(error) };
      }
    }

    const apiUrl = buildCharacterApiUrl(name);
    const pageUrl = buildCharacterPageUrl(name);
    let apiResult = null;
    let pageResult = null;
    try { apiResult = await fetchAny(apiUrl); } catch (error) { apiResult = { error: error?.message || String(error) }; }
    try { pageResult = await fetchAny(pageUrl); } catch (error) { pageResult = { error: error?.message || String(error) }; }

    const apiDeaths = apiResult?.json ? extractCharacterDeathsFromJson(apiResult.json, name) : [];
    const pageDeaths = pageResult?.text ? extractCharacterDeaths(parseHtml(pageResult.text), name) : [];

    return {
      apiUrl,
      apiContentType: apiResult?.contentType,
      apiGotJson: !!apiResult?.json,
      apiSample: apiResult?.text?.slice(0, 600) || apiResult?.error || "",
      apiJsonSample: apiResult?.json ? JSON.stringify(apiResult.json).slice(0, 800) : null,
      apiDeaths,
      pageUrl,
      pageContentType: pageResult?.contentType,
      pageBodyLength: pageResult?.text?.length || 0,
      pageSample: pageResult?.text?.slice(0, 600) || pageResult?.error || "",
      pageDeaths,
    };
  }

  function clearDeaths() {
    recentDeaths = [];
    seenDeathKeys.clear();
    persistDeaths();
    persistSeenDeathKeys();
    try { bot.ui?.refreshTrackerStatus?.(); } catch (error) {}
    return true;
  }

  bot.addCleanup(() => {
    stopPollTimer();
    stopExpireTimer();
  });

  if (config.enabled) start();

  bot.tracker = {
    start,
    stop,
    status,
    updateConfig,
    addTracked,
    removeTracked,
    setCategory,
    getTrackedNames,
    getTrackedPlayers: () => trackedPlayers.map((p) => ({ ...p })),
    getPlayerCategory,
    getPlayerInfo,
    isOnline,
    getRecentDeaths,
    pollOnce: () => pollOnce(),
    debugFetch,
    clearDeaths,
    config,
  };
};
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
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installFightEstimatorModule = function installFightEstimatorModule(bot) {
  const configStorageKey = "minibiaCopilot.fightEstimator.config";
  const cacheStorageKey = "minibiaCopilot.fightEstimator.libraryCache";
  const wikiCacheStorageKey = "minibiaCopilot.fightEstimator.wikiCache";

  const config = Object.assign(
    {
      libraryUrl: "/api/library",
      cacheTtlMs: 30 * 60 * 1000,
      wikiBaseUrl: "https://tibia.fandom.com",
      wikiCacheTtlMs: 7 * 24 * 60 * 60 * 1000,
      enableWikiFallback: true,
    },
    bot.storage.get(configStorageKey, {})
  );

  const state = {
    monsters: null,
    monstersByKey: null,
    fetchedAt: 0,
    inFlightPromise: null,
    lastError: null,
    wikiCache: {},
    wikiInFlight: new Map(),
  };

  function loadWikiCache() {
    const raw = bot.storage.get(wikiCacheStorageKey, {});
    if (raw && typeof raw === "object") {
      const cutoff = Date.now() - Math.max(60000, Number(config.wikiCacheTtlMs) || 1);
      const next = {};
      Object.keys(raw).forEach((key) => {
        const entry = raw[key];
        if (entry && entry.fetchedAt > cutoff && entry.monster && entry.monster.name) {
          next[key] = entry;
        }
      });
      state.wikiCache = next;
    }
  }

  function persistWikiCache() {
    try { bot.storage.set(wikiCacheStorageKey, state.wikiCache); } catch (error) {}
  }

  function loadCache() {
    const raw = bot.storage.get(cacheStorageKey, null);
    if (!raw || !Array.isArray(raw.monsters) || !Number.isFinite(raw.fetchedAt)) return false;
    const age = Date.now() - raw.fetchedAt;
    if (age > Math.max(60000, Number(config.cacheTtlMs) || 1800000)) return false;
    state.monsters = raw.monsters;
    state.fetchedAt = raw.fetchedAt;
    rebuildIndex();
    return true;
  }

  function rebuildIndex() {
    const index = new Map();
    (state.monsters || []).forEach((monster) => {
      if (!monster?.name) return;
      index.set(String(monster.name).toLowerCase(), monster);
    });
    state.monstersByKey = index;
  }

  async function fetchLibrary({ force = false } = {}) {
    if (!force && state.monsters && Date.now() - state.fetchedAt < Math.max(60000, Number(config.cacheTtlMs) || 1800000)) {
      return state.monsters;
    }
    if (!force && loadCache()) return state.monsters;
    if (state.inFlightPromise) return state.inFlightPromise;

    state.inFlightPromise = (async () => {
      try {
        const headers = {
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        };
        try {
          if (window.location?.href) headers["Referer"] = window.location.href;
        } catch (error) {}
        const response = await fetch(config.libraryUrl, {
          credentials: "include",
          headers,
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${config.libraryUrl}`);
        const data = await response.json();
        if (!data || !Array.isArray(data.monsters)) {
          throw new Error("library response missing monsters array");
        }
        state.monsters = data.monsters;
        state.fetchedAt = Date.now();
        state.lastError = null;
        rebuildIndex();
        try { bot.storage.set(cacheStorageKey, { monsters: state.monsters, fetchedAt: state.fetchedAt }); } catch (error) {}
        bot.log("fight estimator: library loaded", { count: state.monsters.length });
        return state.monsters;
      } catch (error) {
        state.lastError = error?.message || String(error);
        bot.log("fight estimator: library fetch failed", { error: state.lastError });
        throw error;
      } finally {
        state.inFlightPromise = null;
      }
    })();

    return state.inFlightPromise;
  }

  function findMonster(name) {
    if (!name) return null;
    const key = String(name).toLowerCase();
    if (state.monstersByKey) {
      const fromLibrary = state.monstersByKey.get(key);
      if (fromLibrary) return { ...fromLibrary, __source: "library" };
    }
    const wikiEntry = state.wikiCache[key];
    if (wikiEntry?.monster) return { ...wikiEntry.monster, __source: "wiki" };
    return null;
  }

  function extractInfoboxBlock(wikitext) {
    if (!wikitext || typeof wikitext !== "string") return null;
    const match = wikitext.match(/\{\{\s*Infobox[_\s]+Creature/i);
    if (!match) return null;
    const start = match.index;
    let depth = 0;
    for (let i = start; i < wikitext.length - 1; i += 1) {
      if (wikitext[i] === "{" && wikitext[i + 1] === "{") { depth += 1; i += 1; continue; }
      if (wikitext[i] === "}" && wikitext[i + 1] === "}") {
        depth -= 1;
        if (depth === 0) return wikitext.slice(start, i + 2);
        i += 1;
      }
    }
    return null;
  }

  function parseInfoboxParams(block) {
    if (!block) return {};
    const inside = block.replace(/^\{\{[^|]*\|/, "").replace(/\}\}\s*$/, "");
    const params = {};
    let depth = 0;
    let buf = "";
    for (let i = 0; i < inside.length; i += 1) {
      const ch = inside[i];
      const next = inside[i + 1];
      if (ch === "{" && next === "{") { depth += 1; buf += "{{"; i += 1; continue; }
      if (ch === "}" && next === "}") { depth -= 1; buf += "}}"; i += 1; continue; }
      if (ch === "[" && next === "[") { depth += 1; buf += "[["; i += 1; continue; }
      if (ch === "]" && next === "]") { depth -= 1; buf += "]]"; i += 1; continue; }
      if (ch === "|" && depth === 0) {
        absorbParam(buf, params);
        buf = "";
        continue;
      }
      buf += ch;
    }
    absorbParam(buf, params);
    return params;
  }

  function absorbParam(chunk, target) {
    const equalsIndex = chunk.indexOf("=");
    if (equalsIndex < 0) return;
    const key = chunk.slice(0, equalsIndex).trim().toLowerCase();
    const value = chunk.slice(equalsIndex + 1).trim();
    if (key) target[key] = value;
  }

  function stripWikilinks(text) {
    return String(text || "")
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/'''?/g, "")
      .trim();
  }

  function parseWikiAttacks(rawAbilities) {
    if (!rawAbilities) return [];
    const out = [];
    const text = String(rawAbilities);
    const attackRegex = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*(?:\(([^)]*)\))?/g;
    let m;
    while ((m = attackRegex.exec(text)) !== null) {
      const name = stripWikilinks(m[1]);
      const inside = (m[2] || "").trim();
      const rangeMatch = inside.match(/(\d+)\s*-\s*(\d+)/);
      const min = rangeMatch ? Number(rangeMatch[1]) : null;
      const max = rangeMatch ? Number(rangeMatch[2]) : null;
      const elementMatch = inside.match(/\b(physical|fire|energy|earth|ice|holy|death|drown|life ?drain|mana ?drain)\b/i);
      out.push({
        name,
        min,
        max,
        element: elementMatch ? elementMatch[1].toLowerCase().replace(/\s+/g, "") : null,
      });
    }
    return out;
  }

  function parseWikiImmunities(rawImm) {
    if (!rawImm) return {};
    const text = stripWikilinks(rawImm).toLowerCase();
    const elements = ["physical", "fire", "energy", "earth", "ice", "holy", "death", "drown", "lifedrain", "manadrain", "invisible", "paralyze"];
    const out = {};
    elements.forEach((el) => {
      if (text.includes(el)) out[el] = true;
    });
    return out;
  }

  function parseWikiMonsterFromWikitext(wikitext, name) {
    const block = extractInfoboxBlock(wikitext);
    if (!block) return null;
    const params = parseInfoboxParams(block);
    const hp = Number(params.hp || params.hitpoints || params.health);
    const exp = Number(params.exp || params.experience || params.xp);
    const armor = Number(params.armor || params.armour);
    const speed = Number(params.speed);
    const attacks = parseWikiAttacks(params.abilities || params.attacks || params.skills);
    const immunities = parseWikiImmunities(params.immune || params.immunities || params.immuneto);

    return {
      name: String(name).trim(),
      health: Number.isFinite(hp) ? hp : null,
      experience: Number.isFinite(exp) ? exp : null,
      armor: Number.isFinite(armor) ? armor : 0,
      speed: Number.isFinite(speed) ? speed : 0,
      attacks,
      immunities,
      loot: [],
    };
  }

  async function fetchWikiMonster(name, { force = false } = {}) {
    if (!config.enableWikiFallback) return null;
    const key = String(name || "").trim().toLowerCase();
    if (!key) return null;

    if (!force) {
      const cached = state.wikiCache[key];
      const cutoff = Date.now() - Math.max(60000, Number(config.wikiCacheTtlMs) || 1);
      if (cached && cached.fetchedAt > cutoff && cached.monster) {
        return cached.monster;
      }
    }

    if (state.wikiInFlight.has(key)) return state.wikiInFlight.get(key);

    const promise = (async () => {
      const titles = [name, name.replace(/\s+/g, "_")];
      let monster = null;
      for (const title of titles) {
        const url =
          String(config.wikiBaseUrl).replace(/\/$/, "") +
          "/api.php?action=parse&prop=wikitext&redirects=1&format=json&origin=*&page=" +
          encodeURIComponent(title);
        try {
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) continue;
          const data = await response.json();
          const wikitext = data?.parse?.wikitext?.["*"];
          if (!wikitext) continue;
          const parsed = parseWikiMonsterFromWikitext(wikitext, data?.parse?.title || name);
          if (parsed && parsed.health) {
            monster = parsed;
            break;
          }
        } catch (error) {
          bot.log("fight estimator: wiki fetch failed", { title, error: error?.message || error });
        }
      }

      if (monster) {
        state.wikiCache[key] = { monster, fetchedAt: Date.now() };
        persistWikiCache();
      }
      return monster;
    })();

    state.wikiInFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      state.wikiInFlight.delete(key);
    }
  }

  async function ensureMonster(name) {
    let found = findMonster(name);
    if (found) return found;
    const wiki = await fetchWikiMonster(name);
    return wiki ? { ...wiki, __source: "wiki" } : null;
  }

  function searchMonsters(query, limit = 12) {
    if (!state.monsters) return [];
    const q = String(query || "").trim().toLowerCase();
    if (!q) {
      return state.monsters
        .slice()
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
        .slice(0, limit);
    }
    const matches = [];
    for (const monster of state.monsters) {
      const name = String(monster.name || "");
      if (!name) continue;
      const lower = name.toLowerCase();
      if (lower.startsWith(q)) {
        matches.push({ monster, score: 0, name });
      } else if (lower.includes(q)) {
        matches.push({ monster, score: 1, name });
      }
      if (matches.length >= limit * 4) break;
    }
    matches.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
    return matches.slice(0, limit).map((m) => m.monster);
  }

  function avgAttackDamage(attack) {
    if (!attack || typeof attack !== "object") return 0;
    const candidates = [
      [attack.min, attack.max],
      [attack.minDamage, attack.maxDamage],
      [attack.damageMin, attack.damageMax],
      [attack.dmgMin, attack.dmgMax],
    ];
    for (const [min, max] of candidates) {
      if (Number.isFinite(Number(min)) && Number.isFinite(Number(max))) {
        return (Math.abs(Number(min)) + Math.abs(Number(max))) / 2;
      }
    }
    const flat = [attack.damage, attack.value, attack.avg, attack.average];
    for (const v of flat) {
      if (Number.isFinite(Number(v))) return Math.abs(Number(v));
    }
    return 0;
  }

  function attackInterval(attack) {
    const cd = Number(attack?.cooldown ?? attack?.interval ?? attack?.cd ?? attack?.delay);
    if (Number.isFinite(cd) && cd > 0) {
      return cd >= 100 ? cd / 1000 : cd;
    }
    return 2;
  }

  function getAttackElement(attack) {
    const raw = String(attack?.element || attack?.type || attack?.damageType || attack?.school || "")
      .trim()
      .toLowerCase();
    return raw || null;
  }

  function isImmune(monster, element) {
    if (!element || !monster?.immunities) return false;
    const imm = monster.immunities;
    if (Array.isArray(imm)) return imm.map((e) => String(e).toLowerCase()).includes(element);
    if (typeof imm === "object") return !!imm[element];
    return false;
  }

  function damagePerSecond(attacker, defender) {
    const attacks = Array.isArray(attacker?.attacks) ? attacker.attacks : [];
    if (!attacks.length) {
      const hp = Number(attacker?.health) || 0;
      const exp = Number(attacker?.experience) || 0;
      return Math.max(0, Math.round((hp + exp * 3) / 200));
    }
    let total = 0;
    for (const atk of attacks) {
      const element = getAttackElement(atk);
      if (element && isImmune(defender, element)) continue;
      const avg = avgAttackDamage(atk);
      if (avg <= 0) continue;
      const armor = Number(defender?.armor) || 0;
      const mitigated = Math.max(0, avg - armor * 0.5);
      const interval = attackInterval(atk);
      total += mitigated / interval;
    }
    return total;
  }

  function simulate(nameA, nameB) {
    const a = findMonster(nameA);
    const b = findMonster(nameB);
    if (!a || !b) {
      return { error: !a ? `Unknown monster (try the Fight! button to check Tibia wiki too): ${nameA}` : `Unknown monster (try the Fight! button to check Tibia wiki too): ${nameB}` };
    }
    return simulateFromObjects(a, b);
  }

  function listImmunities(monster) {
    const imm = monster?.immunities;
    if (!imm) return [];
    if (Array.isArray(imm)) return imm.map(String);
    if (typeof imm === "object") {
      return Object.keys(imm).filter((k) => imm[k]);
    }
    return [];
  }

  function snapshot(monster, dps, ttk) {
    return {
      name: monster.name,
      health: monster.health,
      armor: monster.armor || 0,
      speed: monster.speed || 0,
      experience: monster.experience || 0,
      attackCount: Array.isArray(monster.attacks) ? monster.attacks.length : 0,
      immunities: listImmunities(monster),
      dps: Number(dps.toFixed(1)),
      ttkOpponentSec: Number.isFinite(ttk) ? Number(ttk.toFixed(1)) : null,
      source: monster.__source || "library",
    };
  }

  async function simulateAsync(nameA, nameB) {
    const [a, b] = await Promise.all([ensureMonster(nameA), ensureMonster(nameB)]);
    if (!a) return { error: `Unknown monster (not in Minibia library or Tibia wiki): ${nameA}` };
    if (!b) return { error: `Unknown monster (not in Minibia library or Tibia wiki): ${nameB}` };
    return simulateFromObjects(a, b);
  }

  function simulateFromObjects(a, b) {
    const dpsAB = damagePerSecond(a, b);
    const dpsBA = damagePerSecond(b, a);
    const hpA = Math.max(1, Number(a.health) || 1);
    const hpB = Math.max(1, Number(b.health) || 1);
    const ttkAB = dpsAB > 0 ? hpB / dpsAB : Number.POSITIVE_INFINITY;
    const ttkBA = dpsBA > 0 ? hpA / dpsBA : Number.POSITIVE_INFINITY;

    let winner;
    let winnerName;
    let loserName;
    let hpRemaining = 0;
    const reasons = [];

    if (!Number.isFinite(ttkAB) && !Number.isFinite(ttkBA)) {
      winner = "draw";
      reasons.push("Neither can damage the other (mutual immunity or zero attacks in the dataset).");
    } else if (ttkAB < ttkBA) {
      winner = "a"; winnerName = a.name; loserName = b.name;
      hpRemaining = Math.max(0, hpA - dpsBA * ttkAB);
      reasons.push(`${a.name} kills ${b.name} in ~${ttkAB.toFixed(1)}s; ${b.name} would have needed ~${Number.isFinite(ttkBA) ? ttkBA.toFixed(1) + "s" : "infinity"}.`);
    } else if (ttkBA < ttkAB) {
      winner = "b"; winnerName = b.name; loserName = a.name;
      hpRemaining = Math.max(0, hpB - dpsAB * ttkBA);
      reasons.push(`${b.name} kills ${a.name} in ~${ttkBA.toFixed(1)}s; ${a.name} would have needed ~${Number.isFinite(ttkAB) ? ttkAB.toFixed(1) + "s" : "infinity"}.`);
    } else {
      winner = "draw";
      reasons.push("Both reach 0 HP at the same time.");
    }

    if (a.armor || b.armor) {
      reasons.push(`Armor reduces incoming damage (${a.name}: ${a.armor || 0}, ${b.name}: ${b.armor || 0}).`);
    }
    const aImmList = listImmunities(a);
    const bImmList = listImmunities(b);
    if (aImmList.length) reasons.push(`${a.name} immune to: ${aImmList.join(", ")}.`);
    if (bImmList.length) reasons.push(`${b.name} immune to: ${bImmList.join(", ")}.`);

    if (a.__source === "wiki" || b.__source === "wiki") {
      reasons.push("Stats sourced from Tibia wiki where Minibia's library didn't have the creature; expect canonical Tibia numbers, not Minibia-tuned ones.");
    }

    return {
      a: snapshot(a, dpsAB, ttkAB),
      b: snapshot(b, dpsBA, ttkBA),
      winner,
      winnerName,
      loserName,
      hpRemaining: Math.round(hpRemaining),
      confidence: computeConfidence(ttkAB, ttkBA),
      reasons,
    };
  }

  function computeConfidence(ttkA, ttkB) {
    if (!Number.isFinite(ttkA) && !Number.isFinite(ttkB)) return "n/a";
    if (!Number.isFinite(ttkA)) return "decisive";
    if (!Number.isFinite(ttkB)) return "decisive";
    const ratio = Math.min(ttkA, ttkB) / Math.max(ttkA, ttkB);
    if (ratio < 0.5) return "decisive";
    if (ratio < 0.8) return "likely";
    if (ratio < 0.95) return "edge";
    return "coin flip";
  }

  function status() {
    return {
      monsterCount: state.monsters?.length || 0,
      fetchedAt: state.fetchedAt,
      lastError: state.lastError,
      cacheTtlMs: config.cacheTtlMs,
    };
  }

  function clearCache() {
    state.monsters = null;
    state.monstersByKey = null;
    state.fetchedAt = 0;
    try { bot.storage.remove(cacheStorageKey); } catch (error) {}
    return true;
  }

  loadCache();
  loadWikiCache();

  bot.fightEstimator = {
    fetchLibrary,
    findMonster,
    searchMonsters,
    simulate,
    simulateAsync,
    fetchWikiMonster,
    ensureMonster,
    status,
    clearCache,
    config,
  };
};
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installLootbagModule = function installLootbagModule(bot) {
  const configStorageKey = "minibiaCopilot.lootbag.config";

  const state = {
    running: false,
    timerId: null,
    lastDropAt: 0,
    lastDroppedName: null,
    droppedSinceStart: 0,
  };

  const config = Object.assign(
    {
      enabled: false,
      tickMs: 1500,
      dropCooldownMs: 350,
      maxDropsPerTick: 4,
      items: [],
    },
    bot.storage.get(configStorageKey, {})
  );

  if (!Array.isArray(config.items)) config.items = [];

  function persistConfig() {
    bot.storage.set(configStorageKey, { ...config });
  }

  function normalizeItemName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function getEquipment() {
    return window.gameClient?.player?.equipment || null;
  }

  function getOpenContainers() {
    return Array.from(window.gameClient?.player?.__openedContainers || []);
  }

  function getItemDefinition(item) {
    if (!item) return null;
    const gc = window.gameClient;
    return (
      gc?.itemDefinitionsByCid?.[item.id] ||
      gc?.itemDefinitionsBySid?.[item.sid] ||
      gc?.itemDefinitions?.[item.id] ||
      null
    );
  }

  function getItemName(item) {
    const def = getItemDefinition(item);
    return String(def?.properties?.name || item?.name || "").trim();
  }

  function isMatchingLootItem(item) {
    if (!item) return false;
    const itemName = normalizeItemName(getItemName(item));
    if (!itemName) return false;
    const list = Array.isArray(config.items) ? config.items : [];
    for (const wanted of list) {
      const normalized = normalizeItemName(wanted);
      if (!normalized) continue;
      if (itemName === normalized) return true;
      if (itemName.startsWith(normalized + " ")) return true;
    }
    return false;
  }

  function getPlayerTile() {
    const player = window.gameClient?.player;
    if (!player) return null;
    const position = player.getPosition?.();
    if (!position) return null;
    if (typeof Position !== "function") return null;
    const tile = window.gameClient?.world?.getTileFromWorldPosition?.(
      new Position(position.x, position.y, position.z)
    );
    return tile || null;
  }

  function findMatchingItems(limit) {
    const out = [];
    const containers = getOpenContainers();
    for (const container of containers) {
      if (!container?.slots) continue;
      const slots = container.slots;
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const item = container.getSlotItem?.(slotIndex);
        if (!item) continue;
        if (!isMatchingLootItem(item)) continue;
        out.push({ container, slotIndex, item });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  function dropItem(entry, tile, now = Date.now()) {
    if (!entry || !tile) return false;
    if (typeof ItemMovePacket !== "function") {
      bot.log("lootbag: ItemMovePacket unavailable");
      return false;
    }
    const item = entry.item;
    const count = (typeof item.getCount === "function" ? item.getCount() : item.count) || 1;
    const from = { which: entry.container, index: entry.slotIndex };
    const to = { which: tile, index: 0xFF };

    try {
      window.gameClient.send(new ItemMovePacket(from, to, count));
    } catch (error) {
      bot.log("lootbag: drop failed", { name: getItemName(item), error: error?.message || error });
      return false;
    }

    state.lastDropAt = now;
    state.lastDroppedName = getItemName(item);
    state.droppedSinceStart += 1;
    bot.log("lootbag: dropped item", {
      name: state.lastDroppedName,
      count,
      slot: entry.slotIndex,
    });
    return true;
  }

  function tick() {
    if (!state.running) return;

    try {
      if (!Array.isArray(config.items) || !config.items.length) return;

      const now = Date.now();
      if (now - state.lastDropAt < Math.max(0, Number(config.dropCooldownMs) || 0)) return;

      const player = window.gameClient?.player;
      if (!player) return;
      if (player.isInProtectionZone?.()) return;

      const tile = getPlayerTile();
      if (!tile) return;

      const maxDrops = Math.max(1, Math.min(8, Math.trunc(Number(config.maxDropsPerTick) || 4)));
      const candidates = findMatchingItems(maxDrops);
      if (!candidates.length) return;

      for (const candidate of candidates) {
        const dropped = dropItem(candidate, tile, Date.now());
        if (!dropped) break;
      }
    } catch (error) {
      bot.log("lootbag tick failed", error?.message || error);
    }
  }

  function start(overrides = {}) {
    Object.assign(config, overrides);
    config.enabled = true;
    persistConfig();
    if (state.running) {
      bot.log("lootbag already running");
      return false;
    }
    state.running = true;
    state.droppedSinceStart = 0;
    const interval = Math.max(500, Math.min(15000, Number(config.tickMs) || 1500));
    state.timerId = window.setInterval(tick, interval);
    bot.log("lootbag started", { interval, items: config.items.length });
    return true;
  }

  function stop(options = {}) {
    const persistEnabled = options.persistEnabled !== false;
    state.running = false;
    if (state.timerId != null) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
    if (persistEnabled) {
      config.enabled = false;
      persistConfig();
    }
    bot.log("lootbag stopped");
    return true;
  }

  function addItem(name, index) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return false;
    const key = trimmed.toLowerCase();
    const list = Array.isArray(config.items) ? config.items.slice() : [];
    if (list.some((existing) => existing.toLowerCase() === key)) return false;
    if (Number.isFinite(Number(index))) {
      const at = Math.max(0, Math.min(list.length, Math.trunc(Number(index))));
      list.splice(at, 0, trimmed);
    } else {
      list.push(trimmed);
    }
    updateConfig({ items: list });
    return true;
  }

  function removeItem(name) {
    const key = String(name || "").trim().toLowerCase();
    if (!key) return false;
    const list = Array.isArray(config.items) ? config.items : [];
    const next = list.filter((existing) => existing.toLowerCase() !== key);
    if (next.length === list.length) return false;
    updateConfig({ items: next });
    return true;
  }

  function getItems() {
    return Array.isArray(config.items) ? config.items.slice() : [];
  }

  function status() {
    return {
      running: state.running,
      config: { ...config },
      itemCount: config.items?.length || 0,
      lastDropAt: state.lastDropAt,
      lastDroppedName: state.lastDroppedName,
      droppedSinceStart: state.droppedSinceStart,
    };
  }

  function updateConfig(nextConfig = {}) {
    if (Object.prototype.hasOwnProperty.call(nextConfig, "items")) {
      const list = Array.isArray(nextConfig.items) ? nextConfig.items : [];
      const seen = new Set();
      nextConfig.items = [];
      list.forEach((name) => {
        const trimmed = String(name || "").trim();
        const key = trimmed.toLowerCase();
        if (trimmed && !seen.has(key)) {
          seen.add(key);
          nextConfig.items.push(trimmed);
        }
      });
    }
    if (Object.prototype.hasOwnProperty.call(nextConfig, "tickMs")) {
      nextConfig.tickMs = Math.max(500, Math.min(15000, Math.trunc(Number(nextConfig.tickMs) || config.tickMs || 1500)));
    }
    if (Object.prototype.hasOwnProperty.call(nextConfig, "maxDropsPerTick")) {
      nextConfig.maxDropsPerTick = Math.max(1, Math.min(8, Math.trunc(Number(nextConfig.maxDropsPerTick) || config.maxDropsPerTick || 4)));
    }

    Object.assign(config, nextConfig);
    persistConfig();

    if (state.running && Object.prototype.hasOwnProperty.call(nextConfig, "tickMs")) {
      if (state.timerId != null) {
        window.clearInterval(state.timerId);
      }
      state.timerId = window.setInterval(tick, config.tickMs);
    }

    bot.log("lootbag config updated", { items: config.items.length, tickMs: config.tickMs });
    return { ...config };
  }

  function dropNow() {
    const wasRunning = state.running;
    state.running = true;
    try { tick(); } finally { state.running = wasRunning; }
  }

  bot.addCleanup(() => {
    if (state.timerId != null) {
      window.clearInterval(state.timerId);
      state.timerId = null;
    }
  });

  if (config.enabled) start();

  bot.lootbag = {
    start,
    stop,
    status,
    updateConfig,
    addItem,
    removeItem,
    getItems,
    dropNow,
    config,
  };
};
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installPanel = function installPanel(bot) {
  const panelPositionKey = "minibiaCopilot.ui.panelPosition";
  const panelCollapsedKey = "minibiaCopilot.ui.panelCollapsed";

  function destroy() {
    document.getElementById("minibia-copilot-panel")?.remove();
    document.getElementById("minibia-copilot-style")?.remove();
  }

  function savePanelPosition(position, key = panelPositionKey) {
    bot.storage.set(key, position);
  }

  function getSavedPanelPosition(key = panelPositionKey) {
    return bot.storage.get(key, null);
  }

  function savePanelCollapsed(collapsed) {
    bot.storage.set(panelCollapsedKey, !!collapsed);
  }

  function getSavedPanelCollapsed() {
    return !!bot.storage.get(panelCollapsedKey, false);
  }

  function refreshHomeLabel() {
    const homeLabel = document.getElementById("minibia-copilot-home");
    if (!homeLabel) return;

    const home = bot.pz?.getHomePz?.();
    homeLabel.textContent = home
      ? `Panic Runner Home: ${home.x}, ${home.y}, ${home.z}`
      : "Panic Runner Home: not set";
  }

  function refreshPanicStatus() {
    const unknownToggle = document.getElementById("minibia-copilot-panic-unknown");
    const healthToggle = document.getElementById("minibia-copilot-panic-health");
    const returnToggle = document.getElementById("minibia-copilot-panic-return");
    const status = bot.panic?.status?.();

    if (unknownToggle) {
      unknownToggle.checked = !!status?.config?.unknownPlayerEnabled;
    }

    if (healthToggle) {
      healthToggle.checked = !!status?.config?.healthLossEnabled;
    }

    if (returnToggle) {
      returnToggle.checked = !!status?.config?.returnToOriginEnabled;
    }
  }

  function refreshXrayStatus() {
    const status = bot.xray?.status?.();
    const me = bot.getPlayerPosition?.();
    const overlayButton = document.getElementById("minibia-copilot-xray-overlay-toggle");
    const overlayLabel = document.getElementById("minibia-copilot-xray-overlay-status");
    const floorSelect = document.getElementById("minibia-copilot-xray-floor-select");
    const formatFloorOffset = (floor) => {
      if (!me || floor == null) {
        return null;
      }

      const offset = me.z - floor;
      return offset === 0 ? "0" : offset > 0 ? `+${offset}` : `${offset}`;
    };

    if (overlayButton) {
      overlayButton.textContent = status?.config?.overlayEnabled ? "Disable Overlay" : "Enable Overlay";
    }

    if (overlayLabel) {
      const floorLabel = status?.config?.selectedFloor == null
        ? "all floors"
        : `${formatFloorOffset(status.config.selectedFloor) ?? "?"}`;
      overlayLabel.textContent = `${status?.config?.overlayEnabled ? "Overlay: on" : "Overlay: off"} • ${floorLabel}`;
    }

    if (floorSelect) {
      const floors = Array.from(
        new Set(
          (status?.visibleCreatures || [])
            .map((creature) => creature?.position?.z)
            .filter((floor) => floor != null)
        )
      ).sort((a, b) => a - b);
      const selectedFloor = status?.config?.selectedFloor;

      if (selectedFloor != null && !floors.includes(selectedFloor)) {
        floors.push(selectedFloor);
        floors.sort((a, b) => a - b);
      }

      floorSelect.innerHTML = "";

      const allOption = document.createElement("option");
      allOption.value = "all";
      allOption.textContent = "All floors";
      floorSelect.appendChild(allOption);

      floors.forEach((floor) => {
        const option = document.createElement("option");
        option.value = String(floor);
        const offsetLabel = formatFloorOffset(floor);
        option.textContent = offsetLabel == null
          ? String(floor)
          : offsetLabel;
        floorSelect.appendChild(option);
      });

      floorSelect.value = selectedFloor == null ? "all" : String(selectedFloor);
    }
  }

  function renderTrustedNames() {
    const list = document.getElementById("minibia-copilot-panic-trusted-list");
    if (!list) return;

    const trustedNames = bot.panic?.config?.trustedNames || [];
    list.innerHTML = "";

    if (!trustedNames.length) {
      const empty = document.createElement("div");
      empty.className = "mc-small-note";
      empty.textContent = "No trusted names saved.";
      list.appendChild(empty);
      return;
    }

    trustedNames.forEach((name, index) => {
      const row = document.createElement("div");
      row.className = "mc-list-row";

      const label = document.createElement("span");
      label.textContent = name;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "mc-small-button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        const nextNames = trustedNames.filter((_, currentIndex) => currentIndex !== index);
        bot.panic.updateConfig({ trustedNames: nextNames });
        renderTrustedNames();
      });

      row.appendChild(label);
      row.appendChild(removeButton);
      list.appendChild(row);
    });
  }

  function renderGameMasterNames() {
    const list = document.getElementById("minibia-copilot-panic-gm-list");
    if (!list) return;

    const gameMasterNames = bot.panic?.config?.gameMasterNames || [];
    list.innerHTML = "";

    if (!gameMasterNames.length) {
      const empty = document.createElement("div");
      empty.className = "mc-small-note";
      empty.textContent = "No game master names saved.";
      list.appendChild(empty);
      return;
    }

    gameMasterNames.forEach((name, index) => {
      const row = document.createElement("div");
      row.className = "mc-list-row";

      const label = document.createElement("span");
      label.textContent = name;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "mc-small-button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        const nextNames = gameMasterNames.filter((_, currentIndex) => currentIndex !== index);
        bot.panic.updateConfig({ gameMasterNames: nextNames });
        renderGameMasterNames();
      });

      row.appendChild(label);
      row.appendChild(removeButton);
      list.appendChild(row);
    });
  }

  function refreshRuneStatus() {
    const runeToggle = document.getElementById("minibia-copilot-rune-enabled");
    const running = !!bot.rune?.status?.().running;

    if (runeToggle) {
      runeToggle.checked = running;
    }
  }

  function refreshAutoEatStatus() {
    const autoEatToggle = document.getElementById("minibia-copilot-auto-eat-enabled");
    if (!autoEatToggle) return;

    autoEatToggle.checked = !!bot.eat?.status?.().running;
  }

  function refreshAutoHealStatus() {
    const autoHealToggle = document.getElementById("minibia-copilot-auto-heal-enabled");
    if (!autoHealToggle) return;

    autoHealToggle.checked = !!bot.heal?.status?.().running;
  }

  function refreshAutoInvisibleStatus() {
    const autoInvisibleToggle = document.getElementById("minibia-copilot-auto-invisible-enabled");
    if (!autoInvisibleToggle) return;

    autoInvisibleToggle.checked = !!bot.invisible?.status?.().running;
  }

  function refreshAutoMagicShieldStatus() {
    const autoMagicShieldToggle = document.getElementById("minibia-copilot-auto-magic-shield-enabled");
    if (!autoMagicShieldToggle) return;

    autoMagicShieldToggle.checked = !!bot.magicShield?.status?.().running;
  }

  function refreshAutoAttackStatus() {
    const autoAttackToggle = document.getElementById("minibia-copilot-auto-attack-enabled");
    if (!autoAttackToggle) return;

    autoAttackToggle.checked = !!bot.attack?.status?.().running;
  }

  function refreshCaveStatus() {
    const statusLabel = document.getElementById("minibia-copilot-cave-status");
    const startButton = document.getElementById("minibia-copilot-cave-start");
    const stopButton = document.getElementById("minibia-copilot-cave-stop");
    const route = bot.cave?.getRoute?.() || [];
    const status = bot.cave?.status?.();

    if (statusLabel) {
      if (!route.length) {
        statusLabel.textContent = "Status: no waypoints";
      } else if (status?.running) {
        const waypointNumber = (status.currentIndex ?? 0) + 1;
        const distanceLabel =
          Number.isFinite(status?.distanceToWaypoint) && status.distanceToWaypoint >= 0
            ? `, dist ${status.distanceToWaypoint}`
            : "";
        const pausedTag = status.userPaused ? " — PAUSED" : "";
        statusLabel.textContent = `Status: running (${waypointNumber}/${route.length}${distanceLabel})${pausedTag}`;
      } else {
        statusLabel.textContent = `Status: idle (${route.length} waypoint${route.length === 1 ? "" : "s"})`;
      }
    }

    if (startButton) {
      startButton.disabled = !route.length || !!status?.running;
    }

    if (stopButton) {
      stopButton.disabled = !status?.running;
    }
  }

  function refreshCavePresetControls() {
    const select = document.getElementById("minibia-copilot-cave-preset-select");
    const label = document.getElementById("minibia-copilot-cave-preset-status");
    const deleteButton = document.getElementById("minibia-copilot-cave-preset-delete");
    const status = bot.cave?.status?.();
    const presetNames = status?.presetNames || bot.cave?.getPresetNames?.() || [];
    const activePresetName = status?.activePresetName || bot.cave?.getActivePresetName?.() || "Default";

    if (select) {
      const previousValue = select.value;
      select.innerHTML = "";

      if (!presetNames.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No saved presets";
        select.appendChild(option);
        select.disabled = true;
      } else {
        presetNames.forEach((name) => {
          const option = document.createElement("option");
          option.value = name;
          option.textContent = name;
          select.appendChild(option);
        });
        select.disabled = false;
        const nextValue = presetNames.includes(activePresetName) ? activePresetName : previousValue;
        if (nextValue) {
          select.value = nextValue;
        }
      }
    }

    if (label) {
      label.textContent = presetNames.length
        ? `Preset: ${activePresetName} (${presetNames.length} saved)`
        : `Preset: ${activePresetName}`;
    }

    if (deleteButton) {
      deleteButton.disabled = !presetNames.length || !select?.value;
    }
  }

  function refreshCaveClosestStatus() {
    const label = document.getElementById("minibia-copilot-cave-closest");
    if (!label) return;

    const position = bot.getPlayerPosition?.();
    const route = bot.cave?.getRoute?.() || [];

    if (!position) {
      label.textContent = "Closest start: current position unavailable";
      return;
    }

    if (!route.length) {
      label.textContent = "Closest start: no waypoints";
      return;
    }

    const closestIndex = bot.cave?.findClosestWaypointIndex?.(position) ?? 0;
    const waypoint = route[closestIndex];

    if (!waypoint) {
      label.textContent = "Closest start: unavailable";
      return;
    }

    label.textContent = `Closest start: ${closestIndex + 1}. ${waypoint.x}, ${waypoint.y}, ${waypoint.z}`;
  }

  function refreshCaveTransitionStatus() {
    const label = document.getElementById("minibia-copilot-cave-transition-status");
    if (!label) return;

    const transitions = bot.cave?.getTransitions?.() || [];
    if (!transitions.length) {
      label.textContent = "Transitions learned: none";
      return;
    }

    const latest = transitions
      .slice()
      .sort((a, b) => Number(b?.lastSeenAt || 0) - Number(a?.lastSeenAt || 0))[0];

    if (!latest?.from || !latest?.to) {
      label.textContent = `Transitions learned: ${transitions.length}`;
      return;
    }

    const extra = transitions.length > 1 ? ` (+${transitions.length - 1} more)` : "";
    label.textContent =
      `Transitions learned: ${latest.from.x}, ${latest.from.y}, ${latest.from.z} -> ` +
      `${latest.to.x}, ${latest.to.y}, ${latest.to.z}${extra}`;
  }

  function refreshEquipRingStatus() {
    const equipRingToggle = document.getElementById("minibia-copilot-equip-ring-enabled");
    if (!equipRingToggle) return;

    equipRingToggle.checked = !!bot.equipRing?.status?.().running;
  }

  const tabStorageKey = "minibiaCopilot.ui.activeTab";
  const defaultTab = "status";
  const moduleSummaryDefs = [
    { key: "heal",        label: "Heal",   getRunning: () => !!bot.heal?.status?.().running },
    { key: "attack",      label: "Attack", getRunning: () => !!bot.attack?.status?.().running },
    { key: "rune",        label: "Rune",   getRunning: () => !!bot.rune?.status?.().running },
    { key: "eat",         label: "Eat",    getRunning: () => !!bot.eat?.status?.().running },
    { key: "invisible",   label: "Invis",  getRunning: () => !!bot.invisible?.status?.().running },
    { key: "shield",      label: "Shield", getRunning: () => !!bot.magicShield?.status?.().running },
    { key: "ring",        label: "Ring",   getRunning: () => !!bot.equipRing?.status?.().running },
    { key: "amulet",      label: "Amulet", getRunning: () => !!bot.equipAmulet?.status?.().running },
    { key: "cave",        label: "Cave",   getRunning: () => !!bot.cave?.status?.().running },
    { key: "talk",        label: "Talk",   getRunning: () => !!bot.talk?.status?.().running },
    { key: "mw",          label: "MW",     getRunning: () => !!bot.magicWall?.status?.().running },
    { key: "hunt",        label: "Hunt",   getRunning: () => !!bot.hunt?.status?.().lastInfo?.active },
  ];

  function activateTab(name) {
    const panel = document.getElementById("minibia-copilot-panel");
    if (!panel) return;
    const buttons = panel.querySelectorAll(".mc-tab-button");
    const panes = panel.querySelectorAll(".mc-tab-pane");
    let matched = false;
    buttons.forEach((button) => {
      const isActive = button.dataset.tab === name;
      button.dataset.active = isActive ? "true" : "false";
      if (isActive) matched = true;
    });
    panes.forEach((pane) => {
      pane.hidden = pane.dataset.tab !== name;
    });
    if (!matched) return;
    try { bot.storage.set(tabStorageKey, name); } catch (error) {}
  }

  function refreshPlayerSnapshot() {
    const snapshot = bot.getPlayerSnapshot?.();
    const hpEl = document.getElementById("minibia-copilot-snapshot-hp");
    const manaEl = document.getElementById("minibia-copilot-snapshot-mana");
    const levelEl = document.getElementById("minibia-copilot-snapshot-level");
    if (hpEl) {
      const cur = snapshot?.health;
      const max = snapshot?.maxHealth;
      hpEl.textContent = cur != null && max != null ? `${cur}/${max}` : (cur != null ? String(cur) : "—");
    }
    if (manaEl) {
      const cur = snapshot?.mana;
      const max = snapshot?.maxMana;
      manaEl.textContent = cur != null && max != null ? `${cur}/${max}` : (cur != null ? String(cur) : "—");
    }
    if (levelEl) {
      levelEl.textContent = snapshot?.level != null ? String(snapshot.level) : "—";
    }
  }

  function refreshStatusPillbar() {
    // Pillbar replaced by hero image. Kept as no-op so existing callers
    // (initial render + 1s snapshot timer) don't need rewiring.
  }

  function formatNumber(value) {
    if (value == null || !Number.isFinite(Number(value))) return "—";
    const n = Number(value);
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(2) + "M";
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(Math.round(n));
  }

  function formatElapsed(ms) {
    const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
    return `${s}s`;
  }

  function refreshHuntStatus() {
    const status = bot.hunt?.status?.();
    const info = status?.lastInfo;
    const statusLabel = document.getElementById("minibia-copilot-hunt-status");
    const stats = document.getElementById("minibia-copilot-hunt-stats");
    const topMonster = document.getElementById("minibia-copilot-hunt-top-monster");
    const topLoot = document.getElementById("minibia-copilot-hunt-top-loot");
    const autoPoll = document.getElementById("minibia-copilot-hunt-autopoll");

    if (autoPoll && document.activeElement !== autoPoll) {
      autoPoll.checked = !!status?.config?.autoPoll;
    }

    if (statusLabel) {
      if (!info) {
        statusLabel.textContent = "Status: no data (click Refresh)";
      } else if (!info.active) {
        statusLabel.textContent = "Status: no active session (click Start)";
      } else if (info.paused) {
        statusLabel.textContent = `Status: paused (${formatElapsed(info.elapsedMs)})`;
      } else {
        statusLabel.textContent = `Status: running (${formatElapsed(info.elapsedMs)})`;
      }
    }

    if (stats) {
      const shouldShow = !!info?.active;
      stats.hidden = !shouldShow;
      if (shouldShow) {
        stats.querySelector('[data-key="elapsed"]').textContent = formatElapsed(info.elapsedMs);
        stats.querySelector('[data-key="xpPerHour"]').textContent = formatNumber(info.xpPerHour);
        stats.querySelector('[data-key="goldPerHour"]').textContent = formatNumber(info.goldPerHour);
        stats.querySelector('[data-key="killsPerHour"]').textContent = formatNumber(info.killsPerHour);
        stats.querySelector('[data-key="xp"]').textContent = formatNumber(info.xp);
        stats.querySelector('[data-key="gold"]').textContent = formatNumber(info.gold);
      }
    }

    if (topMonster) {
      const monsters = Array.isArray(info?.monsters) ? info.monsters.slice().sort((a, b) => (b.count || 0) - (a.count || 0)) : [];
      if (!monsters.length) {
        topMonster.textContent = "Top kill: —";
      } else {
        const top3 = monsters.slice(0, 3).map((m) => `${m.name} ${formatNumber(m.count)}`).join(", ");
        topMonster.textContent = `Top kills: ${top3}`;
      }
    }

    if (topLoot) {
      const loot = Array.isArray(info?.loot) ? info.loot.slice().sort((a, b) => (b.count || 0) - (a.count || 0)) : [];
      if (!loot.length) {
        topLoot.textContent = "Top loot: —";
      } else {
        const top3 = loot.slice(0, 3).map((l) => `${l.name} ${formatNumber(l.count)}`).join(", ");
        topLoot.textContent = `Top loot: ${top3}`;
      }
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatRelativeTime(ms) {
    const diff = Math.max(0, Date.now() - ms);
    if (diff < 60000) return Math.round(diff / 1000) + "s ago";
    if (diff < 3600000) return Math.round(diff / 60000) + "m ago";
    return Math.round(diff / 3600000) + "h ago";
  }

  const trackerSubtabStorageKey = "minibiaCopilot.ui.trackerSubtab";
  let activeTrackerSubtab = String(bot.storage.get(trackerSubtabStorageKey, "enemy") || "enemy");
  if (activeTrackerSubtab !== "enemy" && activeTrackerSubtab !== "friendly") {
    activeTrackerSubtab = "enemy";
  }

  function setTrackerSubtab(name) {
    const next = name === "friendly" ? "friendly" : "enemy";
    if (next === activeTrackerSubtab) return;
    activeTrackerSubtab = next;
    try { bot.storage.set(trackerSubtabStorageKey, next); } catch (error) {}
    refreshTrackerStatus();
  }

  function refreshTrackerStatus() {
    const status = bot.tracker?.status?.();
    if (!status) return;

    const enabledInput = document.getElementById("minibia-copilot-tracker-enabled");
    const intervalInput = document.getElementById("minibia-copilot-tracker-interval");
    const statusLabel = document.getElementById("minibia-copilot-tracker-status");
    const list = document.getElementById("minibia-copilot-tracker-list");
    const listLabel = document.getElementById("minibia-copilot-tracker-list-label");
    const deathsLabel = document.getElementById("minibia-copilot-tracker-deaths-label");
    const deathsList = document.getElementById("minibia-copilot-tracker-deaths");
    const subtabsHost = document.getElementById("minibia-copilot-tracker-subtabs");

    if (subtabsHost) {
      subtabsHost.querySelectorAll(".mc-subtab-button").forEach((button) => {
        button.dataset.active = (button.dataset.subtab === activeTrackerSubtab) ? "true" : "false";
      });
    }

    if (enabledInput && document.activeElement !== enabledInput) {
      enabledInput.checked = !!status.running;
    }
    if (intervalInput && document.activeElement !== intervalInput) {
      intervalInput.value = String(Math.round((Number(status.config?.pollIntervalMs) || 120000) / 1000));
    }
    if (statusLabel) {
      if (status.lastError) {
        statusLabel.textContent = "Status: error — " + String(status.lastError).slice(0, 80);
      } else if (status.pollInFlight) {
        statusLabel.textContent = "Status: fetching…";
      } else if (status.running) {
        const seen = status.onlineCount ? `${status.onlineCount} online site-wide` : "no online data yet";
        const lastAt = status.lastPollAt ? formatRelativeTime(status.lastPollAt) : "never";
        statusLabel.textContent = `Status: running (${seen}, last ${lastAt})`;
      } else {
        statusLabel.textContent = "Status: idle";
      }
    }

    const isEnemyTab = activeTrackerSubtab === "enemy";
    const sectionDetails = isEnemyTab ? (status.enemyDetails || []) : (status.friendlyDetails || []);
    const sectionDeaths = isEnemyTab ? (status.enemyDeaths || []) : (status.friendlyDeaths || []);
    const oppositeCategoryLabel = isEnemyTab ? "Friendly" : "Enemy";

    if (listLabel) {
      listLabel.textContent = isEnemyTab ? "Tracked Enemies" : "Tracked Friendlies";
    }
    if (deathsLabel) {
      deathsLabel.textContent = isEnemyTab
        ? "Recent Enemy Deaths (last 30 min)"
        : "Recent Friendly Deaths (last 30 min)";
    }

    if (list) {
      if (!sectionDetails.length) {
        list.innerHTML = `<div class="mc-small-note">No ${isEnemyTab ? "enemies" : "friendlies"} tracked yet. Add a name above.</div>`;
      } else {
        list.innerHTML = sectionDetails.map((player) => {
          const name = player.name;
          const online = status.online.includes(name);
          const levelPart = player.level != null ? `lvl ${escapeHtml(player.level)}` : "";
          const vocationPart = player.vocation ? escapeHtml(player.vocation) : "";
          const metaParts = [levelPart, vocationPart].filter(Boolean);
          const metaText = metaParts.length ? `<span class="mc-tracked-meta">${metaParts.join(" · ")}</span>` : "";
          return (
            `<div class="mc-tracked-row" data-name="${escapeHtml(name)}">` +
              `<span class="mc-tracked-name">` +
                `<span class="mc-tracked-dot" data-online="${online ? "true" : "false"}"></span>` +
                `<span class="mc-tracked-name-text">` +
                  `<span>${escapeHtml(name)}</span>` +
                  metaText +
                `</span>` +
              `</span>` +
              `<span class="mc-tracked-actions">` +
                `<button type="button" class="mc-small-button" data-tracker-swap="${escapeHtml(name)}" title="Move to ${oppositeCategoryLabel}">⇄</button>` +
                `<button type="button" class="mc-small-button" data-tracker-remove="${escapeHtml(name)}" title="Remove">✕</button>` +
              `</span>` +
            `</div>`
          );
        }).join("");
      }
    }

    if (deathsList) {
      if (!sectionDeaths.length) {
        deathsList.innerHTML = `<div class="mc-death-row-empty">No ${isEnemyTab ? "enemy" : "friendly"} deaths in the last 30 minutes.</div>`;
      } else {
        deathsList.innerHTML = sectionDeaths.map((death) => {
          const when = new Date(death.at);
          const time = when.toTimeString().slice(0, 5);
          const rel = formatRelativeTime(death.at);
          const levelTag = death.level != null ? ` (lvl ${escapeHtml(death.level)})` : "";
          return (
            `<div class="mc-death-row">` +
              `<div class="mc-death-head">` +
                `<span>${escapeHtml(death.name)}${levelTag}</span>` +
                `<span>${escapeHtml(time)} · ${escapeHtml(rel)}</span>` +
              `</div>` +
              `<div class="mc-death-body">${escapeHtml(death.description || "")}</div>` +
            `</div>`
          );
        }).join("");
      }
    }
  }

  function ensureTrackerToastContainer() {
    let host = document.getElementById("minibia-copilot-tracker-toasts");
    if (host) {
      positionTrackerToastContainer(host);
      return host;
    }
    host = document.createElement("div");
    host.id = "minibia-copilot-tracker-toasts";
    document.body.appendChild(host);
    positionTrackerToastContainer(host);
    bot.addCleanup(() => host?.remove());
    return host;
  }

  function positionTrackerToastContainer(host) {
    const canvas = window.gameClient?.renderer?.screen?.canvas;
    const rect = canvas?.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      host.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
      host.style.top = `${Math.round(rect.top + 8)}px`;
      host.style.transform = "translateX(-50%)";
      host.style.right = "auto";
    } else {
      host.style.left = "50%";
      host.style.top = "16px";
      host.style.transform = "translateX(-50%)";
      host.style.right = "auto";
    }
  }

  function showTrackerNotification(type, name, info) {
    const host = ensureTrackerToastContainer();
    const tone = type === "death" ? "death" : (type === "alpha" ? "alpha" : "login");
    const node = document.createElement("div");
    node.className = "mc-toast";
    node.dataset.tone = tone;

    if (tone === "death") {
      const cause = info?.description ? escapeHtml(info.description) : "an unknown cause";
      const levelTag = info?.level != null ? ` (lvl ${escapeHtml(info.level)})` : "";
      node.innerHTML =
        `<div><span class="mc-toast-name">${escapeHtml(name)}${levelTag}</span> has died by ${cause}</div>`;
    } else if (tone === "alpha") {
      const distanceText = info?.distance != null
        ? ` (${escapeHtml(info.distance)} sqm)`
        : "";
      node.innerHTML =
        `<div><span class="mc-toast-name">${escapeHtml(name)}</span> spotted nearby${distanceText}</div>`;
    } else {
      node.innerHTML =
        `<div><span class="mc-toast-name">${escapeHtml(name)}</span> has Logged in</div>`;
    }

    host.appendChild(node);
    positionTrackerToastContainer(host);

    const ttlByTone = { death: 12000, alpha: 10000, login: 8000 };
    const ttl = ttlByTone[tone] || 8000;
    window.setTimeout(() => {
      node.classList.add("mc-toast-leaving");
      window.setTimeout(() => node.remove(), 240);
    }, ttl);
  }

  function ensureFightModal() {
    let modal = document.getElementById("minibia-copilot-fight-modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "minibia-copilot-fight-modal";
    modal.innerHTML = `
      <div class="mc-fight-dialog" role="dialog" aria-modal="true">
        <div class="mc-fight-head">
          <h3 class="mc-fight-title">Monster Matchup</h3>
          <button type="button" id="minibia-copilot-fight-close" aria-label="Close">✕</button>
        </div>
        <div class="mc-fight-pickers">
          <input type="text" id="minibia-copilot-fight-a" list="minibia-copilot-fight-datalist" placeholder="Monster A (e.g. Ferumbras)" autocomplete="off" />
          <div class="mc-fight-vs">VS</div>
          <input type="text" id="minibia-copilot-fight-b" list="minibia-copilot-fight-datalist" placeholder="Monster B (e.g. Vesperoth)" autocomplete="off" />
        </div>
        <datalist id="minibia-copilot-fight-datalist"></datalist>
        <div class="mc-fight-actions">
          <button type="button" id="minibia-copilot-fight-go">⚔ Fight!</button>
          <button type="button" id="minibia-copilot-fight-refresh-lib">Reload Library</button>
        </div>
        <div class="mc-fight-status" id="minibia-copilot-fight-status">Loading library…</div>
        <div class="mc-fight-result" id="minibia-copilot-fight-result" hidden></div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeFightModal();
    });
    modal.querySelector("#minibia-copilot-fight-close")?.addEventListener("click", closeFightModal);
    modal.querySelector("#minibia-copilot-fight-go")?.addEventListener("click", runFightSimulation);
    modal.querySelector("#minibia-copilot-fight-refresh-lib")?.addEventListener("click", () => {
      bot.fightEstimator?.clearCache?.();
      loadFightLibrary(true);
    });
    [modal.querySelector("#minibia-copilot-fight-a"), modal.querySelector("#minibia-copilot-fight-b")].forEach((input) => {
      if (!input) return;
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          runFightSimulation();
        }
      });
    });

    bot.addCleanup(() => modal?.remove());
    return modal;
  }

  function openFightModal() {
    const modal = ensureFightModal();
    modal.dataset.open = "true";
    loadFightLibrary(false);
  }

  function closeFightModal() {
    const modal = document.getElementById("minibia-copilot-fight-modal");
    if (modal) modal.dataset.open = "false";
  }

  function fillFightDatalist() {
    const datalist = document.getElementById("minibia-copilot-fight-datalist");
    if (!datalist) return;
    const status = bot.fightEstimator?.status?.();
    const count = status?.monsterCount || 0;
    if (!count) {
      datalist.innerHTML = "";
      return;
    }
    const monsters = bot.fightEstimator?.searchMonsters?.("", 9999)
      || (window.minibiaCopilot?.fightEstimator?.searchMonsters?.("", 9999));
    if (monsters && monsters.length) {
      datalist.innerHTML = monsters.map((m) => `<option value="${escapeHtml(m.name)}"></option>`).join("");
      return;
    }
    const a = document.getElementById("minibia-copilot-fight-a");
    if (a) a.placeholder = "Library not indexed; type a known name";
  }

  async function loadFightLibrary(force) {
    const statusEl = document.getElementById("minibia-copilot-fight-status");
    if (statusEl) statusEl.textContent = force ? "Reloading library…" : "Loading library…";
    try {
      await bot.fightEstimator?.fetchLibrary?.({ force });
      const status = bot.fightEstimator?.status?.();
      const count = status?.monsterCount || 0;
      if (statusEl) statusEl.textContent = `Library: ${count} monsters loaded.`;
      fillFightDatalist();
    } catch (error) {
      if (statusEl) statusEl.textContent = "Library load failed: " + (error?.message || String(error));
    }
  }

  async function runFightSimulation() {
    const a = document.getElementById("minibia-copilot-fight-a")?.value?.trim();
    const b = document.getElementById("minibia-copilot-fight-b")?.value?.trim();
    const resultEl = document.getElementById("minibia-copilot-fight-result");
    if (!resultEl) return;
    if (!a || !b) {
      resultEl.hidden = false;
      resultEl.innerHTML = '<div class="mc-fight-verdict">Pick two monsters first.</div>';
      return;
    }

    resultEl.hidden = false;
    resultEl.innerHTML = '<div class="mc-fight-verdict">Simulating…</div><div class="mc-fight-status">Checking Minibia library and Tibia wiki for missing monsters…</div>';

    let outcome;
    try {
      outcome = await bot.fightEstimator?.simulateAsync?.(a, b);
    } catch (error) {
      resultEl.innerHTML = `<div class="mc-fight-verdict">⚠ ${escapeHtml(error?.message || String(error))}</div>`;
      return;
    }
    if (!outcome) {
      resultEl.innerHTML = '<div class="mc-fight-verdict">Estimator not available.</div>';
      return;
    }
    if (outcome.error) {
      resultEl.innerHTML = `<div class="mc-fight-verdict">⚠ ${escapeHtml(outcome.error)}</div>`;
      return;
    }

    const verdict = outcome.winner === "a"
      ? `🏆 ${escapeHtml(outcome.winnerName)} wins — confidence: ${escapeHtml(outcome.confidence)}`
      : outcome.winner === "b"
      ? `🏆 ${escapeHtml(outcome.winnerName)} wins — confidence: ${escapeHtml(outcome.confidence)}`
      : "🤝 Draw";
    const winnerKey = outcome.winner;

    function renderCard(side, snap) {
      const isWinner = winnerKey === side;
      const isLoser = winnerKey !== "draw" && winnerKey !== side;
      const ttkText = snap.ttkOpponentSec != null ? `${snap.ttkOpponentSec}s` : "n/a";
      const sourceBadge = snap.source === "wiki"
        ? '<span style="font-size:9px;color:#9fb3c8;margin-left:6px;">[wiki]</span>'
        : '<span style="font-size:9px;color:#8c7a52;margin-left:6px;">[library]</span>';
      return `
        <div class="mc-fight-card" ${isWinner ? 'data-winner="true"' : ""} ${isLoser ? 'data-loser="true"' : ""}>
          <h4>${escapeHtml(snap.name)}${sourceBadge}</h4>
          <dl>
            <dt>HP</dt><dd>${escapeHtml(snap.health)}</dd>
            <dt>Armor</dt><dd>${escapeHtml(snap.armor)}</dd>
            <dt>Speed</dt><dd>${escapeHtml(snap.speed)}</dd>
            <dt>Attacks</dt><dd>${escapeHtml(snap.attackCount)}</dd>
            <dt>Est. DPS</dt><dd>${escapeHtml(snap.dps)}</dd>
            <dt>Kills in</dt><dd>${escapeHtml(ttkText)}</dd>
            <dt>Immune</dt><dd>${escapeHtml(snap.immunities.join(", ") || "—")}</dd>
            <dt>Exp</dt><dd>${escapeHtml(snap.experience)}</dd>
          </dl>
        </div>
      `;
    }

    const reasonsHtml = (outcome.reasons || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("");

    resultEl.hidden = false;
    resultEl.innerHTML = `
      <div class="mc-fight-verdict">${verdict}</div>
      ${outcome.hpRemaining ? `<div class="mc-fight-status">Winner ends with ~${outcome.hpRemaining} HP remaining.</div>` : ""}
      <div class="mc-fight-grid">
        ${renderCard("a", outcome.a)}
        ${renderCard("b", outcome.b)}
      </div>
      ${reasonsHtml ? `<ul class="mc-fight-reasons">${reasonsHtml}</ul>` : ""}
    `;
  }

  function refreshLootbagStatus() {
    const status = bot.lootbag?.status?.();
    if (!status) return;

    const enabledInput = document.getElementById("minibia-copilot-lootbag-enabled");
    const list = document.getElementById("minibia-copilot-lootbag-list");
    const statusLabel = document.getElementById("minibia-copilot-lootbag-status");

    if (enabledInput && document.activeElement !== enabledInput) {
      enabledInput.checked = !!status.running;
    }

    if (statusLabel) {
      const itemCount = status.itemCount || 0;
      if (!status.running) {
        statusLabel.textContent = `Status: idle (${itemCount} item${itemCount === 1 ? "" : "s"} configured)`;
      } else if (!itemCount) {
        statusLabel.textContent = "Status: running but no items configured";
      } else if (status.droppedSinceStart) {
        const last = status.lastDroppedName ? ` — last: ${status.lastDroppedName}` : "";
        statusLabel.textContent = `Status: dropped ${status.droppedSinceStart} this session${last}`;
      } else {
        statusLabel.textContent = `Status: watching (${itemCount} item${itemCount === 1 ? "" : "s"})`;
      }
    }

    if (list) {
      const items = bot.lootbag?.getItems?.() || [];
      if (!items.length) {
        list.innerHTML = '<div class="mc-small-note">No items configured. Add an item name above (e.g. "small stone").</div>';
      } else {
        list.innerHTML = items.map((name) => (
          `<div class="mc-loot-row" data-name="${escapeHtml(name)}">` +
            `<span>${escapeHtml(name)}</span>` +
            `<button type="button" class="mc-small-button" data-lootbag-remove="${escapeHtml(name)}" title="Remove">✕</button>` +
          `</div>`
        )).join("");
      }
    }
  }

  function refreshAttackPriorityUI() {
    const list = document.getElementById("minibia-copilot-attack-priority-list");
    if (!list) return;

    const names = bot.attack?.getPriorityTargets?.() || [];
    if (!names.length) {
      list.innerHTML = '<div class="mc-small-note">No priority targets yet. Add a monster name above.</div>';
    } else {
      list.innerHTML = names.map((name, index) => (
        `<div class="mc-priority-row" data-name="${escapeHtml(name)}">` +
          `<span class="mc-priority-rank">${index + 1}.</span>` +
          `<span class="mc-priority-name">${escapeHtml(name)}</span>` +
          `<button type="button" class="mc-small-button" data-attack-priority-up="${escapeHtml(name)}" title="Move up">↑</button>` +
          `<button type="button" class="mc-small-button" data-attack-priority-down="${escapeHtml(name)}" title="Move down">↓</button>` +
          `<button type="button" class="mc-small-button" data-attack-priority-remove="${escapeHtml(name)}" title="Remove">✕</button>` +
        `</div>`
      )).join("");
    }
  }

  function refreshAlphaWatchStatus() {
    const status = bot.alphaWatch?.status?.();
    if (!status) return;

    const enabledInput = document.getElementById("minibia-copilot-alpha-watch-enabled");
    const statusLabel = document.getElementById("minibia-copilot-alpha-watch-status");

    if (enabledInput && document.activeElement !== enabledInput) {
      enabledInput.checked = !!status.running;
    }

    if (statusLabel) {
      if (!status.running) {
        statusLabel.textContent = "Status: idle";
      } else {
        const count = status.visibleAlphas?.length || 0;
        if (count === 0) {
          statusLabel.textContent = "Status: watching — none on screen";
        } else if (count === 1) {
          const a = status.visibleAlphas[0];
          statusLabel.textContent = `Status: 1 nearby — ${a.name}`;
        } else {
          statusLabel.textContent = `Status: ${count} alphas nearby`;
        }
      }
    }
  }

  function refreshMagicWallStatus() {
    const enabledInput = document.getElementById("minibia-copilot-magic-wall-enabled");
    const audioInput = document.getElementById("minibia-copilot-magic-wall-audio");
    const durationInput = document.getElementById("minibia-copilot-magic-wall-duration");
    const leadInput = document.getElementById("minibia-copilot-magic-wall-lead");
    const statusLabel = document.getElementById("minibia-copilot-magic-wall-status");
    const status = bot.magicWall?.status?.();

    if (enabledInput) {
      enabledInput.checked = !!status?.running;
    }
    if (audioInput) {
      audioInput.checked = !!status?.config?.audioOnExpiry;
    }
    if (durationInput && document.activeElement !== durationInput) {
      const primary = status?.config?.patternSpecs?.find((spec) =>
        String(spec?.name || "").toLowerCase().includes("magic wall")
      );
      const seconds = primary ? Math.round((Number(primary.durationMs) || 20000) / 1000) : 20;
      durationInput.value = String(seconds);
    }
    if (leadInput && document.activeElement !== leadInput) {
      const lead = Math.round((Number(status?.config?.flashLeadMs) || 3000) / 1000);
      leadInput.value = String(lead);
    }
    if (statusLabel) {
      const activeCount = Array.isArray(status?.timers) ? status.timers.length : 0;
      if (!status?.running) {
        statusLabel.textContent = "Status: idle";
      } else if (activeCount === 0) {
        statusLabel.textContent = "Status: watching";
      } else {
        statusLabel.textContent = `Status: ${activeCount} active`;
      }
    }
  }

  function refreshTalkStatus() {
    const talkToggle = document.getElementById("minibia-copilot-talk-enabled");
    const statusLabel = document.getElementById("minibia-copilot-talk-status");
    const status = bot.talk?.status?.();

    if (talkToggle) {
      talkToggle.checked = !!status?.running;
    }

    if (statusLabel) {
      if (!status?.config?.apiKey) {
        statusLabel.textContent = "Status: API key missing";
      } else if (status?.pending) {
        statusLabel.textContent = "Status: generating";
      } else if (status?.running) {
        statusLabel.textContent = "Status: listening to Default";
      } else {
        statusLabel.textContent = "Status: idle";
      }
    }
  }

  function refreshVisibleCreatures() {
    const list = document.getElementById("minibia-copilot-visible-creatures-list");
    if (!list) return;

    const me = bot.getPlayerPosition?.();
    const status = bot.xray?.status?.();
    const creatures = status?.visibleCreatures || [];
    const selectedFloor = status?.config?.selectedFloor;
    list.innerHTML = "";

    if (!me) {
      const empty = document.createElement("div");
      empty.className = "mc-small-note";
      empty.textContent = "Current position unavailable.";
      list.appendChild(empty);
      return;
    }

    const getFloorOffset = (creature) => (creature.position?.z || 0) - me.z;
    const getFloorDistance = (creature) => Math.abs(getFloorOffset(creature));

    const visibleCreatures = creatures
      .filter((creature) => {
        const floor = creature?.position?.z;
        if (floor == null) {
          return false;
        }

        if (selectedFloor != null) {
          return floor === selectedFloor;
        }

        return floor !== me.z;
      })
      .sort((a, b) => {
      const floorDistanceDiff = getFloorDistance(a) - getFloorDistance(b);
      if (floorDistanceDiff !== 0) return floorDistanceDiff;

      const floorOffsetDiff = getFloorOffset(a) - getFloorOffset(b);
      if (floorOffsetDiff !== 0) return floorOffsetDiff;

      const aDist = Math.abs((a.position?.x || 0) - me.x) + Math.abs((a.position?.y || 0) - me.y);
      const bDist = Math.abs((b.position?.x || 0) - me.x) + Math.abs((b.position?.y || 0) - me.y);
      return aDist - bDist;
    });

    if (!visibleCreatures.length) {
      const empty = document.createElement("div");
      empty.className = "mc-small-note";
      empty.textContent = selectedFloor == null
        ? "No off-floor creatures."
        : `No creatures on floor ${selectedFloor}.`;
      list.appendChild(empty);
      return;
    }

    let currentFloor = null;

    visibleCreatures.forEach((creature) => {
      const floor = creature.position?.z;
      if (floor !== currentFloor) {
        currentFloor = floor;
        const floorOffset = me.z - floor;
        const floorOffsetLabel =
          floorOffset === 0 ? "0" : floorOffset > 0 ? `+${floorOffset}` : `${floorOffset}`;

        const floorLabel = document.createElement("div");
        floorLabel.className = "mc-floor-label";
        floorLabel.textContent = floorOffsetLabel;
        list.appendChild(floorLabel);
      }

      const row = document.createElement("div");
      row.className = "mc-creature-row";

      const name = document.createElement("div");
      name.className = "mc-creature-name";
      name.textContent = creature.name || (creature.type === 0 ? "Player" : "Mob");

      const meta = document.createElement("div");
      meta.className = "mc-small-note";
      meta.textContent = `${creature.type === 0 ? "Player" : "Mob"} at ${creature.position.x}, ${creature.position.y}, ${creature.position.z}`;

      row.appendChild(name);
      row.appendChild(meta);
      list.appendChild(row);
    });
  }

  function setPanelCollapsed(panel, collapsed) {
    if (!panel) return;

    const body = panel.querySelector(".mc-body");
    const toggle = panel.querySelector("#minibia-copilot-collapse");
    const nextCollapsed = !!collapsed;

    panel.dataset.collapsed = nextCollapsed ? "true" : "false";

    if (body) {
      body.hidden = nextCollapsed;
    }

    if (toggle) {
      toggle.textContent = nextCollapsed ? "+" : "−";
      toggle.setAttribute("aria-label", nextCollapsed ? "Maximize panel" : "Minimize panel");
      toggle.setAttribute("title", nextCollapsed ? "Maximize" : "Minimize");
    }

    savePanelCollapsed(nextCollapsed);
  }

  function applySavedPanelPosition(panel, key = panelPositionKey) {
    const position = getSavedPanelPosition(key);
    if (!position) return;

    if (typeof position.top === "number") {
      panel.style.top = `${position.top}px`;
    }

    if (typeof position.left === "number") {
      panel.style.left = `${position.left}px`;
      panel.style.right = "auto";
    }
  }

  function clampPanelPosition(panel, left, top) {
    const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);

    return {
      left: Math.min(Math.max(0, left), maxLeft),
      top: Math.min(Math.max(0, top), maxTop),
    };
  }

  function enableDrag(panel, key = panelPositionKey) {
    const handle = panel.querySelector(".mc-title");
    if (!handle) return;

    let dragState = null;

    const onMouseMove = (event) => {
      if (!dragState) return;

      const next = clampPanelPosition(
        panel,
        event.clientX - dragState.offsetX,
        event.clientY - dragState.offsetY
      );

      panel.style.left = `${next.left}px`;
      panel.style.top = `${next.top}px`;
      panel.style.right = "auto";
    };

    const onMouseUp = () => {
      if (!dragState) return;

      dragState = null;
      const rect = panel.getBoundingClientRect();
      savePanelPosition({ left: rect.left, top: rect.top }, key);
    };

    handle.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;

      const rect = panel.getBoundingClientRect();
      dragState = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
      };

      event.preventDefault();
    });

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    bot.addCleanup(() => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    });
  }

  function inject() {
    destroy();

    const style = document.createElement("style");
    style.id = "minibia-copilot-style";
    style.textContent = `
      #minibia-copilot-panel {
        position: fixed;
        z-index: 999999;
        top: 16px;
        right: 16px;
        width: 340px;
        max-width: calc(100vw - 32px);
        max-height: calc(100vh - 32px);
        display: flex;
        flex-direction: column;
        padding: 0;
        border: 1px solid rgba(224, 200, 148, 0.45);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(30, 23, 15, 0.97), rgba(15, 11, 8, 0.98));
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
        color: #f1e2b8;
        font: 12px/1.4 Verdana, sans-serif;
        user-select: none;
        overflow: hidden;
      }

      #minibia-copilot-panel[data-collapsed="true"] {
        width: 200px;
        max-height: none;
      }

      #minibia-copilot-panel .mc-title {
        margin: 0;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        cursor: move;
        color: #f7eccf;
      }

      #minibia-copilot-panel .mc-title-accent {
        color: #ffcf5a;
      }

      #minibia-copilot-panel .mc-titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(224, 200, 148, 0.22);
        background: linear-gradient(180deg, rgba(60, 46, 28, 0.55), rgba(28, 20, 12, 0.25));
      }

      #minibia-copilot-panel .mc-titlebar-actions {
        display: flex;
        gap: 4px;
      }

      #minibia-copilot-panel .mc-icon-button {
        width: 24px;
        min-width: 24px;
        height: 24px;
        padding: 0;
        border-radius: 6px;
        font-weight: 700;
        font-size: 14px;
        line-height: 1;
      }

      #minibia-copilot-panel #minibia-copilot-pause-toggle[data-paused="true"] {
        color: #ffcf5a;
        border-color: rgba(255, 207, 90, 0.6);
        background: linear-gradient(180deg, rgba(120, 80, 20, 0.7), rgba(60, 40, 10, 0.7));
        box-shadow: 0 0 8px rgba(255, 207, 90, 0.4) inset;
      }

      #minibia-copilot-panel[data-collapsed="true"] .mc-tabs,
      #minibia-copilot-panel[data-collapsed="true"] .mc-hero,
      #minibia-copilot-panel[data-collapsed="true"] .mc-body {
        display: none !important;
      }

      #minibia-copilot-panel .mc-hero {
        position: relative;
        height: 96px;
        padding: 0;
        border-bottom: 1px solid rgba(224, 200, 148, 0.22);
        background:
          radial-gradient(ellipse at center, rgba(40, 28, 12, 0) 0%, rgba(15, 11, 8, 0.55) 100%),
          rgba(0, 0, 0, 0.25);
        overflow: hidden;
      }

      #minibia-copilot-panel .mc-hero img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        object-position: center;
        display: block;
        image-rendering: pixelated;
        image-rendering: crisp-edges;
      }

      #minibia-copilot-panel .mc-hero[hidden] {
        display: none !important;
      }

      #minibia-copilot-panel .mc-tabs {
        display: flex;
        padding: 6px 6px 0;
        gap: 1px;
        border-bottom: 1px solid rgba(224, 200, 148, 0.22);
        background: rgba(0, 0, 0, 0.12);
        overflow-x: auto;
        scrollbar-width: thin;
      }

      #minibia-copilot-panel .mc-tabs::-webkit-scrollbar {
        height: 4px;
      }
      #minibia-copilot-panel .mc-tabs::-webkit-scrollbar-thumb {
        background: rgba(224, 200, 148, 0.18);
        border-radius: 4px;
      }

      #minibia-copilot-panel .mc-tab-button {
        flex: 1 1 0;
        min-width: 0;
        width: auto;
        padding: 6px 2px 8px;
        border: 0;
        border-bottom: 2px solid transparent;
        border-radius: 6px 6px 0 0;
        background: transparent;
        color: #8c7a52;
        font-size: 9px;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        line-height: 1.15;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        white-space: nowrap;
      }

      #minibia-copilot-panel .mc-tab-button:hover {
        color: #f1e2b8;
        background: rgba(224, 200, 148, 0.08);
      }

      #minibia-copilot-panel .mc-tab-button[data-active="true"] {
        color: #ffcf5a;
        border-bottom-color: #ffcf5a;
        background: rgba(255, 207, 90, 0.06);
      }

      #minibia-copilot-panel .mc-tab-icon {
        font-size: 14px;
        line-height: 1;
      }

      #minibia-copilot-panel .mc-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 10px 12px 14px;
      }

      #minibia-copilot-panel .mc-body::-webkit-scrollbar {
        width: 6px;
      }

      #minibia-copilot-panel .mc-body::-webkit-scrollbar-thumb {
        background: rgba(224, 200, 148, 0.18);
        border-radius: 6px;
      }

      #minibia-copilot-panel .mc-tab-pane[hidden] {
        display: none !important;
      }

      #minibia-copilot-panel .mc-tab-pane {
        display: grid;
        gap: 10px;
      }

      #minibia-copilot-panel .mc-section {
        padding: 10px 11px;
        border: 1px solid rgba(224, 200, 148, 0.18);
        border-radius: 8px;
        background: linear-gradient(180deg, rgba(50, 38, 22, 0.45), rgba(28, 20, 12, 0.55));
      }

      #minibia-copilot-panel .mc-column-section:first-child {
        padding-top: 10px;
      }

      #minibia-copilot-panel .mc-label {
        margin: 0 0 8px;
        color: #ffcf5a;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        word-break: break-word;
      }

      #minibia-copilot-panel .mc-snapshot {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        padding: 10px;
        border: 1px solid rgba(224, 200, 148, 0.22);
        border-radius: 8px;
        background: linear-gradient(180deg, rgba(40, 30, 18, 0.6), rgba(20, 14, 8, 0.7));
      }

      #minibia-copilot-panel .mc-stat {
        text-align: center;
      }

      #minibia-copilot-panel .mc-stat-label {
        display: block;
        font-size: 9px;
        color: #8c7a52;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      #minibia-copilot-panel .mc-stat-value {
        display: block;
        margin-top: 2px;
        font-size: 14px;
        font-weight: 700;
        color: #f7eccf;
      }

      #minibia-copilot-panel .mc-stat-value[data-tone="hp"] {
        color: #ff7d6f;
      }

      #minibia-copilot-panel .mc-stat-value[data-tone="mana"] {
        color: #6fa8ff;
      }

      #minibia-copilot-panel .mc-stat-value[data-tone="lvl"] {
        color: #ffcf5a;
      }

      #minibia-copilot-panel .mc-hunt-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
      }

      #minibia-copilot-panel .mc-hunt-grid[hidden] {
        display: none !important;
      }

      #minibia-copilot-panel .mc-hunt-cell {
        display: flex;
        flex-direction: column;
        gap: 1px;
        padding: 6px 8px;
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.22);
        border: 1px solid rgba(224, 200, 148, 0.12);
      }

      #minibia-copilot-panel .mc-hunt-cell > span:last-child {
        color: #f7eccf;
        font-weight: 700;
        font-size: 12px;
      }

      #minibia-copilot-panel .mc-tracked-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 5px 8px;
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.22);
        border: 1px solid rgba(224, 200, 148, 0.1);
      }

      #minibia-copilot-panel .mc-tracked-name {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #f7eccf;
      }

      #minibia-copilot-panel .mc-tracked-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #6b6b6b;
      }

      #minibia-copilot-panel .mc-tracked-dot[data-online="true"] {
        background: #65d96b;
        box-shadow: 0 0 6px rgba(120, 220, 130, 0.6);
      }

      #minibia-copilot-panel .mc-death-row {
        padding: 6px 8px;
        border-radius: 6px;
        background: rgba(120, 30, 30, 0.18);
        border: 1px solid rgba(255, 100, 100, 0.18);
      }

      #minibia-copilot-panel .mc-death-row-empty {
        padding: 8px;
        color: #8c7a52;
        text-align: center;
        font-style: italic;
      }

      #minibia-copilot-panel .mc-death-row .mc-death-head {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        font-weight: 700;
        color: #ffb0a8;
      }

      #minibia-copilot-panel .mc-death-row .mc-death-body {
        margin-top: 2px;
        color: #d3c49d;
        font-size: 11px;
        line-height: 1.3;
      }

      #minibia-copilot-panel .mc-subtabs {
        display: flex;
        gap: 4px;
        margin-bottom: -4px;
      }

      #minibia-copilot-panel .mc-subtab-button {
        flex: 1;
        width: auto;
        padding: 6px 8px;
        border: 1px solid rgba(224, 200, 148, 0.2);
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.25);
        color: #8c7a52;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        cursor: pointer;
      }

      #minibia-copilot-panel .mc-subtab-button:hover {
        color: #f1e2b8;
      }

      #minibia-copilot-panel .mc-subtab-button[data-active="true"] {
        color: #ffcf5a;
        border-color: rgba(255, 207, 90, 0.45);
        background: rgba(255, 207, 90, 0.1);
      }

      #minibia-copilot-panel .mc-tracked-name-text {
        display: flex;
        flex-direction: column;
        line-height: 1.1;
      }

      #minibia-copilot-panel .mc-tracked-meta {
        color: #8c7a52;
        font-size: 10px;
        letter-spacing: 0.02em;
        margin-top: 2px;
      }

      #minibia-copilot-panel .mc-tracked-actions {
        display: flex;
        gap: 4px;
      }

      #minibia-copilot-panel .mc-tracked-actions .mc-small-button {
        padding: 3px 7px;
        font-size: 11px;
      }

      #minibia-copilot-panel .mc-priority-block {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px;
        border: 1px solid rgba(224, 200, 148, 0.18);
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.18);
      }

      #minibia-copilot-panel .mc-priority-block[hidden] {
        display: none !important;
      }

      #minibia-copilot-panel #minibia-copilot-attack-priority-list {
        max-height: 200px;
        overflow-y: auto;
        padding-right: 4px;
        scrollbar-width: thin;
      }

      #minibia-copilot-panel .mc-priority-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 5px 8px;
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.22);
        border: 1px solid rgba(224, 200, 148, 0.1);
      }

      #minibia-copilot-panel .mc-priority-row .mc-priority-rank {
        color: #ffcf5a;
        font-weight: 700;
        min-width: 22px;
      }

      #minibia-copilot-panel .mc-priority-row .mc-priority-name {
        flex: 1;
        color: #f7eccf;
        word-break: break-word;
      }

      #minibia-copilot-panel .mc-priority-row .mc-small-button {
        padding: 3px 6px;
        font-size: 11px;
      }

      #minibia-copilot-panel #minibia-copilot-lootbag-list {
        max-height: 200px;
        overflow-y: auto;
        padding-right: 4px;
        scrollbar-width: thin;
      }

      #minibia-copilot-panel .mc-loot-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 5px 8px;
        border-radius: 6px;
        background: rgba(50, 30, 8, 0.35);
        border: 1px solid rgba(224, 200, 148, 0.1);
        color: #f7eccf;
      }

      #minibia-copilot-panel .mc-loot-row .mc-small-button {
        padding: 3px 7px;
        font-size: 11px;
      }

      #minibia-copilot-tracker-toasts {
        position: fixed;
        z-index: 2147483645;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        font: 13px/1.35 Verdana, sans-serif;
      }

      #minibia-copilot-tracker-toasts .mc-toast {
        pointer-events: auto;
        max-width: 480px;
        padding: 8px 14px;
        border-radius: 8px;
        border: 1px solid currentColor;
        background: rgba(12, 10, 6, 0.92);
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
        color: #f7eccf;
        animation: mc-toast-in 220ms ease-out;
      }

      #minibia-copilot-tracker-toasts .mc-toast[data-tone="login"] {
        color: #65d96b;
        background: linear-gradient(180deg, rgba(20, 50, 22, 0.95), rgba(12, 10, 6, 0.95));
      }

      #minibia-copilot-tracker-toasts .mc-toast[data-tone="death"] {
        color: #ff7d6f;
        background: linear-gradient(180deg, rgba(70, 16, 16, 0.95), rgba(12, 10, 6, 0.95));
      }

      #minibia-copilot-tracker-toasts .mc-toast[data-tone="alpha"] {
        color: #ffcf5a;
        background: linear-gradient(180deg, rgba(70, 50, 12, 0.95), rgba(12, 10, 6, 0.95));
      }

      #minibia-copilot-tracker-toasts .mc-toast .mc-toast-name {
        font-weight: 700;
      }

      #minibia-copilot-tracker-toasts .mc-toast .mc-toast-body {
        color: #d3c49d;
        font-size: 12px;
      }

      #minibia-copilot-tracker-toasts .mc-toast-leaving {
        animation: mc-toast-out 240ms ease-in forwards;
      }

      @keyframes mc-toast-in {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes mc-toast-out {
        to { opacity: 0; transform: translateY(-8px); }
      }

      #minibia-copilot-fight-modal {
        position: fixed;
        inset: 0;
        z-index: 2147483640;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.55);
        font: 12px/1.4 Verdana, sans-serif;
        color: #f1e2b8;
      }

      #minibia-copilot-fight-modal[data-open="true"] {
        display: flex;
      }

      #minibia-copilot-fight-modal .mc-fight-dialog {
        width: min(640px, calc(100vw - 32px));
        max-height: calc(100vh - 64px);
        overflow-y: auto;
        padding: 16px;
        border: 1px solid rgba(224, 200, 148, 0.45);
        border-radius: 12px;
        background: linear-gradient(180deg, rgba(30, 23, 15, 0.98), rgba(15, 11, 8, 0.99));
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.55);
      }

      #minibia-copilot-fight-modal .mc-fight-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(224, 200, 148, 0.25);
      }

      #minibia-copilot-fight-modal .mc-fight-title {
        margin: 0;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #ffcf5a;
      }

      #minibia-copilot-fight-modal .mc-fight-pickers {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 8px;
        align-items: center;
      }

      #minibia-copilot-fight-modal .mc-fight-vs {
        font-weight: 700;
        font-size: 16px;
        color: #ffcf5a;
        text-align: center;
      }

      #minibia-copilot-fight-modal input {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 10px;
        border: 1px solid rgba(224, 200, 148, 0.4);
        border-radius: 8px;
        background: rgba(16, 12, 8, 0.92);
        color: #f7eccf;
        font: inherit;
      }

      #minibia-copilot-fight-modal button {
        padding: 8px 14px;
        border: 1px solid rgba(224, 200, 148, 0.4);
        border-radius: 8px;
        background: linear-gradient(180deg, #635133, #3f321f);
        color: #f7eccf;
        cursor: pointer;
        font: inherit;
        font-weight: 700;
      }

      #minibia-copilot-fight-modal .mc-fight-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }

      #minibia-copilot-fight-modal .mc-fight-result {
        margin-top: 14px;
        padding: 12px;
        border: 1px solid rgba(224, 200, 148, 0.22);
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.3);
      }

      #minibia-copilot-fight-modal .mc-fight-verdict {
        font-size: 14px;
        font-weight: 700;
        color: #ffcf5a;
        margin-bottom: 8px;
      }

      #minibia-copilot-fight-modal .mc-fight-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-top: 8px;
      }

      #minibia-copilot-fight-modal .mc-fight-card {
        padding: 8px 10px;
        border: 1px solid rgba(224, 200, 148, 0.18);
        border-radius: 8px;
        background: rgba(40, 28, 14, 0.4);
      }

      #minibia-copilot-fight-modal .mc-fight-card[data-winner="true"] {
        border-color: rgba(120, 220, 130, 0.6);
        background: linear-gradient(180deg, rgba(30, 80, 32, 0.4), rgba(20, 14, 8, 0.6));
      }

      #minibia-copilot-fight-modal .mc-fight-card[data-loser="true"] {
        border-color: rgba(255, 100, 100, 0.4);
        background: linear-gradient(180deg, rgba(80, 20, 20, 0.4), rgba(20, 14, 8, 0.6));
      }

      #minibia-copilot-fight-modal .mc-fight-card h4 {
        margin: 0 0 6px;
        color: #f7eccf;
      }

      #minibia-copilot-fight-modal .mc-fight-card dl {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 2px 8px;
        margin: 0;
        font-size: 11px;
      }

      #minibia-copilot-fight-modal .mc-fight-card dt {
        color: #8c7a52;
      }

      #minibia-copilot-fight-modal .mc-fight-card dd {
        margin: 0;
        color: #f1e2b8;
      }

      #minibia-copilot-fight-modal ul.mc-fight-reasons {
        margin: 10px 0 0;
        padding-left: 18px;
        color: #d3c49d;
        font-size: 11px;
        line-height: 1.4;
      }

      #minibia-copilot-fight-modal .mc-fight-status {
        margin-top: 8px;
        color: #8c7a52;
        font-size: 11px;
      }

      #minibia-copilot-panel .mc-actions {
        display: grid;
        gap: 6px;
      }

      #minibia-copilot-panel .mc-actions-inline-three {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      #minibia-copilot-panel .mc-actions-inline-two {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      #minibia-copilot-panel button {
        width: 100%;
        padding: 8px 10px;
        border: 1px solid rgba(224, 200, 148, 0.35);
        border-radius: 8px;
        background: linear-gradient(180deg, #635133, #3f321f);
        color: #f7eccf;
        font: inherit;
        cursor: pointer;
      }

      #minibia-copilot-panel button:hover {
        background: linear-gradient(180deg, #755f3d, #4f4028);
      }

      #minibia-copilot-panel input,
      #minibia-copilot-panel textarea {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 10px;
        border: 1px solid rgba(224, 200, 148, 0.35);
        border-radius: 8px;
        background: rgba(16, 12, 8, 0.88);
        color: #f7eccf;
        font: inherit;
      }

      #minibia-copilot-panel textarea {
        min-height: 72px;
        resize: vertical;
      }

      #minibia-copilot-panel .mc-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #d3c49d;
      }

      #minibia-copilot-panel .mc-toggle input[type="checkbox"] {
        width: auto;
        margin: 0;
      }

      #minibia-copilot-panel .mc-row {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        gap: 8px;
      }

      #minibia-copilot-panel .mc-row-compact {
        grid-template-columns: auto auto;
        justify-content: start;
      }

      #minibia-copilot-panel .mc-row .mc-toggle {
        white-space: nowrap;
      }

      #minibia-copilot-panel .mc-row input[type="text"] {
        min-width: 0;
      }

      #minibia-copilot-panel .mc-row-three {
        display: grid;
        grid-template-columns: auto minmax(120px, 1fr) 72px;
        align-items: center;
        gap: 8px;
      }

      #minibia-copilot-panel .mc-row-three input[type="text"],
      #minibia-copilot-panel .mc-row-three input[type="number"] {
        min-width: 0;
      }

      #minibia-copilot-panel .mc-row-five {
        display: grid;
        grid-template-columns: auto 82px 72px 82px 72px;
        align-items: center;
        gap: 8px;
      }

      #minibia-copilot-panel .mc-row-five input[type="number"] {
        min-width: 0;
      }

      #minibia-copilot-panel .mc-field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      #minibia-copilot-panel .mc-field {
        display: grid;
        gap: 4px;
      }

      #minibia-copilot-panel .mc-field-compact {
        width: 96px;
        justify-self: end;
      }

      #minibia-copilot-panel .mc-field-label {
        color: #d3c49d;
        font-size: 11px;
      }

      #minibia-copilot-panel .mc-stack {
        display: grid;
        gap: 8px;
      }

      #minibia-copilot-panel .mc-inline {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 6px;
        align-items: center;
      }

      #minibia-copilot-panel .mc-list {
        display: grid;
        gap: 6px;
      }

      #minibia-copilot-panel .mc-list-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 6px;
        align-items: center;
        color: #d3c49d;
      }

      #minibia-copilot-panel .mc-creature-row {
        padding: 6px 8px;
        border: 1px solid rgba(224, 200, 148, 0.14);
        border-radius: 8px;
        background: rgba(255, 244, 212, 0.04);
      }

      #minibia-copilot-panel .mc-creature-name {
        color: #f7eccf;
        word-break: break-word;
      }

      #minibia-copilot-panel .mc-floor-label {
        margin-top: 4px;
        color: #e2cf9c;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      #minibia-copilot-panel #minibia-copilot-visible-creatures-list {
        max-height: 150px;
        overflow-y: auto;
        padding-right: 2px;
      }

      #minibia-copilot-panel #minibia-copilot-panic-trusted-list {
        max-height: 140px;
        overflow-y: auto;
        padding-right: 2px;
      }

      #minibia-copilot-panel #minibia-copilot-tracker-list,
      #minibia-copilot-panel #minibia-copilot-tracker-deaths {
        max-height: 360px;
        overflow-y: auto;
        padding-right: 4px;
        scrollbar-width: thin;
        scrollbar-color: rgba(224, 200, 148, 0.28) transparent;
      }

      #minibia-copilot-panel #minibia-copilot-tracker-list::-webkit-scrollbar,
      #minibia-copilot-panel #minibia-copilot-tracker-deaths::-webkit-scrollbar {
        width: 6px;
      }

      #minibia-copilot-panel #minibia-copilot-tracker-list::-webkit-scrollbar-thumb,
      #minibia-copilot-panel #minibia-copilot-tracker-deaths::-webkit-scrollbar-thumb {
        background: rgba(224, 200, 148, 0.22);
        border-radius: 4px;
      }

      #minibia-copilot-panel #minibia-copilot-tracker-list::-webkit-scrollbar-thumb:hover,
      #minibia-copilot-panel #minibia-copilot-tracker-deaths::-webkit-scrollbar-thumb:hover {
        background: rgba(224, 200, 148, 0.38);
      }

      #minibia-copilot-panel .mc-small-button {
        width: auto;
        padding: 4px 8px;
        border-radius: 6px;
      }

      #minibia-copilot-panel .mc-small-note {
        color: #b7a67d;
        font-size: 11px;
      }

      #minibia-copilot-panel .mc-note {
        margin-top: 8px;
        color: #b7a67d;
        font-size: 11px;
      }

      @media (max-width: 420px) {
        #minibia-copilot-panel {
          width: calc(100vw - 24px);
          right: 12px;
          top: 12px;
        }
      }
    `;
    document.head.appendChild(style);

    const panel = document.createElement("div");
    panel.id = "minibia-copilot-panel";
    panel.innerHTML = `
      <div class="mc-titlebar">
        <div class="mc-title">Minibia <span class="mc-title-accent">Copilot</span></div>
        <div class="mc-titlebar-actions">
          <button type="button" class="mc-icon-button" id="minibia-copilot-pause-toggle" aria-label="Pause all bot actions" title="Pause all bot actions">⏸</button>
          <button type="button" class="mc-icon-button" id="minibia-copilot-reload" aria-label="Reload bot" title="Reload bot">⟳</button>
          <button type="button" class="mc-icon-button" id="minibia-copilot-collapse" aria-label="Minimize panel" title="Minimize">−</button>
        </div>
      </div>
      <div class="mc-hero" id="minibia-copilot-hero">
        <img src="https://minibia.com/png/minibia-mascot.png" alt="Minibia" referrerpolicy="no-referrer" onerror="this.parentElement.hidden=true" />
      </div>
      <div class="mc-tabs" id="minibia-copilot-tabs">
        <button type="button" class="mc-tab-button" data-tab="status"><span class="mc-tab-icon">⚡</span><span>Status</span></button>
        <button type="button" class="mc-tab-button" data-tab="combat"><span class="mc-tab-icon">⚔</span><span>Combat</span></button>
        <button type="button" class="mc-tab-button" data-tab="survival"><span class="mc-tab-icon">❤</span><span>Survival</span></button>
        <button type="button" class="mc-tab-button" data-tab="navigation"><span class="mc-tab-icon">🗺</span><span>Navigate</span></button>
        <button type="button" class="mc-tab-button" data-tab="utility"><span class="mc-tab-icon">⚙</span><span>Utility</span></button>
        <button type="button" class="mc-tab-button" data-tab="deaths"><span class="mc-tab-icon">☠</span><span>Deaths</span></button>
      </div>
      <div class="mc-body">

        <div class="mc-tab-pane" data-tab="status" hidden>
          <div class="mc-snapshot" id="minibia-copilot-snapshot">
            <div class="mc-stat"><span class="mc-stat-label">HP</span><span class="mc-stat-value" data-tone="hp" id="minibia-copilot-snapshot-hp">—</span></div>
            <div class="mc-stat"><span class="mc-stat-label">Mana</span><span class="mc-stat-value" data-tone="mana" id="minibia-copilot-snapshot-mana">—</span></div>
            <div class="mc-stat"><span class="mc-stat-label">Lvl</span><span class="mc-stat-value" data-tone="lvl" id="minibia-copilot-snapshot-level">—</span></div>
          </div>
          <div class="mc-section">
            <div class="mc-label">Fight Estimator</div>
            <div class="mc-stack">
              <button type="button" class="mc-small-button" id="minibia-copilot-fight-open">⚔ Open Monster Matchup</button>
              <div class="mc-small-note">Pulls /api/library and predicts who wins between two monsters.</div>
            </div>
          </div>

          <div class="mc-section">
            <div class="mc-label">Alpha Watch</div>
            <div class="mc-stack">
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-alpha-watch-enabled" />
                <span>Toast on Alpha sightings</span>
              </label>
              <div class="mc-small-note" id="minibia-copilot-alpha-watch-status">Status: idle</div>
            </div>
          </div>

          <div class="mc-section">
            <div class="mc-label">Hunt Analyzer</div>
            <div class="mc-stack">
              <div class="mc-small-note" id="minibia-copilot-hunt-status">Status: no session</div>
              <div class="mc-hunt-grid" id="minibia-copilot-hunt-stats" hidden>
                <div class="mc-hunt-cell"><span class="mc-field-label">Elapsed</span><span data-key="elapsed">—</span></div>
                <div class="mc-hunt-cell"><span class="mc-field-label">XP / h</span><span data-key="xpPerHour">—</span></div>
                <div class="mc-hunt-cell"><span class="mc-field-label">Gold / h</span><span data-key="goldPerHour">—</span></div>
                <div class="mc-hunt-cell"><span class="mc-field-label">Kills / h</span><span data-key="killsPerHour">—</span></div>
                <div class="mc-hunt-cell"><span class="mc-field-label">Total XP</span><span data-key="xp">—</span></div>
                <div class="mc-hunt-cell"><span class="mc-field-label">Total Gold</span><span data-key="gold">—</span></div>
              </div>
              <div class="mc-small-note" id="minibia-copilot-hunt-top-monster">Top kill: —</div>
              <div class="mc-small-note" id="minibia-copilot-hunt-top-loot">Top loot: —</div>
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-hunt-autopoll" />
                <span>Auto-refresh every 10s</span>
              </label>
              <div class="mc-actions mc-actions-inline-three">
                <button type="button" class="mc-small-button" id="minibia-copilot-hunt-refresh">Refresh</button>
                <button type="button" class="mc-small-button" id="minibia-copilot-hunt-start">Start</button>
                <button type="button" class="mc-small-button" id="minibia-copilot-hunt-reset">Reset</button>
              </div>
              <div class="mc-actions mc-actions-inline-two">
                <button type="button" class="mc-small-button" id="minibia-copilot-hunt-pause">Pause / Resume</button>
                <button type="button" class="mc-small-button" id="minibia-copilot-hunt-stop">Stop</button>
              </div>
            </div>
          </div>
          <div class="mc-section">
            <div class="mc-label">X-Ray</div>
            <button type="button" class="mc-small-button" id="minibia-copilot-xray-overlay-toggle">Disable Overlay</button>
            <div class="mc-small-note" id="minibia-copilot-xray-overlay-status">Overlay: on</div>
            <label class="mc-field" for="minibia-copilot-xray-floor-select">
              <span class="mc-field-label">Floor Filter</span>
              <select id="minibia-copilot-xray-floor-select">
                <option value="all">All floors</option>
              </select>
            </label>
            <div class="mc-list" id="minibia-copilot-visible-creatures-list"></div>
          </div>
        </div>

        <div class="mc-tab-pane" data-tab="combat" hidden>
          <div class="mc-section">
            <div class="mc-label">Auto Attack</div>
            <div class="mc-stack">
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-auto-attack-enabled" />
                <span>Enable Auto Attack</span>
              </label>
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-auto-attack-melee" />
                <span>Melee Mode</span>
              </label>
              <div class="mc-priority-block">
                <div class="mc-field-label">Priority Targets (top = first)</div>
                <div class="mc-inline">
                  <input type="text" id="minibia-copilot-attack-priority-input" placeholder="Monster name" />
                  <button type="button" class="mc-small-button" id="minibia-copilot-attack-priority-add">Add</button>
                </div>
                <div class="mc-list" id="minibia-copilot-attack-priority-list"></div>
                <div class="mc-small-note">Adjacent monsters always get attacked first (so blockers die), then priority list, then nearest. Case-insensitive.</div>
              </div>
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-auto-attack-kite" />
                <span>Kite when too close (non-melee)</span>
              </label>
              <label class="mc-field" for="minibia-copilot-auto-attack-safe-distance">
                <span class="mc-field-label">Kite distance (sqm)</span>
                <input type="number" id="minibia-copilot-auto-attack-safe-distance" min="1" max="7" placeholder="4" />
              </label>
              <details>
                <summary style="cursor:pointer;color:#8c7a52;font-size:11px;">Advanced (rune hotkey)</summary>
                <div class="mc-stack" style="margin-top:6px;">
                  <label class="mc-field" for="minibia-copilot-auto-attack-rune-hotkey">
                    <span class="mc-field-label">Rune Hotkey (1-12)</span>
                    <input type="number" id="minibia-copilot-auto-attack-rune-hotkey" min="1" max="12" placeholder="optional" />
                  </label>
                </div>
              </details>
            </div>
          </div>

          <div class="mc-section">
            <div class="mc-label">Auto Utamo Vita</div>
            <label class="mc-toggle">
              <input type="checkbox" id="minibia-copilot-auto-magic-shield-enabled" />
              <span>Re-cast magic shield when down</span>
            </label>
            <div class="mc-small-note">Casts utamo vita whenever magic shield is not active.</div>
          </div>

          <div class="mc-section">
            <div class="mc-label">Auto Invisible</div>
            <label class="mc-toggle">
              <input type="checkbox" id="minibia-copilot-auto-invisible-enabled" />
              <span>Re-cast invisibility when down</span>
            </label>
            <div class="mc-small-note">Casts utana vid whenever invisibility is not active.</div>
          </div>
        </div>

        <div class="mc-tab-pane" data-tab="survival" hidden>
          <div class="mc-section">
            <div class="mc-label">Auto Heal</div>
            <div class="mc-stack">
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-auto-heal-enabled" />
                <span>Enable Auto Heal</span>
              </label>
              <div class="mc-field-grid">
                <label class="mc-field" for="minibia-copilot-auto-heal-min-hp">
                  <span class="mc-field-label">Minimum HP</span>
                  <input type="number" id="minibia-copilot-auto-heal-min-hp" min="0" placeholder="250" />
                </label>
                <label class="mc-field" for="minibia-copilot-auto-heal-hp-hotkey">
                  <span class="mc-field-label">HP Hotkey (1-12)</span>
                  <input type="number" id="minibia-copilot-auto-heal-hp-hotkey" min="1" max="12" placeholder="1" />
                </label>
                <label class="mc-field" for="minibia-copilot-auto-heal-min-mana">
                  <span class="mc-field-label">Minimum Mana</span>
                  <input type="number" id="minibia-copilot-auto-heal-min-mana" min="0" placeholder="150" />
                </label>
                <label class="mc-field" for="minibia-copilot-auto-heal-mana-hotkey">
                  <span class="mc-field-label">Mana Hotkey (1-12)</span>
                  <input type="number" id="minibia-copilot-auto-heal-mana-hotkey" min="1" max="12" placeholder="2" />
                </label>
              </div>
              <div class="mc-small-note">Polled ~20×/sec. HP fires before mana.</div>
            </div>
          </div>

          <div class="mc-section">
            <div class="mc-label">Auto Eat</div>
            <label class="mc-toggle">
              <input type="checkbox" id="minibia-copilot-auto-eat-enabled" />
              <span>Enable Auto Eat</span>
            </label>
            <label class="mc-field" for="minibia-copilot-auto-eat-hotkey">
              <span class="mc-field-label">Eat Hotkey (1-12)</span>
              <input type="number" id="minibia-copilot-auto-eat-hotkey" min="1" max="12" placeholder="10" />
            </label>
          </div>

          <div class="mc-section">
            <div class="mc-label">Equip Ring</div>
            <div class="mc-stack">
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-equip-ring-enabled" />
                <span>Keep ring equipped</span>
              </label>
              <label class="mc-field" for="minibia-copilot-equip-ring-type">
                <span class="mc-field-label">Ring type</span>
                <select id="minibia-copilot-equip-ring-type">
                  <option value="">Any ring</option>
                  <option value="life ring">Life Ring</option>
                  <option value="ring of healing">Ring of Healing</option>
                  <option value="energy ring">Energy Ring</option>
                  <option value="power ring">Power Ring</option>
                  <option value="time ring">Time Ring</option>
                  <option value="axe ring">Axe Ring</option>
                  <option value="sword ring">Sword Ring</option>
                  <option value="club ring">Club Ring</option>
                  <option value="dwarven ring">Dwarven Ring</option>
                  <option value="stealth ring">Stealth Ring</option>
                  <option value="gold ring">Gold Ring</option>
                  <option value="wedding ring">Wedding Ring</option>
                </select>
              </label>
              <label class="mc-field" for="minibia-copilot-equip-ring-custom">
                <span class="mc-field-label">Custom (overrides dropdown)</span>
                <input type="text" id="minibia-copilot-equip-ring-custom" placeholder="e.g. might ring" />
              </label>
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-equip-ring-autoswap" />
                <span>Auto-swap wrong ring to backpack</span>
              </label>
              <div class="mc-small-note">Auto-swap moves any non-matching ring to the first empty backpack slot, then equips the chosen ring on the next tick.</div>
            </div>
          </div>

          <div class="mc-section">
            <div class="mc-label">Equip Amulet</div>
            <div class="mc-stack">
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-equip-amulet-enabled" />
                <span>Keep amulet equipped</span>
              </label>
              <label class="mc-field" for="minibia-copilot-equip-amulet-type">
                <span class="mc-field-label">Amulet type</span>
                <select id="minibia-copilot-equip-amulet-type">
                  <option value="">Any amulet</option>
                  <option value="stone skin amulet">Stone Skin Amulet</option>
                  <option value="amulet of loss">Amulet of Loss</option>
                  <option value="sacred tree amulet">Sacred Tree Amulet</option>
                  <option value="dragon necklace">Dragon Necklace</option>
                  <option value="elven amulet">Elven Amulet</option>
                  <option value="garlic necklace">Garlic Necklace</option>
                  <option value="protection amulet">Protection Amulet</option>
                  <option value="strange talisman">Strange Talisman</option>
                  <option value="silver amulet">Silver Amulet</option>
                  <option value="bronze amulet">Bronze Amulet</option>
                  <option value="scarab amulet">Scarab Amulet</option>
                </select>
              </label>
              <label class="mc-field" for="minibia-copilot-equip-amulet-custom">
                <span class="mc-field-label">Custom (overrides dropdown)</span>
                <input type="text" id="minibia-copilot-equip-amulet-custom" placeholder="e.g. might necklace" />
              </label>
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-equip-amulet-autoswap" />
                <span>Auto-swap wrong amulet to backpack</span>
              </label>
              <div class="mc-small-note">Defaults to Stone Skin Amulet. Auto-swap requires at least one empty backpack slot.</div>
            </div>
          </div>

          <div class="mc-section">
            <div class="mc-label">Lootbag</div>
            <div class="mc-stack">
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-lootbag-enabled" />
                <span>Drop matching items to ground</span>
              </label>
              <div class="mc-inline">
                <input type="text" id="minibia-copilot-lootbag-input" placeholder="Item name" />
                <button type="button" class="mc-small-button" id="minibia-copilot-lootbag-add">Add</button>
              </div>
              <div class="mc-list" id="minibia-copilot-lootbag-list"></div>
              <div class="mc-actions mc-actions-inline-two">
                <button type="button" class="mc-small-button" id="minibia-copilot-lootbag-drop-now">Drop Now</button>
                <button type="button" class="mc-small-button" id="minibia-copilot-lootbag-clear">Clear List</button>
              </div>
              <div class="mc-small-note" id="minibia-copilot-lootbag-status">Status: idle</div>
              <div class="mc-small-note">Scans open backpacks every 1.5s. Items go to the tile under your character. Won't drop while in a PZ. Case-insensitive name match (prefix-aware: "small gold coin" matches "small gold coin (12)").</div>
            </div>
          </div>

          <div class="mc-section">
            <div class="mc-label">Magic Wall Timer</div>
            <div class="mc-stack">
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-magic-wall-enabled" />
                <span>Show on-screen MW timer</span>
              </label>
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-magic-wall-audio" />
                <span>Alarm at lead time</span>
              </label>
              <div class="mc-field-grid">
                <label class="mc-field" for="minibia-copilot-magic-wall-duration">
                  <span class="mc-field-label">Duration (s)</span>
                  <input type="number" id="minibia-copilot-magic-wall-duration" min="1" max="120" placeholder="20" />
                </label>
                <label class="mc-field" for="minibia-copilot-magic-wall-lead">
                  <span class="mc-field-label">Lead (s)</span>
                  <input type="number" id="minibia-copilot-magic-wall-lead" min="0" max="20" placeholder="3" />
                </label>
              </div>
              <div class="mc-small-note" id="minibia-copilot-magic-wall-status">Status: idle</div>
            </div>
          </div>

          <div class="mc-section">
            <div class="mc-label" id="minibia-copilot-home">Panic Runner Home: not set</div>
            <div class="mc-stack">
              <button type="button" id="minibia-copilot-set-home">Set Home (current tile)</button>
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-panic-unknown" />
                <span>Trigger on unknown player</span>
              </label>
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-panic-health" />
                <span>Trigger on health loss</span>
              </label>
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-panic-return" />
                <span>Auto return after threat</span>
              </label>
              <div class="mc-field-label">Trusted names</div>
              <div class="mc-inline">
                <input type="text" id="minibia-copilot-panic-trusted-input" placeholder="Add name" />
                <button type="button" class="mc-small-button" id="minibia-copilot-panic-trusted-add">Add</button>
              </div>
              <div class="mc-list" id="minibia-copilot-panic-trusted-list"></div>
            </div>
          </div>

          <div class="mc-section">
            <div class="mc-label">GM Kill Switch</div>
            <div class="mc-stack">
              <div class="mc-inline">
                <input type="text" id="minibia-copilot-panic-gm-input" placeholder="Game master name" />
                <button type="button" class="mc-small-button" id="minibia-copilot-panic-gm-add">Add</button>
              </div>
              <div class="mc-list" id="minibia-copilot-panic-gm-list"></div>
            </div>
          </div>
        </div>

        <div class="mc-tab-pane" data-tab="navigation" hidden>
          <div class="mc-section">
            <div class="mc-label">Cave Bot</div>
            <div class="mc-stack">
              <label class="mc-field" for="minibia-copilot-cave-preset-select">
                <span class="mc-field-label">Active preset</span>
                <select id="minibia-copilot-cave-preset-select"></select>
              </label>
              <div class="mc-actions mc-actions-inline-two">
                <button type="button" class="mc-small-button" id="minibia-copilot-cave-preset-new">New Preset</button>
                <button type="button" class="mc-small-button" id="minibia-copilot-cave-preset-delete">Delete</button>
              </div>
              <div class="mc-field-label">Record waypoint at current spot</div>
              <div class="mc-actions mc-actions-inline-two">
                <button type="button" class="mc-small-button" id="minibia-copilot-cave-record">+ Node</button>
                <button type="button" class="mc-small-button" id="minibia-copilot-cave-record-stand">+ Stand</button>
              </div>
              <div class="mc-actions mc-actions-inline-three">
                <button type="button" class="mc-small-button" id="minibia-copilot-cave-record-rope">+ Rope</button>
                <button type="button" class="mc-small-button" id="minibia-copilot-cave-record-ladder">+ Ladder</button>
                <button type="button" class="mc-small-button" id="minibia-copilot-cave-record-shovel">+ Shovel</button>
              </div>
              <div class="mc-actions mc-actions-inline-two">
                <button type="button" class="mc-small-button" id="minibia-copilot-cave-record-use">+ Use Tile</button>
                <button type="button" class="mc-small-button" id="minibia-copilot-cave-remove-last">Remove Last</button>
              </div>
              <div class="mc-small-note" id="minibia-copilot-cave-closest">Closest start: no waypoints</div>
              <div class="mc-small-note" id="minibia-copilot-cave-transition-status">Transitions learned: none</div>
              <div class="mc-actions mc-actions-inline-two">
                <button type="button" class="mc-small-button" id="minibia-copilot-cave-start">Start</button>
                <button type="button" class="mc-small-button" id="minibia-copilot-cave-stop">Stop</button>
              </div>
              <div class="mc-small-note" id="minibia-copilot-cave-status">Status: no waypoints</div>
            </div>
          </div>
        </div>

        <div class="mc-tab-pane" data-tab="utility" hidden>
          <div class="mc-section">
            <div class="mc-label">Magic Level Trainer</div>
            <div class="mc-stack">
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-rune-enabled" />
                <span>Enable rune loop</span>
              </label>
              <label class="mc-field" for="minibia-copilot-rune-spell">
                <span class="mc-field-label">Spell words</span>
                <input type="text" id="minibia-copilot-rune-spell" placeholder="adori vita vis" />
              </label>
              <label class="mc-field" for="minibia-copilot-rune-mana">
                <span class="mc-field-label">Mana per cast</span>
                <input type="number" id="minibia-copilot-rune-mana" min="0" placeholder="600" />
              </label>
            </div>
          </div>

          <div class="mc-section">
            <div class="mc-label">Talk (Chat AI)</div>
            <div class="mc-stack">
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-talk-enabled" />
                <span>Enable Auto Reply</span>
              </label>
              <label class="mc-field" for="minibia-copilot-talk-api-key">
                <span class="mc-field-label">Gemini API key</span>
                <input type="password" id="minibia-copilot-talk-api-key" placeholder="paste key" />
              </label>
              <label class="mc-field" for="minibia-copilot-talk-prompt">
                <span class="mc-field-label">Reply style prompt</span>
                <textarea id="minibia-copilot-talk-prompt" placeholder="e.g. terse, in-character"></textarea>
              </label>
              <div class="mc-small-note" id="minibia-copilot-talk-status">Status: idle</div>
              <div class="mc-small-note">Replies only to the newest unseen message in Default chat. Won't admit it is a bot.</div>
            </div>
          </div>
        </div>

        <div class="mc-tab-pane" data-tab="deaths" hidden>
          <div class="mc-section">
            <div class="mc-label">Tracker</div>
            <div class="mc-stack">
              <label class="mc-toggle">
                <input type="checkbox" id="minibia-copilot-tracker-enabled" />
                <span>Poll minibia.com</span>
              </label>
              <label class="mc-field" for="minibia-copilot-tracker-interval">
                <span class="mc-field-label">Poll interval (sec)</span>
                <input type="number" id="minibia-copilot-tracker-interval" min="30" max="600" placeholder="120" />
              </label>
              <div class="mc-small-note" id="minibia-copilot-tracker-status">Status: idle</div>
            </div>
          </div>

          <div class="mc-subtabs" id="minibia-copilot-tracker-subtabs">
            <button type="button" class="mc-subtab-button" data-subtab="enemy">⚔ Enemy</button>
            <button type="button" class="mc-subtab-button" data-subtab="friendly">🛡 Friendly</button>
          </div>

          <div class="mc-section">
            <div class="mc-label" id="minibia-copilot-tracker-list-label">Tracked Enemies</div>
            <div class="mc-stack">
              <div class="mc-inline">
                <input type="text" id="minibia-copilot-tracker-add-input" placeholder="Character name" />
                <button type="button" class="mc-small-button" id="minibia-copilot-tracker-add">Add</button>
              </div>
              <div class="mc-list" id="minibia-copilot-tracker-list"></div>
            </div>
          </div>

          <div class="mc-section">
            <div class="mc-label" id="minibia-copilot-tracker-deaths-label">Recent Enemy Deaths (last 30 min)</div>
            <div class="mc-stack">
              <div class="mc-list" id="minibia-copilot-tracker-deaths"></div>
              <div class="mc-actions mc-actions-inline-two">
                <button type="button" class="mc-small-button" id="minibia-copilot-tracker-refresh">Refresh Now</button>
                <button type="button" class="mc-small-button" id="minibia-copilot-tracker-clear">Clear Deaths</button>
              </div>
            </div>
          </div>
        </div>

      </div>
    `;
    document.body.appendChild(panel);

    const unlockAudio = () => {
      bot.unlockAudio?.();
    };

    panel.addEventListener("pointerdown", unlockAudio, { passive: true });
    panel.addEventListener("keydown", unlockAudio);

    bot.addCleanup(() => {
      panel.removeEventListener("pointerdown", unlockAudio);
      panel.removeEventListener("keydown", unlockAudio);
    });

    applySavedPanelPosition(panel);
    enableDrag(panel);
    setPanelCollapsed(panel, getSavedPanelCollapsed());

    const spellInput = panel.querySelector("#minibia-copilot-rune-spell");
    const manaInput = panel.querySelector("#minibia-copilot-rune-mana");
    const runeEnabledInput = panel.querySelector("#minibia-copilot-rune-enabled");
    const autoEatEnabledInput = panel.querySelector("#minibia-copilot-auto-eat-enabled");
    const autoEatHotkeyInput = panel.querySelector("#minibia-copilot-auto-eat-hotkey");
    const autoInvisibleEnabledInput = panel.querySelector("#minibia-copilot-auto-invisible-enabled");
    const autoMagicShieldEnabledInput = panel.querySelector("#minibia-copilot-auto-magic-shield-enabled");
    const equipRingEnabledInput = panel.querySelector("#minibia-copilot-equip-ring-enabled");
    const equipRingTypeSelect = panel.querySelector("#minibia-copilot-equip-ring-type");
    const equipRingCustomInput = panel.querySelector("#minibia-copilot-equip-ring-custom");
    const equipRingAutoSwapInput = panel.querySelector("#minibia-copilot-equip-ring-autoswap");
    const equipAmuletEnabledInput = panel.querySelector("#minibia-copilot-equip-amulet-enabled");
    const equipAmuletTypeSelect = panel.querySelector("#minibia-copilot-equip-amulet-type");
    const equipAmuletCustomInput = panel.querySelector("#minibia-copilot-equip-amulet-custom");
    const equipAmuletAutoSwapInput = panel.querySelector("#minibia-copilot-equip-amulet-autoswap");
    const alphaWatchEnabledInput = panel.querySelector("#minibia-copilot-alpha-watch-enabled");
    const fightOpenButton = panel.querySelector("#minibia-copilot-fight-open");
    if (fightOpenButton) {
      fightOpenButton.addEventListener("click", () => openFightModal());
    }
    const lootbagEnabledInput = panel.querySelector("#minibia-copilot-lootbag-enabled");
    const lootbagInput = panel.querySelector("#minibia-copilot-lootbag-input");
    const lootbagAddButton = panel.querySelector("#minibia-copilot-lootbag-add");
    const lootbagList = panel.querySelector("#minibia-copilot-lootbag-list");
    const lootbagDropNowButton = panel.querySelector("#minibia-copilot-lootbag-drop-now");
    const lootbagClearButton = panel.querySelector("#minibia-copilot-lootbag-clear");

    if (lootbagEnabledInput) {
      lootbagEnabledInput.addEventListener("change", () => {
        if (lootbagEnabledInput.checked) {
          bot.lootbag?.start?.();
        } else {
          bot.lootbag?.stop?.();
        }
        refreshLootbagStatus();
      });
    }

    function addLootbagItemFromInput() {
      const name = lootbagInput?.value?.trim() || "";
      if (!name) return;
      bot.lootbag?.addItem?.(name);
      if (lootbagInput) lootbagInput.value = "";
      refreshLootbagStatus();
    }

    if (lootbagAddButton) {
      lootbagAddButton.addEventListener("click", addLootbagItemFromInput);
    }
    if (lootbagInput) {
      lootbagInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addLootbagItemFromInput();
        }
      });
    }

    if (lootbagList) {
      lootbagList.addEventListener("click", (event) => {
        const removeTarget = event.target.closest("[data-lootbag-remove]");
        if (!removeTarget) return;
        const name = removeTarget.getAttribute("data-lootbag-remove");
        if (!name) return;
        bot.lootbag?.removeItem?.(name);
        refreshLootbagStatus();
      });
    }

    if (lootbagDropNowButton) {
      lootbagDropNowButton.addEventListener("click", () => {
        bot.lootbag?.dropNow?.();
        window.setTimeout(refreshLootbagStatus, 200);
      });
    }

    if (lootbagClearButton) {
      lootbagClearButton.addEventListener("click", () => {
        bot.lootbag?.updateConfig?.({ items: [] });
        refreshLootbagStatus();
      });
    }

    const trackerEnabledInput = panel.querySelector("#minibia-copilot-tracker-enabled");
    const trackerIntervalInput = panel.querySelector("#minibia-copilot-tracker-interval");
    const trackerAddInput = panel.querySelector("#minibia-copilot-tracker-add-input");
    const trackerAddButton = panel.querySelector("#minibia-copilot-tracker-add");
    const trackerList = panel.querySelector("#minibia-copilot-tracker-list");
    const trackerRefreshButton = panel.querySelector("#minibia-copilot-tracker-refresh");
    const trackerClearButton = panel.querySelector("#minibia-copilot-tracker-clear");
    const autoHealEnabledInput = panel.querySelector("#minibia-copilot-auto-heal-enabled");
    const autoHealMinHpInput = panel.querySelector("#minibia-copilot-auto-heal-min-hp");
    const autoHealHpHotkeyInput = panel.querySelector("#minibia-copilot-auto-heal-hp-hotkey");
    const autoHealMinManaInput = panel.querySelector("#minibia-copilot-auto-heal-min-mana");
    const autoHealManaHotkeyInput = panel.querySelector("#minibia-copilot-auto-heal-mana-hotkey");
    const autoAttackEnabledInput = panel.querySelector("#minibia-copilot-auto-attack-enabled");
    const autoAttackMeleeInput = panel.querySelector("#minibia-copilot-auto-attack-melee");
    const autoAttackRuneHotkeyInput = panel.querySelector("#minibia-copilot-auto-attack-rune-hotkey");
    const autoAttackSafeDistanceInput = panel.querySelector("#minibia-copilot-auto-attack-safe-distance");
    const autoAttackKiteInput = panel.querySelector("#minibia-copilot-auto-attack-kite");
    const talkEnabledInput = panel.querySelector("#minibia-copilot-talk-enabled");
    const talkApiKeyInput = panel.querySelector("#minibia-copilot-talk-api-key");
    const talkPromptInput = panel.querySelector("#minibia-copilot-talk-prompt");
    const panicGmNameInput = panel.querySelector("#minibia-copilot-panic-gm-input");
    const panicGmAddButton = panel.querySelector("#minibia-copilot-panic-gm-add");
    const panicUnknownInput = panel.querySelector("#minibia-copilot-panic-unknown");
    const panicHealthInput = panel.querySelector("#minibia-copilot-panic-health");
    const panicReturnInput = panel.querySelector("#minibia-copilot-panic-return");
    const panicTrustedInput = panel.querySelector("#minibia-copilot-panic-trusted-input");
    const panicTrustedAddButton = panel.querySelector("#minibia-copilot-panic-trusted-add");
    const xrayOverlayButton = panel.querySelector("#minibia-copilot-xray-overlay-toggle");
    const xrayFloorSelect = panel.querySelector("#minibia-copilot-xray-floor-select");
    const collapseButton = panel.querySelector("#minibia-copilot-collapse");
    const reloadButton = panel.querySelector("#minibia-copilot-reload");
    const cavePauseToggle = panel.querySelector("#minibia-copilot-pause-toggle");
    const caveRecordButton = panel.querySelector("#minibia-copilot-cave-record");
    const caveRemoveLastButton = panel.querySelector("#minibia-copilot-cave-remove-last");
    const caveStartButton = panel.querySelector("#minibia-copilot-cave-start");
    const caveStopButton = panel.querySelector("#minibia-copilot-cave-stop");
    const cavePresetSelect = panel.querySelector("#minibia-copilot-cave-preset-select");
    const cavePresetNewButton = panel.querySelector("#minibia-copilot-cave-preset-new");
    const cavePresetDeleteButton = panel.querySelector("#minibia-copilot-cave-preset-delete");
    const caveRecordRopeButton = panel.querySelector("#minibia-copilot-cave-record-rope");
    const caveRecordLadderButton = panel.querySelector("#minibia-copilot-cave-record-ladder");
    const caveRecordShovelButton = panel.querySelector("#minibia-copilot-cave-record-shovel");
    const caveRecordUseButton = panel.querySelector("#minibia-copilot-cave-record-use");
    const caveRecordStandButton = panel.querySelector("#minibia-copilot-cave-record-stand");
    const magicWallEnabledInput = panel.querySelector("#minibia-copilot-magic-wall-enabled");
    const magicWallAudioInput = panel.querySelector("#minibia-copilot-magic-wall-audio");
    const magicWallDurationInput = panel.querySelector("#minibia-copilot-magic-wall-duration");
    const magicWallLeadInput = panel.querySelector("#minibia-copilot-magic-wall-lead");
    const huntRefreshButton = panel.querySelector("#minibia-copilot-hunt-refresh");
    const huntStartButton = panel.querySelector("#minibia-copilot-hunt-start");
    const huntStopButton = panel.querySelector("#minibia-copilot-hunt-stop");
    const huntResetButton = panel.querySelector("#minibia-copilot-hunt-reset");
    const huntPauseButton = panel.querySelector("#minibia-copilot-hunt-pause");
    const huntAutoPollInput = panel.querySelector("#minibia-copilot-hunt-autopoll");

    if (collapseButton) {
      collapseButton.addEventListener("click", () => {
        const isCollapsed = panel.dataset.collapsed === "true";
        setPanelCollapsed(panel, !isCollapsed);
      });
    }

    if (reloadButton) {
      reloadButton.addEventListener("click", () => {
        window.minibiaCopilotReload?.();
      });
    }

    function refreshPauseToggle() {
      if (!cavePauseToggle) return;
      const paused = typeof bot.isAllPaused === "function"
        ? bot.isAllPaused()
        : !!bot.cave?.isPaused?.();
      cavePauseToggle.textContent = paused ? "▶" : "⏸";
      cavePauseToggle.dataset.paused = paused ? "true" : "false";
      cavePauseToggle.setAttribute("title", paused ? "Resume all bot actions" : "Pause all bot actions");
      cavePauseToggle.setAttribute("aria-label", paused ? "Resume all bot actions" : "Pause all bot actions");
    }

    if (cavePauseToggle) {
      cavePauseToggle.addEventListener("click", () => {
        if (typeof bot.toggleAllPaused === "function") {
          bot.toggleAllPaused();
        } else if (bot.cave?.togglePause) {
          bot.cave.togglePause();
        }
        refreshPauseToggle();
        refreshCaveStatus();
      });
      refreshPauseToggle();
      const pauseTimerId = window.setInterval(refreshPauseToggle, 1000);
      bot.addCleanup(() => window.clearInterval(pauseTimerId));
    }

    function addTrustedName() {
      const rawName = panicTrustedInput?.value?.trim() || "";
      if (!rawName) {
        return;
      }

      const currentNames = bot.panic?.config?.trustedNames || [];
      const exists = currentNames.some(
        (name) => String(name).trim().toLowerCase() === rawName.toLowerCase()
      );

      if (!exists) {
        bot.panic.updateConfig({ trustedNames: [...currentNames, rawName] });
      }

      if (panicTrustedInput) {
        panicTrustedInput.value = "";
      }

      renderTrustedNames();
    }

    function addGameMasterName() {
      const rawName = panicGmNameInput?.value?.trim() || "";
      if (!rawName) {
        return;
      }

      const currentNames = bot.panic?.config?.gameMasterNames || [];
      const exists = currentNames.some(
        (name) => String(name).trim().toLowerCase() === rawName.toLowerCase()
      );

      if (!exists) {
        bot.panic.updateConfig({ gameMasterNames: [...currentNames, rawName] });
      }

      if (panicGmNameInput) {
        panicGmNameInput.value = "";
      }

      renderGameMasterNames();
    }

    if (panicGmAddButton) {
      panicGmAddButton.addEventListener("click", addGameMasterName);
    }

    if (panicGmNameInput) {
      panicGmNameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addGameMasterName();
        }
      });
    }

    if (panicTrustedAddButton) {
      panicTrustedAddButton.addEventListener("click", addTrustedName);
    }

    if (panicTrustedInput) {
      panicTrustedInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addTrustedName();
        }
      });
    }

    if (spellInput) {
      spellInput.value = bot.rune?.config?.runeSpellWords || "";
      spellInput.addEventListener("change", () => {
        bot.rune.updateConfig({ runeSpellWords: spellInput.value.trim() });
      });
    }

    if (manaInput) {
      manaInput.value = String(bot.rune?.config?.runeManaCost ?? 0);
      manaInput.addEventListener("change", () => {
        const runeManaCost = Math.max(0, Number(manaInput.value) || 0);
        manaInput.value = String(runeManaCost);
        bot.rune.updateConfig({ runeManaCost });
      });
    }

    if (runeEnabledInput) {
      runeEnabledInput.checked = !!bot.rune?.status?.().running;
      runeEnabledInput.addEventListener("change", () => {
        const runeSpellWords = spellInput?.value?.trim() || bot.rune.config.runeSpellWords;
        const runeManaCost = Math.max(0, Number(manaInput?.value) || bot.rune.config.runeManaCost || 0);

        if (runeEnabledInput.checked) {
          bot.rune.start({ runeSpellWords, runeManaCost });
        } else {
          bot.rune.stop();
        }

        refreshRuneStatus();
      });
    }

    if (autoEatHotkeyInput) {
      autoEatHotkeyInput.value = String(bot.eat?.config?.eatHotbarSlot ?? 10);
      autoEatHotkeyInput.addEventListener("change", () => {
        const eatHotbarSlot = Math.min(12, Math.max(1, Number(autoEatHotkeyInput.value) || 1));
        autoEatHotkeyInput.value = String(eatHotbarSlot);
        bot.eat.updateConfig({ eatHotbarSlot });
      });
    }

    if (autoEatEnabledInput) {
      autoEatEnabledInput.checked = !!bot.eat?.status?.().running;
      autoEatEnabledInput.addEventListener("change", () => {
        const eatHotbarSlot = Math.min(
          12,
          Math.max(1, Number(autoEatHotkeyInput?.value) || bot.eat.config.eatHotbarSlot || 1)
        );

        if (autoEatEnabledInput.checked) {
          bot.eat.start({ eatHotbarSlot });
        } else {
          bot.eat.stop();
        }

        refreshAutoEatStatus();
      });
    }

    if (autoInvisibleEnabledInput) {
      autoInvisibleEnabledInput.checked = !!bot.invisible?.status?.().running;
      autoInvisibleEnabledInput.addEventListener("change", () => {
        if (autoInvisibleEnabledInput.checked) {
          bot.invisible.start();
        } else {
          bot.invisible.stop();
        }

        refreshAutoInvisibleStatus();
      });
    }

    if (autoMagicShieldEnabledInput) {
      autoMagicShieldEnabledInput.checked = !!bot.magicShield?.status?.().running;
      autoMagicShieldEnabledInput.addEventListener("change", () => {
        if (autoMagicShieldEnabledInput.checked) {
          bot.magicShield.start();
        } else {
          bot.magicShield.stop();
        }

        refreshAutoMagicShieldStatus();
      });
    }

    if (equipRingEnabledInput) {
      equipRingEnabledInput.checked = !!bot.equipRing?.status?.().running;
      equipRingEnabledInput.addEventListener("change", () => {
        if (equipRingEnabledInput.checked) {
          bot.equipRing.start();
        } else {
          bot.equipRing.stop();
        }

        refreshEquipRingStatus();
      });
    }

    const initialRingName = String(bot.equipRing?.config?.ringName || "").trim();
    const knownPresetValues = equipRingTypeSelect
      ? Array.from(equipRingTypeSelect.options).map((option) => option.value)
      : [];
    const initialIsPreset = knownPresetValues.includes(initialRingName.toLowerCase());
    if (equipRingTypeSelect) {
      equipRingTypeSelect.value = initialIsPreset ? initialRingName.toLowerCase() : "";
    }
    if (equipRingCustomInput) {
      equipRingCustomInput.value = initialIsPreset ? "" : initialRingName;
    }

    function applyRingName() {
      const custom = equipRingCustomInput?.value?.trim() || "";
      const preset = equipRingTypeSelect?.value?.trim() || "";
      bot.equipRing?.updateConfig?.({ ringName: custom || preset });
    }

    if (equipRingTypeSelect) {
      equipRingTypeSelect.addEventListener("change", applyRingName);
    }
    if (equipRingCustomInput) {
      equipRingCustomInput.addEventListener("change", applyRingName);
    }

    if (equipRingAutoSwapInput) {
      equipRingAutoSwapInput.checked = !!bot.equipRing?.config?.autoSwap;
      equipRingAutoSwapInput.addEventListener("change", () => {
        bot.equipRing?.updateConfig?.({ autoSwap: equipRingAutoSwapInput.checked });
      });
    }

    if (equipAmuletEnabledInput) {
      equipAmuletEnabledInput.checked = !!bot.equipAmulet?.status?.().running;
      equipAmuletEnabledInput.addEventListener("change", () => {
        if (equipAmuletEnabledInput.checked) {
          bot.equipAmulet?.start?.();
        } else {
          bot.equipAmulet?.stop?.();
        }
      });
    }

    const initialAmuletName = String(bot.equipAmulet?.config?.amuletName || "").trim();
    const amuletPresetValues = equipAmuletTypeSelect
      ? Array.from(equipAmuletTypeSelect.options).map((option) => option.value)
      : [];
    const initialAmuletIsPreset = amuletPresetValues.includes(initialAmuletName.toLowerCase());
    if (equipAmuletTypeSelect) {
      equipAmuletTypeSelect.value = initialAmuletIsPreset ? initialAmuletName.toLowerCase() : "";
    }
    if (equipAmuletCustomInput) {
      equipAmuletCustomInput.value = initialAmuletIsPreset ? "" : initialAmuletName;
    }

    function applyAmuletName() {
      const custom = equipAmuletCustomInput?.value?.trim() || "";
      const preset = equipAmuletTypeSelect?.value?.trim() || "";
      bot.equipAmulet?.updateConfig?.({ amuletName: custom || preset });
    }

    if (equipAmuletTypeSelect) {
      equipAmuletTypeSelect.addEventListener("change", applyAmuletName);
    }
    if (equipAmuletCustomInput) {
      equipAmuletCustomInput.addEventListener("change", applyAmuletName);
    }

    if (equipAmuletAutoSwapInput) {
      equipAmuletAutoSwapInput.checked = !!bot.equipAmulet?.config?.autoSwap;
      equipAmuletAutoSwapInput.addEventListener("change", () => {
        bot.equipAmulet?.updateConfig?.({ autoSwap: equipAmuletAutoSwapInput.checked });
      });
    }

    if (alphaWatchEnabledInput) {
      alphaWatchEnabledInput.addEventListener("change", () => {
        if (alphaWatchEnabledInput.checked) {
          bot.alphaWatch?.start?.();
        } else {
          bot.alphaWatch?.stop?.();
        }
        refreshAlphaWatchStatus();
      });
    }

    if (trackerEnabledInput) {
      trackerEnabledInput.addEventListener("change", () => {
        if (trackerEnabledInput.checked) {
          bot.tracker?.start?.();
        } else {
          bot.tracker?.stop?.();
        }
        refreshTrackerStatus();
      });
    }

    if (trackerIntervalInput) {
      trackerIntervalInput.addEventListener("change", () => {
        const seconds = Math.max(30, Math.min(600, Number(trackerIntervalInput.value) || 120));
        trackerIntervalInput.value = String(seconds);
        bot.tracker?.updateConfig?.({ pollIntervalMs: seconds * 1000 });
        refreshTrackerStatus();
      });
    }

    function addTrackedFromInput() {
      const name = trackerAddInput?.value?.trim() || "";
      if (!name) return;
      bot.tracker?.addTracked?.(name, activeTrackerSubtab);
      if (trackerAddInput) trackerAddInput.value = "";
      refreshTrackerStatus();
    }

    if (trackerAddButton) {
      trackerAddButton.addEventListener("click", addTrackedFromInput);
    }
    if (trackerAddInput) {
      trackerAddInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addTrackedFromInput();
        }
      });
    }

    if (trackerList) {
      trackerList.addEventListener("click", (event) => {
        const removeTarget = event.target.closest("[data-tracker-remove]");
        if (removeTarget) {
          const name = removeTarget.getAttribute("data-tracker-remove");
          if (name) {
            bot.tracker?.removeTracked?.(name);
            refreshTrackerStatus();
          }
          return;
        }
        const swapTarget = event.target.closest("[data-tracker-swap]");
        if (swapTarget) {
          const name = swapTarget.getAttribute("data-tracker-swap");
          if (name) {
            const current = bot.tracker?.getPlayerCategory?.(name) || "enemy";
            const next = current === "enemy" ? "friendly" : "enemy";
            bot.tracker?.setCategory?.(name, next);
            refreshTrackerStatus();
          }
          return;
        }
      });
    }

    const trackerSubtabsHost = panel.querySelector("#minibia-copilot-tracker-subtabs");
    if (trackerSubtabsHost) {
      trackerSubtabsHost.querySelectorAll(".mc-subtab-button").forEach((button) => {
        button.addEventListener("click", () => setTrackerSubtab(button.dataset.subtab));
      });
    }

    if (trackerRefreshButton) {
      trackerRefreshButton.addEventListener("click", () => {
        bot.tracker?.pollOnce?.();
        window.setTimeout(refreshTrackerStatus, 500);
      });
    }

    if (trackerClearButton) {
      trackerClearButton.addEventListener("click", () => {
        bot.tracker?.clearDeaths?.();
        refreshTrackerStatus();
      });
    }

    if (caveRecordButton) {
      caveRecordButton.addEventListener("click", () => {
        bot.cave.addWaypointCurrentSpot();
        refreshCavePresetControls();
        refreshCaveClosestStatus();
        refreshCaveTransitionStatus();
      });
    }

    if (caveRemoveLastButton) {
      caveRemoveLastButton.addEventListener("click", () => {
        bot.cave.removeLastWaypoint();
        refreshCavePresetControls();
        refreshCaveStatus();
        refreshCaveClosestStatus();
        refreshCaveTransitionStatus();
      });
    }

    function bindCaveActionRecord(button, recorder) {
      if (!button) return;
      button.addEventListener("click", () => {
        recorder?.();
        refreshCavePresetControls();
        refreshCaveClosestStatus();
        refreshCaveTransitionStatus();
      });
    }

    bindCaveActionRecord(caveRecordRopeButton, () => bot.cave?.addRopeWaypointCurrentSpot?.());
    bindCaveActionRecord(caveRecordLadderButton, () => bot.cave?.addLadderWaypointCurrentSpot?.());
    bindCaveActionRecord(caveRecordShovelButton, () => bot.cave?.addShovelWaypointCurrentSpot?.());
    bindCaveActionRecord(caveRecordUseButton, () => bot.cave?.addUseWaypointCurrentSpot?.());
    bindCaveActionRecord(caveRecordStandButton, () => bot.cave?.addStandWaypointCurrentSpot?.());

    if (magicWallEnabledInput) {
      magicWallEnabledInput.addEventListener("change", () => {
        if (magicWallEnabledInput.checked) {
          bot.magicWall?.start?.();
        } else {
          bot.magicWall?.stop?.();
        }
        refreshMagicWallStatus();
      });
    }

    if (magicWallAudioInput) {
      magicWallAudioInput.addEventListener("change", () => {
        bot.magicWall?.updateConfig?.({ audioOnExpiry: !!magicWallAudioInput.checked });
        refreshMagicWallStatus();
      });
    }

    function applyMagicWallDuration() {
      if (!magicWallDurationInput) return;
      const seconds = Math.max(1, Math.min(120, Number(magicWallDurationInput.value) || 20));
      const status = bot.magicWall?.status?.();
      const next = (status?.config?.patternSpecs || []).map((spec) => {
        if (spec && String(spec.name || "").toLowerCase().includes("magic wall")) {
          return { ...spec, durationMs: seconds * 1000 };
        }
        return spec;
      });
      bot.magicWall?.updateConfig?.({ patternSpecs: next });
      refreshMagicWallStatus();
    }

    if (magicWallDurationInput) {
      magicWallDurationInput.addEventListener("change", applyMagicWallDuration);
    }

    if (magicWallLeadInput) {
      magicWallLeadInput.addEventListener("change", () => {
        const seconds = Math.max(0, Math.min(20, Number(magicWallLeadInput.value) || 3));
        bot.magicWall?.updateConfig?.({ flashLeadMs: seconds * 1000, audioLeadMs: seconds * 1000 });
        refreshMagicWallStatus();
      });
    }

    if (huntRefreshButton) {
      huntRefreshButton.addEventListener("click", () => {
        bot.hunt?.refresh?.();
        window.setTimeout(refreshHuntStatus, 300);
      });
    }
    if (huntStartButton) {
      huntStartButton.addEventListener("click", () => {
        bot.hunt?.startSession?.();
        window.setTimeout(refreshHuntStatus, 300);
      });
    }
    if (huntStopButton) {
      huntStopButton.addEventListener("click", () => {
        bot.hunt?.stopSession?.();
        window.setTimeout(refreshHuntStatus, 300);
      });
    }
    if (huntResetButton) {
      huntResetButton.addEventListener("click", () => {
        bot.hunt?.resetSession?.();
        window.setTimeout(refreshHuntStatus, 300);
      });
    }
    if (huntPauseButton) {
      huntPauseButton.addEventListener("click", () => {
        const info = bot.hunt?.getLastInfo?.();
        if (info?.paused) {
          bot.hunt?.resumeSession?.();
        } else {
          bot.hunt?.pauseSession?.();
        }
        window.setTimeout(refreshHuntStatus, 300);
      });
    }
    if (huntAutoPollInput) {
      huntAutoPollInput.addEventListener("change", () => {
        bot.hunt?.updateConfig?.({ autoPoll: huntAutoPollInput.checked });
        refreshHuntStatus();
      });
    }

    if (caveStartButton) {
      caveStartButton.addEventListener("click", () => {
        bot.cave.start();
        refreshCavePresetControls();
        refreshCaveStatus();
        refreshCaveClosestStatus();
        refreshCaveTransitionStatus();
      });
    }

    if (caveStopButton) {
      caveStopButton.addEventListener("click", () => {
        bot.cave.stop();
        refreshCavePresetControls();
        refreshCaveStatus();
        refreshCaveClosestStatus();
        refreshCaveTransitionStatus();
      });
    }

    if (cavePresetSelect) {
      cavePresetSelect.addEventListener("change", () => {
        const name = cavePresetSelect.value || "";
        const activePresetName = bot.cave?.getActivePresetName?.() || "";
        if (!name || name === activePresetName) {
          refreshCavePresetControls();
          return;
        }

        const loadedPreset = bot.cave.loadPreset(name);
        refreshCavePresetControls();
        refreshCaveStatus();
        refreshCaveClosestStatus();
        refreshCaveTransitionStatus();
      });
    }

    if (cavePresetNewButton) {
      cavePresetNewButton.addEventListener("click", () => {
        const name = window.prompt("Name the new cave preset:");
        if (name == null) {
          return;
        }

        const createdPreset = bot.cave.createPreset(name);
        if (!createdPreset) {
          return;
        }

        refreshCavePresetControls();
        refreshCaveStatus();
        refreshCaveClosestStatus();
        refreshCaveTransitionStatus();
      });
    }

    if (cavePresetDeleteButton) {
      cavePresetDeleteButton.addEventListener("click", () => {
        const name = cavePresetSelect?.value || "";
        if (!name) {
          return;
        }

        const deleted = bot.cave.deletePreset(name);
        if (!deleted) {
          return;
        }

        refreshCavePresetControls();
        refreshCaveStatus();
        refreshCaveClosestStatus();
        refreshCaveTransitionStatus();
      });
    }

    if (autoHealMinHpInput) {
      autoHealMinHpInput.value = String(bot.heal?.config?.minHp ?? 0);
      autoHealMinHpInput.addEventListener("change", () => {
        const minHp = Math.max(0, Number(autoHealMinHpInput.value) || 0);
        autoHealMinHpInput.value = String(minHp);
        bot.heal.updateConfig({ minHp });
      });
    }

    if (autoHealHpHotkeyInput) {
      autoHealHpHotkeyInput.value = String(bot.heal?.config?.hpHotbarSlot ?? 1);
      autoHealHpHotkeyInput.addEventListener("change", () => {
        const hpHotbarSlot = Math.min(12, Math.max(1, Number(autoHealHpHotkeyInput.value) || 1));
        autoHealHpHotkeyInput.value = String(hpHotbarSlot);
        bot.heal.updateConfig({ hpHotbarSlot });
      });
    }

    if (autoHealMinManaInput) {
      autoHealMinManaInput.value = String(bot.heal?.config?.minMana ?? 0);
      autoHealMinManaInput.addEventListener("change", () => {
        const minMana = Math.max(0, Number(autoHealMinManaInput.value) || 0);
        autoHealMinManaInput.value = String(minMana);
        bot.heal.updateConfig({ minMana });
      });
    }

    if (autoHealManaHotkeyInput) {
      autoHealManaHotkeyInput.value = String(bot.heal?.config?.manaHotbarSlot ?? 1);
      autoHealManaHotkeyInput.addEventListener("change", () => {
        const manaHotbarSlot = Math.min(12, Math.max(1, Number(autoHealManaHotkeyInput.value) || 1));
        autoHealManaHotkeyInput.value = String(manaHotbarSlot);
        bot.heal.updateConfig({ manaHotbarSlot });
      });
    }

    if (autoHealEnabledInput) {
      autoHealEnabledInput.checked = !!bot.heal?.status?.().running;
      autoHealEnabledInput.addEventListener("change", () => {
        const minHp = Math.max(0, Number(autoHealMinHpInput?.value) || bot.heal.config.minHp || 0);
        const hpHotbarSlot = Math.min(
          12,
          Math.max(1, Number(autoHealHpHotkeyInput?.value) || bot.heal.config.hpHotbarSlot || 1)
        );
        const minMana = Math.max(0, Number(autoHealMinManaInput?.value) || bot.heal.config.minMana || 0);
        const manaHotbarSlot = Math.min(
          12,
          Math.max(1, Number(autoHealManaHotkeyInput?.value) || bot.heal.config.manaHotbarSlot || 1)
        );

        if (autoHealEnabledInput.checked) {
          bot.heal.start({ minHp, hpHotbarSlot, minMana, manaHotbarSlot });
        } else {
          bot.heal.stop();
        }

        refreshAutoHealStatus();
      });
    }

    if (autoAttackRuneHotkeyInput) {
      autoAttackRuneHotkeyInput.value = bot.attack?.config?.runeHotbarSlot
        ? String(bot.attack.config.runeHotbarSlot)
        : "";
      autoAttackRuneHotkeyInput.addEventListener("change", () => {
        const rawValue = Number(autoAttackRuneHotkeyInput.value);
        const runeHotbarSlot = Number.isFinite(rawValue) && rawValue >= 1 && rawValue <= 12
          ? Math.trunc(rawValue)
          : null;
        autoAttackRuneHotkeyInput.value = runeHotbarSlot ? String(runeHotbarSlot) : "";
        bot.attack.updateConfig({ runeHotbarSlot });
      });
    }

    if (autoAttackMeleeInput) {
      autoAttackMeleeInput.checked = bot.attack?.config?.meleeMode !== false;
      autoAttackMeleeInput.addEventListener("change", () => {
        bot.attack.updateConfig({ meleeMode: autoAttackMeleeInput.checked });
      });
    }

    const attackPriorityInput = panel.querySelector("#minibia-copilot-attack-priority-input");
    const attackPriorityAddButton = panel.querySelector("#minibia-copilot-attack-priority-add");
    const attackPriorityList = panel.querySelector("#minibia-copilot-attack-priority-list");

    function addPriorityFromInput() {
      const name = attackPriorityInput?.value?.trim() || "";
      if (!name) return;
      bot.attack?.addPriorityTarget?.(name);
      if (attackPriorityInput) attackPriorityInput.value = "";
      refreshAttackPriorityUI();
    }

    if (attackPriorityAddButton) {
      attackPriorityAddButton.addEventListener("click", addPriorityFromInput);
    }
    if (attackPriorityInput) {
      attackPriorityInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addPriorityFromInput();
        }
      });
    }

    if (attackPriorityList) {
      attackPriorityList.addEventListener("click", (event) => {
        const upTarget = event.target.closest("[data-attack-priority-up]");
        if (upTarget) {
          bot.attack?.movePriorityTarget?.(upTarget.getAttribute("data-attack-priority-up"), -1);
          refreshAttackPriorityUI();
          return;
        }
        const downTarget = event.target.closest("[data-attack-priority-down]");
        if (downTarget) {
          bot.attack?.movePriorityTarget?.(downTarget.getAttribute("data-attack-priority-down"), 1);
          refreshAttackPriorityUI();
          return;
        }
        const removeTarget = event.target.closest("[data-attack-priority-remove]");
        if (removeTarget) {
          bot.attack?.removePriorityTarget?.(removeTarget.getAttribute("data-attack-priority-remove"));
          refreshAttackPriorityUI();
        }
      });
    }

    refreshAttackPriorityUI();

    if (autoAttackSafeDistanceInput) {
      autoAttackSafeDistanceInput.value = String(bot.attack?.config?.safeDistance ?? 4);
      autoAttackSafeDistanceInput.addEventListener("change", () => {
        const safeDistance = Math.max(1, Math.min(7, Number(autoAttackSafeDistanceInput.value) || 4));
        autoAttackSafeDistanceInput.value = String(safeDistance);
        bot.attack.updateConfig({ safeDistance });
      });
    }

    if (autoAttackKiteInput) {
      autoAttackKiteInput.checked = bot.attack?.config?.kitingEnabled !== false;
      autoAttackKiteInput.addEventListener("change", () => {
        bot.attack.updateConfig({ kitingEnabled: autoAttackKiteInput.checked });
      });
    }

    if (autoAttackEnabledInput) {
      autoAttackEnabledInput.checked = !!bot.attack?.status?.().running;
      autoAttackEnabledInput.addEventListener("change", () => {
        const runeHotbarSlot = (() => {
          const rawValue = Number(autoAttackRuneHotkeyInput?.value);
          if (Number.isFinite(rawValue) && rawValue >= 1 && rawValue <= 12) {
            return Math.trunc(rawValue);
          }
          return bot.attack.config.runeHotbarSlot ?? null;
        })();
        const meleeMode = !!autoAttackMeleeInput?.checked;

        if (autoAttackEnabledInput.checked) {
          bot.attack.start({ runeHotbarSlot, meleeMode });
        } else {
          bot.attack.stop();
        }

        refreshAutoAttackStatus();
      });
    }

    if (talkApiKeyInput) {
      talkApiKeyInput.value = bot.talk?.config?.apiKey || "";
      talkApiKeyInput.addEventListener("change", () => {
        bot.talk.updateConfig({ apiKey: talkApiKeyInput.value.trim() });
        refreshTalkStatus();
      });
    }

    if (talkPromptInput) {
      talkPromptInput.value = bot.talk?.config?.systemPrompt || "";
      talkPromptInput.addEventListener("change", () => {
        bot.talk.updateConfig({ systemPrompt: talkPromptInput.value.trim() });
      });
    }

    if (talkEnabledInput) {
      talkEnabledInput.checked = !!bot.talk?.status?.().running;
      talkEnabledInput.addEventListener("change", () => {
        if (talkEnabledInput.checked) {
          bot.talk.updateConfig({
            apiKey: talkApiKeyInput?.value?.trim() || "",
            systemPrompt: talkPromptInput?.value?.trim() || bot.talk.config.systemPrompt || "",
          });
          const started = bot.talk.start();
          if (!started) {
            talkEnabledInput.checked = false;
          }
        } else {
          bot.talk.stop();
        }

        refreshTalkStatus();
      });
    }

    if (panicUnknownInput) {
      panicUnknownInput.checked = !!bot.panic?.status?.().config?.unknownPlayerEnabled;
      panicUnknownInput.addEventListener("change", () => {
        bot.panic.updateConfig({ unknownPlayerEnabled: panicUnknownInput.checked });
        refreshPanicStatus();
      });
    }

    if (panicHealthInput) {
      panicHealthInput.checked = !!bot.panic?.status?.().config?.healthLossEnabled;
      panicHealthInput.addEventListener("change", () => {
        bot.panic.updateConfig({ healthLossEnabled: panicHealthInput.checked });
        refreshPanicStatus();
      });
    }

    if (panicReturnInput) {
      panicReturnInput.checked = !!bot.panic?.status?.().config?.returnToOriginEnabled;
      panicReturnInput.addEventListener("change", () => {
        bot.panic.updateConfig({ returnToOriginEnabled: panicReturnInput.checked });
        refreshPanicStatus();
      });
    }

    if (xrayOverlayButton) {
      xrayOverlayButton.addEventListener("click", () => {
        const enabled = !!bot.xray?.status?.().config?.overlayEnabled;
        bot.xray?.setOverlayEnabled?.(!enabled);
        refreshXrayStatus();
      });
    }

    if (xrayFloorSelect) {
      xrayFloorSelect.addEventListener("change", () => {
        const rawValue = xrayFloorSelect.value;
        bot.xray?.setSelectedFloor?.(rawValue === "all" ? null : Number(rawValue));
        refreshXrayStatus();
        refreshVisibleCreatures();
      });
    }

    panel.querySelector("#minibia-copilot-set-home")?.addEventListener("click", () => {
      bot.pz.setHomePzCurrentSpot();
      refreshHomeLabel();
    });

    panel.querySelectorAll(".mc-tab-button").forEach((button) => {
      button.addEventListener("click", () => activateTab(button.dataset.tab));
    });
    const initialTab = bot.storage.get(tabStorageKey, defaultTab) || defaultTab;
    activateTab(initialTab);
    refreshPlayerSnapshot();
    refreshStatusPillbar();

    refreshHomeLabel();
    refreshPanicStatus();
    refreshXrayStatus();
    renderGameMasterNames();
    renderTrustedNames();
    refreshRuneStatus();
    refreshAutoHealStatus();
    refreshAutoInvisibleStatus();
    refreshAutoMagicShieldStatus();
    refreshAutoAttackStatus();
    refreshAutoEatStatus();
    refreshCaveStatus();
    refreshEquipRingStatus();
    refreshTalkStatus();
    refreshMagicWallStatus();
    refreshHuntStatus();
    refreshTrackerStatus();
    refreshAlphaWatchStatus();
    refreshLootbagStatus();
    refreshVisibleCreatures();
    refreshCavePresetControls();
    refreshCaveClosestStatus();
    refreshCaveTransitionStatus();

    const visibleCreaturesTimerId = window.setInterval(refreshVisibleCreatures, 1000);
    bot.addCleanup(() => {
      window.clearInterval(visibleCreaturesTimerId);
    });

    const talkStatusTimerId = window.setInterval(refreshTalkStatus, 1000);
    bot.addCleanup(() => {
      window.clearInterval(talkStatusTimerId);
    });

    const caveStatusTimerId = window.setInterval(() => {
      refreshCaveStatus();
      refreshCavePresetControls();
      refreshCaveClosestStatus();
      refreshCaveTransitionStatus();
    }, 1000);
    bot.addCleanup(() => {
      window.clearInterval(caveStatusTimerId);
    });

    const magicWallStatusTimerId = window.setInterval(refreshMagicWallStatus, 1000);
    bot.addCleanup(() => {
      window.clearInterval(magicWallStatusTimerId);
    });

    const snapshotTimerId = window.setInterval(() => {
      refreshPlayerSnapshot();
      refreshStatusPillbar();
      refreshHuntStatus();
      refreshLootbagStatus();
    }, 1000);
    bot.addCleanup(() => {
      window.clearInterval(snapshotTimerId);
    });

    const trackerTimerId = window.setInterval(refreshTrackerStatus, 5000);
    bot.addCleanup(() => {
      window.clearInterval(trackerTimerId);
    });

    ensureTrackerToastContainer();
    const repositionToasts = () => {
      const host = document.getElementById("minibia-copilot-tracker-toasts");
      if (host) positionTrackerToastContainer(host);
    };
    window.addEventListener("resize", repositionToasts);
    const toastRepositionTimerId = window.setInterval(repositionToasts, 2000);
    bot.addCleanup(() => {
      window.removeEventListener("resize", repositionToasts);
      window.clearInterval(toastRepositionTimerId);
    });
  }

  bot.ui = {
    inject,
    destroy,
    refreshHomeLabel,
    refreshPanicStatus,
    refreshXrayStatus,
    refreshRuneStatus,
    refreshAutoHealStatus,
    refreshAutoInvisibleStatus,
    refreshAutoMagicShieldStatus,
    refreshAutoAttackStatus,
    refreshAutoEatStatus,
    refreshCaveStatus,
    refreshCavePresetControls,
    refreshEquipRingStatus,
    refreshTalkStatus,
    refreshMagicWallStatus,
    refreshHuntStatus,
    refreshTrackerStatus,
    refreshAlphaWatchStatus,
    refreshLootbagStatus,
    showTrackerNotification,
    refreshVisibleCreatures,
    refreshCaveClosestStatus,
    refreshCaveTransitionStatus,
    getSavedPanelPosition,
    getSavedPanelCollapsed,
    setPanelCollapsed: (collapsed) => {
      const panel = document.getElementById("minibia-copilot-panel");
      setPanelCollapsed(panel, collapsed);
    },
  };
};
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

    currentBundle.installPzModule(bot);
    currentBundle.installXrayModule(bot);
    currentBundle.installPanicModule(bot);
    currentBundle.installRuneModule(bot);
    currentBundle.installHealModule(bot);
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

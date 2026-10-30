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

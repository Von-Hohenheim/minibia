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

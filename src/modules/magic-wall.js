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

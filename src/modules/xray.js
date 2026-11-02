window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installXrayModule = function installXrayModule(bot) {
  "use strict";

  const configStorageKey = "minibiaCopilot.xray.config";
  const overlayRootId = "minibia-copilot-xray-overlay";
  const overlayStyleId = "minibia-copilot-xray-overlay-style";
  const refreshMs = 350;
  const state = { running: false, timerId: null, lastError: null, provider: null };
  const config = Object.assign({
    overlayEnabled: false,
    selectedFloor: null,
  }, bot.storage?.get?.(configStorageKey, {}) || {});

  function floorValue(value) {
    if (value == null || value === "" || value === "all") return null;
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n <= 15 ? n : null;
  }

  config.selectedFloor = floorValue(config.selectedFloor);
  function save() { bot.storage?.set?.(configStorageKey, { ...config }); }
  function normalizedName(value) { return String(value || "").trim().toLowerCase(); }

  function positionOf(value) {
    if (!value || typeof value !== "object") return null;
    const x = Number(value.x), y = Number(value.y), z = Number(value.z);
    if (![x, y, z].every(Number.isSafeInteger) || z < 0 || z > 15) return null;
    return { x, y, z };
  }

  // Nunca ejecutar el getter protegido de window.gameClient.
  // En clientes anteriores era una propiedad de datos ordinaria.
  function legacyClient() {
    const descriptor = Object.getOwnPropertyDescriptor(window, "gameClient");
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) return null;
    return descriptor.value && typeof descriptor.value === "object" ? descriptor.value : null;
  }

  function readDomSnapshot() {
    // Solo tomar coordenadas explícitas publicadas como atributos del DOM.
    // No extrapolar coordenadas a partir de nombres de una battle list.
    const playerElement = document.querySelector(
      '[data-player-position][data-x][data-y][data-z], [data-player="self"][data-x][data-y][data-z]'
    );
    const playerPosition = playerElement ? positionOf({
      x: playerElement.dataset.x,
      y: playerElement.dataset.y,
      z: playerElement.dataset.z,
    }) : null;
    const creatureElements = Array.from(document.querySelectorAll(
      '[data-creature-id][data-x][data-y][data-z]'
    )).slice(0, 300);
    const creatures = creatureElements.map((el) => ({
      id: el.dataset.creatureId,
      name: el.dataset.creatureName || el.getAttribute("aria-label") || "",
      type: /^player$/i.test(el.dataset.creatureType || "") ? 0 : 1,
      __position: positionOf({ x: el.dataset.x, y: el.dataset.y, z: el.dataset.z }),
    })).filter(c => c.__position);
    return { playerPosition, creatures };
  }

  function normalizeCreatures(input) {
    let values = [];
    if (Array.isArray(input)) values = input;
    else if (input && typeof input === "object") values = Object.values(input);
    return values.slice(0, 1000).filter(Boolean).map((creature) => {
      const position = positionOf(creature.__position || creature.position);
      if (!position) return null;
      return {
        ...creature,
        id: creature.id ?? null,
        name: String(creature.name || ""),
        type: creature.type === 0 || creature.type === "player" ? 0 : 1,
        __position: position,
      };
    }).filter(Boolean);
  }

  function readSnapshot() {
    state.lastError = null;
    const dom = readDomSnapshot();
    let source = "unavailable";
    let snapshot = null;

    try {
      if (state.provider) {
        snapshot = state.provider();
        source = "custom-provider";
      } else if (typeof bot.runtimeAdapter?.getWorldSnapshot === "function") {
        snapshot = bot.runtimeAdapter.getWorldSnapshot();
        source = "runtime-adapter";
      } else {
        const client = legacyClient();
        if (client?.world?.activeCreatures) {
          snapshot = {
            playerPosition: client.player?.__position || client.player?.position,
            playerId: client.player?.id,
            creatures: client.world.activeCreatures,
          };
          source = "legacy-data-property";
        } else if (dom.playerPosition && dom.creatures.length) {
          snapshot = dom;
          source = "dom-positions";
        }
      }
    } catch (error) {
      state.lastError = String(error?.message || error);
      source = "error";
    }

    if (!snapshot || typeof snapshot !== "object") {
      return { source, playerPosition: dom.playerPosition, creatures: [], available: false };
    }

    const playerPosition = positionOf(
      snapshot.playerPosition || snapshot.player?.__position || snapshot.player?.position
    ) || dom.playerPosition;
    const playerId = snapshot.playerId ?? snapshot.player?.id ?? null;
    const playerName = normalizedName(
      snapshot.playerName || snapshot.player?.name || bot.runtimeAdapter?.getStats?.()?.name
    );
    const creatures = normalizeCreatures(snapshot.creatures || snapshot.activeCreatures || []);
    const filtered = creatures.filter((creature) => {
      if (playerId != null && creature.id === playerId) return false;
      if (playerName && normalizedName(creature.name) === playerName) return false;
      return true;
    });
    return {
      source,
      playerPosition,
      creatures: filtered,
      available: !!playerPosition && source !== "error",
    };
  }

  function near(me, pos) {
    return !!(me && pos && Math.abs(pos.x - me.x) <= 8 && Math.abs(pos.y - me.y) <= 6);
  }

  function getVisibleCreatures() {
    const data = readSnapshot();
    if (!data.playerPosition) return [];
    return data.creatures.filter(c => near(data.playerPosition, c.__position));
  }
  function getVisiblePlayers({ sameFloorOnly = false } = {}) {
    const data = readSnapshot();
    if (!data.playerPosition) return [];
    return data.creatures.filter(c =>
      c.type === 0 && near(data.playerPosition, c.__position) &&
      (!sameFloorOnly || c.__position.z === data.playerPosition.z)
    );
  }
  function getVisibleMonsters({ sameFloorOnly = false } = {}) {
    const data = readSnapshot();
    if (!data.playerPosition) return [];
    return data.creatures.filter(c =>
      c.type !== 0 && near(data.playerPosition, c.__position) &&
      (!sameFloorOnly || c.__position.z === data.playerPosition.z)
    );
  }

  function overlayCreaturesFrom(data) {
    const me = data.playerPosition;
    if (!me) return [];
    return data.creatures.filter(c => {
      const pos = c.__position;
      if (!pos) return false;
      if (config.selectedFloor != null && pos.z !== config.selectedFloor) return false;
      return pos.z !== me.z ? near(me, pos) : !near(me, pos);
    });
  }
  function getOverlayCreatures() { return overlayCreaturesFrom(readSnapshot()); }

  function getViewportRect() {
    const canvases = Array.from(document.querySelectorAll("canvas"))
      .map(canvas => canvas.getBoundingClientRect())
      .filter(rect => rect.width >= 200 && rect.height >= 150)
      .sort((a, b) => b.width * b.height - a.width * a.height);
    return canvases[0] || null;
  }

  function ensureOverlay() {
    let style = document.getElementById(overlayStyleId);
    if (!style) {
      style = document.createElement("style");
      style.id = overlayStyleId;
      style.textContent = `
        #${overlayRootId}{position:fixed;inset:0;pointer-events:none;z-index:999998}
        #${overlayRootId} .mc-xray-marker{
          position:fixed;transform:translate(-50%,-50%);padding:2px 6px;
          border:1px solid rgba(255,211,128,.85);border-radius:999px;
          background:rgba(65,24,12,.78);color:#ffe7ae;
          font:11px/1.2 Verdana,sans-serif;white-space:nowrap}
        #${overlayRootId} .mc-xray-marker-offscreen{
          border-color:rgba(123,235,178,.92);background:rgba(11,61,43,.8);color:#d8ffea}`;
      document.head.appendChild(style);
    }
    let root = document.getElementById(overlayRootId);
    if (!root) {
      root = document.createElement("div");
      root.id = overlayRootId;
      document.body.appendChild(root);
    }
    return root;
  }

  function clearOverlay() {
    document.getElementById(overlayRootId)?.remove();
    document.getElementById(overlayStyleId)?.remove();
  }

  function healthText(creature) {
    const rawHp = creature.health ?? creature.hp;
    const rawMaxHp = creature.maxHealth ?? creature.maxHp;
    const h = rawHp == null ? null : Number(rawHp);
    const max = rawMaxHp == null ? null : Number(rawMaxHp);
    if (h !== null && max !== null && Number.isFinite(h) && Number.isFinite(max) && max > 0) return ` ${h}/${max} HP`;
    const rawPercent = creature.healthPercent ?? creature.hpPercent;
    const percent = rawPercent == null ? null : Number(rawPercent);
    return percent !== null && Number.isFinite(percent) && percent >= 0 && percent <= 100
      ? ` ${Math.round(percent)}% HP` : "";
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(value, max)); }

  function renderOverlay() {
    if (!state.running) return;
    const root = ensureOverlay();
    const data = readSnapshot();
    const rect = getViewportRect();
    const creatures = overlayCreaturesFrom(data);
    root.replaceChildren();
    if (!data.playerPosition || !rect || !creatures.length) return;
    const me = data.playerPosition;
    const tileW = rect.width / 17, tileH = rect.height / 13;
    const margin = 42;
    for (const creature of creatures) {
      const pos = creature.__position;
      const sameFloor = pos.z === me.z;
      const floorOffset = me.z - pos.z;
      const node = document.createElement("div");
      node.className = sameFloor ? "mc-xray-marker mc-xray-marker-offscreen" : "mc-xray-marker";
      const floorText = floorOffset === 0 ? "" : ` (${floorOffset > 0 ? "+" : ""}${floorOffset})`;
      node.textContent = (creature.name || (creature.type === 0 ? "Player" : "Mob")) + floorText + healthText(creature);
      const x = rect.left + (pos.x - me.x + 8.5) * tileW;
      const y = rect.top + (pos.y - me.y + 6.5) * tileH;
      node.style.left = `${clamp(x, rect.left + margin, rect.right - margin)}px`;
      node.style.top = `${clamp(y, rect.top + margin, rect.bottom - margin)}px`;
      root.appendChild(node);
    }
  }

  function startOverlay() {
    if (state.running) return false;
    state.running = true;
    config.overlayEnabled = true;
    save();
    renderOverlay();
    state.timerId = window.setInterval(() => {
      try { renderOverlay(); }
      catch (error) { state.lastError = String(error?.message || error); }
    }, refreshMs);
    return true;
  }

  function stopOverlay(options = {}) {
    state.running = false;
    if (state.timerId != null) window.clearInterval(state.timerId);
    state.timerId = null;
    clearOverlay();
    if (options.persistEnabled !== false) {
      config.overlayEnabled = false;
      save();
    }
    return true;
  }
  function setOverlayEnabled(enabled) {
    if (enabled) {
      if (state.running) return true;
      return startOverlay();
    }
    return stopOverlay();
  }
  function setSelectedFloor(value) {
    config.selectedFloor = floorValue(value);
    save();
    if (state.running) renderOverlay();
    return config.selectedFloor;
  }

  function formatCreature(creature) {
    return {
      id: creature.id,
      name: creature.name,
      type: creature.type,
      position: { ...creature.__position },
    };
  }

  function inspectSources() {
    const descriptor = Object.getOwnPropertyDescriptor(window, "gameClient");
    const data = readSnapshot();
    const domMarkers = document.querySelectorAll('[data-creature-id][data-x][data-y][data-z]').length;
    return {
      source: data.source,
      available: data.available,
      playerPosition: data.playerPosition,
      creatureCount: data.creatures.length,
      gameClientDescriptor: !descriptor ? "absent" :
        Object.prototype.hasOwnProperty.call(descriptor, "value") ? "data-property" : "protected-accessor",
      runtimeAdapterStats: !!bot.runtimeAdapter?.getStats?.(),
      runtimeAdapterWorld: typeof bot.runtimeAdapter?.getWorldSnapshot === "function",
      domPositionMarkers: domMarkers,
      viewportFound: !!getViewportRect(),
      error: state.lastError,
      note: !data.available
        ? "No hay posiciones verificables. La barra HP/maná no proporciona coordenadas ni pisos."
        : null,
    };
  }

  function status() {
    const data = readSnapshot();
    const me = data.playerPosition;
    const visible = me ? data.creatures.filter(c => near(me, c.__position)) : [];
    const players = visible.filter(c => c.type === 0);
    const monsters = visible.filter(c => c.type !== 0);
    return {
      visibleCreatures: visible.map(formatCreature),
      visiblePlayers: players.map(formatCreature),
      visiblePlayersCurrentFloor: players.filter(c => c.__position.z === me?.z).map(formatCreature),
      visibleMonsters: monsters.map(formatCreature),
      visibleMonstersCurrentFloor: monsters.filter(c => c.__position.z === me?.z).map(formatCreature),
      overlayCreatures: overlayCreaturesFrom(data).map(formatCreature),
      playerPosition: me,
      dataSource: data.source,
      dataAvailable: data.available,
      dataError: state.lastError,
      config: { ...config },
      overlayRunning: state.running,
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
    inspectSources,
    // Permite incorporar una fuente futura que entregue
    // {playerPosition:{x,y,z}, creatures:[{id,name,type,position:{x,y,z}}]}.
    setDataProvider(fn) {
      if (fn != null && typeof fn !== "function") return false;
      state.provider = fn || null;
      if (state.running) renderOverlay();
      return true;
    },
  };

  if (config.overlayEnabled) startOverlay();
  else clearOverlay();
  bot.addCleanup?.(() => stopOverlay({ persistEnabled: false }));
};

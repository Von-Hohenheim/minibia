window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installXrayModule = function installXrayModule(bot) {
  "use strict";

  const configStorageKey = "minibiaCopilot.xray.config";
  const overlayRootId = "minibia-copilot-xray-overlay";
  const overlayStyleId = "minibia-copilot-xray-overlay-style";
  const radarRootId = "minibia-copilot-xray-radar";
  const radarStyleId = "minibia-copilot-xray-radar-style";
  const radarRefreshMs = 800;
  const refreshMs = 350;
  const state = {
    running: false, timerId: null, lastError: null, provider: null,
    battleDomSignature: null,
    battleHiddenSinceAt: null,
    battleLastChangedWhileHiddenAt: null,
    battleHiddenChangesObserved: 0,
    battleWasVisible: null,
    radarRunning: false,
    radarTimerId: null,
    radarSeenIds: new Set(),
    radarBaselineDone: false,
    radarAlertsAt: new Map(),
    radarLastAlert: null,
    radarLastRenderAt: null,
    radarDragCleanup: null,
    radarToastTimerId: null,
  };
  const config = Object.assign({
    overlayEnabled: false,
    selectedFloor: null,
    radarEnabled: false,
    playerAlertsEnabled: false,
    radarPosition: null,
  }, bot.storage?.get?.(configStorageKey, {}) || {});

  function floorValue(value) {
    if (value == null || value === "" || value === "all") return null;
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n <= 15 ? n : null;
  }

  config.selectedFloor = floorValue(config.selectedFloor);
  config.radarEnabled = config.radarEnabled === true;
  config.playerAlertsEnabled = config.playerAlertsEnabled === true;
  if (!config.radarPosition ||
      !Number.isFinite(config.radarPosition.left) ||
      !Number.isFinite(config.radarPosition.top)) {
    config.radarPosition = null;
  }
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


  // Fuente de compatibilidad: solo entradas ya visibles en la interfaz Battle List.
  // NO ofrece coordenadas, pisos ni criaturas no mostradas por el juego.
  // Se mantiene independiente de getVisibleCreatures() para no alterar Panic/Attack.
  function getBattleListSnapshot() {
    const windowEl = document.querySelector("#battle-window");
    const windowFound = !!(windowEl && windowEl.isConnected);
    const windowVisible = !!(windowFound &&
      windowEl.getClientRects().length &&
      window.getComputedStyle(windowEl).visibility !== "hidden" &&
      window.getComputedStyle(windowEl).display !== "none");

    // Aunque Battle esté con display:none, sus filas siguen en el DOM.
    // No filtrar por getClientRects() de cada fila: los elementos ocultos
    // tampoco tienen rectángulos, pero sus textos pueden seguir disponibles.
    const rows = windowFound
      ? Array.from(windowEl.querySelectorAll('.battle-window-target-wrapper[id]')).slice(0, 200)
      : [];
    const seen = new Set();
    const entries = [];
    for (const row of rows) {
      const id = String(row.id || "").trim();
      if (!/^\d+$/.test(id) || seen.has(id) || !row.isConnected) continue;
      const name = row.querySelector('.battle-window-target-title')?.textContent?.trim() || "";
      if (!name || name === "???") continue;
      seen.add(id);
      const detail = row.querySelector('.battle-window-target-sub')?.textContent?.trim() || "";
      const rawHealth = row.querySelector('.battle-window-bar-wrapper .bar-text')?.textContent?.trim() || "";
      const match = rawHealth.match(/^(\d+)\s*\/\s*(\d+)$/);
      entries.push({
        id, name, detail,
        health: match ? Number(match[1]) : null,
        maxHealth: match ? Number(match[2]) : null,
        healthText: rawHealth && rawHealth !== "???" ? rawHealth : null,
        position: null,
        type: null,
        source: 'battle-list-dom',
      });
    }

    // Cambios en filas o HP con Battle cerrada sirven como evidencia
    // de actualización. Que no haya cambios NO prueba que estén obsoletas.
    const signature = JSON.stringify(entries.map(e => [e.id,e.name,e.detail,e.healthText]));
    if (windowVisible) {
      state.battleHiddenSinceAt = null;
      state.battleLastChangedWhileHiddenAt = null;
      state.battleHiddenChangesObserved = 0;
    } else if (windowFound) {
      if (state.battleWasVisible !== false || state.battleHiddenSinceAt == null) {
        state.battleHiddenSinceAt = Date.now();
        state.battleLastChangedWhileHiddenAt = null;
        state.battleHiddenChangesObserved = 0;
      } else if (state.battleDomSignature !== null && state.battleDomSignature !== signature) {
        state.battleLastChangedWhileHiddenAt = Date.now();
        state.battleHiddenChangesObserved += 1;
      }
    } else {
      state.battleHiddenSinceAt = null;
      state.battleLastChangedWhileHiddenAt = null;
      state.battleHiddenChangesObserved = 0;
    }
    state.battleDomSignature = signature;
    state.battleWasVisible = windowVisible;
    return {
      windowFound,
      windowVisible,
      entries,
      entriesInDom: entries.length,
      hiddenSinceAt: state.battleHiddenSinceAt,
      lastChangedWhileHiddenAt: state.battleLastChangedWhileHiddenAt,
      hiddenChangesObserved: state.battleHiddenChangesObserved,
      updatesWhileHiddenConfirmed: !windowVisible && state.battleHiddenChangesObserved > 0,
    };
  }

  function getBattleListCreatures() {
    return getBattleListSnapshot().entries;
  }

  function inspectBattleList() {
    const snapshot = getBattleListSnapshot();
    return {
      ...snapshot,
      count: snapshot.entries.length,
      hasCoordinates: false,
      note: !snapshot.windowVisible && snapshot.entries.length
        ? (snapshot.updatesWhileHiddenConfirmed
          ? 'Hay cambios en el DOM de Battle List con la ventana cerrada. No ofrece coordenadas ni otros pisos.'
          : 'Las filas siguen en el DOM con Battle cerrada, pero no se ha comprobado que sigan actualizándose.')
        : 'Solo lee entradas de Battle List; no informa posiciones ni otros pisos.', 
    };
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


// Radar independiente, basado SOLO en las filas existentes en Battle List.
// Battle puede estar con display:none; no se deducen criaturas ocultas ni coordenadas.
function isIdentifiedPlayer(entry) {
  return /\bLVL\s+\d+\s*\[(?:EK|ED|MS|RP|KNIGHT|DRUID|PALADIN|SORCERER)\]/i
    .test(String(entry.detail || ""));
}

function getRadarEntries() {
  return getBattleListSnapshot().entries.map(entry => ({
    ...entry,
    kind: isIdentifiedPlayer(entry) ? "player" : "unknown",
  }));
}

function clampRadarPosition(left, top, root) {
  const rect = root?.getBoundingClientRect?.();
  const width = rect?.width || 280;
  const height = rect?.height || 190;
  return {
    left: Math.max(0, Math.min(Math.round(left), Math.max(0, (window.innerWidth || 900) - width))),
    top: Math.max(0, Math.min(Math.round(top), Math.max(0, (window.innerHeight || 600) - Math.min(height, 90)))),
  };
}

function setRadarPosition(left, top, persist = true) {
  const root = document.getElementById(radarRootId);
  const next = clampRadarPosition(Number(left) || 0, Number(top) || 0, root);
  if (root) {
    root.style.left = `${next.left}px`;
    root.style.top = `${next.top}px`;
  }
  if (persist) {
    config.radarPosition = next;
    save();
  }
  return next;
}

function ensureRadar() {
  if (!document.getElementById(radarStyleId)) {
    const style = document.createElement("style");
    style.id = radarStyleId;
    style.textContent = `
      #${radarRootId}{position:fixed;left:18px;top:110px;width:280px;max-width:calc(100vw - 12px);
        z-index:1000001;background:rgba(12,19,31,.96);color:#e7edf5;border:1px solid #3c5266;
        border-radius:12px;box-shadow:0 12px 38px rgba(0,0,0,.55);font:12px/1.4 Verdana,sans-serif;
        overflow:hidden;pointer-events:auto;box-sizing:border-box}
      #${radarRootId} .mc-xray-radar-head{display:flex;align-items:center;gap:8px;padding:11px 12px;
        background:linear-gradient(120deg,#1e3449,#112333);cursor:move;user-select:none;touch-action:none}
      #${radarRootId} .mc-xray-radar-title{font-weight:700;letter-spacing:.5px;flex:1}
      #${radarRootId} .mc-xray-radar-count{color:#c1d8e8;font-weight:700}
      #${radarRootId} .mc-xray-radar-close{background:none;color:#d5e2ef;border:1px solid #526b81;
        border-radius:6px;cursor:pointer;font-size:16px;line-height:1;padding:2px 7px}
      #${radarRootId} .mc-xray-radar-sub{padding:7px 12px;color:#a8bed0;border-bottom:1px solid #314556;
        font-size:10px;min-height:15px}
      #${radarRootId} .mc-xray-radar-items{overflow-y:auto;max-height:min(360px,45vh);scrollbar-width:thin}
      #${radarRootId} .mc-xray-radar-row{padding:8px 11px;border-bottom:1px solid rgba(110,139,163,.2)}
      #${radarRootId} .mc-xray-radar-line{display:flex;align-items:center;gap:7px;min-width:0}
      #${radarRootId} .mc-xray-radar-dot{width:7px;height:7px;border-radius:50%;background:#6c8899;flex:none}
      #${radarRootId} .mc-xray-radar-row[data-kind="player"] .mc-xray-radar-dot{background:#f2ba68}
      #${radarRootId} .mc-xray-radar-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
        flex:1;font-weight:600}
      #${radarRootId} .mc-xray-radar-hp{color:#c9dded;font-size:10px;white-space:nowrap}
      #${radarRootId} .mc-xray-radar-meta{color:#8babc0;font-size:10px;padding-left:14px;margin-top:3px}
      #${radarRootId} .mc-xray-radar-track{height:3px;border-radius:5px;background:#2c3d4b;
        overflow:hidden;margin:5px 0 0 14px}
      #${radarRootId} .mc-xray-radar-fill{height:100%;background:#70d4a1}
      #${radarRootId} .mc-xray-radar-empty{padding:14px 12px;color:#b2c5d3}
      #${radarRootId} .mc-xray-radar-footer{color:#809aad;font-size:10px;padding:7px 12px}
      #${radarRootId} .mc-xray-radar-alert{padding:8px 12px;background:#493225;color:#ffe1b1;
        border-top:1px solid #a7763a;font-weight:600}
    `;
    document.head.appendChild(style);
  }

  let root = document.getElementById(radarRootId);
  if (root) return root;

  root = document.createElement("section");
  root.id = radarRootId;
  root.setAttribute("aria-label", "Radar de Battle List");
  const header = document.createElement("div");
  header.className = "mc-xray-radar-head";
  const title = document.createElement("span");
  title.className = "mc-xray-radar-title";
  title.textContent = "RADAR · BATTLE";
  const count = document.createElement("span");
  count.className = "mc-xray-radar-count";
  count.textContent = "0";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "mc-xray-radar-close";
  close.title = "Ocultar radar";
  close.setAttribute("aria-label", "Ocultar radar");
  close.textContent = "×";
  close.addEventListener("click", () => setRadarEnabled(false));
  header.append(title, count, close);

  const sub = document.createElement("div");
  sub.className = "mc-xray-radar-sub";
  const items = document.createElement("div");
  items.className = "mc-xray-radar-items";
  const footer = document.createElement("div");
  footer.className = "mc-xray-radar-footer";
  footer.textContent = "Solo Battle List · sin coordenadas ni pisos";
  const alert = document.createElement("div");
  alert.className = "mc-xray-radar-alert";
  alert.hidden = true;
  root.append(header, sub, items, footer, alert);
  document.body.appendChild(root);

  const saved = config.radarPosition;
  setRadarPosition(saved?.left ?? 18, saved?.top ?? 110, false);

  // Arrastrar la cabecera con mouse o pantalla tactil; no robar clicks al botón cerrar.
  header.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.target === close || close.contains(event.target)) return;
    if (state.radarDragCleanup) state.radarDragCleanup();
    const startX = event.clientX, startY = event.clientY;
    const rect = root.getBoundingClientRect();
    const originalX = rect.left, originalY = rect.top;
    function move(e) {
      setRadarPosition(originalX + e.clientX - startX, originalY + e.clientY - startY, false);
    }
    function finish(e) {
      move(e);
      state.radarDragCleanup?.();
      config.radarPosition = clampRadarPosition(
        parseFloat(root.style.left) || 0, parseFloat(root.style.top) || 0, root
      );
      save();
    }
    function cleanup() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      state.radarDragCleanup = null;
    }
    function cancel() { cleanup(); }
    state.radarDragCleanup = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    event.preventDefault();
  });
  return root;
}

function showRadarPlayerAlert(entry, root) {
  const alert = root.querySelector(".mc-xray-radar-alert");
  if (!alert) return;
  alert.textContent = `Jugador detectado: ${entry.name}`;
  alert.hidden = false;
  state.radarLastAlert = { id: entry.id, name: entry.name, at: Date.now() };
  if (state.radarToastTimerId != null) window.clearTimeout(state.radarToastTimerId);
  state.radarToastTimerId = window.setTimeout(() => {
    alert.hidden = true;
    state.radarToastTimerId = null;
  }, 7000);
}

function watchNewPlayers(entries, root) {
  const now = Date.now();
  const present = new Set(entries.map(e => e.id));
  if (state.radarBaselineDone && config.playerAlertsEnabled) {
    for (const entry of entries) {
      if (state.radarSeenIds.has(entry.id) || !isIdentifiedPlayer(entry)) continue;
      const last = state.radarAlertsAt.get(entry.id) || 0;
      if (now - last < 60000) continue;
      state.radarAlertsAt.set(entry.id, now);
      showRadarPlayerAlert(entry, root);
    }
  }
  state.radarSeenIds = present;
  state.radarBaselineDone = true;
  if (state.radarAlertsAt.size > 200) {
    for (const [id, at] of state.radarAlertsAt) {
      if (now - at > 120000) state.radarAlertsAt.delete(id);
    }
  }
}

function renderRadar() {
  if (!state.radarRunning) return;
  const root = ensureRadar();
  const snapshot = getBattleListSnapshot();
  const entries = snapshot.entries;
  const count = root.querySelector(".mc-xray-radar-count");
  const sub = root.querySelector(".mc-xray-radar-sub");
  const items = root.querySelector(".mc-xray-radar-items");
  if (!count || !sub || !items) return;
  const playerCount = entries.filter(isIdentifiedPlayer).length;
  count.textContent = `${entries.length}`;
  sub.textContent = !snapshot.windowFound ? "Battle List no encontrada" :
    snapshot.windowVisible ? `Battle abierta · ${playerCount} jugadores identificados` :
    snapshot.updatesWhileHiddenConfirmed
      ? `Battle cerrada · cambios confirmados · ${playerCount} jugadores`
      : `Battle cerrada · filas en DOM, actualización sin confirmar`;

  const previousScroll = items.scrollTop;
  const ordered = entries.slice().sort((a, b) =>
    Number(isIdentifiedPlayer(b)) - Number(isIdentifiedPlayer(a))
  );
  const fragments = document.createDocumentFragment();
  if (!ordered.length) {
    const empty = document.createElement("div");
    empty.className = "mc-xray-radar-empty";
    empty.textContent = snapshot.windowFound ? "No hay criaturas en Battle List" : "Abre Battle List para verificar datos";
    fragments.appendChild(empty);
  } else {
    for (const entry of ordered.slice(0, 60)) {
      const row = document.createElement("div");
      row.className = "mc-xray-radar-row";
      row.dataset.kind = isIdentifiedPlayer(entry) ? "player" : "unknown";
      const line = document.createElement("div");
      line.className = "mc-xray-radar-line";
      const dot = document.createElement("span");
      dot.className = "mc-xray-radar-dot";
      const name = document.createElement("span");
      name.className = "mc-xray-radar-name";
      name.title = entry.name;
      name.textContent = entry.name;
      const hp = document.createElement("span");
      hp.className = "mc-xray-radar-hp";
      hp.textContent = entry.healthText || "HP ?";
      line.append(dot, name, hp);
      const meta = document.createElement("div");
      meta.className = "mc-xray-radar-meta";
      meta.textContent = [entry.detail || (isIdentifiedPlayer(entry) ? "Jugador" : "Tipo sin identificar"), `ID ${entry.id}`].join(" · ");
      row.append(line, meta);
      if (entry.maxHealth > 0 && entry.health != null) {
        const track = document.createElement("div");
        track.className = "mc-xray-radar-track";
        const fill = document.createElement("div");
        fill.className = "mc-xray-radar-fill";
        fill.style.width = `${Math.max(0, Math.min(100, entry.health / entry.maxHealth * 100))}%`;
        track.appendChild(fill);
        row.appendChild(track);
      }
      fragments.appendChild(row);
    }
    if (entries.length > 60) {
      const extra = document.createElement("div");
      extra.className = "mc-xray-radar-empty";
      extra.textContent = `+${entries.length - 60} entradas adicionales`;
      fragments.appendChild(extra);
    }
  }
  items.replaceChildren(fragments);
  items.scrollTop = previousScroll;
  watchNewPlayers(entries, root);
  state.radarLastRenderAt = Date.now();
}

function startRadar() {
  config.radarEnabled = true;
  save();
  if (state.radarRunning) return true;
  state.radarRunning = true;
  state.radarBaselineDone = false;
  state.radarSeenIds.clear();
  try { renderRadar(); }
  catch (error) { state.lastError = String(error?.message || error); }
  state.radarTimerId = window.setInterval(() => {
    try { renderRadar(); }
    catch (error) { state.lastError = String(error?.message || error); }
  }, radarRefreshMs);
  return true;
}

function stopRadar(options = {}) {
  state.radarRunning = false;
  if (state.radarTimerId != null) window.clearInterval(state.radarTimerId);
  state.radarTimerId = null;
  if (state.radarToastTimerId != null) window.clearTimeout(state.radarToastTimerId);
  state.radarToastTimerId = null;
  state.radarDragCleanup?.();
  document.getElementById(radarRootId)?.remove();
  document.getElementById(radarStyleId)?.remove();
  if (options.persistEnabled !== false) {
    config.radarEnabled = false;
    save();
  }
  return true;
}

function setRadarEnabled(enabled) {
  return enabled ? startRadar() : stopRadar();
}

function setPlayerAlertsEnabled(enabled) {
  config.playerAlertsEnabled = !!enabled;
  save();
  return config.playerAlertsEnabled;
}

function inspectRadar() {
  const battle = getBattleListSnapshot();
  return {
    enabled: state.radarRunning,
    entries: battle.entries.map(e => ({
      ...e,
      kind: isIdentifiedPlayer(e) ? "player" : "unknown",
    })),
    count: battle.entries.length,
    identifiedPlayers: battle.entries.filter(isIdentifiedPlayer).length,
    windowVisible: battle.windowVisible,
    updatesWhileHiddenConfirmed: battle.updatesWhileHiddenConfirmed,
    lastChangedWhileHiddenAt: battle.lastChangedWhileHiddenAt,
    alertsEnabled: config.playerAlertsEnabled,
    lastAlert: state.radarLastAlert,
    note: "Solo Battle List; no detecta coordenadas, criaturas ocultas ni otros pisos.",
  };
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
      battleListCount: getBattleListSnapshot().entries.length,
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
    const battleList = getBattleListSnapshot();
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
      battleListCreatures: battleList.entries,
      battleListWindowVisible: battleList.windowVisible,
      battleListWindowFound: battleList.windowFound,
      battleListUpdatesWhileHiddenConfirmed: battleList.updatesWhileHiddenConfirmed,
      battleListHiddenChangesObserved: battleList.hiddenChangesObserved,
      battleListLastChangedWhileHiddenAt: battleList.lastChangedWhileHiddenAt,
      playerPosition: me,
      dataSource: data.source,
      dataAvailable: data.available,
      dataError: state.lastError,
      config: { ...config },
      overlayRunning: state.running,
      radarRunning: state.radarRunning,
      radarLastRenderAt: state.radarLastRenderAt,
      radarLastAlert: state.radarLastAlert,
    };
  }

  bot.xray = {
    getVisibleCreatures,
    getVisiblePlayers,
    getVisibleMonsters,
    getOverlayCreatures,
    getBattleListCreatures,
    inspectBattleList,
    getRadarEntries,
    inspectRadar,
    startRadar,
    stopRadar,
    setRadarEnabled,
    setPlayerAlertsEnabled,
    setRadarPosition,
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
  if (config.radarEnabled) startRadar();
  else {
    document.getElementById(radarRootId)?.remove();
    document.getElementById(radarStyleId)?.remove();
  }
  bot.addCleanup?.(() => {
    stopOverlay({ persistEnabled: false });
    stopRadar({ persistEnabled: false });
  });
};

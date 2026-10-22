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

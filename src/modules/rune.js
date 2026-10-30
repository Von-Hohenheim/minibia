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

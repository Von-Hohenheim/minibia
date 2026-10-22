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

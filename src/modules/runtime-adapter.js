// Minibia Runtime Adapter — lee exclusivamente datos visibles del DOM.
// La detección automática es conservadora: una sola barra de HP válida
// con nombre y maná visible. En caso ambiguo, devuelve null.
(function () {
  "use strict";

  window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};
  window.__minibiaCopilotBundle.installRuntimeAdapterModule =
    function installRuntimeAdapterModule(bot) {
      const nameStorageKey = "minibiaBot.runtimeAdapter.playerName";
      const modeStorageKey = "minibiaBot.runtimeAdapter.nameMode.v2";
      let mode = bot.storage?.get?.(modeStorageKey, "auto") === "manual"
        ? "manual" : "auto";
      let manualName = String(bot.storage?.get?.(nameStorageKey, "") || "").trim();
      if (mode === "manual" && !manualName) mode = "auto";

      const healthPattern = /^\s*(\d+)\s*\/\s*(\d+)\s*$/;

      function parsePercent(value) {
        const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)%$/);
        if (!match) return null;
        const num = Number(match[1]);
        return Number.isFinite(num) && num >= 0 && num <= 100 ? num : null;
      }

      function isVisible(element) {
        if (!element?.isConnected || element.getClientRects().length === 0) return false;
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      }

      function readCandidate(element) {
        if (!isVisible(element)) return null;
        const name = element.querySelector(".skull-name-row")?.textContent?.trim();
        const hp = element.querySelector(".value-health");
        const mana = element.querySelector(".value-mana");
        const match = hp?.getAttribute("title")?.match(healthPattern);
        const manaPercent = parsePercent(mana?.style?.width);
        if (!name || !match || manaPercent === null) return null;
        const health = Number(match[1]);
        const maxHealth = Number(match[2]);
        if (!Number.isSafeInteger(health) || !Number.isSafeInteger(maxHealth) ||
            maxHealth <= 0 || health < 0 || health > maxHealth) return null;
        return {
          name,
          health,
          maxHealth,
          healthPercent: Math.round((health / maxHealth) * 10000) / 100,
          mana: null,
          maxMana: null,
          manaPercent,
          source: "dom",
          observedAt: new Date().toISOString(),
        };
      }

      function candidates() {
        return Array.from(document.querySelectorAll(".text-window"))
          .map(readCandidate).filter(Boolean);
      }

      function getStats() {
        const all = candidates();
        const matches = mode === "manual"
          ? all.filter((item) => item.name === manualName)
          : all;
        // No inferir al jugador por proximidad ni escoger el primer nombre.
        return matches.length === 1 ? matches[0] : null;
      }

      function setPlayerName(name) {
        if (typeof name !== "string") return false;
        const cleaned = name.trim();
        if (!cleaned || cleaned.toLowerCase() === "auto") {
          mode = "auto";
          manualName = "";
        } else {
          mode = "manual";
          manualName = cleaned;
        }
        bot.storage?.set?.(modeStorageKey, mode);
        if (manualName) bot.storage?.set?.(nameStorageKey, manualName);
        return true;
      }

      const api = {
        getStats,
        setPlayerName,
        status() {
          const all = candidates();
          const matching = mode === "manual"
            ? all.filter((item) => item.name === manualName)
            : all;
          const stats = matching.length === 1 ? matching[0] : null;
          return {
            installed: true,
            detectionMode: mode,
            playerName: stats?.name ?? (mode === "manual" ? manualName : null),
            playerVisible: !!stats,
            healthAvailable: stats?.health != null,
            manaPercentAvailable: stats?.manaPercent != null,
            candidateCount: matching.length,
            reason: matching.length === 0 ? "Sin candidato válido" :
              matching.length > 1 ? "Varios candidatos: lectura bloqueada" : null,
            source: "dom",
            readOnly: true,
          };
        },
      };

      bot.runtimeAdapter = api;
      window.__minibiaRuntimeAdapter = api;
      bot.addCleanup?.(() => {
        if (window.__minibiaRuntimeAdapter === api) delete window.__minibiaRuntimeAdapter;
        if (bot.runtimeAdapter === api) delete bot.runtimeAdapter;
      });
      return api;
    };
})();


 // Minibia Runtime Adapter — lector DOM de estadísticas (solo lectura).
// No accede a window.gameClient ni ejecuta getters internos del juego.
(function () {
  "use strict";

  window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

  window.__minibiaCopilotBundle.installRuntimeAdapterModule =
    function installRuntimeAdapterModule(bot) {
      const storageKey = "minibiaBot.runtimeAdapter.playerName";
      const defaultName = "Pally Do Mal";
      let playerName = defaultName;

      try {
        const stored = bot.storage?.get?.(storageKey, defaultName);
        if (typeof stored === "string" && stored.trim()) {
          playerName = stored.trim();
        }
      } catch (_) {
        // La lectura del DOM funciona incluso sin almacenamiento.
      }

      function parsePercentage(inlineWidth) {
        // Solo aceptar el porcentaje escrito directamente por la interfaz.
        // No usar getComputedStyle: un 100% por CSS puede ser un valor inicial.
        const match = String(inlineWidth || "")
          .trim()
          .match(/^(\d+(?:\.\d+)?)%$/);

        if (!match) return null;

        const percentage = Number(match[1]);

        return Number.isFinite(percentage) &&
          percentage >= 0 &&
          percentage <= 100
          ? percentage
          : null;
      }

      function isVisible(element) {
        if (
          !element ||
          !element.isConnected ||
          !element.getClientRects().length
        ) {
          return false;
        }

        const style = window.getComputedStyle(element);

        return (
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      }

      function getPlayerElement() {
        // No asumir que character-element-prototype es estable.
        // La interfaz puede reciclar nodos y generar duplicados.
        const matches = Array.from(
          document.querySelectorAll(".text-window")
        ).filter((element) => {
          const label = element
            .querySelector(".skull-name-row")
            ?.textContent?.trim();

          return label === playerName && isVisible(element);
        });

        // No seleccionar arbitrariamente entre varias coincidencias.
        return matches.length === 1 ? matches[0] : null;
      }

      function getStats() {
        const element = getPlayerElement();

        if (!element) return null;

        const hpBar = element.querySelector(".value-health");
        const manaBar = element.querySelector(".value-mana");

        const hpMatch = (hpBar?.getAttribute("title") || "")
          .match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);

        let health = null;
        let maxHealth = null;

        if (hpMatch) {
          const current = Number(hpMatch[1]);
          const maximum = Number(hpMatch[2]);

          if (
            Number.isSafeInteger(current) &&
            Number.isSafeInteger(maximum) &&
            maximum > 0 &&
            current >= 0 &&
            current <= maximum
          ) {
            health = current;
            maxHealth = maximum;
          }
        }

        const healthPercent = maxHealth !== null
          ? Math.round((health / maxHealth) * 10000) / 100
          : null;

        const manaPercent = parsePercentage(manaBar?.style?.width);

        if (health === null && manaPercent === null) {
          return null;
        }

        return {
          name: playerName,
          health,
          maxHealth,
          healthPercent,
          mana: null,
          maxMana: null,
          manaPercent,
          source: "dom",
          observedAt: new Date().toISOString()
        };
      }

      function setPlayerName(name) {
        if (typeof name !== "string" || !name.trim()) {
          return false;
        }

        playerName = name.trim();

        try {
          bot.storage?.set?.(storageKey, playerName);
        } catch (_) {}

        return true;
      }

      const api = {
        getStats,
        setPlayerName,

        status() {
          const stats = getStats();

          return {
            installed: true,
            playerName,
            playerVisible: stats !== null,
            healthAvailable:
              stats?.health !== null &&
              stats?.health !== undefined,
            manaPercentAvailable:
              stats?.manaPercent !== null &&
              stats?.manaPercent !== undefined,
            source: "dom",
            readOnly: true
          };
        }
      };

      bot.runtimeAdapter = api;
      window.__minibiaRuntimeAdapter = api;

      if (typeof bot.addCleanup === "function") {
        bot.addCleanup(() => {
          if (window.__minibiaRuntimeAdapter === api) {
            delete window.__minibiaRuntimeAdapter;
          }

          if (bot.runtimeAdapter === api) {
            delete bot.runtimeAdapter;
          }
        });
      }

      return api;
    };
})();

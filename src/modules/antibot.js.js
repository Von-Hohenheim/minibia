
window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installAntiBotModule = function installAntiBotModule(bot) {
    const TARGET = "anti-bot rune check";
    const COOLDOWN_MS = 5000;

    let lastAlertAt = 0;
    let originalHandler = null;
    let patchedPrototype = null;
    let retryTimer = null;

    function checkMessage(message) {
      const text = String(message ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

      if (!text.includes(TARGET)) return false;

      const now = Date.now();
      if (now - lastAlertAt < COOLDOWN_MS) return true;

      lastAlertAt = now;

      console.warn(
        "[minibia-copilot] ¡Anti-bot rune check detectado!",
        message
      );

      // Reutiliza el sistema de alarma del bot.
      bot.playAlarm();

      // Aviso visual que no bloquea el juego.
      let notice = document.getElementById(
        "minibia-antibot-notice"
      );

      if (!notice) {
        notice = document.createElement("div");
        notice.id = "minibia-antibot-notice";

        Object.assign(notice.style, {
          position: "fixed",
          top: "20px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: "2147483647",
          background: "#8b0000",
          color: "#ffffff",
          padding: "16px 24px",
          border: "2px solid #ff5555",
          borderRadius: "8px",
          font: "bold 18px sans-serif",
          boxShadow: "0 4px 20px #0009"
        });

        document.body.appendChild(notice);
      }

      notice.textContent =
        "⚠ ANTI-BOT RUNE CHECK — Atiéndelo manualmente";

      notice.style.display = "block";

      bot.log("Anti-bot rune check detected", {
        message: String(message),
        at: new Date().toISOString()
      });

      return true;
    }

    function installHook() {
      if (patchedPrototype) return true;

      // PacketHandler debe estar disponible en el cliente.
      const Handler =
        typeof PacketHandler !== "undefined"
          ? PacketHandler
          : window.PacketHandler;

      const prototype = Handler?.prototype;

      if (!prototype ||
          typeof prototype.handleServerMessage !== "function") {
        return false;
      }

      originalHandler = prototype.handleServerMessage;
      patchedPrototype = prototype;

      prototype.handleServerMessage = function (
        message,
        color,
        priority
      ) {
        try {
          checkMessage(message);
        } catch (error) {
          console.error(
            "[minibia-copilot] Anti-bot detector error",
            error
          );
        }

        // No modifica ni bloquea el mensaje original.
        return originalHandler.apply(this, arguments);
      };

      bot.log("Anti-bot message detector installed");
      return true;
    }

    function cleanup() {
      if (retryTimer !== null) {
        clearInterval(retryTimer);
        retryTimer = null;
      }

      if (
        patchedPrototype &&
        originalHandler &&
        patchedPrototype.handleServerMessage !== originalHandler
      ) {
        patchedPrototype.handleServerMessage = originalHandler;
      }

      document
        .getElementById("minibia-antibot-notice")
        ?.remove();

      patchedPrototype = null;
      originalHandler = null;
    }

    // Espera al cliente si todavía no ha terminado de cargar.
    if (!installHook()) {
      retryTimer = setInterval(() => {
        if (installHook()) {
          clearInterval(retryTimer);
          retryTimer = null;
        }
      }, 1000);
    }

    bot.addCleanup(cleanup);

    bot.antiBot = {
      checkMessage,
      status: () => ({
        installed: !!patchedPrototype,
        lastAlertAt
      }),
      stop: cleanup
    };
  };

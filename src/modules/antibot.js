
window.__minibiaCopilotBundle =
  window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installAntiBotModule =
  function installAntiBotModule(bot) {
    const target = "anti-bot rune check";
    const cooldownMs = 5000;
    const noticeDurationMs = 5000;

    let lastAlert = 0;
    let originalHandler = null;
    let prototype = null;
    let retryTimer = null;
    let noticeTimer = null;

    function detect(message) {
      if (!String(message ?? "").toLowerCase().includes(target)) {
        return false;
      }

      const now = Date.now();

      if (now - lastAlert < cooldownMs) {
        return true;
      }

      lastAlert = now;

      console.warn(
        "[AntiBot] ¡Comprobación detectada!",
        message
      );

      try {
        if (typeof bot.playAlarm === "function") {
          bot.playAlarm();
        }
      } catch (error) {
        console.error("[AntiBot] Error de alarma:", error);
      }

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
          boxShadow: "0 4px 20px #0009",
          textAlign: "center"
        });

        document.body.appendChild(notice);
      }

      notice.textContent =
        "⚠ ANTI-BOT RUNE CHECK — Atiéndelo manualmente";

      notice.style.display = "block";

      // Reinicia el temporizador para la alerta actual.
      if (noticeTimer !== null) {
        clearTimeout(noticeTimer);
      }

      noticeTimer = setTimeout(() => {
        notice.remove();
        noticeTimer = null;
      }, noticeDurationMs);

      return true;
    }

    function install() {
      const Handler =
        typeof PacketHandler !== "undefined"
          ? PacketHandler
          : window.PacketHandler;

      if (
        !Handler?.prototype ||
        typeof Handler.prototype.handleServerMessage !== "function"
      ) {
        return false;
      }

      // Evita instalar el mismo hook más de una vez.
      if (prototype) {
        return true;
      }

      prototype = Handler.prototype;
      originalHandler = prototype.handleServerMessage;

      const previousHandler = originalHandler;

      prototype.handleServerMessage = function (message) {
        try {
          detect(message);
        } catch (error) {
          console.error("[AntiBot] Error:", error);
        }

        return previousHandler.apply(this, arguments);
      };

      console.log("[AntiBot] Detector instalado");
      return true;
    }

    function cleanup() {
      if (retryTimer !== null) {
        clearInterval(retryTimer);
        retryTimer = null;
      }

      if (noticeTimer !== null) {
        clearTimeout(noticeTimer);
        noticeTimer = null;
      }

      if (
        prototype &&
        originalHandler &&
        prototype.handleServerMessage
      ) {
        // Restaura solo si nuestro hook sigue instalado.
        const currentHandler = prototype.handleServerMessage;

        if (currentHandler !== originalHandler) {
          prototype.handleServerMessage = originalHandler;
        }
      }

      document
        .getElementById("minibia-antibot-notice")
        ?.remove();

      prototype = null;
      originalHandler = null;
    }

    if (!install()) {
      retryTimer = setInterval(() => {
        if (install()) {
          clearInterval(retryTimer);
          retryTimer = null;
        }
      }, 1000);
    }

    if (typeof bot.addCleanup === "function") {
      bot.addCleanup(cleanup);
    }

    bot.antiBot = {
      checkMessage: detect,
      status: () => ({
        installed: !!prototype,
        lastAlertAt: lastAlert
      }),
      stop: cleanup
    };
  };

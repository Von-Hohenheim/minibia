
window.__minibiaCopilotBundle =
  window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installAntiBotModule =
  function installAntiBotModule(bot) {
    const target = "anti-bot rune check";
    let lastAlert = 0;
    let originalHandler = null;
    let prototype = null;
    let retryTimer = null;

    function detect(message) {
      if (!String(message ?? "").toLowerCase().includes(target)) {
        return;
      }

      if (Date.now() - lastAlert < 5000) return;
      lastAlert = Date.now();

      console.warn("[AntiBot] ¡Comprobación detectada!", message);

      try {
        if (typeof bot.playAlarm === "function") {
          bot.playAlarm();
        }
      } catch (error) {
        console.error("[AntiBot] Error de alarma:", error);
      }

      let notice = document.getElementById("minibia-antibot-notice");

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
          color: "white",
          padding: "16px 24px",
          borderRadius: "8px",
          font: "bold 18px sans-serif"
        });

        document.body.appendChild(notice);
      }

      notice.textContent =
        "⚠ ANTI-BOT RUNE CHECK — Atiéndelo manualmente";
    }

    function install() {
      const Handler =
        typeof PacketHandler !== "undefined"
          ? PacketHandler
          : window.PacketHandler;

      if (!Handler?.prototype ||
          typeof Handler.prototype.handleServerMessage !== "function") {
        return false;
      }

      prototype = Handler.prototype;
      originalHandler = prototype.handleServerMessage;

      prototype.handleServerMessage = function (message) {
        try {
          detect(message);
        } catch (error) {
          console.error("[AntiBot] Error:", error);
        }

        return originalHandler.apply(this, arguments);
      };

      console.log("[AntiBot] Detector instalado");
      return true;
    }

    function cleanup() {
      if (retryTimer !== null) {
        clearInterval(retryTimer);
        retryTimer = null;
      }

      if (prototype && originalHandler &&
          prototype.handleServerMessage !== originalHandler) {
        prototype.handleServerMessage = originalHandler;
      }

      document.getElementById("minibia-antibot-notice")?.remove();
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
      status: () => ({ installed: !!prototype }),
      stop: cleanup
    };
  };

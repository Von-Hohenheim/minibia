
window.__minibiaCopilotBundle =
  window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installRuntimeInspectorModule =
  function installRuntimeInspectorModule(bot) {
    const state = {
      installed: true,
      installedAt: new Date().toISOString(),
      client: null,
      lastRefresh: null,
    };

    const GLOBAL_CLIENT_NAMES = [
      "gameClient",
      "__minibiaGameClient",
      "minibiaGameClient",
    ];

    function log(...args) {
      console.log("[Minibia Runtime Inspector]", ...args);
    }

    function safeGlobalRead(name) {
      try {
        return window[name];
      } catch (error) {
        return undefined;
      }
    }

    function refresh() {
      let foundClient = null;
      let foundName = null;

      for (const name of GLOBAL_CLIENT_NAMES) {
        const candidate = safeGlobalRead(name);

        if (
          candidate !== null &&
          (typeof candidate === "object" ||
            typeof candidate === "function")
        ) {
          foundClient = candidate;
          foundName = name;
          break;
        }
      }

      state.client = foundClient;
      state.clientSource = foundName;
      state.lastRefresh = new Date().toISOString();

      return {
        found: Boolean(foundClient),
        source: foundName,
        type: foundClient ? typeof foundClient : null,
      };
    }

    function getClient() {
      if (!state.client) {
        refresh();
      }

      return state.client;
    }

    function getDescriptor(object, property) {
      let current = object;
      let depth = 0;

      while (current && depth < 10) {
        try {
          const descriptor = Object.getOwnPropertyDescriptor(
            current,
            property
          );

          if (descriptor) {
            return {
              descriptor,
              owner: current,
              inherited: depth > 0,
            };
          }

          current = Object.getPrototypeOf(current);
          depth++;
        } catch (error) {
          return {
            error: String(error),
          };
        }
      }

      return null;
    }

    function describe(value) {
      if (value === null) {
        return { type: "null", value: null };
      }

      const type = typeof value;

      if (
        type === "string" ||
        type === "number" ||
        type === "boolean" ||
        type === "undefined"
      ) {
        return {
          type,
          value,
        };
      }

      if (type === "function") {
        return {
          type: "function",
          name: value.name || "(anonymous)",
          length: value.length,
        };
      }

      let prototypeName = null;

      try {
        const prototype = Object.getPrototypeOf(value);
        const constructorDescriptor = prototype
          ? Object.getOwnPropertyDescriptor(
              prototype,
              "constructor"
            )
          : null;

        if (
          constructorDescriptor &&
          typeof constructorDescriptor.value === "function"
        ) {
          prototypeName =
            constructorDescriptor.value.name || null;
        }
      } catch (error) {
        // La descripción continúa sin el nombre del prototipo.
      }

      let keys = [];

      try {
        keys = Object.keys(value);
      } catch (error) {
        keys = [];
      }

      return {
        type: Array.isArray(value) ? "array" : "object",
        constructor: prototypeName,
        keyCount: keys.length,
        keys: keys.slice(0, 80),
      };
    }

    function getPathSegments(path) {
      if (Array.isArray(path)) {
        return path.map(String);
      }

      return String(path)
        .replace(/\[(\d+)\]/g, ".$1")
        .split(".")
        .filter(Boolean);
    }

    function inspect(path) {
      const client = getClient();

      if (!client) {
        return {
          found: false,
          error: "No se encontró una referencia global al GameClient.",
          availableGlobals: GLOBAL_CLIENT_NAMES.map((name) => ({
            name,
            available: safeGlobalRead(name) != null,
          })),
        };
      }

      const segments = getPathSegments(path);

      if (segments[0] === "client") {
        segments.shift();
      }

      let current = client;
      const traversed = [];

      for (const segment of segments) {
        if (
          current === null ||
          (typeof current !== "object" &&
            typeof current !== "function")
        ) {
          return {
            found: false,
            path,
            traversed,
            error: "El valor intermedio no es un objeto.",
          };
        }

        const result = getDescriptor(current, segment);

        if (!result || !result.descriptor) {
          return {
            found: false,
            path,
            traversed,
            missingProperty: segment,
          };
        }

        if (result.error) {
          return {
            found: false,
            path,
            traversed,
            error: result.error,
          };
        }

        const descriptor = result.descriptor;

        traversed.push({
          property: segment,
          inherited: result.inherited,
          kind: Object.prototype.hasOwnProperty.call(
            descriptor,
            "value"
          )
            ? "value"
            : "accessor",
        });

        // No ejecutamos getters ni métodos.
        if (!Object.prototype.hasOwnProperty.call(
          descriptor,
          "value"
        )) {
          return {
            found: true,
            path,
            traversed,
            accessor: true,
            getterAvailable: typeof descriptor.get === "function",
            setterAvailable: typeof descriptor.set === "function",
            note: "No se ejecutó el getter por seguridad.",
          };
        }

        current = descriptor.value;
      }

      return {
        found: true,
        path,
        traversed,
        result: describe(current),
        value: current,
      };
    }

    function snapshot() {
      const client = getClient();

      if (!client) {
        const result = {
          found: false,
          message:
            "No se encontró GameClient en las referencias globales conocidas.",
          globals: GLOBAL_CLIENT_NAMES.map((name) => ({
            name,
            available: safeGlobalRead(name) != null,
          })),
        };

        log("Snapshot:", result);
        return result;
      }

      const result = {
        found: true,
        source: state.clientSource,
        capturedAt: new Date().toISOString(),
        client: describe(client),
        properties: {},
      };

      let keys = [];

      try {
        keys = Object.getOwnPropertyNames(client);
      } catch (error) {
        result.error = String(error);
      }

      for (const key of keys.slice(0, 100)) {
        const descriptor = getDescriptor(client, key);

        if (!descriptor || !descriptor.descriptor) {
          result.properties[key] = {
            type: "unavailable",
          };
          continue;
        }

        const propertyDescriptor = descriptor.descriptor;

        if (
          !Object.prototype.hasOwnProperty.call(
            propertyDescriptor,
            "value"
          )
        ) {
          result.properties[key] = {
            type: "accessor",
            getter: typeof propertyDescriptor.get === "function",
            setter: typeof propertyDescriptor.set === "function",
            inherited: descriptor.inherited,
          };
          continue;
        }

        result.properties[key] = {
          ...describe(propertyDescriptor.value),
          inherited: descriptor.inherited,
        };
      }

      log("Snapshot del GameClient:", result);
      return result;
    }

    function find(term, options = {}) {
      const client = getClient();

      if (!client) {
        return {
          found: false,
          error: "GameClient no disponible.",
          matches: [],
        };
      }

      const searchTerm = String(term).toLowerCase();
      const maxDepth = Math.min(
        Number(options.maxDepth) || 3,
        5
      );
      const maxResults = Math.min(
        Number(options.maxResults) || 100,
        300
      );

      const matches = [];
      const visited = new WeakSet();

      function walk(object, path, depth) {
        if (
          !object ||
          (typeof object !== "object" &&
            typeof object !== "function") ||
          depth > maxDepth ||
          matches.length >= maxResults
        ) {
          return;
        }

        if (visited.has(object)) {
          return;
        }

        visited.add(object);

        let keys = [];

        try {
          keys = Object.getOwnPropertyNames(object);
        } catch (error) {
          return;
        }

        for (const key of keys) {
          if (matches.length >= maxResults) {
            return;
          }

          const currentPath = path
            ? `${path}.${key}`
            : key;

          if (key.toLowerCase().includes(searchTerm)) {
            matches.push({
              path: currentPath,
              property: key,
            });
          }

          const descriptor = Object.getOwnPropertyDescriptor(
            object,
            key
          );

          // No ejecutamos getters ni métodos.
          if (
            descriptor &&
            Object.prototype.hasOwnProperty.call(
              descriptor,
              "value"
            )
          ) {
            walk(
              descriptor.value,
              currentPath,
              depth + 1
            );
          }
        }
      }

      walk(client, "client", 0);

      log(`Búsqueda "${term}":`, matches);

      return {
        term,
        count: matches.length,
        matches,
        truncated: matches.length >= maxResults,
      };
    }

    function status() {
      return {
        installed: state.installed,
        installedAt: state.installedAt,
        clientAvailable: Boolean(getClient()),
        clientSource: state.clientSource || null,
        lastRefresh: state.lastRefresh,
        capabilities: [
          "snapshot",
          "inspect",
          "find",
          "refresh",
          "getClient",
          "status",
        ],
        restrictions: [
          "No ejecuta getters.",
          "No invoca métodos del juego.",
          "No modifica propiedades.",
          "No envía paquetes ni simula entradas.",
        ],
      };
    }

    const api = {
      snapshot,
      inspect,
      find,
      status,
      refresh,
      getClient,
    };

    refresh();

    bot.runtimeInspector = api;

    const previousInspector = window.__minibiaRuntimeInspector;

    window.__minibiaRuntimeInspector = api;

    if (typeof bot.addCleanup === "function") {
      bot.addCleanup(() => {
        state.installed = false;

        if (bot.runtimeInspector === api) {
          delete bot.runtimeInspector;
        }

        if (window.__minibiaRuntimeInspector === api) {
          if (previousInspector === undefined) {
            delete window.__minibiaRuntimeInspector;
          } else {
            window.__minibiaRuntimeInspector =
              previousInspector;
          }
        }
      });
    }

    log("Módulo instalado.", status());

    return api;
  };

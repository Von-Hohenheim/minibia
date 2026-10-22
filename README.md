# Minibia Copilot

## Load From GitHub In Chrome Or Edge

1. Open the game page.
2. Click the browser menu button in the top-right:
   Chrome: the three vertical dots.
   Edge: the three horizontal dots.
3. Go to `More tools`.
4. Click `Developer tools`.
5. Click the `Console` tab.
6. Paste this and press `Enter`:

```js
fetch("https://raw.githubusercontent.com/Sconn-sys/Minibia-Bot/refs/heads/main/minibia-copilot.js?v=" + Date.now())
  .then((r) => r.text())
  .then((code) => eval(code));
```

If the console warns about pasting code, type `allow pasting` first and press `Enter`, then paste the script loader again.

The `?v=` + timestamp at the end defeats GitHub's CDN cache, so every paste fetches the freshest build (otherwise updates can take up to 5 minutes to appear).

## Code

This repo now has a simple source layout for browser-loaded Minibia routines, while still serving a single `minibia-copilot.js` bundle that you can reload from DevTools.

**Layout**

- [minibia-copilot.js](/home/yuno/minibia-copilot/minibia-copilot.js): built browser bundle you load in game
- [src/core.js](/home/yuno/minibia-copilot/src/core.js): shared runtime helpers
- [src/modules/pz.js](/home/yuno/minibia-copilot/src/modules/pz.js): PZ/home navigation module
- [src/modules/rune.js](/home/yuno/minibia-copilot/src/modules/rune.js): rune loop module
- [src/modules/heal.js](/home/yuno/minibia-copilot/src/modules/heal.js): auto heal loop for hp and mana hotkeys
- [src/ui/panel.js](/home/yuno/minibia-copilot/src/ui/panel.js): draggable in-game panel
- [src/main.js](/home/yuno/minibia-copilot/src/main.js): bundle entrypoint
- [build.sh](/home/yuno/minibia-copilot/build.sh): rebuilds `minibia-copilot.js` from `src/`
- [cors_http_server.py](/home/yuno/minibia-copilot/cors_http_server.py): local dev server with CORS headers for browser fetches

**Reload In Game**

```js
fetch("http://127.0.0.1:8000/minibia-copilot.js?v=" + Date.now())
  .then((r) => r.text())
  .then((code) => eval(code));
```

If the browser blocks that request because of CORS, run:

```bash
python3 cors_http_server.py
```

That serves this folder on `http://127.0.0.1:8000/` with `Access-Control-Allow-Origin: *`.

**Main API**

```js
minibiaCopilot.status()

minibiaCopilot.pz.setHomePzCurrentSpot()
minibiaCopilot.pz.goToHomePz()
minibiaCopilot.pz.goToNearestPz()

minibiaCopilot.rune.start()
minibiaCopilot.rune.stop()
minibiaCopilot.rune.status()

minibiaCopilot.heal.start()
minibiaCopilot.heal.stop()
minibiaCopilot.heal.status()

minibiaCopilot.magicWall.start()           // overlay 20s countdown on placed magic walls
minibiaCopilot.magicWall.stop()
minibiaCopilot.magicWall.status()
minibiaCopilot.magicWall.list()            // active timers
minibiaCopilot.magicWall.updateConfig({ audioOnExpiry: true, flashLeadMs: 3000 })

// Multi-floor cavebot waypoints (ElfBot/NeoBot style):
minibiaCopilot.cave.addWaypointCurrentSpot()                 // "node" (default)
minibiaCopilot.cave.addStandWaypointCurrentSpot()            // exact tile
minibiaCopilot.cave.addRopeWaypointCurrentSpot()             // use rope on this tile
minibiaCopilot.cave.addLadderWaypointCurrentSpot()           // use ladder on this tile
minibiaCopilot.cave.addShovelWaypointCurrentSpot()           // dig with shovel
minibiaCopilot.cave.addUseWaypointCurrentSpot()              // single click-use (levers, holes you step on)
minibiaCopilot.cave.addLabelWaypoint("depot")
```

Backward-compatible alias:

```js
pzBot.goToNearestPz()
```

**Rebuild After Editing `src/`**

```bash
./build.sh
```

**Notes**

- The panel is draggable and saves its position in `localStorage`.
- Reloading the bundle destroys the existing panel and stops the existing loops before installing the new one.
- The served runtime is `minibia-copilot.js`; source lives under `src/`.


## Download minibia source
```
 (async () => {
    const fromPerf = performance.getEntriesByType("resource").map(r => r.name);
    const fromScripts = [...document.scripts].map(s => s.src).filter(Boolean);

    const urls = [...new Set([...fromPerf, ...fromScripts])]
      .filter(url => url.includes("minibia") && /\.js(\?|$)/i.test(url))
      .sort();

    console.log(`Found ${urls.length} JS files`);

    const parts = [];

    for (const url of urls) {
      try {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();

        parts.push(
          `\n\n/* ===== FILE: ${url} ===== */\n\n${text}`
        );

        console.log(`Fetched: ${url}`);
      } catch (err) {
        parts.push(
          `\n\n/* ===== FAILED: ${url} =====\n${String(err)}\n===== */\n\n`
        );
        console.error(`Failed: ${url}`, err);
      }
    }

    const blob = new Blob(parts, { type: "text/javascript;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = blobUrl;
    a.download = "minibia-all.js";
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

    console.log("Downloaded minibia-all.js");
  })();
```
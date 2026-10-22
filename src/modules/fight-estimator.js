window.__minibiaCopilotBundle = window.__minibiaCopilotBundle || {};

window.__minibiaCopilotBundle.installFightEstimatorModule = function installFightEstimatorModule(bot) {
  const configStorageKey = "minibiaCopilot.fightEstimator.config";
  const cacheStorageKey = "minibiaCopilot.fightEstimator.libraryCache";
  const wikiCacheStorageKey = "minibiaCopilot.fightEstimator.wikiCache";

  const config = Object.assign(
    {
      libraryUrl: "/api/library",
      cacheTtlMs: 30 * 60 * 1000,
      wikiBaseUrl: "https://tibia.fandom.com",
      wikiCacheTtlMs: 7 * 24 * 60 * 60 * 1000,
      enableWikiFallback: true,
    },
    bot.storage.get(configStorageKey, {})
  );

  const state = {
    monsters: null,
    monstersByKey: null,
    fetchedAt: 0,
    inFlightPromise: null,
    lastError: null,
    wikiCache: {},
    wikiInFlight: new Map(),
  };

  function loadWikiCache() {
    const raw = bot.storage.get(wikiCacheStorageKey, {});
    if (raw && typeof raw === "object") {
      const cutoff = Date.now() - Math.max(60000, Number(config.wikiCacheTtlMs) || 1);
      const next = {};
      Object.keys(raw).forEach((key) => {
        const entry = raw[key];
        if (entry && entry.fetchedAt > cutoff && entry.monster && entry.monster.name) {
          next[key] = entry;
        }
      });
      state.wikiCache = next;
    }
  }

  function persistWikiCache() {
    try { bot.storage.set(wikiCacheStorageKey, state.wikiCache); } catch (error) {}
  }

  function loadCache() {
    const raw = bot.storage.get(cacheStorageKey, null);
    if (!raw || !Array.isArray(raw.monsters) || !Number.isFinite(raw.fetchedAt)) return false;
    const age = Date.now() - raw.fetchedAt;
    if (age > Math.max(60000, Number(config.cacheTtlMs) || 1800000)) return false;
    state.monsters = raw.monsters;
    state.fetchedAt = raw.fetchedAt;
    rebuildIndex();
    return true;
  }

  function rebuildIndex() {
    const index = new Map();
    (state.monsters || []).forEach((monster) => {
      if (!monster?.name) return;
      index.set(String(monster.name).toLowerCase(), monster);
    });
    state.monstersByKey = index;
  }

  async function fetchLibrary({ force = false } = {}) {
    if (!force && state.monsters && Date.now() - state.fetchedAt < Math.max(60000, Number(config.cacheTtlMs) || 1800000)) {
      return state.monsters;
    }
    if (!force && loadCache()) return state.monsters;
    if (state.inFlightPromise) return state.inFlightPromise;

    state.inFlightPromise = (async () => {
      try {
        const headers = {
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        };
        try {
          if (window.location?.href) headers["Referer"] = window.location.href;
        } catch (error) {}
        const response = await fetch(config.libraryUrl, {
          credentials: "include",
          headers,
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${config.libraryUrl}`);
        const data = await response.json();
        if (!data || !Array.isArray(data.monsters)) {
          throw new Error("library response missing monsters array");
        }
        state.monsters = data.monsters;
        state.fetchedAt = Date.now();
        state.lastError = null;
        rebuildIndex();
        try { bot.storage.set(cacheStorageKey, { monsters: state.monsters, fetchedAt: state.fetchedAt }); } catch (error) {}
        bot.log("fight estimator: library loaded", { count: state.monsters.length });
        return state.monsters;
      } catch (error) {
        state.lastError = error?.message || String(error);
        bot.log("fight estimator: library fetch failed", { error: state.lastError });
        throw error;
      } finally {
        state.inFlightPromise = null;
      }
    })();

    return state.inFlightPromise;
  }

  function findMonster(name) {
    if (!name) return null;
    const key = String(name).toLowerCase();
    if (state.monstersByKey) {
      const fromLibrary = state.monstersByKey.get(key);
      if (fromLibrary) return { ...fromLibrary, __source: "library" };
    }
    const wikiEntry = state.wikiCache[key];
    if (wikiEntry?.monster) return { ...wikiEntry.monster, __source: "wiki" };
    return null;
  }

  function extractInfoboxBlock(wikitext) {
    if (!wikitext || typeof wikitext !== "string") return null;
    const match = wikitext.match(/\{\{\s*Infobox[_\s]+Creature/i);
    if (!match) return null;
    const start = match.index;
    let depth = 0;
    for (let i = start; i < wikitext.length - 1; i += 1) {
      if (wikitext[i] === "{" && wikitext[i + 1] === "{") { depth += 1; i += 1; continue; }
      if (wikitext[i] === "}" && wikitext[i + 1] === "}") {
        depth -= 1;
        if (depth === 0) return wikitext.slice(start, i + 2);
        i += 1;
      }
    }
    return null;
  }

  function parseInfoboxParams(block) {
    if (!block) return {};
    const inside = block.replace(/^\{\{[^|]*\|/, "").replace(/\}\}\s*$/, "");
    const params = {};
    let depth = 0;
    let buf = "";
    for (let i = 0; i < inside.length; i += 1) {
      const ch = inside[i];
      const next = inside[i + 1];
      if (ch === "{" && next === "{") { depth += 1; buf += "{{"; i += 1; continue; }
      if (ch === "}" && next === "}") { depth -= 1; buf += "}}"; i += 1; continue; }
      if (ch === "[" && next === "[") { depth += 1; buf += "[["; i += 1; continue; }
      if (ch === "]" && next === "]") { depth -= 1; buf += "]]"; i += 1; continue; }
      if (ch === "|" && depth === 0) {
        absorbParam(buf, params);
        buf = "";
        continue;
      }
      buf += ch;
    }
    absorbParam(buf, params);
    return params;
  }

  function absorbParam(chunk, target) {
    const equalsIndex = chunk.indexOf("=");
    if (equalsIndex < 0) return;
    const key = chunk.slice(0, equalsIndex).trim().toLowerCase();
    const value = chunk.slice(equalsIndex + 1).trim();
    if (key) target[key] = value;
  }

  function stripWikilinks(text) {
    return String(text || "")
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/'''?/g, "")
      .trim();
  }

  function parseWikiAttacks(rawAbilities) {
    if (!rawAbilities) return [];
    const out = [];
    const text = String(rawAbilities);
    const attackRegex = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*(?:\(([^)]*)\))?/g;
    let m;
    while ((m = attackRegex.exec(text)) !== null) {
      const name = stripWikilinks(m[1]);
      const inside = (m[2] || "").trim();
      const rangeMatch = inside.match(/(\d+)\s*-\s*(\d+)/);
      const min = rangeMatch ? Number(rangeMatch[1]) : null;
      const max = rangeMatch ? Number(rangeMatch[2]) : null;
      const elementMatch = inside.match(/\b(physical|fire|energy|earth|ice|holy|death|drown|life ?drain|mana ?drain)\b/i);
      out.push({
        name,
        min,
        max,
        element: elementMatch ? elementMatch[1].toLowerCase().replace(/\s+/g, "") : null,
      });
    }
    return out;
  }

  function parseWikiImmunities(rawImm) {
    if (!rawImm) return {};
    const text = stripWikilinks(rawImm).toLowerCase();
    const elements = ["physical", "fire", "energy", "earth", "ice", "holy", "death", "drown", "lifedrain", "manadrain", "invisible", "paralyze"];
    const out = {};
    elements.forEach((el) => {
      if (text.includes(el)) out[el] = true;
    });
    return out;
  }

  function parseWikiMonsterFromWikitext(wikitext, name) {
    const block = extractInfoboxBlock(wikitext);
    if (!block) return null;
    const params = parseInfoboxParams(block);
    const hp = Number(params.hp || params.hitpoints || params.health);
    const exp = Number(params.exp || params.experience || params.xp);
    const armor = Number(params.armor || params.armour);
    const speed = Number(params.speed);
    const attacks = parseWikiAttacks(params.abilities || params.attacks || params.skills);
    const immunities = parseWikiImmunities(params.immune || params.immunities || params.immuneto);

    return {
      name: String(name).trim(),
      health: Number.isFinite(hp) ? hp : null,
      experience: Number.isFinite(exp) ? exp : null,
      armor: Number.isFinite(armor) ? armor : 0,
      speed: Number.isFinite(speed) ? speed : 0,
      attacks,
      immunities,
      loot: [],
    };
  }

  async function fetchWikiMonster(name, { force = false } = {}) {
    if (!config.enableWikiFallback) return null;
    const key = String(name || "").trim().toLowerCase();
    if (!key) return null;

    if (!force) {
      const cached = state.wikiCache[key];
      const cutoff = Date.now() - Math.max(60000, Number(config.wikiCacheTtlMs) || 1);
      if (cached && cached.fetchedAt > cutoff && cached.monster) {
        return cached.monster;
      }
    }

    if (state.wikiInFlight.has(key)) return state.wikiInFlight.get(key);

    const promise = (async () => {
      const titles = [name, name.replace(/\s+/g, "_")];
      let monster = null;
      for (const title of titles) {
        const url =
          String(config.wikiBaseUrl).replace(/\/$/, "") +
          "/api.php?action=parse&prop=wikitext&redirects=1&format=json&origin=*&page=" +
          encodeURIComponent(title);
        try {
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok) continue;
          const data = await response.json();
          const wikitext = data?.parse?.wikitext?.["*"];
          if (!wikitext) continue;
          const parsed = parseWikiMonsterFromWikitext(wikitext, data?.parse?.title || name);
          if (parsed && parsed.health) {
            monster = parsed;
            break;
          }
        } catch (error) {
          bot.log("fight estimator: wiki fetch failed", { title, error: error?.message || error });
        }
      }

      if (monster) {
        state.wikiCache[key] = { monster, fetchedAt: Date.now() };
        persistWikiCache();
      }
      return monster;
    })();

    state.wikiInFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      state.wikiInFlight.delete(key);
    }
  }

  async function ensureMonster(name) {
    let found = findMonster(name);
    if (found) return found;
    const wiki = await fetchWikiMonster(name);
    return wiki ? { ...wiki, __source: "wiki" } : null;
  }

  function searchMonsters(query, limit = 12) {
    if (!state.monsters) return [];
    const q = String(query || "").trim().toLowerCase();
    if (!q) {
      return state.monsters
        .slice()
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
        .slice(0, limit);
    }
    const matches = [];
    for (const monster of state.monsters) {
      const name = String(monster.name || "");
      if (!name) continue;
      const lower = name.toLowerCase();
      if (lower.startsWith(q)) {
        matches.push({ monster, score: 0, name });
      } else if (lower.includes(q)) {
        matches.push({ monster, score: 1, name });
      }
      if (matches.length >= limit * 4) break;
    }
    matches.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
    return matches.slice(0, limit).map((m) => m.monster);
  }

  function avgAttackDamage(attack) {
    if (!attack || typeof attack !== "object") return 0;
    const candidates = [
      [attack.min, attack.max],
      [attack.minDamage, attack.maxDamage],
      [attack.damageMin, attack.damageMax],
      [attack.dmgMin, attack.dmgMax],
    ];
    for (const [min, max] of candidates) {
      if (Number.isFinite(Number(min)) && Number.isFinite(Number(max))) {
        return (Math.abs(Number(min)) + Math.abs(Number(max))) / 2;
      }
    }
    const flat = [attack.damage, attack.value, attack.avg, attack.average];
    for (const v of flat) {
      if (Number.isFinite(Number(v))) return Math.abs(Number(v));
    }
    return 0;
  }

  function attackInterval(attack) {
    const cd = Number(attack?.cooldown ?? attack?.interval ?? attack?.cd ?? attack?.delay);
    if (Number.isFinite(cd) && cd > 0) {
      return cd >= 100 ? cd / 1000 : cd;
    }
    return 2;
  }

  function getAttackElement(attack) {
    const raw = String(attack?.element || attack?.type || attack?.damageType || attack?.school || "")
      .trim()
      .toLowerCase();
    return raw || null;
  }

  function isImmune(monster, element) {
    if (!element || !monster?.immunities) return false;
    const imm = monster.immunities;
    if (Array.isArray(imm)) return imm.map((e) => String(e).toLowerCase()).includes(element);
    if (typeof imm === "object") return !!imm[element];
    return false;
  }

  function damagePerSecond(attacker, defender) {
    const attacks = Array.isArray(attacker?.attacks) ? attacker.attacks : [];
    if (!attacks.length) {
      const hp = Number(attacker?.health) || 0;
      const exp = Number(attacker?.experience) || 0;
      return Math.max(0, Math.round((hp + exp * 3) / 200));
    }
    let total = 0;
    for (const atk of attacks) {
      const element = getAttackElement(atk);
      if (element && isImmune(defender, element)) continue;
      const avg = avgAttackDamage(atk);
      if (avg <= 0) continue;
      const armor = Number(defender?.armor) || 0;
      const mitigated = Math.max(0, avg - armor * 0.5);
      const interval = attackInterval(atk);
      total += mitigated / interval;
    }
    return total;
  }

  function simulate(nameA, nameB) {
    const a = findMonster(nameA);
    const b = findMonster(nameB);
    if (!a || !b) {
      return { error: !a ? `Unknown monster (try the Fight! button to check Tibia wiki too): ${nameA}` : `Unknown monster (try the Fight! button to check Tibia wiki too): ${nameB}` };
    }
    return simulateFromObjects(a, b);
  }

  function listImmunities(monster) {
    const imm = monster?.immunities;
    if (!imm) return [];
    if (Array.isArray(imm)) return imm.map(String);
    if (typeof imm === "object") {
      return Object.keys(imm).filter((k) => imm[k]);
    }
    return [];
  }

  function snapshot(monster, dps, ttk) {
    return {
      name: monster.name,
      health: monster.health,
      armor: monster.armor || 0,
      speed: monster.speed || 0,
      experience: monster.experience || 0,
      attackCount: Array.isArray(monster.attacks) ? monster.attacks.length : 0,
      immunities: listImmunities(monster),
      dps: Number(dps.toFixed(1)),
      ttkOpponentSec: Number.isFinite(ttk) ? Number(ttk.toFixed(1)) : null,
      source: monster.__source || "library",
    };
  }

  async function simulateAsync(nameA, nameB) {
    const [a, b] = await Promise.all([ensureMonster(nameA), ensureMonster(nameB)]);
    if (!a) return { error: `Unknown monster (not in Minibia library or Tibia wiki): ${nameA}` };
    if (!b) return { error: `Unknown monster (not in Minibia library or Tibia wiki): ${nameB}` };
    return simulateFromObjects(a, b);
  }

  function simulateFromObjects(a, b) {
    const dpsAB = damagePerSecond(a, b);
    const dpsBA = damagePerSecond(b, a);
    const hpA = Math.max(1, Number(a.health) || 1);
    const hpB = Math.max(1, Number(b.health) || 1);
    const ttkAB = dpsAB > 0 ? hpB / dpsAB : Number.POSITIVE_INFINITY;
    const ttkBA = dpsBA > 0 ? hpA / dpsBA : Number.POSITIVE_INFINITY;

    let winner;
    let winnerName;
    let loserName;
    let hpRemaining = 0;
    const reasons = [];

    if (!Number.isFinite(ttkAB) && !Number.isFinite(ttkBA)) {
      winner = "draw";
      reasons.push("Neither can damage the other (mutual immunity or zero attacks in the dataset).");
    } else if (ttkAB < ttkBA) {
      winner = "a"; winnerName = a.name; loserName = b.name;
      hpRemaining = Math.max(0, hpA - dpsBA * ttkAB);
      reasons.push(`${a.name} kills ${b.name} in ~${ttkAB.toFixed(1)}s; ${b.name} would have needed ~${Number.isFinite(ttkBA) ? ttkBA.toFixed(1) + "s" : "infinity"}.`);
    } else if (ttkBA < ttkAB) {
      winner = "b"; winnerName = b.name; loserName = a.name;
      hpRemaining = Math.max(0, hpB - dpsAB * ttkBA);
      reasons.push(`${b.name} kills ${a.name} in ~${ttkBA.toFixed(1)}s; ${a.name} would have needed ~${Number.isFinite(ttkAB) ? ttkAB.toFixed(1) + "s" : "infinity"}.`);
    } else {
      winner = "draw";
      reasons.push("Both reach 0 HP at the same time.");
    }

    if (a.armor || b.armor) {
      reasons.push(`Armor reduces incoming damage (${a.name}: ${a.armor || 0}, ${b.name}: ${b.armor || 0}).`);
    }
    const aImmList = listImmunities(a);
    const bImmList = listImmunities(b);
    if (aImmList.length) reasons.push(`${a.name} immune to: ${aImmList.join(", ")}.`);
    if (bImmList.length) reasons.push(`${b.name} immune to: ${bImmList.join(", ")}.`);

    if (a.__source === "wiki" || b.__source === "wiki") {
      reasons.push("Stats sourced from Tibia wiki where Minibia's library didn't have the creature; expect canonical Tibia numbers, not Minibia-tuned ones.");
    }

    return {
      a: snapshot(a, dpsAB, ttkAB),
      b: snapshot(b, dpsBA, ttkBA),
      winner,
      winnerName,
      loserName,
      hpRemaining: Math.round(hpRemaining),
      confidence: computeConfidence(ttkAB, ttkBA),
      reasons,
    };
  }

  function computeConfidence(ttkA, ttkB) {
    if (!Number.isFinite(ttkA) && !Number.isFinite(ttkB)) return "n/a";
    if (!Number.isFinite(ttkA)) return "decisive";
    if (!Number.isFinite(ttkB)) return "decisive";
    const ratio = Math.min(ttkA, ttkB) / Math.max(ttkA, ttkB);
    if (ratio < 0.5) return "decisive";
    if (ratio < 0.8) return "likely";
    if (ratio < 0.95) return "edge";
    return "coin flip";
  }

  function status() {
    return {
      monsterCount: state.monsters?.length || 0,
      fetchedAt: state.fetchedAt,
      lastError: state.lastError,
      cacheTtlMs: config.cacheTtlMs,
    };
  }

  function clearCache() {
    state.monsters = null;
    state.monstersByKey = null;
    state.fetchedAt = 0;
    try { bot.storage.remove(cacheStorageKey); } catch (error) {}
    return true;
  }

  loadCache();
  loadWikiCache();

  bot.fightEstimator = {
    fetchLibrary,
    findMonster,
    searchMonsters,
    simulate,
    simulateAsync,
    fetchWikiMonster,
    ensureMonster,
    status,
    clearCache,
    config,
  };
};

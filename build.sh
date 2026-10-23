#!/usr/bin/env bash
set -euo pipefail

cat \
  src/core.js \
  src/modules/pz.js \
  src/modules/xray.js \
  src/modules/panic.js \
  src/modules/rune.js \
  src/modules/heal.js \
  src/modules/auto-invisible.js \
  src/modules/auto-magic-shield.js \
  src/modules/auto-attack.js \
  src/modules/cave.js \
  src/modules/equip-ring.js \
  src/modules/equip-amulet.js \
  src/modules/auto-eat.js \
  src/modules/talk.js \
  src/modules/magic-wall.js \
  src/modules/hunt.js \
  src/modules/antibot.js \
  src/modules/tracker.js \
  src/modules/alpha-watch.js \
  src/modules/fight-estimator.js \
  src/modules/lootbag.js \
  src/ui/panel.js \
  src/main.js \
  > minibia-copilot.js

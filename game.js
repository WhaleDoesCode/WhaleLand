"use strict";

const SAVE_KEY = "whaleLandSaveV1";
const GRID_WIDTH = 11;
const GRID_HEIGHT = 9;
const PLAYER_START = { x: 1, y: 4 };
const EXIT_POSITION = { x: 9, y: 4 };
const PLAYER_MOVE_INTERVAL = 145;
const ENEMY_TICK_INTERVAL = 430;
const PLAYER_ATTACK_COOLDOWN = 330;
const ENEMY_ATTACK_COOLDOWN = 900;
const RESPAWN_DELAY = 550;

const directions = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const directionNames = Object.keys(directions);

const elements = {
  grid: document.querySelector("#gameGrid"),
  zoneLabel: document.querySelector("#zoneLabel"),
  hpStat: document.querySelector("#hpStat"),
  attackStat: document.querySelector("#attackStat"),
  defenseStat: document.querySelector("#defenseStat"),
  crystalStat: document.querySelector("#crystalStat"),
  gateText: document.querySelector("#gateText"),
  goalText: document.querySelector("#goalText"),
  gateBar: document.querySelector("#gateBar"),
  message: document.querySelector("#message"),
  attackButton: document.querySelector("#attackButton"),
  saveButton: document.querySelector("#saveButton"),
  resetButton: document.querySelector("#resetButton"),
  upgradeButtons: [...document.querySelectorAll(".upgrade-button")],
  attackUpgradeText: document.querySelector("#attackUpgradeText"),
  healthUpgradeText: document.querySelector("#healthUpgradeText"),
  defenseUpgradeText: document.querySelector("#defenseUpgradeText")
};

function defaultSave() {
  return {
    version: 1,
    zone: 1,
    maxZone: 1,
    crystals: 0,
    upgrades: {
      attack: 0,
      health: 0,
      defense: 0
    },
    zoneProgress: {}
  };
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();

    const parsed = JSON.parse(raw);
    const clean = defaultSave();

    clean.zone = Math.max(1, Number(parsed.zone) || 1);
    clean.maxZone = Math.max(clean.zone, Number(parsed.maxZone) || clean.zone);
    clean.crystals = Math.max(0, Number(parsed.crystals) || 0);
    clean.upgrades.attack = Math.max(0, Number(parsed.upgrades?.attack) || 0);
    clean.upgrades.health = Math.max(0, Number(parsed.upgrades?.health) || 0);
    clean.upgrades.defense = Math.max(0, Number(parsed.upgrades?.defense) || 0);
    clean.zoneProgress = parsed.zoneProgress && typeof parsed.zoneProgress === "object"
      ? parsed.zoneProgress
      : {};

    return clean;
  } catch (error) {
    console.warn("WhaleLand save could not be loaded.", error);
    return defaultSave();
  }
}

let save = loadSave();
let walls = new Set();
let enemies = [];
let swordCell = null;
let nextEnemyId = 1;
let messageText = "Real-time mode: hold a direction to move. Face a monster and attack.";
let nextPlayerMoveAt = 0;
let nextPlayerAttackAt = 0;
let attackButtonTimer = null;
let playerDefeated = false;
let transitioningZone = false;
const directionInputs = new Map();

const player = {
  x: PLAYER_START.x,
  y: PLAYER_START.y,
  hp: 20,
  facing: "right"
};

function cellKey(x, y) {
  return `${x},${y}`;
}

function getZoneProgress() {
  const key = String(save.zone);
  const existing = save.zoneProgress[key];

  if (!existing || typeof existing !== "object") {
    save.zoneProgress[key] = { kills: 0, guardianDefeated: false };
  }

  save.zoneProgress[key].kills = Math.max(0, Number(save.zoneProgress[key].kills) || 0);
  save.zoneProgress[key].guardianDefeated = Boolean(save.zoneProgress[key].guardianDefeated);
  return save.zoneProgress[key];
}

function getMaxHp() {
  return 20 + save.upgrades.health * 5;
}

function getAttack() {
  return 2 + save.upgrades.attack;
}

function getDefense() {
  return save.upgrades.defense;
}

function getGateRequirement() {
  return 6 + (save.zone - 1) * 2;
}

function getUpgradeCost(type) {
  const level = save.upgrades[type];
  return 5 + level * 6;
}

function getWallsForZone(zone) {
  const result = new Set();

  for (let x = 0; x < GRID_WIDTH; x += 1) {
    result.add(cellKey(x, 0));
    result.add(cellKey(x, GRID_HEIGHT - 1));
  }

  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    result.add(cellKey(0, y));
    result.add(cellKey(GRID_WIDTH - 1, y));
  }

  const pattern = (zone - 1) % 3;

  if (pattern === 0) {
    [2, 3, 5, 6].forEach((y) => result.add(cellKey(5, y)));
  } else if (pattern === 1) {
    [3, 4, 6, 7].forEach((x) => result.add(cellKey(x, 3)));
    [3, 4, 6, 7].forEach((x) => result.add(cellKey(x, 6)));
  } else {
    result.add(cellKey(3, 2));
    result.add(cellKey(3, 3));
    result.add(cellKey(3, 5));
    result.add(cellKey(7, 3));
    result.add(cellKey(7, 5));
    result.add(cellKey(7, 6));
  }

  result.delete(cellKey(PLAYER_START.x, PLAYER_START.y));
  result.delete(cellKey(EXIT_POSITION.x, EXIT_POSITION.y));
  return result;
}

function isInside(x, y) {
  return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
}

function enemyAt(x, y) {
  return enemies.find((enemy) => enemy.x === x && enemy.y === y) || null;
}

function isOccupied(x, y, ignoredEnemyId = null) {
  if (player.x === x && player.y === y) return true;
  return enemies.some((enemy) => enemy.id !== ignoredEnemyId && enemy.x === x && enemy.y === y);
}

function getOpenCells(minimumPlayerDistance = 0) {
  const cells = [];

  for (let y = 1; y < GRID_HEIGHT - 1; y += 1) {
    for (let x = 1; x < GRID_WIDTH - 1; x += 1) {
      const distance = Math.abs(x - player.x) + Math.abs(y - player.y);
      if (walls.has(cellKey(x, y))) continue;
      if (x === EXIT_POSITION.x && y === EXIT_POSITION.y) continue;
      if (isOccupied(x, y)) continue;
      if (distance < minimumPlayerDistance) continue;
      cells.push({ x, y });
    }
  }

  return cells;
}

function pickRandom(items) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function createNormalEnemy(position) {
  const maxTier = Math.min(3, 1 + Math.floor((save.zone - 1) / 2));
  const tier = 1 + Math.floor(Math.random() * maxTier);
  const maxHp = 3 + tier * 2 + (save.zone - 1) * 2;

  return {
    id: nextEnemyId++,
    x: position.x,
    y: position.y,
    tier,
    symbol: String(tier),
    hp: maxHp,
    maxHp,
    attack: 1 + Math.floor((save.zone - 1) / 2) + (tier - 1),
    crystals: Math.max(1, Math.floor((save.zone + tier) / 2)),
    boss: false,
    nextAttackAt: performance.now() + 650
  };
}

function createGuardian(position) {
  const maxHp = 12 + save.zone * 6;

  return {
    id: nextEnemyId++,
    x: position.x,
    y: position.y,
    tier: save.zone,
    symbol: "B",
    hp: maxHp,
    maxHp,
    attack: 2 + Math.floor(save.zone / 2),
    crystals: 7 + save.zone * 3,
    boss: true,
    nextAttackAt: performance.now() + 800
  };
}

function spawnNormalEnemy() {
  const position = pickRandom(getOpenCells(3)) || pickRandom(getOpenCells(1));
  if (!position) return;
  enemies.push(createNormalEnemy(position));
}

function spawnGuardian() {
  if (enemies.some((enemy) => enemy.boss)) return;

  const preferred = [
    { x: 8, y: 4 },
    { x: 8, y: 3 },
    { x: 8, y: 5 },
    { x: 7, y: 4 }
  ].find((position) => !walls.has(cellKey(position.x, position.y)) && !isOccupied(position.x, position.y));

  const position = preferred || pickRandom(getOpenCells(4));
  if (!position) return;

  enemies.push(createGuardian(position));
  setMessage("The zone guardian [B] has appeared. Defeat it to open the exit.");
}

function buildZone() {
  stopAllDirections();
  walls = getWallsForZone(save.zone);
  enemies = [];
  swordCell = null;
  player.x = PLAYER_START.x;
  player.y = PLAYER_START.y;
  player.hp = getMaxHp();
  player.facing = "right";
  playerDefeated = false;
  transitioningZone = false;
  nextPlayerMoveAt = 0;
  nextPlayerAttackAt = 0;

  const progress = getZoneProgress();
  const requirement = getGateRequirement();
  const enemyCount = progress.guardianDefeated ? 3 : 4;

  for (let i = 0; i < enemyCount; i += 1) {
    spawnNormalEnemy();
  }

  if (progress.kills >= requirement && !progress.guardianDefeated) {
    spawnGuardian();
  } else if (progress.guardianDefeated) {
    setMessage(`Zone ${save.zone} is cleared. Reach [>] to enter Zone ${save.zone + 1}.`);
  } else {
    setMessage(`Real-time mode. Defeat ${requirement - progress.kills} more monster${requirement - progress.kills === 1 ? "" : "s"} to summon the guardian.`);
  }

  saveGame(false);
  render();
}

function saveGame(showMessage = true) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    if (showMessage) setMessage("Game saved on this device.");
  } catch (error) {
    console.error("WhaleLand save failed.", error);
    if (showMessage) setMessage("The browser blocked the save.");
  }
  render();
}

function setMessage(text) {
  messageText = text;
}

function activeDirection() {
  const values = [...directionInputs.values()];
  return values.length ? values[values.length - 1] : null;
}

function pressDirection(token, directionName) {
  if (!directions[directionName] || playerDefeated || transitioningZone) return;
  directionInputs.delete(token);
  directionInputs.set(token, directionName);
  updatePressedButtons();

  const now = performance.now();
  movePlayerStep(directionName);
  nextPlayerMoveAt = now + PLAYER_MOVE_INTERVAL;
}

function releaseDirection(token) {
  directionInputs.delete(token);
  updatePressedButtons();
}

function stopAllDirections() {
  directionInputs.clear();
  updatePressedButtons();
}

function updatePressedButtons() {
  const held = new Set(directionInputs.values());
  for (const button of document.querySelectorAll(".move-button")) {
    button.classList.toggle("pressed", held.has(button.dataset.direction));
  }
}

function processHeldMovement() {
  if (document.hidden || playerDefeated || transitioningZone) return;
  const directionName = activeDirection();
  if (!directionName) return;

  const now = performance.now();
  if (now < nextPlayerMoveAt) return;

  movePlayerStep(directionName);
  nextPlayerMoveAt = now + PLAYER_MOVE_INTERVAL;
}

function movePlayerStep(directionName) {
  const direction = directions[directionName];
  if (!direction || playerDefeated || transitioningZone) return;

  player.facing = directionName;
  const targetX = player.x + direction.x;
  const targetY = player.y + direction.y;

  if (!isInside(targetX, targetY) || walls.has(cellKey(targetX, targetY))) {
    setMessage("A wall blocks the way.");
    render();
    return;
  }

  const blockingEnemy = enemyAt(targetX, targetY);
  if (blockingEnemy) {
    setMessage(`Enemy [${blockingEnemy.symbol}] blocks the way. Attack or move around it.`);
    render();
    return;
  }

  player.x = targetX;
  player.y = targetY;

  const progress = getZoneProgress();
  if (targetX === EXIT_POSITION.x && targetY === EXIT_POSITION.y && progress.guardianDefeated) {
    enterNextZone();
    return;
  }

  render();
}

function attack() {
  if (playerDefeated || transitioningZone) return;

  const now = performance.now();
  if (now < nextPlayerAttackAt) return;
  nextPlayerAttackAt = now + PLAYER_ATTACK_COOLDOWN;
  updateAttackButton();

  const direction = directions[player.facing];
  const targetX = player.x + direction.x;
  const targetY = player.y + direction.y;
  swordCell = { x: targetX, y: targetY };

  const target = enemyAt(targetX, targetY);
  if (!target) {
    setMessage("Your sword hits nothing.");
  } else {
    const damage = getAttack();
    target.hp -= damage;

    if (target.hp <= 0) {
      defeatEnemy(target);
    } else {
      setMessage(`You hit [${target.symbol}] for ${damage}. HP: ${target.hp}/${target.maxHp}.`);
    }
  }

  render();
  clearSwordSoon();
}

function updateAttackButton() {
  if (attackButtonTimer !== null) {
    window.clearTimeout(attackButtonTimer);
    attackButtonTimer = null;
  }

  const remaining = Math.max(0, nextPlayerAttackAt - performance.now());
  const coolingDown = remaining > 0;
  elements.attackButton.disabled = coolingDown || playerDefeated || transitioningZone;
  elements.attackButton.textContent = coolingDown ? "🗡️ ..." : "🗡️ Attack";

  if (coolingDown) {
    attackButtonTimer = window.setTimeout(updateAttackButton, remaining + 8);
  }
}

function clearSwordSoon() {
  window.setTimeout(() => {
    swordCell = null;
    render();
  }, 125);
}

function defeatEnemy(enemy) {
  enemies = enemies.filter((candidate) => candidate.id !== enemy.id);
  save.crystals += enemy.crystals;
  const progress = getZoneProgress();

  if (enemy.boss) {
    progress.guardianDefeated = true;
    setMessage(`Guardian defeated. +${enemy.crystals} crystals. The exit [>] is open.`);
  } else {
    progress.kills += 1;
    const requirement = getGateRequirement();

    if (progress.kills >= requirement && !progress.guardianDefeated) {
      setMessage(`Enemy defeated. +${enemy.crystals} crystals. The guardian is here.`);
      spawnGuardian();
    } else {
      const remaining = Math.max(0, requirement - progress.kills);
      setMessage(`Enemy defeated. +${enemy.crystals} crystals. ${remaining} until the guardian.`);
      spawnNormalEnemy();
    }
  }

  saveGame(false);
}

function enemyTick() {
  if (document.hidden || playerDefeated || transitioningZone) return;

  const now = performance.now();
  const shuffled = [...enemies].sort(() => Math.random() - 0.5);

  for (const enemy of shuffled) {
    if (playerDefeated) break;
    if (!enemies.includes(enemy)) continue;

    const distance = Math.abs(enemy.x - player.x) + Math.abs(enemy.y - player.y);
    if (distance === 1) {
      if (now >= enemy.nextAttackAt) {
        enemyAttack(enemy, now);
      }
      continue;
    }

    moveEnemyTowardPlayer(enemy);
  }

  render();
}

function enemyAttack(enemy, now) {
  enemy.nextAttackAt = now + ENEMY_ATTACK_COOLDOWN;
  const damage = Math.max(1, enemy.attack - getDefense());
  player.hp -= damage;
  setMessage(`[${enemy.symbol}] hits you for ${damage}.`);

  if (player.hp <= 0) {
    beginRespawn();
  }
}

function beginRespawn() {
  if (playerDefeated) return;
  playerDefeated = true;
  player.hp = 0;
  stopAllDirections();
  setMessage("You were defeated. Respawning—nothing permanent is lost.");
  updateAttackButton();
  render();
  window.setTimeout(buildZone, RESPAWN_DELAY);
}

function shuffledDirections() {
  return [...directionNames].sort(() => Math.random() - 0.5);
}

function findNextEnemyStep(enemy) {
  const queue = [{ x: enemy.x, y: enemy.y, first: null }];
  const visited = new Set([cellKey(enemy.x, enemy.y)]);

  while (queue.length) {
    const current = queue.shift();

    for (const directionName of shuffledDirections()) {
      const direction = directions[directionName];
      const nextX = current.x + direction.x;
      const nextY = current.y + direction.y;
      const key = cellKey(nextX, nextY);

      if (!isInside(nextX, nextY) || visited.has(key) || walls.has(key)) continue;

      const isPlayerCell = nextX === player.x && nextY === player.y;
      if (!isPlayerCell && isOccupied(nextX, nextY, enemy.id)) continue;

      const first = current.first || { x: nextX, y: nextY };
      if (isPlayerCell) return first;

      visited.add(key);
      queue.push({ x: nextX, y: nextY, first });
    }
  }

  return null;
}

function moveEnemyTowardPlayer(enemy) {
  const step = findNextEnemyStep(enemy);
  if (!step) return;
  if (step.x === player.x && step.y === player.y) return;
  if (isOccupied(step.x, step.y, enemy.id)) return;

  enemy.x = step.x;
  enemy.y = step.y;
}

function enterNextZone() {
  if (transitioningZone) return;
  transitioningZone = true;
  stopAllDirections();
  save.zone += 1;
  save.maxZone = Math.max(save.maxZone, save.zone);
  getZoneProgress();
  setMessage(`Zone ${save.zone} reached.`);
  saveGame(false);
  buildZone();
}

function buyUpgrade(type) {
  if (!Object.prototype.hasOwnProperty.call(save.upgrades, type)) return;

  const cost = getUpgradeCost(type);
  if (save.crystals < cost) {
    setMessage(`You need ${cost - save.crystals} more crystals for that upgrade.`);
    render();
    return;
  }

  save.crystals -= cost;
  save.upgrades[type] += 1;

  if (type === "health") {
    player.hp = Math.min(getMaxHp(), player.hp + 5);
  }

  setMessage(`${type[0].toUpperCase()}${type.slice(1)} permanently increased.`);
  saveGame(false);
  render();
}

function resetSave() {
  const confirmed = window.confirm("Delete all WhaleLand progress on this device?");
  if (!confirmed) return;

  localStorage.removeItem(SAVE_KEY);
  save = defaultSave();
  nextEnemyId = 1;
  setMessage("Save reset. Welcome back to Zone 1.");
  buildZone();
}

function render() {
  const progress = getZoneProgress();
  const requirement = getGateRequirement();
  const guardianAlive = enemies.some((enemy) => enemy.boss);

  elements.zoneLabel.textContent = `Zone ${save.zone} · LIVE · Highest ${save.maxZone}`;
  elements.hpStat.textContent = `${Math.max(0, player.hp)} / ${getMaxHp()}`;
  elements.attackStat.textContent = String(getAttack());
  elements.defenseStat.textContent = String(getDefense());
  elements.crystalStat.textContent = String(save.crystals);
  elements.message.textContent = messageText;

  if (progress.guardianDefeated) {
    elements.gateText.textContent = "Gate open";
    elements.goalText.textContent = "Reach [>]";
    elements.gateBar.style.width = "100%";
  } else if (progress.kills >= requirement) {
    elements.gateText.textContent = "Gate charged";
    elements.goalText.textContent = guardianAlive ? "Defeat [B]" : "Guardian incoming";
    elements.gateBar.style.width = "100%";
  } else {
    elements.gateText.textContent = `Gate charge: ${progress.kills} / ${requirement}`;
    elements.goalText.textContent = "Defeat monsters";
    elements.gateBar.style.width = `${Math.min(100, (progress.kills / requirement) * 100)}%`;
  }

  renderUpgrades();
  renderGrid(progress.guardianDefeated);
  updateAttackButton();
}

function renderUpgrades() {
  const types = ["attack", "health", "defense"];

  for (const type of types) {
    const level = save.upgrades[type];
    const cost = getUpgradeCost(type);
    const label = `Level ${level} · Cost ${cost}`;
    elements[`${type}UpgradeText`].textContent = label;
  }

  for (const button of elements.upgradeButtons) {
    const type = button.dataset.upgrade;
    button.disabled = save.crystals < getUpgradeCost(type);
  }
}

function renderGrid(exitOpen) {
  const fragment = document.createDocumentFragment();

  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.setAttribute("role", "gridcell");
      let label = "";

      if (walls.has(cellKey(x, y))) {
        tile.classList.add("wall");
        label = "#";
      }

      if (exitOpen && x === EXIT_POSITION.x && y === EXIT_POSITION.y) {
        tile.className = "tile exit";
        label = "[>]";
      }

      const enemy = enemyAt(x, y);
      if (enemy) {
        tile.className = enemy.boss ? "tile guardian" : "tile enemy";
        label = `[${enemy.symbol}]`;
        tile.title = `${enemy.boss ? "Guardian" : `Tier ${enemy.tier} monster`} HP ${enemy.hp}/${enemy.maxHp}`;
      }

      if (player.x === x && player.y === y) {
        tile.className = "tile player";
        label = "[A]";
      }

      if (swordCell && swordCell.x === x && swordCell.y === y) {
        tile.classList.add("sword");
      }

      tile.textContent = label;
      fragment.appendChild(tile);
    }
  }

  elements.grid.replaceChildren(fragment);
}

function keyDirection(key) {
  return {
    arrowup: "up",
    w: "up",
    arrowdown: "down",
    s: "down",
    arrowleft: "left",
    a: "left",
    arrowright: "right",
    d: "right"
  }[key] || null;
}

function handleKeydown(event) {
  const key = event.key.toLowerCase();
  const directionName = keyDirection(key);

  if (directionName) {
    event.preventDefault();
    const token = `key:${key}`;
    if (!directionInputs.has(token)) {
      pressDirection(token, directionName);
    }
    return;
  }

  if (key === " " || key === "enter") {
    event.preventDefault();
    attack();
  }
}

function handleKeyup(event) {
  const key = event.key.toLowerCase();
  if (!keyDirection(key)) return;
  event.preventDefault();
  releaseDirection(`key:${key}`);
}

for (const button of document.querySelectorAll(".move-button")) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    pressDirection(`pointer:${event.pointerId}`, button.dataset.direction);
  });

  const releasePointer = (event) => {
    releaseDirection(`pointer:${event.pointerId}`);
  };

  button.addEventListener("pointerup", releasePointer);
  button.addEventListener("pointercancel", releasePointer);
  button.addEventListener("lostpointercapture", releasePointer);
  button.addEventListener("contextmenu", (event) => event.preventDefault());
}

elements.attackButton.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  attack();
});
elements.saveButton.addEventListener("click", () => saveGame(true));
elements.resetButton.addEventListener("click", resetSave);

for (const button of elements.upgradeButtons) {
  button.addEventListener("click", () => buyUpgrade(button.dataset.upgrade));
}

document.addEventListener("keydown", handleKeydown);
document.addEventListener("keyup", handleKeyup);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopAllDirections();
    saveGame(false);
  }
});
window.addEventListener("blur", stopAllDirections);
window.addEventListener("pagehide", () => saveGame(false));

window.setInterval(processHeldMovement, 35);
window.setInterval(enemyTick, ENEMY_TICK_INTERVAL);

buildZone();
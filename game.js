import * as THREE from "https://unpkg.com/three@0.162.0/build/three.module.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020513);
scene.fog = new THREE.Fog(0x020513, 28, 92);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 250);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0x7fd6ff, 0.68);
scene.add(ambient);

const moon = new THREE.DirectionalLight(0x91c8ff, 1.1);
moon.position.set(14, 30, 10);
scene.add(moon);

const gridSize = 2;
const cellsPerChunk = 10;
const chunkWorldSize = gridSize * cellsPerChunk;
const activeChunkRadius = 2;
const cleanupChunkPadding = 1;

const worldChunks = new Map();
const pellets = [];
const ghosts = [];
const stars = [];

const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x06122a, metalness: 0.1, roughness: 0.95 });
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x113f63, emissive: 0x07192a, roughness: 0.85 });
const pelletMaterial = new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0x8f5f00 });
const powerPelletMaterial = new THREE.MeshStandardMaterial({ color: 0x9bfffd, emissive: 0x1f7e83, roughness: 0.45 });
const ghostMaterial = new THREE.MeshStandardMaterial({ color: 0xff4f7b, emissive: 0x3c1020 });
const frightenedGhostMaterial = new THREE.MeshStandardMaterial({ color: 0x7ec8ff, emissive: 0x0f3d5e });

const pacmanGroup = new THREE.Group();
scene.add(pacmanGroup);

const bodyGeo = new THREE.SphereGeometry(0.82, 24, 24);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.35, metalness: 0.1 });
const pacmanBody = new THREE.Mesh(bodyGeo, bodyMat);
pacmanGroup.add(pacmanBody);

const mouthMaskGeo = new THREE.BoxGeometry(2.1, 0.8, 1.4);
const mouthMaskMat = new THREE.MeshStandardMaterial({ color: 0x020513 });
const mouthMask = new THREE.Mesh(mouthMaskGeo, mouthMaskMat);
mouthMask.position.set(0.55, -0.2, 0);
pacmanGroup.add(mouthMask);

const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
const eyeMat = new THREE.MeshStandardMaterial({ color: 0x101010 });
const eye = new THREE.Mesh(eyeGeo, eyeMat);
eye.position.set(0.2, 0.35, -0.24);
pacmanGroup.add(eye);

const player = {
  position: new THREE.Vector3(0, 0.82, 0),
  direction: new THREE.Vector3(1, 0, 0),
  speed: 6,
  speedMultiplier: 1,
  lives: 3,
  score: 0,
  alive: true,
  invulnerableUntil: 0,
  powerUntil: 0,
};

const state = {
  ghostSpawnTarget: 5,
  combo: 0,
  timeAlive: 0,
};

const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
const clock = new THREE.Clock();

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const speedEl = document.getElementById("speed");
const comboEl = document.getElementById("combo");
const modeEl = document.getElementById("mode");
const gameOverEl = document.getElementById("game-over");
const finalScoreEl = document.getElementById("final-score");
const restartBtn = document.getElementById("restart-btn");

function hash(x, z, seed = 0) {
  const s = Math.sin((x * 127.1 + z * 311.7 + seed * 19.19) * 0.037);
  return s - Math.floor(s);
}

function safeMod(value, mod) {
  return ((value % mod) + mod) % mod;
}

function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

function worldToChunk(pos) {
  return {
    cx: Math.floor(pos.x / chunkWorldSize),
    cz: Math.floor(pos.z / chunkWorldSize),
  };
}

function blockedAt(x, z) {
  const gx = Math.floor(x / gridSize);
  const gz = Math.floor(z / gridSize);
  const noise = hash(gx, gz, 2);
  const openPath = safeMod(gx, 6) <= 1 || safeMod(gz, 6) <= 1;
  const safeSpawn = Math.hypot(x, z) < 7;
  return !safeSpawn && !openPath && noise > 0.73;
}

function makeFloor(cx, cz) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(chunkWorldSize, chunkWorldSize), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx * chunkWorldSize + chunkWorldSize / 2, 0, cz * chunkWorldSize + chunkWorldSize / 2);
  return floor;
}

function addStarField() {
  const starGeo = new THREE.SphereGeometry(0.1, 6, 6);
  const starMat = new THREE.MeshBasicMaterial({ color: 0xc2e6ff });
  for (let i = 0; i < 340; i++) {
    const star = new THREE.Mesh(starGeo, starMat);
    const spread = 180;
    star.position.set((Math.random() - 0.5) * spread, 25 + Math.random() * 35, (Math.random() - 0.5) * spread);
    star.scale.setScalar(0.5 + Math.random() * 1.2);
    stars.push(star);
    scene.add(star);
  }
}

function createChunk(cx, cz) {
  const group = new THREE.Group();
  group.userData = { cx, cz, walls: [], pellets: [] };

  const floor = makeFloor(cx, cz);
  group.add(floor);

  for (let x = 0; x < cellsPerChunk; x++) {
    for (let z = 0; z < cellsPerChunk; z++) {
      const worldX = cx * chunkWorldSize + x * gridSize + gridSize / 2;
      const worldZ = cz * chunkWorldSize + z * gridSize + gridSize / 2;

      if (blockedAt(worldX, worldZ)) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(gridSize * 0.95, 1.7, gridSize * 0.95), wallMaterial);
        wall.position.set(worldX, 0.85, worldZ);
        wall.userData.solid = true;
        group.userData.walls.push(wall);
        group.add(wall);
      } else {
        const chance = hash(worldX, worldZ, 9);
        if (chance > 0.6) {
          const isPowerPellet = hash(worldX, worldZ, 13) > 0.92;
          const pellet = new THREE.Mesh(new THREE.SphereGeometry(isPowerPellet ? 0.25 : 0.18, 10, 10), isPowerPellet ? powerPelletMaterial : pelletMaterial);
          pellet.position.set(worldX, 0.4, worldZ);
          pellet.userData.collected = false;
          pellet.userData.power = isPowerPellet;
          group.userData.pellets.push(pellet);
          pellets.push(pellet);
          scene.add(pellet);
        }
      }
    }
  }

  scene.add(group);
  worldChunks.set(chunkKey(cx, cz), group);
}

function removeChunk(key, chunk) {
  for (const pellet of chunk.userData.pellets) {
    scene.remove(pellet);
    const idx = pellets.indexOf(pellet);
    if (idx >= 0) pellets.splice(idx, 1);
  }
  scene.remove(chunk);
  worldChunks.delete(key);
}

function updateChunks() {
  const { cx, cz } = worldToChunk(player.position);

  for (let x = cx - activeChunkRadius; x <= cx + activeChunkRadius; x++) {
    for (let z = cz - activeChunkRadius; z <= cz + activeChunkRadius; z++) {
      const key = chunkKey(x, z);
      if (!worldChunks.has(key)) createChunk(x, z);
    }
  }

  for (const [key, chunk] of worldChunks.entries()) {
    const dx = Math.abs(chunk.userData.cx - cx);
    const dz = Math.abs(chunk.userData.cz - cz);
    if (dx > activeChunkRadius + cleanupChunkPadding || dz > activeChunkRadius + cleanupChunkPadding) {
      removeChunk(key, chunk);
    }
  }
}

function attemptMove(moveVec, dt) {
  if (moveVec.lengthSq() === 0) return;

  const nextPos = player.position.clone().addScaledVector(moveVec, player.speed * player.speedMultiplier * dt);

  if (!blockedAt(nextPos.x, player.position.z)) player.position.x = nextPos.x;
  if (!blockedAt(player.position.x, nextPos.z)) player.position.z = nextPos.z;
}

function inputDirection() {
  const dir = new THREE.Vector3();
  if (keys.w || keys.ArrowUp) dir.z -= 1;
  if (keys.s || keys.ArrowDown) dir.z += 1;
  if (keys.a || keys.ArrowLeft) dir.x -= 1;
  if (keys.d || keys.ArrowRight) dir.x += 1;
  return dir.normalize();
}

function isPowerMode() {
  return performance.now() < player.powerUntil;
}

function refreshGhostDifficulty() {
  const target = 5 + Math.min(8, Math.floor(player.score / 450));
  state.ghostSpawnTarget = target;
}

function spawnGhost() {
  const angle = Math.random() * Math.PI * 2;
  const radius = 8 + Math.random() * 9;
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 1.1), ghostMaterial.clone());
  ghost.position.set(player.position.x + Math.cos(angle) * radius, 0.7, player.position.z + Math.sin(angle) * radius);
  ghost.userData.velocity = new THREE.Vector3(Math.cos(angle + Math.PI), 0, Math.sin(angle + Math.PI)).multiplyScalar(3 + Math.random() * 2.6);
  ghost.userData.turnCooldown = 0;
  ghosts.push(ghost);
  scene.add(ghost);
}

function sendGhostHome(ghost) {
  const angle = Math.random() * Math.PI * 2;
  const radius = 10 + Math.random() * 12;
  ghost.position.set(player.position.x + Math.cos(angle) * radius, 0.7, player.position.z + Math.sin(angle) * radius);
  ghost.userData.velocity.set(Math.cos(angle + Math.PI), 0, Math.sin(angle + Math.PI)).multiplyScalar(2.7 + Math.random() * 1.8);
}

function updateGhosts(dt) {
  while (ghosts.length < state.ghostSpawnTarget) spawnGhost();

  const powered = isPowerMode();
  for (const ghost of ghosts) {
    ghost.material = powered ? frightenedGhostMaterial : ghostMaterial;

    ghost.userData.turnCooldown -= dt;
    if (ghost.userData.turnCooldown <= 0) {
      const playerAngle = Math.atan2(player.position.z - ghost.position.z, player.position.x - ghost.position.x);
      const base = powered ? playerAngle + Math.PI : playerAngle;
      const jitter = (Math.random() - 0.5) * 1.2;
      const angle = base + jitter;
      const speed = powered ? 2.4 : 3.4 + Math.min(3.2, player.score / 700);
      ghost.userData.velocity.set(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(speed);
      ghost.userData.turnCooldown = 0.7 + Math.random() * 1.5;
    }

    const step = ghost.userData.velocity.clone().multiplyScalar(dt);
    const tx = ghost.position.x + step.x;
    const tz = ghost.position.z + step.z;

    if (!blockedAt(tx, ghost.position.z)) ghost.position.x = tx;
    else ghost.userData.velocity.x *= -1;

    if (!blockedAt(ghost.position.x, tz)) ghost.position.z = tz;
    else ghost.userData.velocity.z *= -1;

    ghost.position.y = 0.7 + Math.sin(performance.now() * 0.005 + ghost.position.x) * 0.08;

    const distance = ghost.position.distanceTo(player.position);
    if (distance < 1.2 && player.alive) {
      if (powered) {
        state.combo += 1;
        const gain = 80 + state.combo * 30;
        player.score += gain;
        scoreEl.textContent = `${player.score}`;
        sendGhostHome(ghost);
      } else if (performance.now() >= player.invulnerableUntil) {
        player.lives -= 1;
        player.invulnerableUntil = performance.now() + 1600;
        livesEl.textContent = `${player.lives}`;
        player.position.set(0, 0.82, 0);
        state.combo = 0;
        if (player.lives <= 0) {
          player.alive = false;
          showGameOver();
        }
      }
    }
  }
}

function updatePellets(dt) {
  for (const pellet of pellets) {
    if (pellet.userData.collected) continue;
    pellet.rotation.y += dt * (pellet.userData.power ? 3 : 2.4);
    pellet.position.y = 0.38 + Math.sin(performance.now() * 0.004 + pellet.position.x * 0.2) * 0.06;

    if (pellet.position.distanceTo(player.position) < 0.9) {
      pellet.userData.collected = true;
      pellet.visible = false;

      if (pellet.userData.power) {
        player.score += 60;
        player.powerUntil = performance.now() + 8500;
        state.combo = 0;
      } else {
        player.score += 10;
      }

      player.speedMultiplier = Math.min(2.8, 1 + player.score / 1400);
      scoreEl.textContent = `${player.score}`;
      speedEl.textContent = `${player.speedMultiplier.toFixed(2)}x`;
      modeEl.textContent = isPowerMode() ? "POWER" : "NORMAL";
      refreshGhostDifficulty();
    }
  }
}

function updatePacmanVisual() {
  pacmanGroup.position.copy(player.position);

  const movement = inputDirection();
  if (movement.lengthSq() > 0.001) {
    player.direction.lerp(movement, 0.2).normalize();
  }

  pacmanGroup.rotation.y = Math.atan2(player.direction.x, player.direction.z);
  const mouthSpeed = isPowerMode() ? 0.027 : 0.018;
  const mouthAnim = Math.abs(Math.sin(performance.now() * mouthSpeed)) * 0.45;
  mouthMask.rotation.z = mouthAnim;

  const t = performance.now() * 0.007;
  pacmanBody.position.y = Math.sin(t) * 0.07;

  if (performance.now() < player.invulnerableUntil) {
    pacmanBody.material.emissive = new THREE.Color(0x5533ff);
  } else if (isPowerMode()) {
    pacmanBody.material.emissive = new THREE.Color(0x2b6f4f);
  } else {
    pacmanBody.material.emissive = new THREE.Color(0x000000);
  }
}

function updateStars() {
  const px = player.position.x;
  const pz = player.position.z;
  for (const star of stars) {
    if (Math.abs(star.position.x - px) > 95) star.position.x = px + (Math.random() - 0.5) * 180;
    if (Math.abs(star.position.z - pz) > 95) star.position.z = pz + (Math.random() - 0.5) * 180;
  }
}

function updateHud() {
  comboEl.textContent = `${state.combo}`;
  modeEl.textContent = isPowerMode() ? "POWER" : "NORMAL";
}

function updateCamera(dt) {
  const cameraOffset = isPowerMode() ? new THREE.Vector3(-11, 14, 13) : new THREE.Vector3(-9, 12, 11);
  const desired = player.position.clone().add(cameraOffset);
  camera.position.lerp(desired, 1 - Math.exp(-dt * 5));
  camera.lookAt(player.position.x, player.position.y + 0.8, player.position.z);
}

function showGameOver() {
  finalScoreEl.textContent = `Pontuação final: ${player.score}`;
  gameOverEl.style.display = "flex";
}

function resetGame() {
  player.position.set(0, 0.82, 0);
  player.direction.set(1, 0, 0);
  player.speedMultiplier = 1;
  player.lives = 3;
  player.score = 0;
  player.alive = true;
  player.invulnerableUntil = 0;
  player.powerUntil = 0;

  state.combo = 0;
  state.timeAlive = 0;
  state.ghostSpawnTarget = 5;

  scoreEl.textContent = "0";
  livesEl.textContent = "3";
  speedEl.textContent = "1.00x";
  comboEl.textContent = "0";
  modeEl.textContent = "NORMAL";
  gameOverEl.style.display = "none";

  for (const ghost of ghosts) scene.remove(ghost);
  ghosts.length = 0;

  for (const [key, chunk] of worldChunks.entries()) removeChunk(key, chunk);
  worldChunks.clear();

  updateChunks();
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (player.alive) {
    state.timeAlive += dt;
    const move = inputDirection();
    attemptMove(move, dt);
    updateChunks();
    updateGhosts(dt);
    updatePellets(dt);
    updatePacmanVisual(dt);
    updateStars();
    updateHud();

    if (Math.floor(state.timeAlive) % 18 === 0) {
      refreshGhostDifficulty();
    }
  }

  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener("keydown", (e) => {
  if (e.key in keys) keys[e.key] = true;
  if (e.key.toLowerCase() === "r") resetGame();
});

window.addEventListener("keyup", (e) => {
  if (e.key in keys) keys[e.key] = false;
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

restartBtn.addEventListener("click", resetGame);

addStarField();
updateChunks();
animate();

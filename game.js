import * as THREE from "https://unpkg.com/three@0.162.0/build/three.module.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020513);
scene.fog = new THREE.Fog(0x020513, 28, 84);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0x7fd6ff, 0.65);
scene.add(ambient);

const moon = new THREE.DirectionalLight(0x91c8ff, 1.1);
moon.position.set(14, 30, 10);
scene.add(moon);

const gridSize = 2;
const cellsPerChunk = 10;
const chunkWorldSize = gridSize * cellsPerChunk;
const activeChunkRadius = 2;

const worldChunks = new Map();
const pellets = [];
const ghosts = [];

const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x06122a, metalness: 0.1, roughness: 0.95 });
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x113f63, emissive: 0x07192a, roughness: 0.85 });
const pelletMaterial = new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0x8f5f00 });
const ghostMaterial = new THREE.MeshStandardMaterial({ color: 0xff4f7b, emissive: 0x3c1020 });

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
};

const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
const clock = new THREE.Clock();

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const speedEl = document.getElementById("speed");
const gameOverEl = document.getElementById("game-over");
const finalScoreEl = document.getElementById("final-score");
const restartBtn = document.getElementById("restart-btn");

function hash(x, z, seed = 0) {
  const s = Math.sin((x * 127.1 + z * 311.7 + seed * 19.19) * 0.037);
  return s - Math.floor(s);
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
  const openPath = Math.abs((gx % 6)) <= 1 || Math.abs((gz % 6)) <= 1;
  const safeSpawn = Math.hypot(x, z) < 7;
  return !safeSpawn && !openPath && noise > 0.73;
}

function makeFloor(cx, cz) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(chunkWorldSize, chunkWorldSize), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx * chunkWorldSize + chunkWorldSize / 2, 0, cz * chunkWorldSize + chunkWorldSize / 2);
  return floor;
}

function createChunk(cx, cz) {
  const group = new THREE.Group();
  group.userData = { cx, cz, walls: [] };

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
      } else if (hash(worldX, worldZ, 9) > 0.63) {
        const pellet = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), pelletMaterial);
        pellet.position.set(worldX, 0.4, worldZ);
        pellet.userData.collected = false;
        pellets.push(pellet);
        scene.add(pellet);
      }
    }
  }

  scene.add(group);
  worldChunks.set(chunkKey(cx, cz), group);
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
    if (dx > activeChunkRadius + 1 || dz > activeChunkRadius + 1) {
      scene.remove(chunk);
      worldChunks.delete(key);
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

function spawnGhost() {
  const angle = Math.random() * Math.PI * 2;
  const radius = 8 + Math.random() * 9;
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 1.1), ghostMaterial);
  ghost.position.set(player.position.x + Math.cos(angle) * radius, 0.7, player.position.z + Math.sin(angle) * radius);
  ghost.userData.velocity = new THREE.Vector3(Math.cos(angle + Math.PI), 0, Math.sin(angle + Math.PI)).multiplyScalar(3 + Math.random() * 2.6);
  ghost.userData.turnCooldown = 0;
  ghosts.push(ghost);
  scene.add(ghost);
}

function updateGhosts(dt) {
  while (ghosts.length < 5) spawnGhost();

  for (const ghost of ghosts) {
    ghost.userData.turnCooldown -= dt;
    if (ghost.userData.turnCooldown <= 0) {
      const jitter = (Math.random() - 0.5) * 0.9;
      ghost.userData.velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), jitter);
      ghost.userData.turnCooldown = 1.2 + Math.random() * 2;
    }

    const step = ghost.userData.velocity.clone().multiplyScalar(dt);
    const tx = ghost.position.x + step.x;
    const tz = ghost.position.z + step.z;

    if (!blockedAt(tx, ghost.position.z)) ghost.position.x = tx;
    else ghost.userData.velocity.x *= -1;

    if (!blockedAt(ghost.position.x, tz)) ghost.position.z = tz;
    else ghost.userData.velocity.z *= -1;

    ghost.position.y = 0.7 + Math.sin(performance.now() * 0.005 + ghost.position.x) * 0.08;

    if (ghost.position.distanceTo(player.position) < 1.2 && player.alive) {
      player.lives -= 1;
      livesEl.textContent = `${player.lives}`;
      player.position.set(0, 0.82, 0);
      if (player.lives <= 0) {
        player.alive = false;
        showGameOver();
      }
    }
  }
}

function updatePellets(dt) {
  for (const pellet of pellets) {
    if (pellet.userData.collected) continue;
    pellet.rotation.y += dt * 2.4;
    pellet.position.y = 0.38 + Math.sin(performance.now() * 0.004 + pellet.position.x * 0.2) * 0.06;

    if (pellet.position.distanceTo(player.position) < 0.9) {
      pellet.userData.collected = true;
      pellet.visible = false;
      player.score += 10;
      player.speedMultiplier = Math.min(2.6, 1 + player.score / 1500);
      scoreEl.textContent = `${player.score}`;
      speedEl.textContent = `${player.speedMultiplier.toFixed(2)}x`;
    }
  }
}

function updatePacmanVisual(dt) {
  pacmanGroup.position.copy(player.position);

  const movement = inputDirection();
  if (movement.lengthSq() > 0.001) {
    player.direction.lerp(movement, 0.2).normalize();
  }

  pacmanGroup.rotation.y = Math.atan2(player.direction.x, player.direction.z);
  const mouthAnim = Math.abs(Math.sin(performance.now() * 0.018)) * 0.45;
  mouthMask.rotation.z = mouthAnim;

  const t = performance.now() * 0.007;
  pacmanBody.position.y = Math.sin(t) * 0.07;
}

function updateCamera(dt) {
  const desired = player.position.clone().add(new THREE.Vector3(-9, 12, 11));
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

  scoreEl.textContent = "0";
  livesEl.textContent = "3";
  speedEl.textContent = "1.00x";
  gameOverEl.style.display = "none";

  for (const p of pellets) scene.remove(p);
  pellets.length = 0;

  for (const ghost of ghosts) scene.remove(ghost);
  ghosts.length = 0;

  for (const chunk of worldChunks.values()) scene.remove(chunk);
  worldChunks.clear();

  updateChunks();
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (player.alive) {
    const move = inputDirection();
    attemptMove(move, dt);
    updateChunks();
    updateGhosts(dt);
    updatePellets(dt);
    updatePacmanVisual(dt);
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

updateChunks();
animate();

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// =====================================================================
// Налаштування й дані зі сторінки
// =====================================================================
const el = document.getElementById('viewport');
const L = +el.dataset.length, W = +el.dataset.width, H = +el.dataset.height, T = 3;
const GRID = 10;        // крок сітки для меблів, см
const MIN_SIZE = 10;    // мінімальний розмір блока, см
const WALL_MARGIN = 2, OPEN_GAP = 2;
const furnitureTypes = JSON.parse(document.getElementById('furniture-data').textContent);

// Завантажувач GLB підключаємо необов'язково: якщо файлів завантажувача немає, працюють кубики
let gltfLoader = null;
try {
  const mod = await import('three/addons/loaders/GLTFLoader.js');
  gltfLoader = new mod.GLTFLoader();
} catch (err) {
  console.warn('GLTFLoader недоступний, використовуються кубики:', err);
}

const snap = v => Math.round(v / GRID) * GRID;
const snap5 = v => Math.round(v / 5) * 5;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tmp = new THREE.Vector3();

// Стан редактора
const items = [];       // меблі
const openings = [];    // вікна й двері
let selected = null;    // виділені меблі
let selectedOp = null;  // виділене вікно/двері

// =====================================================================
// Сцена, камера, світло
// =====================================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8e8e8);

const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 1, 5000);
camera.position.set(L * 0.9, H * 1.6, W * 2.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(el.clientWidth, el.clientHeight);
renderer.domElement.style.touchAction = 'none';
el.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, H / 2, 0);
controls.minDistance = 20;
controls.maxPolarAngle = Math.PI * 0.499;
controls.update();

scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(300, 600, 200);
scene.add(sun);

// =====================================================================
// Підлога і сітка
// =====================================================================
const floor = new THREE.Mesh(
  new THREE.BoxGeometry(L, T, W),
  new THREE.MeshStandardMaterial({ color: 0xb08d57 })
);
floor.position.y = -T / 2;
scene.add(floor);

const grid = new THREE.GridHelper(Math.max(L, W), Math.max(L, W) / GRID, 0x666666, 0x999999);
grid.scale.set(L / Math.max(L, W), 1, W / Math.max(L, W));
grid.position.y = 0.2;
scene.add(grid);

// =====================================================================
// Стіни (з отворами)
// =====================================================================
const walls = [];        // усі стіни для прозорості (4 бокові + дах)
const wallMeshes = [];   // 4 бокові стіни, які можуть мати отвори

// Локальна вісь X стіни йде вздовж неї; pos отвору — зсув від центру стіни.
// 0 — ближній бік (z+), 1 — дальній бік (z-), 2 — правий торець (x+), 3 — лівий торець (x-)
const wallDefs = [
  { len: L, pos: V(0, 0,  W / 2 + T / 2), rotY: 0,            normal: V(0, 0,  1) },
  { len: L, pos: V(0, 0, -W / 2 - T / 2), rotY: 0,            normal: V(0, 0, -1) },
  { len: W, pos: V( L / 2 + T / 2, 0, 0), rotY: -Math.PI / 2, normal: V( 1, 0, 0) },
  { len: W, pos: V(-L / 2 - T / 2, 0, 0), rotY: -Math.PI / 2, normal: V(-1, 0, 0) },
];

function buildWallGeometry(len, ops) {
  const shape = new THREE.Shape();
  shape.moveTo(-len / 2, 0);
  shape.lineTo( len / 2, 0);
  shape.lineTo( len / 2, H);
  shape.lineTo(-len / 2, H);
  shape.closePath();
  for (const o of ops) {
    const hole = new THREE.Path();
    hole.moveTo(o.pos - o.width / 2, o.elev);
    hole.lineTo(o.pos + o.width / 2, o.elev);
    hole.lineTo(o.pos + o.width / 2, o.elev + o.height);
    hole.lineTo(o.pos - o.width / 2, o.elev + o.height);
    hole.closePath();
    shape.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
  g.translate(0, 0, -T / 2);
  return g;
}

wallDefs.forEach(d => {
  const mesh = new THREE.Mesh(
    buildWallGeometry(d.len, []),
    new THREE.MeshStandardMaterial({ color: 0xd0d0d0, transparent: true, opacity: 1 })
  );
  mesh.position.copy(d.pos);
  mesh.rotation.y = d.rotY;
  mesh.userData.normal = d.normal;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: 0x555555 })
  );
  mesh.add(edges);
  mesh.userData.edges = edges;
  scene.add(mesh);
  walls.push(mesh);
  wallMeshes.push(mesh);
});

// Дах
{
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(L, T, W),
    new THREE.MeshStandardMaterial({ color: 0xd0d0d0, transparent: true, opacity: 1 })
  );
  roof.position.set(0, H + T / 2, 0);
  roof.userData.normal = V(0, 1, 0);
  roof.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(roof.geometry),
    new THREE.LineBasicMaterial({ color: 0x555555 })
  ));
  scene.add(roof);
  walls.push(roof);
}

function rebuildWall(i) {
  const wall = wallMeshes[i];
  wall.geometry.dispose();
  wall.geometry = buildWallGeometry(wallDefs[i].len, openings.filter(o => o.wall === i));
  const edges = wall.userData.edges;
  edges.geometry.dispose();
  edges.geometry = new THREE.EdgesGeometry(wall.geometry);
}

// Прозорість стін: стіна прозора, коли камера з її зовнішнього боку
function updateWalls() {
  for (const wall of walls) {
    tmp.copy(camera.position).sub(wall.position);
    const outside = tmp.dot(wall.userData.normal) > 0;
    const m = wall.material;
    m.opacity += ((outside ? 0.06 : 1) - m.opacity) * 0.15;
    m.depthWrite = m.opacity > 0.9;
  }
}

// Вікна й двері підлаштовуються під прозорість своєї стіни
function updateOpenings() {
  for (const op of openings) {
    const wallOpacity = wallMeshes[op.wall].material.opacity;
    const base = op.kind === 'door' ? 1 : 0.35;
    const m = op.mesh.material;
    m.opacity = Math.max(0.05, base * wallOpacity);
    m.depthWrite = op.kind === 'door' && m.opacity > 0.9;
    op.mesh.children[0].material.opacity = Math.max(0.15, wallOpacity);
  }
}

// =====================================================================
// Колісні арки
// =====================================================================
const ARCH = {
  length: +el.dataset.archLength || 0,
  width:  +el.dataset.archWidth || 0,
  height: +el.dataset.archHeight || 0,
  offset: +el.dataset.archOffset || 0,
};
const arches = [];   // { x0, x1, z0, z1, top }

if (ARCH.length && ARCH.width && ARCH.height) {
  const x0 = ARCH.offset - ARCH.length / 2;
  const x1 = ARCH.offset + ARCH.length / 2;
  for (const side of [1, -1]) {
    const z0 = side > 0 ? W / 2 - ARCH.width : -W / 2;
    const z1 = side > 0 ? W / 2 : -W / 2 + ARCH.width;
    arches.push({ x0, x1, z0, z1, top: ARCH.height });

    const m = new THREE.Mesh(
      new THREE.BoxGeometry(ARCH.length, ARCH.height, ARCH.width),
      new THREE.MeshStandardMaterial({ color: 0x555555 })
    );
    m.position.set((x0 + x1) / 2, ARCH.height / 2, (z0 + z1) / 2);
    m.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(m.geometry),
      new THREE.LineBasicMaterial({ color: 0x222222 })
    ));
    scene.add(m);
  }
}

// Половини розмірів з урахуванням повороту (90/270 міняє довжину і ширину)
function halfExtents(item) {
  const swap = Math.abs(item.rot % 180) === 90;
  const l = swap ? item.size.width : item.size.length;
  const w = swap ? item.size.length : item.size.width;
  return { hx: l / 2, hz: w / 2 };
}

// Висота арки під блоком у точці (x, z): найвища арка, яку блок перекриває
function supportHeight(item, x, z) {
  const { hx, hz } = halfExtents(item);
  let s = 0;
  for (const a of arches) {
    if (x - hx < a.x1 - 0.01 && x + hx > a.x0 + 0.01 &&
        z - hz < a.z1 - 0.01 && z + hz > a.z0 + 0.01) s = Math.max(s, a.top);
  }
  return s;
}

// Фактична висота низу блока.
// ignore — стоїть там, де вибрано (арка всередині блока);
// rise — піднімається на арку, якщо перекриває її.
function effElev(item, x, z, base = item.base) {
  return item.arch === 'ignore' ? base : Math.max(base, supportHeight(item, x, z));
}

// =====================================================================
// Меблі: допоміжні функції
// =====================================================================
function clamp(item, x, z) {
  const { hx, hz } = halfExtents(item);
  return {
    x: Math.min(L / 2 - hx, Math.max(-L / 2 + hx, x)),
    z: Math.min(W / 2 - hz, Math.max(-W / 2 + hz, z)),
  };
}

function collides(item, x, z, elev = item.elev) {
  const a = halfExtents(item);
  const aMin = elev, aMax = elev + item.size.height;
  for (const other of items) {
    if (other === item) continue;
    const b = halfExtents(other);
    const bMin = other.elev, bMax = other.elev + other.size.height;
    const ox = Math.abs(x - other.mesh.position.x) < a.hx + b.hx - 0.01;
    const oz = Math.abs(z - other.mesh.position.z) < a.hz + b.hz - 0.01;
    const oy = aMin < bMax - 0.01 && aMax > bMin + 0.01;
    if (ox && oz && oy) return true;
  }
  return false;
}

function applyRotation(item) {
  item.mesh.rotation.y = THREE.MathUtils.degToRad(item.rot);
}

// =====================================================================
// Панель розмірів меблів
// =====================================================================
const panel = document.getElementById('size-panel');
const inputs = {
  length: document.getElementById('sz-length'),
  width:  document.getElementById('sz-width'),
  height: document.getElementById('sz-height'),
};
const archSel = document.getElementById('sz-arch');

function updatePanel() {
  if (!selected) { panel.style.display = 'none'; return; }
  panel.style.display = 'flex';
  document.getElementById('size-name').textContent = selected.type.name;
  for (const k in inputs) inputs[k].value = selected.size[k];
  archSel.value = selected.arch;
}

function setSelected(item) {
  if (selected) {
    selected.mesh.material.emissive.setHex(0x000000);
    if (selected.model) selected.outline.visible = false;
  }
  selected = item;
  if (selected) {
    selected.mesh.material.emissive.setHex(0x333333);
    if (selected.model) selected.outline.visible = true;
    if (selectedOp) setSelectedOp(null);
  }
  updatePanel();
}

// =====================================================================
// Меблі: додавання, видалення, поворот, висота, розміри
// =====================================================================
// ---------- Моделі GLB ----------
const modelCache = new Map();   // url -> Promise з одиничною моделлю (або null)

// Завантажує GLB і нормалізує його до одиничного куба 1x1x1 з центром у (0,0,0),
// щоб потім масштабувати так само, як і кубик (довжина, висота, ширина).
function loadModel(url) {
  if (!url || !gltfLoader) return Promise.resolve(null);
  if (!modelCache.has(url)) {
    modelCache.set(url, new Promise(resolve => {
      gltfLoader.load(url, gltf => {
        const root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        root.position.sub(center);
        const wrap = new THREE.Group();
        wrap.add(root);
        wrap.scale.set(1 / (size.x || 1), 1 / (size.y || 1), 1 / (size.z || 1));
        const holder = new THREE.Group();
        holder.add(wrap);
        resolve(holder);
      }, undefined, err => {
        console.warn('Не вдалося завантажити модель', url, err);
        resolve(null);
      });
    }));
  }
  return modelCache.get(url);
}

// Кубик лишається невидимою оболонкою для вибору мишею, а видимою стає модель
function attachModel(item, model) {
  item.model = model;
  item.mesh.add(model);
  const m = item.mesh.material;
  m.transparent = true;
  m.opacity = 0;
  m.depthWrite = false;
  item.outline.visible = (item === selected);   // контур лише для виділеного
}

function addItem(type, rot = 0, x = null, z = null, base = 0, size = null, arch = null) {
  size = size ? { ...size } : { length: type.length, width: type.width, height: type.height };

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: type.color })
  );
  mesh.scale.set(size.length, size.height, size.width);
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: 0x333333 })
  );
  mesh.add(outline);

  const item = { type, mesh, outline, model: null, rot, base, elev: base, size, arch: arch || type.arch_mode || 'rise' };
  mesh.userData.item = item;
  applyRotation(item);

  if (x !== null) {
    // завантаження збереженого блока
    item.elev = effElev(item, x, z);
    mesh.position.set(x, item.elev + size.height / 2, z);
  } else {
    // новий блок: шукаємо вільне місце, починаючи від центру
    let placed = false;
    for (let gx = 0; gx <= L && !placed; gx += GRID) {
      for (let gz = 0; gz <= W && !placed; gz += GRID) {
        for (const sx of [1, -1]) {
          for (const sz of [1, -1]) {
            const c = clamp(item, snap(sx * gx / 2), snap(sz * gz / 2));
            const elv = effElev(item, c.x, c.z);
            if (elv + size.height <= H && !collides(item, c.x, c.z, elv)) {
              item.elev = elv;
              mesh.position.set(c.x, elv + size.height / 2, c.z);
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
      }
    }
    if (!placed) { alert('Немає вільного місця для цього блока'); return; }
  }

  scene.add(mesh);
  items.push(item);
  setSelected(item);

  if (type.model_url) {
    loadModel(type.model_url).then(model => {
      if (model && items.includes(item)) attachModel(item, model.clone(true));
    });
  }
}

function removeItem(item) {
  scene.remove(item.mesh);
  item.mesh.geometry.dispose();
  items.splice(items.indexOf(item), 1);
  if (selected === item) setSelected(null);
}

function rotateSelected(delta) {
  if (!selected) return;
  const oldRot = selected.rot;
  selected.rot = (selected.rot + delta + 360) % 360;
  const p = selected.mesh.position;
  const c = clamp(selected, p.x, p.z);
  const elv = effElev(selected, c.x, c.z);
  if (elv + selected.size.height > H || collides(selected, c.x, c.z, elv)) {
    selected.rot = oldRot;
    return;
  }
  selected.elev = elv;
  p.set(c.x, elv + selected.size.height / 2, c.z);
  applyRotation(selected);
  pushHistory();
}

function moveElevation(delta) {
  if (!selected) return;
  const p = selected.mesh.position;
  const base = Math.min(H - selected.size.height, Math.max(0, selected.base + delta));
  const elv = effElev(selected, p.x, p.z, base);
  if (elv + selected.size.height > H || collides(selected, p.x, p.z, elv)) return;
  selected.base = base;
  selected.elev = elv;
  p.y = elv + selected.size.height / 2;
  pushHistory();
}

function resizeSelected(newSize) {
  if (!selected) return;
  const { length, width, height } = newSize;
  const ok = [length, width, height].every(v => Number.isFinite(v) && v >= MIN_SIZE);
  if (!ok || length > L || width > W || height > H) { updatePanel(); return; }

  const oldSize = selected.size, oldBase = selected.base;
  selected.size = { length, width, height };
  selected.base = Math.min(selected.base, H - height);
  const p = selected.mesh.position;
  const c = clamp(selected, p.x, p.z);
  const elv = effElev(selected, c.x, c.z);

  if (elv + height > H || collides(selected, c.x, c.z, elv)) {
    selected.size = oldSize;
    selected.base = oldBase;
    updatePanel();
    return;
  }
  selected.elev = elv;
  p.set(c.x, elv + height / 2, c.z);
  selected.mesh.scale.set(length, height, width);
  pushHistory();
}

for (const k in inputs) {
  inputs[k].addEventListener('change', () => resizeSelected({
    length: +inputs.length.value,
    width:  +inputs.width.value,
    height: +inputs.height.value,
  }));
}

document.getElementById('sz-reset').onclick = () => {
  if (selected) resizeSelected({
    length: selected.type.length, width: selected.type.width, height: selected.type.height,
  });
  updatePanel();
};

// Зміна режиму арки для виділеного блока
archSel.addEventListener('change', () => {
  if (!selected) return;
  const old = selected.arch;
  selected.arch = archSel.value;
  const p = selected.mesh.position;
  const elv = effElev(selected, p.x, p.z);
  if (elv + selected.size.height > H || collides(selected, p.x, p.z, elv)) {
    selected.arch = old;
    updatePanel();
    return;
  }
  selected.elev = elv;
  p.y = elv + selected.size.height / 2;
  pushHistory();
});

// =====================================================================
// Вікна й двері
// =====================================================================
const OPEN_DEFAULTS = {
  window: { width: 80, height: 50, elev: 100 },
  door:   { width: 70, height: 180, elev: WALL_MARGIN },
};

function openingOk(op, skip) {
  const vals = [op.pos, op.elev, op.width, op.height];
  if (!vals.every(Number.isFinite) || ![0, 1, 2, 3].includes(op.wall)) return false;
  if (op.width < MIN_SIZE || op.height < MIN_SIZE) return false;
  const len = wallDefs[op.wall].len;
  if (op.pos - op.width / 2 < -len / 2 + WALL_MARGIN) return false;
  if (op.pos + op.width / 2 >  len / 2 - WALL_MARGIN) return false;
  if (op.elev < WALL_MARGIN || op.elev + op.height > H - WALL_MARGIN) return false;
  for (const o of openings) {
    if (o === skip || o.wall !== op.wall) continue;
    const overlapX = op.pos - op.width / 2 < o.pos + o.width / 2 + OPEN_GAP &&
                     op.pos + op.width / 2 > o.pos - o.width / 2 - OPEN_GAP;
    const overlapY = op.elev < o.elev + o.height + OPEN_GAP &&
                     op.elev + op.height > o.elev - OPEN_GAP;
    if (overlapX && overlapY) return false;
  }
  return true;
}

function clampOpening(op, pos, elev) {
  const len = wallDefs[op.wall].len;
  const maxPos = len / 2 - WALL_MARGIN - op.width / 2;
  return {
    pos: Math.min(maxPos, Math.max(-maxPos, pos)),
    elev: Math.min(H - WALL_MARGIN - op.height, Math.max(WALL_MARGIN, elev)),
  };
}

function makeOpeningMesh(op) {
  const door = op.kind === 'door';
  const mat = new THREE.MeshStandardMaterial(door
    ? { color: 0x8b6b3e, transparent: true, opacity: 1 }
    : { color: 0x9ad0ff, transparent: true, opacity: 0.35, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  mesh.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: 0x222222, transparent: true })
  ));
  mesh.userData.opening = op;
  return mesh;
}

function placeOpening(op) {
  const d = wallDefs[op.wall];
  const y = op.elev + op.height / 2;
  if (op.wall < 2) op.mesh.position.set(op.pos, y, d.pos.z);
  else             op.mesh.position.set(d.pos.x, y, op.pos);
  op.mesh.rotation.y = d.rotY;
  op.mesh.scale.set(op.width, op.height, op.kind === 'door' ? 2 : 1);
}

function createOpening(data) {
  const op = { ...data };
  op.mesh = makeOpeningMesh(op);
  scene.add(op.mesh);
  openings.push(op);
  placeOpening(op);
  rebuildWall(op.wall);
  return op;
}

function addOpening(kind) {
  const d = OPEN_DEFAULTS[kind];
  const choice = document.getElementById('add-wall').value;
  const wallsToTry = choice === 'auto' ? [0, 1, 2, 3] : [+choice];

  for (const w of wallsToTry) {
    for (let off = 0; off <= wallDefs[w].len / 2; off += 10) {
      for (const sign of [1, -1]) {
        const cand = { kind, wall: w, pos: sign * off, elev: d.elev, width: d.width, height: d.height };
        if (openingOk(cand, null)) {
          setSelectedOp(createOpening(cand));
          pushHistory();
          return;
        }
      }
    }
  }
  alert(choice === 'auto'
    ? 'Немає вільного місця для цього отвору'
    : 'На цій стіні немає вільного місця для цього отвору');
}

function removeOpening(op) {
  if (selectedOp === op) setSelectedOp(null);
  scene.remove(op.mesh);
  op.mesh.geometry.dispose();
  openings.splice(openings.indexOf(op), 1);
  rebuildWall(op.wall);
}

// Панель вікна/дверей
const opPanel = document.getElementById('op-panel');
const opIn = {
  wall:   document.getElementById('op-wall'),
  width:  document.getElementById('op-width'),
  height: document.getElementById('op-height'),
  elev:   document.getElementById('op-elev'),
  pos:    document.getElementById('op-pos'),
};

function updateOpPanel() {
  if (!selectedOp) { opPanel.style.display = 'none'; return; }
  opPanel.style.display = 'flex';
  document.getElementById('op-name').textContent = selectedOp.kind === 'door' ? 'Двері' : 'Вікно';
  for (const k in opIn) opIn[k].value = selectedOp[k];
}

function setSelectedOp(op) {
  if (selectedOp) selectedOp.mesh.material.emissive.setHex(0x000000);
  if (op && selected) setSelected(null);
  selectedOp = op;
  if (op) op.mesh.material.emissive.setHex(0x444444);
  updateOpPanel();
}

function applyOpPanel() {
  if (!selectedOp) return;
  const cand = {
    ...selectedOp,
    wall: +opIn.wall.value, width: +opIn.width.value, height: +opIn.height.value,
    elev: +opIn.elev.value, pos: +opIn.pos.value,
  };
  if (!openingOk(cand, selectedOp)) { updateOpPanel(); return; }
  const oldWall = selectedOp.wall;
  Object.assign(selectedOp, {
    wall: cand.wall, width: cand.width, height: cand.height, elev: cand.elev, pos: cand.pos,
  });
  placeOpening(selectedOp);
  rebuildWall(oldWall);
  if (cand.wall !== oldWall) rebuildWall(cand.wall);
  pushHistory();
}
for (const k in opIn) opIn[k].addEventListener('change', applyOpPanel);

// =====================================================================
// Кнопки
// =====================================================================
const btnBox = document.getElementById('furniture-buttons');

// Вибір категорії + кнопки меблів лише з обраної категорії
const categoryNames = [...new Set(furnitureTypes.map(t => t.category))];
const catSel = document.createElement('select');
catSel.title = 'Категорія меблів';
const optAll = document.createElement('option');
optAll.value = '';
optAll.textContent = 'Усі категорії';
catSel.appendChild(optAll);
for (const name of categoryNames) {
  const o = document.createElement('option');
  o.value = name;
  o.textContent = name;
  catSel.appendChild(o);
}
const furnBtns = document.createElement('span');
furnBtns.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap;';
btnBox.appendChild(catSel);
btnBox.appendChild(furnBtns);

function renderFurnitureButtons() {
  furnBtns.textContent = '';
  for (const t of furnitureTypes) {
    if (catSel.value && t.category !== catSel.value) continue;
    const b = document.createElement('button');
    b.textContent = (t.model_url ? '▣ ' : '+ ') + t.name;
    b.title = t.category;
    b.onclick = () => { addItem(t); pushHistory(); };
    furnBtns.appendChild(b);
  }
}
catSel.addEventListener('change', renderFurnitureButtons);
renderFurnitureButtons();

document.getElementById('rot-left').onclick = () => rotateSelected(90);
document.getElementById('rot-right').onclick = () => rotateSelected(-90);
document.getElementById('up').onclick = () => moveElevation(GRID);
document.getElementById('down').onclick = () => moveElevation(-GRID);
document.getElementById('add-window').onclick = () => addOpening('window');
document.getElementById('add-door').onclick = () => addOpening('door');

function deleteSelected() {
  if (selected) removeItem(selected);
  else if (selectedOp) removeOpening(selectedOp);
  else return;
  pushHistory();
}
document.getElementById('delete').onclick = deleteSelected;

// =====================================================================
// Перетягування мишею
// =====================================================================
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const wallPlane = new THREE.Plane();
const hitPoint = new THREE.Vector3();
const dragOffset = new THREE.Vector3();
let dragging = null;     // меблі, які тягнемо
let draggingOp = null;   // вікно/двері, які тягнемо
let opGrab = { dp: 0, de: 0 };

function setPointer(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

renderer.domElement.addEventListener('pointerdown', ev => {
  setPointer(ev);
  const targets = [...items.map(i => i.mesh), ...openings.map(o => o.mesh)];
  const hits = raycaster.intersectObjects(targets, false);
  if (!hits.length) { setSelected(null); setSelectedOp(null); return; }

  const obj = hits[0].object;
  if (obj.userData.opening) {
    // вікно або двері
    const op = obj.userData.opening;
    setSelectedOp(op);
    draggingOp = op;
    const p = hits[0].point;
    opGrab = { dp: op.pos - (op.wall < 2 ? p.x : p.z), de: op.elev - p.y };
  } else {
    // меблі
    const item = obj.userData.item;
    setSelected(item);
    dragging = item;
    floorPlane.constant = -item.mesh.position.y;
    raycaster.ray.intersectPlane(floorPlane, hitPoint);
    dragOffset.set(item.mesh.position.x - hitPoint.x, 0, item.mesh.position.z - hitPoint.z);
  }
  controls.enabled = false;
  renderer.domElement.setPointerCapture(ev.pointerId);
});

function dragOpening(ev) {
  setPointer(ev);
  const d = wallDefs[draggingOp.wall];
  wallPlane.setFromNormalAndCoplanarPoint(d.normal, d.pos);
  if (!raycaster.ray.intersectPlane(wallPlane, hitPoint)) return;
  const raw = (draggingOp.wall < 2 ? hitPoint.x : hitPoint.z) + opGrab.dp;
  const c = clampOpening(draggingOp, snap5(raw), snap5(hitPoint.y + opGrab.de));
  if (c.pos === draggingOp.pos && c.elev === draggingOp.elev) return;
  const cand = { ...draggingOp, pos: c.pos, elev: c.elev };
  if (!openingOk(cand, draggingOp)) return;
  draggingOp.pos = c.pos;
  draggingOp.elev = c.elev;
  placeOpening(draggingOp);
  rebuildWall(draggingOp.wall);
  updateOpPanel();
}

renderer.domElement.addEventListener('pointermove', ev => {
  if (draggingOp) { dragOpening(ev); return; }
  if (!dragging) return;
  setPointer(ev);
  if (!raycaster.ray.intersectPlane(floorPlane, hitPoint)) return;
  const c = clamp(dragging, snap(hitPoint.x + dragOffset.x), snap(hitPoint.z + dragOffset.z));
  const elv = effElev(dragging, c.x, c.z);
  if (elv + dragging.size.height <= H && !collides(dragging, c.x, c.z, elv)) {
    dragging.elev = elv;
    dragging.mesh.position.set(c.x, elv + dragging.size.height / 2, c.z);
  }
});

function endDrag() {
  const moved = dragging || draggingOp;
  dragging = null;
  draggingOp = null;
  controls.enabled = true;
  if (moved) pushHistory();   // якщо нічого не змінилось, запис не додається
}
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);

// =====================================================================
// Клавіші
// =====================================================================
window.addEventListener('keydown', ev => {
  // Ctrl+S працює завжди
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
    ev.preventDefault();
    saveLayout();
    return;
  }
  // Не реагуємо на клавіші, коли друкуємо в полі
  if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT') return;

  const mod = ev.ctrlKey || ev.metaKey;
  const key = ev.key.toLowerCase();

  if (mod && key === 'z') {                    // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z
    ev.preventDefault();
    if (ev.shiftKey) redo(); else undo();
    return;
  }
  if (mod && key === 'y') { ev.preventDefault(); redo(); return; }
  if (mod && key === 'd') { ev.preventDefault(); duplicateSelected(); return; }
  if (mod) return;                             // інші комбінації з Ctrl/Cmd не чіпаємо

  if (ev.key === 'r' || ev.key === 'R') rotateSelected(90);
  if (ev.key === 'PageUp') moveElevation(GRID);
  if (ev.key === 'PageDown') moveElevation(-GRID);
  if (ev.key === 'Delete' || ev.key === 'Backspace') deleteSelected();
});

// =====================================================================
// Збереження й завантаження
// =====================================================================
window.getLayout = () => [
  ...items.map(i => ({
    kind: 'furniture',
    type: i.type.id,
    x: i.mesh.position.x,
    z: i.mesh.position.z,
    elevation: i.elev,
    base_elevation: i.base,
    rotation: i.rot,
    size: i.size,
    arch: i.arch,
  })),
  ...openings.map(o => ({
    kind: o.kind, wall: o.wall, pos: o.pos,
    elevation: o.elev, width: o.width, height: o.height,
  })),
];

const statusEl = document.getElementById('status');

async function saveLayout() {
  statusEl.textContent = 'Зберігаю…';
  try {
    const r = await fetch(el.dataset.saveUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': el.dataset.csrf },
      body: JSON.stringify(window.getLayout()),
    });
    const data = await r.json();
    statusEl.textContent = data.ok ? '✓ Збережено' : '⚠ ' + data.error;
  } catch (err) {
    statusEl.textContent = '⚠ Помилка зв’язку';
  }
}
document.getElementById('save').onclick = saveLayout;

// Завантаження збереженої розстановки (виконується після того, як усе вище створено)
const layoutEl = document.getElementById('layout-data');
const savedLayout = layoutEl ? JSON.parse(layoutEl.textContent) : [];

// Будує сцену зі списку збережених блоків (використовується при відкритті й при скасуванні)
function loadLayout(list) {
  for (const s of list) {
    if (s.kind === 'window' || s.kind === 'door') {
      createOpening({
        kind: s.kind, wall: s.wall, pos: s.pos,
        elev: s.elevation, width: s.width, height: s.height,
      });
      continue;
    }
    const type = furnitureTypes.find(t => t.id === s.type);
    if (type) {
      addItem(type, s.rotation, s.x, s.z, s.base_elevation ?? s.elevation ?? 0, s.size || null, s.arch || null);
    }
  }
  setSelected(null);
  setSelectedOp(null);
}
loadLayout(savedLayout);

// =====================================================================
// Скасування / повтор (Undo / Redo)
// =====================================================================
const states = [];          // знімки розстановки (JSON-рядки)
let stateIndex = -1;
const HISTORY_LIMIT = 100;
const undoBtn = document.getElementById('undo');
const redoBtn = document.getElementById('redo');

function updateHistoryButtons() {
  if (undoBtn) undoBtn.disabled = stateIndex <= 0;
  if (redoBtn) redoBtn.disabled = stateIndex >= states.length - 1;
}

function pushHistory() {
  const snap = JSON.stringify(window.getLayout());
  if (stateIndex >= 0 && states[stateIndex] === snap) return;   // змін немає
  states.length = stateIndex + 1;                               // відкидаємо «майбутнє»
  states.push(snap);
  if (states.length > HISTORY_LIMIT) states.shift();
  stateIndex = states.length - 1;
  updateHistoryButtons();
}

function restoreState(snap) {
  [...items].forEach(removeItem);
  [...openings].forEach(removeOpening);
  loadLayout(JSON.parse(snap));
}

function undo() {
  if (stateIndex <= 0) return;
  stateIndex--;
  restoreState(states[stateIndex]);
  updateHistoryButtons();
}

function redo() {
  if (stateIndex >= states.length - 1) return;
  stateIndex++;
  restoreState(states[stateIndex]);
  updateHistoryButtons();
}

if (undoBtn) undoBtn.onclick = undo;
if (redoBtn) redoBtn.onclick = redo;
pushHistory();   // початковий стан

// =====================================================================
// Копіювання (Ctrl/Cmd+D)
// =====================================================================
function duplicateItem(src) {
  const probe = { type: src.type, rot: src.rot, base: src.base, elev: src.base,
                  size: { ...src.size }, arch: src.arch };
  const p = src.mesh.position;
  const maxR = Math.ceil(Math.max(L, W) / GRID);
  for (let r = 1; r <= maxR; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const c = clamp(probe, snap(p.x + dx * GRID), snap(p.z + dz * GRID));
        const elv = effElev(probe, c.x, c.z);
        if (elv + probe.size.height <= H && !collides(probe, c.x, c.z, elv)) {
          addItem(src.type, src.rot, c.x, c.z, src.base, probe.size, src.arch);
          return true;
        }
      }
    }
  }
  return false;
}

function duplicateOpening(src) {
  const len = wallDefs[src.wall].len;
  for (let off = 5; off <= len; off += 5) {
    for (const sign of [1, -1]) {
      const cand = { kind: src.kind, wall: src.wall, pos: src.pos + sign * off,
                     elev: src.elev, width: src.width, height: src.height };
      if (openingOk(cand, null)) { setSelectedOp(createOpening(cand)); return true; }
    }
  }
  return false;
}

function duplicateSelected() {
  let ok = false;
  if (selected) ok = duplicateItem(selected);
  else if (selectedOp) ok = duplicateOpening(selectedOp);
  else return;
  if (!ok) { alert('Немає вільного місця для копії'); return; }
  pushHistory();
}
const copyBtn = document.getElementById('copy');
if (copyBtn) copyBtn.onclick = duplicateSelected;

// =====================================================================
// Цикл відмальовування
// =====================================================================
window.addEventListener('resize', () => {
  camera.aspect = el.clientWidth / el.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(el.clientWidth, el.clientHeight);
});

(function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateWalls();
  updateOpenings();
  renderer.render(scene, camera);
})();
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const el = document.getElementById('viewport');
const L = +el.dataset.length, W = +el.dataset.width, H = +el.dataset.height, T = 3;
const GRID = 10; // см
const furnitureTypes = JSON.parse(document.getElementById('furniture-data').textContent);

// ---------- Сцена ----------
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

// ---------- Підлога і сітка ----------
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

// ---------- Стіни ----------
const walls = [];        // усі стіни для прозорості (4 бокові + дах)
const wallMeshes = [];   // 4 бокові, з отворами
const openings = [];
let selectedOp = null;
const tmp = new THREE.Vector3();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Локальна вісь X стіни йде вздовж неї; pos отвору — зсув від центру стіни
const wallDefs = [
  { len: L, pos: V(0, 0,  W / 2 + T / 2), rotY: 0,             normal: V(0, 0,  1) },
  { len: L, pos: V(0, 0, -W / 2 - T / 2), rotY: 0,             normal: V(0, 0, -1) },
  { len: W, pos: V( L / 2 + T / 2, 0, 0), rotY: -Math.PI / 2,  normal: V( 1, 0, 0) },
  { len: W, pos: V(-L / 2 - T / 2, 0, 0), rotY: -Math.PI / 2,  normal: V(-1, 0, 0) },
];
const WALL_NAMES = ['Ближній бік', 'Дальній бік', 'Правий торець', 'Лівий торець'];

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
  g.translate(0, 0, -T / 2);   // товщина центрована відносно площини стіни
  return g;
}

wallDefs.forEach((d, i) => {
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

// Дах (звичайна коробка)
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


function updateWalls() {
  for (const wall of walls) {
    tmp.copy(camera.position).sub(wall.position);
    const outside = tmp.dot(wall.userData.normal) > 0;
    const m = wall.material;
    m.opacity += ((outside ? 0.06 : 1) - m.opacity) * 0.15;
    m.depthWrite = m.opacity > 0.9;
  }
}



// ---------- Вікна й двері ----------
const WALL_MARGIN = 2, OPEN_GAP = 2;
const snap5 = v => Math.round(v / 5) * 5;
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
    ? { color: 0x8b6b3e }
    : { color: 0x9ad0ff, transparent: true, opacity: 0.35, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
  mesh.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: 0x222222 })
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

function setSelectedOp(op) {
  if (selectedOp) selectedOp.mesh.material.emissive.setHex(0x000000);
  if (op && selected) setSelected(null);
  selectedOp = op;
  if (op) op.mesh.material.emissive.setHex(0x444444);
  updateOpPanel();
}

// Панель отвору
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

function applyOpPanel() {
  if (!selectedOp) return;
  const cand = {
    ...selectedOp,
    wall: +opIn.wall.value, width: +opIn.width.value, height: +opIn.height.value,
    elev: +opIn.elev.value, pos: +opIn.pos.value,
  };
  if (!openingOk(cand, selectedOp)) { updateOpPanel(); return; }   // не вміщується: повертаємо старі значення
  const oldWall = selectedOp.wall;
  Object.assign(selectedOp, {
    wall: cand.wall, width: cand.width, height: cand.height, elev: cand.elev, pos: cand.pos,
  });
  placeOpening(selectedOp);
  rebuildWall(oldWall);
  if (cand.wall !== oldWall) rebuildWall(cand.wall);
}
for (const k in opIn) opIn[k].addEventListener('change', applyOpPanel);

document.getElementById('add-window').onclick = () => addOpening('window');
document.getElementById('add-door').onclick = () => addOpening('door');


const MIN_SIZE = 10;

// ---------- Меблі ----------
// item = { type, mesh, rot (градуси) }
const items = [];
let selected = null;

// Половини розмірів з урахуванням повороту (90/270 міняє довжину і ширину)
function halfExtents(item) {
    const swap = Math.abs(item.rot % 180) === 90;
    const l = swap ? item.size.width : item.size.length;
    const w = swap ? item.size.length : item.size.width;
    return { hx: l / 2, hz: w / 2 };
  }

function clamp(item, x, z) {
  const { hx, hz } = halfExtents(item);
  return {
    x: Math.min(L / 2 - hx, Math.max(-L / 2 + hx, x)),
    z: Math.min(W / 2 - hz, Math.max(-W / 2 + hz, z)),
  };
}

const snap = v => Math.round(v / GRID) * GRID;

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

  function moveElevation(delta) {
    if (!selected) return;
    const e = Math.min(H - selected.size.height, Math.max(0, selected.elev + delta));
    const p = selected.mesh.position;
    if (collides(selected, p.x, p.z, e)) return;     // там зайнято
    selected.elev = e;
    p.y = e + selected.size.height / 2;
  }

function applyRotation(item) {
  item.mesh.rotation.y = THREE.MathUtils.degToRad(item.rot);
}

const panel = document.getElementById('size-panel');
const inputs = {
    length: document.getElementById('sz-length'),
    width:  document.getElementById('sz-width'),
    height: document.getElementById('sz-height'),
  };

function setSelected(item) {
  if (selected) selected.mesh.material.emissive.setHex(0x000000);
  selected = item;
  if (selected) selected.mesh.material.emissive.setHex(0x333333);

  updatePanel();
}

function addItem(type, rot = 0, x = null, z = null, elev = 0, size = null) {
    size = size ? { ...size } : { length: type.length, width: type.width, height: type.height };
  
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),                 // одиничний куб
      new THREE.MeshStandardMaterial({ color: type.color })
    );
    mesh.scale.set(size.length, size.height, size.width);
    mesh.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x333333 })
    ));
  
    const item = { type, mesh, rot, elev, size };
    mesh.userData.item = item;
    applyRotation(item);
    mesh.position.y = elev + size.height / 2;

  if (x !== null) {
    mesh.position.x = x;
    mesh.position.z = z;
  } else {
    // шукаємо вільне місце, починаючи від центру
    let placed = false;
    for (let gx = 0; gx <= L && !placed; gx += GRID) {
      for (let gz = 0; gz <= W && !placed; gz += GRID) {
        for (const sx of [1, -1]) {
          for (const sz of [1, -1]) {
            const c = clamp(item, snap(sx * gx / 2), snap(sz * gz / 2));
            if (!collides(item, c.x, c.z)) {
              mesh.position.x = c.x;
              mesh.position.z = c.z;
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
}

function removeItem(item) {
  scene.remove(item.mesh);
  items.splice(items.indexOf(item), 1);
  if (selected === item) selected = null;
}

function rotateSelected(delta) {
  if (!selected) return;
  const oldRot = selected.rot;
  selected.rot = (selected.rot + delta + 360) % 360;
  const c = clamp(selected, selected.mesh.position.x, selected.mesh.position.z);
  if (collides(selected, c.x, c.z)) {
    selected.rot = oldRot;       // не вміщується після повороту
    return;
  }
  selected.mesh.position.x = c.x;
  selected.mesh.position.z = c.z;
  applyRotation(selected);
}

// ---------- Кнопки ----------
const btnBox = document.getElementById('furniture-buttons');
for (const t of furnitureTypes) {
  const b = document.createElement('button');
  b.textContent = `+ ${t.name}`;
  b.onclick = () => addItem(t);
  btnBox.appendChild(b);
}
document.getElementById('rot-left').onclick = () => rotateSelected(90);
document.getElementById('rot-right').onclick = () => rotateSelected(-90);





function updatePanel() {
  if (!selected) { panel.style.display = 'none'; return; }
  panel.style.display = 'flex';
  document.getElementById('size-name').textContent = selected.type.name;
  for (const k in inputs) inputs[k].value = selected.size[k];
}

function resizeSelected(newSize) {
  if (!selected) return;
  const { length, width, height } = newSize;
  const ok = [length, width, height].every(v => Number.isFinite(v) && v >= MIN_SIZE);
  if (!ok || length > L || width > W || height > H) { updatePanel(); return; }

  const old = selected.size;
  selected.size = { length, width, height };
  const elev = Math.min(selected.elev, H - height);
  const p = selected.mesh.position;
  const c = clamp(selected, p.x, p.z);

  if (collides(selected, c.x, c.z, elev)) {      // не вміщується
    selected.size = old;
    updatePanel();
    return;
  }
  selected.elev = elev;
  p.set(c.x, elev + height / 2, c.z);
  selected.mesh.scale.set(length, height, width);
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

// ---------- Перетягування ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const wallPlane = new THREE.Plane();
const hitPoint = new THREE.Vector3();
let dragging = null;
let draggingOp = null;
let opGrab = { dp: 0, de: 0 };
const dragOffset = new THREE.Vector3();

function setPointer(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

renderer.domElement.addEventListener('pointerdown', e => {
  setPointer(e);
  const targets = [...items.map(i => i.mesh), ...openings.map(o => o.mesh)];
  const hits = raycaster.intersectObjects(targets, false);
  if (!hits.length) { setSelected(null); setSelectedOp(null); return; }

  const obj = hits[0].object;
  if (obj.userData.opening) {                       // вікно або двері
    const op = obj.userData.opening;
    setSelectedOp(op);
    draggingOp = op;
    const p = hits[0].point;
    opGrab = { dp: op.pos - (op.wall < 2 ? p.x : p.z), de: op.elev - p.y };
  } else {                                          // меблі
    const item = obj.userData.item;
    setSelected(item);
    dragging = item;
    floorPlane.constant = -item.mesh.position.y;
    raycaster.ray.intersectPlane(floorPlane, hitPoint);
    dragOffset.set(item.mesh.position.x - hitPoint.x, 0, item.mesh.position.z - hitPoint.z);
  }
  controls.enabled = false;
  renderer.domElement.setPointerCapture(e.pointerId);
});

function dragOpening(e) {
  setPointer(e);
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

renderer.domElement.addEventListener('pointermove', e => {
  if (draggingOp) { dragOpening(e); return; }
  if (!dragging) return;
  setPointer(e);
  if (!raycaster.ray.intersectPlane(floorPlane, hitPoint)) return;
  const c = clamp(dragging, snap(hitPoint.x + dragOffset.x), snap(hitPoint.z + dragOffset.z));
  if (!collides(dragging, c.x, c.z)) {
    dragging.mesh.position.x = c.x;
    dragging.mesh.position.z = c.z;
  }
});

function endDrag() {
  dragging = null;
  draggingOp = null;
  controls.enabled = true;
}
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);

// ---------- Клавіші й видалення ----------
function deleteSelected() {
  if (selected) removeItem(selected);
  else if (selectedOp) removeOpening(selectedOp);
}
document.getElementById('delete').onclick = deleteSelected;

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'r' || e.key === 'R') rotateSelected(90);
  if (e.key === 'PageUp') moveElevation(GRID);
  if (e.key === 'PageDown') moveElevation(-GRID);
  if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveLayout();
  }
});

// ---------- Для збереження ----------
window.getLayout = () => [
  ...items.map(i => ({
    kind: 'furniture',
    type: i.type.id,
    x: i.mesh.position.x,
    z: i.mesh.position.z,
    elevation: i.elev,
    rotation: i.rot,
    size: i.size,
  })),
  ...openings.map(o => ({
    kind: o.kind, wall: o.wall, pos: o.pos,
    elevation: o.elev, width: o.width, height: o.height,
  })),
];

// ---------- Завантаження ----------
const savedLayout = JSON.parse(document.getElementById('layout-data').textContent);
for (const s of savedLayout) {
    if (s.kind === 'window' || s.kind === 'door') {
      createOpening({ kind: s.kind, wall: s.wall, pos: s.pos, elev: s.elevation, width: s.width, height: s.height });
      continue;
    }
    const type = furnitureTypes.find(t => t.id === s.type);
    if (type) addItem(type, s.rotation, s.x, s.z, s.elevation || 0, s.size || null);
  }
  setSelected(null);
  setSelectedOp(null);

// ---------- Збереження ----------
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


// ---------- Цикл ----------
window.addEventListener('resize', () => {
  camera.aspect = el.clientWidth / el.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(el.clientWidth, el.clientHeight);
});

(function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateWalls();
  renderer.render(scene, camera);
})();
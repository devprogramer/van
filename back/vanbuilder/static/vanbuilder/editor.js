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
const walls = [];
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function addWall(w, h, d, pos, normal) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: 0xd0d0d0, transparent: true, opacity: 1 })
  );
  mesh.position.copy(pos);
  mesh.userData.normal = normal;
  mesh.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: 0x555555 })
  ));
  scene.add(mesh);
  walls.push(mesh);
}
addWall(L, H, T, V(0, H / 2,  W / 2 + T / 2), V(0, 0,  1));
addWall(L, H, T, V(0, H / 2, -W / 2 - T / 2), V(0, 0, -1));
addWall(T, H, W, V( L / 2 + T / 2, H / 2, 0), V( 1, 0, 0));
addWall(T, H, W, V(-L / 2 - T / 2, H / 2, 0), V(-1, 0, 0));
addWall(L, T, W, V(0, H + T / 2, 0),          V(0, 1, 0));

const tmp = new THREE.Vector3();
function updateWalls() {
  for (const wall of walls) {
    tmp.copy(camera.position).sub(wall.position);
    const outside = tmp.dot(wall.userData.normal) > 0;
    const m = wall.material;
    m.opacity += ((outside ? 0.06 : 1) - m.opacity) * 0.15;
    m.depthWrite = m.opacity > 0.9;
  }
}
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
document.getElementById('delete').onclick = () => { if (selected) removeItem(selected); };





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
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // y = 0
const hitPoint = new THREE.Vector3();
let dragging = null;
let dragOffset = new THREE.Vector3();

function setPointer(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

renderer.domElement.addEventListener('pointerdown', e => {
  setPointer(e);
  const hits = raycaster.intersectObjects(items.map(i => i.mesh), false);
  if (!hits.length) { setSelected(null); return; }
  const item = hits[0].object.userData.item;
  setSelected(item);
  dragging = item;
  controls.enabled = false;
  floorPlane.constant = -item.mesh.position.y;
  raycaster.ray.intersectPlane(floorPlane, hitPoint);
  dragOffset.set(item.mesh.position.x - hitPoint.x, 0, item.mesh.position.z - hitPoint.z);
  renderer.domElement.setPointerCapture(e.pointerId);
});

renderer.domElement.addEventListener('pointermove', e => {
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
  controls.enabled = true;
}
renderer.domElement.addEventListener('pointerup', endDrag);
renderer.domElement.addEventListener('pointercancel', endDrag);

document.getElementById('up').onclick = () => moveElevation(GRID);
document.getElementById('down').onclick = () => moveElevation(-GRID);

// Клавіші: R — повернути, Delete — видалити
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'r' || e.key === 'R') rotateSelected(90);
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected) removeItem(selected);

  if (e.key === 'PageUp') moveElevation(GRID);
  if (e.key === 'PageDown') moveElevation(-GRID);

});

// Для майбутнього збереження в Django
window.getLayout = () => items.map(i => ({
    type: i.type.id,
    x: i.mesh.position.x,
    z: i.mesh.position.z,
    elevation: i.elev,
    rotation: i.rot,
    size: i.size,
  }));

// ---------- Завантаження ----------
const savedLayout = JSON.parse(document.getElementById('layout-data').textContent);
for (const s of savedLayout) {
  const type = furnitureTypes.find(t => t.id === s.type);
  if (type) addItem(type, s.rotation, s.x, s.z, s.elevation || 0, s.size || null);
}
setSelected(null);

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
window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveLayout();
  }
});

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
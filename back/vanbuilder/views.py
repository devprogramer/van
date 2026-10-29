import json
import math

from django.conf import settings
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404, redirect
from django.views.decorators.http import require_POST

from .forms import ProjectForm, RegisterForm
from .models import Project, FurnitureType, VanModel, Texture

# ---------------------------------------------------------------------
# Константи (мають збігатися з editor.js)
# ---------------------------------------------------------------------
EPS = 0.01          # допуск при порівнянні розмірів, см
MIN_SIZE = 10       # мінімальний розмір блока чи отвору, см
WALL_MARGIN = 2     # відступ отвору від краю стіни, см
OPEN_GAP = 2        # мінімальний зазор між отворами, см
ARCH_MODES = ("rise", "ignore")


# ---------------------------------------------------------------------
# Колісні арки
# ---------------------------------------------------------------------
def arch_boxes(van):
    """Повертає арки як кортежі (x0, x1, z0, z1, верх). Дві арки: по одній з кожного боку."""
    if not (van.arch_length and van.arch_width and van.arch_height):
        return []
    x0 = van.arch_offset - van.arch_length / 2
    x1 = van.arch_offset + van.arch_length / 2
    return [
        (x0, x1, van.width / 2 - van.arch_width, van.width / 2, van.arch_height),
        (x0, x1, -van.width / 2, -van.width / 2 + van.arch_width, van.arch_height),
    ]


# ---------------------------------------------------------------------
# Перевірка вікон і дверей
# ---------------------------------------------------------------------
def validate_opening(van, entry):
    try:
        kind = entry["kind"]
        wall = int(entry["wall"])
        pos = float(entry["pos"])
        elev = float(entry["elevation"])
        width = float(entry["width"])
        height = float(entry["height"])
    except (KeyError, ValueError, TypeError):
        raise ValueError("Невірні дані вікна чи дверей")

    if wall not in (0, 1, 2, 3):
        raise ValueError("Невірна стіна")
    if not all(map(math.isfinite, (pos, elev, width, height))):
        raise ValueError("Некоректні розміри отвору")
    if min(width, height) < MIN_SIZE:
        raise ValueError(f"Мінімальний розмір отвору {MIN_SIZE} см")

    length = van.length if wall in (0, 1) else van.width
    if pos - width / 2 < -length / 2 + WALL_MARGIN - EPS or \
       pos + width / 2 > length / 2 - WALL_MARGIN + EPS:
        raise ValueError("Отвір виходить за межі стіни")
    if elev < WALL_MARGIN - EPS or elev + height > van.height - WALL_MARGIN + EPS:
        raise ValueError("Отвір виходить за межі стіни по висоті")

    return {"kind": kind, "wall": wall, "pos": pos,
            "elevation": elev, "width": width, "height": height}


def check_openings(openings):
    """Вікна й двері на одній стіні не повинні перекриватися."""
    for i, a in enumerate(openings):
        for b in openings[i + 1:]:
            if a["wall"] != b["wall"]:
                continue
            ox = a["pos"] - a["width"] / 2 < b["pos"] + b["width"] / 2 + OPEN_GAP - EPS and \
                 a["pos"] + a["width"] / 2 > b["pos"] - b["width"] / 2 - OPEN_GAP + EPS
            oy = a["elevation"] < b["elevation"] + b["height"] + OPEN_GAP - EPS and \
                 a["elevation"] + a["height"] > b["elevation"] - OPEN_GAP + EPS
            if ox and oy:
                raise ValueError("Вікна й двері перекриваються")


# ---------------------------------------------------------------------
# Перевірка всієї розстановки
# ---------------------------------------------------------------------
def validate_layout(project, raw):
    """Перевіряє розстановку. Кидає ValueError з поясненням."""
    if not isinstance(raw, list) or len(raw) > 200:
        raise ValueError("Невірний формат розстановки")

    types = {t.id: t for t in FurnitureType.objects.all()}
    van = project.van
    arches = arch_boxes(van)
    texture_ids = set(Texture.objects.values_list("id", flat=True))
    clean, boxes, openings = [], [], []

    for entry in raw:
        if not isinstance(entry, dict):
            raise ValueError("Невірний формат блока")

        # Вікна й двері обробляємо окремо
        if entry.get("kind") in ("window", "door"):
            openings.append(validate_opening(van, entry))
            continue

        # --- основні дані блока ---
        try:
            t = types[int(entry["type"])]
            x = float(entry["x"])
            z = float(entry["z"])
            elev = float(entry.get("elevation", 0))
            rot = int(entry["rotation"])
        except (KeyError, ValueError, TypeError):
            raise ValueError("Невірні дані блока")

        if not all(map(math.isfinite, (x, z, elev))):
            raise ValueError("Некоректні координати")
        if rot not in (0, 90, 180, 270):
            raise ValueError("Поворот має бути 0, 90, 180 або 270")

        # --- режим арки: rise (піднімається) або ignore (стоїть на підлозі) ---
        arch_mode = entry.get("arch") or t.arch_mode
        if arch_mode not in ARCH_MODES:
            raise ValueError("Невірний режим арки")

        # --- текстура (необов'язкова; якщо її видалили з бази, просто прибираємо) ---
        texture_id = entry.get("texture")
        try:
            texture_id = int(texture_id) if texture_id is not None else None
        except (ValueError, TypeError):
            raise ValueError("Невірна текстура")
        if texture_id not in texture_ids:
            texture_id = None

        # --- розміри блока ---
        raw_size = entry.get("size") or {}
        try:
            length = float(raw_size.get("length", t.length))
            width = float(raw_size.get("width", t.width))
            height = float(raw_size.get("height", t.height))
        except (ValueError, TypeError, AttributeError):
            raise ValueError("Невірні розміри блока")

        if not all(map(math.isfinite, (length, width, height))):
            raise ValueError("Некоректні розміри")
        if min(length, width, height) < MIN_SIZE:
            raise ValueError(f"«{t.name}»: мінімальний розмір {MIN_SIZE} см")
        if length > van.length or width > van.width or height > van.height:
            raise ValueError(f"«{t.name}» більший за кузов")

        # Розміри з урахуванням повороту
        swap = rot in (90, 270)
        l, w = (width, length) if swap else (length, width)

        # --- межі кузова ---
        if x - l / 2 < -van.length / 2 - EPS or x + l / 2 > van.length / 2 + EPS \
           or z - w / 2 < -van.width / 2 - EPS or z + w / 2 > van.width / 2 + EPS:
            raise ValueError(f"«{t.name}» виходить за межі кузова")
        if elev < -EPS or elev + height > van.height + EPS:
            raise ValueError(f"«{t.name}» виходить за межі по висоті")

        # --- опора на арку (лише для режиму rise) ---
        support = 0
        if arch_mode == "rise":
            for a in arches:
                if (x - l / 2 < a[1] - EPS and x + l / 2 > a[0] + EPS and
                        z - w / 2 < a[3] - EPS and z + w / 2 > a[2] + EPS):
                    support = max(support, a[4])
        if elev < support - EPS:
            raise ValueError(f"«{t.name}» стоїть усередині колісної арки")

        # --- висота, яку обрав користувач (до підйому на арку) ---
        try:
            base = float(entry.get("base_elevation", elev))
        except (ValueError, TypeError):
            raise ValueError("Невірна висота блока")
        if not math.isfinite(base):
            raise ValueError("Невірна висота блока")
        base = min(max(base, 0), elev)

        # --- перетин з іншими блоками ---
        box = (x - l / 2, x + l / 2, z - w / 2, z + w / 2, elev, elev + height)
        for b in boxes:
            if (box[0] < b[1] - EPS and box[1] > b[0] + EPS and
                    box[2] < b[3] - EPS and box[3] > b[2] + EPS and
                    box[4] < b[5] - EPS and box[5] > b[4] + EPS):
                raise ValueError("Блоки перетинаються")
        boxes.append(box)

        clean.append({
            "kind": "furniture",
            "type": t.id, "x": x, "z": z,
            "elevation": elev, "base_elevation": base,
            "rotation": rot,
            "size": {"length": length, "width": width, "height": height},
            "arch": arch_mode,
            "texture": texture_id,
        })

    check_openings(openings)
    return clean + openings


# ---------------------------------------------------------------------
# Редактор і збереження
# ---------------------------------------------------------------------
@login_required
def editor(request, pk):
    project = get_object_or_404(Project, pk=pk, owner=request.user)
    furniture = list(
        FurnitureType.objects
        .order_by("category__order", "category__name", "name")
        .values("id", "name", "length", "width", "height", "color", "arch_mode",
                "model_file", "category__name")
    )
    for f in furniture:
        model_file = f.pop("model_file")
        f["model_url"] = settings.MEDIA_URL + model_file if model_file else ""
        f["category"] = f.pop("category__name") or "Без категорії"
    textures = [
        {"id": t.id, "name": t.name, "url": settings.MEDIA_URL + t.image.name, "tile": t.tile_size}
        for t in Texture.objects.all() if t.image
    ]
    return render(request, "vanbuilder/editor.html", {
        "project": project,
        "layout": project.layout,
        "furniture": furniture,
        "textures": textures,
    })


@login_required
@require_POST
def save_layout(request, pk):
    project = get_object_or_404(Project, pk=pk, owner=request.user)
    try:
        raw = json.loads(request.body)
        project.layout = validate_layout(project, raw)
    except (ValueError, json.JSONDecodeError) as e:
        return JsonResponse({"ok": False, "error": str(e)}, status=400)
    project.save()
    return JsonResponse({"ok": True})


# ---------------------------------------------------------------------
# Проєкти: список, створення, видалення
# ---------------------------------------------------------------------
@login_required
def project_list(request):
    projects = (Project.objects.filter(owner=request.user)
                .select_related("van").order_by("-updated_at"))
    return render(request, "vanbuilder/project_list.html", {"projects": projects})


@login_required
def project_create(request):
    if request.method == "POST":
        form = ProjectForm(request.POST)
        if form.is_valid():
            project = form.save(commit=False)
            project.owner = request.user
            project.save()
            return redirect("van_editor", pk=project.pk)
    else:
        form = ProjectForm()
    return render(request, "vanbuilder/project_form.html", {
        "form": form,
        "no_vans": not VanModel.objects.exists(),
    })


@login_required
@require_POST
def project_delete(request, pk):
    project = get_object_or_404(Project, pk=pk, owner=request.user)
    project.delete()
    return redirect("van_list")


# ---------------------------------------------------------------------
# Реєстрація
# ---------------------------------------------------------------------
def register(request):
    if request.method == "POST":
        form = RegisterForm(request.POST)
        if form.is_valid():
            user = form.save()
            login(request, user)
            return redirect("van_list")
    else:
        form = RegisterForm()
    return render(request, "registration/register.html", {"form": form})


# ---------------------------------------------------------------------
# Головна сторінка
# ---------------------------------------------------------------------
def home(request):
    return render(request, "vanbuilder/home.html", {"vans": VanModel.objects.all()[:8]})
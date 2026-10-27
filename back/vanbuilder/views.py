import json
import math
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from django.shortcuts import render, get_object_or_404, redirect
from .models import Project, FurnitureType, VanModel
from django.contrib.auth import login
from django.contrib.auth.forms import UserCreationForm


EPS = 0.01
MIN_SIZE = 10


def validate_layout(project, raw):
    """Перевіряє розстановку. Кидає ValueError з поясненням."""
    if not isinstance(raw, list) or len(raw) > 200:
        raise ValueError("Невірний формат розстановки")

    types = {t.id: t for t in FurnitureType.objects.all()}
    van = project.van
    clean, boxes = [], []

    for entry in raw:
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

        # --- розміри блока (після того, як t уже відомий) ---
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

        swap = rot in (90, 270)
        l, w = (width, length) if swap else (length, width)

        if x - l / 2 < -van.length / 2 - EPS or x + l / 2 > van.length / 2 + EPS \
           or z - w / 2 < -van.width / 2 - EPS or z + w / 2 > van.width / 2 + EPS:
            raise ValueError(f"«{t.name}» виходить за межі кузова")
        if elev < -EPS or elev + height > van.height + EPS:
            raise ValueError(f"«{t.name}» виходить за межі по висоті")

        box = (x - l / 2, x + l / 2, z - w / 2, z + w / 2, elev, elev + height)
        for b in boxes:
            if (box[0] < b[1] - EPS and box[1] > b[0] + EPS and
                box[2] < b[3] - EPS and box[3] > b[2] + EPS and
                box[4] < b[5] - EPS and box[5] > b[4] + EPS):
                raise ValueError("Блоки перетинаються")
        boxes.append(box)

        clean.append({
            "type": t.id, "x": x, "z": z, "elevation": elev, "rotation": rot,
            "size": {"length": length, "width": width, "height": height},
        })
    return clean


@login_required
def editor(request, pk):
    project = get_object_or_404(Project, pk=pk, owner=request.user)
    return render(request, "vanbuilder/editor.html", {
        "project": project,
        "layout": project.layout,
        "furniture": list(FurnitureType.objects.values(
            "id", "name", "length", "width", "height", "color")),
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


@login_required
def project_list(request):
    projects = Project.objects.filter(owner=request.user).select_related("van").order_by("-updated_at")
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
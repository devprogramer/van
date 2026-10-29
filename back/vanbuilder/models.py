from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator
from django.db import models

MAX_MODEL_SIZE = 20 * 1024 * 1024  # 20 МБ


def validate_glb(f):
    """Перевіряє розмір і те, що це справді GLB-файл."""
    if f.size > MAX_MODEL_SIZE:
        raise ValidationError("Файл завеликий (максимум " + MAX_MODEL_SIZE + " МБ).")
    header = f.read(4)
    f.seek(0)
    if header != b"glTF":
        raise ValidationError("Це не GLB-файл (очікується бінарний glTF).")


class VanModel(models.Model):
    name = models.CharField(max_length=100)
    length = models.PositiveIntegerField(help_text="см")
    width = models.PositiveIntegerField(help_text="см")
    height = models.PositiveIntegerField(help_text="см")
    arch_length = models.PositiveIntegerField(default=0, help_text="довжина арки вздовж кузова, см (0 = без арок)")
    arch_width = models.PositiveIntegerField(default=0, help_text="наскільки арка виступає від стіни, см")
    arch_height = models.PositiveIntegerField(default=0, help_text="висота арки від підлоги, см")
    arch_offset = models.IntegerField(default=0, help_text="центр арки від центру кузова вздовж довжини, см (+ у бік правого торця)")

    def __str__(self):
        return self.name


class FurnitureCategory(models.Model):
    name = models.CharField("Назва", max_length=100, unique=True)
    order = models.PositiveIntegerField("Порядок", default=0, help_text="Менше число — вище в списку")

    class Meta:
        ordering = ["order", "name"]
        verbose_name = "Категорія меблів"
        verbose_name_plural = "Категорії меблів"

    def __str__(self):
        return self.name


class FurnitureType(models.Model):
    ARCH_MODES = [
        ("rise", "Піднімається на арку"),
        ("ignore", "Стоїть на підлозі (арка всередині)"),
    ]

    name = models.CharField(max_length=100)
    category = models.ForeignKey(
        FurnitureCategory, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="types",
        verbose_name="Категорія",
    )
    length = models.PositiveIntegerField(help_text="см")
    width = models.PositiveIntegerField(help_text="см")
    height = models.PositiveIntegerField(help_text="см")
    color = models.CharField(max_length=7, default="#c8a165")
    arch_mode = models.CharField(max_length=10, choices=ARCH_MODES, default="rise")
    model_file = models.FileField(
        "3D-модель (.glb)", upload_to="models/", max_length=200, blank=True,
        validators=[FileExtensionValidator(["glb"]), validate_glb],
        help_text="Необов'язково. Без файлу меблі показуються кубиком.",
    )

    class Meta:
        ordering = ["category__order", "category__name", "name"]
        verbose_name = "Тип меблів"
        verbose_name_plural = "Типи меблів"

    def __str__(self):
        return self.name


class Project(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="van_projects")
    van = models.ForeignKey(VanModel, on_delete=models.PROTECT)
    title = models.CharField(max_length=100)
    layout = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title
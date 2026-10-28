from django.conf import settings
from django.db import models





class VanModel(models.Model):
    name = models.CharField(max_length=100)
    length = models.PositiveIntegerField(help_text="см")
    width = models.PositiveIntegerField(help_text="см")
    height = models.PositiveIntegerField(help_text="см")
    arch_length = models.PositiveIntegerField(default=0, help_text="довжина арки вздовж кузова, см (0 = без арок)")
    arch_width = models.PositiveIntegerField(default=0, help_text="наскільки арка виступає від стіни, см")
    arch_height = models.PositiveIntegerField(default=0, help_text="висота арки від підлоги, см")
    arch_offset = models.IntegerField(default=0, help_text="центр арки від центру кузова вздовж довжини, см")

    def __str__(self):
        return self.name

class FurnitureType(models.Model):
    ARCH_MODES = [
        ("rise", "Піднімається на арку"),
        ("ignore", "Стоїть на підлозі (арка всередині)"),
    ]

    name = models.CharField(max_length=100)
    length = models.PositiveIntegerField(help_text="см")
    width = models.PositiveIntegerField(help_text="см")
    height = models.PositiveIntegerField(help_text="см")
    color = models.CharField(max_length=7, default="#c8a165")
    arch_mode = models.CharField(max_length=10, choices=ARCH_MODES, default="rise")

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
from django.conf import settings
from django.db import models

class VanModel(models.Model):
    name = models.CharField(max_length=100)
    length = models.PositiveIntegerField(help_text="см")
    width = models.PositiveIntegerField(help_text="см")
    height = models.PositiveIntegerField(help_text="см")

    def __str__(self):
        return self.name

class FurnitureType(models.Model):
    name = models.CharField(max_length=100)
    length = models.PositiveIntegerField(help_text="см")
    width = models.PositiveIntegerField(help_text="см")
    height = models.PositiveIntegerField(help_text="см")
    color = models.CharField(max_length=7, default="#c8a165")

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
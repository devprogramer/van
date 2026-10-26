from django.contrib import admin
from .models import VanModel, FurnitureType, Project

admin.site.register(VanModel)
admin.site.register(FurnitureType)
admin.site.register(Project)
from django.contrib import admin
from django.utils.html import format_html

from .models import VanModel, FurnitureCategory, FurnitureType, Project, Texture


@admin.register(VanModel)
class VanModelAdmin(admin.ModelAdmin):
    list_display = ("name", "length", "width", "height")


@admin.register(FurnitureCategory)
class FurnitureCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "order", "types_count")
    list_editable = ("order",)
    search_fields = ("name",)

    @admin.display(description="Типів меблів")
    def types_count(self, obj):
        return obj.types.count()


@admin.register(FurnitureType)
class FurnitureTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "length", "width", "height", "arch_mode", "has_model")
    list_filter = ("category", "arch_mode")
    search_fields = ("name",)
    list_select_related = ("category",)

    @admin.display(boolean=True, description="3D-модель")
    def has_model(self, obj):
        return bool(obj.model_file)


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "van", "updated_at")


@admin.register(Texture)
class TextureAdmin(admin.ModelAdmin):
    list_display = ("name", "preview", "tile_size")
    search_fields = ("name",)

    @admin.display(description="Перегляд")
    def preview(self, obj):
        if not obj.image:
            return "—"
        return format_html('<img src="{}" style="height:40px; width:40px; object-fit:cover; border-radius:4px;">', obj.image.url)
from django.contrib import admin
from .models import VanModel, FurnitureType, Project
from django import forms

# Створюємо форму спеціально для адмінки
class FurnitureTypeAdminForm(forms.ModelForm):
    class Meta:
        model = FurnitureType
        fields = '__all__'
        widgets = {
            'color': forms.TextInput(attrs={'type': 'color'}),
        }

class FurnitureTypeAdmin(admin.ModelAdmin):
    form = FurnitureTypeAdminForm
    
admin.site.register(VanModel)
admin.site.register(FurnitureType, FurnitureTypeAdmin)
admin.site.register(Project)
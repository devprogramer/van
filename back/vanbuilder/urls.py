from django.urls import path
from . import views

urlpatterns = [
    path("<int:pk>/", views.editor, name="van_editor"),
    path("<int:pk>/save/", views.save_layout, name="van_save"),
]
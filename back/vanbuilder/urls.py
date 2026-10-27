from django.urls import path
from . import views

from vanbuilder import views as vanbuilder_views

urlpatterns = [
    path("", views.project_list, name="van_list"),
    path("new/", views.project_create, name="van_create"),
    path("<int:pk>/", views.editor, name="van_editor"),
    path("<int:pk>/save/", views.save_layout, name="van_save"),
    path("<int:pk>/delete/", views.project_delete, name="van_delete"),

]
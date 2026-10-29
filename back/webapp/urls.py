from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

from vanbuilder import views as vanbuilder_views

urlpatterns = [
    path("", vanbuilder_views.home, name="home"),
    path("admin/", admin.site.urls),
    path("van/", include("vanbuilder.urls")),

    # Реєстрація має стояти ПЕРЕД include("django.contrib.auth.urls")
    path("accounts/register/", vanbuilder_views.register, name="register"),
    path("accounts/", include("django.contrib.auth.urls")),

    # Завантажені 3D-моделі, текстури та інші медіафайли
    re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
]
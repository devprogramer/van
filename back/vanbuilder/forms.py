from django import forms
from .models import Project
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth import get_user_model


class ProjectForm(forms.ModelForm):
    class Meta:
        model = Project
        fields = ["title", "van"]
        labels = {"title": "Назва проєкту", "van": "Модель кузова"}


class ProjectForm(forms.ModelForm):
    class Meta:
        model = Project
        fields = ["title", "van"]
        labels = {"title": "Назва проєкту", "van": "Модель кузова"}


class RegisterForm(UserCreationForm):
    email = forms.EmailField(required=True, label="Email")

    class Meta:
        model = get_user_model()
        fields = ("username", "email")
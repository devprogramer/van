import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "webapp.settings")
os.environ["DJANGO_ENV"] = "production"

from django.core.management import execute_from_command_line
execute_from_command_line(["manage.py", "collectstatic", "--noinput"])
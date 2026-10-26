import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "webapp.settings")
os.environ["DJANGO_ENV"] = "production"

import django
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

# username = ""
# password = ""

if not User.objects.filter(username=username).exists():
    User.objects.create_superuser(username, "", password)
    print("Superuser created")
else:
    u = User.objects.get(username=username)
    u.set_password(password)
    u.save()
    print("Password updated")
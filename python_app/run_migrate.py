import os
import sys
import django
from django.core.management import call_command

# додаємо папку проєкту в шлях
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# замініть myproject на назву вашого проєкту (папка, де лежить settings.py)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'webapp.settings')

django.setup()

call_command('migrate', interactive=False)
# за потреби:
# call_command('collectstatic', interactive=False)
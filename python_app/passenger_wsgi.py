   import os, sys
   sys.path.insert(0, os.path.dirname(__file__))
   os.environ.setdefault("DJANGO_SETTINGS_MODULE", "webapp.settings")

   from django.core.wsgi import get_wsgi_application
   application = get_wsgi_application()
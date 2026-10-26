# van

Встановіть віртуальне середовище та Django
Створіть папку для проекту, активуйте віртуальне середовище й інсталюйте фреймворк:


python -m venv myenv
# Активізація на Windows:
myenv\Scripts\activate
# Активізація на macOS / Linux:
source myenv/bin/environ/activate   # або source myenv/bin/activate
pip install django


Створіть проект Django
Виконайте команду для ініціалізації нового проекту (крапка в кінці створює файли в поточної папці):

django-admin startproject mysite .

Застосуйте початкові міграції бази даних
Підготуйте базу даних (за замовчуванням SQLite):

python manage.py migrate


Запустіть локальний сервер
Увімкніть сервер розробки:

python manage.py runserver 0.0.0.0:8000

python manage.py createsuperuser
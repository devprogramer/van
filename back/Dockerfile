# Використовуємо легкий, але сумісний образ
FROM python:3.12-slim

# Встановлюємо змінні середовища для оптимізації Python
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /home/app

# Окремо копіюємо і ставимо залежності (для кешування шарів)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копіюємо код проекту
# COPY back/app .

EXPOSE 8001

CMD ["gunicorn", "webapp.wsgi:application", "--bind", "0.0.0.0:8001"]

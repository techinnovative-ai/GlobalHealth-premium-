FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv/backend

RUN useradd --system --uid 10001 --home /srv/backend sentin
COPY requirements.txt requirements-postgres.txt ./
RUN pip install -r requirements-postgres.txt

COPY app ./app
RUN mkdir -p /srv/backend/data && chown -R sentin /srv/backend/data
USER sentin

EXPOSE 8000
# API by default; the worker service overrides this command.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]

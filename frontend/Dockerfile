# Builds the static site and leaves it in /srv for the proxy to serve.
FROM python:3.12-slim AS build

ENV PYTHONUTF8=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# git is needed at build time: ursus_config.py stamps each page with the commit
# it was generated from.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

ARG DOMAIN=""
ENV DOMAIN=${DOMAIN} \
    MINIFY_CSS=1 \
    MINIFY_JS=1

RUN ursus build

FROM alpine:3 AS output
COPY --from=build /app/output /srv

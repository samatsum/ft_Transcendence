ARG EMSDK_IMAGE=emscripten/emsdk:latest
FROM ${EMSDK_IMAGE}

WORKDIR /workspace
ENV EM_CACHE=/tmp/emscripten-cache

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash ca-certificates make python3 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /tmp/emscripten-cache \
    && chmod 0777 /tmp/emscripten-cache

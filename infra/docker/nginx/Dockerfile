FROM nginx:1.30.4-trixie

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY infra/docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY --chmod=755 infra/docker/nginx/entrypoint.sh /usr/local/bin/nginx-entrypoint.sh

EXPOSE 443

ENTRYPOINT ["/usr/local/bin/nginx-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]

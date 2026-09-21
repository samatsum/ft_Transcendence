FROM nginx:1.30.4-trixie

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl gettext-base \
    && rm -rf /var/lib/apt/lists/*

# entrypoint.sh が envsubst でホスト名と証明書パスを埋めて
# /etc/nginx/nginx.conf を書き出す
COPY infra/docker/nginx/nginx.conf.template /etc/nginx/nginx.conf.template
COPY --chmod=755 infra/docker/nginx/entrypoint.sh /usr/local/bin/nginx-entrypoint.sh

EXPOSE 80
EXPOSE 443

ENTRYPOINT ["/usr/local/bin/nginx-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]

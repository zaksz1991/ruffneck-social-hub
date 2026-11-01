FROM node:22-bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends clamav clamav-daemon clamav-freshclam netcat-openbsd ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /srv/scanner
COPY clamd.conf /etc/clamav/clamd.conf
COPY entrypoint.sh /srv/scanner/entrypoint.sh
COPY server.mjs /srv/scanner/server.mjs
RUN chmod 0755 /srv/scanner/entrypoint.sh \
  && mkdir -p /run/clamav /var/lib/clamav \
  && chown -R clamav:clamav /run/clamav /var/lib/clamav
EXPOSE 8080
CMD ["/srv/scanner/entrypoint.sh"]

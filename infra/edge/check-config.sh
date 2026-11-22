#!/bin/sh
# Validates an edge vhost without needing the runtime network.
#
# The one thing a build cannot know is where `api` and `web` will live, so this copies the include
# root to a scratch directory, rewrites only those two hosts (and the paths that point at the
# copy), and runs the real vhost — with its real snippets and error pages — inside a minimal http
# block. A typo, a missing snippet or a bad directive therefore fails the build instead of the
# deployment; name resolution stays the runtime's job. The upstreams use `resolve`, so a name this
# build cannot look up is not an error — nginx starts and resolves it on the real network.
#
# Usage: check-config.sh [vhost]          (default /etc/nginx/conf.d/default.conf)
set -eu

vhost="${1:-/etc/nginx/conf.d/default.conf}"
app_root=/etc/nginx/app

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cp -r "$app_root/." "$tmp/app"

for file in "$tmp"/app/snippets/*.conf "$tmp"/app/errors/*.html; do
  [ -f "$file" ] || continue
  sed -i \
    -e 's#server api:3000 resolve;#server 127.0.0.1:3000 resolve;#' \
    -e 's#server web:8080 resolve;#server 127.0.0.1:8080 resolve;#' \
    "$file"
done

cp "$vhost" "$tmp/app/vhost.conf"
sed -i -e "s#$app_root#$tmp/app#g" "$tmp/app/vhost.conf"

{
  echo 'events {}'
  echo 'http {'
  echo '  include /etc/nginx/mime.types;'
  cat "$tmp/app/vhost.conf"
  echo '}'
} > "$tmp/nginx.conf"

nginx -t -c "$tmp/nginx.conf"

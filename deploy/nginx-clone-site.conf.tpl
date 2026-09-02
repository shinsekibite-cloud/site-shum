# YoungPortal — single-domain nginx (clone of young.idivles.ru as of pack date).
# Placeholders replaced by scripts/install-full-clone.sh:
#   __DOMAIN__  __APP_DIR__  __RATE_AUTH__  __RATE_API__  __RATE_GENERAL__
#   __LIMIT_CONN__  __COLLECTIBLES__  __HSTS__
#   __SSL_CERT__  __SSL_KEY__  __SSL_INCLUDE__  __SSL_DHPARAM__
#   __LISTEN_SSL__
#
# Requires /etc/nginx/conf.d/yp-limits.conf (rate zones) unless rate profile = off.
# Requires /etc/nginx/snippets/yp-proxy.conf

upstream yp_web {
    server 127.0.0.1:3000 fail_timeout=3s max_fails=1;
    keepalive 16;
}

server {
    server_name __DOMAIN__;
    client_max_body_size 25m;
    __LIMIT_CONN__

    # Security headers (always)
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    # camera=(self): scanner + avatar capture need getUserMedia; mic/geo stay blocked
    add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
    __HSTS__

    location ^~ /uploads/backups/ { deny all; return 404; }
    location ^~ /uploads/lea/ { deny all; return 404; }
    location ~* ^/uploads/\. { deny all; return 404; }

    location ^~ /backups/ {
        alias /var/backups/sochi-portal/public-dl/;
        access_log off;
        default_type application/gzip;
        add_header Cache-Control "private, no-store";
        add_header X-Content-Type-Options "nosniff";
        types { }
        try_files $uri =404;
    }

    location ^~ /.well-known/security.txt {
        alias /etc/nginx/well-known/security.txt;
        default_type text/plain;
        add_header Cache-Control "public, max-age=86400";
    }

    location ^~ /brand/ {
        alias __APP_DIR__/public/brand/;
        access_log off;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        try_files $uri =404;
    }
    location ^~ /icons/ {
        alias __APP_DIR__/public/icons/;
        access_log off;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        try_files $uri =404;
    }
    location ^~ /covers/ {
        alias __APP_DIR__/public/covers/;
        access_log off;
        expires 14d;
        add_header Cache-Control "public, max-age=1209600";
        try_files $uri =404;
    }
    location ^~ /_next/static/ {
        proxy_pass http://yp_web;
        include /etc/nginx/snippets/yp-proxy.conf;
        access_log off;
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /uploads/ {
        alias __APP_DIR__/public/uploads/;
        access_log off;
        expires 7d;
        add_header Cache-Control "public";
        types {
            application/pdf pdf;
            text/plain txt;
            application/msword doc;
            application/vnd.openxmlformats-officedocument.wordprocessingml.document docx;
            image/jpeg jpg jpeg;
            image/png png;
            image/webp webp;
            image/gif gif;
        }
        default_type application/octet-stream;
        add_header Content-Disposition "inline";
        try_files $uri =404;
    }

    __COLLECTIBLES__

    location /api/auth/ {
        __RATE_AUTH__
        limit_req_status 429;
        proxy_pass http://yp_web;
        include /etc/nginx/snippets/yp-proxy.conf;
        client_max_body_size 25m;
        proxy_connect_timeout 3s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location /api/ {
        __RATE_API__
        limit_req_status 429;
        proxy_pass http://yp_web;
        include /etc/nginx/snippets/yp-proxy.conf;
        client_max_body_size 25m;
        proxy_connect_timeout 3s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location / {
        __RATE_GENERAL__
        limit_req_status 429;
        proxy_pass http://yp_web;
        include /etc/nginx/snippets/yp-proxy.conf;
        client_max_body_size 25m;
        proxy_connect_timeout 3s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    __LISTEN_SSL__
    __SSL_CERT__
    __SSL_KEY__
    __SSL_INCLUDE__
    __SSL_DHPARAM__
}

server {
    listen 80;
    server_name __DOMAIN__;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        default_type "text/plain";
    }
    location / {
        __HTTP_ROOT__
    }
}

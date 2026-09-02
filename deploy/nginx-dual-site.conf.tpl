# YoungPortal — dual nginx: production + staging on one VPS.
# Placeholders replaced by scripts/install-dev-stack.sh:
#   __PROD_DOMAIN__  __STAGING_DOMAIN__
#   __PROD_APP_DIR__  __STAGING_APP_DIR__
#   __RATE_AUTH__  __RATE_API__  __RATE_GENERAL__  __LIMIT_CONN__
#   __COLLECTIBLES__  __HSTS__
#   __PROD_LISTEN_SSL__  __PROD_SSL_CERT__  __PROD_SSL_KEY__
#   __STAGING_LISTEN_SSL__  __STAGING_SSL_CERT__  __STAGING_SSL_KEY__
#   __SSL_INCLUDE__  __SSL_DHPARAM__
#   __PROD_HTTP_ROOT__  __STAGING_HTTP_ROOT__
#
# Requires /etc/nginx/conf.d/yp-limits.conf unless rate profile = off.
# Requires /etc/nginx/snippets/yp-proxy.conf

upstream yp_web_prod {
    server 127.0.0.1:3000 fail_timeout=3s max_fails=1;
    keepalive 16;
}

upstream yp_web_staging {
    server 127.0.0.1:3001 fail_timeout=3s max_fails=1;
    keepalive 8;
}

# ─── PRODUCTION ─────────────────────────────────────────────────────────────
server {
    server_name __PROD_DOMAIN__;
    client_max_body_size 25m;
    __LIMIT_CONN__

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    # camera=(self): scanner + avatar capture need getUserMedia; mic/geo stay blocked
    add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
    add_header X-YP-Env "production" always;
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
        alias __PROD_APP_DIR__/public/brand/;
        access_log off;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        try_files $uri =404;
    }
    location ^~ /icons/ {
        alias __PROD_APP_DIR__/public/icons/;
        access_log off;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        try_files $uri =404;
    }
    location ^~ /covers/ {
        alias __PROD_APP_DIR__/public/covers/;
        access_log off;
        expires 14d;
        add_header Cache-Control "public, max-age=1209600";
        try_files $uri =404;
    }
    location ^~ /_next/image {
        proxy_pass http://yp_web_prod;
        include /etc/nginx/snippets/yp-proxy.conf;
        proxy_read_timeout 30s;
        access_log off;
    }

    location ^~ /_next/static/ {
        proxy_pass http://yp_web_prod;
        include /etc/nginx/snippets/yp-proxy.conf;
        access_log off;
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /uploads/ {
        alias __PROD_APP_DIR__/public/uploads/;
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
        proxy_pass http://yp_web_prod;
        include /etc/nginx/snippets/yp-proxy.conf;
        client_max_body_size 25m;
        proxy_connect_timeout 3s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location /api/ {
        __RATE_API__
        limit_req_status 429;
        proxy_pass http://yp_web_prod;
        include /etc/nginx/snippets/yp-proxy.conf;
        client_max_body_size 25m;
        proxy_connect_timeout 3s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location / {
        __RATE_GENERAL__
        limit_req_status 429;
        proxy_pass http://yp_web_prod;
        include /etc/nginx/snippets/yp-proxy.conf;
        client_max_body_size 25m;
        proxy_connect_timeout 3s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    __PROD_LISTEN_SSL__
    __PROD_SSL_CERT__
    __PROD_SSL_KEY__
    __SSL_INCLUDE__
    __SSL_DHPARAM__
}

server {
    listen 80;
    server_name __PROD_DOMAIN__;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        default_type "text/plain";
    }
    location / {
        __PROD_HTTP_ROOT__
    }
}

# ─── STAGING / TEST ─────────────────────────────────────────────────────────
server {
    server_name __STAGING_DOMAIN__;
    client_max_body_size 25m;
    __LIMIT_CONN__

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    # camera=(self): scanner + avatar capture need getUserMedia; mic/geo stay blocked
    add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
    # Guest-facing: do not advertise staging (Lighthouse / crawlers). Env is on /api/health.
    __HSTS__

    location ^~ /uploads/backups/ { deny all; return 404; }
    location ^~ /uploads/lea/ { deny all; return 404; }
    location ~* ^/uploads/\. { deny all; return 404; }

    location ^~ /.well-known/security.txt {
        alias /etc/nginx/well-known/security.txt;
        default_type text/plain;
        add_header Cache-Control "public, max-age=86400";
    }

    location ^~ /brand/ {
        alias __STAGING_APP_DIR__/public/brand/;
        access_log off;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        try_files $uri =404;
    }
    location ^~ /icons/ {
        alias __STAGING_APP_DIR__/public/icons/;
        access_log off;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        try_files $uri =404;
    }
    location ^~ /covers/ {
        alias __STAGING_APP_DIR__/public/covers/;
        access_log off;
        expires 14d;
        add_header Cache-Control "public, max-age=1209600";
        try_files $uri =404;
    }
    location ^~ /_next/image {
        proxy_pass http://yp_web_staging;
        include /etc/nginx/snippets/yp-proxy.conf;
        proxy_read_timeout 30s;
        access_log off;
    }

    location ^~ /_next/static/ {
        proxy_pass http://yp_web_staging;
        include /etc/nginx/snippets/yp-proxy.conf;
        access_log off;
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /uploads/ {
        alias __PROD_APP_DIR__/public/uploads/;
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

    location /api/auth/ {
        __RATE_AUTH__
        limit_req_status 429;
        proxy_pass http://yp_web_staging;
        include /etc/nginx/snippets/yp-proxy.conf;
        client_max_body_size 25m;
        proxy_connect_timeout 3s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location /api/ {
        __RATE_API__
        limit_req_status 429;
        proxy_pass http://yp_web_staging;
        include /etc/nginx/snippets/yp-proxy.conf;
        client_max_body_size 25m;
        proxy_connect_timeout 3s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location / {
        __RATE_GENERAL__
        limit_req_status 429;
        proxy_pass http://yp_web_staging;
        include /etc/nginx/snippets/yp-proxy.conf;
        client_max_body_size 25m;
        proxy_connect_timeout 3s;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    __STAGING_LISTEN_SSL__
    __STAGING_SSL_CERT__
    __STAGING_SSL_KEY__
    __SSL_INCLUDE__
    __SSL_DHPARAM__
}

server {
    listen 80;
    server_name __STAGING_DOMAIN__;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/html;
        default_type "text/plain";
    }
    location / {
        __STAGING_HTTP_ROOT__
    }
}

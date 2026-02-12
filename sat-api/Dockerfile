FROM php:8.3-fpm


RUN apt-get update && apt-get install -y \
    nginx supervisor git curl unzip zip sqlite3 gettext-base \
    && rm -rf /var/lib/apt/lists/*

# ✅ Instalador robusto de extensiones PHP
ADD https://github.com/mlocati/docker-php-extension-installer/releases/latest/download/install-php-extensions /usr/local/bin/
RUN chmod +x /usr/local/bin/install-php-extensions

# ✅ Instala extensiones sin pelear con config.m4
RUN install-php-extensions \
    pdo_sqlite \
    sqlite3 \
    mbstring \
    bcmath \
    gd \
    soap \
    zip


# Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www

# Copia código
COPY . /var/www

# Permisos básicos (storage irá en disk persistente)
RUN chown -R www-data:www-data /var/www

# Instala deps sin dev
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader

# Nginx config + supervisor + entrypoint
RUN rm -rf /etc/nginx/sites-enabled/* && rm -rf /etc/nginx/conf.d/*
COPY ./nginx/render.conf /etc/nginx/conf.d/default.conf
COPY ./docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY ./docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh


EXPOSE 10000
CMD ["/entrypoint.sh"]

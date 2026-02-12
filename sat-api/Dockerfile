FROM php:8.3-fpm

# System deps
RUN apt-get update && apt-get install -y \
    nginx \
    supervisor \
    git \
    curl \
    unzip \
    zip \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    libzip-dev \
    libsqlite3-dev \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# PHP extensions (incluye sqlite)
RUN docker-php-ext-install \
    pdo \
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
COPY ./nginx/render.conf /etc/nginx/conf.d/default.conf
COPY ./docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY ./docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 10000
CMD ["/entrypoint.sh"]

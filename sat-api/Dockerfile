FROM php:8.3-fpm

# Dependencias base
RUN apt-get update && apt-get install -y \
    nginx \
    supervisor \
    git \
    curl \
    unzip \
    zip \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# ✅ Instalador robusto de extensiones PHP (mlocati)
ADD https://github.com/mlocati/docker-php-extension-installer/releases/latest/download/install-php-extensions /usr/local/bin/
RUN chmod +x /usr/local/bin/install-php-extensions

# ✅ Extensiones necesarias para Laravel + SQLite
RUN install-php-extensions pdo pdo_sqlite sqlite3 mbstring bcmath gd soap zip intl pcntl

# Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www

# Copiamos código y definimos dueño
COPY . /var/www
RUN chown -R www-data:www-data /var/www

# Instalación de dependencias (Optimizado para producción)
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader

# ✅ Preparación de Nginx: Limpiamos todo rastro de configs por defecto
RUN rm -rf /etc/nginx/sites-enabled/* && rm -rf /etc/nginx/conf.d/*
COPY ./nginx/render.conf /etc/nginx/conf.d/default.conf
COPY ./docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY ./docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

# Render ignorará esto, pero ayuda a documentar
EXPOSE 10000

CMD ["/entrypoint.sh"]

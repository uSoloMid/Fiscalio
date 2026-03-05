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
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias de procesamiento bancario de Python
RUN pip3 install pdfplumber pandas openpyxl pymupdf --break-system-packages

# ✅ Instalador robusto de extensiones PHP (mlocati)
ADD https://github.com/mlocati/docker-php-extension-installer/releases/latest/download/install-php-extensions /usr/local/bin/
RUN chmod +x /usr/local/bin/install-php-extensions

# ✅ Extensiones necesarias para Laravel (MySQL + SQLite + PostgreSQL)
RUN install-php-extensions bcmath gd intl mbstring pcntl pdo pdo_mysql pdo_pgsql pdo_sqlite pgsql soap sqlite3 zip

# PHP upload limits (PDFs de estados de cuenta pueden ser grandes)
RUN echo "upload_max_filesize=50M\npost_max_size=50M" > /usr/local/etc/php/conf.d/uploads.ini

# Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www

# Copiamos código y definimos dueño
COPY . /var/www
RUN chown -R www-data:www-data /var/www

# Instalación de dependencias (Optimizado para producción)
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader

# ✅ Preparación de Nginx: symlink al volumen para que git-deploy aplique sin rebuild
# nginx lee /etc/nginx/conf.d/default.conf → /var/www/nginx/render.conf (en runtime es el volumen montado)
RUN rm -rf /etc/nginx/sites-enabled/* && rm -rf /etc/nginx/conf.d/* \
    && ln -sf /var/www/nginx/render.conf /etc/nginx/conf.d/default.conf
COPY ./docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY ./docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

# Render ignorará esto, pero ayuda a documentar
EXPOSE 10000

CMD ["/entrypoint.sh"]

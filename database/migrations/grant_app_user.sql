-- Ejecutar UNA VEZ como el usuario administrador de Cloud SQL (postgres), p. ej. en Cloud SQL Studio.
-- Permite que la aplicación cree por sí sola las tablas nuevas al arrancar (V003, V004, V005...).
-- Cambia forfunable_user si tu servicio se conecta con otro usuario
-- (la consola de administración muestra el usuario exacto en Métricas > Estado de la base de datos).
GRANT USAGE, CREATE ON SCHEMA public TO forfunable_user;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES ON ALL TABLES IN SCHEMA public TO forfunable_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO forfunable_user;
-- Después: Consola de administración > Métricas > "Reintentar migración" (o redesplegar el servicio).

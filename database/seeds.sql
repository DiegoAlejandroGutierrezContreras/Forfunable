-- ========================================================================
-- FORFUNABLE - DATOS SEMILLA (SEEDS) PARA DESARROLLO Y PRUEBAS
-- ========================================================================

-- Contraseñas hasheadas con bcrypt para 'Password123!'
-- $2a$10$7Ac11hGv8e0sB0cZ6YvG9uP2O8J/ZlW9H.bE/W6YgE9dE3g6V7Wc.

INSERT INTO users (id, username, email, password_hash, global_role, avatar_url, bio, karma_score, is_adult_verified, is_active)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'admin_master', 'admin@forfunable.com', '$2a$10$o8nE1/bU6Uq/y.ZqUuK27.H0F7yF0k0y0hU7vC0pX3z9o4wV4b8yG', 'GLOBAL_ADMIN', 'https://avatar.iran.liara.run/public/1', 'Administrador Global del Sistema', 9999, TRUE, TRUE),
    ('a0000000-0000-0000-0000-000000000002', 'mod_diego', 'diego@forfunable.com', '$2a$10$o8nE1/bU6Uq/y.ZqUuK27.H0F7yF0k0y0hU7vC0pX3z9o4wV4b8yG', 'COMMUNITY_MOD', 'https://avatar.iran.liara.run/public/2', 'Moderador de comunidades tecnológicas', 500, TRUE, TRUE),
    ('a0000000-0000-0000-0000-000000000003', 'kiba_dev', 'kiba@forfunable.com', '$2a$10$o8nE1/bU6Uq/y.ZqUuK27.H0F7yF0k0y0hU7vC0pX3z9o4wV4b8yG', 'USER', 'https://avatar.iran.liara.run/public/3', 'Desarrollador de software libre y entusiasta de Go', 250, TRUE, TRUE),
    ('a0000000-0000-0000-0000-000000000004', 'newbie_user', 'newbie@forfunable.com', '$2a$10$o8nE1/bU6Uq/y.ZqUuK27.H0F7yF0k0y0hU7vC0pX3z9o4wV4b8yG', 'USER', 'https://avatar.iran.liara.run/public/4', 'Nuevo en la plataforma', 10, FALSE, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Configuración de notificaciones
INSERT INTO notification_settings (user_id, email_on_reply, email_on_mention, push_on_chat_request, push_on_community_update)
VALUES
    ('a0000000-0000-0000-0000-000000000001', TRUE, TRUE, TRUE, TRUE),
    ('a0000000-0000-0000-0000-000000000002', TRUE, TRUE, TRUE, TRUE),
    ('a0000000-0000-0000-0000-000000000003', TRUE, TRUE, TRUE, FALSE),
    ('a0000000-0000-0000-0000-000000000004', TRUE, TRUE, TRUE, FALSE)
ON CONFLICT (user_id) DO NOTHING;

-- Comunidades iniciales
INSERT INTO communities (id, name, description, rules_text, is_private, age_restricted, creator_id)
VALUES
    ('b0000000-0000-0000-0000-000000000001', 'golang', 'Comunidad en español para desarrolladores en lenguaje Go.', '1. Respetar a los demás. 2. Compartir código limpio. 3. No spam.', FALSE, FALSE, 'a0000000-0000-0000-0000-000000000003'),
    ('b0000000-0000-0000-0000-000000000002', 'gcp-cloud', 'Arquitecturas e infraestructura en Google Cloud Platform.', 'Discusión sobre Cloud Run, Cloud SQL y GKE.', FALSE, FALSE, 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Moderadores locales
INSERT INTO community_moderators (community_id, user_id, mod_role, permissions)
VALUES
    ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'OWNER', '{"can_ban": true, "can_remove": true, "can_pin": true}'),
    ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'LEAD_MOD', '{"can_ban": true, "can_remove": true, "can_pin": true}')
ON CONFLICT (community_id, user_id) DO NOTHING;

-- Miembros de comunidad
INSERT INTO community_members (community_id, user_id)
VALUES
    ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003'),
    ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004'),
    ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001')
ON CONFLICT (community_id, user_id) DO NOTHING;

-- Publicación inicial
INSERT INTO posts (id, community_id, author_id, title, content_type, body_text, upvotes_count, downvotes_count, comments_count)
VALUES
    ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', '¡Bienvenidos a Forfunable en Go!', 'TEXT', 'Este es el primer post de la plataforma desarrollado en Go con Gin y Cloud SQL PostgreSQL.', 10, 0, 2)
ON CONFLICT (id) DO NOTHING;

-- Comentarios jerárquicos estructurados con ltree
INSERT INTO comments (id, post_id, user_id, parent_comment_id, content, path, depth, score)
VALUES
    ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', NULL, 'Excelente iniciativa. La arquitectura con ltree es muy rápida.', 'c0000000_0000_0000_0000_000000000001.d0000000_0000_0000_0000_000000000001', 0, 5),
    ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', '¡Totalmente de acuerdo! Cero consultas recursivas WITH RECURSIVE.', 'c0000000_0000_0000_0000_000000000001.d0000000_0000_0000_0000_000000000001.d0000000_0000_0000_0000_000000000002', 1, 3)
ON CONFLICT (id) DO NOTHING;

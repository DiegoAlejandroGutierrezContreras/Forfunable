-- ========================================================================
-- FORFUNABLE - ESQUEMA DE BASE DE DATOS POSTGRESQL (CLOUD SQL)
-- Compatible con Cloud SQL PostgreSQL 15+
-- Extensiones: pgcrypto, ltree
-- Índices: GiST sobre ltree, B-Tree sobre campos de búsqueda frecuente
-- ========================================================================

-- 1. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS ltree;

-- 2. Tipos Enumerados (idempotentes)
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('USER', 'COMMUNITY_MOD', 'GLOBAL_ADMIN');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE mod_role_enum AS ENUM ('OWNER', 'LEAD_MOD', 'MOD');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE content_type_enum AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'LINK');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE chat_request_status_enum AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'BLOCKED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE report_target_enum AS ENUM ('POST', 'COMMENT', 'USER', 'CHAT_MESSAGE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE report_status_enum AS ENUM ('PENDING', 'UNDER_REVIEW', 'ACTIONED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. Usuarios
-- Las contraseñas se almacenan como hashes BCrypt generados por la API Go.
-- NUNCA se almacena texto plano.
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(30) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,       -- BCrypt cost 10+, generado por API Go
    global_role user_role_enum NOT NULL DEFAULT 'USER',
    avatar_url TEXT NULL,
    bio TEXT NULL,
    presence_status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
    karma_score INTEGER NOT NULL DEFAULT 0 CHECK (karma_score >= 0),
    is_adult_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    freeze_reason TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_global_role ON users(global_role);

-- 4. Comunidades
CREATE TABLE IF NOT EXISTS communities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL
        CHECK (name ~ '^[a-zA-Z0-9_\-]+$'),   -- Sin espacios ni caracteres especiales
    description TEXT NULL,
    rules_text TEXT NULL,
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
    age_restricted BOOLEAN NOT NULL DEFAULT FALSE,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_communities_name ON communities(name);
CREATE INDEX IF NOT EXISTS idx_communities_creator ON communities(creator_id);

-- 5. Miembros / Suscriptores de Comunidad
CREATE TABLE IF NOT EXISTS community_members (
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (community_id, user_id)
);

-- 6. Moderadores Locales de Comunidad
CREATE TABLE IF NOT EXISTS community_moderators (
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mod_role mod_role_enum NOT NULL DEFAULT 'MOD',
    permissions JSONB NOT NULL DEFAULT '{"can_ban": true, "can_remove": true, "can_pin": false}',
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (community_id, user_id)
);

-- 7. Publicaciones
CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL CHECK (char_length(title) >= 3),
    content_type content_type_enum NOT NULL,
    body_text TEXT NULL,
    media_url TEXT NULL,
    upvotes_count INTEGER NOT NULL DEFAULT 0 CHECK (upvotes_count >= 0),
    downvotes_count INTEGER NOT NULL DEFAULT 0 CHECK (downvotes_count >= 0),
    comments_count INTEGER NOT NULL DEFAULT 0 CHECK (comments_count >= 0),
    is_removed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_posts_community_created ON posts(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
-- El Hot Ranking se calcula dinámicamente en la consulta.
-- NOW() no puede utilizarse en índices porque no es una función IMMUTABLE.
CREATE INDEX IF NOT EXISTS idx_posts_active_created
ON posts(created_at DESC)
WHERE is_removed = FALSE;

-- 8. Comentarios Jerárquicos con ltree
-- path usa la extensión ltree con índice GiST para recuperar
-- árboles completos sin recursión (O(log n) por subárbol).
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_comment_id UUID NULL REFERENCES comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) >= 1),
    path LTREE NOT NULL,       -- Ej: post_uuid.comment_uuid.reply_uuid
    depth SMALLINT NOT NULL DEFAULT 0 CHECK (depth >= 0),
    score INTEGER NOT NULL DEFAULT 0,
    is_removed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índice GiST real sobre la columna ltree (requerido por la tarea).
CREATE INDEX IF NOT EXISTS idx_comments_path_gist ON comments USING GIST (path);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_comment_id);

-- 9. Votos (separación física para evitar table locks en viralidad)
-- CHECK garantiza que solo se almacenan valores válidos.
-- PRIMARY KEY compuesta evita votos duplicados del mismo usuario.
CREATE TABLE IF NOT EXISTS post_votes (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    vote_value SMALLINT NOT NULL CHECK (vote_value IN (-1, 1)),   -- Solo -1 o 1
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id)    -- Un voto por usuario por post
);

CREATE TABLE IF NOT EXISTS comment_votes (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    vote_value SMALLINT NOT NULL CHECK (vote_value IN (-1, 1)),   -- Solo -1 o 1
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, comment_id)  -- Un voto por usuario por comentario
);

-- 10. Solicitudes de Mensajería Privada
CREATE TABLE IF NOT EXISTS chat_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    initial_message TEXT NULL,
    status chat_request_status_enum NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_chat_pair UNIQUE (sender_id, recipient_id),
    CONSTRAINT no_self_request CHECK (sender_id <> recipient_id)
);

-- 11. Conversaciones de Chat Privado
CREATE TABLE IF NOT EXISTS chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_conversation_users UNIQUE (user1_id, user2_id),
    CONSTRAINT no_self_conversation CHECK (user1_id <> user2_id)
);

-- 12. Mensajes de Chat Privado
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    attachment_url TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages(conversation_id, created_at ASC);

-- 13. Bloqueos de Usuarios
CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id)
);

-- 14. Expulsiones / Sanciones de Comunidad
CREATE TABLE IF NOT EXISTS community_bans (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, community_id)
);

-- 15. Sistema de Denuncias
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id UUID NOT NULL,
    target_type report_target_enum NOT NULL,
    reason_code VARCHAR(50) NOT NULL,
    description TEXT NULL,
    status report_status_enum NOT NULL DEFAULT 'PENDING',
    resolved_by UUID NULL REFERENCES users(id),
    resolution_notes TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);

-- 16. Registro de Moderación (inmutable)
CREATE TABLE IF NOT EXISTS moderation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    moderator_id UUID NOT NULL REFERENCES users(id),
    community_id UUID NULL REFERENCES communities(id),
    action_type VARCHAR(50) NOT NULL,
    target_id UUID NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mod_logs_created ON moderation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mod_logs_moderator ON moderation_logs(moderator_id);

-- 17. Configuración de Notificaciones por Usuario
CREATE TABLE IF NOT EXISTS notification_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email_on_reply BOOLEAN NOT NULL DEFAULT TRUE,
    email_on_mention BOOLEAN NOT NULL DEFAULT TRUE,
    push_on_chat_request BOOLEAN NOT NULL DEFAULT TRUE,
    push_on_community_update BOOLEAN NOT NULL DEFAULT FALSE
);

-- 18. Notificaciones
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

-- 19. Notas Comunitarias (fact-checking)
CREATE TABLE IF NOT EXISTS community_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_text TEXT NOT NULL,
    proof_url TEXT NULL,
    helpful_votes INTEGER NOT NULL DEFAULT 0 CHECK (helpful_votes >= 0),
    unhelpful_votes INTEGER NOT NULL DEFAULT 0 CHECK (unhelpful_votes >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS community_note_votes (
    note_id UUID NOT NULL REFERENCES community_notes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_helpful BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (note_id, user_id)   -- Un voto por usuario por nota
);

-- ========================================================================
-- Verificación final
-- ========================================================================
DO $$
DECLARE
    ext_ltree  BOOLEAN;
    ext_pgcrypto BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'ltree') INTO ext_ltree;
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') INTO ext_pgcrypto;

    IF NOT ext_ltree THEN
        RAISE EXCEPTION 'La extensión ltree no está instalada. Contacte al administrador de Cloud SQL.';
    END IF;
    IF NOT ext_pgcrypto THEN
        RAISE EXCEPTION 'La extensión pgcrypto no está instalada. Contacte al administrador de Cloud SQL.';
    END IF;

    RAISE NOTICE 'Esquema Forfunable aplicado correctamente. ltree=% pgcrypto=%', ext_ltree, ext_pgcrypto;
END $$;

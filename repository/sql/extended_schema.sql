-- ========================================================================
-- Forfunable · Migración V003: funciones extendidas
-- Guardados y colecciones, historial de versiones, sesiones activas,
-- eliminación de cuenta con periodo de gracia, acceso a comunidades privadas,
-- apelaciones y flairs.
--
-- Solo crea tablas NUEVAS (no altera las existentes) y es idempotente: el servidor
-- la ejecuta al arrancar (repository/extended_repo.go). Copia manual en
-- database/migrations/V003__extended_features.sql.
-- ========================================================================

-- Sesiones de inicio de sesión (una por dispositivo); los tokens llevan su id (sid)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_agent TEXT NOT NULL DEFAULT '',
    ip_address TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, last_seen_at DESC);

-- Colecciones de elementos guardados
CREATE TABLE IF NOT EXISTS saved_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_collection_name UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS saved_posts (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    collection_id UUID NULL REFERENCES saved_collections(id) ON DELETE SET NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id)
);

-- Historial de versiones: contenido anterior a cada edición
CREATE TABLE IF NOT EXISTS post_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    body_text TEXT NOT NULL,
    edited_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_post_revisions_post ON post_revisions(post_id, created_at);

-- Eliminación de cuenta con periodo de gracia (se anonimiza al vencer)
CREATE TABLE IF NOT EXISTS account_deletions (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL DEFAULT '',
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    purge_after TIMESTAMP WITH TIME ZONE NOT NULL,
    purged_at TIMESTAMP WITH TIME ZONE NULL
);

-- Solicitudes de acceso a comunidades privadas
CREATE TABLE IF NOT EXISTS community_access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL DEFAULT '',
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    decided_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    decision_note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at TIMESTAMP WITH TIME ZONE NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_pending
    ON community_access_requests(community_id, user_id) WHERE status = 'PENDING';

-- Apelaciones de sanciones y retiros de contenido
CREATE TABLE IF NOT EXISTS appeals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('COMMUNITY_BAN', 'CONTENT_REMOVAL')),
    reference_id TEXT NOT NULL,
    community_id UUID NULL REFERENCES communities(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
    resolution TEXT NOT NULL DEFAULT '',
    resolved_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_appeals_pending
    ON appeals(user_id, reference_id) WHERE status = 'PENDING';

-- Flairs (etiquetas) de comunidad y su asignación a publicaciones
CREATE TABLE IF NOT EXISTS community_flairs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    name VARCHAR(30) NOT NULL,
    color VARCHAR(16) NOT NULL DEFAULT 'secondary',
    description TEXT NOT NULL DEFAULT '',
    mod_only BOOLEAN NOT NULL DEFAULT FALSE,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_flair_name UNIQUE (community_id, name)
);

CREATE TABLE IF NOT EXISTS post_flairs (
    post_id UUID PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
    flair_id UUID NOT NULL REFERENCES community_flairs(id) ON DELETE CASCADE
);

-- ============ V004: estado de mensajes de chat ============
-- Entregado / leído / editado / eliminado para todos, por mensaje
CREATE TABLE IF NOT EXISTS chat_message_state (
    message_id UUID PRIMARY KEY REFERENCES chat_messages(id) ON DELETE CASCADE,
    delivered_at TIMESTAMP WITH TIME ZONE NULL,
    read_at TIMESTAMP WITH TIME ZONE NULL,
    edited_at TIMESTAMP WITH TIME ZONE NULL,
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- "Eliminar para mí": el mensaje deja de mostrarse solo a ese participante
CREATE TABLE IF NOT EXISTS chat_message_hidden (
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hidden_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_message_hidden_user ON chat_message_hidden(user_id);

-- ============ V005: respuestas y adjuntos del chat ============
-- "Responder": a qué mensaje contesta cada mensaje
CREATE TABLE IF NOT EXISTS chat_message_replies (
    message_id UUID PRIMARY KEY REFERENCES chat_messages(id) ON DELETE CASCADE,
    reply_to_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE
);

-- Archivos adjuntos guardados en la propia base de datos (máx. 15 MB cada uno)
CREATE TABLE IF NOT EXISTS chat_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    uploader_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(12) NOT NULL CHECK (kind IN ('image', 'gif', 'video', 'audio', 'file')),
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
    data BYTEA NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_message ON chat_attachments(message_id);

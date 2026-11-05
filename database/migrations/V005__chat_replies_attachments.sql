-- V005: respuestas a mensajes y adjuntos del chat (fotos, GIF, vídeo, audio y documentos).
-- Solo tablas nuevas; se aplica sola al arrancar (repository/sql/extended_schema.sql).

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

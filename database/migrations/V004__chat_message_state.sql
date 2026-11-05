-- V004: estado de los mensajes de chat (estilo WhatsApp) sin modificar chat_messages.
-- Solo tablas nuevas (el usuario de Cloud SQL no es propietario de las existentes).
-- Se aplica sola al arrancar (repository/sql/extended_schema.sql) y es idempotente.

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

package handlers

import (
	"forfunable/models"
	"forfunable/repository"
)

// Tipos de notificación. El frontend usa el prefijo para saber a dónde llevar al usuario:
// "post:<id>" abre la publicación, "c:<nombre>" la comunidad, "chat" los mensajes y "account" el perfil.
const (
	notifChat    = "chat"
	notifAccount = "account"
)

func notifPost(postID string) string { return "post:" + postID }

func notifCommunity(name string) string {
	// notifications.type es VARCHAR(50)
	if len("c:"+name) > 50 {
		return notifAccount
	}
	return "c:" + name
}

// notify crea una notificación sin bloquear la acción principal; nunca avisa a uno mismo.
func notify(repo repository.Repository, recipientID, actorID, title, message, notifType string) {
	if recipientID == "" || recipientID == actorID {
		return
	}
	_ = repo.CreateNotification(&models.Notification{
		UserID:  recipientID,
		Title:   title,
		Message: message,
		Type:    notifType,
	})
}

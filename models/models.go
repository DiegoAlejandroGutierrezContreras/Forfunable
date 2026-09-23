package models

import (
	"time"
)

// Constantes de Roles y Enumeraciones
const (
	RoleUser         = "USER"
	RoleCommunityMod = "COMMUNITY_MOD"
	RoleGlobalAdmin  = "GLOBAL_ADMIN"

	ModRoleOwner   = "OWNER"
	ModRoleLeadMod = "LEAD_MOD"
	ModRoleMod     = "MOD"

	ContentTypeText  = "TEXT"
	ContentTypeImage = "IMAGE"
	ContentTypeVideo = "VIDEO"
	ContentTypeLink  = "LINK"

	ChatPending  = "PENDING"
	ChatAccepted = "ACCEPTED"
	ChatRejected = "REJECTED"
	ChatBlocked  = "BLOCKED"

	ReportTargetPost        = "POST"
	ReportTargetComment     = "COMMENT"
	ReportTargetUser        = "USER"
	ReportTargetChatMessage = "CHAT_MESSAGE"

	ReportPending     = "PENDING"
	ReportUnderReview = "UNDER_REVIEW"
	ReportActioned    = "ACTIONED"
	ReportDismissed   = "DISMISSED"
)

// User representa la entidad central de usuario
type User struct {
	ID              string    `json:"id"`
	Username        string    `json:"username"`
	Email           string    `json:"email"`
	PasswordHash    string    `json:"-"`
	GlobalRole      string    `json:"global_role"`
	AvatarURL       string    `json:"avatar_url"`
	Bio             string    `json:"bio"`
	PresenceStatus  string    `json:"presence_status"`
	KarmaScore      int       `json:"karma_score"`
	IsAdultVerified bool      `json:"is_adult_verified"`
	IsActive        bool      `json:"is_active"`
	FreezeReason    string    `json:"freeze_reason,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// Community representa un foro temático
type Community struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	RulesText     string    `json:"rules_text"`
	IsPrivate     bool      `json:"is_private"`
	AgeRestricted bool      `json:"age_restricted"`
	CreatorID     string    `json:"creator_id"`
	CreatedAt     time.Time `json:"created_at"`
	MembersCount  int       `json:"members_count,omitempty"`
}

// CommunityMember representa la suscripción de un usuario a un foro
type CommunityMember struct {
	CommunityID string    `json:"community_id"`
	UserID      string    `json:"user_id"`
	JoinedAt    time.Time `json:"joined_at"`
}

// CommunityModerator representa el nombramiento de moderador local
type CommunityModerator struct {
	CommunityID string                 `json:"community_id"`
	UserID      string                 `json:"user_id"`
	ModRole     string                 `json:"mod_role"`
	Permissions map[string]interface{} `json:"permissions"`
	AssignedAt  time.Time              `json:"assigned_at"`
}

// Post representa una publicación
type Post struct {
	ID              string    `json:"id"`
	CommunityID     string    `json:"community_id"`
	AuthorID        string    `json:"author_id"`
	AuthorUsername  string    `json:"author_username,omitempty"`
	Title           string    `json:"title"`
	ContentType     string    `json:"content_type"`
	BodyText        string    `json:"body_text"`
	MediaURL        string    `json:"media_url"`
	UpvotesCount    int       `json:"upvotes_count"`
	DownvotesCount  int       `json:"downvotes_count"`
	CommentsCount   int       `json:"comments_count"`
	IsRemoved       bool      `json:"is_removed"`
	HotRankingScore float64   `json:"hot_ranking_score,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// Comment representa un comentario jerárquico estructurado con ltree
type Comment struct {
	ID              string    `json:"id"`
	PostID          string    `json:"post_id"`
	UserID          string    `json:"user_id"`
	AuthorUsername  string    `json:"author_username,omitempty"`
	ParentCommentID *string   `json:"parent_comment_id"`
	Content         string    `json:"content"`
	Path            string    `json:"path"`
	Depth           int       `json:"depth"`
	Score           int       `json:"score"`
	IsRemoved       bool      `json:"is_removed"`
	CreatedAt       time.Time `json:"created_at"`
}

// PostVote representa un voto físico individual sobre un post
type PostVote struct {
	UserID    string    `json:"user_id"`
	PostID    string    `json:"post_id"`
	VoteValue int       `json:"vote_value"`
	CreatedAt time.Time `json:"created_at"`
}

// CommentVote representa un voto físico individual sobre un comentario
type CommentVote struct {
	UserID    string    `json:"user_id"`
	CommentID string    `json:"comment_id"`
	VoteValue int       `json:"vote_value"`
	CreatedAt time.Time `json:"created_at"`
}

// ChatRequest representa una solicitud de conversación privada
type ChatRequest struct {
	ID             string    `json:"id"`
	SenderID       string    `json:"sender_id"`
	RecipientID    string    `json:"recipient_id"`
	InitialMessage string    `json:"initial_message"`
	Status         string    `json:"status"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// ChatConversation representa una sala de chat privada activa
type ChatConversation struct {
	ID        string    `json:"id"`
	User1ID   string    `json:"user1_id"`
	User2ID   string    `json:"user2_id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ChatMessage representa un mensaje dentro de una conversación
type ChatMessage struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversation_id"`
	SenderID       string    `json:"sender_id"`
	MessageText    string    `json:"message_text"`
	AttachmentURL  string    `json:"attachment_url,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

// UserBlock representa el bloqueo mutuo entre dos usuarios
type UserBlock struct {
	BlockerID string    `json:"blocker_id"`
	BlockedID string    `json:"blocked_id"`
	CreatedAt time.Time `json:"created_at"`
}

// CommunityBan representa una sanción o expulsión de comunidad
type CommunityBan struct {
	UserID      string     `json:"user_id"`
	CommunityID string     `json:"community_id"`
	Reason      string     `json:"reason"`
	ExpiresAt   *time.Time `json:"expires_at"`
	CreatedAt   time.Time  `json:"created_at"`
}

// Report representa una denuncia centralizada
type Report struct {
	ID              string    `json:"id"`
	ReporterID      string    `json:"reporter_id"`
	TargetID        string    `json:"target_id"`
	TargetType      string    `json:"target_type"`
	ReasonCode      string    `json:"reason_code"`
	Description     string    `json:"description"`
	Status          string    `json:"status"`
	ResolvedBy      *string   `json:"resolved_by"`
	ResolutionNotes string    `json:"resolution_notes,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
}

// ModerationLog representa una entrada inmutable de auditoría
type ModerationLog struct {
	ID          string    `json:"id"`
	ModeratorID string    `json:"moderator_id"`
	CommunityID *string   `json:"community_id"`
	ActionType  string    `json:"action_type"`
	TargetID    string    `json:"target_id"`
	Reason      string    `json:"reason"`
	CreatedAt   time.Time `json:"created_at"`
}

// NotificationSettings preferencias de avisos y alertas
type NotificationSettings struct {
	UserID                string `json:"user_id"`
	EmailOnReply          bool   `json:"email_on_reply"`
	EmailOnMention        bool   `json:"email_on_mention"`
	PushOnChatRequest     bool   `json:"push_on_chat_request"`
	PushOnCommunityUpdate bool   `json:"push_on_community_update"`
}

// Notification alerta para usuario
type Notification struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Title     string    `json:"title"`
	Message   string    `json:"message"`
	Type      string    `json:"type"`
	IsRead    bool      `json:"is_read"`
	CreatedAt time.Time `json:"created_at"`
}

// CommunityNote nota aclaratoria comunitaria
type CommunityNote struct {
	ID             string    `json:"id"`
	PostID         string    `json:"post_id"`
	AuthorID       string    `json:"author_id"`
	NoteText       string    `json:"note_text"`
	ProofURL       string    `json:"proof_url"`
	HelpfulVotes   int       `json:"helpful_votes"`
	UnhelpfulVotes int       `json:"unhelpful_votes"`
	CreatedAt      time.Time `json:"created_at"`
}

// CommunityNoteVote voto sobre utilidad de nota
type CommunityNoteVote struct {
	NoteID    string    `json:"note_id"`
	UserID    string    `json:"user_id"`
	IsHelpful bool      `json:"is_helpful"`
	CreatedAt time.Time `json:"created_at"`
}

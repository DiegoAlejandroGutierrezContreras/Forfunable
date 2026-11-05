package models

import "time"

// Modelos de las funciones extendidas (migración V003).

// UserSession es un inicio de sesión en un dispositivo; los JWT llevan su ID como "sid".
type UserSession struct {
	ID         string     `json:"id"`
	UserID     string     `json:"user_id"`
	UserAgent  string     `json:"user_agent"`
	IPAddress  string     `json:"ip_address"`
	CreatedAt  time.Time  `json:"created_at"`
	LastSeenAt time.Time  `json:"last_seen_at"`
	RevokedAt  *time.Time `json:"revoked_at,omitempty"`
	Current    bool       `json:"current"`
}

type SavedCollection struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	ItemsCount  int       `json:"items_count"`
	CreatedAt   time.Time `json:"created_at"`
}

// SavedPost es un elemento guardado con la publicación completa
type SavedPost struct {
	Post         *Post     `json:"post"`
	CollectionID *string   `json:"collection_id"`
	Note         string    `json:"note"`
	SavedAt      time.Time `json:"saved_at"`
}

type PostRevision struct {
	ID         string    `json:"id"`
	PostID     string    `json:"post_id"`
	BodyText   string    `json:"body_text"`
	EditedBy   string    `json:"edited_by,omitempty"`
	EditorName string    `json:"editor_username,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
	Current    bool      `json:"current"`
}

type AccountDeletion struct {
	UserID      string     `json:"user_id"`
	Reason      string     `json:"reason"`
	RequestedAt time.Time  `json:"requested_at"`
	PurgeAfter  time.Time  `json:"purge_after"`
	PurgedAt    *time.Time `json:"purged_at,omitempty"`
}

type AccessRequest struct {
	ID            string     `json:"id"`
	CommunityID   string     `json:"community_id"`
	CommunityName string     `json:"community_name,omitempty"`
	UserID        string     `json:"user_id"`
	Username      string     `json:"username,omitempty"`
	UserKarma     int        `json:"user_karma"`
	Message       string     `json:"message"`
	Status        string     `json:"status"`
	DecidedBy     *string    `json:"decided_by,omitempty"`
	DecisionNote  string     `json:"decision_note"`
	CreatedAt     time.Time  `json:"created_at"`
	DecidedAt     *time.Time `json:"decided_at,omitempty"`
}

type Appeal struct {
	ID            string     `json:"id"`
	UserID        string     `json:"user_id"`
	Username      string     `json:"username,omitempty"`
	Kind          string     `json:"kind"` // COMMUNITY_BAN | CONTENT_REMOVAL
	ReferenceID   string     `json:"reference_id"`
	CommunityID   *string    `json:"community_id,omitempty"`
	CommunityName string     `json:"community_name,omitempty"`
	Message       string     `json:"message"`
	Status        string     `json:"status"` // PENDING | ACCEPTED | REJECTED
	Resolution    string     `json:"resolution"`
	ResolvedBy    *string    `json:"resolved_by,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	ResolvedAt    *time.Time `json:"resolved_at,omitempty"`
}

// Sanction agrupa lo que un usuario puede apelar: sanciones de comunidad y retiros de contenido
type Sanction struct {
	Kind          string     `json:"kind"`
	ReferenceID   string     `json:"reference_id"`
	CommunityID   *string    `json:"community_id,omitempty"`
	CommunityName string     `json:"community_name,omitempty"`
	Reason        string     `json:"reason"`
	CreatedAt     time.Time  `json:"created_at"`
	ExpiresAt     *time.Time `json:"expires_at,omitempty"`
	Active        bool       `json:"active"`
	Appeal        *Appeal    `json:"appeal,omitempty"`
}

type Flair struct {
	ID          string    `json:"id"`
	CommunityID string    `json:"community_id"`
	Name        string    `json:"name"`
	Color       string    `json:"color"`
	Description string    `json:"description"`
	ModOnly     bool      `json:"mod_only"`
	Position    int       `json:"position"`
	PostsCount  int       `json:"posts_count"`
	CreatedAt   time.Time `json:"created_at"`
}

// DTOs
type SavePostRequest struct {
	CollectionID *string `json:"collection_id"`
	Note         string  `json:"note"`
}

type CollectionRequest struct {
	Name        string `json:"name" binding:"required,min=1,max=60"`
	Description string `json:"description"`
}

type DeleteAccountRequest struct {
	Password        string `json:"password" binding:"required"`
	ConfirmUsername string `json:"confirm_username" binding:"required"`
	Reason          string `json:"reason"`
}

type AccessRequestCreate struct {
	Message string `json:"message"`
}

type AccessDecisionRequest struct {
	Action string `json:"action" binding:"required,oneof=APPROVE REJECT"`
	Note   string `json:"note"`
}

type AppealRequest struct {
	Kind        string `json:"kind" binding:"required,oneof=COMMUNITY_BAN CONTENT_REMOVAL"`
	ReferenceID string `json:"reference_id" binding:"required"`
	Message     string `json:"message" binding:"required,min=10,max=2000"`
}

type AppealDecisionRequest struct {
	Decision   string `json:"decision" binding:"required,oneof=ACCEPT REJECT"`
	Resolution string `json:"resolution" binding:"required,min=5"`
}

type TransferOwnershipRequest struct {
	NewOwner    string `json:"new_owner" binding:"required"`
	ConfirmName string `json:"confirm_name" binding:"required"`
}

type FlairRequest struct {
	Name        string `json:"name" binding:"required,min=1,max=30"`
	Color       string `json:"color"`
	Description string `json:"description"`
	ModOnly     bool   `json:"mod_only"`
	Position    int    `json:"position"`
}

type SetPostFlairRequest struct {
	FlairID string `json:"flair_id"`
}

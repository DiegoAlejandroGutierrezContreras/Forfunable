package models

// DTOs de Autenticación y Usuario
type RegisterRequest struct {
	Username       string `json:"username" binding:"required,min=3,max=30"`
	Email          string `json:"email" binding:"required,email"`
	Password       string `json:"password" binding:"required,min=8"`
	RecaptchaToken string `json:"recaptcha_token"`
}

type LoginRequest struct {
	Email          string `json:"email" binding:"required,email"`
	Password       string `json:"password" binding:"required"`
	RecaptchaToken string `json:"recaptcha_token"`
}

type AuthResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int64  `json:"expires_in"`
	User         User   `json:"user"`
}

type RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type UpdateProfileRequest struct {
	AvatarURL string `json:"avatar_url"`
	Bio       string `json:"bio"`
}

type UpdateStatusRequest struct {
	PresenceStatus string `json:"presence_status" binding:"required,oneof=ONLINE BUSY OFFLINE"`
}

type VerifyAgeRequest struct {
	IDPAssertionToken string `json:"idp_assertion_token" binding:"required"`
}

type VerifyAgeResponse struct {
	Verified bool   `json:"verified"`
	Message  string `json:"message"`
}

type KarmaDetailResponse struct {
	UserID       string `json:"user_id"`
	TotalKarma   int    `json:"total_karma"`
	PostKarma    int    `json:"post_karma"`
	CommentKarma int    `json:"comment_karma"`
	RankTitle    string `json:"rank_title"`
}

// DTOs de Comunidades
type CreateCommunityRequest struct {
	Name        string `json:"name" binding:"required,min=3,max=50"`
	Description string `json:"description"`
}

type CommunityDetailResponse struct {
	Community  Community            `json:"community"`
	Moderators []CommunityModerator `json:"moderators"`
	IsMember   bool                 `json:"is_member"`
}

// DTOs de Publicaciones
type CreatePostRequest struct {
	CommunityID string `json:"community_id" binding:"required"`
	Title       string `json:"title" binding:"required,min=3,max=300"`
	ContentType string `json:"content_type" binding:"required,oneof=TEXT IMAGE VIDEO LINK"`
	BodyText    string `json:"body_text"`
	MediaURL    string `json:"media_url"`
}

type UpdatePostRequest struct {
	BodyText string `json:"body_text" binding:"required"`
}

type MediaUploadURLRequest struct {
	Filename string `json:"filename" binding:"required"`
	MimeType string `json:"mime_type" binding:"required"`
	FileSize int64  `json:"file_size" binding:"required,gt=0"`
}

type MediaUploadURLResponse struct {
	UploadURL string `json:"upload_url"`
	FileKey   string `json:"file_key"`
	ExpiresAt int64  `json:"expires_at"`
}

// DTOs de Comentarios
type CreateCommentRequest struct {
	PostID          string  `json:"post_id" binding:"required"`
	ParentCommentID *string `json:"parent_comment_id"`
	Content         string  `json:"content" binding:"required,min=1"`
}

type UpdateCommentRequest struct {
	Content string `json:"content" binding:"required,min=1"`
}

// DTOs de Votación
type VoteRequest struct {
	VoteValue int `json:"vote_value"` // 1, -1, o 0 para neutralizar
}

type VoteResponse struct {
	NewScore    int `json:"new_score"`
	Upvotes     int `json:"upvotes"`
	Downvotes   int `json:"downvotes"`
	CurrentVote int `json:"current_vote"`
}

// DTOs de Mensajería y Social
type CreateChatRequest struct {
	RecipientUserID string `json:"recipient_user_id" binding:"required"`
	InitialMessage  string `json:"initial_message" binding:"required"`
}

type UpdateChatActionRequest struct {
	Action string `json:"action" binding:"required,oneof=ACCEPT REJECT BLOCK"`
}

type SendChatMessageRequest struct {
	MessageText   string `json:"message_text" binding:"required"`
	AttachmentURL string `json:"attachment_url"`
}

type BlockUserRequest struct {
	TargetUserID string `json:"target_user_id" binding:"required"`
}

// DTOs de Notificaciones
type UpdateNotificationSettingsRequest struct {
	EmailOnReply          bool `json:"email_on_reply"`
	EmailOnMention        bool `json:"email_on_mention"`
	PushOnChatRequest     bool `json:"push_on_chat_request"`
	PushOnCommunityUpdate bool `json:"push_on_community_update"`
}

// DTOs de Denuncias y Notas
type CreateReportRequest struct {
	TargetID    string `json:"target_id" binding:"required"`
	TargetType  string `json:"target_type" binding:"required,oneof=POST COMMENT USER CHAT_MESSAGE"`
	ReasonCode  string `json:"reason_code" binding:"required"`
	Description string `json:"description"`
}

type CreateCommunityNoteRequest struct {
	PostID   string `json:"post_id" binding:"required"`
	NoteText string `json:"note_text" binding:"required,min=5"`
	ProofURL string `json:"proof_url"`
}

type VoteCommunityNoteRequest struct {
	IsHelpful bool `json:"is_helpful"`
}

// DTOs de Administración y Moderación
type AssignModeratorRequest struct {
	UserID      string                 `json:"user_id" binding:"required"`
	Role        string                 `json:"role" binding:"required,oneof=OWNER LEAD_MOD MOD"`
	Permissions map[string]interface{} `json:"permissions"`
}

type UpdateCommunitySettingsRequest struct {
	RulesText     string `json:"rules_text"`
	IsPrivate     bool   `json:"is_private"`
	AgeRestricted bool   `json:"age_restricted"`
}

type ResolveReportRequest struct {
	Status         string `json:"status" binding:"required,oneof=PENDING UNDER_REVIEW ACTIONED DISMISSED"`
	ModeratorNotes string `json:"moderator_notes"`
}

type BanUserRequest struct {
	UserID       string `json:"user_id" binding:"required"`
	CommunityID  string `json:"community_id" binding:"required"`
	Reason       string `json:"reason" binding:"required"`
	DurationDays int    `json:"duration_days"` // 0 para permanente
}

type UnbanUserRequest struct {
	UserID      string `json:"user_id" binding:"required"`
	CommunityID string `json:"community_id" binding:"required"`
	Reason      string `json:"reason"`
}

type UpdateUserRoleRequest struct {
	GlobalRole string `json:"global_role" binding:"required,oneof=USER COMMUNITY_MOD GLOBAL_ADMIN"`
}

type UpdateUserStatusRequest struct {
	IsActive     bool   `json:"is_active"`
	FreezeReason string `json:"freeze_reason"`
}

type ReindexRequest struct {
	CommunityID string `json:"community_id"`
}

// Mensaje estándar de éxito o error
type StandardResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

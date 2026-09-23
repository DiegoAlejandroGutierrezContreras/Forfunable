package repository

import (
	"forfunable/models"
)

type Repository interface {
	// Usuarios
	CreateUser(user *models.User) error
	GetUserByID(id string) (*models.User, error)
	GetUserByEmail(email string) (*models.User, error)
	GetUserByUsername(username string) (*models.User, error)
	UpdateUserProfile(id, avatarURL, bio string) (*models.User, error)
	UpdateUserStatus(id, status string) error
	VerifyUserAge(id string) error
	ListUsers(search, role, status string, page, limit int) ([]*models.User, int, error)
	UpdateUserRole(id, role string) error
	UpdateUserGlobalStatus(id string, isActive bool, freezeReason string) error

	// Comunidades
	CreateCommunity(comm *models.Community) error
	GetCommunityByID(id string) (*models.Community, error)
	GetCommunityByName(name string) (*models.Community, error)
	ListCommunities(search, sort string, page, limit int) ([]*models.Community, int, error)
	JoinCommunity(commID, userID string) error
	LeaveCommunity(commID, userID string) error
	IsCommunityMember(commID, userID string) (bool, error)
	AssignCommunityModerator(mod *models.CommunityModerator) error
	GetCommunityModerators(commID string) ([]models.CommunityModerator, error)
	GetCommunityModerator(commID, userID string) (*models.CommunityModerator, error)
	UpdateCommunitySettings(commID, rulesText string, isPrivate, ageRestricted bool) error

	// Publicaciones
	CreatePost(post *models.Post) error
	GetPostByID(id string) (*models.Post, error)
	ListPosts(communityID, sort string, page, limit int) ([]*models.Post, int, error)
	UpdatePost(id, bodyText string) (*models.Post, error)
	DeletePost(id string) error
	RemovePostByAdmin(id string) error
	GetRecommendedFeed(cursor string, limit int) ([]*models.Post, string, error)

	// Comentarios (ltree)
	CreateComment(comment *models.Comment) error
	GetCommentByID(id string) (*models.Comment, error)
	ListCommentsByPost(postID, sortBy string, maxDepth int) ([]*models.Comment, error)
	UpdateComment(id, content string) (*models.Comment, error)
	DeleteComment(id string) error

	// Votación y Karma
	VotePost(userID, postID string, voteValue int) (*models.VoteResponse, error)
	VoteComment(userID, commentID string, voteValue int) (*models.VoteResponse, error)
	GetUserKarmaDetail(userID string) (*models.KarmaDetailResponse, error)

	// Chat y Mensajería Privada
	CreateChatRequest(req *models.ChatRequest) error
	GetChatRequestByID(id string) (*models.ChatRequest, error)
	UpdateChatRequestStatus(id, status string) error
	ListConversations(userID string, page, limit int) ([]*models.ChatConversation, error)
	GetConversationByID(id string) (*models.ChatConversation, error)
	GetOrCreateConversation(user1ID, user2ID string) (*models.ChatConversation, error)
	ListMessages(convID string, beforeTimestamp string, limit int) ([]*models.ChatMessage, error)
	CreateChatMessage(msg *models.ChatMessage) error
	BlockUser(blockerID, blockedID string) error
	IsUserBlocked(userA, userB string) (bool, error)

	// Notificaciones
	ListNotifications(userID string, page, limit int) ([]*models.Notification, error)
	MarkNotificationRead(id, userID string) error
	GetNotificationSettings(userID string) (*models.NotificationSettings, error)
	UpdateNotificationSettings(settings *models.NotificationSettings) error
	CreateNotification(notif *models.Notification) error

	// Denuncias, Moderación y Notas
	CreateReport(report *models.Report) error
	ListReports(communityID, status string, page, limit int) ([]*models.Report, error)
	ResolveReport(id, status, notes, resolvedBy string) error
	BanUser(ban *models.CommunityBan) error
	UnbanUser(userID, communityID, reason string) error
	IsUserBannedFromCommunity(userID, communityID string) (bool, error)
	CreateModerationLog(log *models.ModerationLog) error
	ListModerationLogs(moderatorID, actionType, fromDate, toDate string) ([]*models.ModerationLog, error)
	CreateCommunityNote(note *models.CommunityNote) error
	VoteCommunityNote(noteID, userID string, isHelpful bool) error
	GetAnalyticsMetrics(timeframe string) (map[string]interface{}, error)
	GetSecurityAccountGroups(riskThreshold float64) ([]map[string]interface{}, error)
	SearchPredictive(query string) ([]map[string]interface{}, error)
}

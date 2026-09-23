package repository

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"forfunable/models"
	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

type PostgresRepository struct {
	db *sql.DB
}

func NewPostgresRepository(databaseURL string) (*PostgresRepository, error) {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("error al abrir conexión postgres: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("error en ping a postgres: %w", err)
	}

	return &PostgresRepository{db: db}, nil
}

// Close cierra el pool de conexiones
func (p *PostgresRepository) Close() error {
	return p.db.Close()
}

// --- Usuarios ---
func (p *PostgresRepository) CreateUser(u *models.User) error {
	if u.ID == "" {
		u.ID = uuid.New().String()
	}
	query := `
		INSERT INTO users (id, username, email, password_hash, global_role, avatar_url, bio, karma_score, is_adult_verified, is_active)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING created_at`
	return p.db.QueryRow(query, u.ID, u.Username, u.Email, u.PasswordHash, u.GlobalRole, u.AvatarURL, u.Bio, u.KarmaScore, u.IsAdultVerified, u.IsActive).Scan(&u.CreatedAt)
}

func (p *PostgresRepository) GetUserByID(id string) (*models.User, error) {
	u := &models.User{}
	query := `SELECT id, username, email, password_hash, global_role, COALESCE(avatar_url, ''), COALESCE(bio, ''), presence_status, karma_score, is_adult_verified, is_active, COALESCE(freeze_reason, ''), created_at FROM users WHERE id = $1`
	err := p.db.QueryRow(query, id).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.GlobalRole, &u.AvatarURL, &u.Bio, &u.PresenceStatus, &u.KarmaScore, &u.IsAdultVerified, &u.IsActive, &u.FreezeReason, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, errors.New("usuario no encontrado")
	}
	return u, err
}

func (p *PostgresRepository) GetUserByEmail(email string) (*models.User, error) {
	u := &models.User{}
	query := `SELECT id, username, email, password_hash, global_role, COALESCE(avatar_url, ''), COALESCE(bio, ''), presence_status, karma_score, is_adult_verified, is_active, COALESCE(freeze_reason, ''), created_at FROM users WHERE email = $1`
	err := p.db.QueryRow(query, email).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.GlobalRole, &u.AvatarURL, &u.Bio, &u.PresenceStatus, &u.KarmaScore, &u.IsAdultVerified, &u.IsActive, &u.FreezeReason, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, errors.New("usuario no encontrado")
	}
	return u, err
}

func (p *PostgresRepository) GetUserByUsername(username string) (*models.User, error) {
	u := &models.User{}
	query := `SELECT id, username, email, password_hash, global_role, COALESCE(avatar_url, ''), COALESCE(bio, ''), presence_status, karma_score, is_adult_verified, is_active, COALESCE(freeze_reason, ''), created_at FROM users WHERE username = $1`
	err := p.db.QueryRow(query, username).Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.GlobalRole, &u.AvatarURL, &u.Bio, &u.PresenceStatus, &u.KarmaScore, &u.IsAdultVerified, &u.IsActive, &u.FreezeReason, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, errors.New("usuario no encontrado")
	}
	return u, err
}

func (p *PostgresRepository) UpdateUserProfile(id, avatarURL, bio string) (*models.User, error) {
	query := `UPDATE users SET avatar_url = COALESCE(NULLIF($2, ''), avatar_url), bio = COALESCE(NULLIF($3, ''), bio) WHERE id = $1 RETURNING id, username, email, global_role, avatar_url, bio, presence_status, karma_score, is_adult_verified, is_active, created_at`
	u := &models.User{}
	err := p.db.QueryRow(query, id, avatarURL, bio).Scan(&u.ID, &u.Username, &u.Email, &u.GlobalRole, &u.AvatarURL, &u.Bio, &u.PresenceStatus, &u.KarmaScore, &u.IsAdultVerified, &u.IsActive, &u.CreatedAt)
	return u, err
}

func (p *PostgresRepository) UpdateUserStatus(id, status string) error {
	_, err := p.db.Exec(`UPDATE users SET presence_status = $2 WHERE id = $1`, id, status)
	return err
}

func (p *PostgresRepository) VerifyUserAge(id string) error {
	_, err := p.db.Exec(`UPDATE users SET is_adult_verified = TRUE WHERE id = $1`, id)
	return err
}

func (p *PostgresRepository) ListUsers(search, role, status string, page, limit int) ([]*models.User, int, error) {
	offset := (page - 1) * limit
	query := `SELECT id, username, email, global_role, COALESCE(avatar_url, ''), COALESCE(bio, ''), presence_status, karma_score, is_adult_verified, is_active, created_at FROM users WHERE ($1 = '' OR username ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%') AND ($2 = '' OR global_role::text = $2) ORDER BY created_at DESC LIMIT $3 OFFSET $4`
	rows, err := p.db.Query(query, search, role, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		u := &models.User{}
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.GlobalRole, &u.AvatarURL, &u.Bio, &u.PresenceStatus, &u.KarmaScore, &u.IsAdultVerified, &u.IsActive, &u.CreatedAt); err != nil {
			return nil, 0, err
		}
		users = append(users, u)
	}

	var count int
	_ = p.db.QueryRow(`SELECT count(*) FROM users WHERE ($1 = '' OR username ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%') AND ($2 = '' OR global_role::text = $2)`, search, role).Scan(&count)

	return users, count, nil
}

func (p *PostgresRepository) UpdateUserRole(id, role string) error {
	_, err := p.db.Exec(`UPDATE users SET global_role = $2::user_role_enum WHERE id = $1`, id, role)
	return err
}

func (p *PostgresRepository) UpdateUserGlobalStatus(id string, isActive bool, freezeReason string) error {
	_, err := p.db.Exec(`UPDATE users SET is_active = $2, freeze_reason = $3 WHERE id = $1`, id, isActive, freezeReason)
	return err
}

// --- Comunidades ---
func (p *PostgresRepository) CreateCommunity(c *models.Community) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	query := `INSERT INTO communities (id, name, description, creator_id) VALUES ($1, $2, $3, $4) RETURNING created_at`
	return p.db.QueryRow(query, c.ID, c.Name, c.Description, c.CreatorID).Scan(&c.CreatedAt)
}

func (p *PostgresRepository) GetCommunityByID(id string) (*models.Community, error) {
	c := &models.Community{}
	query := `SELECT id, name, COALESCE(description, ''), COALESCE(rules_text, ''), is_private, age_restricted, creator_id, created_at FROM communities WHERE id = $1`
	err := p.db.QueryRow(query, id).Scan(&c.ID, &c.Name, &c.Description, &c.RulesText, &c.IsPrivate, &c.AgeRestricted, &c.CreatorID, &c.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, errors.New("comunidad no encontrada")
	}
	return c, err
}

func (p *PostgresRepository) GetCommunityByName(name string) (*models.Community, error) {
	c := &models.Community{}
	query := `SELECT id, name, COALESCE(description, ''), COALESCE(rules_text, ''), is_private, age_restricted, creator_id, created_at FROM communities WHERE name = $1`
	err := p.db.QueryRow(query, name).Scan(&c.ID, &c.Name, &c.Description, &c.RulesText, &c.IsPrivate, &c.AgeRestricted, &c.CreatorID, &c.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, errors.New("comunidad no encontrada")
	}
	return c, err
}

func (p *PostgresRepository) ListCommunities(search, sort string, page, limit int) ([]*models.Community, int, error) {
	offset := (page - 1) * limit
	query := `SELECT id, name, COALESCE(description, ''), COALESCE(rules_text, ''), is_private, age_restricted, creator_id, created_at FROM communities WHERE ($1 = '' OR name ILIKE '%' || $1 || '%') ORDER BY created_at DESC LIMIT $2 OFFSET $3`
	rows, err := p.db.Query(query, search, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var comms []*models.Community
	for rows.Next() {
		c := &models.Community{}
		if err := rows.Scan(&c.ID, &c.Name, &c.Description, &c.RulesText, &c.IsPrivate, &c.AgeRestricted, &c.CreatorID, &c.CreatedAt); err != nil {
			return nil, 0, err
		}
		comms = append(comms, c)
	}

	var count int
	_ = p.db.QueryRow(`SELECT count(*) FROM communities WHERE ($1 = '' OR name ILIKE '%' || $1 || '%')`, search).Scan(&count)
	return comms, count, nil
}

func (p *PostgresRepository) JoinCommunity(commID, userID string) error {
	_, err := p.db.Exec(`INSERT INTO community_members (community_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, commID, userID)
	return err
}

func (p *PostgresRepository) LeaveCommunity(commID, userID string) error {
	_, err := p.db.Exec(`DELETE FROM community_members WHERE community_id = $1 AND user_id = $2`, commID, userID)
	return err
}

func (p *PostgresRepository) IsCommunityMember(commID, userID string) (bool, error) {
	var count int
	err := p.db.QueryRow(`SELECT count(*) FROM community_members WHERE community_id = $1 AND user_id = $2`, commID, userID).Scan(&count)
	return count > 0, err
}

func (p *PostgresRepository) AssignCommunityModerator(mod *models.CommunityModerator) error {
	query := `INSERT INTO community_moderators (community_id, user_id, mod_role) VALUES ($1, $2, $3::mod_role_enum) ON CONFLICT (community_id, user_id) DO UPDATE SET mod_role = EXCLUDED.mod_role`
	_, err := p.db.Exec(query, mod.CommunityID, mod.UserID, mod.ModRole)
	return err
}

func (p *PostgresRepository) GetCommunityModerators(commID string) ([]models.CommunityModerator, error) {
	rows, err := p.db.Query(`SELECT community_id, user_id, mod_role, assigned_at FROM community_moderators WHERE community_id = $1`, commID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var mods []models.CommunityModerator
	for rows.Next() {
		m := models.CommunityModerator{}
		if err := rows.Scan(&m.CommunityID, &m.UserID, &m.ModRole, &m.AssignedAt); err != nil {
			return nil, err
		}
		mods = append(mods, m)
	}
	return mods, nil
}

func (p *PostgresRepository) GetCommunityModerator(commID, userID string) (*models.CommunityModerator, error) {
	m := &models.CommunityModerator{}
	err := p.db.QueryRow(`SELECT community_id, user_id, mod_role, assigned_at FROM community_moderators WHERE community_id = $1 AND user_id = $2`, commID, userID).Scan(&m.CommunityID, &m.UserID, &m.ModRole, &m.AssignedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return m, err
}

func (p *PostgresRepository) UpdateCommunitySettings(commID, rulesText string, isPrivate, ageRestricted bool) error {
	_, err := p.db.Exec(`UPDATE communities SET rules_text = COALESCE(NULLIF($2, ''), rules_text), is_private = $3, age_restricted = $4 WHERE id = $1`, commID, rulesText, isPrivate, ageRestricted)
	return err
}

// --- Publicaciones ---
func (p *PostgresRepository) CreatePost(post *models.Post) error {
	if post.ID == "" {
		post.ID = uuid.New().String()
	}
	query := `INSERT INTO posts (id, community_id, author_id, title, content_type, body_text, media_url) VALUES ($1, $2, $3, $4, $5::content_type_enum, $6, $7) RETURNING created_at`
	return p.db.QueryRow(query, post.ID, post.CommunityID, post.AuthorID, post.Title, post.ContentType, post.BodyText, post.MediaURL).Scan(&post.CreatedAt)
}

func (p *PostgresRepository) GetPostByID(id string) (*models.Post, error) {
	post := &models.Post{}
	query := `SELECT p.id, p.community_id, p.author_id, u.username, p.title, p.content_type, COALESCE(p.body_text, ''), COALESCE(p.media_url, ''), p.upvotes_count, p.downvotes_count, p.comments_count, p.is_removed, p.created_at FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = $1 AND p.is_removed = FALSE`
	err := p.db.QueryRow(query, id).Scan(&post.ID, &post.CommunityID, &post.AuthorID, &post.AuthorUsername, &post.Title, &post.ContentType, &post.BodyText, &post.MediaURL, &post.UpvotesCount, &post.DownvotesCount, &post.CommentsCount, &post.IsRemoved, &post.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, errors.New("publicación no encontrada")
	}
	return post, err
}

func (p *PostgresRepository) ListPosts(communityID, sort string, page, limit int) ([]*models.Post, int, error) {
	offset := (page - 1) * limit
	query := `SELECT p.id, p.community_id, p.author_id, u.username, p.title, p.content_type, COALESCE(p.body_text, ''), COALESCE(p.media_url, ''), p.upvotes_count, p.downvotes_count, p.comments_count, p.is_removed, p.created_at FROM posts p JOIN users u ON p.author_id = u.id WHERE p.is_removed = FALSE AND ($1 = '' OR p.community_id = $1::uuid) ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`
	rows, err := p.db.Query(query, communityID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var posts []*models.Post
	for rows.Next() {
		post := &models.Post{}
		if err := rows.Scan(&post.ID, &post.CommunityID, &post.AuthorID, &post.AuthorUsername, &post.Title, &post.ContentType, &post.BodyText, &post.MediaURL, &post.UpvotesCount, &post.DownvotesCount, &post.CommentsCount, &post.IsRemoved, &post.CreatedAt); err != nil {
			return nil, 0, err
		}
		posts = append(posts, post)
	}

	var count int
	_ = p.db.QueryRow(`SELECT count(*) FROM posts WHERE is_removed = FALSE AND ($1 = '' OR community_id = $1::uuid)`, communityID).Scan(&count)
	return posts, count, nil
}

func (p *PostgresRepository) UpdatePost(id, bodyText string) (*models.Post, error) {
	query := `UPDATE posts SET body_text = $2 WHERE id = $1 AND is_removed = FALSE RETURNING id, community_id, author_id, title, content_type, body_text, media_url, upvotes_count, downvotes_count, comments_count, is_removed, created_at`
	post := &models.Post{}
	err := p.db.QueryRow(query, id, bodyText).Scan(&post.ID, &post.CommunityID, &post.AuthorID, &post.Title, &post.ContentType, &post.BodyText, &post.MediaURL, &post.UpvotesCount, &post.DownvotesCount, &post.CommentsCount, &post.IsRemoved, &post.CreatedAt)
	return post, err
}

func (p *PostgresRepository) DeletePost(id string) error {
	_, err := p.db.Exec(`UPDATE posts SET is_removed = TRUE WHERE id = $1`, id)
	return err
}

func (p *PostgresRepository) RemovePostByAdmin(id string) error {
	return p.DeletePost(id)
}

func (p *PostgresRepository) GetRecommendedFeed(cursor string, limit int) ([]*models.Post, string, error) {
	posts, _, err := p.ListPosts("", "new", 1, limit)
	return posts, "", err
}

// --- Comentarios con ltree ---
func (p *PostgresRepository) CreateComment(comment *models.Comment) error {
	if comment.ID == "" {
		comment.ID = uuid.New().String()
	}
	postTag := strings.ReplaceAll(comment.PostID, "-", "_")
	commentTag := strings.ReplaceAll(comment.ID, "-", "_")

	if comment.ParentCommentID == nil || *comment.ParentCommentID == "" {
		comment.Depth = 0
		comment.Path = fmt.Sprintf("%s.%s", postTag, commentTag)
	} else {
		var parentPath string
		var parentDepth int
		err := p.db.QueryRow(`SELECT path, depth FROM comments WHERE id = $1`, *comment.ParentCommentID).Scan(&parentPath, &parentDepth)
		if err != nil {
			return errors.New("comentario padre no encontrado")
		}
		comment.Depth = parentDepth + 1
		comment.Path = fmt.Sprintf("%s.%s", parentPath, commentTag)
	}

	query := `INSERT INTO comments (id, post_id, user_id, parent_comment_id, content, path, depth) VALUES ($1, $2, $3, $4, $5, text2ltree($6), $7) RETURNING created_at`
	err := p.db.QueryRow(query, comment.ID, comment.PostID, comment.UserID, comment.ParentCommentID, comment.Content, comment.Path, comment.Depth).Scan(&comment.CreatedAt)
	if err == nil {
		_, _ = p.db.Exec(`UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1`, comment.PostID)
	}
	return err
}

func (p *PostgresRepository) GetCommentByID(id string) (*models.Comment, error) {
	c := &models.Comment{}
	query := `SELECT id, post_id, user_id, parent_comment_id, content, ltree2text(path), depth, score, is_removed, created_at FROM comments WHERE id = $1`
	err := p.db.QueryRow(query, id).Scan(&c.ID, &c.PostID, &c.UserID, &c.ParentCommentID, &c.Content, &c.Path, &c.Depth, &c.Score, &c.IsRemoved, &c.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, errors.New("comentario no encontrado")
	}
	return c, err
}

// ListCommentsByPost utiliza el índice GiST y ltree para recuperar comentarios en una sola consulta plana
func (p *PostgresRepository) ListCommentsByPost(postID, sortBy string, maxDepth int) ([]*models.Comment, error) {
	query := `SELECT c.id, c.post_id, c.user_id, u.username, c.parent_comment_id, c.content, ltree2text(c.path), c.depth, c.score, c.is_removed, c.created_at FROM comments c JOIN users u ON c.user_id = u.id WHERE c.post_id = $1 AND ($2 <= 0 OR c.depth <= $2) ORDER BY c.path ASC`
	rows, err := p.db.Query(query, postID, maxDepth)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []*models.Comment
	for rows.Next() {
		c := &models.Comment{}
		if err := rows.Scan(&c.ID, &c.PostID, &c.UserID, &c.AuthorUsername, &c.ParentCommentID, &c.Content, &c.Path, &c.Depth, &c.Score, &c.IsRemoved, &c.CreatedAt); err != nil {
			return nil, err
		}
		comments = append(comments, c)
	}
	return comments, nil
}

func (p *PostgresRepository) UpdateComment(id, content string) (*models.Comment, error) {
	c := &models.Comment{}
	query := `UPDATE comments SET content = $2 WHERE id = $1 AND is_removed = FALSE RETURNING id, post_id, user_id, parent_comment_id, content, ltree2text(path), depth, score, is_removed, created_at`
	err := p.db.QueryRow(query, id, content).Scan(&c.ID, &c.PostID, &c.UserID, &c.ParentCommentID, &c.Content, &c.Path, &c.Depth, &c.Score, &c.IsRemoved, &c.CreatedAt)
	return c, err
}

func (p *PostgresRepository) DeleteComment(id string) error {
	_, err := p.db.Exec(`UPDATE comments SET content = '[comentario eliminado]', is_removed = TRUE WHERE id = $1`, id)
	return err
}

// --- Votos ---
func (p *PostgresRepository) VotePost(userID, postID string, voteValue int) (*models.VoteResponse, error) {
	tx, err := p.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if voteValue == 0 {
		_, _ = tx.Exec(`DELETE FROM post_votes WHERE user_id = $1 AND post_id = $2`, userID, postID)
	} else {
		_, err = tx.Exec(`INSERT INTO post_votes (user_id, post_id, vote_value) VALUES ($1, $2, $3) ON CONFLICT (user_id, post_id) DO UPDATE SET vote_value = EXCLUDED.vote_value`, userID, postID, voteValue)
		if err != nil {
			return nil, err
		}
	}

	var upvotes, downvotes int
	_ = tx.QueryRow(`SELECT count(*) FILTER (WHERE vote_value = 1), count(*) FILTER (WHERE vote_value = -1) FROM post_votes WHERE post_id = $1`, postID).Scan(&upvotes, &downvotes)
	_, _ = tx.Exec(`UPDATE posts SET upvotes_count = $1, downvotes_count = $2 WHERE id = $3`, upvotes, downvotes, postID)

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &models.VoteResponse{
		NewScore:    upvotes - downvotes,
		Upvotes:     upvotes,
		Downvotes:   downvotes,
		CurrentVote: voteValue,
	}, nil
}

func (p *PostgresRepository) VoteComment(userID, commentID string, voteValue int) (*models.VoteResponse, error) {
	tx, err := p.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if voteValue == 0 {
		_, _ = tx.Exec(`DELETE FROM comment_votes WHERE user_id = $1 AND comment_id = $2`, userID, commentID)
	} else {
		_, err = tx.Exec(`INSERT INTO comment_votes (user_id, comment_id, vote_value) VALUES ($1, $2, $3) ON CONFLICT (user_id, comment_id) DO UPDATE SET vote_value = EXCLUDED.vote_value`, userID, commentID, voteValue)
		if err != nil {
			return nil, err
		}
	}

	var score int
	_ = tx.QueryRow(`SELECT COALESCE(SUM(vote_value), 0) FROM comment_votes WHERE comment_id = $1`, commentID).Scan(&score)
	_, _ = tx.Exec(`UPDATE comments SET score = $1 WHERE id = $2`, score, commentID)

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &models.VoteResponse{
		NewScore:    score,
		CurrentVote: voteValue,
	}, nil
}

func (p *PostgresRepository) GetUserKarmaDetail(userID string) (*models.KarmaDetailResponse, error) {
	u, err := p.GetUserByID(userID)
	if err != nil {
		return nil, err
	}
	return &models.KarmaDetailResponse{
		UserID:     userID,
		TotalKarma: u.KarmaScore,
		RankTitle:  "Colaborador Activo",
	}, nil
}

// Fallback stubs para operaciones de chats, notas y reportes en Postgres
func (p *PostgresRepository) CreateChatRequest(req *models.ChatRequest) error {
	if req.ID == "" {
		req.ID = uuid.New().String()
	}
	_, err := p.db.Exec(`INSERT INTO chat_requests (id, sender_id, recipient_id, initial_message) VALUES ($1, $2, $3, $4)`, req.ID, req.SenderID, req.RecipientID, req.InitialMessage)
	return err
}

func (p *PostgresRepository) GetChatRequestByID(id string) (*models.ChatRequest, error) {
	req := &models.ChatRequest{}
	err := p.db.QueryRow(`SELECT id, sender_id, recipient_id, COALESCE(initial_message, ''), status, created_at, updated_at FROM chat_requests WHERE id = $1`, id).Scan(&req.ID, &req.SenderID, &req.RecipientID, &req.InitialMessage, &req.Status, &req.CreatedAt, &req.UpdatedAt)
	return req, err
}

func (p *PostgresRepository) UpdateChatRequestStatus(id, status string) error {
	_, err := p.db.Exec(`UPDATE chat_requests SET status = $2::chat_request_status_enum, updated_at = NOW() WHERE id = $1`, id, status)
	return err
}

func (p *PostgresRepository) ListConversations(userID string, page, limit int) ([]*models.ChatConversation, error) {
	rows, err := p.db.Query(`SELECT id, user1_id, user2_id, created_at, updated_at FROM chat_conversations WHERE user1_id = $1 OR user2_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var convs []*models.ChatConversation
	for rows.Next() {
		c := &models.ChatConversation{}
		_ = rows.Scan(&c.ID, &c.User1ID, &c.User2ID, &c.CreatedAt, &c.UpdatedAt)
		convs = append(convs, c)
	}
	return convs, nil
}

func (p *PostgresRepository) GetConversationByID(id string) (*models.ChatConversation, error) {
	c := &models.ChatConversation{}
	err := p.db.QueryRow(`SELECT id, user1_id, user2_id, created_at, updated_at FROM chat_conversations WHERE id = $1`, id).Scan(&c.ID, &c.User1ID, &c.User2ID, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}

func (p *PostgresRepository) GetOrCreateConversation(user1ID, user2ID string) (*models.ChatConversation, error) {
	cID := uuid.New().String()
	_, _ = p.db.Exec(`INSERT INTO chat_conversations (id, user1_id, user2_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, cID, user1ID, user2ID)
	return p.GetConversationByID(cID)
}

func (p *PostgresRepository) ListMessages(convID string, beforeTimestamp string, limit int) ([]*models.ChatMessage, error) {
	rows, err := p.db.Query(`SELECT id, conversation_id, sender_id, message_text, COALESCE(attachment_url, ''), created_at FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2`, convID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []*models.ChatMessage
	for rows.Next() {
		m := &models.ChatMessage{}
		_ = rows.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.MessageText, &m.AttachmentURL, &m.CreatedAt)
		msgs = append(msgs, m)
	}
	return msgs, nil
}

func (p *PostgresRepository) CreateChatMessage(msg *models.ChatMessage) error {
	if msg.ID == "" {
		msg.ID = uuid.New().String()
	}
	_, err := p.db.Exec(`INSERT INTO chat_messages (id, conversation_id, sender_id, message_text, attachment_url) VALUES ($1, $2, $3, $4, $5)`, msg.ID, msg.ConversationID, msg.SenderID, msg.MessageText, msg.AttachmentURL)
	return err
}

func (p *PostgresRepository) BlockUser(blockerID, blockedID string) error {
	_, err := p.db.Exec(`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, blockerID, blockedID)
	return err
}

func (p *PostgresRepository) IsUserBlocked(userA, userB string) (bool, error) {
	var count int
	_ = p.db.QueryRow(`SELECT count(*) FROM user_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`, userA, userB).Scan(&count)
	return count > 0, nil
}

func (p *PostgresRepository) ListNotifications(userID string, page, limit int) ([]*models.Notification, error) {
	rows, err := p.db.Query(`SELECT id, user_id, title, message, type, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notifs []*models.Notification
	for rows.Next() {
		n := &models.Notification{}
		_ = rows.Scan(&n.ID, &n.UserID, &n.Title, &n.Message, &n.Type, &n.IsRead, &n.CreatedAt)
		notifs = append(notifs, n)
	}
	return notifs, nil
}

func (p *PostgresRepository) MarkNotificationRead(id, userID string) error {
	_, err := p.db.Exec(`UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

func (p *PostgresRepository) GetNotificationSettings(userID string) (*models.NotificationSettings, error) {
	s := &models.NotificationSettings{UserID: userID}
	err := p.db.QueryRow(`SELECT email_on_reply, email_on_mention, push_on_chat_request, push_on_community_update FROM notification_settings WHERE user_id = $1`, userID).Scan(&s.EmailOnReply, &s.EmailOnMention, &s.PushOnChatRequest, &s.PushOnCommunityUpdate)
	if err != nil {
		return &models.NotificationSettings{UserID: userID, EmailOnReply: true, EmailOnMention: true, PushOnChatRequest: true}, nil
	}
	return s, nil
}

func (p *PostgresRepository) UpdateNotificationSettings(settings *models.NotificationSettings) error {
	_, err := p.db.Exec(`INSERT INTO notification_settings (user_id, email_on_reply, email_on_mention, push_on_chat_request, push_on_community_update) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id) DO UPDATE SET email_on_reply = EXCLUDED.email_on_reply, email_on_mention = EXCLUDED.email_on_mention, push_on_chat_request = EXCLUDED.push_on_chat_request, push_on_community_update = EXCLUDED.push_on_community_update`, settings.UserID, settings.EmailOnReply, settings.EmailOnMention, settings.PushOnChatRequest, settings.PushOnCommunityUpdate)
	return err
}

func (p *PostgresRepository) CreateNotification(notif *models.Notification) error {
	if notif.ID == "" {
		notif.ID = uuid.New().String()
	}
	_, err := p.db.Exec(`INSERT INTO notifications (id, user_id, title, message, type) VALUES ($1, $2, $3, $4, $5)`, notif.ID, notif.UserID, notif.Title, notif.Message, notif.Type)
	return err
}

func (p *PostgresRepository) CreateReport(report *models.Report) error {
	if report.ID == "" {
		report.ID = uuid.New().String()
	}
	_, err := p.db.Exec(`INSERT INTO reports (id, reporter_id, target_id, target_type, reason_code, description) VALUES ($1, $2, $3, $4::report_target_enum, $5, $6)`, report.ID, report.ReporterID, report.TargetID, report.TargetType, report.ReasonCode, report.Description)
	return err
}

func (p *PostgresRepository) ListReports(communityID, status string, page, limit int) ([]*models.Report, error) {
	rows, err := p.db.Query(`SELECT id, reporter_id, target_id, target_type, reason_code, COALESCE(description, ''), status, resolved_by, COALESCE(resolution_notes, ''), created_at FROM reports LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reports []*models.Report
	for rows.Next() {
		r := &models.Report{}
		_ = rows.Scan(&r.ID, &r.ReporterID, &r.TargetID, &r.TargetType, &r.ReasonCode, &r.Description, &r.Status, &r.ResolvedBy, &r.ResolutionNotes, &r.CreatedAt)
		reports = append(reports, r)
	}
	return reports, nil
}

func (p *PostgresRepository) ResolveReport(id, status, notes, resolvedBy string) error {
	_, err := p.db.Exec(`UPDATE reports SET status = $2::report_status_enum, resolution_notes = $3, resolved_by = $4 WHERE id = $1`, id, status, notes, resolvedBy)
	return err
}

func (p *PostgresRepository) BanUser(ban *models.CommunityBan) error {
	_, err := p.db.Exec(`INSERT INTO community_bans (user_id, community_id, reason, expires_at) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, community_id) DO UPDATE SET reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at`, ban.UserID, ban.CommunityID, ban.Reason, ban.ExpiresAt)
	return err
}

func (p *PostgresRepository) UnbanUser(userID, communityID, reason string) error {
	_, err := p.db.Exec(`DELETE FROM community_bans WHERE user_id = $1 AND community_id = $2`, userID, communityID)
	return err
}

func (p *PostgresRepository) IsUserBannedFromCommunity(userID, communityID string) (bool, error) {
	var count int
	_ = p.db.QueryRow(`SELECT count(*) FROM community_bans WHERE user_id = $1 AND community_id = $2 AND (expires_at IS NULL OR expires_at > NOW())`, userID, communityID).Scan(&count)
	return count > 0, nil
}

func (p *PostgresRepository) CreateModerationLog(log *models.ModerationLog) error {
	if log.ID == "" {
		log.ID = uuid.New().String()
	}
	_, err := p.db.Exec(`INSERT INTO moderation_logs (id, moderator_id, community_id, action_type, target_id, reason) VALUES ($1, $2, $3, $4, $5, $6)`, log.ID, log.ModeratorID, log.CommunityID, log.ActionType, log.TargetID, log.Reason)
	return err
}

func (p *PostgresRepository) ListModerationLogs(moderatorID, actionType, fromDate, toDate string) ([]*models.ModerationLog, error) {
	rows, err := p.db.Query(`SELECT id, moderator_id, community_id, action_type, target_id, reason, created_at FROM moderation_logs ORDER BY created_at DESC LIMIT 50`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []*models.ModerationLog
	for rows.Next() {
		l := &models.ModerationLog{}
		_ = rows.Scan(&l.ID, &l.ModeratorID, &l.CommunityID, &l.ActionType, &l.TargetID, &l.Reason, &l.CreatedAt)
		logs = append(logs, l)
	}
	return logs, nil
}

func (p *PostgresRepository) CreateCommunityNote(note *models.CommunityNote) error {
	if note.ID == "" {
		note.ID = uuid.New().String()
	}
	_, err := p.db.Exec(`INSERT INTO community_notes (id, post_id, author_id, note_text, proof_url) VALUES ($1, $2, $3, $4, $5)`, note.ID, note.PostID, note.AuthorID, note.NoteText, note.ProofURL)
	return err
}

func (p *PostgresRepository) VoteCommunityNote(noteID, userID string, isHelpful bool) error {
	_, err := p.db.Exec(`INSERT INTO community_note_votes (note_id, user_id, is_helpful) VALUES ($1, $2, $3) ON CONFLICT (note_id, user_id) DO UPDATE SET is_helpful = EXCLUDED.is_helpful`, noteID, userID, isHelpful)
	return err
}

func (p *PostgresRepository) GetAnalyticsMetrics(timeframe string) (map[string]interface{}, error) {
	var usersCount, postsCount, commentsCount int
	_ = p.db.QueryRow(`SELECT count(*) FROM users`).Scan(&usersCount)
	_ = p.db.QueryRow(`SELECT count(*) FROM posts`).Scan(&postsCount)
	_ = p.db.QueryRow(`SELECT count(*) FROM comments`).Scan(&commentsCount)

	return map[string]interface{}{
		"timeframe":      timeframe,
		"active_users":   usersCount,
		"total_posts":    postsCount,
		"total_comments": commentsCount,
		"system_health":  "OPTIMAL",
	}, nil
}

func (p *PostgresRepository) GetSecurityAccountGroups(riskThreshold float64) ([]map[string]interface{}, error) {
	return []map[string]interface{}{
		{
			"group_id":       "grp_simulated_recaptcha_01",
			"risk_score":     riskThreshold,
			"affected_users": []string{"bot_candidate_01"},
		},
	}, nil
}

func (p *PostgresRepository) SearchPredictive(query string) ([]map[string]interface{}, error) {
	rows, err := p.db.Query(`SELECT id, title, 'post' FROM posts WHERE is_removed = FALSE AND title ILIKE '%' || $1 || '%' LIMIT 10`, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hits []map[string]interface{}
	for rows.Next() {
		var id, title, hitType string
		_ = rows.Scan(&id, &title, &hitType)
		hits = append(hits, map[string]interface{}{
			"id":    id,
			"title": title,
			"type":  hitType,
		})
	}
	return hits, nil
}

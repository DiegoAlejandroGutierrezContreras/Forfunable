package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"forfunable/models"
	"github.com/google/uuid"
	_ "github.com/lib/pq"
)

// PostgresRepository implementa Repository usando Cloud SQL PostgreSQL.
// Conexión recomendada: socket Unix /cloudsql/PROJECT:REGION:INSTANCE (Cloud Run)
// o DATABASE_URL directa (desarrollo local).
type PostgresRepository struct {
	db *sql.DB
}

// NewPostgresRepository abre el pool de conexiones y valida disponibilidad.
// Usa context con timeout para el ping inicial.
// No imprime la cadena de conexión ni credenciales en logs.
func NewPostgresRepository(dsn string) (*PostgresRepository, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("error al configurar el driver postgres: %w", err)
	}

	// Pool optimizado para Cloud Run horizontal scaling.
	// Cloud SQL permite hasta 100 conexiones por instancia db-f1-micro.
	// Con múltiples instancias Cloud Run, limitar a 25 por instancia.
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)

	// Validar conexión con timeout de 5 segundos.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("no se pudo conectar a PostgreSQL (ping fallido): %w", err)
	}

	// Verificar que las tablas esenciales existen.
	if err := checkEssentialTables(ctx, db); err != nil {
		db.Close()
		return nil, err
	}

	return &PostgresRepository{db: db}, nil
}

// checkEssentialTables verifica que el esquema fue aplicado.
func checkEssentialTables(ctx context.Context, db *sql.DB) error {
	tables := []string{"users", "communities", "posts", "comments"}
	for _, t := range tables {
		var exists bool
		err := db.QueryRowContext(ctx,
			`SELECT EXISTS (
				SELECT 1 FROM information_schema.tables
				WHERE table_schema = 'public' AND table_name = $1
			)`, t).Scan(&exists)
		if err != nil {
			return fmt.Errorf("error verificando tabla %s: %w", t, err)
		}
		if !exists {
			return fmt.Errorf("tabla requerida '%s' no encontrada. Ejecute database/schema.sql primero", t)
		}
	}
	return nil
}

// Ping verifica que la conexión sigue activa (usado por /health).
func (p *PostgresRepository) Ping(ctx context.Context) error {
	return p.db.PingContext(ctx)
}

// Close cierra el pool de conexiones durante el apagado ordenado.
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
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	err := p.db.QueryRowContext(ctx, query,
		u.ID, u.Username, u.Email, u.PasswordHash, u.GlobalRole,
		u.AvatarURL, u.Bio, u.KarmaScore, u.IsAdultVerified, u.IsActive,
	).Scan(&u.CreatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			if strings.Contains(err.Error(), "email") {
				return errors.New("el correo electrónico ya se encuentra registrado")
			}
			if strings.Contains(err.Error(), "username") {
				return errors.New("el nombre de usuario ya está en uso")
			}
			return errors.New("ya existe un usuario con esos datos")
		}
		return fmt.Errorf("error al crear usuario: %w", err)
	}
	return nil
}

func (p *PostgresRepository) GetUserByID(id string) (*models.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	u := &models.User{}
	query := `SELECT id, username, email, password_hash, global_role,
		COALESCE(avatar_url, ''), COALESCE(bio, ''), presence_status,
		karma_score, is_adult_verified, is_active, COALESCE(freeze_reason, ''), created_at
		FROM users WHERE id = $1`
	err := p.db.QueryRowContext(ctx, query, id).Scan(
		&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.GlobalRole,
		&u.AvatarURL, &u.Bio, &u.PresenceStatus, &u.KarmaScore,
		&u.IsAdultVerified, &u.IsActive, &u.FreezeReason, &u.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, errors.New("usuario no encontrado")
	}
	if err != nil {
		return nil, fmt.Errorf("error al obtener usuario: %w", err)
	}
	return u, nil
}

func (p *PostgresRepository) GetUserByEmail(email string) (*models.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	u := &models.User{}
	query := `SELECT id, username, email, password_hash, global_role,
		COALESCE(avatar_url, ''), COALESCE(bio, ''), presence_status,
		karma_score, is_adult_verified, is_active, COALESCE(freeze_reason, ''), created_at
		FROM users WHERE email = $1`
	err := p.db.QueryRowContext(ctx, query, email).Scan(
		&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.GlobalRole,
		&u.AvatarURL, &u.Bio, &u.PresenceStatus, &u.KarmaScore,
		&u.IsAdultVerified, &u.IsActive, &u.FreezeReason, &u.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, errors.New("usuario no encontrado")
	}
	if err != nil {
		return nil, fmt.Errorf("error al obtener usuario por email: %w", err)
	}
	return u, nil
}

func (p *PostgresRepository) GetUserByUsername(username string) (*models.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	u := &models.User{}
	query := `SELECT id, username, email, password_hash, global_role,
		COALESCE(avatar_url, ''), COALESCE(bio, ''), presence_status,
		karma_score, is_adult_verified, is_active, COALESCE(freeze_reason, ''), created_at
		FROM users WHERE username = $1`
	err := p.db.QueryRowContext(ctx, query, username).Scan(
		&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.GlobalRole,
		&u.AvatarURL, &u.Bio, &u.PresenceStatus, &u.KarmaScore,
		&u.IsAdultVerified, &u.IsActive, &u.FreezeReason, &u.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, errors.New("usuario no encontrado")
	}
	if err != nil {
		return nil, fmt.Errorf("error al obtener usuario por username: %w", err)
	}
	return u, nil
}

func (p *PostgresRepository) UpdateUserProfile(id, avatarURL, bio string) (*models.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	query := `UPDATE users
		SET avatar_url = COALESCE(NULLIF($2, ''), avatar_url),
		    bio = COALESCE(NULLIF($3, ''), bio)
		WHERE id = $1
		RETURNING id, username, email, global_role, COALESCE(avatar_url,''), COALESCE(bio,''),
		          presence_status, karma_score, is_adult_verified, is_active, created_at`
	u := &models.User{}
	err := p.db.QueryRowContext(ctx, query, id, avatarURL, bio).Scan(
		&u.ID, &u.Username, &u.Email, &u.GlobalRole, &u.AvatarURL, &u.Bio,
		&u.PresenceStatus, &u.KarmaScore, &u.IsAdultVerified, &u.IsActive, &u.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("error al actualizar perfil: %w", err)
	}
	return u, nil
}

func (p *PostgresRepository) UpdateUserStatus(id, status string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx, `UPDATE users SET presence_status = $2 WHERE id = $1`, id, status)
	return err
}

func (p *PostgresRepository) VerifyUserAge(id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx, `UPDATE users SET is_adult_verified = TRUE WHERE id = $1`, id)
	return err
}

func (p *PostgresRepository) ListUsers(search, role, status string, page, limit int) ([]*models.User, int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	offset := (page - 1) * limit
	query := `SELECT id, username, email, global_role, COALESCE(avatar_url,''), COALESCE(bio,''),
		presence_status, karma_score, is_adult_verified, is_active, created_at
		FROM users
		WHERE ($1 = '' OR username ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
		  AND ($2 = '' OR global_role::text = $2)
		ORDER BY created_at DESC LIMIT $3 OFFSET $4`
	rows, err := p.db.QueryContext(ctx, query, search, role, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("error al listar usuarios: %w", err)
	}
	defer rows.Close()

	var users []*models.User
	for rows.Next() {
		u := &models.User{}
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.GlobalRole, &u.AvatarURL, &u.Bio,
			&u.PresenceStatus, &u.KarmaScore, &u.IsAdultVerified, &u.IsActive, &u.CreatedAt); err != nil {
			return nil, 0, err
		}
		users = append(users, u)
	}

	var count int
	_ = p.db.QueryRowContext(ctx,
		`SELECT count(*) FROM users WHERE ($1 = '' OR username ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%') AND ($2 = '' OR global_role::text = $2)`,
		search, role).Scan(&count)
	return users, count, nil
}

func (p *PostgresRepository) UpdateUserRole(id, role string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx, `UPDATE users SET global_role = $2::user_role_enum WHERE id = $1`, id, role)
	return err
}

func (p *PostgresRepository) UpdateUserGlobalStatus(id string, isActive bool, freezeReason string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx, `UPDATE users SET is_active = $2, freeze_reason = $3 WHERE id = $1`, id, isActive, freezeReason)
	return err
}

// --- Comunidades ---

func (p *PostgresRepository) CreateCommunity(c *models.Community) error {
	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	query := `INSERT INTO communities (id, name, description, creator_id) VALUES ($1, $2, $3, $4) RETURNING created_at`
	err := p.db.QueryRowContext(ctx, query, c.ID, c.Name, c.Description, c.CreatorID).Scan(&c.CreatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			return errors.New("ya existe una comunidad con este nombre")
		}
		return fmt.Errorf("error al crear comunidad: %w", err)
	}
	return nil
}

func (p *PostgresRepository) GetCommunityByID(id string) (*models.Community, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c := &models.Community{}
	query := `SELECT id, name, COALESCE(description,''), COALESCE(rules_text,''), is_private, age_restricted, creator_id, created_at
		FROM communities WHERE id = $1`
	err := p.db.QueryRowContext(ctx, query, id).Scan(
		&c.ID, &c.Name, &c.Description, &c.RulesText, &c.IsPrivate, &c.AgeRestricted, &c.CreatorID, &c.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, errors.New("comunidad no encontrada")
	}
	if err != nil {
		return nil, fmt.Errorf("error al obtener comunidad: %w", err)
	}
	return c, nil
}

func (p *PostgresRepository) GetCommunityByName(name string) (*models.Community, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c := &models.Community{}
	query := `SELECT id, name, COALESCE(description,''), COALESCE(rules_text,''), is_private, age_restricted, creator_id, created_at
		FROM communities WHERE name = $1`
	err := p.db.QueryRowContext(ctx, query, name).Scan(
		&c.ID, &c.Name, &c.Description, &c.RulesText, &c.IsPrivate, &c.AgeRestricted, &c.CreatorID, &c.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, errors.New("comunidad no encontrada")
	}
	if err != nil {
		return nil, fmt.Errorf("error al obtener comunidad: %w", err)
	}
	return c, nil
}

func (p *PostgresRepository) ListCommunities(search, sort string, page, limit int) ([]*models.Community, int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	offset := (page - 1) * limit
	query := `SELECT id, name, COALESCE(description,''), COALESCE(rules_text,''), is_private, age_restricted, creator_id, created_at
		FROM communities
		WHERE ($1 = '' OR name ILIKE '%' || $1 || '%')
		ORDER BY created_at DESC LIMIT $2 OFFSET $3`
	rows, err := p.db.QueryContext(ctx, query, search, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("error al listar comunidades: %w", err)
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
	_ = p.db.QueryRowContext(ctx, `SELECT count(*) FROM communities WHERE ($1 = '' OR name ILIKE '%' || $1 || '%')`, search).Scan(&count)
	return comms, count, nil
}

func (p *PostgresRepository) JoinCommunity(commID, userID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx, `INSERT INTO community_members (community_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, commID, userID)
	return err
}

func (p *PostgresRepository) LeaveCommunity(commID, userID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx, `DELETE FROM community_members WHERE community_id = $1 AND user_id = $2`, commID, userID)
	return err
}

func (p *PostgresRepository) IsCommunityMember(commID, userID string) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var count int
	err := p.db.QueryRowContext(ctx, `SELECT count(*) FROM community_members WHERE community_id = $1 AND user_id = $2`, commID, userID).Scan(&count)
	return count > 0, err
}

func (p *PostgresRepository) AssignCommunityModerator(mod *models.CommunityModerator) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	query := `INSERT INTO community_moderators (community_id, user_id, mod_role) VALUES ($1, $2, $3::mod_role_enum)
		ON CONFLICT (community_id, user_id) DO UPDATE SET mod_role = EXCLUDED.mod_role`
	_, err := p.db.ExecContext(ctx, query, mod.CommunityID, mod.UserID, mod.ModRole)
	return err
}

func (p *PostgresRepository) GetCommunityModerators(commID string) ([]models.CommunityModerator, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rows, err := p.db.QueryContext(ctx, `SELECT community_id, user_id, mod_role, assigned_at FROM community_moderators WHERE community_id = $1`, commID)
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
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	m := &models.CommunityModerator{}
	err := p.db.QueryRowContext(ctx,
		`SELECT community_id, user_id, mod_role, assigned_at FROM community_moderators WHERE community_id = $1 AND user_id = $2`,
		commID, userID).Scan(&m.CommunityID, &m.UserID, &m.ModRole, &m.AssignedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return m, err
}

func (p *PostgresRepository) UpdateCommunitySettings(commID, rulesText string, isPrivate, ageRestricted bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx,
		`UPDATE communities SET rules_text = COALESCE(NULLIF($2,''), rules_text), is_private = $3, age_restricted = $4 WHERE id = $1`,
		commID, rulesText, isPrivate, ageRestricted)
	return err
}

// --- Publicaciones ---

func (p *PostgresRepository) CreatePost(post *models.Post) error {
	if post.ID == "" {
		post.ID = uuid.New().String()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	query := `INSERT INTO posts (id, community_id, author_id, title, content_type, body_text, media_url)
		VALUES ($1, $2, $3, $4, $5::content_type_enum, $6, $7) RETURNING created_at`
	err := p.db.QueryRowContext(ctx, query,
		post.ID, post.CommunityID, post.AuthorID, post.Title, post.ContentType, post.BodyText, post.MediaURL,
	).Scan(&post.CreatedAt)
	if err != nil {
		return fmt.Errorf("error al crear publicación: %w", err)
	}
	return nil
}

func (p *PostgresRepository) GetPostByID(id string) (*models.Post, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	post := &models.Post{}
	query := `SELECT p.id, p.community_id, p.author_id, u.username,
		p.title, p.content_type, COALESCE(p.body_text,''), COALESCE(p.media_url,''),
		p.upvotes_count, p.downvotes_count, p.comments_count, p.is_removed, p.created_at
		FROM posts p JOIN users u ON p.author_id = u.id
		WHERE p.id = $1 AND p.is_removed = FALSE`
	err := p.db.QueryRowContext(ctx, query, id).Scan(
		&post.ID, &post.CommunityID, &post.AuthorID, &post.AuthorUsername,
		&post.Title, &post.ContentType, &post.BodyText, &post.MediaURL,
		&post.UpvotesCount, &post.DownvotesCount, &post.CommentsCount, &post.IsRemoved, &post.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, errors.New("publicación no encontrada")
	}
	if err != nil {
		return nil, fmt.Errorf("error al obtener publicación: %w", err)
	}
	return post, nil
}

func (p *PostgresRepository) ListPosts(communityID, sort string, page, limit int) ([]*models.Post, int, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	offset := (page - 1) * limit
	query := `SELECT p.id, p.community_id, p.author_id, u.username,
		p.title, p.content_type, COALESCE(p.body_text,''), COALESCE(p.media_url,''),
		p.upvotes_count, p.downvotes_count, p.comments_count, p.is_removed, p.created_at
		FROM posts p JOIN users u ON p.author_id = u.id
		WHERE p.is_removed = FALSE AND ($1 = '' OR p.community_id::text = $1)
		ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`
	rows, err := p.db.QueryContext(ctx, query, communityID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("error al listar publicaciones: %w", err)
	}
	defer rows.Close()

	var posts []*models.Post
	for rows.Next() {
		post := &models.Post{}
		if err := rows.Scan(&post.ID, &post.CommunityID, &post.AuthorID, &post.AuthorUsername,
			&post.Title, &post.ContentType, &post.BodyText, &post.MediaURL,
			&post.UpvotesCount, &post.DownvotesCount, &post.CommentsCount, &post.IsRemoved, &post.CreatedAt); err != nil {
			return nil, 0, err
		}
		posts = append(posts, post)
	}

	var count int
	_ = p.db.QueryRowContext(ctx, `SELECT count(*) FROM posts WHERE is_removed = FALSE AND ($1 = '' OR community_id::text = $1)`, communityID).Scan(&count)
	return posts, count, nil
}

// UpdatePost actualiza el cuerpo de texto de una publicación.
// Incluye JOIN para obtener el AuthorUsername.
func (p *PostgresRepository) UpdatePost(id, bodyText string) (*models.Post, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	query := `UPDATE posts SET body_text = $2 WHERE id = $1 AND is_removed = FALSE
		RETURNING id, community_id, author_id,
		  (SELECT username FROM users WHERE id = author_id),
		  title, content_type, COALESCE(body_text,''), COALESCE(media_url,''),
		  upvotes_count, downvotes_count, comments_count, is_removed, created_at`
	post := &models.Post{}
	err := p.db.QueryRowContext(ctx, query, id, bodyText).Scan(
		&post.ID, &post.CommunityID, &post.AuthorID, &post.AuthorUsername,
		&post.Title, &post.ContentType, &post.BodyText, &post.MediaURL,
		&post.UpvotesCount, &post.DownvotesCount, &post.CommentsCount, &post.IsRemoved, &post.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, errors.New("publicación no encontrada")
	}
	if err != nil {
		return nil, fmt.Errorf("error al actualizar publicación: %w", err)
	}
	return post, nil
}

func (p *PostgresRepository) DeletePost(id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx, `UPDATE posts SET is_removed = TRUE WHERE id = $1`, id)
	return err
}

func (p *PostgresRepository) RemovePostByAdmin(id string) error {
	return p.DeletePost(id)
}

// GetRecommendedFeed implementa el algoritmo Hot Ranking Decay en SQL:
// Score = net_votes / (hours_old + 2)^1.8
func (p *PostgresRepository) GetRecommendedFeed(cursor string, limit int) ([]*models.Post, string, error) {
	if limit <= 0 {
		limit = 20
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := `SELECT p.id, p.community_id, p.author_id, u.username,
		p.title, p.content_type, COALESCE(p.body_text,''), COALESCE(p.media_url,''),
		p.upvotes_count, p.downvotes_count, p.comments_count, p.is_removed, p.created_at,
		(p.upvotes_count - p.downvotes_count)::float /
		  POWER(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0 + 2.0, 1.8) AS hot_score
		FROM posts p JOIN users u ON p.author_id = u.id
		WHERE p.is_removed = FALSE
		ORDER BY hot_score DESC
		LIMIT $1`

	rows, err := p.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, "", fmt.Errorf("error en feed de recomendaciones: %w", err)
	}
	defer rows.Close()

	var posts []*models.Post
	for rows.Next() {
		post := &models.Post{}
		if err := rows.Scan(
			&post.ID, &post.CommunityID, &post.AuthorID, &post.AuthorUsername,
			&post.Title, &post.ContentType, &post.BodyText, &post.MediaURL,
			&post.UpvotesCount, &post.DownvotesCount, &post.CommentsCount, &post.IsRemoved, &post.CreatedAt,
			&post.HotRankingScore,
		); err != nil {
			return nil, "", err
		}
		posts = append(posts, post)
	}

	nextCursor := ""
	if len(posts) > 0 {
		nextCursor = posts[len(posts)-1].ID
	}
	return posts, nextCursor, nil
}

// --- Comentarios con ltree ---

func (p *PostgresRepository) CreateComment(comment *models.Comment) error {
	if comment.ID == "" {
		comment.ID = uuid.New().String()
	}
	postTag := strings.ReplaceAll(comment.PostID, "-", "_")
	commentTag := strings.ReplaceAll(comment.ID, "-", "_")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("error al iniciar transacción: %w", err)
	}
	defer tx.Rollback()

	if comment.ParentCommentID == nil || *comment.ParentCommentID == "" {
		comment.Depth = 0
		comment.Path = fmt.Sprintf("%s.%s", postTag, commentTag)
	} else {
		var parentPath string
		var parentDepth int
		err := tx.QueryRowContext(ctx, `SELECT ltree2text(path), depth FROM comments WHERE id = $1`, *comment.ParentCommentID).
			Scan(&parentPath, &parentDepth)
		if err != nil {
			return errors.New("comentario padre no encontrado")
		}
		comment.Depth = parentDepth + 1
		comment.Path = fmt.Sprintf("%s.%s", parentPath, commentTag)
	}

	query := `INSERT INTO comments (id, post_id, user_id, parent_comment_id, content, path, depth)
		VALUES ($1, $2, $3, $4, $5, text2ltree($6), $7) RETURNING created_at`
	err = tx.QueryRowContext(ctx, query,
		comment.ID, comment.PostID, comment.UserID, comment.ParentCommentID,
		comment.Content, comment.Path, comment.Depth,
	).Scan(&comment.CreatedAt)
	if err != nil {
		return fmt.Errorf("error al crear comentario: %w", err)
	}

	_, _ = tx.ExecContext(ctx, `UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1`, comment.PostID)

	return tx.Commit()
}

func (p *PostgresRepository) GetCommentByID(id string) (*models.Comment, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c := &models.Comment{}
	query := `SELECT id, post_id, user_id, parent_comment_id, content, ltree2text(path), depth, score, is_removed, created_at
		FROM comments WHERE id = $1`
	err := p.db.QueryRowContext(ctx, query, id).Scan(
		&c.ID, &c.PostID, &c.UserID, &c.ParentCommentID, &c.Content,
		&c.Path, &c.Depth, &c.Score, &c.IsRemoved, &c.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, errors.New("comentario no encontrado")
	}
	if err != nil {
		return nil, fmt.Errorf("error al obtener comentario: %w", err)
	}
	return c, nil
}

// ListCommentsByPost usa el índice GiST ltree para recuperar el árbol en una consulta plana.
func (p *PostgresRepository) ListCommentsByPost(postID, sortBy string, maxDepth int) ([]*models.Comment, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	query := `SELECT c.id, c.post_id, c.user_id, u.username, c.parent_comment_id,
		c.content, ltree2text(c.path), c.depth, c.score, c.is_removed, c.created_at
		FROM comments c JOIN users u ON c.user_id = u.id
		WHERE c.post_id = $1 AND ($2 <= 0 OR c.depth <= $2)
		ORDER BY c.path ASC`
	rows, err := p.db.QueryContext(ctx, query, postID, maxDepth)
	if err != nil {
		return nil, fmt.Errorf("error al listar comentarios: %w", err)
	}
	defer rows.Close()

	var comments []*models.Comment
	for rows.Next() {
		c := &models.Comment{}
		if err := rows.Scan(&c.ID, &c.PostID, &c.UserID, &c.AuthorUsername, &c.ParentCommentID,
			&c.Content, &c.Path, &c.Depth, &c.Score, &c.IsRemoved, &c.CreatedAt); err != nil {
			return nil, err
		}
		comments = append(comments, c)
	}
	return comments, nil
}

func (p *PostgresRepository) UpdateComment(id, content string) (*models.Comment, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c := &models.Comment{}
	query := `UPDATE comments SET content = $2 WHERE id = $1 AND is_removed = FALSE
		RETURNING id, post_id, user_id, parent_comment_id, content, ltree2text(path), depth, score, is_removed, created_at`
	err := p.db.QueryRowContext(ctx, query, id, content).Scan(
		&c.ID, &c.PostID, &c.UserID, &c.ParentCommentID, &c.Content,
		&c.Path, &c.Depth, &c.Score, &c.IsRemoved, &c.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, errors.New("comentario no encontrado")
	}
	return c, err
}

func (p *PostgresRepository) DeleteComment(id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx,
		`UPDATE comments SET content = '[comentario eliminado]', is_removed = TRUE WHERE id = $1`, id)
	return err
}

// --- Votos ---

func (p *PostgresRepository) VotePost(userID, postID string, voteValue int) (*models.VoteResponse, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if voteValue == 0 {
		_, _ = tx.ExecContext(ctx, `DELETE FROM post_votes WHERE user_id = $1 AND post_id = $2`, userID, postID)
	} else {
		_, err = tx.ExecContext(ctx,
			`INSERT INTO post_votes (user_id, post_id, vote_value) VALUES ($1, $2, $3)
			 ON CONFLICT (user_id, post_id) DO UPDATE SET vote_value = EXCLUDED.vote_value`,
			userID, postID, voteValue)
		if err != nil {
			return nil, fmt.Errorf("error al registrar voto: %w", err)
		}
	}

	var upvotes, downvotes int
	_ = tx.QueryRowContext(ctx,
		`SELECT count(*) FILTER (WHERE vote_value = 1), count(*) FILTER (WHERE vote_value = -1)
		 FROM post_votes WHERE post_id = $1`, postID).Scan(&upvotes, &downvotes)
	_, _ = tx.ExecContext(ctx, `UPDATE posts SET upvotes_count = $1, downvotes_count = $2 WHERE id = $3`, upvotes, downvotes, postID)

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
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if voteValue == 0 {
		_, _ = tx.ExecContext(ctx, `DELETE FROM comment_votes WHERE user_id = $1 AND comment_id = $2`, userID, commentID)
	} else {
		_, err = tx.ExecContext(ctx,
			`INSERT INTO comment_votes (user_id, comment_id, vote_value) VALUES ($1, $2, $3)
			 ON CONFLICT (user_id, comment_id) DO UPDATE SET vote_value = EXCLUDED.vote_value`,
			userID, commentID, voteValue)
		if err != nil {
			return nil, fmt.Errorf("error al registrar voto en comentario: %w", err)
		}
	}

	var score int
	_ = tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(vote_value), 0) FROM comment_votes WHERE comment_id = $1`, commentID).Scan(&score)
	_, _ = tx.ExecContext(ctx, `UPDATE comments SET score = $1 WHERE id = $2`, score, commentID)

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &models.VoteResponse{
		NewScore:    score,
		CurrentVote: voteValue,
	}, nil
}

// GetUserKarmaDetail calcula karma real desglosado por posts y comentarios.
func (p *PostgresRepository) GetUserKarmaDetail(userID string) (*models.KarmaDetailResponse, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	u, err := p.GetUserByID(userID)
	if err != nil {
		return nil, err
	}

	var postKarma int
	_ = p.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(upvotes_count - downvotes_count), 0) FROM posts WHERE author_id = $1 AND is_removed = FALSE`,
		userID).Scan(&postKarma)

	var commentKarma int
	_ = p.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(score), 0) FROM comments WHERE user_id = $1 AND is_removed = FALSE`,
		userID).Scan(&commentKarma)

	rank := rankFromScore(u.KarmaScore)
	return &models.KarmaDetailResponse{
		UserID:       userID,
		TotalKarma:   u.KarmaScore,
		PostKarma:    postKarma,
		CommentKarma: commentKarma,
		RankTitle:    rank,
	}, nil
}

func rankFromScore(score int) string {
	switch {
	case score >= 1000:
		return "Leyenda Comunitaria"
	case score >= 500:
		return "Veterano"
	case score >= 100:
		return "Colaborador Activo"
	default:
		return "Iniciado"
	}
}

// Variable usada para evitar importar math solo por esta función.
var _ = math.Pow

// --- Chat y Mensajería Privada ---

func (p *PostgresRepository) CreateChatRequest(req *models.ChatRequest) error {
	if req.ID == "" {
		req.ID = uuid.New().String()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO chat_requests (id, sender_id, recipient_id, initial_message) VALUES ($1, $2, $3, $4)`,
		req.ID, req.SenderID, req.RecipientID, req.InitialMessage)
	if err != nil {
		if strings.Contains(err.Error(), "unique") {
			return errors.New("ya existe una solicitud de chat entre estos usuarios")
		}
		return fmt.Errorf("error al crear solicitud de chat: %w", err)
	}
	return nil
}

func (p *PostgresRepository) GetChatRequestByID(id string) (*models.ChatRequest, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req := &models.ChatRequest{}
	err := p.db.QueryRowContext(ctx,
		`SELECT id, sender_id, recipient_id, COALESCE(initial_message,''), status, created_at, updated_at
		 FROM chat_requests WHERE id = $1`, id).
		Scan(&req.ID, &req.SenderID, &req.RecipientID, &req.InitialMessage, &req.Status, &req.CreatedAt, &req.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, errors.New("solicitud no encontrada")
	}
	return req, err
}

func (p *PostgresRepository) UpdateChatRequestStatus(id, status string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx,
		`UPDATE chat_requests SET status = $2::chat_request_status_enum, updated_at = NOW() WHERE id = $1`,
		id, status)
	return err
}

func (p *PostgresRepository) ListConversations(userID string, page, limit int) ([]*models.ChatConversation, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rows, err := p.db.QueryContext(ctx,
		`SELECT id, user1_id, user2_id, created_at, updated_at
		 FROM chat_conversations WHERE user1_id = $1 OR user2_id = $1
		 ORDER BY updated_at DESC`, userID)
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
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	c := &models.ChatConversation{}
	err := p.db.QueryRowContext(ctx,
		`SELECT id, user1_id, user2_id, created_at, updated_at FROM chat_conversations WHERE id = $1`, id).
		Scan(&c.ID, &c.User1ID, &c.User2ID, &c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, errors.New("conversación no encontrada")
	}
	return c, err
}

// GetOrCreateConversation busca primero, luego crea si no existe.
// Corregido: evita el bug de generar UUID nuevo antes de verificar existencia.
func (p *PostgresRepository) GetOrCreateConversation(user1ID, user2ID string) (*models.ChatConversation, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Buscar conversación existente (ambas direcciones).
	c := &models.ChatConversation{}
	err := p.db.QueryRowContext(ctx,
		`SELECT id, user1_id, user2_id, created_at, updated_at
		 FROM chat_conversations
		 WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)
		 LIMIT 1`, user1ID, user2ID).
		Scan(&c.ID, &c.User1ID, &c.User2ID, &c.CreatedAt, &c.UpdatedAt)

	if err == nil {
		return c, nil // Ya existe
	}
	if err != sql.ErrNoRows {
		return nil, fmt.Errorf("error buscando conversación: %w", err)
	}

	// 2. No existe: crear nueva.
	newID := uuid.New().String()
	err = p.db.QueryRowContext(ctx,
		`INSERT INTO chat_conversations (id, user1_id, user2_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user1_id, user2_id) DO NOTHING
		 RETURNING id, user1_id, user2_id, created_at, updated_at`,
		newID, user1ID, user2ID).
		Scan(&c.ID, &c.User1ID, &c.User2ID, &c.CreatedAt, &c.UpdatedAt)

	if err == sql.ErrNoRows {
		// El ON CONFLICT se activó en una carrera de condición: buscar de nuevo.
		return p.GetOrCreateConversation(user1ID, user2ID)
	}
	if err != nil {
		return nil, fmt.Errorf("error al crear conversación: %w", err)
	}
	return c, nil
}

func (p *PostgresRepository) ListMessages(convID string, beforeTimestamp string, limit int) ([]*models.ChatMessage, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rows, err := p.db.QueryContext(ctx,
		`SELECT id, conversation_id, sender_id, message_text, COALESCE(attachment_url,''), created_at
		 FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT $2`,
		convID, limit)
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
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO chat_messages (id, conversation_id, sender_id, message_text, attachment_url) VALUES ($1, $2, $3, $4, $5)`,
		msg.ID, msg.ConversationID, msg.SenderID, msg.MessageText, msg.AttachmentURL)
	return err
}

func (p *PostgresRepository) BlockUser(blockerID, blockedID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		blockerID, blockedID)
	return err
}

func (p *PostgresRepository) IsUserBlocked(userA, userB string) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var count int
	_ = p.db.QueryRowContext(ctx,
		`SELECT count(*) FROM user_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
		userA, userB).Scan(&count)
	return count > 0, nil
}

// --- Notificaciones ---

func (p *PostgresRepository) ListNotifications(userID string, page, limit int) ([]*models.Notification, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	offset := (page - 1) * limit
	rows, err := p.db.QueryContext(ctx,
		`SELECT id, user_id, title, message, type, is_read, created_at
		 FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		userID, limit, offset)
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
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx, `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

func (p *PostgresRepository) GetNotificationSettings(userID string) (*models.NotificationSettings, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	s := &models.NotificationSettings{UserID: userID}
	err := p.db.QueryRowContext(ctx,
		`SELECT email_on_reply, email_on_mention, push_on_chat_request, push_on_community_update
		 FROM notification_settings WHERE user_id = $1`, userID).
		Scan(&s.EmailOnReply, &s.EmailOnMention, &s.PushOnChatRequest, &s.PushOnCommunityUpdate)
	if err != nil {
		// Si no existe configuración, devolver valores por defecto.
		return &models.NotificationSettings{
			UserID: userID, EmailOnReply: true, EmailOnMention: true, PushOnChatRequest: true,
		}, nil
	}
	return s, nil
}

func (p *PostgresRepository) UpdateNotificationSettings(settings *models.NotificationSettings) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO notification_settings (user_id, email_on_reply, email_on_mention, push_on_chat_request, push_on_community_update)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (user_id) DO UPDATE SET
		   email_on_reply = EXCLUDED.email_on_reply,
		   email_on_mention = EXCLUDED.email_on_mention,
		   push_on_chat_request = EXCLUDED.push_on_chat_request,
		   push_on_community_update = EXCLUDED.push_on_community_update`,
		settings.UserID, settings.EmailOnReply, settings.EmailOnMention,
		settings.PushOnChatRequest, settings.PushOnCommunityUpdate)
	return err
}

func (p *PostgresRepository) CreateNotification(notif *models.Notification) error {
	if notif.ID == "" {
		notif.ID = uuid.New().String()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO notifications (id, user_id, title, message, type) VALUES ($1, $2, $3, $4, $5)`,
		notif.ID, notif.UserID, notif.Title, notif.Message, notif.Type)
	return err
}

// --- Moderación ---

func (p *PostgresRepository) CreateReport(report *models.Report) error {
	if report.ID == "" {
		report.ID = uuid.New().String()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO reports (id, reporter_id, target_id, target_type, reason_code, description)
		 VALUES ($1, $2, $3, $4::report_target_enum, $5, $6)`,
		report.ID, report.ReporterID, report.TargetID, report.TargetType, report.ReasonCode, report.Description)
	return err
}

// ListReports aplica filtros reales de status (con OFFSET/LIMIT).
func (p *PostgresRepository) ListReports(communityID, status string, page, limit int) ([]*models.Report, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	offset := (page - 1) * limit
	rows, err := p.db.QueryContext(ctx,
		`SELECT id, reporter_id, target_id, target_type, reason_code,
		        COALESCE(description,''), status, resolved_by, COALESCE(resolution_notes,''), created_at
		 FROM reports
		 WHERE ($1 = '' OR status::text = $1)
		 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		status, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("error al listar denuncias: %w", err)
	}
	defer rows.Close()

	var reports []*models.Report
	for rows.Next() {
		r := &models.Report{}
		_ = rows.Scan(&r.ID, &r.ReporterID, &r.TargetID, &r.TargetType, &r.ReasonCode,
			&r.Description, &r.Status, &r.ResolvedBy, &r.ResolutionNotes, &r.CreatedAt)
		reports = append(reports, r)
	}
	return reports, nil
}

func (p *PostgresRepository) ResolveReport(id, status, notes, resolvedBy string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx,
		`UPDATE reports SET status = $2::report_status_enum, resolution_notes = $3, resolved_by = $4 WHERE id = $1`,
		id, status, notes, resolvedBy)
	return err
}

func (p *PostgresRepository) BanUser(ban *models.CommunityBan) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO community_bans (user_id, community_id, reason, expires_at) VALUES ($1, $2, $3, $4)
		 ON CONFLICT (user_id, community_id) DO UPDATE SET reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at`,
		ban.UserID, ban.CommunityID, ban.Reason, ban.ExpiresAt)
	return err
}

func (p *PostgresRepository) UnbanUser(userID, communityID, reason string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx, `DELETE FROM community_bans WHERE user_id = $1 AND community_id = $2`, userID, communityID)
	return err
}

func (p *PostgresRepository) IsUserBannedFromCommunity(userID, communityID string) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var count int
	_ = p.db.QueryRowContext(ctx,
		`SELECT count(*) FROM community_bans WHERE user_id = $1 AND community_id = $2
		 AND (expires_at IS NULL OR expires_at > NOW())`, userID, communityID).Scan(&count)
	return count > 0, nil
}

func (p *PostgresRepository) CreateModerationLog(log *models.ModerationLog) error {
	if log.ID == "" {
		log.ID = uuid.New().String()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO moderation_logs (id, moderator_id, community_id, action_type, target_id, reason)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		log.ID, log.ModeratorID, log.CommunityID, log.ActionType, log.TargetID, log.Reason)
	return err
}

// ListModerationLogs aplica filtros reales por moderador, tipo de acción y rango de fechas.
func (p *PostgresRepository) ListModerationLogs(moderatorID, actionType, fromDate, toDate string) ([]*models.ModerationLog, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	rows, err := p.db.QueryContext(ctx,
		`SELECT id, moderator_id, community_id, action_type, target_id, reason, created_at
		 FROM moderation_logs
		 WHERE ($1 = '' OR moderator_id::text = $1)
		   AND ($2 = '' OR action_type = $2)
		   AND ($3 = '' OR created_at >= $3::timestamptz)
		   AND ($4 = '' OR created_at <= $4::timestamptz)
		 ORDER BY created_at DESC LIMIT 200`,
		moderatorID, actionType, fromDate, toDate)
	if err != nil {
		return nil, fmt.Errorf("error al listar logs: %w", err)
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

// --- Notas Comunitarias ---

func (p *PostgresRepository) CreateCommunityNote(note *models.CommunityNote) error {
	if note.ID == "" {
		note.ID = uuid.New().String()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO community_notes (id, post_id, author_id, note_text, proof_url) VALUES ($1, $2, $3, $4, $5)`,
		note.ID, note.PostID, note.AuthorID, note.NoteText, note.ProofURL)
	return err
}

func (p *PostgresRepository) VoteCommunityNote(noteID, userID string, isHelpful bool) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := p.db.ExecContext(ctx,
		`INSERT INTO community_note_votes (note_id, user_id, is_helpful) VALUES ($1, $2, $3)
		 ON CONFLICT (note_id, user_id) DO UPDATE SET is_helpful = EXCLUDED.is_helpful`,
		noteID, userID, isHelpful)
	return err
}

// --- Métricas, Búsqueda y Seguridad ---

func (p *PostgresRepository) GetAnalyticsMetrics(timeframe string) (map[string]interface{}, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var usersCount, postsCount, commentsCount, commCount int
	_ = p.db.QueryRowContext(ctx, `SELECT count(*) FROM users WHERE is_active = TRUE`).Scan(&usersCount)
	_ = p.db.QueryRowContext(ctx, `SELECT count(*) FROM posts WHERE is_removed = FALSE`).Scan(&postsCount)
	_ = p.db.QueryRowContext(ctx, `SELECT count(*) FROM comments WHERE is_removed = FALSE`).Scan(&commentsCount)
	_ = p.db.QueryRowContext(ctx, `SELECT count(*) FROM communities`).Scan(&commCount)

	return map[string]interface{}{
		"timeframe":      timeframe,
		"active_users":   usersCount,
		"total_posts":    postsCount,
		"total_comments": commentsCount,
		"communities":    commCount,
		"system_health":  "OPTIMAL",
	}, nil
}

// GetSecurityAccountGroups devuelve grupos de usuarios con ratio de actividad sospechoso.
// Implementación real: usuarios recientes (< 7 días) con muchas publicaciones (> 5).
func (p *PostgresRepository) GetSecurityAccountGroups(riskThreshold float64) ([]map[string]interface{}, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	rows, err := p.db.QueryContext(ctx,
		`SELECT u.id, u.username, u.karma_score,
		        count(p.id) AS post_count,
		        EXTRACT(EPOCH FROM (NOW() - u.created_at)) / 86400.0 AS days_old
		 FROM users u
		 LEFT JOIN posts p ON p.author_id = u.id AND p.is_removed = FALSE
		 WHERE u.created_at > NOW() - INTERVAL '7 days'
		 GROUP BY u.id, u.username, u.karma_score
		 HAVING count(p.id) > 5
		 ORDER BY post_count DESC LIMIT 50`)
	if err != nil {
		return nil, fmt.Errorf("error en consulta de seguridad: %w", err)
	}
	defer rows.Close()

	var groups []map[string]interface{}
	for rows.Next() {
		var userID, username string
		var karma, postCount int
		var daysOld float64
		_ = rows.Scan(&userID, &username, &karma, &postCount, &daysOld)
		riskScore := float64(postCount) / (daysOld + 0.1)
		if riskScore >= riskThreshold {
			groups = append(groups, map[string]interface{}{
				"user_id":    userID,
				"username":   username,
				"risk_score": riskScore,
				"post_count": postCount,
				"days_old":   daysOld,
			})
		}
	}
	return groups, nil
}

// SearchPredictive busca en posts Y communities para resultados predictivos.
func (p *PostgresRepository) SearchPredictive(query string) ([]map[string]interface{}, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := p.db.QueryContext(ctx,
		`SELECT id, title, 'post' AS type FROM posts
		 WHERE is_removed = FALSE AND title ILIKE '%' || $1 || '%'
		 UNION ALL
		 SELECT id, name AS title, 'community' AS type FROM communities
		 WHERE name ILIKE '%' || $1 || '%'
		 LIMIT 15`, query)
	if err != nil {
		return nil, fmt.Errorf("error en búsqueda predictiva: %w", err)
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

package repository

import (
	"context"
	"crypto/rand"
	"database/sql"
	_ "embed"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"forfunable/models"
	"github.com/lib/pq"
)

//go:embed sql/extended_schema.sql
var extendedSchema string

// ErrExtendedUnavailable indica que las tablas de una función no existen o no son accesibles
// (normalmente por permisos del usuario de base de datos). El diagnóstico está en MigrationStatus.
var ErrExtendedUnavailable = errors.New("esta función aún no está activa en el servidor: un administrador debe completar la migración de la base de datos (Consola de administración > Métricas > Estado de la base de datos)")

// schemaGroups agrupa las tablas por función: cada grupo se activa por separado.
var schemaGroups = []struct {
	Name, Label string
	Tables      []string
}{
	{"core", "Guardados, sesiones, historial, cuentas, acceso privado, apelaciones y flairs (V003)",
		[]string{"user_sessions", "saved_collections", "saved_posts", "post_revisions", "account_deletions", "community_access_requests", "appeals", "community_flairs", "post_flairs"}},
	{"chat", "Chat: entregado/leído, editar y eliminar (V004)", []string{"chat_message_state", "chat_message_hidden"}},
	{"chat_media", "Chat: responder y adjuntos (V005)", []string{"chat_message_replies", "chat_attachments"}},
}

// MigrationStatus describe el resultado de la última migración (visible para administradores).
type MigrationStatus struct {
	DBUser    string            `json:"db_user"`
	Groups    map[string]bool   `json:"groups"`
	Labels    map[string]string `json:"labels"`
	Missing   []string          `json:"missing_tables"`
	NoAccess  []string          `json:"no_access_tables"`
	Errors    []string          `json:"errors"`
	FixSQL    string            `json:"fix_sql,omitempty"`
	CheckedAt time.Time         `json:"checked_at"`
}

var createRe = regexp.MustCompile(`(?is)^CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)`)

// ExtendedRepository implementa las funciones extendidas sobre PostgreSQL:
// sesiones, guardados, revisiones, eliminación de cuenta, acceso privado, apelaciones y flairs.
// Es independiente de Repository para no obligar a MemoryRepository (pruebas) a implementarlas.
type ExtendedRepository struct {
	db        *sql.DB
	available atomic.Bool // grupo "core" (V003)
	chatReady atomic.Bool // grupo "chat" (V004)
	mediaOK   atomic.Bool // grupo "chat_media" (V005)

	statusMu sync.Mutex
	status   MigrationStatus

	mu           sync.Mutex
	sessionCache map[string]sessionCacheEntry
}

type sessionCacheEntry struct {
	active  bool
	checked time.Time
}

const sessionCacheTTL = 30 * time.Second

func NewExtendedRepository(p *PostgresRepository) *ExtendedRepository {
	return &ExtendedRepository{db: p.db, sessionCache: map[string]sessionCacheEntry{}}
}

// Migrate aplica las migraciones V003+ sentencia por sentencia (idempotente): omite lo que ya
// existe, sigue ante errores y activa cada grupo de funciones solo si sus tablas existen y el
// usuario de la app puede usarlas. Se puede volver a ejecutar en caliente (Consola de administración).
func (e *ExtendedRepository) Migrate() error {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	st := MigrationStatus{Groups: map[string]bool{}, Labels: map[string]string{}, Missing: []string{}, NoAccess: []string{}, Errors: []string{}, CheckedAt: time.Now().UTC()}
	_ = e.db.QueryRowContext(ctx, `SELECT current_user`).Scan(&st.DBUser)

	exists := func(name string) bool {
		var reg sql.NullString
		_ = e.db.QueryRowContext(ctx, `SELECT to_regclass($1)::text`, "public."+name).Scan(&reg)
		return reg.Valid
	}
	for _, raw := range strings.Split(stripSQLComments(extendedSchema), ";") {
		stmt := strings.TrimSpace(raw)
		if stmt == "" {
			continue
		}
		if m := createRe.FindStringSubmatch(stmt); m != nil && exists(strings.ToLower(m[2])) {
			continue // ya existe: no hace falta permiso de creación
		}
		if _, err := e.db.ExecContext(ctx, stmt); err != nil {
			name := stmt
			if m := createRe.FindStringSubmatch(stmt); m != nil {
				name = m[2]
			} else if len(name) > 60 {
				name = name[:60] + "…"
			}
			st.Errors = append(st.Errors, fmt.Sprintf("%s: %v", name, err))
			log.Printf("[WARN] Migración: %s: %v", name, err)
		}
	}

	for _, g := range schemaGroups {
		ok := true
		for _, t := range g.Tables {
			if !exists(t) {
				st.Missing = append(st.Missing, t)
				ok = false
				continue
			}
			var priv bool
			if err := e.db.QueryRowContext(ctx, `SELECT has_table_privilege(current_user, $1, 'SELECT, INSERT, UPDATE, DELETE')`, "public."+t).Scan(&priv); err != nil || !priv {
				st.NoAccess = append(st.NoAccess, t)
				ok = false
			}
		}
		st.Groups[g.Name] = ok
		st.Labels[g.Name] = g.Label
	}
	e.available.Store(st.Groups["core"])
	e.chatReady.Store(st.Groups["chat"])
	e.mediaOK.Store(st.Groups["chat"] && st.Groups["chat_media"])

	if len(st.Missing)+len(st.NoAccess) > 0 {
		u := pq.QuoteIdentifier(st.DBUser)
		st.FixSQL = "-- Ejecutar como postgres (Cloud SQL Studio) y luego pulsar «Reintentar migración»\n" +
			"GRANT USAGE, CREATE ON SCHEMA public TO " + u + ";\n" +
			"GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES ON ALL TABLES IN SCHEMA public TO " + u + ";\n" +
			"GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO " + u + ";"
	}
	e.statusMu.Lock()
	e.status = st
	e.statusMu.Unlock()

	if !st.Groups["core"] {
		if len(st.Errors) > 0 {
			return errors.New(st.Errors[0])
		}
		return ErrExtendedUnavailable
	}
	return nil
}

// Status devuelve una copia del diagnóstico de la última migración.
func (e *ExtendedRepository) Status() MigrationStatus {
	e.statusMu.Lock()
	defer e.statusMu.Unlock()
	return e.status
}

func stripSQLComments(s string) string {
	var b strings.Builder
	for _, line := range strings.Split(s, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "--") {
			continue
		}
		b.WriteString(line)
		b.WriteString("\n")
	}
	return b.String()
}

func (e *ExtendedRepository) Available() bool { return e != nil && e.available.Load() }

// ChatReady: entregado/leído, editar y eliminar mensajes (V004)
func (e *ExtendedRepository) ChatReady() bool { return e != nil && e.chatReady.Load() }

// MediaReady: responder y adjuntos (V005)
func (e *ExtendedRepository) MediaReady() bool { return e != nil && e.mediaOK.Load() }

func (e *ExtendedRepository) chatGuard() error {
	if !e.ChatReady() {
		return ErrExtendedUnavailable
	}
	return nil
}

func (e *ExtendedRepository) mediaGuard() error {
	if !e.MediaReady() {
		return ErrExtendedUnavailable
	}
	return nil
}

func (e *ExtendedRepository) ctx() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 10*time.Second)
}

func (e *ExtendedRepository) guard() error {
	if !e.Available() {
		return ErrExtendedUnavailable
	}
	return nil
}

func isUniqueViolation(err error) bool {
	var pqErr *pq.Error
	return errors.As(err, &pqErr) && pqErr.Code == "23505"
}

// --- Sesiones ---

func (e *ExtendedRepository) CreateSession(userID, userAgent, ip string) (string, error) {
	if err := e.guard(); err != nil {
		return "", err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	if len(userAgent) > 400 {
		userAgent = userAgent[:400]
	}
	var id string
	err := e.db.QueryRowContext(ctx,
		`INSERT INTO user_sessions (user_id, user_agent, ip_address) VALUES ($1, $2, $3) RETURNING id`,
		userID, userAgent, ip).Scan(&id)
	return id, err
}

// SessionActive se consulta en cada petición autenticada: se cachea 30 s por instancia.
// Ante un error de base de datos no bloquea (falla abierto) para no tumbar la API.
func (e *ExtendedRepository) SessionActive(sid string) bool {
	if !e.Available() || sid == "" {
		return true
	}
	e.mu.Lock()
	if c, ok := e.sessionCache[sid]; ok && time.Since(c.checked) < sessionCacheTTL {
		e.mu.Unlock()
		return c.active
	}
	e.mu.Unlock()
	ctx, cancel := e.ctx()
	defer cancel()
	var revoked bool
	err := e.db.QueryRowContext(ctx, `SELECT revoked_at IS NOT NULL FROM user_sessions WHERE id::text = $1`, sid).Scan(&revoked)
	active := true
	if err == sql.ErrNoRows {
		active = false
	} else if err == nil {
		active = !revoked
	}
	e.mu.Lock()
	e.sessionCache[sid] = sessionCacheEntry{active: active, checked: time.Now()}
	e.mu.Unlock()
	return active
}

func (e *ExtendedRepository) forgetSession(ids ...string) {
	e.mu.Lock()
	for _, id := range ids {
		delete(e.sessionCache, id)
	}
	e.mu.Unlock()
}

// SessionBelongsTo comprueba que la sesión exista, no esté revocada y sea del usuario.
func (e *ExtendedRepository) SessionBelongsTo(sid, userID string) bool {
	if !e.Available() {
		return true
	}
	ctx, cancel := e.ctx()
	defer cancel()
	var owner string
	var revoked bool
	err := e.db.QueryRowContext(ctx, `SELECT user_id::text, revoked_at IS NOT NULL FROM user_sessions WHERE id::text = $1`, sid).Scan(&owner, &revoked)
	if err != nil {
		return err != sql.ErrNoRows // error de BD: no bloquear
	}
	return owner == userID && !revoked
}

func (e *ExtendedRepository) TouchSession(sid, ip string) {
	if !e.Available() || sid == "" {
		return
	}
	ctx, cancel := e.ctx()
	defer cancel()
	_, _ = e.db.ExecContext(ctx, `UPDATE user_sessions SET last_seen_at = NOW(), ip_address = COALESCE(NULLIF($2, ''), ip_address) WHERE id::text = $1`, sid, ip)
}

func (e *ExtendedRepository) ListSessions(userID string) ([]*models.UserSession, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	rows, err := e.db.QueryContext(ctx,
		`SELECT id, user_id, user_agent, ip_address, created_at, last_seen_at, revoked_at
		 FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL
		 ORDER BY last_seen_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*models.UserSession{}
	for rows.Next() {
		s := &models.UserSession{}
		if err := rows.Scan(&s.ID, &s.UserID, &s.UserAgent, &s.IPAddress, &s.CreatedAt, &s.LastSeenAt, &s.RevokedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, nil
}

// RevokeSessions revoca una sesión concreta (sid) o, si sid está vacío, todas menos keep.
func (e *ExtendedRepository) RevokeSessions(userID, sid, keep string) (int, error) {
	if err := e.guard(); err != nil {
		return 0, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	rows, err := e.db.QueryContext(ctx,
		`UPDATE user_sessions SET revoked_at = NOW()
		 WHERE user_id = $1 AND revoked_at IS NULL
		   AND ($2 = '' OR id::text = $2)
		   AND ($3 = '' OR id::text <> $3)
		 RETURNING id::text`, userID, sid, keep)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	e.forgetSession(ids...)
	return len(ids), nil
}

// --- Guardados y colecciones ---

func (e *ExtendedRepository) SavePost(userID, postID string, collectionID *string, note string) error {
	if err := e.guard(); err != nil {
		return err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	if collectionID != nil && *collectionID != "" {
		var owner string
		if err := e.db.QueryRowContext(ctx, `SELECT user_id::text FROM saved_collections WHERE id::text = $1`, *collectionID).Scan(&owner); err != nil || owner != userID {
			return errors.New("colección no encontrada")
		}
	} else {
		collectionID = nil
	}
	_, err := e.db.ExecContext(ctx,
		`INSERT INTO saved_posts (user_id, post_id, collection_id, note) VALUES ($1, $2, $3, $4)
		 ON CONFLICT (user_id, post_id) DO UPDATE SET collection_id = EXCLUDED.collection_id, note = EXCLUDED.note`,
		userID, postID, collectionID, note)
	if err != nil && strings.Contains(err.Error(), "foreign key") {
		return errors.New("publicación no encontrada")
	}
	return err
}

func (e *ExtendedRepository) UnsavePost(userID, postID string) error {
	if err := e.guard(); err != nil {
		return err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	_, err := e.db.ExecContext(ctx, `DELETE FROM saved_posts WHERE user_id = $1 AND post_id::text = $2`, userID, postID)
	return err
}

func (e *ExtendedRepository) SavedPostIDs(userID string) ([]string, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	rows, err := e.db.QueryContext(ctx, `SELECT post_id::text FROM saved_posts WHERE user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	return ids, nil
}

// ListSaved filtra por colección: "" todas, "none" sin colección, o un ID.
func (e *ExtendedRepository) ListSaved(userID, collection string) ([]*models.SavedPost, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	rows, err := e.db.QueryContext(ctx,
		`SELECT p.id, p.community_id, p.author_id, u.username, cm.name, p.title, p.content_type,
		        COALESCE(p.body_text,''), COALESCE(p.media_url,''), p.upvotes_count, p.downvotes_count,
		        p.comments_count, p.is_removed, p.created_at, s.collection_id, s.note, s.created_at
		 FROM saved_posts s
		 JOIN posts p ON p.id = s.post_id
		 JOIN users u ON u.id = p.author_id
		 JOIN communities cm ON cm.id = p.community_id
		 WHERE s.user_id = $1
		   AND ($2 = '' OR ($2 = 'none' AND s.collection_id IS NULL) OR s.collection_id::text = $2)
		 ORDER BY s.created_at DESC`, userID, collection)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*models.SavedPost{}
	for rows.Next() {
		p := &models.Post{}
		sp := &models.SavedPost{Post: p}
		if err := rows.Scan(&p.ID, &p.CommunityID, &p.AuthorID, &p.AuthorUsername, &p.CommunityName, &p.Title, &p.ContentType,
			&p.BodyText, &p.MediaURL, &p.UpvotesCount, &p.DownvotesCount, &p.CommentsCount, &p.IsRemoved, &p.CreatedAt,
			&sp.CollectionID, &sp.Note, &sp.SavedAt); err != nil {
			return nil, err
		}
		out = append(out, sp)
	}
	return out, nil
}

func (e *ExtendedRepository) ListCollections(userID string) ([]*models.SavedCollection, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	rows, err := e.db.QueryContext(ctx,
		`SELECT c.id, c.user_id, c.name, c.description, c.created_at,
		        (SELECT count(*) FROM saved_posts s WHERE s.collection_id = c.id)
		 FROM saved_collections c WHERE c.user_id = $1 ORDER BY c.created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*models.SavedCollection{}
	for rows.Next() {
		c := &models.SavedCollection{}
		if err := rows.Scan(&c.ID, &c.UserID, &c.Name, &c.Description, &c.CreatedAt, &c.ItemsCount); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, nil
}

func (e *ExtendedRepository) CreateCollection(userID, name, description string) (*models.SavedCollection, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	c := &models.SavedCollection{UserID: userID, Name: name, Description: description}
	err := e.db.QueryRowContext(ctx,
		`INSERT INTO saved_collections (user_id, name, description) VALUES ($1, $2, $3) RETURNING id, created_at`,
		userID, name, description).Scan(&c.ID, &c.CreatedAt)
	if isUniqueViolation(err) {
		return nil, errors.New("ya tienes una colección con ese nombre")
	}
	return c, err
}

func (e *ExtendedRepository) UpdateCollection(userID, id, name, description string) error {
	if err := e.guard(); err != nil {
		return err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	res, err := e.db.ExecContext(ctx, `UPDATE saved_collections SET name = $3, description = $4 WHERE id::text = $2 AND user_id = $1`, userID, id, name, description)
	if isUniqueViolation(err) {
		return errors.New("ya tienes una colección con ese nombre")
	}
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errors.New("colección no encontrada")
	}
	return nil
}

// DeleteCollection borra la colección; sus elementos quedan guardados sin colección.
func (e *ExtendedRepository) DeleteCollection(userID, id string) error {
	if err := e.guard(); err != nil {
		return err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	res, err := e.db.ExecContext(ctx, `DELETE FROM saved_collections WHERE id::text = $2 AND user_id = $1`, userID, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errors.New("colección no encontrada")
	}
	return nil
}

// --- Historial de versiones ---

func (e *ExtendedRepository) AddRevision(postID, previousBody, editedBy string) error {
	if err := e.guard(); err != nil {
		return err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	_, err := e.db.ExecContext(ctx, `INSERT INTO post_revisions (post_id, body_text, edited_by) VALUES ($1, $2, $3)`, postID, previousBody, editedBy)
	return err
}

// ListRevisions devuelve las versiones anteriores, de la más antigua a la más reciente.
func (e *ExtendedRepository) ListRevisions(postID string) ([]*models.PostRevision, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	rows, err := e.db.QueryContext(ctx,
		`SELECT r.id, r.post_id, r.body_text, COALESCE(r.edited_by::text, ''), COALESCE(u.username, ''), r.created_at
		 FROM post_revisions r LEFT JOIN users u ON u.id = r.edited_by
		 WHERE r.post_id::text = $1 ORDER BY r.created_at`, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*models.PostRevision{}
	for rows.Next() {
		r := &models.PostRevision{}
		if err := rows.Scan(&r.ID, &r.PostID, &r.BodyText, &r.EditedBy, &r.EditorName, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, nil
}

// --- Eliminación de cuenta con periodo de gracia ---

func (e *ExtendedRepository) ScheduleDeletion(userID, reason string, purgeAfter time.Time) (*models.AccountDeletion, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	d := &models.AccountDeletion{UserID: userID, Reason: reason, PurgeAfter: purgeAfter}
	err := e.db.QueryRowContext(ctx,
		`INSERT INTO account_deletions (user_id, reason, purge_after) VALUES ($1, $2, $3)
		 ON CONFLICT (user_id) DO UPDATE SET reason = EXCLUDED.reason, purge_after = EXCLUDED.purge_after,
		   requested_at = NOW(), purged_at = NULL
		 RETURNING requested_at`, userID, reason, purgeAfter).Scan(&d.RequestedAt)
	return d, err
}

func (e *ExtendedRepository) GetDeletion(userID string) (*models.AccountDeletion, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	d := &models.AccountDeletion{}
	err := e.db.QueryRowContext(ctx,
		`SELECT user_id, reason, requested_at, purge_after, purged_at FROM account_deletions WHERE user_id = $1 AND purged_at IS NULL`, userID).
		Scan(&d.UserID, &d.Reason, &d.RequestedAt, &d.PurgeAfter, &d.PurgedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return d, err
}

func (e *ExtendedRepository) CancelDeletion(userID string) (bool, error) {
	if err := e.guard(); err != nil {
		return false, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	res, err := e.db.ExecContext(ctx, `DELETE FROM account_deletions WHERE user_id = $1 AND purged_at IS NULL`, userID)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// PurgeDueDeletions anonimiza las cuentas cuyo periodo de gracia venció: se conservan las
// publicaciones (para no romper los hilos) pero desaparecen los datos personales y el acceso.
func (e *ExtendedRepository) PurgeDueDeletions() (int, error) {
	if err := e.guard(); err != nil {
		return 0, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	rows, err := e.db.QueryContext(ctx, `SELECT user_id::text FROM account_deletions WHERE purged_at IS NULL AND purge_after <= NOW()`)
	if err != nil {
		return 0, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	purged := 0
	for _, id := range ids {
		if err := e.anonymizeUser(ctx, id, "Cuenta eliminada por su titular"); err != nil {
			log.Printf("[WARN] No se pudo anonimizar la cuenta %s: %v", id, err)
			continue
		}
		purged++
	}
	return purged, nil
}

// anonymizeUser borra los datos personales de una cuenta y la desactiva para siempre.
// Las publicaciones y comentarios se conservan como de «usuario eliminado».
func (e *ExtendedRepository) anonymizeUser(ctx context.Context, id, reason string) error {
	buf := make([]byte, 16)
	_, _ = rand.Read(buf)
	tag := hex.EncodeToString(buf[:4])
	tx, err := e.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	steps := []struct {
		q    string
		args []interface{}
	}{
		{`UPDATE users SET username = $2, email = $3, password_hash = $4, avatar_url = NULL, bio = NULL,
		   is_active = FALSE, freeze_reason = $5 WHERE id = $1`,
			[]interface{}{id, "eliminado_" + tag, id + "@eliminado.invalid", "!" + hex.EncodeToString(buf), reason}},
		{`DELETE FROM saved_posts WHERE user_id = $1`, []interface{}{id}},
		{`DELETE FROM saved_collections WHERE user_id = $1`, []interface{}{id}},
		{`UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, []interface{}{id}},
		{`INSERT INTO account_deletions (user_id, reason, requested_at, purge_after, purged_at)
		  VALUES ($1, $2, NOW(), NOW(), NOW())
		  ON CONFLICT (user_id) DO UPDATE SET purged_at = NOW()`, []interface{}{id, reason}},
	}
	for _, st := range steps {
		if _, err := tx.ExecContext(ctx, st.q, st.args...); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	e.mu.Lock()
	e.sessionCache = map[string]sessionCacheEntry{} // las sesiones revocadas dejan de valer al instante
	e.mu.Unlock()
	return nil
}

// AdminDeleteUser anonimiza de inmediato una cuenta (acción de un administrador global).
func (e *ExtendedRepository) AdminDeleteUser(id, reason string) error {
	if err := e.guard(); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	return e.anonymizeUser(ctx, id, reason)
}

// --- Acceso a comunidades privadas ---

func (e *ExtendedRepository) CreateAccessRequest(communityID, userID, message string) (*models.AccessRequest, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	r := &models.AccessRequest{CommunityID: communityID, UserID: userID, Message: message, Status: "PENDING"}
	err := e.db.QueryRowContext(ctx,
		`INSERT INTO community_access_requests (community_id, user_id, message) VALUES ($1, $2, $3) RETURNING id, created_at`,
		communityID, userID, message).Scan(&r.ID, &r.CreatedAt)
	if isUniqueViolation(err) {
		return nil, errors.New("ya tienes una solicitud pendiente para esta comunidad")
	}
	return r, err
}

const accessRequestSelect = `SELECT r.id, r.community_id, c.name, r.user_id, u.username, u.karma_score, r.message, r.status,
	r.decided_by, r.decision_note, r.created_at, r.decided_at
	FROM community_access_requests r
	JOIN communities c ON c.id = r.community_id
	JOIN users u ON u.id = r.user_id `

func scanAccessRequests(rows *sql.Rows) ([]*models.AccessRequest, error) {
	defer rows.Close()
	out := []*models.AccessRequest{}
	for rows.Next() {
		r := &models.AccessRequest{}
		if err := rows.Scan(&r.ID, &r.CommunityID, &r.CommunityName, &r.UserID, &r.Username, &r.UserKarma, &r.Message, &r.Status,
			&r.DecidedBy, &r.DecisionNote, &r.CreatedAt, &r.DecidedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, nil
}

func (e *ExtendedRepository) ListAccessRequests(communityID, status string) ([]*models.AccessRequest, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	rows, err := e.db.QueryContext(ctx, accessRequestSelect+`WHERE r.community_id = $1 AND ($2 = '' OR r.status = $2) ORDER BY r.created_at DESC`, communityID, status)
	if err != nil {
		return nil, err
	}
	return scanAccessRequests(rows)
}

func (e *ExtendedRepository) MyAccessRequests(userID string) ([]*models.AccessRequest, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	rows, err := e.db.QueryContext(ctx, accessRequestSelect+`WHERE r.user_id = $1 ORDER BY r.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	return scanAccessRequests(rows)
}

func (e *ExtendedRepository) GetAccessRequest(id string) (*models.AccessRequest, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	rows, err := e.db.QueryContext(ctx, accessRequestSelect+`WHERE r.id::text = $1`, id)
	if err != nil {
		return nil, err
	}
	list, err := scanAccessRequests(rows)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, errors.New("solicitud no encontrada")
	}
	return list[0], nil
}

// DecideAccessRequest aprueba (y une a la comunidad) o rechaza una solicitud pendiente.
func (e *ExtendedRepository) DecideAccessRequest(id, status, decidedBy, note string) error {
	if err := e.guard(); err != nil {
		return err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	tx, err := e.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var commID, userID string
	err = tx.QueryRowContext(ctx,
		`UPDATE community_access_requests SET status = $2, decided_by = $3, decision_note = $4, decided_at = NOW()
		 WHERE id::text = $1 AND status = 'PENDING' RETURNING community_id::text, user_id::text`,
		id, status, decidedBy, note).Scan(&commID, &userID)
	if err == sql.ErrNoRows {
		return errors.New("la solicitud ya fue resuelta o no existe")
	}
	if err != nil {
		return err
	}
	if status == "APPROVED" {
		if _, err := tx.ExecContext(ctx, `INSERT INTO community_members (community_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, commID, userID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// --- Apelaciones ---

const appealSelect = `SELECT a.id, a.user_id, u.username, a.kind, a.reference_id, a.community_id, COALESCE(c.name, ''),
	a.message, a.status, a.resolution, a.resolved_by, a.created_at, a.resolved_at
	FROM appeals a JOIN users u ON u.id = a.user_id LEFT JOIN communities c ON c.id = a.community_id `

func scanAppeals(rows *sql.Rows) ([]*models.Appeal, error) {
	defer rows.Close()
	out := []*models.Appeal{}
	for rows.Next() {
		a := &models.Appeal{}
		if err := rows.Scan(&a.ID, &a.UserID, &a.Username, &a.Kind, &a.ReferenceID, &a.CommunityID, &a.CommunityName,
			&a.Message, &a.Status, &a.Resolution, &a.ResolvedBy, &a.CreatedAt, &a.ResolvedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}

func (e *ExtendedRepository) CreateAppeal(a *models.Appeal) error {
	if err := e.guard(); err != nil {
		return err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	err := e.db.QueryRowContext(ctx,
		`INSERT INTO appeals (user_id, kind, reference_id, community_id, message) VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, status, created_at`, a.UserID, a.Kind, a.ReferenceID, a.CommunityID, a.Message).
		Scan(&a.ID, &a.Status, &a.CreatedAt)
	if isUniqueViolation(err) {
		return errors.New("ya tienes una apelación pendiente para esta sanción")
	}
	return err
}

func (e *ExtendedRepository) ListAppeals(userID, status string) ([]*models.Appeal, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	rows, err := e.db.QueryContext(ctx, appealSelect+`WHERE ($1 = '' OR a.user_id::text = $1) AND ($2 = '' OR a.status = $2) ORDER BY a.created_at DESC`, userID, status)
	if err != nil {
		return nil, err
	}
	return scanAppeals(rows)
}

func (e *ExtendedRepository) GetAppeal(id string) (*models.Appeal, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	rows, err := e.db.QueryContext(ctx, appealSelect+`WHERE a.id::text = $1`, id)
	if err != nil {
		return nil, err
	}
	list, err := scanAppeals(rows)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, errors.New("apelación no encontrada")
	}
	return list[0], nil
}

func (e *ExtendedRepository) DecideAppeal(id, status, resolution, resolvedBy string) error {
	if err := e.guard(); err != nil {
		return err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	res, err := e.db.ExecContext(ctx,
		`UPDATE appeals SET status = $2, resolution = $3, resolved_by = $4, resolved_at = NOW() WHERE id::text = $1 AND status = 'PENDING'`,
		id, status, resolution, resolvedBy)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errors.New("la apelación ya fue resuelta o no existe")
	}
	return nil
}

// ListSanctions reúne lo apelable: sanciones de comunidad y avisos de contenido retirado.
func (e *ExtendedRepository) ListSanctions(userID string) ([]*models.Sanction, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	out := []*models.Sanction{}
	rows, err := e.db.QueryContext(ctx,
		`SELECT b.community_id::text, c.name, b.reason, b.created_at, b.expires_at,
		        (b.expires_at IS NULL OR b.expires_at > NOW())
		 FROM community_bans b JOIN communities c ON c.id = b.community_id
		 WHERE b.user_id = $1 ORDER BY b.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		s := &models.Sanction{Kind: "COMMUNITY_BAN"}
		var commID string
		if err := rows.Scan(&commID, &s.CommunityName, &s.Reason, &s.CreatedAt, &s.ExpiresAt, &s.Active); err != nil {
			rows.Close()
			return nil, err
		}
		s.CommunityID = &commID
		s.ReferenceID = "ban:" + commID
		out = append(out, s)
	}
	rows.Close()

	rows, err = e.db.QueryContext(ctx,
		`SELECT id::text, message, type, created_at FROM notifications
		 WHERE user_id = $1 AND title = 'Contenido retirado' ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		s := &models.Sanction{Kind: "CONTENT_REMOVAL", Active: true}
		var id, typ string
		if err := rows.Scan(&id, &s.Reason, &typ, &s.CreatedAt); err != nil {
			rows.Close()
			return nil, err
		}
		s.ReferenceID = "notif:" + id
		out = append(out, s)
	}
	rows.Close()

	appeals, err := e.ListAppeals(userID, "")
	if err != nil {
		return nil, err
	}
	latest := map[string]*models.Appeal{}
	for _, a := range appeals {
		if _, ok := latest[a.ReferenceID]; !ok {
			latest[a.ReferenceID] = a
		}
	}
	for _, s := range out {
		s.Appeal = latest[s.ReferenceID]
	}
	return out, nil
}

// RemovedTargetFromNotification obtiene el contenido retirado al que se refiere un aviso
// (los avisos nuevos guardan "removed:<id>" en type).
func (e *ExtendedRepository) RemovedTargetFromNotification(notifID string) string {
	ctx, cancel := e.ctx()
	defer cancel()
	var typ string
	if err := e.db.QueryRowContext(ctx, `SELECT type FROM notifications WHERE id::text = $1`, notifID).Scan(&typ); err != nil {
		return ""
	}
	if strings.HasPrefix(typ, "removed:") {
		return strings.TrimPrefix(typ, "removed:")
	}
	return ""
}

func (e *ExtendedRepository) RestorePost(postID string) (bool, error) {
	ctx, cancel := e.ctx()
	defer cancel()
	res, err := e.db.ExecContext(ctx, `UPDATE posts SET is_removed = FALSE WHERE id::text = $1 AND is_removed = TRUE`, postID)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// --- Transferencia de propiedad ---

// TransferOwnership cambia el fundador: el nuevo queda como OWNER y el anterior como LEAD_MOD.
func (e *ExtendedRepository) TransferOwnership(communityID, newOwnerID, oldOwnerID string) error {
	ctx, cancel := e.ctx()
	defer cancel()
	tx, err := e.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE communities SET creator_id = $2 WHERE id = $1`, communityID, newOwnerID); err != nil {
		return err
	}
	upsert := `INSERT INTO community_moderators (community_id, user_id, mod_role) VALUES ($1, $2, $3::mod_role_enum)
		ON CONFLICT (community_id, user_id) DO UPDATE SET mod_role = EXCLUDED.mod_role`
	if _, err := tx.ExecContext(ctx, upsert, communityID, newOwnerID, "OWNER"); err != nil {
		return err
	}
	if oldOwnerID != "" && oldOwnerID != newOwnerID {
		if _, err := tx.ExecContext(ctx, upsert, communityID, oldOwnerID, "LEAD_MOD"); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO community_members (community_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, communityID, newOwnerID); err != nil {
		return err
	}
	return tx.Commit()
}

// --- Flairs ---

func (e *ExtendedRepository) ListFlairs(communityID string) ([]*models.Flair, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	rows, err := e.db.QueryContext(ctx,
		`SELECT f.id, f.community_id, f.name, f.color, f.description, f.mod_only, f.position, f.created_at,
		        (SELECT count(*) FROM post_flairs pf JOIN posts p ON p.id = pf.post_id WHERE pf.flair_id = f.id AND p.is_removed = FALSE)
		 FROM community_flairs f WHERE f.community_id::text = $1 ORDER BY f.position, f.created_at`, communityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*models.Flair{}
	for rows.Next() {
		f := &models.Flair{}
		if err := rows.Scan(&f.ID, &f.CommunityID, &f.Name, &f.Color, &f.Description, &f.ModOnly, &f.Position, &f.CreatedAt, &f.PostsCount); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, nil
}

func (e *ExtendedRepository) GetFlair(id string) (*models.Flair, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	f := &models.Flair{}
	err := e.db.QueryRowContext(ctx,
		`SELECT id, community_id, name, color, description, mod_only, position, created_at FROM community_flairs WHERE id::text = $1`, id).
		Scan(&f.ID, &f.CommunityID, &f.Name, &f.Color, &f.Description, &f.ModOnly, &f.Position, &f.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, errors.New("flair no encontrado")
	}
	return f, err
}

func (e *ExtendedRepository) SaveFlair(f *models.Flair) error {
	if err := e.guard(); err != nil {
		return err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	var err error
	if f.ID == "" {
		err = e.db.QueryRowContext(ctx,
			`INSERT INTO community_flairs (community_id, name, color, description, mod_only, position)
			 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at`,
			f.CommunityID, f.Name, f.Color, f.Description, f.ModOnly, f.Position).Scan(&f.ID, &f.CreatedAt)
	} else {
		_, err = e.db.ExecContext(ctx,
			`UPDATE community_flairs SET name = $2, color = $3, description = $4, mod_only = $5, position = $6 WHERE id::text = $1`,
			f.ID, f.Name, f.Color, f.Description, f.ModOnly, f.Position)
	}
	if isUniqueViolation(err) {
		return errors.New("ya existe un flair con ese nombre en la comunidad")
	}
	return err
}

func (e *ExtendedRepository) DeleteFlair(id string) error {
	if err := e.guard(); err != nil {
		return err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	_, err := e.db.ExecContext(ctx, `DELETE FROM community_flairs WHERE id::text = $1`, id)
	return err
}

func (e *ExtendedRepository) SetPostFlair(postID, flairID string) error {
	if err := e.guard(); err != nil {
		return err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	if flairID == "" {
		_, err := e.db.ExecContext(ctx, `DELETE FROM post_flairs WHERE post_id::text = $1`, postID)
		return err
	}
	_, err := e.db.ExecContext(ctx,
		`INSERT INTO post_flairs (post_id, flair_id) VALUES ($1, $2) ON CONFLICT (post_id) DO UPDATE SET flair_id = EXCLUDED.flair_id`, postID, flairID)
	return err
}

func (e *ExtendedRepository) PostFlairs(postIDs []string) (map[string]*models.Flair, error) {
	out := map[string]*models.Flair{}
	if !e.Available() || len(postIDs) == 0 {
		return out, nil
	}
	ctx, cancel := e.ctx()
	defer cancel()
	rows, err := e.db.QueryContext(ctx,
		`SELECT pf.post_id::text, f.id, f.community_id, f.name, f.color, f.description, f.mod_only, f.position, f.created_at
		 FROM post_flairs pf JOIN community_flairs f ON f.id = pf.flair_id WHERE pf.post_id::text = ANY($1)`, pq.Array(postIDs))
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var pid string
		f := &models.Flair{}
		if err := rows.Scan(&pid, &f.ID, &f.CommunityID, &f.Name, &f.Color, &f.Description, &f.ModOnly, &f.Position, &f.CreatedAt); err != nil {
			return out, err
		}
		out[pid] = f
	}
	return out, nil
}

// --- Exportación de datos personales ---

func (e *ExtendedRepository) queryMaps(ctx context.Context, query string, args ...interface{}) ([]map[string]interface{}, error) {
	rows, err := e.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	out := []map[string]interface{}{}
	for rows.Next() {
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		row := map[string]interface{}{}
		for i, c := range cols {
			if b, ok := vals[i].([]byte); ok {
				row[c] = string(b)
			} else {
				row[c] = vals[i]
			}
		}
		out = append(out, row)
	}
	return out, nil
}

// exportQueries define cada sección del archivo de datos personales.
var exportQueries = []struct{ key, query string }{
	{"profile", `SELECT id, username, email, global_role, COALESCE(avatar_url,'') AS avatar_url, COALESCE(bio,'') AS bio,
		presence_status, karma_score, is_adult_verified, created_at FROM users WHERE id = $1`},
	{"posts", `SELECT p.id, c.name AS community, p.title, p.content_type, COALESCE(p.body_text,'') AS body_text,
		COALESCE(p.media_url,'') AS media_url, p.upvotes_count, p.downvotes_count, p.comments_count, p.is_removed, p.created_at
		FROM posts p JOIN communities c ON c.id = p.community_id WHERE p.author_id = $1 ORDER BY p.created_at`},
	{"comments", `SELECT id, post_id, parent_comment_id, content, score, is_removed, created_at FROM comments WHERE user_id = $1 ORDER BY created_at`},
	{"post_votes", `SELECT post_id, vote_value, created_at FROM post_votes WHERE user_id = $1`},
	{"comment_votes", `SELECT comment_id, vote_value, created_at FROM comment_votes WHERE user_id = $1`},
	{"communities", `SELECT c.name, m.joined_at, (c.creator_id = $1) AS founder FROM community_members m JOIN communities c ON c.id = m.community_id WHERE m.user_id = $1`},
	{"chat_messages", `SELECT m.conversation_id, m.message_text, m.created_at FROM chat_messages m WHERE m.sender_id = $1 ORDER BY m.created_at`},
	{"notifications", `SELECT title, message, type, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at`},
	{"reports_filed", `SELECT target_type, target_id, reason_code, COALESCE(description,'') AS description, status, created_at FROM reports WHERE reporter_id = $1`},
	{"saved_posts", `SELECT post_id, collection_id, note, created_at FROM saved_posts WHERE user_id = $1`},
	{"collections", `SELECT id, name, description, created_at FROM saved_collections WHERE user_id = $1`},
	{"sessions", `SELECT id, user_agent, ip_address, created_at, last_seen_at, revoked_at FROM user_sessions WHERE user_id = $1`},
	{"appeals", `SELECT kind, reference_id, message, status, resolution, created_at, resolved_at FROM appeals WHERE user_id = $1`},
	{"access_requests", `SELECT c.name AS community, r.message, r.status, r.created_at, r.decided_at FROM community_access_requests r JOIN communities c ON c.id = r.community_id WHERE r.user_id = $1`},
}

func (e *ExtendedRepository) ExportUserData(userID string) (map[string]interface{}, error) {
	if err := e.guard(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	out := map[string]interface{}{}
	for _, q := range exportQueries {
		rows, err := e.queryMaps(ctx, q.query, userID)
		if err != nil {
			return nil, fmt.Errorf("exportando %s: %w", q.key, err)
		}
		if q.key == "profile" {
			if len(rows) > 0 {
				out[q.key] = rows[0]
			}
			continue
		}
		out[q.key] = rows
	}
	return out, nil
}

// --- Chat estilo WhatsApp: entregado, leído, editado y eliminado (V004) ---

func chatStatus(delivered, read *time.Time) string {
	switch {
	case read != nil:
		return "read"
	case delivered != nil:
		return "delivered"
	default:
		return "sent"
	}
}

// ListChatMessages devuelve los últimos `limit` mensajes en orden cronológico, sin los que el
// lector eliminó para sí. Los eliminados para todos llegan sin texto y con Deleted=true.
func (e *ExtendedRepository) ListChatMessages(convID, viewerID string, limit int) ([]*models.ChatMessage, error) {
	if err := e.chatGuard(); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	ctx, cancel := e.ctx()
	defer cancel()
	media := e.MediaReady()
	extraCols, extraJoins := `, NULL::text, NULL::text, NULL::text, NULL::timestamptz, NULL::text, NULL::text,
		         NULL::text, NULL::text, NULL::text, NULL::text, NULL::int`, ``
	if media {
		extraCols = `, rp.reply_to_id::text, rm.sender_id::text, rm.message_text, rs.deleted_at, ra.kind, ra.filename,
		         a.id::text, a.kind, a.filename, a.mime_type, a.size_bytes`
		extraJoins = `
		  LEFT JOIN chat_message_replies rp ON rp.message_id = m.id
		  LEFT JOIN chat_messages rm ON rm.id = rp.reply_to_id
		  LEFT JOIN chat_message_state rs ON rs.message_id = rm.id
		  LEFT JOIN LATERAL (SELECT kind, filename FROM chat_attachments WHERE message_id = rm.id LIMIT 1) ra ON TRUE
		  LEFT JOIN LATERAL (SELECT id, kind, filename, mime_type, size_bytes FROM chat_attachments WHERE message_id = m.id LIMIT 1) a ON TRUE`
	}
	rows, err := e.db.QueryContext(ctx, `
		SELECT * FROM (
		  SELECT m.id, m.conversation_id, m.sender_id, m.message_text, COALESCE(m.attachment_url, ''), m.created_at,
		         s.delivered_at, s.read_at, s.edited_at, s.deleted_at`+extraCols+`
		  FROM chat_messages m
		  LEFT JOIN chat_message_state s ON s.message_id = m.id`+extraJoins+`
		  WHERE m.conversation_id = $1
		    AND NOT EXISTS (SELECT 1 FROM chat_message_hidden h WHERE h.message_id = m.id AND h.user_id = $2)
		  ORDER BY m.created_at DESC
		  LIMIT $3
		) t ORDER BY created_at ASC`, convID, viewerID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*models.ChatMessage{}
	for rows.Next() {
		m := &models.ChatMessage{}
		var deleted, replyDeleted *time.Time
		var replyID, replySender, replyText, replyKind, replyName, attID, attKind, attName, attMime sql.NullString
		var attSize sql.NullInt64
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.MessageText, &m.AttachmentURL, &m.CreatedAt,
			&m.DeliveredAt, &m.ReadAt, &m.EditedAt, &deleted,
			&replyID, &replySender, &replyText, &replyDeleted, &replyKind, &replyName,
			&attID, &attKind, &attName, &attMime, &attSize); err != nil {
			return nil, err
		}
		m.AttachmentURL = ""
		if replyID.Valid {
			ref := &models.ChatReplyRef{ID: replyID.String, SenderID: replySender.String, AttachmentKind: replyKind.String, AttachmentName: replyName.String}
			if replyDeleted != nil {
				ref.Deleted, ref.AttachmentKind, ref.AttachmentName = true, "", ""
			} else {
				ref.Text = truncateRunes(replyText.String, 160)
			}
			m.ReplyTo = ref
		}
		if attID.Valid {
			m.Attachment = &models.ChatAttachmentMeta{ID: attID.String, Kind: attKind.String, Filename: attName.String, MimeType: attMime.String, Size: int(attSize.Int64)}
		}
		if deleted != nil {
			m.Deleted, m.MessageText, m.AttachmentURL, m.EditedAt, m.Attachment, m.ReplyTo = true, "", "", nil, nil, nil
		}
		if m.SenderID == viewerID {
			m.Status = chatStatus(m.DeliveredAt, m.ReadAt)
		} else {
			m.DeliveredAt, m.ReadAt = nil, nil // el remitente es quien ve las marcas
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// MarkChatRead marca como entregados y leídos los mensajes recibidos en una conversación.
func (e *ExtendedRepository) MarkChatRead(convID, readerID string) error {
	if err := e.chatGuard(); err != nil {
		return err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	_, err := e.db.ExecContext(ctx, `
		INSERT INTO chat_message_state (message_id, delivered_at, read_at)
		SELECT m.id, NOW(), NOW() FROM chat_messages m
		WHERE m.conversation_id = $1 AND m.sender_id <> $2
		  AND NOT EXISTS (SELECT 1 FROM chat_message_state s WHERE s.message_id = m.id AND s.read_at IS NOT NULL)
		ON CONFLICT (message_id) DO UPDATE
		  SET delivered_at = COALESCE(chat_message_state.delivered_at, EXCLUDED.delivered_at),
		      read_at = COALESCE(chat_message_state.read_at, EXCLUDED.read_at)`, convID, readerID)
	return err
}

// MarkChatDelivered marca como entregados todos los mensajes que el usuario aún no había recibido
// (se llama cuando su app consulta la bandeja o los contadores, es decir, cuando está conectado).
func (e *ExtendedRepository) MarkChatDelivered(userID string) error {
	if err := e.chatGuard(); err != nil {
		return err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	_, err := e.db.ExecContext(ctx, `
		INSERT INTO chat_message_state (message_id, delivered_at)
		SELECT m.id, NOW() FROM chat_messages m
		JOIN chat_conversations c ON c.id = m.conversation_id
		WHERE (c.user1_id = $1 OR c.user2_id = $1) AND m.sender_id <> $1
		  AND NOT EXISTS (SELECT 1 FROM chat_message_state s WHERE s.message_id = m.id AND s.delivered_at IS NOT NULL)
		ON CONFLICT (message_id) DO UPDATE SET delivered_at = COALESCE(chat_message_state.delivered_at, EXCLUDED.delivered_at)`, userID)
	return err
}

// UnreadChatCount cuenta los mensajes recibidos sin leer (sin los eliminados ni ocultos).
func (e *ExtendedRepository) UnreadChatCount(userID string) (int, error) {
	if err := e.chatGuard(); err != nil {
		return 0, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	var n int
	err := e.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM chat_messages m
		JOIN chat_conversations c ON c.id = m.conversation_id
		LEFT JOIN chat_message_state s ON s.message_id = m.id
		WHERE (c.user1_id = $1 OR c.user2_id = $1) AND m.sender_id <> $1
		  AND s.read_at IS NULL AND s.deleted_at IS NULL
		  AND NOT EXISTS (SELECT 1 FROM chat_message_hidden h WHERE h.message_id = m.id AND h.user_id = $1)`, userID).Scan(&n)
	return n, err
}

// ListChatConversations: bandeja con último mensaje visible, sus marcas y los no leídos.
func (e *ExtendedRepository) ListChatConversations(userID string) ([]*models.ChatConversation, error) {
	if err := e.chatGuard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	attCols := `NULL::text, NULL::text`
	if e.MediaReady() {
		attCols = `(SELECT kind FROM chat_attachments WHERE message_id = lm.id LIMIT 1), (SELECT filename FROM chat_attachments WHERE message_id = lm.id LIMIT 1)`
	}
	rows, err := e.db.QueryContext(ctx, `
		SELECT c.id, c.user1_id, c.user2_id, u.username, c.created_at, c.updated_at,
		       lm.sender_id, COALESCE(lm.message_text, ''), lm.created_at, ls.delivered_at, ls.read_at, ls.deleted_at, `+attCols+`,
		       (SELECT COUNT(*) FROM chat_messages m2
		          LEFT JOIN chat_message_state s2 ON s2.message_id = m2.id
		         WHERE m2.conversation_id = c.id AND m2.sender_id <> $1 AND s2.read_at IS NULL AND s2.deleted_at IS NULL
		           AND NOT EXISTS (SELECT 1 FROM chat_message_hidden h2 WHERE h2.message_id = m2.id AND h2.user_id = $1))
		FROM chat_conversations c
		JOIN users u ON u.id = CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END
		LEFT JOIN LATERAL (
		  SELECT m.id, m.sender_id, m.message_text, m.created_at FROM chat_messages m
		  WHERE m.conversation_id = c.id
		    AND NOT EXISTS (SELECT 1 FROM chat_message_hidden h WHERE h.message_id = m.id AND h.user_id = $1)
		  ORDER BY m.created_at DESC LIMIT 1
		) lm ON TRUE
		LEFT JOIN chat_message_state ls ON ls.message_id = lm.id
		WHERE c.user1_id = $1 OR c.user2_id = $1
		ORDER BY COALESCE(lm.created_at, c.updated_at) DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*models.ChatConversation{}
	for rows.Next() {
		c := &models.ChatConversation{}
		var sender, attKind, attName sql.NullString
		var delivered, read, deleted *time.Time
		if err := rows.Scan(&c.ID, &c.User1ID, &c.User2ID, &c.OtherUsername, &c.CreatedAt, &c.UpdatedAt,
			&sender, &c.LastMessage, &c.LastMessageAt, &delivered, &read, &deleted, &attKind, &attName, &c.UnreadCount); err != nil {
			return nil, err
		}
		if sender.Valid {
			c.LastMessageMine = sender.String == userID
			if c.LastMessageMine {
				c.LastMessageStatus = chatStatus(delivered, read)
			}
			c.LastAttachment, c.LastAttachName = attKind.String, attName.String
			if deleted != nil {
				c.LastMessageGone, c.LastMessage, c.LastAttachment, c.LastAttachName = true, "", "", ""
			}
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ChatMessageRef reúne lo necesario para autorizar editar o eliminar un mensaje.
type ChatMessageRef struct {
	ID, ConversationID, SenderID, User1ID, User2ID string
	CreatedAt                                      time.Time
	Deleted                                        bool
}

func (e *ExtendedRepository) GetChatMessageRef(id string) (*ChatMessageRef, error) {
	if err := e.chatGuard(); err != nil {
		return nil, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	r := &ChatMessageRef{}
	var deleted *time.Time
	err := e.db.QueryRowContext(ctx, `
		SELECT m.id, m.conversation_id, m.sender_id, c.user1_id, c.user2_id, m.created_at, s.deleted_at
		FROM chat_messages m
		JOIN chat_conversations c ON c.id = m.conversation_id
		LEFT JOIN chat_message_state s ON s.message_id = m.id
		WHERE m.id = $1`, id).Scan(&r.ID, &r.ConversationID, &r.SenderID, &r.User1ID, &r.User2ID, &r.CreatedAt, &deleted)
	if err == sql.ErrNoRows {
		return nil, errors.New("mensaje no encontrado")
	}
	r.Deleted = deleted != nil
	return r, err
}

func (e *ExtendedRepository) EditChatMessage(id, text string) (time.Time, error) {
	if err := e.chatGuard(); err != nil {
		return time.Time{}, err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	tx, err := e.db.BeginTx(ctx, nil)
	if err != nil {
		return time.Time{}, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE chat_messages SET message_text = $2 WHERE id = $1`, id, text); err != nil {
		return time.Time{}, err
	}
	var at time.Time
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO chat_message_state (message_id, edited_at) VALUES ($1, NOW())
		ON CONFLICT (message_id) DO UPDATE SET edited_at = NOW()
		RETURNING edited_at`, id).Scan(&at); err != nil {
		return time.Time{}, err
	}
	return at, tx.Commit()
}

// DeleteChatMessageForAll borra el contenido para ambos participantes y deja la marca "eliminado".
func (e *ExtendedRepository) DeleteChatMessageForAll(id string) error {
	if err := e.chatGuard(); err != nil {
		return err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	tx, err := e.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE chat_messages SET message_text = '', attachment_url = NULL WHERE id = $1`, id); err != nil {
		return err
	}
	if e.MediaReady() {
		if _, err := tx.ExecContext(ctx, `DELETE FROM chat_attachments WHERE message_id = $1`, id); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO chat_message_state (message_id, deleted_at) VALUES ($1, NOW())
		ON CONFLICT (message_id) DO UPDATE SET deleted_at = NOW()`, id); err != nil {
		return err
	}
	return tx.Commit()
}

// HideChatMessage implementa "eliminar para mí".
func (e *ExtendedRepository) HideChatMessage(id, userID string) error {
	if err := e.chatGuard(); err != nil {
		return err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	_, err := e.db.ExecContext(ctx, `INSERT INTO chat_message_hidden (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, id, userID)
	return err
}

func truncateRunes(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

// --- Chat: responder y adjuntos (V005) ---

// SetReply enlaza un mensaje con el que responde; ambos deben ser de la misma conversación.
func (e *ExtendedRepository) SetReply(messageID, replyToID, convID string) error {
	if err := e.mediaGuard(); err != nil {
		return err
	}
	ctx, cancel := e.ctx()
	defer cancel()
	res, err := e.db.ExecContext(ctx, `
		INSERT INTO chat_message_replies (message_id, reply_to_id)
		SELECT $1, m.id FROM chat_messages m WHERE m.id = $2 AND m.conversation_id = $3
		ON CONFLICT (message_id) DO NOTHING`, messageID, replyToID, convID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errors.New("el mensaje al que respondes no existe en esta conversación")
	}
	return nil
}

// ReplyTargetOK comprueba que el mensaje citado pertenece a la conversación.
func (e *ExtendedRepository) ReplyTargetOK(replyToID, convID string) bool {
	if e.mediaGuard() != nil {
		return false
	}
	ctx, cancel := e.ctx()
	defer cancel()
	var ok bool
	_ = e.db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM chat_messages WHERE id::text = $1 AND conversation_id = $2)`, replyToID, convID).Scan(&ok)
	return ok
}

// SaveAttachment guarda el archivo y lo vincula al mensaje.
func (e *ExtendedRepository) SaveAttachment(messageID, uploaderID, kind, filename, mime string, data []byte) (*models.ChatAttachmentMeta, error) {
	if err := e.mediaGuard(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	meta := &models.ChatAttachmentMeta{Kind: kind, Filename: filename, MimeType: mime, Size: len(data)}
	err := e.db.QueryRowContext(ctx, `
		INSERT INTO chat_attachments (message_id, uploader_id, kind, filename, mime_type, size_bytes, data)
		VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
		messageID, uploaderID, kind, filename, mime, len(data), data).Scan(&meta.ID)
	if err != nil {
		return nil, err
	}
	_, _ = e.db.ExecContext(ctx, `UPDATE chat_messages SET attachment_url = $2 WHERE id = $1`, messageID, "att:"+meta.ID)
	return meta, nil
}

// DeleteChatMessageHard borra un mensaje recién creado si falló la subida de su adjunto.
func (e *ExtendedRepository) DeleteChatMessageHard(id string) {
	ctx, cancel := e.ctx()
	defer cancel()
	_, _ = e.db.ExecContext(ctx, `DELETE FROM chat_messages WHERE id = $1`, id)
}

// AttachmentFile es un adjunto con su contenido y los participantes autorizados.
type AttachmentFile struct {
	models.ChatAttachmentMeta
	Data             []byte
	User1ID, User2ID string
}

func (e *ExtendedRepository) GetAttachment(id string) (*AttachmentFile, error) {
	if err := e.mediaGuard(); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	f := &AttachmentFile{}
	err := e.db.QueryRowContext(ctx, `
		SELECT a.id, a.kind, a.filename, a.mime_type, a.size_bytes, a.data, c.user1_id, c.user2_id
		FROM chat_attachments a
		JOIN chat_messages m ON m.id = a.message_id
		JOIN chat_conversations c ON c.id = m.conversation_id
		WHERE a.id::text = $1`, id).Scan(&f.ID, &f.Kind, &f.Filename, &f.MimeType, &f.Size, &f.Data, &f.User1ID, &f.User2ID)
	if err == sql.ErrNoRows {
		return nil, errors.New("archivo no encontrado")
	}
	return f, err
}

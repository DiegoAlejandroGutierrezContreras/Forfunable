package repository

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"forfunable/models"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type MemoryRepository struct {
	mu                   sync.RWMutex
	users                map[string]*models.User
	usersByEmail         map[string]*models.User
	usersByUsername      map[string]*models.User
	communities          map[string]*models.Community
	communitiesByName    map[string]*models.Community
	communityMembers     map[string]map[string]bool                       // commID -> map[userID]bool
	communityModerators  map[string]map[string]*models.CommunityModerator // commID -> map[userID]mod
	communityBans        map[string]map[string]*models.CommunityBan       // commID -> map[userID]ban
	posts                map[string]*models.Post
	comments             map[string]*models.Comment
	postVotes            map[string]int // "userID:postID" -> voteValue
	commentVotes         map[string]int // "userID:commentID" -> voteValue
	chatRequests         map[string]*models.ChatRequest
	chatConversations    map[string]*models.ChatConversation
	chatMessages         map[string]*models.ChatMessage
	userBlocks           map[string]map[string]bool // blockerID -> map[blockedID]bool
	reports              map[string]*models.Report
	moderationLogs       []*models.ModerationLog
	notificationSettings map[string]*models.NotificationSettings
	notifications        map[string]*models.Notification
	communityNotes       map[string]*models.CommunityNote
	communityNoteVotes   map[string]bool // "noteID:userID" -> isHelpful
}

func NewMemoryRepository() *MemoryRepository {
	repo := &MemoryRepository{
		users:                make(map[string]*models.User),
		usersByEmail:         make(map[string]*models.User),
		usersByUsername:      make(map[string]*models.User),
		communities:          make(map[string]*models.Community),
		communitiesByName:    make(map[string]*models.Community),
		communityMembers:     make(map[string]map[string]bool),
		communityModerators:  make(map[string]map[string]*models.CommunityModerator),
		communityBans:        make(map[string]map[string]*models.CommunityBan),
		posts:                make(map[string]*models.Post),
		comments:             make(map[string]*models.Comment),
		postVotes:            make(map[string]int),
		commentVotes:         make(map[string]int),
		chatRequests:         make(map[string]*models.ChatRequest),
		chatConversations:    make(map[string]*models.ChatConversation),
		chatMessages:         make(map[string]*models.ChatMessage),
		userBlocks:           make(map[string]map[string]bool),
		reports:              make(map[string]*models.Report),
		moderationLogs:       make([]*models.ModerationLog, 0),
		notificationSettings: make(map[string]*models.NotificationSettings),
		notifications:        make(map[string]*models.Notification),
		communityNotes:       make(map[string]*models.CommunityNote),
		communityNoteVotes:   make(map[string]bool),
	}

	repo.seedInitialData()
	return repo
}

func (m *MemoryRepository) seedInitialData() {
	passHash, _ := bcrypt.GenerateFromPassword([]byte("Password123!"), bcrypt.DefaultCost)

	// Usuarios
	admin := &models.User{
		ID:              "a0000000-0000-0000-0000-000000000001",
		Username:        "admin_master",
		Email:           "admin@forfunable.com",
		PasswordHash:    string(passHash),
		GlobalRole:      models.RoleGlobalAdmin,
		AvatarURL:       "https://avatar.iran.liara.run/public/1",
		Bio:             "Administrador Global del Sistema",
		PresenceStatus:  "ONLINE",
		KarmaScore:      9999,
		IsAdultVerified: true,
		IsActive:        true,
		CreatedAt:       time.Now().Add(-48 * time.Hour),
	}
	m.users[admin.ID] = admin
	m.usersByEmail[admin.Email] = admin
	m.usersByUsername[admin.Username] = admin

	mod := &models.User{
		ID:              "a0000000-0000-0000-0000-000000000002",
		Username:        "mod_diego",
		Email:           "diego@forfunable.com",
		PasswordHash:    string(passHash),
		GlobalRole:      models.RoleCommunityMod,
		AvatarURL:       "https://avatar.iran.liara.run/public/2",
		Bio:             "Moderador de comunidades tecnológicas",
		PresenceStatus:  "ONLINE",
		KarmaScore:      500,
		IsAdultVerified: true,
		IsActive:        true,
		CreatedAt:       time.Now().Add(-24 * time.Hour),
	}
	m.users[mod.ID] = mod
	m.usersByEmail[mod.Email] = mod
	m.usersByUsername[mod.Username] = mod

	kiba := &models.User{
		ID:              "a0000000-0000-0000-0000-000000000003",
		Username:        "kiba_dev",
		Email:           "kiba@forfunable.com",
		PasswordHash:    string(passHash),
		GlobalRole:      models.RoleUser,
		AvatarURL:       "https://avatar.iran.liara.run/public/3",
		Bio:             "Desarrollador de software libre y entusiasta de Go",
		PresenceStatus:  "ONLINE",
		KarmaScore:      250,
		IsAdultVerified: true,
		IsActive:        true,
		CreatedAt:       time.Now().Add(-12 * time.Hour),
	}
	m.users[kiba.ID] = kiba
	m.usersByEmail[kiba.Email] = kiba
	m.usersByUsername[kiba.Username] = kiba

	newbie := &models.User{
		ID:              "a0000000-0000-0000-0000-000000000004",
		Username:        "newbie_user",
		Email:           "newbie@forfunable.com",
		PasswordHash:    string(passHash),
		GlobalRole:      models.RoleUser,
		AvatarURL:       "https://avatar.iran.liara.run/public/4",
		Bio:             "Usuario recién registrado",
		PresenceStatus:  "OFFLINE",
		KarmaScore:      10,
		IsAdultVerified: false,
		IsActive:        true,
		CreatedAt:       time.Now().Add(-2 * time.Hour),
	}
	m.users[newbie.ID] = newbie
	m.usersByEmail[newbie.Email] = newbie
	m.usersByUsername[newbie.Username] = newbie

	// Comunidad
	commGolang := &models.Community{
		ID:            "b0000000-0000-0000-0000-000000000001",
		Name:          "golang",
		Description:   "Comunidad en español para desarrolladores en lenguaje Go.",
		RulesText:     "1. Respetar a los demás. 2. Compartir código limpio. 3. No spam.",
		IsPrivate:     false,
		AgeRestricted: false,
		CreatorID:     kiba.ID,
		CreatedAt:     time.Now().Add(-10 * time.Hour),
		MembersCount:  3,
	}
	m.communities[commGolang.ID] = commGolang
	m.communitiesByName[commGolang.Name] = commGolang
	m.communityMembers[commGolang.ID] = map[string]bool{
		kiba.ID:   true,
		admin.ID:  true,
		newbie.ID: true,
	}
	m.communityModerators[commGolang.ID] = map[string]*models.CommunityModerator{
		kiba.ID: {
			CommunityID: commGolang.ID,
			UserID:      kiba.ID,
			ModRole:     models.ModRoleOwner,
			Permissions: map[string]interface{}{"can_ban": true, "can_remove": true, "can_pin": true},
			AssignedAt:  time.Now(),
		},
		mod.ID: {
			CommunityID: commGolang.ID,
			UserID:      mod.ID,
			ModRole:     models.ModRoleLeadMod,
			Permissions: map[string]interface{}{"can_ban": true, "can_remove": true, "can_pin": true},
			AssignedAt:  time.Now(),
		},
	}

	// Post inicial
	post := &models.Post{
		ID:             "c0000000-0000-0000-0000-000000000001",
		CommunityID:    commGolang.ID,
		AuthorID:       kiba.ID,
		AuthorUsername: kiba.Username,
		Title:          "¡Bienvenidos a Forfunable en Go!",
		ContentType:    models.ContentTypeText,
		BodyText:       "Este es el primer post de la plataforma desarrollado en Go con Gin y Cloud SQL PostgreSQL.",
		MediaURL:       "",
		UpvotesCount:   10,
		DownvotesCount: 0,
		CommentsCount:  2,
		IsRemoved:      false,
		CreatedAt:      time.Now().Add(-5 * time.Hour),
	}
	m.posts[post.ID] = post

	// Comentarios iniciales (ltree jerárquico)
	c1ID := "d0000000-0000-0000-0000-000000000001"
	pTag := strings.ReplaceAll(post.ID, "-", "_")
	c1Tag := strings.ReplaceAll(c1ID, "-", "_")
	c1Path := fmt.Sprintf("%s.%s", pTag, c1Tag)

	comment1 := &models.Comment{
		ID:              c1ID,
		PostID:          post.ID,
		UserID:          mod.ID,
		AuthorUsername:  mod.Username,
		ParentCommentID: nil,
		Content:         "Excelente iniciativa. La arquitectura con ltree es muy rápida.",
		Path:            c1Path,
		Depth:           0,
		Score:           5,
		IsRemoved:       false,
		CreatedAt:       time.Now().Add(-4 * time.Hour),
	}
	m.comments[comment1.ID] = comment1

	c2ID := "d0000000-0000-0000-0000-000000000002"
	c2Tag := strings.ReplaceAll(c2ID, "-", "_")
	c2Path := fmt.Sprintf("%s.%s", c1Path, c2Tag)
	pIDRef := c1ID

	comment2 := &models.Comment{
		ID:              c2ID,
		PostID:          post.ID,
		UserID:          kiba.ID,
		AuthorUsername:  kiba.Username,
		ParentCommentID: &pIDRef,
		Content:         "¡Totalmente de acuerdo! Cero consultas recursivas WITH RECURSIVE.",
		Path:            c2Path,
		Depth:           1,
		Score:           3,
		IsRemoved:       false,
		CreatedAt:       time.Now().Add(-3 * time.Hour),
	}
	m.comments[comment2.ID] = comment2

	// Settings de notificaciones
	for _, u := range []*models.User{admin, mod, kiba, newbie} {
		m.notificationSettings[u.ID] = &models.NotificationSettings{
			UserID:                u.ID,
			EmailOnReply:          true,
			EmailOnMention:        true,
			PushOnChatRequest:     true,
			PushOnCommunityUpdate: false,
		}
	}
}

// Implementación de Repository para MemoryRepository

// --- Usuarios ---
func (m *MemoryRepository) CreateUser(u *models.User) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.usersByEmail[u.Email]; exists {
		return errors.New("el correo electrónico ya se encuentra registrado")
	}
	if _, exists := m.usersByUsername[u.Username]; exists {
		return errors.New("el nombre de usuario ya está en uso")
	}

	if u.ID == "" {
		u.ID = uuid.New().String()
	}
	u.CreatedAt = time.Now()
	u.IsActive = true
	u.PresenceStatus = "OFFLINE"

	m.users[u.ID] = u
	m.usersByEmail[u.Email] = u
	m.usersByUsername[u.Username] = u
	m.notificationSettings[u.ID] = &models.NotificationSettings{
		UserID:                u.ID,
		EmailOnReply:          true,
		EmailOnMention:        true,
		PushOnChatRequest:     true,
		PushOnCommunityUpdate: false,
	}
	return nil
}

func (m *MemoryRepository) GetUserByID(id string) (*models.User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	u, ok := m.users[id]
	if !ok {
		return nil, errors.New("usuario no encontrado")
	}
	return u, nil
}

func (m *MemoryRepository) GetUserByEmail(email string) (*models.User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	u, ok := m.usersByEmail[email]
	if !ok {
		return nil, errors.New("usuario no encontrado")
	}
	return u, nil
}

func (m *MemoryRepository) GetUserByUsername(username string) (*models.User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	u, ok := m.usersByUsername[username]
	if !ok {
		return nil, errors.New("usuario no encontrado")
	}
	return u, nil
}

func (m *MemoryRepository) UpdateUserProfile(id, avatarURL, bio string) (*models.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[id]
	if !ok {
		return nil, errors.New("usuario no encontrado")
	}
	if avatarURL != "" {
		u.AvatarURL = avatarURL
	}
	if bio != "" {
		u.Bio = bio
	}
	return u, nil
}

func (m *MemoryRepository) UpdateUserStatus(id, status string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[id]
	if !ok {
		return errors.New("usuario no encontrado")
	}
	u.PresenceStatus = status
	return nil
}

func (m *MemoryRepository) VerifyUserAge(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[id]
	if !ok {
		return errors.New("usuario no encontrado")
	}
	u.IsAdultVerified = true
	return nil
}

func (m *MemoryRepository) ListUsers(search, role, status string, page, limit int) ([]*models.User, int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*models.User
	for _, u := range m.users {
		if search != "" && !strings.Contains(strings.ToLower(u.Username), strings.ToLower(search)) && !strings.Contains(strings.ToLower(u.Email), strings.ToLower(search)) {
			continue
		}
		if role != "" && u.GlobalRole != role {
			continue
		}
		if status == "active" && !u.IsActive {
			continue
		}
		if status == "suspended" && u.IsActive {
			continue
		}
		result = append(result, u)
	}

	total := len(result)
	start := (page - 1) * limit
	if start >= total {
		return []*models.User{}, total, nil
	}
	end := start + limit
	if end > total {
		end = total
	}
	return result[start:end], total, nil
}

func (m *MemoryRepository) UpdateUserRole(id, role string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[id]
	if !ok {
		return errors.New("usuario no encontrado")
	}
	u.GlobalRole = role
	return nil
}

func (m *MemoryRepository) UpdateUserGlobalStatus(id string, isActive bool, freezeReason string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[id]
	if !ok {
		return errors.New("usuario no encontrado")
	}
	u.IsActive = isActive
	u.FreezeReason = freezeReason
	return nil
}

// --- Comunidades ---
func (m *MemoryRepository) CreateCommunity(c *models.Community) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.communitiesByName[c.Name]; exists {
		return errors.New("ya existe una comunidad con este nombre")
	}

	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	c.CreatedAt = time.Now()
	c.MembersCount = 1

	m.communities[c.ID] = c
	m.communitiesByName[c.Name] = c

	if m.communityMembers[c.ID] == nil {
		m.communityMembers[c.ID] = make(map[string]bool)
	}
	m.communityMembers[c.ID][c.CreatorID] = true

	if m.communityModerators[c.ID] == nil {
		m.communityModerators[c.ID] = make(map[string]*models.CommunityModerator)
	}
	m.communityModerators[c.ID][c.CreatorID] = &models.CommunityModerator{
		CommunityID: c.ID,
		UserID:      c.CreatorID,
		ModRole:     models.ModRoleOwner,
		Permissions: map[string]interface{}{"can_ban": true, "can_remove": true, "can_pin": true},
		AssignedAt:  time.Now(),
	}
	return nil
}

func (m *MemoryRepository) GetCommunityByID(id string) (*models.Community, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	c, ok := m.communities[id]
	if !ok {
		return nil, errors.New("comunidad no encontrada")
	}
	return c, nil
}

func (m *MemoryRepository) GetCommunityByName(name string) (*models.Community, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	c, ok := m.communitiesByName[name]
	if !ok {
		return nil, errors.New("comunidad no encontrada")
	}
	return c, nil
}

func (m *MemoryRepository) ListCommunities(search, sortType string, page, limit int) ([]*models.Community, int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*models.Community
	for _, c := range m.communities {
		if search != "" && !strings.Contains(strings.ToLower(c.Name), strings.ToLower(search)) && !strings.Contains(strings.ToLower(c.Description), strings.ToLower(search)) {
			continue
		}
		result = append(result, c)
	}

	total := len(result)
	start := (page - 1) * limit
	if start >= total {
		return []*models.Community{}, total, nil
	}
	end := start + limit
	if end > total {
		end = total
	}
	return result[start:end], total, nil
}

func (m *MemoryRepository) JoinCommunity(commID, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	comm, ok := m.communities[commID]
	if !ok {
		return errors.New("comunidad no encontrada")
	}

	if m.communityMembers[commID] == nil {
		m.communityMembers[commID] = make(map[string]bool)
	}
	if m.communityMembers[commID][userID] {
		return errors.New("el usuario ya es miembro de esta comunidad")
	}

	m.communityMembers[commID][userID] = true
	comm.MembersCount = len(m.communityMembers[commID])
	return nil
}

func (m *MemoryRepository) LeaveCommunity(commID, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	comm, ok := m.communities[commID]
	if !ok {
		return errors.New("comunidad no encontrada")
	}

	if m.communityMembers[commID] == nil || !m.communityMembers[commID][userID] {
		return errors.New("el usuario no pertenece a esta comunidad")
	}

	delete(m.communityMembers[commID], userID)
	comm.MembersCount = len(m.communityMembers[commID])
	return nil
}

func (m *MemoryRepository) IsCommunityMember(commID, userID string) (bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	members, ok := m.communityMembers[commID]
	if !ok {
		return false, nil
	}
	return members[userID], nil
}

func (m *MemoryRepository) AssignCommunityModerator(mod *models.CommunityModerator) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.communities[mod.CommunityID]; !ok {
		return errors.New("comunidad no encontrada")
	}
	if _, ok := m.users[mod.UserID]; !ok {
		return errors.New("usuario no encontrado")
	}

	if m.communityModerators[mod.CommunityID] == nil {
		m.communityModerators[mod.CommunityID] = make(map[string]*models.CommunityModerator)
	}
	mod.AssignedAt = time.Now()
	m.communityModerators[mod.CommunityID][mod.UserID] = mod
	return nil
}

func (m *MemoryRepository) GetCommunityModerators(commID string) ([]models.CommunityModerator, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	modsMap, ok := m.communityModerators[commID]
	if !ok {
		return []models.CommunityModerator{}, nil
	}
	var list []models.CommunityModerator
	for _, mod := range modsMap {
		list = append(list, *mod)
	}
	return list, nil
}

func (m *MemoryRepository) GetCommunityModerator(commID, userID string) (*models.CommunityModerator, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	modsMap, ok := m.communityModerators[commID]
	if !ok {
		return nil, nil
	}
	return modsMap[userID], nil
}

func (m *MemoryRepository) UpdateCommunitySettings(commID, rulesText string, isPrivate, ageRestricted bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	comm, ok := m.communities[commID]
	if !ok {
		return errors.New("comunidad no encontrada")
	}
	if rulesText != "" {
		comm.RulesText = rulesText
	}
	comm.IsPrivate = isPrivate
	comm.AgeRestricted = ageRestricted
	return nil
}

// --- Publicaciones ---
func (m *MemoryRepository) CreatePost(p *models.Post) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.communities[p.CommunityID]; !ok {
		return errors.New("comunidad inexistente")
	}

	author, ok := m.users[p.AuthorID]
	if !ok {
		return errors.New("autor inexistente")
	}

	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	p.AuthorUsername = author.Username
	p.CreatedAt = time.Now()
	p.UpvotesCount = 1
	p.DownvotesCount = 0
	p.CommentsCount = 0
	p.IsRemoved = false

	m.posts[p.ID] = p
	m.postVotes[fmt.Sprintf("%s:%s", p.AuthorID, p.ID)] = 1
	return nil
}

func (m *MemoryRepository) GetPostByID(id string) (*models.Post, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	p, ok := m.posts[id]
	if !ok || p.IsRemoved {
		return nil, errors.New("publicación no encontrada")
	}
	return p, nil
}

func (m *MemoryRepository) ListPosts(communityID, sortType string, page, limit int) ([]*models.Post, int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*models.Post
	for _, p := range m.posts {
		if p.IsRemoved {
			continue
		}
		if communityID != "" && p.CommunityID != communityID {
			continue
		}
		result = append(result, p)
	}

	// Ordenación
	if sortType == "top" {
		sort.Slice(result, func(i, j int) bool {
			return (result[i].UpvotesCount - result[i].DownvotesCount) > (result[j].UpvotesCount - result[j].DownvotesCount)
		})
	} else {
		// Newest por defecto
		sort.Slice(result, func(i, j int) bool {
			return result[i].CreatedAt.After(result[j].CreatedAt)
		})
	}

	total := len(result)
	start := (page - 1) * limit
	if start >= total {
		return []*models.Post{}, total, nil
	}
	end := start + limit
	if end > total {
		end = total
	}
	return result[start:end], total, nil
}

func (m *MemoryRepository) UpdatePost(id, bodyText string) (*models.Post, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	p, ok := m.posts[id]
	if !ok || p.IsRemoved {
		return nil, errors.New("publicación no encontrada")
	}
	p.BodyText = bodyText
	return p, nil
}

func (m *MemoryRepository) DeletePost(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	p, ok := m.posts[id]
	if !ok || p.IsRemoved {
		return errors.New("publicación no encontrada")
	}
	p.IsRemoved = true
	return nil
}

func (m *MemoryRepository) RemovePostByAdmin(id string) error {
	return m.DeletePost(id)
}

// Algoritmo de Atenuación Temporal (Hot Ranking Decay):
// Score_hot = S_net / (T + 2)^G, donde G = 1.8
func (m *MemoryRepository) GetRecommendedFeed(cursor string, limit int) ([]*models.Post, string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	now := time.Now()
	const G = 1.8

	var posts []*models.Post
	for _, p := range m.posts {
		if p.IsRemoved {
			continue
		}
		sNet := float64(p.UpvotesCount - p.DownvotesCount)
		tHours := now.Sub(p.CreatedAt).Hours()
		if tHours < 0 {
			tHours = 0
		}
		scoreHot := sNet / math.Pow(tHours+2.0, G)

		copyPost := *p
		copyPost.HotRankingScore = scoreHot
		posts = append(posts, &copyPost)
	}

	sort.Slice(posts, func(i, j int) bool {
		return posts[i].HotRankingScore > posts[j].HotRankingScore
	})

	if limit <= 0 {
		limit = 20
	}
	if len(posts) > limit {
		posts = posts[:limit]
	}

	nextCursor := ""
	if len(posts) > 0 {
		nextCursor = posts[len(posts)-1].ID
	}
	return posts, nextCursor, nil
}

// --- Comentarios Jerárquicos ltree ---
func (m *MemoryRepository) CreateComment(c *models.Comment) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	p, ok := m.posts[c.PostID]
	if !ok || p.IsRemoved {
		return errors.New("publicación no encontrada")
	}

	user, ok := m.users[c.UserID]
	if !ok {
		return errors.New("usuario no encontrado")
	}

	if c.ID == "" {
		c.ID = uuid.New().String()
	}
	c.AuthorUsername = user.Username
	c.CreatedAt = time.Now()
	c.Score = 0
	c.IsRemoved = false

	postTag := strings.ReplaceAll(c.PostID, "-", "_")
	commentTag := strings.ReplaceAll(c.ID, "-", "_")

	if c.ParentCommentID == nil || *c.ParentCommentID == "" {
		c.Depth = 0
		c.Path = fmt.Sprintf("%s.%s", postTag, commentTag)
	} else {
		parent, ok := m.comments[*c.ParentCommentID]
		if !ok || parent.IsRemoved {
			return errors.New("comentario padre no encontrado")
		}
		c.Depth = parent.Depth + 1
		c.Path = fmt.Sprintf("%s.%s", parent.Path, commentTag)
	}

	m.comments[c.ID] = c
	p.CommentsCount++
	return nil
}

func (m *MemoryRepository) GetCommentByID(id string) (*models.Comment, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	c, ok := m.comments[id]
	if !ok {
		return nil, errors.New("comentario no encontrado")
	}
	return c, nil
}

func (m *MemoryRepository) ListCommentsByPost(postID, sortBy string, maxDepth int) ([]*models.Comment, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*models.Comment
	for _, c := range m.comments {
		if c.PostID != postID {
			continue
		}
		if maxDepth > 0 && c.Depth > maxDepth {
			continue
		}
		result = append(result, c)
	}

	// Ordenamiento por path (simula index GiST ltree para orden jerárquico natural)
	sort.Slice(result, func(i, j int) bool {
		return result[i].Path < result[j].Path
	})

	return result, nil
}

func (m *MemoryRepository) UpdateComment(id, content string) (*models.Comment, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	c, ok := m.comments[id]
	if !ok || c.IsRemoved {
		return nil, errors.New("comentario no encontrado")
	}
	c.Content = content
	return c, nil
}

// DeleteComment preserva la estructura del árbol de comentarios sustituyendo el contenido por marca de borrado
func (m *MemoryRepository) DeleteComment(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	c, ok := m.comments[id]
	if !ok {
		return errors.New("comentario no encontrado")
	}
	c.Content = "[comentario eliminado]"
	c.IsRemoved = true
	return nil
}

// --- Votación (Write-behind en memoria) ---
func (m *MemoryRepository) VotePost(userID, postID string, voteValue int) (*models.VoteResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	p, ok := m.posts[postID]
	if !ok || p.IsRemoved {
		return nil, errors.New("publicación no encontrada")
	}

	key := fmt.Sprintf("%s:%s", userID, postID)
	prevVote := m.postVotes[key]

	if voteValue == 0 {
		delete(m.postVotes, key)
	} else {
		m.postVotes[key] = voteValue
	}

	// Revertir efecto del voto anterior
	if prevVote == 1 {
		p.UpvotesCount--
	} else if prevVote == -1 {
		p.DownvotesCount--
	}

	// Aplicar nuevo voto
	if voteValue == 1 {
		p.UpvotesCount++
	} else if voteValue == -1 {
		p.DownvotesCount++
	}

	// Ajuste de karma del autor
	if author, ok := m.users[p.AuthorID]; ok && author.ID != userID {
		delta := voteValue - prevVote
		author.KarmaScore += delta
	}

	return &models.VoteResponse{
		NewScore:    p.UpvotesCount - p.DownvotesCount,
		Upvotes:     p.UpvotesCount,
		Downvotes:   p.DownvotesCount,
		CurrentVote: voteValue,
	}, nil
}

func (m *MemoryRepository) VoteComment(userID, commentID string, voteValue int) (*models.VoteResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	c, ok := m.comments[commentID]
	if !ok || c.IsRemoved {
		return nil, errors.New("comentario no encontrado")
	}

	key := fmt.Sprintf("%s:%s", userID, commentID)
	prevVote := m.commentVotes[key]

	if voteValue == 0 {
		delete(m.commentVotes, key)
	} else {
		m.commentVotes[key] = voteValue
	}

	delta := voteValue - prevVote
	c.Score += delta

	// Ajuste de karma del autor
	if author, ok := m.users[c.UserID]; ok && author.ID != userID {
		author.KarmaScore += delta
	}

	upvotes := 0
	downvotes := 0
	if c.Score >= 0 {
		upvotes = c.Score
	} else {
		downvotes = -c.Score
	}

	return &models.VoteResponse{
		NewScore:    c.Score,
		Upvotes:     upvotes,
		Downvotes:   downvotes,
		CurrentVote: voteValue,
	}, nil
}

func (m *MemoryRepository) GetUserKarmaDetail(userID string) (*models.KarmaDetailResponse, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	u, ok := m.users[userID]
	if !ok {
		return nil, errors.New("usuario no encontrado")
	}

	postKarma := 0
	for _, p := range m.posts {
		if p.AuthorID == userID && !p.IsRemoved {
			postKarma += (p.UpvotesCount - p.DownvotesCount)
		}
	}

	commentKarma := 0
	for _, c := range m.comments {
		if c.UserID == userID && !c.IsRemoved {
			commentKarma += c.Score
		}
	}

	rank := "Iniciado"
	if u.KarmaScore >= 1000 {
		rank = "Leyenda Comunitaria"
	} else if u.KarmaScore >= 500 {
		rank = "Veterano"
	} else if u.KarmaScore >= 100 {
		rank = "Colaborador Activo"
	}

	return &models.KarmaDetailResponse{
		UserID:       userID,
		TotalKarma:   u.KarmaScore,
		PostKarma:    postKarma,
		CommentKarma: commentKarma,
		RankTitle:    rank,
	}, nil
}

// --- Chats y Mensajes ---
func (m *MemoryRepository) CreateChatRequest(req *models.ChatRequest) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.users[req.RecipientID]; !ok {
		return errors.New("destinatario no encontrado")
	}

	// Comprobar bloqueo
	if m.userBlocks[req.RecipientID] != nil && m.userBlocks[req.RecipientID][req.SenderID] {
		return errors.New("no puedes enviar solicitudes a este usuario")
	}

	for _, existing := range m.chatRequests {
		if (existing.SenderID == req.SenderID && existing.RecipientID == req.RecipientID) ||
			(existing.SenderID == req.RecipientID && existing.RecipientID == req.SenderID) {
			if existing.Status == models.ChatPending {
				return errors.New("ya existe una solicitud de chat pendiente entre estos usuarios")
			}
		}
	}

	if req.ID == "" {
		req.ID = uuid.New().String()
	}
	req.Status = models.ChatPending
	req.CreatedAt = time.Now()
	req.UpdatedAt = time.Now()

	m.chatRequests[req.ID] = req
	return nil
}

func (m *MemoryRepository) GetChatRequestByID(id string) (*models.ChatRequest, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	req, ok := m.chatRequests[id]
	if !ok {
		return nil, errors.New("solicitud no encontrada")
	}
	return req, nil
}

func (m *MemoryRepository) UpdateChatRequestStatus(id, status string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	req, ok := m.chatRequests[id]
	if !ok {
		return errors.New("solicitud no encontrada")
	}
	req.Status = status
	req.UpdatedAt = time.Now()

	if status == models.ChatAccepted || status == "ACCEPT" {
		req.Status = models.ChatAccepted
		// Crear automáticamente la conversación si no existe
		cID := uuid.New().String()
		m.chatConversations[cID] = &models.ChatConversation{
			ID:        cID,
			User1ID:   req.SenderID,
			User2ID:   req.RecipientID,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
	}
	return nil
}

func (m *MemoryRepository) ListConversations(userID string, page, limit int) ([]*models.ChatConversation, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*models.ChatConversation
	for _, conv := range m.chatConversations {
		if conv.User1ID == userID || conv.User2ID == userID {
			result = append(result, conv)
		}
	}
	return result, nil
}

func (m *MemoryRepository) GetConversationByID(id string) (*models.ChatConversation, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	conv, ok := m.chatConversations[id]
	if !ok {
		return nil, errors.New("conversación no encontrada")
	}
	return conv, nil
}

func (m *MemoryRepository) GetOrCreateConversation(user1ID, user2ID string) (*models.ChatConversation, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, conv := range m.chatConversations {
		if (conv.User1ID == user1ID && conv.User2ID == user2ID) || (conv.User1ID == user2ID && conv.User2ID == user1ID) {
			return conv, nil
		}
	}

	cID := uuid.New().String()
	conv := &models.ChatConversation{
		ID:        cID,
		User1ID:   user1ID,
		User2ID:   user2ID,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	m.chatConversations[cID] = conv
	return conv, nil
}

func (m *MemoryRepository) ListMessages(convID string, beforeTimestamp string, limit int) ([]*models.ChatMessage, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*models.ChatMessage
	for _, msg := range m.chatMessages {
		if msg.ConversationID == convID {
			result = append(result, msg)
		}
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].CreatedAt.Before(result[j].CreatedAt)
	})

	return result, nil
}

func (m *MemoryRepository) CreateChatMessage(msg *models.ChatMessage) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.chatConversations[msg.ConversationID]; !ok {
		return errors.New("conversación no encontrada")
	}

	if msg.ID == "" {
		msg.ID = uuid.New().String()
	}
	msg.CreatedAt = time.Now()
	m.chatMessages[msg.ID] = msg
	return nil
}

func (m *MemoryRepository) BlockUser(blockerID, blockedID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if blockerID == blockedID {
		return errors.New("no puedes bloquearte a ti mismo")
	}

	if m.userBlocks[blockerID] == nil {
		m.userBlocks[blockerID] = make(map[string]bool)
	}
	m.userBlocks[blockerID][blockedID] = true
	return nil
}

func (m *MemoryRepository) IsUserBlocked(userA, userB string) (bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.userBlocks[userA] != nil && m.userBlocks[userA][userB] {
		return true, nil
	}
	if m.userBlocks[userB] != nil && m.userBlocks[userB][userA] {
		return true, nil
	}
	return false, nil
}

// --- Notificaciones ---
func (m *MemoryRepository) ListNotifications(userID string, page, limit int) ([]*models.Notification, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*models.Notification
	for _, n := range m.notifications {
		if n.UserID == userID {
			result = append(result, n)
		}
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].CreatedAt.After(result[j].CreatedAt)
	})
	return result, nil
}

func (m *MemoryRepository) MarkNotificationRead(id, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	n, ok := m.notifications[id]
	if !ok || n.UserID != userID {
		return errors.New("notificación no encontrada")
	}
	n.IsRead = true
	return nil
}

func (m *MemoryRepository) GetNotificationSettings(userID string) (*models.NotificationSettings, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	s, ok := m.notificationSettings[userID]
	if !ok {
		return &models.NotificationSettings{
			UserID:                userID,
			EmailOnReply:          true,
			EmailOnMention:        true,
			PushOnChatRequest:     true,
			PushOnCommunityUpdate: false,
		}, nil
	}
	return s, nil
}

func (m *MemoryRepository) UpdateNotificationSettings(settings *models.NotificationSettings) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.notificationSettings[settings.UserID] = settings
	return nil
}

func (m *MemoryRepository) CreateNotification(notif *models.Notification) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if notif.ID == "" {
		notif.ID = uuid.New().String()
	}
	notif.CreatedAt = time.Now()
	m.notifications[notif.ID] = notif
	return nil
}

// --- Denuncias y Moderación ---
func (m *MemoryRepository) CreateReport(r *models.Report) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if r.ID == "" {
		r.ID = uuid.New().String()
	}
	r.Status = models.ReportPending
	r.CreatedAt = time.Now()
	m.reports[r.ID] = r
	return nil
}

func (m *MemoryRepository) ListReports(communityID, status string, page, limit int) ([]*models.Report, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*models.Report
	for _, r := range m.reports {
		if status != "" && r.Status != status {
			continue
		}
		result = append(result, r)
	}
	return result, nil
}

func (m *MemoryRepository) ResolveReport(id, status, notes, resolvedBy string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	r, ok := m.reports[id]
	if !ok {
		return errors.New("denuncia no encontrada")
	}
	r.Status = status
	r.ResolutionNotes = notes
	r.ResolvedBy = &resolvedBy
	return nil
}

func (m *MemoryRepository) BanUser(b *models.CommunityBan) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.communityBans[b.CommunityID] == nil {
		m.communityBans[b.CommunityID] = make(map[string]*models.CommunityBan)
	}
	b.CreatedAt = time.Now()
	m.communityBans[b.CommunityID][b.UserID] = b
	return nil
}

func (m *MemoryRepository) UnbanUser(userID, communityID, reason string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.communityBans[communityID] != nil {
		delete(m.communityBans[communityID], userID)
	}
	return nil
}

func (m *MemoryRepository) IsUserBannedFromCommunity(userID, communityID string) (bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	bans, ok := m.communityBans[communityID]
	if !ok {
		return false, nil
	}
	ban, ok := bans[userID]
	if !ok {
		return false, nil
	}
	if ban.ExpiresAt != nil && time.Now().After(*ban.ExpiresAt) {
		return false, nil
	}
	return true, nil
}

func (m *MemoryRepository) CreateModerationLog(log *models.ModerationLog) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if log.ID == "" {
		log.ID = uuid.New().String()
	}
	log.CreatedAt = time.Now()
	m.moderationLogs = append(m.moderationLogs, log)
	return nil
}

func (m *MemoryRepository) ListModerationLogs(moderatorID, actionType, fromDate, toDate string) ([]*models.ModerationLog, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*models.ModerationLog
	for _, l := range m.moderationLogs {
		if moderatorID != "" && l.ModeratorID != moderatorID {
			continue
		}
		if actionType != "" && l.ActionType != actionType {
			continue
		}
		result = append(result, l)
	}
	return result, nil
}

// --- Notas Comunitarias ---
func (m *MemoryRepository) CreateCommunityNote(note *models.CommunityNote) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.posts[note.PostID]; !ok {
		return errors.New("publicación no encontrada")
	}

	if note.ID == "" {
		note.ID = uuid.New().String()
	}
	note.CreatedAt = time.Now()
	m.communityNotes[note.ID] = note
	return nil
}

func (m *MemoryRepository) VoteCommunityNote(noteID, userID string, isHelpful bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	n, ok := m.communityNotes[noteID]
	if !ok {
		return errors.New("nota no encontrada")
	}

	key := fmt.Sprintf("%s:%s", noteID, userID)
	prev, exists := m.communityNoteVotes[key]
	if exists {
		if prev {
			n.HelpfulVotes--
		} else {
			n.UnhelpfulVotes--
		}
	}

	m.communityNoteVotes[key] = isHelpful
	if isHelpful {
		n.HelpfulVotes++
	} else {
		n.UnhelpfulVotes++
	}
	return nil
}

// --- Métricas, Seguridad y Búsqueda ---
func (m *MemoryRepository) GetAnalyticsMetrics(timeframe string) (map[string]interface{}, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return map[string]interface{}{
		"timeframe":       timeframe,
		"active_users":    len(m.users),
		"total_posts":     len(m.posts),
		"total_comments":  len(m.comments),
		"communities":     len(m.communities),
		"pending_reports": len(m.reports),
		"system_health":   "OPTIMAL",
	}, nil
}

func (m *MemoryRepository) GetSecurityAccountGroups(riskThreshold float64) ([]map[string]interface{}, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return []map[string]interface{}{
		{
			"group_id":         "grp_simulated_botnet_01",
			"risk_score":       0.92,
			"affected_users":   []string{"bot_alpha", "bot_beta"},
			"detected_pattern": "Patrón coordinado detectado por reCAPTCHA Account Defender",
		},
	}, nil
}

func (m *MemoryRepository) SearchPredictive(query string) ([]map[string]interface{}, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var hits []map[string]interface{}
	qLower := strings.ToLower(query)

	for _, c := range m.communities {
		if strings.Contains(strings.ToLower(c.Name), qLower) {
			hits = append(hits, map[string]interface{}{
				"type":  "community",
				"id":    c.ID,
				"title": c.Name,
			})
		}
	}

	for _, p := range m.posts {
		if !p.IsRemoved && strings.Contains(strings.ToLower(p.Title), qLower) {
			hits = append(hits, map[string]interface{}{
				"type":  "post",
				"id":    p.ID,
				"title": p.Title,
			})
		}
	}

	return hits, nil
}

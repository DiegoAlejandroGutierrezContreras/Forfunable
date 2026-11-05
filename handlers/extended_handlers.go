package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"forfunable/middleware"
	"forfunable/models"
	"forfunable/repository"
	"github.com/gin-gonic/gin"
)

// ExtendedHandler expone las funciones de la migración V003:
// 02_16 guardados y colecciones, 03_22 historial de versiones, 02_19 flairs,
// 06_79/06_80 acceso a comunidades privadas, 01_11 apelaciones y 05_40 transferencia de propiedad.
type ExtendedHandler struct {
	repo repository.Repository
	ext  *repository.ExtendedRepository
}

func NewExtendedHandler(repo repository.Repository, ext *repository.ExtendedRepository) *ExtendedHandler {
	return &ExtendedHandler{repo: repo, ext: ext}
}

var flairColors = map[string]bool{"primary": true, "secondary": true, "tertiary": true, "warning": true, "danger": true, "neutral": true}

// canManageCommunity: moderadores/administradores globales, el fundador o un moderador local.
func canManageCommunity(repo repository.Repository, c *gin.Context, comm *models.Community) bool {
	role := c.GetString("global_role")
	if role == models.RoleGlobalAdmin || role == "COMMUNITY_MOD" {
		return true
	}
	uid := c.GetString("user_id")
	if uid == "" {
		return false
	}
	if comm.CreatorID == uid {
		return true
	}
	mod, err := repo.GetCommunityModerator(comm.ID, uid)
	return err == nil && mod != nil
}

// communityByRef acepta el nombre o el ID de la comunidad.
func (h *ExtendedHandler) communityByRef(ref string) (*models.Community, error) {
	if comm, err := h.repo.GetCommunityByName(ref); err == nil {
		return comm, nil
	}
	return h.repo.GetCommunityByID(ref)
}

func (h *ExtendedHandler) manageable(c *gin.Context, ref string) *models.Community {
	comm, err := h.communityByRef(ref)
	if err != nil {
		extError(c, errors.New("comunidad no encontrada"), http.StatusNotFound)
		return nil
	}
	if !canManageCommunity(h.repo, c, comm) {
		extError(c, errors.New("necesitas ser fundador o moderador de la comunidad"), http.StatusForbidden)
		return nil
	}
	return comm
}

// --- 02_16 Guardados y colecciones ---

// ListSaved maneja GET /api/v1/users/me/saved?collection= (vacío todas, "none" sin colección)
func (h *ExtendedHandler) ListSaved(c *gin.Context) {
	items, err := h.ext.ListSaved(c.GetString("user_id"), c.Query("collection"))
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	posts := make([]*models.Post, 0, len(items))
	for _, it := range items {
		posts = append(posts, it.Post)
	}
	attachPostVotes(h.repo, c.GetString("user_id"), posts...)
	attachPostFlairs(h.ext, posts...)
	c.JSON(http.StatusOK, gin.H{"items": items, "count": len(items)})
}

func (h *ExtendedHandler) SavedIDs(c *gin.Context) {
	ids, err := h.ext.SavedPostIDs(c.GetString("user_id"))
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": ids})
}

// SavePost maneja PUT /api/v1/users/me/saved/:postId
func (h *ExtendedHandler) SavePost(c *gin.Context) {
	var req models.SavePostRequest
	_ = c.ShouldBindJSON(&req)
	if err := h.ext.SavePost(c.GetString("user_id"), c.Param("postId"), req.CollectionID, middleware.SanitizeText(req.Note)); err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "no encontrad") {
			status = http.StatusNotFound
		}
		extError(c, err, status)
		return
	}
	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Message: "Publicación guardada"})
}

func (h *ExtendedHandler) UnsavePost(c *gin.Context) {
	if err := h.ext.UnsavePost(c.GetString("user_id"), c.Param("postId")); err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Message: "Publicación quitada de guardados"})
}

func (h *ExtendedHandler) ListCollections(c *gin.Context) {
	cols, err := h.ext.ListCollections(c.GetString("user_id"))
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": cols, "count": len(cols)})
}

func (h *ExtendedHandler) CreateCollection(c *gin.Context) {
	var req models.CollectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		extError(c, errors.New("el nombre de la colección debe tener entre 1 y 60 caracteres"), http.StatusBadRequest)
		return
	}
	col, err := h.ext.CreateCollection(c.GetString("user_id"), middleware.SanitizeText(req.Name), middleware.SanitizeText(req.Description))
	if err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "ya tienes") {
			status = http.StatusConflict
		}
		extError(c, err, status)
		return
	}
	c.JSON(http.StatusCreated, col)
}

func (h *ExtendedHandler) UpdateCollection(c *gin.Context) {
	var req models.CollectionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		extError(c, errors.New("el nombre de la colección debe tener entre 1 y 60 caracteres"), http.StatusBadRequest)
		return
	}
	if err := h.ext.UpdateCollection(c.GetString("user_id"), c.Param("id"), middleware.SanitizeText(req.Name), middleware.SanitizeText(req.Description)); err != nil {
		status := http.StatusNotFound
		if strings.Contains(err.Error(), "ya tienes") {
			status = http.StatusConflict
		}
		extError(c, err, status)
		return
	}
	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Message: "Colección actualizada"})
}

func (h *ExtendedHandler) DeleteCollection(c *gin.Context) {
	if err := h.ext.DeleteCollection(c.GetString("user_id"), c.Param("id")); err != nil {
		extError(c, err, http.StatusNotFound)
		return
	}
	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Message: "Colección eliminada; sus elementos siguen guardados"})
}

// --- 03_22 Historial de versiones ---

// ListRevisions maneja GET /api/v1/posts/:id/revisions: versiones anteriores + la actual
func (h *ExtendedHandler) ListRevisions(c *gin.Context) {
	post, err := h.repo.GetPostByID(c.Param("id"))
	if err != nil {
		extError(c, errors.New("publicación no encontrada"), http.StatusNotFound)
		return
	}
	if comm, err := h.repo.GetCommunityByID(post.CommunityID); err == nil && !canViewCommunity(h.repo, h.ext, c, comm) {
		extError(c, errors.New("esta publicación pertenece a una comunidad privada"), http.StatusForbidden)
		return
	}
	revs, err := h.ext.ListRevisions(post.ID)
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	current := &models.PostRevision{ID: "current", PostID: post.ID, BodyText: post.BodyText, EditorName: post.AuthorUsername, Current: true, CreatedAt: post.CreatedAt}
	if len(revs) > 0 {
		last := revs[len(revs)-1]
		current.CreatedAt, current.EditedBy, current.EditorName = last.CreatedAt, last.EditedBy, last.EditorName
	}
	// La primera versión es la publicación original; cada revisión guarda el texto previo a una edición
	versions := make([]*models.PostRevision, 0, len(revs)+1)
	for i, r := range revs {
		v := *r
		if i == 0 {
			v.CreatedAt = post.CreatedAt
			v.EditorName = post.AuthorUsername
		} else {
			v.CreatedAt, v.EditedBy, v.EditorName = revs[i-1].CreatedAt, revs[i-1].EditedBy, revs[i-1].EditorName
		}
		versions = append(versions, &v)
	}
	versions = append(versions, current)
	c.JSON(http.StatusOK, gin.H{"post_id": post.ID, "title": post.Title, "items": versions, "edits": len(revs)})
}

// --- 02_19 Flairs ---

func (h *ExtendedHandler) ListFlairs(c *gin.Context) {
	comm, err := h.communityByRef(c.Param("name"))
	if err != nil {
		extError(c, errors.New("comunidad no encontrada"), http.StatusNotFound)
		return
	}
	flairs, err := h.ext.ListFlairs(comm.ID)
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": flairs, "count": len(flairs), "can_manage": canManageCommunity(h.repo, c, comm)})
}

func (h *ExtendedHandler) bindFlair(c *gin.Context) (*models.FlairRequest, bool) {
	var req models.FlairRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		extError(c, errors.New("el nombre del flair debe tener entre 1 y 30 caracteres"), http.StatusBadRequest)
		return nil, false
	}
	req.Name = middleware.SanitizeText(strings.TrimSpace(req.Name))
	req.Description = middleware.SanitizeText(req.Description)
	if !flairColors[req.Color] {
		req.Color = "secondary"
	}
	return &req, true
}

func (h *ExtendedHandler) CreateFlair(c *gin.Context) {
	comm := h.manageable(c, c.Param("id"))
	if comm == nil {
		return
	}
	req, ok := h.bindFlair(c)
	if !ok {
		return
	}
	f := &models.Flair{CommunityID: comm.ID, Name: req.Name, Color: req.Color, Description: req.Description, ModOnly: req.ModOnly, Position: req.Position}
	if err := h.ext.SaveFlair(f); err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "ya existe") {
			status = http.StatusConflict
		}
		extError(c, err, status)
		return
	}
	c.JSON(http.StatusCreated, f)
}

func (h *ExtendedHandler) UpdateFlair(c *gin.Context) {
	comm := h.manageable(c, c.Param("id"))
	if comm == nil {
		return
	}
	f, err := h.ext.GetFlair(c.Param("fid"))
	if err != nil || f.CommunityID != comm.ID {
		extError(c, errors.New("flair no encontrado"), http.StatusNotFound)
		return
	}
	req, ok := h.bindFlair(c)
	if !ok {
		return
	}
	f.Name, f.Color, f.Description, f.ModOnly, f.Position = req.Name, req.Color, req.Description, req.ModOnly, req.Position
	if err := h.ext.SaveFlair(f); err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "ya existe") {
			status = http.StatusConflict
		}
		extError(c, err, status)
		return
	}
	c.JSON(http.StatusOK, f)
}

func (h *ExtendedHandler) DeleteFlair(c *gin.Context) {
	comm := h.manageable(c, c.Param("id"))
	if comm == nil {
		return
	}
	f, err := h.ext.GetFlair(c.Param("fid"))
	if err != nil || f.CommunityID != comm.ID {
		extError(c, errors.New("flair no encontrado"), http.StatusNotFound)
		return
	}
	if err := h.ext.DeleteFlair(f.ID); err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Message: "Flair eliminado"})
}

// SetPostFlair maneja PUT /api/v1/posts/:id/flair (autor o moderación; "" lo quita)
func (h *ExtendedHandler) SetPostFlair(c *gin.Context) {
	post, err := h.repo.GetPostByID(c.Param("id"))
	if err != nil {
		extError(c, errors.New("publicación no encontrada"), http.StatusNotFound)
		return
	}
	comm, err := h.repo.GetCommunityByID(post.CommunityID)
	if err != nil {
		extError(c, errors.New("comunidad no encontrada"), http.StatusNotFound)
		return
	}
	manager := canManageCommunity(h.repo, c, comm)
	if post.AuthorID != c.GetString("user_id") && !manager {
		extError(c, errors.New("solo el autor o la moderación pueden cambiar el flair"), http.StatusForbidden)
		return
	}
	var req models.SetPostFlairRequest
	_ = c.ShouldBindJSON(&req)
	if err := validatePostFlair(h.ext, req.FlairID, comm.ID, manager); err != nil {
		extError(c, err, http.StatusBadRequest)
		return
	}
	if err := h.ext.SetPostFlair(post.ID, req.FlairID); err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Message: "Flair actualizado"})
}

func validatePostFlair(ext *repository.ExtendedRepository, flairID, communityID string, manager bool) error {
	if flairID == "" {
		return nil
	}
	f, err := ext.GetFlair(flairID)
	if err != nil || f.CommunityID != communityID {
		return errors.New("el flair no pertenece a esta comunidad")
	}
	if f.ModOnly && !manager {
		return errors.New("ese flair solo lo puede asignar la moderación")
	}
	return nil
}

// attachPostFlairs añade el flair a cada publicación (sin efecto si V003 no está aplicada)
func attachPostFlairs(ext *repository.ExtendedRepository, posts ...*models.Post) {
	if !ext.Available() || len(posts) == 0 {
		return
	}
	ids := make([]string, 0, len(posts))
	for _, p := range posts {
		ids = append(ids, p.ID)
	}
	flairs, err := ext.PostFlairs(ids)
	if err != nil {
		return
	}
	for _, p := range posts {
		p.Flair = flairs[p.ID]
	}
}

// canViewCommunity: una comunidad privada solo muestra su contenido a miembros y moderación
// (solo con V003 aplicada, que es la que permite pedir acceso).
func canViewCommunity(repo repository.Repository, ext *repository.ExtendedRepository, c *gin.Context, comm *models.Community) bool {
	if comm == nil || !comm.IsPrivate || !ext.Available() || canManageCommunity(repo, c, comm) {
		return true
	}
	uid := c.GetString("user_id")
	if uid == "" {
		return false
	}
	ok, err := repo.IsCommunityMember(comm.ID, uid)
	return err == nil && ok
}

// visiblePosts quita las publicaciones de comunidades privadas a las que el usuario no pertenece
func visiblePosts(repo repository.Repository, ext *repository.ExtendedRepository, c *gin.Context, posts []*models.Post) []*models.Post {
	if !ext.Available() || len(posts) == 0 {
		return posts
	}
	allowed := map[string]bool{}
	out := make([]*models.Post, 0, len(posts))
	for _, p := range posts {
		ok, seen := allowed[p.CommunityID]
		if !seen {
			comm, err := repo.GetCommunityByID(p.CommunityID)
			ok = err != nil || canViewCommunity(repo, ext, c, comm)
			allowed[p.CommunityID] = ok
		}
		if ok {
			out = append(out, p)
		}
	}
	return out
}

// --- 06_79 / 06_80 Acceso a comunidades privadas ---

func (h *ExtendedHandler) ListAccessRequests(c *gin.Context) {
	comm := h.manageable(c, c.Param("name"))
	if comm == nil {
		return
	}
	list, err := h.ext.ListAccessRequests(comm.ID, c.Query("status"))
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": list, "count": len(list)})
}

func (h *ExtendedHandler) MyAccessRequests(c *gin.Context) {
	list, err := h.ext.MyAccessRequests(c.GetString("user_id"))
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": list, "count": len(list)})
}

func (h *ExtendedHandler) DecideAccessRequest(c *gin.Context) {
	comm := h.manageable(c, c.Param("id"))
	if comm == nil {
		return
	}
	var req models.AccessDecisionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		extError(c, errors.New("acción inválida: APPROVE o REJECT"), http.StatusBadRequest)
		return
	}
	ar, err := h.ext.GetAccessRequest(c.Param("rid"))
	if err != nil || ar.CommunityID != comm.ID {
		extError(c, errors.New("solicitud no encontrada"), http.StatusNotFound)
		return
	}
	status := map[string]string{"APPROVE": "APPROVED", "REJECT": "REJECTED"}[req.Action]
	note := middleware.SanitizeText(req.Note)
	if err := h.ext.DecideAccessRequest(ar.ID, status, c.GetString("user_id"), note); err != nil {
		extError(c, err, http.StatusConflict)
		return
	}
	commID := comm.ID
	_ = h.repo.CreateModerationLog(&models.ModerationLog{
		ModeratorID: c.GetString("user_id"), CommunityID: &commID, ActionType: "ACCESS_" + status, TargetID: ar.UserID,
		Reason: fmt.Sprintf("Solicitud de @%s a c/%s: %s", ar.Username, comm.Name, strings.ToLower(status)),
	})
	msg := fmt.Sprintf("Tu solicitud para unirte a c/%s fue aprobada. ¡Bienvenido!", comm.Name)
	if status == "REJECTED" {
		msg = fmt.Sprintf("Tu solicitud para unirte a c/%s fue rechazada.", comm.Name)
		if note != "" {
			msg += " Motivo: " + note
		}
	}
	notify(h.repo, ar.UserID, c.GetString("user_id"), "Solicitud de acceso", msg, notifCommunity(comm.Name))
	c.JSON(http.StatusOK, models.StandardResponse{Success: true, Message: "Solicitud " + strings.ToLower(status)})
}

// --- 01_11 Apelaciones y registro de sanciones ---

func (h *ExtendedHandler) ListSanctions(c *gin.Context) {
	list, err := h.ext.ListSanctions(c.GetString("user_id"))
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": list, "count": len(list)})
}

func (h *ExtendedHandler) MyAppeals(c *gin.Context) {
	list, err := h.ext.ListAppeals(c.GetString("user_id"), "")
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": list, "count": len(list)})
}

// CreateAppeal maneja POST /api/v1/appeals: solo sobre una sanción propia existente
func (h *ExtendedHandler) CreateAppeal(c *gin.Context) {
	userID := c.GetString("user_id")
	var req models.AppealRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		extError(c, errors.New("explica tu apelación (entre 10 y 2000 caracteres)"), http.StatusBadRequest)
		return
	}
	sanctions, err := h.ext.ListSanctions(userID)
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	var target *models.Sanction
	for _, s := range sanctions {
		if s.ReferenceID == req.ReferenceID && s.Kind == req.Kind {
			target = s
		}
	}
	if target == nil {
		extError(c, errors.New("no tienes ninguna sanción con esa referencia"), http.StatusNotFound)
		return
	}
	a := &models.Appeal{UserID: userID, Kind: req.Kind, ReferenceID: req.ReferenceID, CommunityID: target.CommunityID, Message: middleware.SanitizeText(req.Message)}
	if err := h.ext.CreateAppeal(a); err != nil {
		status := http.StatusInternalServerError
		if strings.Contains(err.Error(), "pendiente") {
			status = http.StatusConflict
		}
		extError(c, err, status)
		return
	}
	c.JSON(http.StatusCreated, a)
}

func (h *ExtendedHandler) AdminListAppeals(c *gin.Context) {
	list, err := h.ext.ListAppeals("", c.Query("status"))
	if err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": list, "count": len(list)})
}

// AdminDecideAppeal maneja PATCH /api/v1/admin/appeals/:id: aceptar levanta la sanción
// o restaura la publicación retirada.
func (h *ExtendedHandler) AdminDecideAppeal(c *gin.Context) {
	modID := c.GetString("user_id")
	var req models.AppealDecisionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		extError(c, errors.New("indica la decisión (ACCEPT o REJECT) y una resolución de al menos 5 caracteres"), http.StatusBadRequest)
		return
	}
	a, err := h.ext.GetAppeal(c.Param("id"))
	if err != nil {
		extError(c, err, http.StatusNotFound)
		return
	}
	status := map[string]string{"ACCEPT": "ACCEPTED", "REJECT": "REJECTED"}[req.Decision]
	resolution := middleware.SanitizeText(req.Resolution)
	if err := h.ext.DecideAppeal(a.ID, status, resolution, modID); err != nil {
		extError(c, err, http.StatusConflict)
		return
	}
	effect := ""
	if status == "ACCEPTED" {
		switch a.Kind {
		case "COMMUNITY_BAN":
			if a.CommunityID != nil && h.repo.UnbanUser(a.UserID, *a.CommunityID, "Apelación aceptada") == nil {
				effect = " La sanción fue levantada."
			}
		case "CONTENT_REMOVAL":
			if target := h.ext.RemovedTargetFromNotification(strings.TrimPrefix(a.ReferenceID, "notif:")); target != "" {
				if ok, _ := h.ext.RestorePost(target); ok {
					effect = " Tu publicación fue restaurada."
				}
			}
		}
	}
	_ = h.repo.CreateModerationLog(&models.ModerationLog{
		ModeratorID: modID, CommunityID: a.CommunityID, ActionType: "APPEAL_" + status, TargetID: a.UserID,
		Reason: fmt.Sprintf("Apelación de @%s (%s): %s", a.Username, a.Kind, resolution),
	})
	verdict := "aceptada"
	if status == "REJECTED" {
		verdict = "rechazada"
	}
	notify(h.repo, a.UserID, modID, "Apelación resuelta", "Tu apelación fue "+verdict+"."+effect+" Resolución: "+resolution, notifAccount)
	c.JSON(http.StatusOK, gin.H{"success": true, "status": status, "effect": strings.TrimSpace(effect)})
}

// --- 05_40 Transferencia de propiedad de comunidad ---

func (h *ExtendedHandler) TransferOwnership(c *gin.Context) {
	callerID := c.GetString("user_id")
	comm, err := h.repo.GetCommunityByID(c.Param("id"))
	if err != nil {
		extError(c, errors.New("comunidad no encontrada"), http.StatusNotFound)
		return
	}
	if comm.CreatorID != callerID && c.GetString("global_role") != models.RoleGlobalAdmin {
		extError(c, errors.New("solo el fundador o un administrador global pueden transferir la comunidad"), http.StatusForbidden)
		return
	}
	var req models.TransferOwnershipRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		extError(c, errors.New("indica el nuevo propietario y confirma el nombre de la comunidad"), http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.ConfirmName) != comm.Name {
		extError(c, errors.New("el nombre de la comunidad no coincide"), http.StatusBadRequest)
		return
	}
	newOwner, err := h.repo.GetUserByUsername(strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(req.NewOwner), "u/"), "@"))
	if err != nil || !newOwner.IsActive {
		extError(c, errors.New("no existe un usuario activo con ese nombre"), http.StatusNotFound)
		return
	}
	if newOwner.ID == comm.CreatorID {
		extError(c, errors.New("esa persona ya es la propietaria"), http.StatusConflict)
		return
	}
	if err := h.ext.TransferOwnership(comm.ID, newOwner.ID, comm.CreatorID); err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	commID := comm.ID
	_ = h.repo.CreateModerationLog(&models.ModerationLog{
		ModeratorID: callerID, CommunityID: &commID, ActionType: "TRANSFER_OWNERSHIP", TargetID: newOwner.ID,
		Reason: fmt.Sprintf("Propiedad de c/%s transferida a @%s", comm.Name, newOwner.Username),
	})
	notify(h.repo, newOwner.ID, callerID, "Ahora eres propietario", fmt.Sprintf("Recibiste la propiedad de c/%s.", comm.Name), notifCommunity(comm.Name))
	notify(h.repo, comm.CreatorID, callerID, "Propiedad transferida", fmt.Sprintf("c/%s ahora pertenece a @%s; quedaste como moderador principal.", comm.Name, newOwner.Username), notifCommunity(comm.Name))
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Propiedad transferida a @" + newOwner.Username, "new_owner": newOwner.Username})
}

// AdminDeleteUser maneja DELETE /api/v1/admin/users/:id (200 OK). Solo GLOBAL_ADMIN.
// Anonimiza la cuenta al instante (datos personales, sesiones, guardados); su contenido queda
// como de «usuario eliminado». No se puede eliminar la propia cuenta ni a otro administrador global.
func (h *ExtendedHandler) AdminDeleteUser(c *gin.Context) {
	if c.GetString("global_role") != models.RoleGlobalAdmin {
		extError(c, errors.New("solo un administrador global puede eliminar cuentas"), http.StatusForbidden)
		return
	}
	targetID := c.Param("id")
	if targetID == c.GetString("user_id") {
		extError(c, errors.New("no puedes eliminar tu propia cuenta desde la consola; usa Ajustes > Eliminar cuenta"), http.StatusBadRequest)
		return
	}
	var req struct {
		Reason          string `json:"reason"`
		ConfirmUsername string `json:"confirm_username"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(strings.TrimSpace(req.Reason)) < 5 {
		extError(c, errors.New("explica el motivo de la eliminación (mínimo 5 caracteres)"), http.StatusBadRequest)
		return
	}
	user, err := h.repo.GetUserByID(targetID)
	if err != nil {
		extError(c, errors.New("usuario no encontrado"), http.StatusNotFound)
		return
	}
	if strings.HasSuffix(user.Email, "@eliminado.invalid") {
		extError(c, errors.New("la cuenta ya fue eliminada"), http.StatusConflict)
		return
	}
	if user.GlobalRole == models.RoleGlobalAdmin {
		extError(c, errors.New("no se puede eliminar a un administrador global: cámbiale primero el rol"), http.StatusForbidden)
		return
	}
	if !strings.EqualFold(strings.TrimSpace(req.ConfirmUsername), user.Username) {
		extError(c, errors.New("el nombre de usuario de confirmación no coincide"), http.StatusBadRequest)
		return
	}
	reason := middleware.SanitizeText(req.Reason)
	if err := h.ext.AdminDeleteUser(user.ID, "Cuenta eliminada por la administración: "+reason); err != nil {
		extError(c, err, http.StatusInternalServerError)
		return
	}
	_ = h.repo.CreateModerationLog(&models.ModerationLog{
		ModeratorID: c.GetString("user_id"), ActionType: "DELETE_USER", TargetID: user.ID,
		Reason: fmt.Sprintf("Cuenta @%s eliminada: %s", user.Username, reason),
	})
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "La cuenta de @" + user.Username + " fue eliminada"})
}

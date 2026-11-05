/**
 * API Client — Forfunable Frontend
 * Capa de servicios centralizada, gestión de sesión en memoria y contratos RFC 9110
 */

const API_BASE = '/api/v1';

class ApiClient {
  constructor() {
    this.token = null;
    this.user = null;
    this.authListeners = [];
  }

  // Suscribirse a cambios de autenticación
  onAuthChange(callback) {
    this.authListeners.push(callback);
    callback(this.user);
  }

  notifyAuthChange() {
    this.authListeners.forEach(cb => cb(this.user));
  }

  // El backend envía global_role; las vistas comprueban user.role
  withRole(user) {
    if (user && user.role === undefined && user.global_role !== undefined) user.role = user.global_role;
    return user;
  }

  setSession(token, user) {
    if (!user || (this.user && this.user.id !== user.id)) this._savedIds = null;
    this.token = token;
    this.user = this.withRole(user);
    if (user) {
      sessionStorage.setItem('forfunable_user_hint', JSON.stringify({
        id: user.id,
        username: user.username,
        role: user.role
      }));
    } else {
      sessionStorage.removeItem('forfunable_user_hint');
    }
    this.notifyAuthChange();
  }

  // El backend envuelve las colecciones ({items}, {comments}, {messages}, {hits});
  // las vistas esperan arreglos. Acepta también un arreglo directo o null.
  listFrom(data, key = 'items') {
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.[key]) ? data[key] : [];
  }

  // El backend envía upvotes_count/downvotes_count (posts) y score (comentarios); las vistas muestran net_votes
  withNetVotes(item) {
    if (!item || item.net_votes !== undefined) return item;
    item.net_votes = item.score !== undefined
      ? item.score
      : (item.upvotes_count || 0) - (item.downvotes_count || 0);
    return item;
  }

  getCookie(name) {
    const match = document.cookie.split('; ').find(row => row.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
  }

  // 06_61/06_62 Reintentos con backoff exponencial ante fallos de red (solo lecturas idempotentes)
  async fetchWithRetry(url, options, method) {
    const attempts = method === 'GET' ? 3 : 1;
    for (let i = 1; ; i++) {
      try {
        const res = await fetch(url, options);
        if (i > 1 && window.StatusView) StatusView.retryDone();
        return res;
      } catch (err) {
        if (i >= attempts) {
          if (window.StatusView) StatusView.retryDone();
          throw { error: 'NETWORK_ERROR', status: 0, message: 'No se pudo conectar con el servidor' };
        }
        const delay = 500 * 2 ** (i - 1);
        if (window.StatusView) StatusView.retrying(i, delay);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    // Protección CSRF (double-submit cookie): reenviar csrf_token en mutaciones
    const method = (options.method || 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrfToken = this.getCookie('csrf_token');
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    }

    try {
      const response = await this.fetchWithRetry(url, { ...options, headers }, method);

      // Manejo de 401: Intento de auto-refresh de token
      if (response.status === 401 && !endpoint.includes('/auth/')) {
        const wasLoggedIn = !!this.user;
        const refreshed = await this.refreshToken();
        if (refreshed) {
          headers['Authorization'] = `Bearer ${this.token}`;
          const retryRes = await fetch(url, { ...options, headers });
          if (retryRes.ok) return retryRes.status === 204 ? null : await retryRes.json();
        } else {
          const lastUser = this.user && this.user.username;
          this.setSession(null, null);
          // 06_70 Sesión expirada: se ofrece reautenticación sin perder la página
          if (wasLoggedIn && window.StatusView) { StatusView._lastUser = lastUser; StatusView.sessionExpired(); }
        }
      }

      if (!response.ok) {
        let errData;
        try {
          errData = await response.json();
        } catch (_) {
          errData = { error: 'HTTP_ERROR', message: response.statusText };
        }
        errData.status = response.status;
        throw errData;
      }

      if (response.status === 204) return null;
      return await response.json();
    } catch (err) {
      console.error(`[API Error] ${endpoint}:`, err);
      throw err;
    }
  }

  // ==========================================
  // 1. Módulo de Autenticación y Perfil
  // ==========================================

  // ==========================================
  // reCAPTCHA Enterprise (LOGIN, REGISTER, CREATE_COMMUNITY)
  // ==========================================

  // Configuración pública del servidor (en caché): indica si reCAPTCHA está activo y su clave de sitio
  publicConfig() {
    if (!this._publicConfig) {
      this._publicConfig = fetch(`${API_BASE}/config/public`, { credentials: 'same-origin' })
        .then(r => (r.ok ? r.json() : {}))
        .catch(() => ({}));
    }
    return this._publicConfig;
  }

  // Carga https://www.google.com/recaptcha/enterprise.js una sola vez (permitido por la CSP)
  loadRecaptcha(siteKey) {
    if (!this._recaptchaScript) {
      this._recaptchaScript = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(siteKey)}`;
        s.async = true;
        s.onload = () => (window.grecaptcha && grecaptcha.enterprise ? grecaptcha.enterprise.ready(resolve) : reject(new Error('reCAPTCHA no disponible')));
        s.onerror = () => { this._recaptchaScript = null; reject(new Error('No se pudo cargar reCAPTCHA')); };
        document.head.appendChild(s);
      });
    }
    return this._recaptchaScript;
  }

  // Token para una acción concreta. Si el servidor no exige reCAPTCHA (desarrollo, RECAPTCHA_BYPASS=true)
  // se envía vacío: el verificador de desarrollo lo acepta y no hay ningún token simulado en el código.
  async recaptchaToken(action) {
    const cfg = await this.publicConfig();
    const rc = cfg && cfg.recaptcha;
    if (!rc || !rc.enabled || !rc.site_key) return '';
    try {
      await this.loadRecaptcha(rc.site_key);
      return await grecaptcha.enterprise.execute(rc.site_key, { action });
    } catch (_) {
      throw { error: 'RECAPTCHA_UNAVAILABLE', status: 0, message: 'No se pudo cargar la verificación anti-bots. Desactiva el bloqueador de contenido para este sitio o inténtalo de nuevo.' };
    }
  }

  async register(username, email, password) {
    const payload = this.valid('register', { username, email, password });
    payload.recaptcha_token = await this.recaptchaToken('REGISTER');
    const data = await this.request('/auth/register', this.jsonv('POST', 'register', payload));
    if (data && data.access_token) {
      this.setSession(data.access_token, data.user);
    }
    return data;
  }

  async login(email, password) {
    const payload = this.valid('login', { email, password });
    payload.recaptcha_token = await this.recaptchaToken('LOGIN');
    const data = await this.request('/auth/login', this.jsonv('POST', 'login', payload));
    if (data && data.access_token) {
      this.setSession(data.access_token, data.user);
    }
    return data;
  }

  async refreshToken() {
    try {
      const data = await this.request('/auth/refresh', { method: 'POST' });
      if (data && data.access_token) {
        this.token = data.access_token;
        if (data.user) this.user = this.withRole(data.user);
        this.notifyAuthChange();
        return true;
      }
    } catch (_) {
      this.setSession(null, null);
    }
    return false;
  }

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch (_) {}
    this.setSession(null, null);
  }

  async getMe() {
    const data = await this.request('/users/me');
    if (data) {
      this.user = this.withRole(data);
      this.notifyAuthChange();
    }
    return data;
  }

  async updateProfile(profileData) {
    return await this.request('/users/me/profile', {
      method: 'PATCH',
      body: this.bodyv('updateProfile', profileData)
    });
  }

  async updateStatus(status) {
    return await this.request('/users/me/status', {
      method: 'PATCH',
      body: this.bodyv('updateStatus', { presence_status: status })
    });
  }

  async changePassword(currentPassword, newPassword) {
    return await this.request('/users/me/password', {
      method: 'PATCH',
      body: this.bodyv('changePassword', { current_password: currentPassword, new_password: newPassword })
    });
  }

  async getPublicProfile(idOrUsername) {
    return await this.request(`/users/${idOrUsername}`);
  }

  async getUserKarma(userId) {
    return await this.request(`/users/${userId}/karma`);
  }

  // ==========================================
  // 2. Módulo de Comunidades
  // ==========================================

  async listCommunities() {
    return this.listFrom(await this.request('/communities'))
      .map(c => ({ ...c, subscribers_count: c.members_count || 0 }));
  }

  async getCommunity(name) {
    // El backend responde { community, moderators, is_member }; las vistas usan un objeto plano
    const data = await this.request(`/communities/${encodeURIComponent(name)}`);
    const comm = data?.community || data || {};
    return {
      ...comm,
      rules: comm.rules_text,
      subscribers_count: comm.members_count || 0,
      moderators: data?.moderators || [],
      is_member: !!data?.is_member
    };
  }

  async createCommunity(communityData) {
    const payload = this.valid('createCommunity', communityData);
    payload.recaptcha_token = await this.recaptchaToken('CREATE_COMMUNITY');
    return await this.request('/communities', this.jsonv('POST', 'createCommunity', payload));
  }

  async joinCommunity(communityId) {
    return await this.request(`/communities/${communityId}/join`, {
      method: 'POST'
    });
  }

  async leaveCommunity(communityId) {
    return await this.request(`/communities/${communityId}/leave`, {
      method: 'DELETE'
    });
  }

  // ==========================================
  // 3. Módulo de Publicaciones y Feed
  // ==========================================

  async getFeed(filter = 'hot', limit = 20, offset = 0) {
    return this.listFrom(await this.request(`/recommendations/feed?filter=${filter}&limit=${limit}&offset=${offset}`)).map(p => this.withNetVotes(p));
  }

  async listPosts(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.listFrom(await this.request(`/posts${query ? '?' + query : ''}`)).map(p => this.withNetVotes(p));
  }

  async getPost(postId) {
    return this.withNetVotes(await this.request(`/posts/${postId}`));
  }

  async createPost(postData) {
    return await this.request('/posts', {
      method: 'POST',
      body: this.bodyv('createPost', postData)
    });
  }

  async updatePost(postId, postData) {
    return await this.request(`/posts/${postId}`, {
      method: 'PATCH',
      body: this.bodyv('updatePost', postData)
    });
  }

  async deletePost(postId) {
    return await this.request(`/posts/${postId}`, {
      method: 'DELETE'
    });
  }

  // ==========================================
  // 4. Módulo de Comentarios Jerárquicos (ltree)
  // ==========================================

  async getPostComments(postId) {
    return this.listFrom(await this.request(`/posts/${postId}/comments`), 'comments')
      .map(c => ({ ...this.withNetVotes(c), author_id: c.author_id || c.user_id }));
  }

  async createComment(commentData) {
    return await this.request('/comments', {
      method: 'POST',
      body: this.bodyv('createComment', commentData)
    });
  }

  async updateComment(commentId, content) {
    return await this.request(`/comments/${commentId}`, {
      method: 'PATCH',
      body: this.bodyv('updateComment', { content })
    });
  }

  async deleteComment(commentId) {
    return await this.request(`/comments/${commentId}`, {
      method: 'DELETE'
    });
  }

  // ==========================================
  // 5. Votación Write-Behind
  // ==========================================

  async votePost(postId, voteType) {
    return await this.request(`/votes/posts/${postId}`, {
      method: 'POST',
      body: this.bodyv('vote', { vote_value: voteType })
    });
  }

  async voteComment(commentId, voteType) {
    return await this.request(`/votes/comments/${commentId}`, {
      method: 'POST',
      body: this.bodyv('vote', { vote_value: voteType })
    });
  }

  // ==========================================
  // 6. Notificaciones y Búsqueda
  // ==========================================

  async listNotifications() {
    return this.listFrom(await this.request('/notifications'));
  }

  async markNotificationRead(notifId) {
    return await this.request(`/notifications/${notifId}/read`, {
      method: 'PATCH'
    });
  }

  async markAllNotificationsRead() {
    return await this.request('/notifications/read-all', { method: 'PATCH' });
  }

  // targetType: POST | COMMENT | USER | CHAT_MESSAGE
  async createReport(targetId, targetType, reasonCode, description = '') {
    return await this.request('/reports', {
      method: 'POST',
      body: this.bodyv('report', { target_id: targetId, target_type: targetType, reason_code: reasonCode, description })
    });
  }

  async predictiveSearch(query) {
    const hits = this.listFrom(await this.request(`/search/predictive?q=${encodeURIComponent(query)}`), 'hits');
    return {
      communities: hits.filter(h => h.type === 'community').map(h => ({ id: h.id, name: h.title })),
      posts: hits.filter(h => h.type === 'post').map(h => ({ id: h.id, title: h.title })),
      users: hits.filter(h => h.type === 'user').map(h => ({ id: h.id, username: h.title }))
    };
  }

  // ==========================================
  // 7. Mensajería Privada y Solicitudes
  // ==========================================

  async listConversations() {
    return this.listFrom(await this.request('/chats/conversations'));
  }

  async listMessages(convId) {
    return this.listFrom(await this.request(`/chats/conversations/${convId}/messages`), 'messages');
  }

  async sendMessage(convId, content) {
    return await this.request(`/chats/conversations/${convId}/messages`, {
      method: 'POST',
      body: this.bodyv('chatMessage', { message_text: content })
    });
  }

  async listChatRequests() {
    return this.listFrom(await this.request('/chats/requests'));
  }

  // action: ACCEPT | REJECT | BLOCK. Al aceptar, la respuesta incluye conversation_id
  async respondChatRequest(requestId, action) {
    return await this.request(`/chats/requests/${requestId}`, {
      method: 'PATCH',
      body: this.bodyv('chatAction', { action })
    });
  }

  async createChatRequest(targetUserId, message) {
    return await this.request('/chats/requests', {
      method: 'POST',
      body: this.bodyv('chatRequest', { recipient_user_id: targetUserId, initial_message: message })
    });
  }

  // ==========================================
  // 8. Administración y Moderación
  // ==========================================

  async adminListUsers(limit = 50, offset = 0) {
    return this.listFrom(await this.request(`/admin/users?limit=${limit}&offset=${offset}`)).map(u => this.withRole(u));
  }

  async adminUpdateUserRole(userId, role) {
    return await this.request(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: this.bodyv('userRole', { global_role: role })
    });
  }

  async adminGetAuditLogs(limit = 50) {
    // Campos del backend (moderator_username, action_type, reason) → los que usa la tabla
    return this.listFrom(await this.request(`/admin/audit/logs?limit=${limit}`))
      .map(l => ({ ...l, actor_username: l.moderator_username, action: l.action_type, details: l.reason }));
  }

  async adminListReports() {
    // La cola muestra solo lo pendiente; lo resuelto queda en los logs de auditoría
    return this.listFrom(await this.request('/admin/moderation/reports?status=PENDING'));
  }

  async adminResolveReport(reportId, resolution) {
    // Acciones de la vista → estados que acepta el backend
    const status = { DISMISS: 'DISMISSED', RESOLVE_DELETE: 'ACTIONED' }[resolution] || resolution;
    return await this.request(`/admin/moderation/reports/${reportId}`, {
      method: 'PATCH',
      body: this.bodyv('resolveReport', { status })
    });
  }

  json(method, body) {
    return { method, body: JSON.stringify(body || {}) };
  }

  // Validación previa con Zod (js/schemas.js): ningún payload sale sin pasar por su esquema
  valid(schema, data) { return window.validatePayload(schema, data); }
  bodyv(schema, data) { return JSON.stringify(this.valid(schema, data)); }
  jsonv(method, schema, data) { return { method, body: this.bodyv(schema, data) }; }

  // ==========================================
  // 9. Miembros, edad y preferencias
  // ==========================================

  async listMembers(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.listFrom(await this.request(`/users${query ? '?' + query : ''}`));
  }

  // 01_06: el backend registra la mayoría de edad declarada por el usuario
  async verifyAge(assertion) {
    return await this.request('/users/me/verify-age', this.jsonv('POST', 'verifyAge', { idp_assertion_token: assertion }));
  }

  async getNotificationSettings() {
    return await this.request('/notifications/settings');
  }

  async updateNotificationSettings(settings) {
    return await this.request('/notifications/settings', this.jsonv('PUT', 'notificationSettings', settings));
  }

  // ==========================================
  // 10. Notas comunitarias
  // ==========================================

  async listCommunityNotes(postId) {
    return this.listFrom(await this.request(`/community-notes?post_id=${encodeURIComponent(postId)}`));
  }

  async createCommunityNote(postId, noteText, proofUrl = '') {
    return await this.request('/community-notes', this.jsonv('POST', 'communityNote', { post_id: postId, note_text: noteText, proof_url: proofUrl }));
  }

  async voteCommunityNote(noteId, isHelpful) {
    return await this.request(`/community-notes/${noteId}/vote`, this.jsonv('POST', 'noteVote', { is_helpful: isHelpful }));
  }

  // ==========================================
  // 11. Moderación de comunidades y administración
  // ==========================================

  async adminUpdateCommunitySettings(communityId, settings) {
    return await this.request(`/admin/communities/${communityId}/settings`, this.jsonv('PUT', 'communitySettings', settings));
  }

  async adminAssignModerator(communityId, userId, role) {
    return await this.request(`/admin/communities/${communityId}/moderators`, this.jsonv('POST', 'assignModerator', { user_id: userId, role }));
  }

  async adminListBans(communityId) {
    return this.listFrom(await this.request(`/admin/communities/${communityId}/bans`));
  }

  async adminBan(userId, communityId, reason, durationDays) {
    return await this.request('/admin/moderation/actions/ban', this.jsonv('POST', 'ban', { user_id: userId, community_id: communityId, reason, duration_days: durationDays }));
  }

  async adminUnban(userId, communityId, reason) {
    return await this.request('/admin/moderation/actions/unban', this.jsonv('POST', 'unban', { user_id: userId, community_id: communityId, reason }));
  }

  async adminRemoveContent(contentId) {
    return await this.request(`/admin/moderation/content/${contentId}/remove`, { method: 'DELETE' });
  }

  async adminMetrics(timeframe = '24h') {
    return await this.request(`/admin/analytics/metrics?timeframe=${encodeURIComponent(timeframe)}`);
  }

  async adminAccountGroups(riskThreshold = 0.5) {
    return await this.request(`/admin/security/account-groups?risk_threshold=${riskThreshold}`);
  }

  async adminReindex(body = {}) {
    return await this.request('/admin/recommendations/reindex', this.jsonv('POST', 'reindex', body));
  }

  async adminUpdateUserStatus(userId, isActive, freezeReason = '') {
    return await this.request(`/admin/users/${userId}/status`, this.jsonv('PATCH', 'userStatus', { is_active: isActive, freeze_reason: freezeReason }));
  }

  async adminListAllReports(status = '') {
    return this.listFrom(await this.request(`/admin/moderation/reports${status ? '?status=' + status : ''}`));
  }

  // ==========================================
  // 12. Guardados y colecciones (02_16)
  // ==========================================

  async listSaved(collection = '') {
    const data = this.listFrom(await this.request(`/users/me/saved${collection ? '?collection=' + encodeURIComponent(collection) : ''}`));
    return data.map(s => ({ ...s, post: this.withNetVotes(s.post) }));
  }

  // Ids guardados en caché para pintar los marcadores sin una petición por tarjeta
  async savedIds(force = false) {
    if (!this.user) return new Set();
    if (!force && this._savedIds) return this._savedIds;
    try { this._savedIds = new Set(this.listFrom(await this.request('/users/me/saved/ids'))); }
    catch (_) { this._savedIds = new Set(); }
    return this._savedIds;
  }

  async savePost(postId, collectionId = null, note = '') {
    const res = await this.request(`/users/me/saved/${postId}`, this.jsonv('PUT', 'save', { collection_id: collectionId || null, note }));
    (await this.savedIds()).add(postId);
    return res;
  }

  async unsavePost(postId) {
    const res = await this.request(`/users/me/saved/${postId}`, { method: 'DELETE' });
    (await this.savedIds()).delete(postId);
    return res;
  }

  async listCollections() { return this.listFrom(await this.request('/users/me/collections')); }
  async createCollection(name, description = '') { return await this.request('/users/me/collections', this.jsonv('POST', 'collection', { name, description })); }
  async updateCollection(id, name, description = '') { return await this.request(`/users/me/collections/${id}`, this.jsonv('PATCH', 'collection', { name, description })); }
  async deleteCollection(id) { return await this.request(`/users/me/collections/${id}`, { method: 'DELETE' }); }

  // ==========================================
  // 13. Historial de versiones (03_22)
  // ==========================================

  async listRevisions(postId) { return await this.request(`/posts/${postId}/revisions`); }

  // ==========================================
  // 14. Sesiones, exportación y eliminación de cuenta (01_07, 06_89, 06_90, 06_86, 06_74)
  // ==========================================

  async listSessions() { return await this.request('/users/me/sessions'); }
  async revokeSession(id) { return await this.request(`/users/me/sessions/${id}`, { method: 'DELETE' }); }

  // Cierra los demás dispositivos y rota las credenciales de este (nuevo token de acceso)
  async revokeOtherSessions() {
    const data = await this.request('/users/me/sessions/revoke-others', { method: 'POST' });
    if (data && data.access_token) this.setSession(data.access_token, data.user || this.user);
    return data;
  }

  async exportSummary() { return await this.request('/users/me/export?summary=1'); }
  async exportData() { return await this.request('/users/me/export'); }
  async getDeletion() { return await this.request('/users/me/deletion'); }
  async requestDeletion(password, confirmUsername, reason = '') {
    const data = await this.request('/users/me/deletion', this.jsonv('POST', 'deleteAccount', { password, confirm_username: confirmUsername, reason }));
    this._savedIds = null;
    this.setSession(null, null);
    return data;
  }
  async cancelDeletion() { return await this.request('/users/me/deletion', { method: 'DELETE' }); }

  // ==========================================
  // 15. Comunidades privadas, flairs y propiedad (06_79, 06_80, 02_19, 05_40)
  // ==========================================

  async requestAccess(communityId, message = '') { return await this.request(`/communities/${communityId}/join`, this.jsonv('POST', 'accessRequest', { message })); }
  async myAccessRequests() { return this.listFrom(await this.request('/users/me/access-requests')); }
  async listAccessRequests(name, status = '') { return this.listFrom(await this.request(`/communities/${encodeURIComponent(name)}/access-requests${status ? '?status=' + status : ''}`)); }
  async decideAccessRequest(communityId, requestId, action, note = '') { return await this.request(`/communities/${communityId}/access-requests/${requestId}`, this.jsonv('PATCH', 'accessDecision', { action, note })); }

  async listFlairs(name) { return await this.request(`/communities/${encodeURIComponent(name)}/flairs`); }
  async createFlair(communityId, flair) { return await this.request(`/communities/${communityId}/flairs`, this.jsonv('POST', 'flair', flair)); }
  async updateFlair(communityId, flairId, flair) { return await this.request(`/communities/${communityId}/flairs/${flairId}`, this.jsonv('PATCH', 'flair', flair)); }
  async deleteFlair(communityId, flairId) { return await this.request(`/communities/${communityId}/flairs/${flairId}`, { method: 'DELETE' }); }
  async setPostFlair(postId, flairId) { return await this.request(`/posts/${postId}/flair`, this.jsonv('PUT', 'postFlair', { flair_id: flairId || '' })); }

  async transferOwnership(communityId, newOwner, confirmName) { return await this.request(`/communities/${communityId}/transfer`, this.jsonv('POST', 'transfer', { new_owner: newOwner, confirm_name: confirmName })); }

  // ==========================================
  // 16. Sanciones y apelaciones (01_11)
  // ==========================================

  async mySanctions() { return this.listFrom(await this.request('/users/me/sanctions')); }
  async myAppeals() { return this.listFrom(await this.request('/users/me/appeals')); }
  async createAppeal(kind, referenceId, message) { return await this.request('/appeals', this.jsonv('POST', 'appeal', { kind, reference_id: referenceId, message })); }
  async adminListAppeals(status = '') { return this.listFrom(await this.request(`/admin/appeals${status ? '?status=' + status : ''}`)); }
  async adminDecideAppeal(id, decision, resolution) { return await this.request(`/admin/appeals/${id}`, this.jsonv('PATCH', 'appealDecision', { decision, resolution })); }
}

// Exportar instancia singleton
window.api = new ApiClient();

// Utilidades Globales de Sanitización XSS y UI
window.utils = {
  // Voto único por usuario: la misma flecha otra vez retira el voto y la contraria lo cambia.
  // El marcador se toma de la respuesta del servidor, no se suma en el cliente.
  async castVote(kind, id, clicked) {
    if (!window.api.user) {
      Router.navigate('/login');
      window.utils.showToast('Inicia sesión para votar', 'info');
      return;
    }
    const box = document.querySelector(`[data-vote-box="${kind}:${id}"]`);
    if (!box || box.dataset.busy === '1') return;
    const current = Number(box.dataset.userVote || 0);
    const next = current === clicked ? 0 : clicked;

    box.dataset.busy = '1';
    try {
      const res = kind === 'post'
        ? await window.api.votePost(id, next)
        : await window.api.voteComment(id, next);
      window.utils.paintVote(box, res.current_vote, res.new_score);
    } catch (err) {
      // 429 → "Vas muy rápido" (06_67); 401 → modal de autenticación; resto, aviso
      if (window.StatusView) StatusView.toastError(err, 'No se pudo registrar el voto');
      else window.utils.showToast(err.message || 'No se pudo registrar el voto', 'error');
    } finally {
      box.dataset.busy = '';
    }
  },

  paintVote(box, userVote, score) {
    box.dataset.userVote = userVote;
    box.querySelector('[data-vote-dir="1"]').classList.toggle('voted-up', userVote === 1);
    box.querySelector('[data-vote-dir="-1"]').classList.toggle('voted-down', userVote === -1);
    const scoreEl = box.querySelector('.vote-score');
    scoreEl.textContent = score;
    scoreEl.classList.toggle('voted-up', userVote === 1);
    scoreEl.classList.toggle('voted-down', userVote === -1);
  },

  // Sanitizador seguro contra inyecciones XSS
  escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  // El backend guarda los textos ya escapados (middleware.SanitizeText); se decodifican una vez
  // antes de volver a escapar al mostrarlos, para no ver "&#39;" en pantalla.
  decodeEntities(str) {
    if (!str) return '';
    return String(str)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
      .replace(/&amp;/g, '&');
  },

  // Literal JS seguro para un atributo HTML (heredado; las vistas usan UI.on, sin manejadores en línea): genera un literal JS
  // con JSON.stringify y lo escapa para el atributo. escapeHTML solo NO basta: el navegador
  // decodifica &#039; antes de ejecutar el JS y la comilla rompe la cadena.
  jsArg(value) {
    return this.escapeHTML(JSON.stringify(String(value ?? '')));
  },

  // Parser ligero de Markdown seguro
  renderMarkdown(text) {
    if (!text) return '';
    let escaped = this.escapeHTML(this.decodeEntities(text));

    // Bloques de código pre/code
    escaped = escaped.replace(/```([a-z]*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
    // Código inline
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Negrita
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Cursiva
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Citas (> texto), usadas por "Responder con cita"
    escaped = escaped.replace(/(^|\n)((?:&gt; ?[^\n]*(?:\n|$))+)/g, (m, pre, block) =>
      `${pre}<blockquote>${block.replace(/&gt; ?/g, '').trim().replace(/\n/g, '<br/>')}</blockquote>\n\n`);
    // Saltos de línea a párrafos
    escaped = escaped.split('\n\n').map(p => p.trim()).filter(Boolean).map(p =>
      p.startsWith('<blockquote>') || p.startsWith('<pre>') ? p : `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');

    return escaped;
  },

  formatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffSeconds = Math.floor((now - date) / 1000);

    if (diffSeconds < 60) return 'hace un momento';
    if (diffSeconds < 3600) return `hace ${Math.floor(diffSeconds / 60)}m`;
    if (diffSeconds < 86400) return `hace ${Math.floor(diffSeconds / 3600)}h`;
    return `hace ${Math.floor(diffSeconds / 86400)}d`;
  },

  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'fixed bottom-4 right-4 z-[110] flex max-w-sm flex-col gap-2';
      document.body.appendChild(container);
    }
    const tone = { error: ['error', 'text-danger'], warning: ['warning', 'text-warning'] }[type] || ['check_circle', 'text-primary'];
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML = `<span class="icon icon-fill text-[18px] ${tone[1]}">${tone[0]}</span><span>${this.escapeHTML(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => toast.remove(), 200);
    }, 4000);
  }
};

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

  async register(username, email, password, recaptchaToken = 'mock_token') {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, recaptcha_token: recaptchaToken })
    });
    if (data && data.access_token) {
      this.setSession(data.access_token, data.user);
    }
    return data;
  }

  async login(email, password, recaptchaToken = 'mock_token') {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, recaptcha_token: recaptchaToken })
    });
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
      body: JSON.stringify(profileData)
    });
  }

  async updateStatus(status) {
    return await this.request('/users/me/status', {
      method: 'PATCH',
      body: JSON.stringify({ presence_status: status })
    });
  }

  async changePassword(currentPassword, newPassword) {
    return await this.request('/users/me/password', {
      method: 'PATCH',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
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
    return await this.request('/communities', {
      method: 'POST',
      body: JSON.stringify(communityData)
    });
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
      body: JSON.stringify(postData)
    });
  }

  async updatePost(postId, postData) {
    return await this.request(`/posts/${postId}`, {
      method: 'PATCH',
      body: JSON.stringify(postData)
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
      body: JSON.stringify(commentData)
    });
  }

  async updateComment(commentId, content) {
    return await this.request(`/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content })
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
      body: JSON.stringify({ vote_value: voteType })
    });
  }

  async voteComment(commentId, voteType) {
    return await this.request(`/votes/comments/${commentId}`, {
      method: 'POST',
      body: JSON.stringify({ vote_value: voteType })
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
      body: JSON.stringify({ target_id: targetId, target_type: targetType, reason_code: reasonCode, description })
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
      body: JSON.stringify({ message_text: content })
    });
  }

  async listChatRequests() {
    return this.listFrom(await this.request('/chats/requests'));
  }

  // action: ACCEPT | REJECT | BLOCK. Al aceptar, la respuesta incluye conversation_id
  async respondChatRequest(requestId, action) {
    return await this.request(`/chats/requests/${requestId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action })
    });
  }

  async createChatRequest(targetUserId, message) {
    return await this.request('/chats/requests', {
      method: 'POST',
      body: JSON.stringify({ recipient_user_id: targetUserId, initial_message: message })
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
      body: JSON.stringify({ global_role: role })
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
      body: JSON.stringify({ status })
    });
  }

  json(method, body) {
    return { method, body: JSON.stringify(body || {}) };
  }

  // ==========================================
  // 9. Miembros, edad y preferencias
  // ==========================================

  async listMembers(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.listFrom(await this.request(`/users${query ? '?' + query : ''}`));
  }

  // 01_06: el backend registra la mayoría de edad declarada por el usuario
  async verifyAge(assertion) {
    return await this.request('/users/me/verify-age', this.json('POST', { idp_assertion_token: assertion }));
  }

  async getNotificationSettings() {
    return await this.request('/notifications/settings');
  }

  async updateNotificationSettings(settings) {
    return await this.request('/notifications/settings', this.json('PUT', settings));
  }

  // ==========================================
  // 10. Notas comunitarias
  // ==========================================

  async listCommunityNotes(postId) {
    return this.listFrom(await this.request(`/community-notes?post_id=${encodeURIComponent(postId)}`));
  }

  async createCommunityNote(postId, noteText, proofUrl = '') {
    return await this.request('/community-notes', this.json('POST', { post_id: postId, note_text: noteText, proof_url: proofUrl }));
  }

  async voteCommunityNote(noteId, isHelpful) {
    return await this.request(`/community-notes/${noteId}/vote`, this.json('POST', { is_helpful: isHelpful }));
  }

  // ==========================================
  // 11. Moderación de comunidades y administración
  // ==========================================

  async adminUpdateCommunitySettings(communityId, settings) {
    return await this.request(`/admin/communities/${communityId}/settings`, this.json('PUT', settings));
  }

  async adminAssignModerator(communityId, userId, role) {
    return await this.request(`/admin/communities/${communityId}/moderators`, this.json('POST', { user_id: userId, role }));
  }

  async adminListBans(communityId) {
    return this.listFrom(await this.request(`/admin/communities/${communityId}/bans`));
  }

  async adminBan(userId, communityId, reason, durationDays) {
    return await this.request('/admin/moderation/actions/ban', this.json('POST', { user_id: userId, community_id: communityId, reason, duration_days: durationDays }));
  }

  async adminUnban(userId, communityId, reason) {
    return await this.request('/admin/moderation/actions/unban', this.json('POST', { user_id: userId, community_id: communityId, reason }));
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
    return await this.request('/admin/recommendations/reindex', this.json('POST', body));
  }

  async adminUpdateUserStatus(userId, isActive, freezeReason = '') {
    return await this.request(`/admin/users/${userId}/status`, this.json('PATCH', { is_active: isActive, freeze_reason: freezeReason }));
  }

  async adminListAllReports(status = '') {
    return this.listFrom(await this.request(`/admin/moderation/reports${status ? '?status=' + status : ''}`));
  }
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

  // Argumento seguro para manejadores inline (onclick="fn(${jsArg(x)})"): genera un literal JS
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

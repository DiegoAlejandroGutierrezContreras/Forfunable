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

  setSession(token, user) {
    this.token = token;
    this.user = user;
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

  getCookie(name) {
    const match = document.cookie.split('; ').find(row => row.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
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
      const response = await fetch(url, {
        ...options,
        headers
      });

      // Manejo de 401: Intento de auto-refresh de token
      if (response.status === 401 && !endpoint.includes('/auth/')) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          headers['Authorization'] = `Bearer ${this.token}`;
          const retryRes = await fetch(url, { ...options, headers });
          if (retryRes.ok) return await retryRes.json();
        } else {
          this.setSession(null, null);
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
        if (data.user) this.user = data.user;
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
      this.user = data;
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
    return this.listFrom(await this.request('/communities'));
  }

  async getCommunity(name) {
    return await this.request(`/communities/${encodeURIComponent(name)}`);
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
    return this.listFrom(await this.request(`/recommendations/feed?filter=${filter}&limit=${limit}&offset=${offset}`));
  }

  async listPosts(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.listFrom(await this.request(`/posts${query ? '?' + query : ''}`));
  }

  async getPost(postId) {
    return await this.request(`/posts/${postId}`);
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
    return this.listFrom(await this.request(`/posts/${postId}/comments`), 'comments');
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

  async predictiveSearch(query) {
    const hits = this.listFrom(await this.request(`/search/predictive?q=${encodeURIComponent(query)}`), 'hits');
    return {
      communities: hits.filter(h => h.type === 'community').map(h => ({ id: h.id, name: h.title })),
      posts: hits.filter(h => h.type === 'post').map(h => ({ id: h.id, title: h.title })),
      users: []
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
    return this.listFrom(await this.request(`/admin/users?limit=${limit}&offset=${offset}`));
  }

  async adminUpdateUserRole(userId, role) {
    return await this.request(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ global_role: role })
    });
  }

  async adminGetAuditLogs(limit = 50) {
    return this.listFrom(await this.request(`/admin/audit/logs?limit=${limit}`));
  }

  async adminListReports() {
    return this.listFrom(await this.request('/admin/moderation/reports'));
  }

  async adminResolveReport(reportId, resolution) {
    // Acciones de la vista → estados que acepta el backend
    const status = { DISMISS: 'DISMISSED', RESOLVE_DELETE: 'ACTIONED' }[resolution] || resolution;
    return await this.request(`/admin/moderation/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  }
}

// Exportar instancia singleton
window.api = new ApiClient();

// Utilidades Globales de Sanitización XSS y UI
window.utils = {
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

  // Parser ligero de Markdown seguro
  renderMarkdown(text) {
    if (!text) return '';
    let escaped = this.escapeHTML(text);

    // Bloques de código pre/code
    escaped = escaped.replace(/```([a-z]*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
    // Código inline
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Negrita
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Cursiva
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Saltos de línea a párrafos
    escaped = escaped.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');

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
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span style="color: ${type === 'error' ? 'var(--error)' : 'var(--primary)'}">●</span>
      <span>${this.escapeHTML(message)}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 200ms ease';
      setTimeout(() => toast.remove(), 200);
    }, 4000);
  }
};

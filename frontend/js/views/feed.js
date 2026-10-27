/**
 * Vista: Feed Principal (Pantalla Stitch 02-14)
 * Conectada a /api/v1/recommendations/feed y /api/v1/posts
 */

window.FeedView = {
  activeFilter: 'hot',

  async render(container, communityName = null) {
    container.innerHTML = `
      <div class="feed-header" style="margin-bottom: var(--space-md); display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2>${communityName ? `c/${communityName}` : 'Feed Principal'}</h2>
          <p style="color: var(--text-secondary); font-size: 13px;">
            ${communityName ? 'Publicaciones de la comunidad' : 'Ordenado por el Algoritmo de Atenuación Temporal (Hot Ranking)'}
          </p>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary ${this.activeFilter === 'hot' ? 'btn-primary' : ''}" onclick="FeedView.setFilter('hot')">🔥 Hot</button>
          <button class="btn btn-secondary ${this.activeFilter === 'new' ? 'btn-primary' : ''}" onclick="FeedView.setFilter('new')">✨ Nuevos</button>
          <button class="btn btn-secondary ${this.activeFilter === 'top' ? 'btn-primary' : ''}" onclick="FeedView.setFilter('top')">🏆 Top</button>
        </div>
      </div>

      <div id="feed-content">
        <!-- 1. LOADING STATE (Skeletons con shimmer) -->
        <div class="skeleton-card">
          <div class="skeleton skeleton-title" style="width: 60%;"></div>
          <div class="skeleton skeleton-text" style="width: 90%;"></div>
          <div class="skeleton skeleton-text" style="width: 40%;"></div>
        </div>
        <div class="skeleton-card">
          <div class="skeleton skeleton-title" style="width: 50%;"></div>
          <div class="skeleton skeleton-text" style="width: 85%;"></div>
          <div class="skeleton skeleton-text" style="width: 30%;"></div>
        </div>
      </div>
    `;

    await this.loadPosts(communityName);
  },

  async setFilter(filter) {
    this.activeFilter = filter;
    await this.loadPosts();
  },

  async loadPosts(communityName = null) {
    const feedContent = document.getElementById('feed-content');
    if (!feedContent) return;

    try {
      let posts = [];
      if (communityName) {
        posts = await window.api.listPosts({ community: communityName });
      } else {
        posts = await window.api.getFeed(this.activeFilter);
      }

      // 3. EMPTY STATE
      if (!posts || posts.length === 0) {
        feedContent.innerHTML = `
          <div class="state-empty">
            <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
            </svg>
            <h3>Aún no hay publicaciones</h3>
            <p>Sé el primero en iniciar un debate técnico en este canal.</p>
            <button class="btn btn-primary" onclick="Router.navigate('/submit')">Crear Publicación</button>
          </div>
        `;
        return;
      }

      // 2. SUCCESS STATE (Renderizado de publicaciones con votación write-behind)
      feedContent.innerHTML = posts.map(post => `
        <div class="card" style="margin-bottom: var(--space-md); display: flex; gap: var(--space-md);" id="post-${post.id}">
          <!-- Widget Votación -->
          <div class="vote-pill">
            <button class="vote-btn ${post.user_vote === 1 ? 'voted-up' : ''}" onclick="FeedView.vote('${post.id}', 1)">▲</button>
            <span class="vote-score ${post.user_vote === 1 ? 'voted-up' : post.user_vote === -1 ? 'voted-down' : ''}" id="score-${post.id}">
              ${post.net_votes || post.votes_count || 0}
            </span>
            <button class="vote-btn ${post.user_vote === -1 ? 'voted-down' : ''}" onclick="FeedView.vote('${post.id}', -1)">▼</button>
          </div>

          <!-- Contenido del Post -->
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 12px; color: var(--text-secondary);">
              <span class="chip" onclick="Router.navigate('/c/${post.community_name || 'general'}')" style="cursor: pointer;">
                c/${post.community_name || 'general'}
              </span>
              <span>•</span>
              <span>por u/${window.utils.escapeHTML(post.author_username || 'usuario')}</span>
              <span>•</span>
              <span>${window.utils.formatTime(post.created_at)}</span>
            </div>

            <h3 style="cursor: pointer; margin-bottom: 8px;" onclick="Router.navigate('/posts/${post.id}')">
              ${window.utils.escapeHTML(post.title)}
            </h3>

            <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
              ${window.utils.escapeHTML(post.content || '')}
            </p>

            <div style="display: flex; gap: 16px; font-size: 12px; color: var(--text-muted);">
              <span style="display: flex; align-items: center; gap: 4px; cursor: pointer;" onclick="Router.navigate('/posts/${post.id}')">
                💬 ${post.comments_count || 0} comentarios
              </span>
              <span style="display: flex; align-items: center; gap: 4px; cursor: pointer;" onclick="FeedView.sharePost('${post.id}')">
                ↗ Compartir
              </span>
            </div>
          </div>
        </div>
      `).join('');

    } catch (err) {
      // 4. ERROR STATE (Con botón de reintento)
      feedContent.innerHTML = `
        <div class="state-error">
          <svg class="error-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
          <h3>Error al cargar el feed</h3>
          <p>${window.utils.escapeHTML(err.message || 'No se pudo conectar con el servicio de recomendaciones en Cloud Run.')}</p>
          <button class="btn btn-secondary" onclick="FeedView.loadPosts('${communityName || ''}')">Reintentar</button>
        </div>
      `;
    }
  },

  async vote(postId, voteType) {
    if (!window.api.user) {
      Router.navigate('/login');
      window.utils.showToast('Inicia sesión para votar en publicaciones', 'info');
      return;
    }

    const scoreEl = document.getElementById(`score-${postId}`);
    const postEl = document.getElementById(`post-${postId}`);
    if (!scoreEl) return;

    // Actualización optimista de UI
    let currentScore = parseInt(scoreEl.textContent) || 0;
    scoreEl.textContent = currentScore + voteType;
    scoreEl.className = `vote-score ${voteType === 1 ? 'voted-up' : 'voted-down'}`;

    try {
      await window.api.votePost(postId, voteType);
    } catch (err) {
      scoreEl.textContent = currentScore;
      window.utils.showToast('Error al registrar el voto en el buffer write-behind', 'error');
    }
  },

  sharePost(postId) {
    const url = `${window.location.origin}/posts/${postId}`;
    navigator.clipboard.writeText(url);
    window.utils.showToast('Enlace copiado al portapapeles', 'info');
  }
};

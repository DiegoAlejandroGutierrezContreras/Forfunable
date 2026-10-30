/**
 * Vista: Feed Principal (Pantalla Stitch 02-14)
 * Conectada a /api/v1/recommendations/feed y /api/v1/posts
 */

window.FeedView = {
  activeFilter: 'hot',

  async render(container, communityName = null) {
    this.communityName = communityName;
    container.innerHTML = `
      <div class="feed-header" style="margin-bottom: var(--space-md); display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2>${communityName ? `c/${communityName}` : 'Feed Principal'}</h2>
          <p id="feed-subtitle" style="color: var(--text-secondary); font-size: 13px;">
            ${this.subtitleFor(communityName)}
          </p>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn ${this.activeFilter === 'hot' ? 'btn-primary' : 'btn-secondary'}" data-feed-filter="hot" onclick="FeedView.setFilter('hot')">🔥 Hot</button>
          <button class="btn ${this.activeFilter === 'new' ? 'btn-primary' : 'btn-secondary'}" data-feed-filter="new" onclick="FeedView.setFilter('new')">✨ Nuevos</button>
          <button class="btn ${this.activeFilter === 'top' ? 'btn-primary' : 'btn-secondary'}" data-feed-filter="top" onclick="FeedView.setFilter('top')">🏆 Top</button>
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

  subtitleFor(communityName) {
    const order = {
      hot: 'Hot: votos atenuados por antigüedad (Hot Ranking)',
      new: 'Nuevos: lo más reciente primero',
      top: 'Top: las publicaciones más votadas'
    }[this.activeFilter];
    return communityName ? `Publicaciones de la comunidad · ${order}` : `Ordenado por ${order}`;
  },

  async setFilter(filter) {
    this.activeFilter = filter;
    document.querySelectorAll('[data-feed-filter]').forEach(btn => {
      btn.className = `btn ${btn.dataset.feedFilter === filter ? 'btn-primary' : 'btn-secondary'}`;
    });
    const subtitle = document.getElementById('feed-subtitle');
    if (subtitle) subtitle.textContent = this.subtitleFor(this.communityName);
    // Mantener la comunidad actual; sin esto el filtro cargaba el feed global
    await this.loadPosts(this.communityName);
  },

  // Filtro de la vista → parámetro sort de GET /posts
  sortParam() {
    return { hot: 'hot', new: 'newest', top: 'top' }[this.activeFilter] || 'newest';
  },

  async loadPosts(communityName = null) {
    const feedContent = document.getElementById('feed-content');
    if (!feedContent) return;

    try {
      let posts = [];
      if (communityName) {
        // El backend filtra por community_id, no por nombre
        const current = window.CommunityView?.currentCommunity;
        const comm = current?.name === communityName ? current : await window.api.getCommunity(communityName);
        posts = await window.api.listPosts({ community_id: comm.id, sort: this.sortParam() });
      } else {
        // GET /posts es público; /recommendations/feed exige sesión y fallaba para visitantes
        posts = await window.api.listPosts({ sort: this.sortParam() });
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
          <div class="vote-pill" data-vote-box="post:${post.id}" data-user-vote="${post.user_vote || 0}">
            <button class="vote-btn ${post.user_vote === 1 ? 'voted-up' : ''}" data-vote-dir="1" onclick="FeedView.vote('${post.id}', 1)">▲</button>
            <span class="vote-score ${post.user_vote === 1 ? 'voted-up' : post.user_vote === -1 ? 'voted-down' : ''}" id="score-${post.id}">
              ${post.net_votes || post.votes_count || 0}
            </span>
            <button class="vote-btn ${post.user_vote === -1 ? 'voted-down' : ''}" data-vote-dir="-1" onclick="FeedView.vote('${post.id}', -1)">▼</button>
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
    await window.utils.castVote('post', postId, voteType);
  },

  sharePost(postId) {
    const url = `${window.location.origin}/posts/${postId}`;
    navigator.clipboard.writeText(url);
    window.utils.showToast('Enlace copiado al portapapeles', 'info');
  }
};

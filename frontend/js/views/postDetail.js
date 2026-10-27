/**
 * Vista: Detalle de Publicación y Discusión (Pantalla Stitch 02-17)
 * Renderizado de Árbol de Comentarios con Jerarquía ltree y Votación Write-Behind
 */

window.PostDetailView = {
  currentPost: null,
  comments: [],

  async render(container, postId) {
    container.innerHTML = `
      <button class="btn btn-ghost" onclick="Router.navigate('/')" style="margin-bottom: var(--space-md);">
        ← Volver al Feed
      </button>

      <div id="post-detail-container">
        <!-- Loading State -->
        <div class="skeleton-card">
          <div class="skeleton skeleton-title" style="width: 70%;"></div>
          <div class="skeleton skeleton-text" style="width: 95%;"></div>
          <div class="skeleton skeleton-text" style="width: 80%;"></div>
        </div>
      </div>

      <!-- Sección de Comentarios -->
      <div class="card" style="margin-top: var(--space-lg);">
        <h3 style="margin-bottom: var(--space-md);">💬 Discusión Técnica</h3>

        <!-- Formulario de Nuevo Comentario Raíz -->
        <div id="comment-box" style="margin-bottom: var(--space-lg);">
          <textarea id="root-comment-input" class="form-textarea" rows="3" placeholder="Añade tu análisis técnico o respuesta..."></textarea>
          <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
            <button class="btn btn-primary" onclick="PostDetailView.submitComment('${postId}', null)">Publicar Respuesta</button>
          </div>
        </div>

        <div id="comments-tree-container">
          <!-- Skeletons de comentarios -->
          <div class="skeleton-card" style="margin-bottom: 8px;">
            <div class="skeleton skeleton-text" style="width: 30%;"></div>
            <div class="skeleton skeleton-text" style="width: 90%;"></div>
          </div>
        </div>
      </div>
    `;

    await this.loadPostAndComments(postId);
  },

  async loadPostAndComments(postId) {
    const postContainer = document.getElementById('post-detail-container');
    const commentsContainer = document.getElementById('comments-tree-container');

    try {
      this.currentPost = await window.api.getPost(postId);

      // Renderizar Detalle de Publicación (Success State)
      postContainer.innerHTML = `
        <div class="card card-elevated" id="post-${this.currentPost.id}">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 13px; color: var(--text-secondary);">
            <span class="chip" onclick="Router.navigate('/c/${this.currentPost.community_name || 'general'}')" style="cursor: pointer;">
              c/${this.currentPost.community_name || 'general'}
            </span>
            <span>•</span>
            <span>Publicado por u/${window.utils.escapeHTML(this.currentPost.author_username || 'autor')}</span>
            <span>•</span>
            <span>${window.utils.formatTime(this.currentPost.created_at)}</span>
          </div>

          <h1 style="margin-bottom: var(--space-md);">${window.utils.escapeHTML(this.currentPost.title)}</h1>

          <div class="post-markdown-body" style="color: var(--text-primary); font-size: 15px; line-height: 1.6; margin-bottom: var(--space-lg);">
            ${window.utils.renderMarkdown(this.currentPost.content)}
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border-subtle); padding-top: var(--space-md);">
            <!-- Linear Pill de Votación -->
            <div class="vote-pill" style="flex-direction: row; width: auto; gap: 8px; padding: 4px 12px;">
              <button class="vote-btn ${this.currentPost.user_vote === 1 ? 'voted-up' : ''}" onclick="PostDetailView.votePost('${this.currentPost.id}', 1)">▲</button>
              <span class="vote-score" id="detail-score-${this.currentPost.id}">
                ${this.currentPost.net_votes || this.currentPost.votes_count || 0}
              </span>
              <button class="vote-btn ${this.currentPost.user_vote === -1 ? 'voted-down' : ''}" onclick="PostDetailView.votePost('${this.currentPost.id}', -1)">▼</button>
            </div>

            <div style="display: flex; gap: 10px;">
              ${window.api.user && window.api.user.id === this.currentPost.author_id ? `
                <button class="btn btn-danger" style="padding: 4px 10px; font-size: 12px;" onclick="PostDetailView.deletePost('${this.currentPost.id}')">Eliminar</button>
              ` : ''}
              <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 12px;" onclick="FeedView.sharePost('${this.currentPost.id}')">Compartir</button>
            </div>
          </div>
        </div>
      `;

      // Cargar Árbol de Comentarios
      await this.loadComments(postId);

    } catch (err) {
      postContainer.innerHTML = `
        <div class="state-error">
          <h3>No se pudo cargar la publicación</h3>
          <p>${window.utils.escapeHTML(err.message || 'Error de red o publicación inexistente.')}</p>
          <button class="btn btn-secondary" onclick="PostDetailView.loadPostAndComments('${postId}')">Reintentar</button>
        </div>
      `;
    }
  },

  async loadComments(postId) {
    const commentsContainer = document.getElementById('comments-tree-container');
    try {
      this.comments = await window.api.getPostComments(postId);

      if (!this.comments || this.comments.length === 0) {
        commentsContainer.innerHTML = `
          <div class="state-empty" style="padding: var(--space-lg);">
            <p>No hay respuestas aún en este hilo. Sé el primero en participar.</p>
          </div>
        `;
        return;
      }

      // Renderizar Árbol jerárquico ltree
      // Cada nodo ltree tiene un "path" (ej: root.c1.c2) o "parent_id"
      commentsContainer.innerHTML = this.renderCommentTree(this.comments);

    } catch (err) {
      commentsContainer.innerHTML = `
        <div class="state-error">
          <p>Error al sincronizar el árbol de comentarios: ${window.utils.escapeHTML(err.message)}</p>
          <button class="btn btn-secondary" onclick="PostDetailView.loadComments('${postId}')">Reintentar</button>
        </div>
      `;
    }
  },

  renderCommentTree(comments) {
    return comments.map(c => {
      // Calcular profundidad para indentación
      const depth = c.path ? Math.max(0, c.path.split('.').length - 1) : (c.depth || 0);
      const isDeleted = c.is_deleted || c.content === '[comentario eliminado]';

      return `
        <div class="comment-node" style="margin-left: ${Math.min(depth * 16, 80)}px;" id="comment-${c.id}">
          <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; margin-bottom: 4px; color: var(--text-secondary);">
            <span style="font-weight: 600; color: var(--text-primary);">u/${window.utils.escapeHTML(c.author_username || 'usuario')}</span>
            <span>•</span>
            <span>${window.utils.formatTime(c.created_at)}</span>
            ${c.path ? `<span class="chip" style="font-size: 10px; padding: 1px 4px;">ltree: ${c.path}</span>` : ''}
          </div>

          <div style="font-size: 14px; color: ${isDeleted ? 'var(--text-muted)' : 'var(--text-primary)'}; margin-bottom: 8px; font-style: ${isDeleted ? 'italic' : 'normal'};">
            ${isDeleted ? '[comentario eliminado - preservando árbol de respuestas]' : window.utils.renderMarkdown(c.content)}
          </div>

          ${!isDeleted ? `
            <div style="display: flex; align-items: center; gap: 12px; font-size: 12px;">
              <!-- Linear Pill Voto Comentario -->
              <div style="display: flex; align-items: center; gap: 4px; background: var(--surface-0); padding: 2px 8px; border-radius: 9999px; border: 1px solid var(--border-subtle);">
                <button class="vote-btn" onclick="PostDetailView.voteComment('${c.id}', 1)">▲</button>
                <span class="vote-score" id="score-comment-${c.id}">${c.net_votes || 0}</span>
                <button class="vote-btn" onclick="PostDetailView.voteComment('${c.id}', -1)">▼</button>
              </div>

              <button class="btn btn-ghost" style="padding: 2px 6px; font-size: 12px;" onclick="PostDetailView.toggleReplyBox('${c.id}')">
                💬 Responder
              </button>

              ${window.api.user && window.api.user.id === c.author_id ? `
                <button class="btn btn-ghost" style="padding: 2px 6px; font-size: 12px; color: var(--error);" onclick="PostDetailView.deleteComment('${c.id}')">
                  Eliminar
                </button>
              ` : ''}
            </div>

            <!-- Caja de respuesta inline -->
            <div id="reply-box-${c.id}" style="display: none; margin-top: 8px; padding-left: 12px;">
              <textarea id="reply-input-${c.id}" class="form-textarea" rows="2" placeholder="Escribe tu respuesta a u/${c.author_username}..."></textarea>
              <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
                <button class="btn btn-ghost" onclick="PostDetailView.toggleReplyBox('${c.id}')">Cancelar</button>
                <button class="btn btn-primary" style="padding: 4px 10px;" onclick="PostDetailView.submitComment('${this.currentPost.id}', '${c.id}')">Enviar</button>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  },

  toggleReplyBox(commentId) {
    const box = document.getElementById(`reply-box-${commentId}`);
    if (box) {
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
    }
  },

  async submitComment(postId, parentId = null) {
    if (!window.api.user) {
      Router.navigate('/login');
      window.utils.showToast('Inicia sesión para participar en el debate', 'info');
      return;
    }

    const inputEl = parentId 
      ? document.getElementById(`reply-input-${parentId}`)
      : document.getElementById('root-comment-input');

    const content = inputEl.value.trim();
    if (!content) {
      window.utils.showToast('El comentario no puede estar vacío', 'error');
      return;
    }

    try {
      await window.api.createComment({
        post_id: postId,
        parent_id: parentId,
        content: content
      });

      inputEl.value = '';
      if (parentId) this.toggleReplyBox(parentId);
      window.utils.showToast('Comentario indexado en ltree exitosamente', 'info');
      await this.loadComments(postId);
    } catch (err) {
      window.utils.showToast(err.message || 'Error al publicar comentario', 'error');
    }
  },

  async votePost(postId, voteType) {
    if (!window.api.user) {
      Router.navigate('/login');
      return;
    }
    const scoreEl = document.getElementById(`detail-score-${postId}`);
    if (scoreEl) {
      let currentScore = parseInt(scoreEl.textContent) || 0;
      scoreEl.textContent = currentScore + voteType;
    }
    await window.api.votePost(postId, voteType);
  },

  async voteComment(commentId, voteType) {
    if (!window.api.user) {
      Router.navigate('/login');
      return;
    }
    const scoreEl = document.getElementById(`score-comment-${commentId}`);
    if (scoreEl) {
      let currentScore = parseInt(scoreEl.textContent) || 0;
      scoreEl.textContent = currentScore + voteType;
    }
    await window.api.voteComment(commentId, voteType);
  },

  async deletePost(postId) {
    if (!confirm('¿Estás seguro de eliminar esta publicación?')) return;
    try {
      await window.api.deletePost(postId);
      window.utils.showToast('Publicación eliminada', 'info');
      Router.navigate('/');
    } catch (err) {
      window.utils.showToast(err.message || 'Error al eliminar', 'error');
    }
  },

  async deleteComment(commentId) {
    if (!confirm('¿Eliminar tu comentario? Se preservará el árbol de respuestas como [comentario eliminado].')) return;
    try {
      await window.api.deleteComment(commentId);
      window.utils.showToast('Comentario eliminado preservando ltree', 'info');
      await this.loadComments(this.currentPost.id);
    } catch (err) {
      window.utils.showToast(err.message || 'Error al eliminar', 'error');
    }
  }
};

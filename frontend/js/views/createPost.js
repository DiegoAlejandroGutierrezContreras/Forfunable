/**
 * Vista: Crear Publicación y Previsualización (Pantalla Stitch 02-15)
 * Editor Markdown seguro y conexión a /api/v1/posts
 */

window.CreatePostView = {
  communities: [],

  async render(container) {
    if (!window.api.user) {
      container.innerHTML = `
        <div class="state-empty card">
          <h3>Autenticación Requerida</h3>
          <p>Inicia sesión para aportar tus publicaciones al ecosistema.</p>
          <button class="btn btn-primary" onclick="Router.navigate('/login')">Iniciar Sesión</button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="card" style="max-width: 800px; margin: 0 auto;">
        <h1 style="margin-bottom: var(--space-md);">✍️ Nueva Publicación Técnica</h1>

        <form id="create-post-form" onsubmit="CreatePostView.handleSubmit(event)">
          <div class="form-group">
            <label class="form-label">Elegir Comunidad de Destino</label>
            <select id="post-community-select" class="form-select" required>
              <option value="">Cargando comunidades...</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Título de la Discusión</label>
            <input type="text" id="post-title" class="form-input" required placeholder="Título claro, conciso y técnico..." maxlength="300">
          </div>

          <div class="form-group">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label class="form-label" style="margin: 0;">Contenido (Soporta Markdown con bloques de código)</label>
              <div style="display: flex; gap: 6px;">
                <button type="button" class="btn btn-secondary" style="padding: 2px 8px; font-size: 11px;" id="btn-tab-edit" onclick="CreatePostView.switchTab('edit')">Editor</button>
                <button type="button" class="btn btn-ghost" style="padding: 2px 8px; font-size: 11px;" id="btn-tab-preview" onclick="CreatePostView.switchTab('preview')">Previsualizar</button>
              </div>
            </div>

            <textarea id="post-content" class="form-textarea" rows="12" required placeholder="Describe tu propuesta, arquitectura o comparte código con triple acento grave (```)..."></textarea>
            
            <div id="post-preview" class="post-markdown-body" style="display: none; min-height: 200px; background: var(--surface-0); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px; color: var(--text-primary);"></div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: var(--space-lg);">
            <button type="button" class="btn btn-ghost" onclick="Router.navigate('/')">Descartar</button>
            <button type="submit" class="btn btn-primary" id="btn-submit-post">Publicar en la Red</button>
          </div>
        </form>
      </div>
    `;

    await this.loadCommunities();
  },

  async loadCommunities() {
    const select = document.getElementById('post-community-select');
    try {
      this.communities = await window.api.listCommunities();
      if (this.communities && this.communities.length > 0) {
        select.innerHTML = this.communities.map(c => `
          <option value="${c.id}">c/${c.name} — ${c.title || c.name}</option>
        `).join('');
      } else {
        select.innerHTML = '<option value="">No hay comunidades aún</option>';
      }
    } catch (_) {
      select.innerHTML = '<option value="">Error al cargar comunidades</option>';
    }
  },

  switchTab(tab) {
    const editBtn = document.getElementById('btn-tab-edit');
    const previewBtn = document.getElementById('btn-tab-preview');
    const textarea = document.getElementById('post-content');
    const preview = document.getElementById('post-preview');

    if (tab === 'preview') {
      previewBtn.className = 'btn btn-secondary';
      editBtn.className = 'btn btn-ghost';
      textarea.style.display = 'none';
      preview.style.display = 'block';
      preview.innerHTML = window.utils.renderMarkdown(textarea.value) || '<p style="color: var(--text-muted); font-style: italic;">Sin contenido para previsualizar.</p>';
    } else {
      editBtn.className = 'btn btn-secondary';
      previewBtn.className = 'btn btn-ghost';
      textarea.style.display = 'block';
      preview.style.display = 'none';
    }
  },

  async handleSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-post');
    btn.disabled = true;
    btn.textContent = 'Enviando a Cloud Run...';

    const payload = {
      community_id: document.getElementById('post-community-select').value,
      title: document.getElementById('post-title').value.trim(),
      content: document.getElementById('post-content').value.trim()
    };

    try {
      const res = await window.api.createPost(payload);
      window.utils.showToast('¡Publicación creada exitosamente!', 'info');
      Router.navigate(`/posts/${res.id}`);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Publicar en la Red';
      window.utils.showToast(err.message || 'Error al publicar', 'error');
    }
  }
};

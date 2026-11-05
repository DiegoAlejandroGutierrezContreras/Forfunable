/**
 * 02_16 Guardados y colecciones: publicaciones guardadas, organizadas en colecciones con nota.
 * Conectada a /api/v1/users/me/saved y /api/v1/users/me/collections.
 */

window.SavedView = {
  active: '',
  collections: [],
  items: [],

  async render(query = {}) {
    this.active = query.collection || '';
    $main().innerHTML = `
      ${UI.pageHeader('Guardados', 'Lo que quieres leer después, organizado en colecciones privadas.', `<button class="btn-secondary" ${UI.on('click', 'SavedView.collectionModal')}>${UI.icon('create_new_folder', 'text-[18px]')} Nueva colección</button>`, 'bookmarks')}
      <div class="grid gap-4 lg:grid-cols-[230px_1fr]">
        <nav id="saved-collections" class="card flex h-fit flex-col gap-0.5 p-2">${UI.skeletonPosts(1)}</nav>
        <div id="saved-list" class="flex flex-col gap-3">${UI.skeletonPosts(2)}</div>
      </div>`;
    await this.load();
  },

  async load() {
    try {
      const [cols, items] = await Promise.all([window.api.listCollections(), window.api.listSaved(this.active)]);
      this.collections = cols;
      this.items = items;
    } catch (err) {
      if (err.error === 'FEATURE_UNAVAILABLE') return this.unavailable();
      document.getElementById('saved-list').innerHTML = UI.error(err, () => SavedView.load());
      return;
    }
    this.paintCollections();
    this.paintItems();
  },

  unavailable() {
    document.getElementById('saved-collections').classList.add('hidden');
    document.getElementById('saved-list').innerHTML = UI.empty({ icon: 'construction', title: 'Función no disponible todavía', text: 'El servidor aún no tiene aplicada la migración V003. Vuelve a intentarlo más tarde.' });
  },

  paintCollections() {
    const total = this.collections.reduce((n, c) => n + (c.items_count || 0), 0);
    const link = (id, label, icon, count, extra = '') => `
      <a href="/saved${id ? '?collection=' + encodeURIComponent(id) : ''}" data-link class="nav-item justify-between ${this.active === id ? 'active' : ''}">
        <span class="flex min-w-0 items-center gap-3">${UI.icon(icon, 'text-[19px]')}<span class="truncate">${label}</span></span>
        <span class="flex items-center gap-1">${count != null ? `<span class="font-mono text-label-sm text-ink-muted">${count}</span>` : ''}${extra}</span>
      </a>`;
    document.getElementById('saved-collections').innerHTML = `
      ${link('', 'Todo lo guardado', 'bookmarks', null)}
      ${link('none', 'Sin colección', 'inbox', null)}
      <div class="mt-2 border-t border-line px-3 pb-1 pt-3 text-label-sm uppercase tracking-wider text-ink-muted">Colecciones · ${total}</div>
      ${this.collections.length ? this.collections.map(c => link(c.id, UI.esc(c.name), 'folder', c.items_count)).join('') : `<p class="px-3 py-2 text-body-sm text-ink-muted">Crea una colección para agrupar lecturas por tema.</p>`}`;
  },

  current() { return this.collections.find(c => c.id === this.active); },

  paintItems() {
    const box = document.getElementById('saved-list');
    const col = this.current();
    const head = col ? `
      <div class="card flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="flex items-center gap-2 text-headline-md">${UI.icon('folder', 'text-secondary')}${UI.esc(col.name)}</h2>
          ${col.description ? `<p class="mt-1 text-body-sm text-ink-secondary">${UI.esc(col.description)}</p>` : ''}
          <p class="mt-1 font-mono text-body-sm text-ink-muted">${col.items_count} elementos · creada ${window.utils.formatTime(col.created_at)}</p>
        </div>
        <div class="flex gap-1">
          <button class="btn-ghost btn-sm" ${UI.on('click', 'SavedView.collectionModal', col.id)}>${UI.icon('edit', 'text-[17px]')} Editar</button>
          <button class="btn-danger-ghost btn-sm" ${UI.on('click', 'SavedView.deleteCollection', col.id)}>${UI.icon('delete', 'text-[17px]')} Eliminar</button>
        </div>
      </div>` : '';
    if (!this.items.length) {
      box.innerHTML = head + UI.empty({
        icon: 'bookmark_border',
        title: col ? 'Esta colección está vacía' : this.active === 'none' ? 'Todo está organizado' : 'Aún no guardas nada',
        text: 'Usa el marcador en cualquier publicación para guardarla aquí.',
        action: `<a href="/" data-link class="btn-primary">Explorar el feed</a>`
      });
      return;
    }
    box.innerHTML = head + this.items.map(s => this.itemCard(s)).join('');
  },

  itemCard(s) {
    const p = s.post;
    const link = `/posts/${encodeURIComponent(p.id)}`;
    const options = `<option value="">Sin colección</option>` + this.collections.map(c => `<option value="${UI.esc(c.id)}" ${c.id === s.collection_id ? 'selected' : ''}>${UI.esc(c.name)}</option>`).join('');
    return `
      <article class="card" data-saved="${UI.esc(p.id)}">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-ink-secondary">
          ${UI.communityChip(p.community_name)}
          ${p.flair ? UI.flairChip(p.flair) : ''}
          <span class="text-ink-muted">·</span>${UI.userLink(p.author_username)}
          <span class="ml-auto flex items-center gap-1 text-ink-muted">${UI.icon('bookmark', 'icon-fill text-[15px] text-primary')} guardado ${window.utils.formatTime(s.saved_at)}</span>
        </div>
        <a href="${link}" data-link class="mt-2 block font-display text-headline-sm hover:text-secondary">${UI.esc(p.title)}</a>
        ${p.body_text ? `<p class="mt-1 line-clamp-2 text-body-sm text-ink-secondary">${UI.esc(UI.excerpt(p.body_text, 200))}</p>` : ''}
        ${s.note ? `<p class="mt-3 flex items-start gap-2 rounded border border-line bg-surface-base px-3 py-2 text-body-sm text-ink-secondary">${UI.icon('sticky_note_2', 'text-[16px] text-warning')}${UI.esc(s.note)}</p>` : ''}
        <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <label class="sr-only" for="mv-${UI.esc(p.id)}">Mover a colección</label>
          <select id="mv-${UI.esc(p.id)}" class="input w-auto py-1.5 text-body-sm" ${UI.on('change', 'SavedView.move', p.id, UI.VALUE)}>${options}</select>
          <button class="btn-ghost btn-sm" ${UI.on('click', 'SavedView.noteModal', p.id)}>${UI.icon('edit_note', 'text-[17px]')} ${s.note ? 'Editar nota' : 'Añadir nota'}</button>
          <span class="ml-auto font-mono text-body-sm text-ink-muted">${p.net_votes || 0} votos · ${p.comments_count || 0} comentarios</span>
          <button class="btn-danger-ghost btn-sm" ${UI.on('click', 'SavedView.remove', p.id)}>${UI.icon('bookmark_remove', 'text-[17px]')} Quitar</button>
        </div>
      </article>`;
  },

  find(postId) { return this.items.find(s => s.post.id === postId); },

  async move(postId, collectionId) {
    const s = this.find(postId);
    try {
      await window.api.savePost(postId, collectionId || null, s ? s.note : '');
      window.utils.showToast(collectionId ? 'Movido a la colección' : 'Quitado de la colección', 'info');
      this.load();
    } catch (err) { StatusView.toastError(err, 'No se pudo mover'); }
  },

  noteModal(postId) {
    const s = this.find(postId);
    UI.modal({
      title: 'Nota privada', icon: 'sticky_note_2', tone: 'warning',
      body: `<p class="mb-3">Solo tú la ves. Útil para recordar por qué lo guardaste.</p>
        <textarea id="saved-note" class="input" rows="3" maxlength="500" placeholder="Ej: revisar el benchmark de la sección 3">${UI.esc(UI.plain(s.note || ''))}</textarea>`,
      actions: `<button class="btn-ghost" ${UI.on('click', 'UI.closeModal')}>Cancelar</button><button class="btn-primary" ${UI.on('click', 'SavedView.saveNote', postId)}>Guardar nota</button>`
    });
    document.getElementById('saved-note').focus();
  },

  async saveNote(postId) {
    const s = this.find(postId);
    try {
      await window.api.savePost(postId, s.collection_id, document.getElementById('saved-note').value.trim());
      UI.closeModal();
      window.utils.showToast('Nota guardada', 'info');
      this.load();
    } catch (err) { StatusView.toastError(err, 'No se pudo guardar la nota'); }
  },

  async remove(postId) {
    try {
      await window.api.unsavePost(postId);
      window.utils.showToast('Quitado de guardados', 'info');
      this.load();
    } catch (err) { StatusView.toastError(err, 'No se pudo quitar'); }
  },

  // Al cambiar el marcador desde una tarjeta mientras se ve esta página
  onToggle() { if (window.location.pathname === '/saved') this.load(); },

  collectionModal(id = '') {
    const col = this.collections.find(c => c.id === id);
    UI.modal({
      title: col ? 'Editar colección' : 'Nueva colección', icon: 'create_new_folder', tone: 'secondary',
      body: `${UI.field('col-name', 'Nombre', { value: col ? UI.plain(col.name) : '', placeholder: 'Ej: Lecturas de Go', attrs: 'maxlength="60"' })}
        ${UI.field('col-desc', 'Descripción (opcional)', { value: col ? UI.plain(col.description) : '', textarea: true, rows: 2 })}`,
      actions: `<button class="btn-ghost" ${UI.on('click', 'UI.closeModal')}>Cancelar</button><button class="btn-primary" id="col-save" ${UI.on('click', 'SavedView.saveCollection', id)}>${col ? 'Guardar' : 'Crear colección'}</button>`
    });
    document.getElementById('col-name').focus();
  },

  async saveCollection(id) {
    const name = document.getElementById('col-name').value.trim();
    if (!UI.setHint('col-name', name ? '' : 'Ponle un nombre a la colección.')) return;
    const desc = document.getElementById('col-desc').value.trim();
    try {
      const res = id ? await window.api.updateCollection(id, name, desc) : await window.api.createCollection(name, desc);
      const pending = this._pendingPost;
      this._pendingPost = null;
      UI.closeModal();
      window.utils.showToast(id ? 'Colección actualizada' : 'Colección creada', 'info');
      if (pending && res && res.id) {
        await window.api.savePost(pending, res.id);
        UI.saveButtonsRefresh(pending);
        return window.utils.showToast(`Guardado en «${name}»`, 'info');
      }
      if (!id && res && res.id && window.location.pathname === '/saved') return Router.navigate(`/saved?collection=${res.id}`);
      this.load();
    } catch (err) {
      if (err.status === 409) return UI.setHint('col-name', err.message);
      StatusView.toastError(err, 'No se pudo guardar la colección');
    }
  },

  async deleteCollection(id) {
    const col = this.collections.find(c => c.id === id);
    const ok = await UI.confirm({ title: `¿Eliminar «${UI.plain(col.name)}»?`, text: 'Las publicaciones no se pierden: seguirán en guardados, sin colección.', confirmText: 'Eliminar colección', danger: true, icon: 'folder_delete' });
    if (!ok) return;
    try {
      await window.api.deleteCollection(id);
      window.utils.showToast('Colección eliminada', 'info');
      Router.navigate('/saved');
    } catch (err) { StatusView.toastError(err, 'No se pudo eliminar'); }
  },

  // Desde el detalle: elegir colección al guardar
  async saveToModal(postId) {
    let cols = [];
    try { cols = await window.api.listCollections(); } catch (err) { return StatusView.toastError(err, 'No se pudieron cargar tus colecciones'); }
    this.collections = cols;
    UI.modal({
      title: 'Guardar en colección', icon: 'bookmark_add', tone: 'primary',
      body: `<div class="flex flex-col gap-1.5">
          <button class="nav-item w-full" ${UI.on('click', 'SavedView.saveTo', postId, '')}>${UI.icon('inbox', 'text-[19px]')}Sin colección</button>
          ${cols.map(c => `<button class="nav-item w-full justify-between" ${UI.on('click', 'SavedView.saveTo', postId, c.id)}><span class="flex items-center gap-3">${UI.icon('folder', 'text-[19px]')}${UI.esc(c.name)}</span><span class="font-mono text-label-sm text-ink-muted">${c.items_count}</span></button>`).join('')}
        </div>`,
      actions: `<button class="btn-secondary" ${UI.on('click', 'SavedView.newCollectionFor', postId)}>${UI.icon('add', 'text-[18px]')} Nueva colección</button>`
    });
  },

  newCollectionFor(postId) {
    this._pendingPost = postId;
    this.collectionModal();
  },

  async saveTo(postId, collectionId) {
    try {
      await window.api.savePost(postId, collectionId || null);
      UI.closeModal();
      UI.saveButtonsRefresh(postId);
      const col = this.collections.find(c => c.id === collectionId);
      window.utils.showToast(col ? `Guardado en «${UI.plain(col.name)}»` : 'Guardado', 'info');
    } catch (err) { StatusView.toastError(err, 'No se pudo guardar'); }
  }
};

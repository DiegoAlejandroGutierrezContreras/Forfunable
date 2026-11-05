/**
 * 02_15 Crear publicación y vista previa, 02_16 multimedia (enlace con validación y límites),
 * 06_87 descartar borrador y 02_18 editar publicación.
 * Conectada a POST /api/v1/posts y PATCH /api/v1/posts/:id.
 */

window.CreatePostView = {
  DRAFT_KEY: 'forfunable_post_draft',
  type: 'TEXT',
  mode: 'editor',
  editing: null,

  types: [
    { id: 'TEXT', label: 'Texto', icon: 'notes' },
    { id: 'IMAGE', label: 'Imagen', icon: 'image' },
    { id: 'VIDEO', label: 'Video', icon: 'smart_display' },
    { id: 'LINK', label: 'Enlace', icon: 'link' }
  ],

  // Reglas de multimedia (02_16): enlaces http(s) y formatos admitidos por tipo
  media: {
    IMAGE: { exts: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'], help: 'JPG, PNG, GIF, WEBP o AVIF. Pega el enlace directo a la imagen.' },
    VIDEO: { exts: ['mp4', 'webm', 'ogg', 'mov'], help: 'MP4, WEBM u OGG. Pega el enlace directo al archivo de video.' },
    LINK: { exts: null, help: 'Cualquier página web http(s).' }
  },

  loadDraft() {
    try { return JSON.parse(localStorage.getItem(this.DRAFT_KEY) || 'null'); } catch (_) { return null; }
  },

  saveDraft() {
    if (this.editing) return;
    const d = this.read();
    const has = d.title || d.body || d.media;
    try {
      if (has) localStorage.setItem(this.DRAFT_KEY, JSON.stringify({ ...d, savedAt: Date.now() }));
      else localStorage.removeItem(this.DRAFT_KEY);
    } catch (_) {}
    const el = document.getElementById('draft-status');
    if (el) el.innerHTML = has ? `${UI.icon('circle', 'icon-fill text-[9px] text-primary')} Borrador guardado en este navegador` : '';
  },

  clearDraft() {
    try { localStorage.removeItem(this.DRAFT_KEY); } catch (_) {}
  },

  read() {
    const v = id => (document.getElementById(id)?.value || '').trim();
    return { community: v('post-community'), type: this.type, title: v('post-title'), body: v('post-body'), media: v('post-media') };
  },

  async render(query = {}) {
    this.editing = null;
    const draft = this.loadDraft();
    const initial = {
      community: query.community || draft?.community || '',
      type: query.type || draft?.type || 'TEXT',
      title: query.title || draft?.title || '',
      body: query.code ? '```js\n\n```' : (draft?.body || ''),
      media: draft?.media || ''
    };
    this.type = initial.type;
    this.mode = 'editor';
    this.shell('Crear publicación', initial);

    let comms = [];
    try { comms = await window.api.listCommunities(); } catch (_) {}
    const select = document.getElementById('post-community');
    select.innerHTML = comms.length
      ? `<option value="">Elige una comunidad…</option>` + comms.map(c => `<option value="${UI.esc(c.id)}" ${c.id === initial.community ? 'selected' : ''}>c/${UI.esc(c.name)}</option>`).join('')
      : `<option value="">No hay comunidades todavía</option>`;
    this.comms = comms;
    this.updateDestination();
    if (draft && !query.title && (draft.title || draft.body)) window.utils.showToast('Recuperamos tu borrador anterior', 'info');
    Router.leaveGuard = () => this.confirmLeave();
  },

  // 02_18 Editar publicación (el backend permite cambiar el contenido, no el título ni el destino)
  async edit(postId) {
    const post = await window.api.getPost(postId);
    if (!window.api.user || post.author_id !== window.api.user.id) return StatusView.page('403');
    this.editing = post;
    this.type = post.content_type || 'TEXT';
    this.mode = 'editor';
    this.shell('Editar publicación', { title: UI.plain(post.title), body: UI.plain(post.body_text), media: post.media_url, type: this.type });
    const select = document.getElementById('post-community');
    select.innerHTML = `<option>c/${UI.esc(post.community_name || '')}</option>`;
    select.disabled = true;
    document.getElementById('post-title').readOnly = true;
    document.getElementById('post-media').readOnly = true;
    document.querySelectorAll('[data-post-type]').forEach(b => { b.disabled = true; });
    document.getElementById('dest-name').textContent = `c/${UI.plain(post.community_name || '')}`;
    this.original = UI.plain(post.body_text);
    Router.leaveGuard = () => this.confirmLeave();
  },

  shell(title, initial) {
    const editing = !!this.editing;
    $main().innerHTML = `
      <div class="mx-auto max-w-[880px]">
        <div class="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div class="flex items-center gap-3">
            <button class="btn-icon" ${UI.on('click', 'UI.back', '/')} aria-label="Volver">${UI.icon('arrow_back')}</button>
            <h1 class="text-headline-lg">${title}</h1>
          </div>
          <span id="draft-status" class="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-body-sm text-ink-secondary empty:hidden"></span>
        </div>

        <div class="card mb-4 flex flex-wrap items-center gap-4">
          <span class="flex h-12 w-12 items-center justify-center rounded border border-line bg-surface-elevated text-secondary">${UI.icon('terminal')}</span>
          <div class="min-w-0 flex-1">
            <div id="dest-name" class="font-display text-headline-sm">Elige el destino</div>
            <div id="dest-desc" class="truncate text-body-sm text-ink-secondary">La publicación aparecerá en esa comunidad y en el feed.</div>
          </div>
          <select id="post-community" class="input w-auto min-w-[200px]" ${UI.on('change', 'CreatePostView.onCommunityChange')}><option>Cargando…</option></select>
          <div id="flair-picker" class="hidden w-full border-t border-line pt-3">
            <div class="mb-2 flex items-center gap-2 text-label-sm uppercase tracking-wider text-ink-muted">${UI.icon('sell', 'text-[15px]')} Flair (opcional)</div>
            <div id="flair-options" class="flex flex-wrap gap-2"></div>
          </div>
        </div>

        <div class="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface-card p-1.5 sm:grid-cols-4">
          ${this.types.map(t => `<button type="button" data-post-type="${t.id}" class="tab justify-center ${t.id === this.type ? 'active' : ''}" ${UI.on('click', 'CreatePostView.setType', t.id)}>${UI.icon(t.icon, 'text-[18px]')}${t.label}</button>`).join('')}
        </div>

        <div class="card p-5 sm:p-6">
          <div class="mb-1.5 flex items-center justify-between">
            <label class="label mb-0" for="post-title">Título de la publicación <span class="text-primary">*</span></label>
            <span id="title-count" class="font-mono text-body-sm text-ink-muted">0 / 300</span>
          </div>
          <input id="post-title" class="input font-display text-headline-sm" maxlength="300" placeholder="Un título claro y específico" value="${UI.esc(initial.title)}" ${UI.on('input', 'CreatePostView.onInput', 'post-title')}>
          <div class="field-hint" id="post-title-hint"></div>

          <div id="media-block" class="mt-5 hidden">
            <label class="label" for="post-media" id="media-label">Enlace</label>
            <input id="post-media" class="input" placeholder="https://..." value="${UI.esc(initial.media)}" ${UI.on('input', 'CreatePostView.onInput', 'post-media')}>
            <div class="field-hint" id="post-media-hint"></div>
            <p class="help" id="media-help"></p>
            <div id="media-preview" class="mt-3"></div>
          </div>

          <div class="mt-5 overflow-hidden rounded border border-line bg-surface-base">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line px-2 py-1.5">
              <div class="flex items-center gap-0.5" id="md-toolbar">
                ${[['format_bold', '**', '**', 'Negrita'], ['format_italic', '*', '*', 'Cursiva'], ['link', '[', '](https://)', 'Enlace'], ['code', '`', '`', 'Código'], ['code_blocks', '\n```\n', '\n```\n', 'Bloque de código'], ['format_list_bulleted', '\n- ', '', 'Lista'], ['format_quote', '\n> ', '', 'Cita']]
                  .map(([i, a, b, t]) => `<button type="button" class="btn-icon p-1.5" title="${t}" ${UI.on('click', 'CreatePostView.wrap', a, b)}>${UI.icon(i, 'text-[19px]')}</button>`).join('')}
              </div>
              <div class="flex rounded bg-surface-card p-0.5">
                <button type="button" id="mode-editor" class="tab active py-1" ${UI.on('click', 'CreatePostView.setMode', 'editor')}>${UI.icon('edit', 'text-[16px]')} Editor</button>
                <button type="button" id="mode-preview" class="tab py-1" ${UI.on('click', 'CreatePostView.setMode', 'preview')}>${UI.icon('visibility', 'text-[16px]')} Vista previa</button>
              </div>
            </div>
            <textarea id="post-body" class="block min-h-[260px] w-full resize-y bg-transparent p-4 font-mono text-body-md text-ink outline-none placeholder:text-ink-muted" placeholder="Describe el contexto, el problema y lo que propones. Admite Markdown: **negrita**, \`código\`, bloques con \`\`\` y citas con >." ${UI.on('input', 'CreatePostView.onInput', 'post-body')}>${UI.esc(initial.body)}</textarea>
            <div id="post-preview" class="hidden min-h-[260px] p-4"></div>
          </div>
          <div class="field-hint" id="post-body-hint"></div>

          <div class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <p class="flex items-center gap-1.5 text-body-sm text-ink-muted">${UI.icon('gavel', 'text-[16px]')} Respeta las normas de la comunidad de destino.</p>
            <div class="flex gap-2">
              ${editing ? `<button class="btn-danger-ghost" ${UI.on('click', 'PostDetailView.deletePost', this.editing.id)}>${UI.icon('delete', 'text-[18px]')} Eliminar</button>` : ''}
              <button class="btn-ghost" ${UI.on('click', 'CreatePostView.cancel')}>${editing ? 'Cancelar' : 'Descartar'}</button>
              <button class="btn-primary px-5" id="btn-publish" ${UI.on('click', 'CreatePostView.submit')}>${UI.icon(editing ? 'save' : 'send', 'text-[18px]')} ${editing ? 'Guardar cambios' : 'Publicar'}</button>
            </div>
          </div>
        </div>
      </div>`;
    this.setType(this.type, true);
    this.onInput('post-title', true);
    if (initial.media) this.onInput('post-media', true);
  },

  onCommunityChange() { this.updateDestination(); this.saveDraft(); },

  updateDestination() {
    const id = document.getElementById('post-community').value;
    const c = (this.comms || []).find(x => x.id === id);
    document.getElementById('dest-name').textContent = c ? `c/${UI.plain(c.name)}` : 'Elige el destino';
    document.getElementById('dest-desc').textContent = c ? UI.plain(c.description || 'Comunidad de Forfunable') : 'La publicación aparecerá en esa comunidad y en el feed.';
    this.loadFlairs(c);
  },

  // 02_19 Flairs de la comunidad de destino (los "solo moderación" solo los ve la moderación)
  async loadFlairs(c) {
    const box = document.getElementById('flair-picker');
    if (!box || this.editing) return;
    this.flairId = '';
    if (!c) { box.classList.add('hidden'); return; }
    let flairs = [];
    try {
      const data = await window.api.listFlairs(c.name);
      flairs = (data.items || []).filter(f => !f.mod_only || data.can_manage);
    } catch (_) {}
    box.classList.toggle('hidden', !flairs.length);
    this.flairs = flairs;
    this.paintFlairs();
  },

  paintFlairs() {
    const opts = document.getElementById('flair-options');
    if (!opts) return;
    opts.innerHTML = `<button type="button" class="chip-neutral cursor-pointer py-1 ${!this.flairId ? 'ring-1 ring-primary' : ''}" ${UI.on('click', 'CreatePostView.pickFlair', '')}>Sin flair</button>` +
      (this.flairs || []).map(f => `<button type="button" class="cursor-pointer rounded-chip ${this.flairId === f.id ? 'ring-1 ring-primary' : 'opacity-75 hover:opacity-100'}" aria-pressed="${this.flairId === f.id}" ${UI.on('click', 'CreatePostView.pickFlair', f.id)}>${UI.flairChip(f)}</button>`).join('');
  },

  pickFlair(id) { this.flairId = id; this.paintFlairs(); },

  setType(type, silent = false) {
    this.type = type;
    document.querySelectorAll('[data-post-type]').forEach(b => b.classList.toggle('active', b.dataset.postType === type));
    const block = document.getElementById('media-block');
    block.classList.toggle('hidden', type === 'TEXT');
    if (type !== 'TEXT') {
      document.getElementById('media-label').textContent = { IMAGE: 'Enlace a la imagen', VIDEO: 'Enlace al video', LINK: 'Enlace (URL)' }[type];
      document.getElementById('media-help').textContent = this.media[type].help;
      if (!silent) this.onInput('post-media');
    }
    if (!silent) this.saveDraft();
  },

  setMode(mode) {
    this.mode = mode;
    document.getElementById('mode-editor').classList.toggle('active', mode === 'editor');
    document.getElementById('mode-preview').classList.toggle('active', mode === 'preview');
    document.getElementById('post-body').classList.toggle('hidden', mode === 'preview');
    const prev = document.getElementById('post-preview');
    prev.classList.toggle('hidden', mode === 'editor');
    document.getElementById('md-toolbar').classList.toggle('invisible', mode === 'preview');
    if (mode === 'preview') {
      // 02_15 Previsualización: así se verá la publicación
      const d = this.read();
      prev.innerHTML = `
        <div class="text-body-sm text-ink-muted">${UI.icon('visibility', 'text-[15px] align-middle')} Vista previa</div>
        <h2 class="mt-2 text-headline-md">${UI.esc(d.title) || '<span class="text-ink-muted">Sin título</span>'}</h2>
        ${UI.mediaBlock({ media_url: this.mediaError(d.media) ? '' : d.media, content_type: this.type })}
        <div class="prose-post mt-3">${d.body ? window.utils.renderMarkdown(d.body) : '<p class="text-ink-muted">Sin contenido.</p>'}</div>`;
    }
  },

  wrap(before, after) {
    const ta = document.getElementById('post-body');
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e) || '';
    ta.value = value.slice(0, s) + before + sel + after + value.slice(e);
    ta.focus();
    ta.selectionStart = s + before.length;
    ta.selectionEnd = s + before.length + sel.length;
    this.onInput('post-body');
  },

  mediaError(url) {
    if (this.type === 'TEXT') return '';
    if (!url) return this.type === 'LINK' ? 'Pega el enlace que quieres compartir.' : 'Pega el enlace al archivo.';
    let u;
    try { u = new URL(url); } catch (_) { return 'No es un enlace válido. Debe empezar por https://'; }
    if (!['http:', 'https:'].includes(u.protocol)) return 'El enlace debe empezar por http:// o https://';
    if (url.length > 2000) return 'El enlace es demasiado largo (máximo 2000 caracteres).';
    const exts = this.media[this.type].exts;
    const ext = (u.pathname.split('.').pop() || '').toLowerCase();
    if (exts && !exts.includes(ext)) return `Formato no admitido para ${this.type === 'IMAGE' ? 'imágenes' : 'videos'}. Usa: ${exts.join(', ')}.`;
    return '';
  },

  validate(id, touched) {
    const el = document.getElementById(id);
    if (touched) el.dataset.touched = '1';
    if (el.dataset.touched !== '1') return true;
    const v = el.value.trim();
    let msg = '';
    if (id === 'post-title') msg = !v ? 'Escribe un título.' : v.length < 3 ? `Te faltan ${3 - v.length} caracteres: mínimo 3.` : '';
    if (id === 'post-media') msg = this.mediaError(v);
    if (id === 'post-body' && this.type === 'TEXT' && !v) msg = 'Escribe el contenido o elige otro tipo de publicación.';
    return UI.setHint(id, msg);
  },

  onInput(id, init = false) {
    if (id === 'post-title') {
      document.getElementById('title-count').textContent = `${document.getElementById('post-title').value.length} / 300`;
    }
    if (id === 'post-media') {
      const url = document.getElementById('post-media').value.trim();
      document.getElementById('media-preview').innerHTML = url && !this.mediaError(url) ? UI.mediaBlock({ media_url: url, content_type: this.type }) : '';
    }
    if (!init) {
      this.validate(id, true);
      clearTimeout(this._t);
      this._t = setTimeout(() => this.saveDraft(), 400);
    }
  },

  dirty() {
    if (this.editing) return document.getElementById('post-body') && document.getElementById('post-body').value.trim() !== (this.original || '').trim();
    const d = this.read();
    return !!(d.title || d.body || d.media);
  },

  // 06_87 Descartar borrador y confirmación de abandono
  async confirmLeave() {
    if (!document.getElementById('post-body') || !this.dirty()) { Router.leaveGuard = null; return true; }
    const ok = await UI.confirm({
      title: this.editing ? '¿Descartar los cambios?' : '¿Descartar el borrador?',
      text: this.editing ? 'Los cambios que hiciste en la publicación se perderán.' : 'Se borrará el título, el contenido y los enlaces que escribiste. Esta acción no se puede deshacer.',
      confirmText: 'Descartar', cancelText: 'Seguir editando', danger: true, icon: 'delete_sweep'
    });
    if (ok) { if (!this.editing) this.clearDraft(); Router.leaveGuard = null; }
    return ok;
  },

  async cancel() {
    if (await this.confirmLeave()) Router.navigate(this.editing ? `/posts/${this.editing.id}` : '/');
  },

  async submit() {
    const d = this.read();
    if (this.editing) {
      const btn = document.getElementById('btn-publish');
      btn.disabled = true;
      try {
        await window.api.updatePost(this.editing.id, { body_text: d.body });
        Router.leaveGuard = null;
        window.utils.showToast('Publicación actualizada', 'info');
        Router.navigate(`/posts/${this.editing.id}`);
      } catch (err) {
        btn.disabled = false;
        StatusView.toastError(err, 'No se pudo guardar');
      }
      return;
    }

    if (!d.community) {
      window.utils.showToast('Elige la comunidad de destino', 'warning');
      document.getElementById('post-community').focus();
      return;
    }
    const valid = ['post-title', 'post-media', 'post-body'].map(id => this.validate(id, true)).every(Boolean);
    if (!valid) return;

    const btn = document.getElementById('btn-publish');
    btn.disabled = true;
    try {
      const post = await window.api.createPost({
        community_id: d.community,
        title: d.title,
        content_type: this.type,
        body_text: d.body,
        media_url: this.type === 'TEXT' ? '' : d.media,
        flair_id: this.flairId || ''
      });
      this.clearDraft();
      Router.leaveGuard = null;
      window.utils.showToast('¡Publicación creada!', 'info');
      Router.navigate(`/posts/${post.id}`);
    } catch (err) {
      btn.disabled = false;
      StatusView.toastError(err, 'No se pudo publicar');
    }
  }
};

window.addEventListener('beforeunload', e => {
  if (CreatePostView.editing && CreatePostView.dirty()) { e.preventDefault(); e.returnValue = ''; }
});

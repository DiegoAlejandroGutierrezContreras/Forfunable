/**
 * 02_17 Detalle de publicación y discusión (con respuesta y cita), 02_18 eliminar publicación,
 * 03_21 editar comentario y modal de eliminación.
 * Conectada a /api/v1/posts/:id, /api/v1/posts/:id/comments y /api/v1/comments.
 */

window.PostDetailView = {
  post: null,
  comments: [],
  sort: 'best',
  collapsed: new Set(),

  async render(postId) {
    $main().innerHTML = UI.skeletonPosts(1);
    let post;
    try {
      post = await window.api.getPost(postId);
    } catch (err) {
      if (err.status === 404) return StatusView.page('404', { what: 'post' });
      if (err.error === 'PRIVATE_COMMUNITY') return CommunityView.privateGate(err.message, (err.message.match(/c\/([\w-]+)/) || [])[1]);
      throw err;
    }
    this.post = post;
    this.collapsed = new Set();
    const me = window.api.user;
    const isAuthor = me && me.id === post.author_id;
    const isMod = me && ['COMMUNITY_MOD', 'GLOBAL_ADMIN'].includes(me.global_role);
    const link = `/posts/${post.id}`;

    $main().innerHTML = `
      <nav class="mb-3 flex items-center gap-1.5 text-body-sm text-ink-muted">
        <a href="/" data-link class="hover:text-ink">Feed</a>${UI.icon('chevron_right', 'text-[16px]')}
        ${post.community_name ? `<a href="/c/${encodeURIComponent(post.community_name)}" data-link class="text-secondary hover:underline">c/${UI.esc(post.community_name)}</a>${UI.icon('chevron_right', 'text-[16px]')}` : ''}
        <span>Publicación</span>
      </nav>

      <article class="card p-5 sm:p-6">
        <header class="flex items-start gap-3">
          ${UI.avatar({ username: post.author_username }, 40)}
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
              ${UI.communityChip(post.community_name)}
              <span class="text-ink-muted">Publicado por</span>
            </div>
            <div class="mt-0.5 flex flex-wrap items-center gap-2 text-body-sm">
              ${UI.userLink(post.author_username)}
              <span class="text-ink-muted">· ${window.utils.formatTime(post.created_at)}</span>
              <a id="post-edited" href="${link}/history" data-link class="hidden text-ink-muted underline decoration-dotted hover:text-secondary"></a>
            </div>
          </div>
          <div class="relative">
            <button class="btn-icon" onclick="PostDetailView.toggleMenu('post-menu')" aria-label="Más acciones">${UI.icon('more_horiz')}</button>
            <div id="post-menu" class="panel absolute right-0 top-full z-20 mt-1 hidden w-56 p-1.5">
              ${isAuthor ? `
                <a href="${link}/edit" data-link class="nav-item">${UI.icon('edit', 'text-[19px]')}Editar publicación</a>
                <button class="nav-item w-full" onclick="PostDetailView.flairModal()">${UI.icon('sell', 'text-[19px]')}Cambiar flair</button>
                <button class="nav-item w-full text-danger hover:text-danger" onclick="PostDetailView.deletePost(${UI.arg(post.id)})">${UI.icon('delete', 'text-[19px]')}Eliminar</button>` : ''}
              ${me && !isAuthor ? `<button class="nav-item w-full" onclick="ModerationView.reportModal(${UI.arg(post.id)}, 'POST')">${UI.icon('flag', 'text-[19px]')}Reportar</button>` : ''}
              ${isMod && !isAuthor ? `<button class="nav-item w-full text-danger hover:text-danger" onclick="ModerationView.forceRemove(${UI.arg(post.id)}, 'POST')">${UI.icon('gavel', 'text-[19px]')}Retirar por moderación</button>` : ''}
              ${isMod && !isAuthor ? `<button class="nav-item w-full" onclick="PostDetailView.flairModal()">${UI.icon('sell', 'text-[19px]')}Cambiar flair</button>` : ''}
              <a href="${link}/history" data-link class="nav-item">${UI.icon('history', 'text-[19px]')}Historial de versiones</a>
              ${me ? `<button class="nav-item w-full" onclick="SavedView.saveToModal(${UI.arg(post.id)})">${UI.icon('bookmark_add', 'text-[19px]')}Guardar en colección…</button>` : ''}
              <button class="nav-item w-full" onclick="UI.share(${UI.arg(link)})">${UI.icon('link', 'text-[19px]')}Copiar enlace</button>
            </div>
          </div>
        </header>

        ${post.flair ? `<div class="mt-5">${UI.flairChip(post.flair)}</div>` : ''}
        <h1 class="${post.flair ? 'mt-2' : 'mt-5'} text-headline-lg text-balance">${UI.esc(post.title)}</h1>
        ${UI.mediaBlock(post)}
        ${post.body_text ? `<div class="prose-post mt-4 text-body-lg">${window.utils.renderMarkdown(post.body_text)}</div>` : ''}

        <div id="post-notes" class="mt-5 empty:hidden"></div>

        <footer class="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          ${UI.vote('post', post.id, post.net_votes, post.user_vote)}
          <a href="#comments" class="btn-ghost btn-sm" onclick="event.preventDefault(); document.getElementById('comments').scrollIntoView({ behavior: 'smooth' })">${UI.icon('chat_bubble_outline', 'text-[18px]')} <span id="comments-count">${post.comments_count || 0}</span> comentarios</a>
          <button class="btn-ghost btn-sm" onclick="UI.share(${UI.arg(link)})">${UI.icon('share', 'text-[18px]')} Compartir</button>
          ${me ? UI.saveButton(post.id, true) : ''}
          ${me ? `<button class="btn-ghost btn-sm" onclick="ModerationView.proposeNote(${UI.arg(post.id)})">${UI.icon('fact_check', 'text-[18px]')} Proponer nota</button>` : ''}
        </footer>
      </article>

      ${me ? `
        <section class="card mt-4">
          <div class="mb-3 flex items-center justify-between text-body-sm text-ink-secondary">
            <span class="flex items-center gap-2"><span class="h-2 w-2 rounded-full bg-primary"></span>Comentar como ${UI.userLink(me.username)}</span>
            <span id="new-comment-count" class="font-mono text-ink-muted">0 / 5000</span>
          </div>
          ${this.composer('new-comment', 'Aporta contexto, datos o una pregunta concreta…')}
          <div class="mt-3 flex items-center justify-between gap-3">
            <span class="text-body-sm text-ink-muted">Ctrl + Enter para enviar</span>
            <button class="btn-primary" id="btn-new-comment" onclick="PostDetailView.submitComment(null)">Publicar comentario</button>
          </div>
        </section>` : `
        <div class="card mt-4 flex flex-wrap items-center justify-between gap-3">
          <span class="text-body-md text-ink-secondary">Inicia sesión para comentar y votar.</span>
          <div class="flex gap-2"><a href="/login" data-link class="btn-secondary btn-sm">Ingresar</a><a href="/register" data-link class="btn-primary btn-sm">Crear cuenta</a></div>
        </div>`}

      <section id="comments" class="mt-6 scroll-mt-20">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 class="flex items-center gap-2 text-headline-md">Discusión <span id="comments-chip" class="chip-neutral font-mono"></span></h2>
          <div id="comment-sort"></div>
        </div>
        <div id="comments-list" class="flex flex-col gap-3">${UI.skeletonPosts(2)}</div>
      </section>`;

    this.paintSort();
    this.bindComposer('new-comment');
    this.loadComments();
    if (window.ModerationView && ModerationView.notesBlock) ModerationView.notesBlock(post);
    this.renderCommunityRail(post.community_name);
    this.loadEdited(post.id);
  },

  // 03_22 Indicador "editado": enlaza al historial si hay versiones anteriores
  async loadEdited(postId) {
    try {
      const h = await window.api.listRevisions(postId);
      const el = document.getElementById('post-edited');
      if (el && h.edits > 0) {
        el.textContent = `· editado ${h.edits === 1 ? '1 vez' : h.edits + ' veces'}`;
        el.classList.remove('hidden');
      }
    } catch (_) {}
  },

  // 02_19 Asignar o quitar el flair de la publicación (autor o moderación)
  async flairModal() {
    const post = this.post;
    let data;
    try { data = await window.api.listFlairs(post.community_name); } catch (err) { return StatusView.toastError(err, 'No se pudieron cargar los flairs'); }
    const flairs = (data.items || []).filter(f => !f.mod_only || data.can_manage);
    if (!flairs.length) return window.utils.showToast(`c/${post.community_name} aún no tiene flairs`, 'info');
    const current = post.flair && post.flair.id;
    UI.modal({
      title: 'Flair de la publicación', icon: 'sell', tone: 'secondary',
      body: `<p class="mb-3">Ayuda a filtrar el contenido de c/${UI.esc(post.community_name)}.</p>
        <div class="flex flex-wrap gap-2">
          <button class="chip-neutral cursor-pointer py-1 ${!current ? 'ring-1 ring-primary' : ''}" onclick="PostDetailView.setFlair('')">Sin flair</button>
          ${flairs.map(f => `<button class="cursor-pointer rounded-chip ${f.id === current ? 'ring-1 ring-primary' : ''}" onclick="PostDetailView.setFlair(${UI.arg(f.id)})">${UI.flairChip(f)}</button>`).join('')}
        </div>`
    });
  },

  async setFlair(flairId) {
    try {
      await window.api.setPostFlair(this.post.id, flairId);
      UI.closeModal();
      window.utils.showToast(flairId ? 'Flair asignado' : 'Flair retirado', 'info');
      this.render(this.post.id);
    } catch (err) {
      StatusView.toastError(err, 'No se pudo cambiar el flair');
    }
  },

  toggleMenu(id) {
    const el = document.getElementById(id);
    el.classList.toggle('hidden');
    if (!el.classList.contains('hidden')) {
      const close = e => { if (!el.contains(e.target) && !e.target.closest(`[onclick*="${id}"]`)) { el.classList.add('hidden'); document.removeEventListener('click', close); } };
      setTimeout(() => document.addEventListener('click', close), 0);
    }
  },

  // Columna derecha: comunidad, normas y moderadores
  async renderCommunityRail(name) {
    if (!name) return;
    try {
      const c = await window.api.getCommunity(name);
      Router.setRail(CommunityView.aboutCard(c) + CommunityView.rulesCard(c, 3) + CommunityView.modsCard(c));
    } catch (_) {}
  },

  composer(id, placeholder, value = '') {
    const tools = [['format_bold', '**', '**'], ['format_italic', '*', '*'], ['code', '`', '`'], ['code_blocks', '\n```\n', '\n```\n'], ['format_quote', '\n> ', ''], ['link', '[', '](https://)']];
    return `
      <div class="overflow-hidden rounded border border-line bg-surface-base focus-within:border-primary">
        <div class="flex gap-0.5 border-b border-line px-1.5 py-1">
          ${tools.map(([i, a, b]) => `<button type="button" class="btn-icon p-1" onclick="PostDetailView.wrap('${id}', ${UI.arg(a)}, ${UI.arg(b)})">${UI.icon(i, 'text-[17px]')}</button>`).join('')}
        </div>
        <textarea id="${id}" rows="4" maxlength="5000" class="block w-full resize-y bg-transparent p-3 text-body-md text-ink outline-none placeholder:text-ink-muted" placeholder="${UI.esc(placeholder)}">${UI.esc(value)}</textarea>
      </div>`;
  },

  bindComposer(id, onSubmit) {
    const ta = document.getElementById(id);
    if (!ta) return;
    const counter = document.getElementById(`${id}-count`);
    const update = () => { if (counter) counter.textContent = `${ta.value.length} / 5000`; };
    ta.addEventListener('input', update);
    ta.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); (onSubmit || (() => this.submitComment(null)))(); }
    });
    update();
  },

  wrap(id, before, after) {
    const ta = document.getElementById(id);
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e);
    ta.value = value.slice(0, s) + before + sel + after + value.slice(e);
    ta.focus();
    ta.selectionStart = s + before.length;
    ta.selectionEnd = s + before.length + sel.length;
    ta.dispatchEvent(new Event('input'));
  },

  paintSort() {
    document.getElementById('comment-sort').innerHTML = UI.tabs([
      { id: 'best', label: 'Mejores' }, { id: 'new', label: 'Nuevos' }, { id: 'old', label: 'Antiguos' }
    ], this.sort, 'PostDetailView.setSort');
  },

  setSort(sort) {
    this.sort = sort;
    this.paintSort();
    this.paintComments();
  },

  async loadComments() {
    const box = document.getElementById('comments-list');
    try {
      this.comments = await window.api.getPostComments(this.post.id);
      this.paintComments();
    } catch (err) {
      box.innerHTML = UI.error(err, 'PostDetailView.loadComments()');
    }
  },

  isDeleted(c) {
    return c.is_removed || UI.plain(c.content) === '[comentario eliminado]';
  },

  // Árbol a partir de parent_comment_id (ltree en el backend)
  paintComments() {
    const box = document.getElementById('comments-list');
    const all = this.comments || [];
    const alive = all.filter(c => !this.isDeleted(c)).length;
    document.getElementById('comments-chip').textContent = `${alive} ${alive === 1 ? 'respuesta' : 'respuestas'}`;
    document.getElementById('comments-count').textContent = alive;
    if (!all.length) {
      box.innerHTML = UI.empty({ icon: 'forum', title: 'Aún no hay comentarios', text: 'Abre la discusión con un aporte técnico.' });
      return;
    }
    const children = {};
    all.forEach(c => { const k = c.parent_comment_id || 'root'; (children[k] = children[k] || []).push(c); });
    const cmp = {
      best: (a, b) => (b.net_votes || 0) - (a.net_votes || 0) || new Date(a.created_at) - new Date(b.created_at),
      new: (a, b) => new Date(b.created_at) - new Date(a.created_at),
      old: (a, b) => new Date(a.created_at) - new Date(b.created_at)
    }[this.sort];
    const renderNode = (c, depth) => {
      const kids = (children[c.id] || []).sort(cmp);
      const collapsed = this.collapsed.has(c.id);
      return `
        <div class="${depth ? 'thread-line mt-3' : 'card'}" id="comment-${UI.esc(c.id)}">
          ${this.commentBody(c, kids.length, collapsed)}
          ${collapsed ? '' : `<div id="replies-${UI.esc(c.id)}">${kids.map(k => renderNode(k, depth + 1)).join('')}</div>`}
        </div>`;
    };
    box.innerHTML = (children.root || []).sort(cmp).map(c => renderNode(c, 0)).join('');
  },

  commentBody(c, replies, collapsed) {
    const me = window.api.user;
    const mine = me && me.id === c.author_id;
    const isMod = me && ['COMMUNITY_MOD', 'GLOBAL_ADMIN'].includes(me.global_role);
    if (this.isDeleted(c)) {
      return `
        <div class="flex items-start gap-3 rounded bg-surface-base/60 p-3 text-body-sm text-ink-muted">
          ${UI.icon('delete', 'text-[18px] text-danger/70')}
          <div><span class="font-mono">[comentario eliminado]</span> · ${window.utils.formatTime(c.created_at)}
          <p class="mt-0.5">Este aporte fue retirado por su autor o por moderación. Las respuestas se mantienen para no romper el hilo.</p></div>
        </div>`;
    }
    const isOp = c.author_id === this.post.author_id;
    return `
      <div class="flex items-center gap-2 text-body-sm">
        ${UI.avatar({ username: c.author_username }, 26)}
        ${UI.userLink(c.author_username)}
        ${isOp ? '<span class="chip-community">Autor</span>' : ''}
        <span class="text-ink-muted">· ${window.utils.formatTime(c.created_at)}</span>
        ${replies ? `<button class="ml-auto font-mono text-body-sm text-ink-muted hover:text-ink" onclick="PostDetailView.toggleCollapse(${UI.arg(c.id)})">${collapsed ? `[+] ${replies} ${replies === 1 ? 'respuesta' : 'respuestas'}` : '[–] colapsar'}</button>` : ''}
      </div>
      <div id="comment-content-${UI.esc(c.id)}" class="prose-post mt-2">${window.utils.renderMarkdown(c.content)}</div>
      <div class="mt-2 flex flex-wrap items-center gap-1">
        ${UI.vote('comment', c.id, c.net_votes, c.user_vote)}
        ${me ? `<button class="btn-ghost btn-sm" onclick="PostDetailView.openReply(${UI.arg(c.id)})">${UI.icon('reply', 'text-[17px]')} Responder</button>
        <button class="btn-ghost btn-sm" onclick="PostDetailView.openReply(${UI.arg(c.id)}, true)">${UI.icon('format_quote', 'text-[17px]')} Citar</button>` : ''}
        ${mine ? `<button class="btn-ghost btn-sm" onclick="PostDetailView.editComment(${UI.arg(c.id)})">${UI.icon('edit', 'text-[17px]')} Editar</button>
        <button class="btn-danger-ghost btn-sm" onclick="PostDetailView.deleteComment(${UI.arg(c.id)})">${UI.icon('delete', 'text-[17px]')} Eliminar</button>` : ''}
        ${me && !mine ? `<button class="btn-ghost btn-sm" onclick="ModerationView.reportModal(${UI.arg(c.id)}, 'COMMENT')">${UI.icon('flag', 'text-[17px]')} Reportar</button>` : ''}
        ${isMod && !mine ? `<button class="btn-danger-ghost btn-sm" onclick="ModerationView.forceRemove(${UI.arg(c.id)}, 'COMMENT')">${UI.icon('gavel', 'text-[17px]')} Retirar</button>` : ''}
      </div>
      <div id="reply-box-${UI.esc(c.id)}"></div>`;
  },

  toggleCollapse(id) {
    if (this.collapsed.has(id)) this.collapsed.delete(id); else this.collapsed.add(id);
    this.paintComments();
  },

  // 02_17 Formulario de respuesta y cita técnica en hilo
  openReply(commentId, quote = false) {
    const box = document.getElementById(`reply-box-${commentId}`);
    if (box.innerHTML) { box.innerHTML = ''; return; }
    const c = this.comments.find(x => x.id === commentId);
    const quoted = quote ? UI.plain(c.content).split('\n').filter(l => !l.startsWith('>')).slice(0, 6).map(l => `> ${l}`).join('\n') + `\n> — @${c.author_username}\n\n` : '';
    box.innerHTML = `
      <div class="mt-3">
        ${this.composer(`reply-${commentId}`, `Responde a @${c.author_username}…`, quoted)}
        <div class="mt-2 flex justify-end gap-2">
          <button class="btn-ghost btn-sm" onclick="document.getElementById('reply-box-${UI.esc(commentId)}').innerHTML = ''">Cancelar</button>
          <button class="btn-primary btn-sm" onclick="PostDetailView.submitComment(${UI.arg(commentId)})">Responder</button>
        </div>
      </div>`;
    const ta = document.getElementById(`reply-${commentId}`);
    this.bindComposer(`reply-${commentId}`, () => this.submitComment(commentId));
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
  },

  async submitComment(parentId) {
    const ta = document.getElementById(parentId ? `reply-${parentId}` : 'new-comment');
    const content = ta.value.trim();
    if (!content) { ta.focus(); window.utils.showToast('Escribe tu comentario', 'warning'); return; }
    ta.disabled = true;
    try {
      await window.api.createComment({ post_id: this.post.id, parent_comment_id: parentId || null, content });
      if (!parentId) ta.value = '';
      window.utils.showToast('Comentario publicado', 'info');
      if (parentId && this.collapsed.has(parentId)) this.collapsed.delete(parentId);
      await this.loadComments();
    } catch (err) {
      StatusView.toastError(err, 'No se pudo publicar el comentario');
    } finally {
      ta.disabled = false;
      ta.dispatchEvent(new Event('input'));
    }
  },

  // 03_21 Editar comentario
  editComment(id) {
    const c = this.comments.find(x => x.id === id);
    const box = document.getElementById(`comment-content-${id}`);
    box.classList.remove('prose-post');
    box.innerHTML = `
      ${this.composer(`edit-${id}`, '', UI.plain(c.content))}
      <div class="mt-2 flex justify-end gap-2">
        <button class="btn-ghost btn-sm" onclick="PostDetailView.paintComments()">Cancelar</button>
        <button class="btn-primary btn-sm" onclick="PostDetailView.saveComment(${UI.arg(id)})">Guardar cambios</button>
      </div>`;
    this.bindComposer(`edit-${id}`, () => this.saveComment(id));
    document.getElementById(`edit-${id}`).focus();
  },

  async saveComment(id) {
    const content = document.getElementById(`edit-${id}`).value.trim();
    if (!content) { window.utils.showToast('El comentario no puede quedar vacío', 'warning'); return; }
    try {
      await window.api.updateComment(id, content);
      window.utils.showToast('Comentario actualizado', 'info');
      await this.loadComments();
    } catch (err) {
      StatusView.toastError(err, 'No se pudo editar');
    }
  },

  // 03_21 Modal de eliminación de comentario
  async deleteComment(id) {
    const ok = await UI.confirm({
      title: '¿Eliminar este comentario?',
      text: 'Se mostrará como <span class="font-mono">[comentario eliminado]</span>. Las respuestas se conservan para no romper el hilo. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar comentario', danger: true, icon: 'delete'
    });
    if (!ok) return;
    try {
      await window.api.deleteComment(id);
      window.utils.showToast('Comentario eliminado', 'info');
      await this.loadComments();
    } catch (err) {
      StatusView.toastError(err, 'No se pudo eliminar');
    }
  },

  // 02_18 Eliminar publicación con modal
  async deletePost(postId) {
    const ok = await UI.confirm({
      title: '¿Eliminar la publicación?',
      text: 'Desaparecerá del feed y de la comunidad, junto con su puntuación. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar publicación', danger: true, icon: 'delete_forever'
    });
    if (!ok) return;
    try {
      await window.api.deletePost(postId);
      Router.leaveGuard = null;
      window.utils.showToast('Publicación eliminada', 'info');
      Router.navigate('/');
    } catch (err) {
      StatusView.toastError(err, 'No se pudo eliminar');
    }
  },

  // Compatibilidad con llamadas antiguas
  votePost(id, v) { return window.utils.castVote('post', id, v); },
  voteComment(id, v) { return window.utils.castVote('comment', id, v); }
};

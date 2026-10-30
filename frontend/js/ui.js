/**
 * Componentes compartidos del sistema de diseño Obsidian Signal.
 * Devuelven HTML (cadenas) para las vistas; todo dato de usuario pasa por esc() o arg().
 */

window.UI = {
  esc(v) { return window.utils.escapeHTML(window.utils.decodeEntities(v == null ? '' : String(v))); },
  // Texto plano para valores de campos editables (se guarda tal cual lo ve el usuario)
  plain(v) { return window.utils.decodeEntities(v == null ? '' : String(v)); },
  arg(v) { return window.utils.jsArg(v); },
  icon(name, cls = '') { return `<span class="icon ${cls}" aria-hidden="true">${name}</span>`; },

  // Rangos de reputación (01_10 Desglose de karma y progresión de rangos)
  ranks: [
    { level: 1, name: 'Novato', min: 0, icon: 'eco' },
    { level: 2, name: 'Colaborador', min: 100, icon: 'handshake' },
    { level: 3, name: 'Contribuidor Experto', min: 500, icon: 'workspace_premium' },
    { level: 4, name: 'Leyenda Comunitaria', min: 1000, icon: 'military_tech' },
    { level: 5, name: 'Vanguardia Élite', min: 2000, icon: 'diamond' },
    { level: 6, name: 'Arquitecto del Ecosistema', min: 5000, icon: 'auto_awesome' }
  ],

  rank(karma = 0) {
    const ranks = this.ranks;
    let i = ranks.length - 1;
    while (i > 0 && karma < ranks[i].min) i--;
    const current = ranks[i];
    const next = ranks[i + 1] || null;
    const progress = next ? Math.min(100, Math.round(((karma - current.min) / (next.min - current.min)) * 100)) : 100;
    return { ...current, next, progress };
  },

  avatar(user = {}, size = 32, cls = '') {
    const name = user.username || user.author_username || '?';
    const initial = this.esc(name.charAt(0).toUpperCase());
    const dims = `width:${size}px;height:${size}px`;
    const status = user.presence_status
      ? `<span class="absolute bottom-0 right-0 rounded-full ring-2 ring-surface-card ${{ ONLINE: 'bg-primary', BUSY: 'bg-danger' }[user.presence_status] || 'bg-ink-muted'}" style="width:${Math.max(8, size / 4)}px;height:${Math.max(8, size / 4)}px"></span>`
      : '';
    const hue = [...name].reduce((h, c) => (h + c.charCodeAt(0) * 13) % 360, 0);
    const fallback = `<span class="flex items-center justify-center rounded-full font-display font-semibold text-ink" style="${dims};font-size:${Math.round(size / 2.3)}px;background:hsl(${hue} 35% 22%)">${initial}</span>`;
    const img = /^https?:\/\//i.test(user.avatar_url || '')
      ? `<img src="${this.esc(user.avatar_url)}" alt="" class="rounded-full border border-line object-cover" style="${dims}" onerror="this.replaceWith(Object.assign(document.createElement('span'), { innerHTML: this.dataset.fb }).firstChild)" data-fb="${this.esc(fallback)}">`
      : fallback;
    return `<span class="relative inline-flex shrink-0 ${cls}" style="${dims}">${img}${status}</span>`;
  },

  roleBadge(role) {
    if (role === 'GLOBAL_ADMIN') return `<span class="chip-danger">Admin</span>`;
    if (role === 'COMMUNITY_MOD') return `<span class="chip-tertiary">Moderador</span>`;
    return '';
  },

  communityChip(name) {
    if (!name) return '';
    return `<a href="/c/${encodeURIComponent(name)}" data-link class="chip-community" onclick="event.stopPropagation()">c/${this.esc(name)}</a>`;
  },

  userLink(username) {
    if (!username) return '<span class="text-ink-muted">anónimo</span>';
    return `<a href="/u/${encodeURIComponent(username)}" data-link class="font-medium text-ink hover:text-secondary" onclick="event.stopPropagation()">@${this.esc(username)}</a>`;
  },

  // Voto único (design.md › Voting Module); el estado lo pinta utils.castVote con la respuesta del servidor
  vote(kind, id, score, userVote = 0, vertical = false) {
    const up = userVote === 1 ? 'voted-up' : '';
    const down = userVote === -1 ? 'voted-down' : '';
    return `
      <div class="vote-pill ${vertical ? 'flex-col' : ''}" data-vote-box="${kind}:${this.esc(id)}" data-user-vote="${userVote || 0}" onclick="event.stopPropagation()">
        <button class="vote-btn ${up}" data-vote-dir="1" onclick="utils.castVote(${this.arg(kind)}, ${this.arg(id)}, 1)" aria-label="Voto positivo">${this.icon('arrow_upward', 'text-[18px]')}</button>
        <span class="vote-score ${up || down}">${score || 0}</span>
        <button class="vote-btn ${down}" data-vote-dir="-1" onclick="utils.castVote(${this.arg(kind)}, ${this.arg(id)}, -1)" aria-label="Voto negativo">${this.icon('arrow_downward', 'text-[18px]')}</button>
      </div>`;
  },

  excerpt(text, max = 280) {
    const plain = window.utils.decodeEntities(text).replace(/```[\s\S]*?```/g, ' [código] ').replace(/[`*_>#]/g, '').trim();
    return plain.length > max ? plain.slice(0, max).trimEnd() + '…' : plain;
  },

  mediaBlock(post) {
    if (!post.media_url) return '';
    const url = this.esc(post.media_url);
    if (post.content_type === 'IMAGE') {
      return `<img src="${url}" alt="" loading="lazy" class="mt-3 max-h-[420px] w-full rounded-md border border-line object-cover" onerror="this.remove()">`;
    }
    if (post.content_type === 'VIDEO') {
      return `<video src="${url}" controls preload="metadata" class="mt-3 max-h-[420px] w-full rounded-md border border-line bg-black"></video>`;
    }
    let host = post.media_url;
    try { host = new URL(post.media_url).host; } catch (_) {}
    return `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow" onclick="event.stopPropagation()" class="mt-3 flex items-center gap-2 rounded-md border border-line bg-surface-base px-3 py-2.5 text-body-sm text-secondary hover:border-secondary/40">${this.icon('link', 'text-[18px]')}<span class="truncate">${this.esc(host)}</span>${this.icon('open_in_new', 'ml-auto text-[16px] text-ink-muted')}</a>`;
  },

  // Tarjeta de publicación (02_14 Feed principal)
  postCard(post) {
    const link = `/posts/${encodeURIComponent(post.id)}`;
    return `
      <article class="card card-hover cursor-pointer" onclick="Router.navigate(${this.arg(link)})">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-ink-secondary">
          ${this.communityChip(post.community_name)}
          <span class="text-ink-muted">·</span>
          ${this.userLink(post.author_username)}
          <span class="text-ink-muted">·</span>
          <span class="text-ink-muted">${window.utils.formatTime(post.created_at)}</span>
          ${post.content_type && post.content_type !== 'TEXT' ? `<span class="chip-neutral ml-auto">${{ IMAGE: 'Imagen', VIDEO: 'Video', LINK: 'Enlace' }[post.content_type] || ''}</span>` : ''}
        </div>
        <h3 class="mt-2 font-display text-headline-md text-balance">${this.esc(post.title)}</h3>
        ${post.body_text ? `<p class="mt-2 text-body-md text-ink-secondary">${this.esc(this.excerpt(post.body_text))}</p>` : ''}
        ${this.mediaBlock(post)}
        <div class="mt-4 flex items-center gap-2">
          ${this.vote('post', post.id, post.net_votes, post.user_vote)}
          <a href="${link}" data-link class="btn-ghost btn-sm" onclick="event.stopPropagation()">${this.icon('chat_bubble_outline', 'text-[18px]')} ${post.comments_count || 0} comentarios</a>
          <button class="btn-icon ml-auto" title="Copiar enlace" onclick="event.stopPropagation(); UI.share(${this.arg(link)})">${this.icon('share', 'text-[18px]')}</button>
        </div>
      </article>`;
  },

  share(path) {
    const url = window.location.origin + path;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
      .then(() => window.utils.showToast('Enlace copiado al portapapeles', 'info'))
      .catch(() => window.utils.showToast(url, 'info'));
  },

  skeletonPosts(n = 3) {
    return Array.from({ length: n }, () => `
      <div class="card">
        <div class="skeleton h-4 w-48"></div>
        <div class="skeleton mt-3 h-6 w-3/4"></div>
        <div class="skeleton mt-2 h-4 w-full"></div>
        <div class="skeleton mt-1.5 h-4 w-2/3"></div>
      </div>`).join('');
  },

  empty({ icon = 'inbox', title, text = '', action = '' }) {
    return `
      <div class="card flex flex-col items-center px-6 py-12 text-center">
        <span class="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated text-ink-secondary">${this.icon(icon)}</span>
        <h3 class="mt-4 text-headline-sm">${this.esc(title)}</h3>
        ${text ? `<p class="mt-1 max-w-md text-body-md text-ink-secondary">${text}</p>` : ''}
        ${action ? `<div class="mt-5 flex flex-wrap justify-center gap-2">${action}</div>` : ''}
      </div>`;
  },

  error(err, retry = '') {
    const msg = (err && (err.message || err.error)) || 'Error inesperado';
    return `
      <div class="card flex flex-col items-center border-danger/30 px-6 py-10 text-center">
        <span class="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">${this.icon('error')}</span>
        <h3 class="mt-4 text-headline-sm">No se pudo cargar el contenido</h3>
        <p class="mt-1 max-w-md text-body-md text-ink-secondary">${this.esc(msg)}</p>
        ${retry ? `<button class="btn-secondary mt-5" onclick="${retry}">${this.icon('refresh', 'text-[18px]')} Reintentar</button>` : ''}
      </div>`;
  },

  pageHeader(title, subtitle = '', actions = '', icon = '') {
    return `
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="flex items-center gap-2 text-headline-lg">${icon ? this.icon(icon, 'text-[26px] text-primary') : ''}${this.esc(title)}</h1>
          ${subtitle ? `<p class="mt-1 text-body-md text-ink-secondary">${subtitle}</p>` : ''}
        </div>
        ${actions ? `<div class="flex flex-wrap items-center gap-2">${actions}</div>` : ''}
      </div>`;
  },

  tabs(items, active, handler) {
    return `
      <div class="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface-card p-1.5">
        ${items.map(t => `<button class="tab ${t.id === active ? 'active' : ''}" onclick="${handler}(${this.arg(t.id)})">${t.icon ? this.icon(t.icon, 'text-[17px]') : ''}${this.esc(t.label)}${t.count != null ? `<span class="chip-neutral ml-1">${t.count}</span>` : ''}</button>`).join('')}
      </div>`;
  },

  // Campo de formulario con zona de aviso (validación en vivo)
  field(id, label, { type = 'text', placeholder = '', value = '', help = '', attrs = '', textarea = false, rows = 4 } = {}) {
    const input = textarea
      ? `<textarea id="${id}" class="input" rows="${rows}" placeholder="${this.esc(placeholder)}" ${attrs}>${this.esc(value)}</textarea>`
      : `<input id="${id}" type="${type}" class="input" placeholder="${this.esc(placeholder)}" value="${this.esc(value)}" ${attrs}>`;
    return `
      <div class="mb-4">
        <label class="label" for="${id}">${label}</label>
        ${input}
        <div class="field-hint" id="${id}-hint"></div>
        ${help ? `<p class="help">${help}</p>` : ''}
      </div>`;
  },

  setHint(id, msg) {
    const input = document.getElementById(id);
    const hint = document.getElementById(`${id}-hint`);
    if (hint) hint.innerHTML = msg ? `${this.icon('info', 'text-[15px]')}<span>${this.esc(msg)}</span>` : '';
    if (input) input.classList.toggle('is-invalid', !!msg);
    return !msg;
  },

  // Modal genérico: devuelve el elemento; close() lo retira
  modal({ title, body, actions = '', icon = '', tone = 'default', size = 'max-w-lg', dismissable = true }) {
    this.closeModal();
    const toneCls = { danger: 'bg-danger/10 text-danger', warning: 'bg-warning/10 text-warning', primary: 'bg-primary/10 text-primary', secondary: 'bg-secondary/10 text-secondary' }[tone] || 'bg-surface-elevated text-ink-secondary';
    const el = document.createElement('div');
    el.className = 'modal-backdrop';
    el.id = 'ui-modal';
    el.innerHTML = `
      <div class="modal ${size}" role="dialog" aria-modal="true">
        <div class="flex items-start gap-3">
          ${icon ? `<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${toneCls}">${this.icon(icon)}</span>` : ''}
          <div class="min-w-0 flex-1">
            <h3 class="text-headline-md">${this.esc(title)}</h3>
            <div class="mt-2 text-body-md text-ink-secondary">${body}</div>
          </div>
          ${dismissable ? `<button class="btn-icon -mr-2 -mt-2" onclick="UI.closeModal()" aria-label="Cerrar">${this.icon('close')}</button>` : ''}
        </div>
        ${actions ? `<div class="mt-6 flex flex-wrap justify-end gap-2">${actions}</div>` : ''}
      </div>`;
    if (dismissable) el.addEventListener('click', e => { if (e.target === el) this.closeModal(); });
    document.body.appendChild(el);
    return el;
  },

  closeModal() {
    const el = document.getElementById('ui-modal');
    if (el) el.remove();
    if (this._resolve) { const r = this._resolve; this._resolve = null; r(false); }
  },

  // Confirmación (06_87 descartar borrador, 02_18/03_21 eliminar, etc.)
  confirm({ title, text, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false, icon = 'help', tone }) {
    return new Promise(resolve => {
      this.modal({
        title, icon, tone: tone || (danger ? 'danger' : 'secondary'),
        body: text,
        actions: `<button class="btn-ghost" onclick="UI.closeModal()">${this.esc(cancelText)}</button>
                  <button class="${danger ? 'btn-danger' : 'btn-primary'}" id="ui-confirm-ok">${this.esc(confirmText)}</button>`
      });
      this._resolve = resolve;
      document.getElementById('ui-confirm-ok').onclick = () => {
        this._resolve = null;
        document.getElementById('ui-modal').remove();
        resolve(true);
      };
    });
  },

  // Bloques de la columna derecha
  rail: {
    reputation(user) {
      if (!user) {
        return `
          <div class="card">
            <h3 class="text-headline-sm">Únete a Forfunable</h3>
            <p class="mt-1 text-body-sm text-ink-secondary">Vota, comenta y crea comunidades técnicas. Gana reputación con cada aporte.</p>
            <div class="mt-4 flex gap-2"><a href="/register" data-link class="btn-primary flex-1">Crear cuenta</a><a href="/login" data-link class="btn-secondary flex-1">Ingresar</a></div>
          </div>`;
      }
      const r = UI.rank(user.karma_score || 0);
      return `
        <a href="/profile" data-link class="card card-hover block">
          <div class="flex items-center justify-between">
            <h3 class="flex items-center gap-2 text-headline-sm">${UI.icon(r.icon, 'text-primary')} Tu reputación</h3>
            <span class="chip-primary font-mono">Nivel ${r.level}</span>
          </div>
          <div class="mt-3 flex items-end justify-between">
            <span class="font-display text-headline-xl">${(user.karma_score || 0).toLocaleString('es')}</span>
            <span class="text-body-sm text-secondary">${UI.esc(r.name)}</span>
          </div>
          <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-base"><div class="h-full rounded-full bg-primary" style="width:${r.progress}%"></div></div>
          <p class="mt-2 text-body-sm text-ink-muted">${r.next ? `${r.progress}% · Siguiente: ${UI.esc(r.next.name)} (${r.next.min.toLocaleString('es')} pts)` : 'Rango máximo alcanzado'}</p>
        </a>`;
    },

    async recommended() {
      try {
        const comms = (await window.api.listCommunities())
          .sort((a, b) => (b.subscribers_count || 0) - (a.subscribers_count || 0)).slice(0, 4);
        if (!comms.length) return '';
        return `
          <div class="card">
            <h3 class="text-headline-sm">Comunidades recomendadas</h3>
            <div class="mt-3 flex flex-col gap-3">
              ${comms.map(c => `
                <a href="/c/${encodeURIComponent(c.name)}" data-link class="flex items-center gap-3 rounded p-1 hover:bg-surface-elevated">
                  <span class="flex h-9 w-9 items-center justify-center rounded bg-secondary/10 text-secondary">${UI.icon('tag', 'text-[18px]')}</span>
                  <span class="min-w-0 flex-1"><span class="block truncate text-label-lg text-ink">c/${UI.esc(c.name)}</span><span class="block font-mono text-body-sm text-ink-muted">${c.subscribers_count || 0} miembros</span></span>
                  ${UI.icon('chevron_right', 'text-ink-muted')}
                </a>`).join('')}
            </div>
          </div>`;
      } catch (_) { return ''; }
    },

    footer() {
      return `
        <div class="flex flex-wrap gap-x-3 gap-y-1 px-1 text-body-sm text-ink-muted">
          <a href="/status" data-link class="hover:text-ink">${UI.icon('circle', 'icon-fill text-[9px] text-primary')} Estado</a>
          <a href="/communities" data-link class="hover:text-ink">Comunidades</a>
          <a href="/members" data-link class="hover:text-ink">Miembros</a>
          <span class="w-full">Forfunable · Cloud Run + Cloud SQL</span>
        </div>`;
    }
  }
};

/**
 * 01_08 Mi perfil y desglose de karma, 01_10 Desglose de karma y progresión de rangos.
 * Conectada a /api/v1/users/:id, /api/v1/users/:id/karma y /api/v1/posts?author_id=.
 */

window.ProfileView = {
  statusLabel(status) {
    return { ONLINE: ['En línea', 'text-primary'], BUSY: ['Ocupado', 'text-danger'], OFFLINE: ['Desconectado', 'text-ink-muted'] }[status] || ['Desconectado', 'text-ink-muted'];
  },

  perks: {
    1: 'Votar, comentar y publicar',
    2: 'Desbloquea fundar comunidades',
    3: 'Insignia de contribuidor experto',
    4: 'Insignia de leyenda comunitaria',
    5: 'Distintivo de vanguardia en el ranking',
    6: 'Máximo reconocimiento de la red'
  },

  async render(username) {
    const target = username || (window.api.user && window.api.user.username);
    $main().innerHTML = UI.skeletonPosts(2);
    let user;
    try {
      user = await window.api.getPublicProfile(target);
    } catch (err) {
      if (err.status === 404) return StatusView.page('404', { what: 'user', title: 'Este usuario no existe', text: `No encontramos a @${UI.esc(target)}. Puede que haya cambiado de nombre.` });
      throw err;
    }
    let karma = {};
    try { karma = await window.api.getUserKarma(user.id); } catch (_) {}
    const me = window.api.user;
    const isMe = me && me.id === user.id;
    const total = user.karma_score || 0;
    const r = UI.rank(total);
    const [statusText, statusCls] = this.statusLabel(user.presence_status);
    const postK = karma.post_karma || 0;
    const commentK = karma.comment_karma || 0;
    const sum = Math.max(1, Math.abs(postK) + Math.abs(commentK));
    const since = new Date(user.created_at).toLocaleDateString('es', { month: 'long', year: 'numeric' });

    $main().innerHTML = `
      <section class="card relative overflow-hidden p-5 sm:p-6">
        <div class="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary via-secondary to-transparent"></div>
        <div class="flex flex-wrap items-start gap-5">
          ${UI.avatar(user, 96)}
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-2"><h1 class="text-headline-xl">@${UI.esc(user.username)}</h1></div>
            <div class="mt-2 flex flex-wrap gap-2">
              <span class="chip-community">${UI.icon(r.icon, 'text-[13px]')} ${r.name}</span>
              ${UI.roleBadge(user.global_role)}
              ${user.is_adult_verified ? '<span class="chip-neutral">Verificado +18</span>' : ''}
            </div>
            <p class="mt-3 max-w-2xl text-body-lg text-ink-secondary">${UI.esc(user.bio || (isMe ? 'Aún no escribiste tu biografía.' : 'Miembro de Forfunable.'))}</p>
            <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-ink-muted">
              <span class="flex items-center gap-1">${UI.icon('calendar_month', 'text-[16px]')} Miembro desde ${since}</span>
              <span class="flex items-center gap-1 ${statusCls}">${UI.icon('circle', 'icon-fill text-[9px]')} ${statusText}</span>
            </div>
          </div>
          <div class="flex gap-2">
            ${isMe ? `<a href="/settings/profile" data-link class="btn-primary">${UI.icon('edit', 'text-[18px]')} Editar perfil</a>` : me ? `<a href="/chat/new?to=${encodeURIComponent(user.username)}" data-link class="btn-primary">${UI.icon('chat', 'text-[18px]')} Mensaje</a>` : ''}
            <button class="btn-secondary" onclick="UI.share(${UI.arg('/u/' + encodeURIComponent(user.username))})">${UI.icon('share', 'text-[18px]')} Compartir</button>
            ${isMe ? `<a href="/settings" data-link class="btn-secondary px-2.5" title="Ajustes">${UI.icon('tune')}</a>` : ''}
          </div>
        </div>
      </section>

      <section class="card mt-4 p-5 sm:p-6">
        <div class="flex flex-wrap items-center gap-4">
          <span class="flex h-14 w-14 items-center justify-center rounded-md border border-line bg-surface-elevated text-primary">${UI.icon(r.icon, 'text-[28px]')}</span>
          <div class="flex-1">
            <div class="flex items-center gap-2 text-label-sm uppercase tracking-wider text-ink-muted">Desglose de karma y estatus <span class="chip-primary">Nivel ${r.level} de ${UI.ranks.length}</span></div>
            <div class="mt-1 flex flex-wrap items-baseline gap-3"><span class="font-display text-headline-xl">${total.toLocaleString('es')}</span><span class="text-label-sm uppercase text-ink-muted">Karma total</span>
              <span class="text-body-sm text-ink-secondary">Rango: <span class="text-secondary">${r.name} (${r.min.toLocaleString('es')}+)</span></span></div>
          </div>
          ${r.next ? `<span class="chip-neutral py-1.5">${UI.icon('trending_up', 'text-[15px]')} Próximo hito: ${r.next.name}</span>` : ''}
        </div>
        <div class="mt-5 rounded bg-surface-base p-4">
          <div class="flex flex-wrap justify-between gap-2 text-body-sm">
            <span class="text-ink">${r.next ? `${r.next.name} <span class="text-ink-muted">— ${total.toLocaleString('es')} / ${r.next.min.toLocaleString('es')} pts</span>` : 'Rango máximo'}</span>
            <span class="text-primary">${r.progress}% completado ${r.next ? `<span class="text-ink-muted">(faltan ${(r.next.min - total).toLocaleString('es')})</span>` : ''}</span>
          </div>
          <div class="mt-2 h-2 overflow-hidden rounded-full bg-surface-card"><div class="h-full rounded-full bg-primary" style="width:${r.progress}%"></div></div>
        </div>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          ${[['Aportes directos', 'article', postK, 'Votos netos recibidos en publicaciones', 'text-secondary'], ['Discusión y debate', 'forum', commentK, 'Votos netos recibidos en comentarios', 'text-tertiary-soft']].map(([t, i, v, d, c]) => `
            <div class="rounded border border-line bg-surface-base p-4">
              <div class="flex items-center justify-between text-label-sm uppercase tracking-wider text-ink-muted">${t}${UI.icon(i, `text-[18px] ${c}`)}</div>
              <div class="mt-2 flex items-baseline gap-2"><span class="font-display text-headline-lg">${v >= 0 ? '+' : ''}${v}</span><span class="text-body-sm ${c}">${Math.round(Math.abs(v) / sum * 100)}%</span></div>
              <div class="text-body-sm text-ink-secondary">${d}</div>
            </div>`).join('')}
        </div>
        <p class="mt-4 flex items-start gap-2 rounded bg-surface-elevated px-4 py-3 text-body-sm text-ink-secondary">${UI.icon('info', 'text-[17px] text-secondary')} El karma total combina el saldo inicial de la cuenta, los votos recibidos y los ajustes de la administración; el desglose muestra solo los votos.</p>
      </section>

      <div class="mt-4">${UI.tabs([{ id: 'posts', label: 'Publicaciones', icon: 'article' }], 'posts', 'void')}</div>
      <div id="profile-posts" class="mt-4 flex flex-col gap-4">${UI.skeletonPosts(2)}</div>`;

    Router.setRail(this.ranksCard(total) + (isMe ? `
      <div class="card">
        <div class="text-label-sm uppercase tracking-wider text-ink-muted">Gestión de perfil</div>
        <nav class="mt-2 flex flex-col">
          <a href="/settings/profile" data-link class="nav-item">${UI.icon('badge', 'text-[19px]')}Identidad pública</a>
          <a href="/settings/presence" data-link class="nav-item">${UI.icon('visibility', 'text-[19px]')}Presencia y visibilidad</a>
          <a href="/settings" data-link class="nav-item">${UI.icon('settings', 'text-[19px]')}Centro de ajustes</a>
        </nav>
      </div>` : ''));

    try {
      const posts = await window.api.listPosts({ author_id: user.id, sort: 'newest', limit: 50 });
      document.getElementById('profile-posts').innerHTML = posts.length ? posts.map(p => UI.postCard(p)).join('')
        : UI.empty({ icon: 'edit_note', title: isMe ? 'Aún no publicaste nada' : 'Sin publicaciones', text: isMe ? 'Tu primera publicación te dará visibilidad y karma.' : '', action: isMe ? `<a href="/submit" data-link class="btn-primary">Crear publicación</a>` : '' });
    } catch (err) {
      document.getElementById('profile-posts').innerHTML = UI.error(err);
    }
  },

  // 01_10 Rangos y permisos
  ranksCard(total) {
    const current = UI.rank(total).level;
    return `
      <div class="card">
        <div class="flex items-center justify-between text-label-sm uppercase tracking-wider text-ink-muted">Rangos y permisos <span class="text-primary">${current} de ${UI.ranks.length}</span></div>
        <ol class="mt-3 flex flex-col gap-2">
          ${UI.ranks.map(rk => {
            const state = rk.level < current ? 'done' : rk.level === current ? 'current' : 'locked';
            return `<li class="flex gap-3 rounded p-2 ${state === 'current' ? 'border border-primary/30 bg-primary/5' : ''} ${state === 'locked' ? 'opacity-50' : ''}">
              <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${state === 'locked' ? 'bg-surface-base text-ink-muted' : 'bg-primary/15 text-primary'}">${UI.icon(state === 'locked' ? 'lock' : state === 'current' ? rk.icon : 'check', 'text-[15px]')}</span>
              <span class="min-w-0"><span class="block text-label-lg ${state === 'current' ? 'text-primary' : 'text-ink'}">${rk.name} (${rk.min.toLocaleString('es')}+) ${state === 'current' ? '<span class="chip-primary ml-1">Actual</span>' : ''}</span>
              <span class="block text-body-sm text-ink-muted">${this.perks[rk.level]}</span></span>
            </li>`;
          }).join('')}
        </ol>
      </div>`;
  }
};

/**
 * 03_21 Directorio de miembros y ranking de reputación.
 * Conectada a GET /api/v1/users?sort=karma|newest&search=.
 */

window.MembersView = {
  sort: 'karma',

  render(query = {}) {
    this.sort = query.sort || this.sort;
    $main().innerHTML = `
      ${UI.pageHeader('Miembros y ranking', 'Las personas que más aportan a las comunidades, ordenadas por reputación.', '', 'leaderboard')}
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <div class="relative min-w-[220px] flex-1">
          ${UI.icon('search', 'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-ink-muted')}
          <input id="members-search" class="input pl-10" placeholder="Buscar por nombre de usuario…" value="${UI.esc(query.q || '')}" oninput="clearTimeout(MembersView._t); MembersView._t = setTimeout(() => MembersView.load(), 250)">
        </div>
        <div id="members-sort"></div>
      </div>
      <div id="members-list">${UI.skeletonPosts(3)}</div>`;
    this.paintSort();
    this.load();
    Router.setRail(`
      <div class="card">
        <h3 class="text-headline-sm">Rangos de reputación</h3>
        <ul class="mt-3 flex flex-col gap-2">
          ${UI.ranks.map(r => `<li class="flex items-center gap-2 text-body-sm">${UI.icon(r.icon, 'text-[18px] text-primary')}<span class="flex-1">${r.name}</span><span class="font-mono text-ink-muted">${r.min.toLocaleString('es')}+</span></li>`).join('')}
        </ul>
      </div>`);
  },

  paintSort() {
    document.getElementById('members-sort').innerHTML = UI.tabs([
      { id: 'karma', label: 'Reputación', icon: 'military_tech' }, { id: 'newest', label: 'Recién llegados', icon: 'new_releases' }
    ], this.sort, 'MembersView.setSort');
  },

  setSort(s) {
    this.sort = s;
    this.paintSort();
    this.load();
  },

  async load() {
    const box = document.getElementById('members-list');
    const search = document.getElementById('members-search').value.trim().replace(/^@/, '');
    try {
      const users = await window.api.listMembers({ sort: this.sort, search, limit: 100 });
      if (!users.length) {
        box.innerHTML = UI.empty({ icon: 'person_search', title: 'Sin coincidencias', text: search ? `Nadie se llama “${UI.esc(search)}”.` : 'Todavía no hay miembros.' });
        return;
      }
      const me = window.api.user;
      const podium = this.sort === 'karma' && !search ? users.slice(0, 3) : [];
      const rest = podium.length ? users.slice(3) : users;
      const medal = ['text-warning', 'text-ink-secondary', 'text-[#cd7f32]'];
      box.innerHTML = `
        ${podium.length ? `<div class="mb-4 grid gap-3 sm:grid-cols-3">${podium.map((u, i) => `
          <a href="/u/${encodeURIComponent(u.username)}" data-link class="card card-hover flex flex-col items-center text-center ${i === 0 ? 'border-warning/40' : ''}">
            <span class="${medal[i]}">${UI.icon('workspace_premium', 'icon-fill text-[28px]')}</span>
            <span class="mt-2">${UI.avatar(u, 56)}</span>
            <span class="mt-2 text-label-lg">@${UI.esc(u.username)}</span>
            <span class="text-body-sm text-ink-muted">${UI.rank(u.karma_score).name}</span>
            <span class="mt-2 font-display text-headline-md text-primary">${u.karma_score.toLocaleString('es')}</span>
          </a>`).join('')}</div>` : ''}
        <div class="card overflow-x-auto p-0">
          <table class="table">
            <thead><tr><th class="w-12">#</th><th>Miembro</th><th class="hidden sm:table-cell">Rango</th><th class="text-right">Karma</th><th></th></tr></thead>
            <tbody>${rest.map((u, i) => `
              <tr class="hover:bg-surface-elevated/50">
                <td class="font-mono text-ink-muted">${this.sort === 'karma' && !search ? i + 1 + podium.length : '·'}</td>
                <td><a href="/u/${encodeURIComponent(u.username)}" data-link class="flex items-center gap-3 hover:text-secondary">${UI.avatar(u, 32)}<span><span class="block text-label-lg">@${UI.esc(u.username)} ${UI.roleBadge(u.global_role)}</span><span class="block max-w-[160px] truncate text-body-sm text-ink-muted sm:max-w-[260px]">${UI.esc(u.bio || 'Miembro desde ' + new Date(u.created_at).toLocaleDateString('es'))}</span></span></a></td>
                <td class="hidden sm:table-cell"><span class="chip-neutral">${UI.icon(UI.rank(u.karma_score).icon, 'text-[13px]')} ${UI.rank(u.karma_score).name}</span></td>
                <td class="text-right font-mono text-primary">${u.karma_score.toLocaleString('es')}</td>
                <td class="text-right">${me && me.username !== u.username ? `<a href="/chat/new?to=${encodeURIComponent(u.username)}" data-link class="btn-icon" title="Enviar mensaje">${UI.icon('chat', 'text-[18px]')}</a>` : ''}</td>
              </tr>`).join('')}</tbody>
          </table>
        </div>`;
    } catch (err) {
      box.innerHTML = UI.error(err, 'MembersView.load()');
    }
  }
};

async function fetchRosterCombined(supabase, teamId) {
  const { data, error } = await supabase.rpc('get_team_roster', { p_team_id: teamId });
  if (error) throw error;
  return data ?? [];
}

export async function fetchTeamMembers(supabase, teamId) {
  const rows = await fetchRosterCombined(supabase, teamId);
  const members = rows
    .filter(r => r.status === 'member')
    .map(r => ({
      user_id: r.user_id,
      role: r.role, // 'captain' | 'editor' | 'player'
      email: r.email || null,
      full_name: r.full_name || null,
      display_name: r.display_name || null,
      avatar_url: r.avatar_url || null,
      pendingInvite: false,
      inviteOnly: false,
    }));

  members.sort((a, b) => {
    const byRole = String(a.role).localeCompare(String(b.role));
    if (byRole) return byRole;
    const an = (a.display_name || a.full_name || a.email || a.user_id || '').toLowerCase();
    const bn = (b.display_name || b.full_name || b.email || b.user_id || '').toLowerCase();
    return an.localeCompare(bn);
  });
  return members;
}

export async function fetchTeamInvites(supabase, teamId) {
  const rows = await fetchRosterCombined(supabase, teamId);
  return rows
    .filter(r => r.status === 'invited')
    .map(r => ({
      id: `invite:${r.email}`,
      team_id: teamId,
      email: r.email,
      role: r.role || null,
      status: 'pending',
      created_at: r.created_at || null,
    }));
}

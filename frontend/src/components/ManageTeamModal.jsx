import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import Toast from './Toast';
import supabase from '../supabaseClient';
import { TeamRoster } from './TeamRoster';
const ROLES = ['captain', 'editor', 'player'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const DEMO_TEAM_ID = 'e2e310d6-68b1-47cb-97e4-affd7e56e1a3';
const DEMO_CAPTAIN_ID = 'demo-uid-1';
const DEMO_MEMBERS = [
  { user_id: 'demo-uid-1', role: 'captain', name: 'Alex Captain', email: 'alex.captain@example.com' },
  { user_id: 'demo-uid-2', role: 'editor', name: 'Blair Editor', email: 'blair.editor@example.com' },
  { user_id: 'demo-uid-3', role: 'player', name: 'Casey Player', email: 'casey.player@example.com' },
  { user_id: 'demo-uid-4', role: 'player', name: 'Dana Player', email: 'dana.player@example.com' },
  { user_id: 'demo-uid-5', role: 'player', name: 'Evan Player', email: 'evan.player@example.com' },
  { user_id: 'demo-uid-6', role: 'player', name: 'Fran Player', email: 'fran.player@example.com' },
];
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}
const Avatar = ({ src, label, size = 28 }) => {
  const initial = (label?.trim()?.[0] || 'U').toUpperCase();
  const cls = size >= 32 ? 'w-8 h-8 text-sm' : 'w-7 h-7 text-xs';
  return src ? (
    <img
      src={src}
      alt={label || 'User'}
      className={`${cls} rounded-full object-cover shrink-0`}
      onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/default-avatar.png'; }}
    />
  ) : (
    <div className={`${cls} rounded-full bg-gray-300 text-gray-700 flex items-center justify-center font-semibold shrink-0`}>
      {initial}
    </div>
  );
};
export default function ManageTeamModal({
  isOpen,
  onClose,
  teamId,
  currentUserId,
  canManage = false,
  embedded = false,
}) {
  const {
    members: rosterMembers,
    invites: rosterInvites,
    refresh,
  } = TeamRoster(supabase, teamId);
  const submitInvites = () => {
    const typed = inviteQuery.trim();
    const payload = [...emailChips];
    if (EMAIL_RX.test(typed)) payload.push(typed.toLowerCase());
    if (payload.length === 0) return false;
    setInviteQuery('');
    setEmailChips([]);
    inviteMany(payload);
    return true;
  };

  const isDemoTeam = teamId === DEMO_TEAM_ID;
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('error');
  const [showToast, setShowToast] = useState(false);
  const setToast = (message, type = 'error') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
  };
  const [editingNameId, setEditingNameId] = useState(null);
  const [editingNameVal, setEditingNameVal] = useState('');
  const [confirmCaptain, setConfirmCaptain] = useState(null);
  const [busy, setBusy] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [demoMembers, setDemoMembers] = useState([]);
  const [inviteQuery, setInviteQuery] = useState('');
  const [emailChips, setEmailChips] = useState([]);
  const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
  const splitEmails = (s) =>
    (s || '')
      .split(/[\s,;\uFF0C]+/)
      .map(x => x.trim())
      .filter(Boolean);
  const addChip = (raw) => {
    const em = String(raw || '').toLowerCase().trim();
    if (!em || !EMAIL_RX.test(em)) return false;
    setEmailChips((prev) => (prev.includes(em) ? prev : [...prev, em]));
    return true;
  };
  const removeChip = (em) => setEmailChips(prev => prev.filter(x => x !== em));
  const [captainId, setCaptainId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [confirmDeleteTeam, setConfirmDeleteTeam] = useState(false);
  const handleDeleteTeam = async () => {
    if (!teamId) return;
    if (isDemoTeam) {
      setToast("You can't delete the Demo team.", 'error');
      setConfirmDeleteTeam(false);
      return;
    }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };
      const res = await fetch('/api/delete-team', {
        method: 'POST',
        headers,
        body: JSON.stringify({ teamId }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || 'Failed to delete team');
      }
      setToast('Team deleted', 'success');
      setConfirmDeleteTeam(false);
      onClose?.();
      window.location.reload();
    } catch (e) {
      setToast(e?.message || 'Failed to delete team');
    } finally {
      setBusy(false);
    }
  };
  const saveDisplayName = async (userId, value) => {
    if (!teamId || !userId) return;
    const trimmed = String(value || '').trim();
    setEditingNameId(null);
    if (!trimmed) return;
    if (isDemoTeam) {
      setDemoMembers(prev => prev.map(m => (m.user_id === userId ? { ...m, name: trimmed } : m)));
      setToast('Display name updated (demo)', 'success');
      return;
    }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };
      const res = await fetch('/api/set-display-name', {
        method: 'POST',
        headers,
        body: JSON.stringify({ teamId, userId, display_name: trimmed }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || 'Failed to update display name');
      }
      setToast('Display name updated', 'success');
      await refresh();
    } catch (e) {
      setToast(e?.message || 'Failed to update display name');
    } finally {
      setBusy(false);
    }
  };
  const cancelInvite = async (email) => {
    if (!teamId) return;
    if (isDemoTeam) {
      setDemoMembers(prev =>
        prev.filter(m => !(m.inviteOnly && (m.email || '').toLowerCase() === (email || '').toLowerCase()))
      );
      setToast('Invite canceled (demo)', 'success');
      return;
    }
    try {
      await supabase
        .from('team_invites')
        .delete()
        .eq('team_id', teamId)
        .eq('email', email);
      await refresh();
      setToast('Invite canceled', 'success');
    } catch (e) {
      setToast(e?.message || 'Failed to cancel invite');
    }
  };
  const updateInviteRole = async (email, role) => {
    if (!teamId) return;
    if (isDemoTeam) {
      setDemoMembers(prev =>
        prev.map(m => (m.inviteOnly && (m.email || '').toLowerCase() === (email || '').toLowerCase())
          ? { ...m, role }
          : m
        )
      );
      setToast('Invite role updated (demo)', 'success');
      return;
    }
    const prev = demoMembers;
    setDemoMembers(prev =>
      prev.map(m =>
        m.inviteOnly && (m.email || '').toLowerCase() === (email || '').toLowerCase()
          ? { ...m, role }
          : m
      )
    );
    const { error } = await supabase
      .from('team_invites')
      .update({ role })
      .eq('team_id', teamId)
      .eq('email', email)
      .select();
    if (error) {
      setDemoMembers(prev);
      setToast(error.message || 'Failed to update invite role');
      return;
    }
    await refresh();
    setToast('Invite role updated', 'success');
  };
  const fetchTeam = async () => {
    if (!teamId) return;
    if (isDemoTeam) {
      setTeamName('Demo');
      setCaptainId(DEMO_CAPTAIN_ID);
      setDemoMembers(DEMO_MEMBERS);
      return;
    }
    const { data, error } = await supabase
      .from('teams')
      .select('name, captain_id')
      .eq('id', teamId)
      .maybeSingle();
    if (!error && data) {
      setTeamName(data.name || '');
      setCaptainId(data.captain_id || null);
    } else if (error) {
      setToast(error.message || 'Failed to load team');
    }
  };
  const removeMember = async (userId) => {
    if (!teamId) return;
    if (isDemoTeam) {
      setDemoMembers(prev => prev.filter(m => m.user_id !== userId));
      setToast('Removed from team (demo)', 'success');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('user_id', userId);
      if (error) throw error;
      await refresh();
      setToast('Removed from team', 'success');
    } catch (e) {
      setToast(e?.message || 'Failed to remove member');
    } finally {
      setBusy(false);
    }
  };

  const getUserByEmail = async (email) => {
    if (isDemoTeam) return null;
    try {
      const headers = await getAuthHeaders();
      const url = `/api/search-users?q=${encodeURIComponent(email)}&team_id=${encodeURIComponent(teamId || '')}`;
      const res = await fetch(url, { headers });
      const json = await res.json().catch(() => ({ users: [] }));
      const lower = (email || '').toLowerCase();
      return (json.users || []).find(
        u => (u.email || '').toLowerCase() === lower && u.verified
      ) || null;
    } catch {
      return null;
    }
  };
  const searchActiveUsers = async (q) => {
    if (!q || q.trim().length < 2 || isDemoTeam) {
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    try {
      const headers = await getAuthHeaders();
      const url = `/api/search-users?q=${encodeURIComponent(q)}&team_id=${encodeURIComponent(teamId || '')}`;
      const res = await fetch(url, { headers });
      const json = await res.json().catch(() => ({ users: [] }));
      const out = (json.users || []).map(u => ({
        id: u.id,
        label: u.display_name || u.full_name || u.email || u.id,
        email: u.email,
        avatar: u.avatar_custom_url || u.user_metadata?.avatar_custom_url || u.avatar_url || u.user_metadata?.avatar_url || null,
      }));
      setSuggestions(out);
      setSelectedIdx(0);
      setSuggestOpen(true);
    } catch (e) {
      setSuggestions([]);
      setSuggestOpen(false);
      setToast('Search failed');
    }
  };
  const addExistingUserToTeam = async (userId) => {
    if (isDemoTeam) {
      const s = suggestions.find(x => x.id === userId);
      setDemoMembers(prev => {
        if (prev.some(m => m.user_id === userId)) return prev;
        return [...prev, {
          user_id: userId,
          role: 'player',
          email: s?.email || undefined,
          name: s?.label || undefined,
          avatar_url: s?.avatar || null,
        }];
      });
      setInviteQuery('');
      setSuggestions([]);
      setSuggestOpen(false);
      setToast('Added to team (demo)', 'success');
      return;
    }
    setBusy(true);
    try {
      const { data: existing } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!existing) {
        const { error } = await supabase.from('team_members').insert({
          team_id: teamId,
          user_id: userId,
          role: 'player',
        });
        if (error) throw error;
      }
      await refresh();
      setInviteQuery('');
      setSuggestions([]);
      setSuggestOpen(false);
    } catch (e) {
      setToast(e?.message || 'Failed to add user');
    } finally {
      setBusy(false);
    }
  };
  const inviteByEmail = async (email) => {
    if (isDemoTeam) {
      setDemoMembers(prev => {
        const lower = (email || '').toLowerCase();
        if (prev.some(m => (m.email || '').toLowerCase() === lower)) return prev;
        return [
          ...prev,
          {
            user_id: `invite:${email}`,
            role: 'player',
            email,
            name: null,
            pendingInvite: true,
            inviteOnly: true,
          }
        ];
      });
      if (typeof rosterInvites !== "undefined") {
        rosterInvites.push({ email, role: 'player' });
      }
      setToast('Invite created (demo)', 'success');
      return;
    }
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers = {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };
      const res = await fetch('/api/team-invites', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, teamId, role: 'player' }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || 'Failed to send invite');
      }
      setInviteQuery('');
      setSuggestions([]);
      setSuggestOpen(false);
      await refresh();
    } catch (e) {
      await refresh();
      setToast(e?.message || 'Failed to send invite');
    } finally {
      setBusy(false);
    }
  };
  const inviteMany = async (emailsOverride) => {
    const list = (emailsOverride ?? emailChips)
      .map(e => (e || '').toLowerCase().trim())
      .filter(Boolean);
    if (list.length === 0) return;
    if (isDemoTeam) {
      setDemoMembers(prev => {
        const existing = new Set(prev.map(m => (m.email || '').toLowerCase()).filter(Boolean));
        const adds = list
          .filter(e => EMAIL_RX.test(e) && !existing.has(e))
          .map(email => ({
            user_id: `invite:${email}`,
            role: 'player',
            email,
            name: null,
            pendingInvite: true,
            inviteOnly: true,
          }));
        if (adds.length === 0) return prev;
        return [...prev, ...adds];
      });
      setToast('Invite created (demo)', 'success');
      return;
    }
    setBusy(true);
    let invited = 0, added = 0, dupes = 0, invalid = 0, errors = 0;
    const existingEmails = new Set(
      (isDemoTeam ? demoMembers : (rosterMembers ?? []))
        .map(m => (m.email || '').toLowerCase())
        .filter(Boolean)
    );
    try {
      for (const email of list) {
        if (!EMAIL_RX.test(email)) { invalid++; continue; }
        if (existingEmails.has(email)) { dupes++; continue; }
        try {
          const match = await getUserByEmail(email);
          if (match) {
            let becameMember = false;
            try {
              await addExistingUserToTeam(match.id);
              const { data: check } = await supabase
                .from('team_members')
                .select('user_id')
                .eq('team_id', teamId)
                .eq('user_id', match.id)
                .maybeSingle();
              becameMember = !!check;
            } catch { /* ignore; we’ll fallback */ }
            if (becameMember) {
              added++;
            } else {
              await inviteByEmail(email);
              invited++;
            }
          } else {
            await inviteByEmail(email);
            invited++;
          }
        } catch {
          errors++;
        }
      }
      await refresh();
      setEmailChips([]);
      setInviteQuery('');
      const parts = [];
      if (invited > 0) parts.push(`Invites sent: ${invited}`);
      if (added > 0) parts.push(`Added to team: ${added}`);
      const any = invited > 0 || added > 0;
      setToast(any ? parts.join(' • ') : 'No invites sent.', any ? 'success' : 'error');
    } finally {
      setBusy(false);
    }
  };
  const updateRole = async (userId, role) => {
    if (userId === captainId && role !== 'captain') {
      setToast('Promote another member to Captain to change this.', 'error');
      return;
    }
    if (isDemoTeam) {
      if (role === 'captain' && userId !== captainId) {
        setDemoMembers(prev =>
          prev.map(m =>
            m.user_id === userId
              ? { ...m, role: 'captain' }
              : (m.user_id === captainId ? { ...m, role: 'editor' } : m)
          )
        );
        setCaptainId(userId);
        setToast('Captain transferred (demo)', 'success');
        return;
      }
      setDemoMembers(prev => prev.map(m => (m.user_id === userId ? { ...m, role } : m)));
      setToast('Role updated (demo)', 'success');
      return;
    }
    try {
      if (role === 'captain' && userId !== captainId) {
        const { error } = await supabase.rpc('transfer_team_captain', {
          p_team_id: teamId,
          p_new_captain: userId,
        });
        if (error) throw error;
        await Promise.all([fetchTeam(), refresh()]);
        setToast('Captain transferred', 'success');
        return;
      }
      const { error } = await supabase
        .from('team_members')
        .update({ role })
        .eq('team_id', teamId)
        .eq('user_id', userId);
      if (error) throw error;
      await refresh();
      setToast('Role updated', 'success');
    } catch (e) {
      setToast(e?.message || 'Failed to update role');
    }
  };
  const saveTeamName = async () => {
    setSavingName(true);
    try {
      if (isDemoTeam) return;
      const { error } = await supabase.from('teams').update({ name: teamName }).eq('id', teamId);
      if (error) throw error;
      setToast('Team name saved', 'success');
    } catch (e) {
      setToast(e?.message || 'Failed to save team name');
    } finally {
      setSavingName(false);
    }
  };
  const actuallyOpen = embedded ? true : isOpen; // NEW
  useEffect(() => {
    if (!actuallyOpen) return;
    setInviteQuery('');
    setSuggestions([]);
    setSuggestOpen(false);
    fetchTeam();
    refresh();
    if (isDemoTeam) {
      setDemoMembers(DEMO_MEMBERS);
    }
  }, [actuallyOpen, teamId, isDemoTeam, refresh]);
  useEffect(() => {
    const t = setTimeout(() => searchActiveUsers(inviteQuery), 250);
    return () => clearTimeout(t);
  }, [inviteQuery]);
  const baseMembers = useMemo(() => {
    if (isDemoTeam) return demoMembers;
    const rows = rosterMembers ?? [];
    return rows.map(m => {
      const preferredName =
        m.display_name ||
        m.full_name ||
        null;
      return {
        ...m,
        name: preferredName,
      };
    });
  }, [isDemoTeam, demoMembers, rosterMembers]);
  const visibleMembers = useMemo(() => {
    const pendingEmails = new Set([
      ...(rosterInvites ?? []).map(i => (i.email || '').toLowerCase()),
      ...(isDemoTeam ? demoMembers.filter(m => m.inviteOnly).map(m => (m.email || '').toLowerCase()) : [])
    ].filter(Boolean));
    const list = baseMembers.map(m => {
      const email = (m.email || '').toLowerCase();
      return {
        ...m,
        pendingInvite: email && pendingEmails.has(email),
      };
    });
    const memberEmails = new Set(list.map(m => (m.email || '').toLowerCase()).filter(Boolean));
    const inviteOnly = [
      ...(rosterInvites ?? []),
      ...(isDemoTeam ? demoMembers.filter(m => m.inviteOnly) : [])
    ]
      .filter(i => !memberEmails.has((i.email || '').toLowerCase()))
      .map(i => ({
        user_id: `invite:${i.email}`,
        role: i.role || 'player',
        email: i.email,
        name: null,
        pendingInvite: true,
        inviteOnly: true,
      }));

    const full = [...list, ...inviteOnly];
    return canManage ? full : full.filter(m => !m.inviteOnly);
  }, [baseMembers, rosterInvites, canManage, isDemoTeam, demoMembers]);
  const typedIsValid = EMAIL_RX.test(inviteQuery.trim());
  const hasAnythingToSend = emailChips.length > 0 || typedIsValid;
  const body = (
    <>
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">{canManage ? 'Manage Team' : 'My Team'}</h2>
        <p className="text-sm text-gray-600">    {canManage ? 'Invite players, rename your team, and set member roles.' : 'View your team roster and roles.'}</p>
      </div>
      {/* Team name */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Team name</label>
        {canManage ? (
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-md px-3 py-2"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Team name"
            />
            <button
              onClick={saveTeamName}
              disabled={!teamName || savingName}
              className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
            >
              Save
            </button>
          </div>
        ) : (
          <div className="px-3 py-2 border rounded-md bg-gray-50 text-gray-700">
            {teamName || '—'}
          </div>
        )}
      </div>
      {/* Invite */}
      {canManage && (
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Invite player</label>
          <div className="relative">
            {/* Chips + input */}
            <div className="w-full border rounded-md px-2 py-2 flex flex-wrap gap-2">
              {emailChips.map((em) => (
                <span key={em} className="inline-flex items-center gap-1 text-xs bg-gray-100 rounded-full px-2 py-1">
                  {em}
                  <button
                    className="hover:text-gray-700"
                    onClick={() => removeChip(em)}
                    aria-label={`Remove ${em}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                className="flex-1 min-w-[8rem] outline-none px-1"
                value={inviteQuery}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/[,\uFF0C;\s]/.test(v)) {
                    const tokens = v.split(/[,;\uFF0C\s]+/);
                    const partial = tokens[tokens.length - 1] ?? '';
                    let any = false;
                    tokens.slice(0, -1).forEach(t => { any = addChip(t) || any; });
                    setInviteQuery(partial);
                  } else {
                    setInviteQuery(v);
                  }
                }}
                placeholder={emailChips.length ? 'Add another…' : 'Type a name for suggestions, or paste emails…'}
                onFocus={() => inviteQuery && setSuggestOpen(true)}
                onBlur={() => {
                  const typed = inviteQuery.trim();
                  if (EMAIL_RX.test(typed)) addChip(typed);
                  setInviteQuery('');
                  setTimeout(() => setSuggestOpen(false), 120);
                }}
                onPaste={(e) => {
                  const pasted = e.clipboardData?.getData('text') || '';
                  const parts = splitEmails(pasted);
                  if (parts.length > 1) {
                    e.preventDefault();
                    let any = false;
                    parts.forEach(p => { any = addChip(p) || any; });
                    if (!any) setToast('No valid emails found in paste');
                    setInviteQuery('');
                  }
                }}
                onKeyDown={(e) => {
                  const { key } = e;
                  if (key === 'Enter' && !inviteQuery.trim() && emailChips.length > 0) {
                    e.preventDefault();
                    submitInvites();
                    return;
                  }
                  if (
                    key === 'Enter' &&
                    inviteQuery.trim() &&
                    EMAIL_RX.test(inviteQuery.trim()) &&
                    emailChips.length === 0
                  ) {
                    e.preventDefault();
                    submitInvites();
                    return;
                  }
                  if ((key === 'Enter' || key === 'Tab' || key === ',' || key === ';' || key === ' ') && inviteQuery.trim()) {
                    const ok = addChip(inviteQuery.trim());
                    if (ok) {
                      e.preventDefault();
                      setInviteQuery('');
                      return;
                    }
                  }
                  if (!suggestOpen || suggestions.length === 0) return;
                  if (key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1));
                  } else if (key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIdx(i => Math.max(i - 1, 0));
                  } else if (key === 'Enter') {
                    const pick = suggestions.length === 1 ? suggestions[0] : suggestions[selectedIdx];
                    if (pick) {
                      e.preventDefault();
                      addExistingUserToTeam(pick.id);
                    }
                  }
                }}

              />
            </div>
            {suggestOpen && suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border rounded-md overflow-hidden shadow">
                {suggestions.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => addExistingUserToTeam(s.id)}
                    onMouseEnter={() => setSelectedIdx(i)}
                    className={`w-full flex items-center gap-3 px-3 py-2 transition-colors cursor-pointer
                      ${i === selectedIdx ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                  >
                    <Avatar src={s.avatar} label={s.label || s.email} />
                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      <div className="text-sm text-gray-900 truncate" title={s.label || s.email}>
                        {s.label || s.email}
                      </div>
                      {s.email && (
                        <div className="ml-auto text-xs text-gray-600 truncate" title={s.email}>
                          {s.email}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3">
            <button
              onClick={() => {
                const typed = inviteQuery.trim();
                const payload = [...emailChips];
                if (EMAIL_RX.test(typed)) payload.push(typed.toLowerCase());
                if (payload.length === 0) return;
                setInviteQuery('');
                setEmailChips([]);
                inviteMany(payload);
              }}
              disabled={!hasAnythingToSend || busy}
              className="px-4 py-2 bg-black text-white rounded-md disabled:cursor-default disabled:opacity-50 disabled:hover:bg-black hover:bg-gray-800 cursor-pointer"
            >
              Invite {emailChips.length > 0 ? `(${emailChips.length})` : ''}
            </button>
            <div className="flex-1 flex justify-center">
              <p className="text-center text-xs text-gray-500 leading-snug">
                Suggestions show people you already share a team with.<br />
                New players are immediately given the <b>Player</b> role.
              </p>
            </div>
          </div>
        </div>
      )
      }
      {/* Members & roles */}
      <div className="mt-6">
        <div className="font-medium text-gray-700  mx-auto text-center">Team members</div>
        <p className="text-center text-xs text-gray-500 leading-snug mb-2">
          Emails are only ever visible to Team Members.
        </p>
        <div className={`divide-y border rounded-md` +
          (embedded ? '' : ' max-h-72 overflow-y-auto')}
        >
          {visibleMembers.length === 0 && (
            <div className="p-3 text-sm text-gray-500">No members yet.</div>
          )}
          {visibleMembers.map(m => (
            <div key={m.user_id} className="flex items-center justify-between px-3 py-2">
              <div className="min-w-0 flex items-center gap-3">
                <Avatar src={m.avatar_custom_url || m.avatar_url} label={m.name || m.email || m.user_id} />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {canManage && !m.inviteOnly ? (
                      editingNameId === m.user_id ? (
                        <input
                          className="border rounded px-2 py-1 text-sm w-56"
                          value={editingNameVal}
                          onChange={(e) => setEditingNameVal(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveDisplayName(m.user_id, editingNameVal);
                            if (e.key === 'Escape') setEditingNameId(null);
                          }}
                          onBlur={() => saveDisplayName(m.user_id, editingNameVal)}
                        />
                      ) : (
                        <button
                          type="button"
                          className="truncate hover:underline text-left"
                          title="Click to edit display name"
                          onClick={() => {
                            setEditingNameId(m.user_id);
                            setEditingNameVal(m.name || '');
                          }}
                        >
                          {m.name || m.email || m.user_id}
                        </button>
                      )
                    ) : (
                      <span className="truncate">{m.name || m.email || m.user_id}</span>
                    )}
                  </div>
                  {m.email && (
                    <div className="text-xs text-gray-500 truncate">{m.email}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(m.inviteOnly || m.pendingInvite) && (
                  <span className="px-2 py-0.5 text-[11px] rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200" >
                    Pending
                  </span>
                )}
                {canManage ? (
                  <>
                    {(() => {
                      const isCaptainRow = m.user_id === captainId;
                      return (
                        <select
                          className={`border rounded-md px-2 py-1 text-sm bg-white transition-colors w-22
                            ${isCaptainRow ? 'opacity-60' : 'hover:bg-gray-50 cursor-pointer'}`}
                          value={m.role}
                          disabled={isCaptainRow}
                          title={isCaptainRow ? 'To change Captain, promote another member.' : undefined}
                          onChange={(e) => {
                            const nextRole = e.target.value;
                            if (m.inviteOnly) return updateInviteRole(m.email, nextRole);
                            if (isCaptainRow && nextRole !== 'captain') {
                              setToast('Promote another member to Captain to change this.', 'error');
                              return;
                            }
                            if (nextRole === 'captain' && m.user_id !== captainId) {
                              setConfirmCaptain({
                                userId: m.user_id,
                                label: m.name || m.email || m.user_id,
                              });
                              return;
                            }
                            updateRole(m.user_id, nextRole);
                          }}
                        >
                          {(m.inviteOnly ? ROLES.filter(r => r !== 'captain') : ROLES).map(r => (
                            <option key={r} value={r}>{cap(r)}</option>
                          ))}
                        </select>
                      );
                    })()}
                    <button
                      onClick={() =>
                        m.pendingInvite ? cancelInvite(m.email) : removeMember(m.user_id)
                      }
                      disabled={!m.pendingInvite && m.user_id === captainId}
                      className={`w-6 h-6 flex items-center justify-center rounded-md ${(!m.pendingInvite && m.user_id === captainId)
                        ? ''
                        : 'cursor-pointer hover:bg-gray-100'
                        } disabled:opacity-40`}
                      title={
                        m.pendingInvite
                          ? 'Cancel invite'
                          : (m.user_id === captainId ? 'Captain cannot be removed' : 'Remove from team')
                      }
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <span className="px-2 py-1 text-xs rounded-md border bg-gray-50 text-gray-700 text-center">
                    {cap(m.role)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Danger zone: delete team */}
      {canManage && currentUserId === captainId && !isDemoTeam && (
        <div className="mt-8 pt-4 border-t flex items-center justify-between">
          <div>
            <div className="font-medium text-gray-700">Delete team</div>
            <div className="text-xs text-gray-500">
              Permanently removes the team and all of its data.<br />This cannot be undone.
            </div>
          </div>
          <button
            onClick={() => setConfirmDeleteTeam(true)}
            className="px-4 py-2 rounded-full border border-red-500 text-red-600 hover:bg-red-50 cursor-pointer"
            type="button"
          >
            Delete
          </button>
        </div>
      )}
      <div className="mt-6 flex justify-end">
        <button onClick={onClose} className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 cursor-pointer">
          Done
        </button>
      </div>
      {confirmCaptain && (
        <Modal isOpen onClose={() => setConfirmCaptain(null)}>
          <div className="text-left">
            <h3 className="text-lg font-semibold mb-2">Make {confirmCaptain.label} Captain?</h3>
            <p className="text-sm text-gray-600">
              This will transfer the Captain role to <b>{confirmCaptain.label}</b>.
              You’ll be downgraded to <b>Editor</b> and won’t be able to make yourself Captain again.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setConfirmCaptain(null)}
                className="px-4 py-2 rounded-md border hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await updateRole(confirmCaptain.userId, 'captain');
                  setConfirmCaptain(null);
                }}
                className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 cursor-pointer"
              >
                Yes, transfer Captain
              </button>
            </div>
          </div>
        </Modal>
      )}
      {confirmDeleteTeam && (
        <Modal isOpen onClose={() => setConfirmDeleteTeam(false)}>
          <div className="text-left">
            <h3 className="text-lg font-semibold mb-2">Delete team?</h3>
            <p className="text-sm text-gray-600">
              This will permanently delete <b>{teamName || 'this team'}</b> and all stats, games, and invites.
              This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteTeam(false)}
                className="px-4 py-2 rounded-md border hover:bg-gray-50 cursor-pointer"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteTeam}
                className="px-4 py-2 rounded-md border border-red-500 text-red-600 hover:bg-red-50 cursor-pointer"
                type="button"
              >
                Delete team
              </button>
            </div>
          </div>
        </Modal>
      )}
      <Toast
        message={toastMessage}
        show={showToast}
        onClose={() => setShowToast(false)}
        type={toastType}
      />
    </>
  );
  if (embedded) {
    return (
      <div className="max-w-2xl pr-2">
        {body}
      </div>
    );
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {body}
    </Modal>
  );
}
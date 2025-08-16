import React, { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import supabase from '../supabaseClient';

const ROLES = ['captain', 'editor', 'player'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const DEMO_TEAM_ID = 'e2e310d6-68b1-47cb-97e4-affd7e56e1a3';
const DEMO_CAPTAIN_ID = 'demo-uid-1';
const DEMO_MEMBERS = [
  { user_id: 'demo-uid-1', role: 'captain', name: 'Alex Captain',  email: 'alex.captain@example.com' },
  { user_id: 'demo-uid-2', role: 'editor',  name: 'Blair Editor',   email: 'blair.editor@example.com' },
  { user_id: 'demo-uid-3', role: 'player',  name: 'Casey Player',   email: 'casey.player@example.com' },
  { user_id: 'demo-uid-4', role: 'player',  name: 'Dana Player',    email: 'dana.player@example.com' },
  { user_id: 'demo-uid-5', role: 'player',  name: 'Evan Player',    email: 'evan.player@example.com' },
  { user_id: 'demo-uid-6', role: 'player',  name: 'Fran Player',    email: 'fran.player@example.com' },
];
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { Authorization: `Bearer ${session.access_token}` } : {};
}
export default function ManageTeamModal({
  isOpen,
  onClose,
  teamId,
  currentUserId,
}) {
  const isDemoTeam = teamId === DEMO_TEAM_ID;
  const [loading, setLoading] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [members, setMembers] = useState([]);
  const [inviteQuery, setInviteQuery] = useState('');
  const [captainId, setCaptainId] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const fetchTeam = async () => {
    if (!teamId) return;
    if (isDemoTeam) {
      setTeamName('Demo');
      setCaptainId(DEMO_CAPTAIN_ID);
      setMembers(DEMO_MEMBERS);
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
    }
  };
  const removeMember = async (userId) => {
    if (!teamId) return;
    if (isDemoTeam) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('user_id', userId);
      if (error) throw error;
      await fetchMembers();
    } finally {
      setLoading(false);
    }
  };
  const fetchMembers = async () => {
    if (!teamId) return;
    if (isDemoTeam) {
      setMembers(DEMO_MEMBERS);
      return;
    }    
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/team-members?team_id=${encodeURIComponent(teamId)}`, { headers });
    const json = await res.json().catch(() => ({ members: [] }));
    const list = (json.members || []).map(m => ({
      user_id: m.user_id,
      role: m.role,
      email: m.email || undefined,
      name: m.full_name || m.display_name || undefined,
    }));
    setMembers(list);
  };

  const searchActiveUsers = async (q) => {
    if (!q || q.trim().length < 2) { setSuggestions([]); setSuggestOpen(false); return; }
    if (isDemoTeam) { setSuggestions([]); setSuggestOpen(false); return; }
    try {
      const headers = await getAuthHeaders();
      const url = `/api/search-users?q=${encodeURIComponent(q)}&team_id=${encodeURIComponent(teamId || '')}`;
      const res = await fetch(url, { headers });
      const json = await res.json().catch(() => ({ users: [] }));
      const out = (json.users || []).map(u => ({
        id: u.id,
        label: u.full_name || u.display_name || u.email || u.id,
        email: u.email,
      }));
      setSuggestions(out);
      setSuggestOpen(true);
    } catch {
      setSuggestions([]);
      setSuggestOpen(false);
    }
  };

  const addExistingUserToTeam = async (userId) => {
    if (isDemoTeam) return;
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!existing) {
        await supabase.from('team_members').insert({
          team_id: teamId,
          user_id: userId,
          role: 'player',
        });
      }
      await fetchMembers();
      setInviteQuery('');
      setSuggestions([]);
      setSuggestOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const inviteByEmail = async (email) => {
    if (isDemoTeam) return;
    setLoading(true);
    try {
      const token = crypto.randomUUID();
      await supabase.from('team_invites').insert({
        team_id: teamId,
        email,
        invited_by: currentUserId,
        role: 'player',
        token,
      });
      setInviteQuery('');
      setSuggestions([]);
      setSuggestOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const updateRole = async (userId, role) => {
    if (isDemoTeam) {
      setMembers(members.map(m => (m.user_id === userId ? { ...m, role } : m)));
      return;
    }
    await supabase
      .from('team_members')
      .update({ role })
      .eq('team_id', teamId)
      .eq('user_id', userId);
    setMembers(members.map(m => (m.user_id === userId ? { ...m, role } : m)));
  };

  const saveTeamName = async () => {
    setSavingName(true);
    try {
      if (isDemoTeam) return;
      await supabase.from('teams').update({ name: teamName }).eq('id', teamId);
    } finally {
      setSavingName(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setInviteQuery('');
    setSuggestions([]);
    setSuggestOpen(false);
    fetchTeam();
    fetchMembers();
  }, [isOpen, teamId]);

  useEffect(() => {
    const t = setTimeout(() => searchActiveUsers(inviteQuery), 250);
    return () => clearTimeout(t);
  }, [inviteQuery]);

  const isEmail = useMemo(
    () => /\S+@\S+\.\S+/.test(inviteQuery.trim()),
    [inviteQuery]
  );

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Manage Team</h2>
        <p className="text-sm text-gray-600">Invite players, rename your team, and set member roles.</p>
      </div>

      {/* Rename team */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Team name</label>
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
            className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      {/* Invite */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Invite player (name or email)</label>
        <div className="relative">
          <input
            className="w-full border rounded-md px-3 py-2"
            value={inviteQuery}
            onChange={(e) => setInviteQuery(e.target.value)}
            placeholder="Start typing…"
            onFocus={() => inviteQuery && setSuggestOpen(true)}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
          />
          {suggestOpen && suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow">
              {suggestions.map(s => (
                <button
                  key={s.id}
                  onClick={() => addExistingUserToTeam(s.id)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100"
                >
                  <div className="text-sm">{s.label}</div>
                  {s.email && <div className="text-xs text-gray-500">{s.email}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => inviteQuery && (isEmail ? inviteByEmail(inviteQuery.trim()) : null)}
            disabled={!isEmail || loading}
            className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
          >
            Invite by email
          </button>
          <span className="text-xs text-gray-500 self-center">
            Selecting a suggestion adds them immediately as <b>Player</b>.
          </span>
        </div>
      </div>

      {/* Members & roles */}
      <div className="mt-6">
        <div className="text-sm font-medium text-gray-700 mb-2">Team members</div>
        <div className="divide-y border rounded-md max-h-72 overflow-y-auto">
          {members.length === 0 && (
            <div className="p-3 text-sm text-gray-500">No members yet.</div>
          )}
          {members.map(m => (
            <div key={m.user_id} className="flex items-center justify-between px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{m.name || m.email || m.user_id}</div>
                {m.email && <div className="text-xs text-gray-500 truncate">{m.email}</div>}
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="border rounded-md px-2 py-1 text-sm"
                  value={m.role}
                  onChange={(e) => updateRole(m.user_id, e.target.value)}
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{cap(r)}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeMember(m.user_id)}
                  disabled={m.user_id === captainId}
                  className={`w-6 h-6 flex items-center justify-center rounded-md ${
                    m.user_id === captainId ? '' : 'hover:bg-gray-100'
                  } disabled:opacity-40`}
                  title={m.user_id === captainId ? 'Captain cannot be removed' : 'Remove from team'}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={onClose} className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800">
          Done
        </button>
      </div>
    </Modal>
  );
}

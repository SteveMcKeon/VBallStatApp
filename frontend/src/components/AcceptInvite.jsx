import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import supabase from '../supabaseClient';
import FloatingLabelInput from './FloatingLabelInput';
import Toast from './Toast';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

const Center = ({ children, max = 'max-w-sm' }) => (
  <div className="min-h-screen w-full flex items-center justify-center px-4">
    <div className={`w-full ${max}`}>{children}</div>
  </div>
);

export default function AcceptInvite() {
  const q = useQuery();
  const navigate = useNavigate();
  const inviteToken = q.get('token');
  const teamId      = q.get('team');
  const confirmUrl  = q.get('confirmation_url');

  const [status, setStatus] = useState('working');
  const [err, setErr] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [teamName, setTeamName] = useState('');

  // Toast state (match Login/Register API)
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');
  const [showToast, setShowToast] = useState(false);
  const showToastMsg = (message, type = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
  };
  const persistTeamToLocal = (tid, tname) => {
    if (!tid) return;
    try {
      localStorage.setItem('teamId', tid);
      if (tname) localStorage.setItem('teamName', tname);
      localStorage.removeItem('selectedGameId');
      localStorage.removeItem('videoTime');
    } catch { /* ignore */ }
  };
  async function loadTeamName({ teamIdArg /*, tokenArg*/ }) {
    try {
      let tid = teamIdArg;
      if (!tid) return;
      const { data: team } = await supabase
        .from('teams')
        .select('name')
        .eq('id', tid)
        .maybeSingle();
      if (team?.name) setTeamName(team.name);
    } catch {/* ignore */}
  }

  useEffect(() => {
    (async () => {
      setStatus('working');
      setErr('');
      loadTeamName({ teamIdArg: teamId, tokenArg: inviteToken });

      // Ensure we have a session (verify invite confirmation link when needed)
      let { data: { session } } = await supabase.auth.getSession();
      if (!session && confirmUrl) {
        try {
          const u = new URL(confirmUrl);
          const token_hash = u.searchParams.get('token');
          const type = u.searchParams.get('type') || 'invite';
          if (token_hash) {
            const { error } = await supabase.auth.verifyOtp({ token_hash, type });
            if (error) {
              setErr(error.message || 'Invalid or expired token');
              setStatus('need-auth');
              showToastMsg(error.message || 'Invalid or expired token', 'error');
              return;
            }
            ({ data: { session } } = await supabase.auth.getSession());
            showToastMsg('Authenticated. Finishing invite…', 'success');
          }
        } catch (e) {
          setErr('Missing or invalid authentication token');
          setStatus('need-auth');
          showToastMsg('Missing or invalid authentication token', 'error');
          return;
        }
      }

      if (!session) {
        setErr('Missing or invalid authentication token');
        setStatus('need-auth');
        showToastMsg('Missing or invalid authentication token', 'error');
        return;
      }

      // Try accepting invite (non-fatal if already accepted)
      if (inviteToken) {
        const { error } = await supabase.rpc('accept_invite', { p_token: inviteToken });
        if (error) {
          // Often means already accepted / invalid; surface softly.
          showToastMsg(error.message || 'Could not accept invite (maybe already used).', 'error');
        } else {
          showToastMsg('Invite accepted. Welcome!', 'success');
          persistTeamToLocal(teamId, teamName);
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      const hasName = !!(
        user?.user_metadata?.display_name ||
        user?.user_metadata?.full_name ||
        user?.user_metadata?.name
      );

      if (!hasName) {
        setStatus('profile');
      } else {
        persistTeamToLocal(teamId, teamName);
        setStatus('done');
        showToastMsg('All set! Redirecting…', 'success');
        navigate('/');
      }
    })();
  }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const trimmedName = displayName.trim();
      if (password && password.length < 6) {
        const msg = 'Password must be at least 6 characters';
        setErr(msg);
        showToastMsg(msg, 'error');
        return;
      }
      const updates = { data: {} };
      if (trimmedName) updates.data.display_name = trimmedName;
      if (password) updates.password = password;
      const { error } = await supabase.auth.updateUser(updates);
      if (error) throw error;
      persistTeamToLocal(teamId, teamName);
      showToastMsg('Profile updated. Welcome!', 'success');
      setStatus('done');
      navigate('/');
    } catch (e) {
      const msg = e.message || 'Failed to save profile';
      setErr(msg);
      showToastMsg(msg, 'error');
    }
  };

  if (status === 'working') {
    return (
      <>
        <Center>
          <div className="text-center">
            <img src="/android-chrome-512x512.png" alt="Logo" className="w-16 h-16 mx-auto mb-4 animate-bounce" />
            <h2 className="text-xl font-semibold mb-2">Finishing your invite…</h2>
            <p className="text-gray-500 text-sm">Just a moment</p>
          </div>
        </Center>
        <Toast
          message={toastMessage}
          show={showToast}
          onClose={() => setShowToast(false)}
          type={toastType}
        />
      </>
    );
  }

  if (status === 'need-auth') {
    return (
      <>
        <Center>
          <div className="text-center">
            <h2 className="text-2xl font-semibold mb-2">Authentication needed</h2>
            <p className="text-gray-600 mb-6">
              This invite link may have expired, was already used, or is incomplete.
            </p>
            {confirmUrl ? (
              <a
                href={confirmUrl}
                className="inline-block w-full py-3 bg-black text-white rounded-full font-semibold hover:bg-gray-600 transition-colors"
              >
                Open invite link again
              </a>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="w-full py-3 bg-black text-white rounded-full font-semibold hover:bg-gray-600 transition-colors"
              >
                Go to Login
              </button>
            )}
          </div>
        </Center>
        <Toast
          message={toastMessage}
          show={showToast}
          onClose={() => setShowToast(false)}
          type={toastType}
        />
      </>
    );
  }

  if (status === 'profile') {
    return (
      <>
        <Center>
          <div>
            <img src="/android-chrome-512x512.png" alt="Logo" className="w-16 h-16 mx-auto mb-4 animate-bounce" />
            <h2 className="text-2xl font-semibold text-center mb-2">Set up your account</h2>
            {teamName && (
              <p className="text-sm text-gray-500 mb-6 text-center">Team: {teamName}</p>
            )}
            <form onSubmit={saveProfile} className="space-y-4">
              <FloatingLabelInput
                label="Display Name"
                id="displayName"
                name="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <FloatingLabelInput
                label="New Password"
                id="password"
                name="password"
                type="password"
                value={password}
                isError={!!err}
                onChange={(e) => setPassword(e.target.value)}
              />
              {err && (
                <div className="flex items-center text-sm text-red-500 mt-1 ml-4">
                  <span className="mr-1">❗</span> {err}
                </div>
              )}
              <button
                type="submit"
                className="w-full py-3 bg-black text-white rounded-full font-semibold hover:bg-gray-600 transition-colors"
              >
                Save & Continue
              </button>
            </form>
          </div>
        </Center>
        <Toast
          message={toastMessage}
          show={showToast}
          onClose={() => setShowToast(false)}
          type={toastType}
        />
      </>
    );
  }

  return (
    <>
      <Center>
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">You’re all set 🎉</h2>
          <p className="text-gray-600">Redirecting…</p>
        </div>
      </Center>
      <Toast
        message={toastMessage}
        show={showToast}
        onClose={() => setShowToast(false)}
        type={toastType}
      />
    </>
  );
}

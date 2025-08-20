import { useEffect } from 'react';
export function useSupabaseAuthWatcher({ supabase, onSignOut, refreshLeeway = 120 }) {
  useEffect(() => {
    if (!supabase) return;
    if (typeof onSignOut !== 'function') return;
    let refreshTimerId = null;
    const clearTimer = () => {
      if (refreshTimerId) clearTimeout(refreshTimerId);
      refreshTimerId = null;
    };
    const scheduleRefresh = (session) => {
      clearTimer();
      const exp = session?.expires_at;
      if (!exp) return;
      const now = Math.floor(Date.now() / 1000);
      const secondsUntilRefresh = Math.max(5, exp - now - refreshLeeway);
      refreshTimerId = setTimeout(async () => {
        try {
          const { data, error } = await supabase.auth.refreshSession();
          if (error || !data?.session) {
            await supabase.auth.signOut();
            onSignOut();
            return;
          }
          scheduleRefresh(data.session);
        } catch (e) {
          try { await supabase.auth.signOut(); } catch(_) {}
          onSignOut();
        }
      }, secondsUntilRefresh * 1000);
    };
    const primeFromCurrentSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        onSignOut();
        return;
      }
      scheduleRefresh(session);
    };
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!newSession) {
        clearTimer();
        onSignOut();
        return;
      }
      scheduleRefresh(newSession);
    });
    const onWake = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { onSignOut(); return; }
      const now = Math.floor(Date.now() / 1000);
      if ((session.expires_at ?? 0) - now < refreshLeeway) {
        try {
          const { data, error } = await supabase.auth.refreshSession();
          if (error || !data?.session) {
            await supabase.auth.signOut();
            onSignOut();
            return;
          }
          scheduleRefresh(data.session);
        } catch (e) {
          try { await supabase.auth.signOut(); } catch(_) {}
          onSignOut();
        }
      }
    };
    const handleFocus = () => { onWake(); };
    const handleVisibility = () => { if (!document.hidden) onWake(); };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    primeFromCurrentSession();
    return () => {
      clearTimer();
      subscription?.subscription?.unsubscribe?.();
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [supabase, onSignOut, refreshLeeway]);
}

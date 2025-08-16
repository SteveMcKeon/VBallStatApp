import { useEffect, useState, useRef } from 'react';
import supabase from '../supabaseClient';
import Toast from './Toast';

const SidebarFooter = ({ mini = false, teamId }) => {
  const [user, setUser] = useState(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const popupRef = useRef(null);
  const [showToast, setShowToast] = useState(false);
  const getAvatarFromCacheOrFetch = async (userId, remoteUrl) => {
    try {
      const key = `avatar:${userId}`;
      const cached = localStorage.getItem(key);
      if (cached) {
        const { src, url } = JSON.parse(cached);
        if (src && url === remoteUrl) return src;
      }
      if (!remoteUrl) return null;
      const resp = await fetch(remoteUrl, { mode: 'cors', cache: 'force-cache' });
      const blob = await resp.blob();
      if (blob.size > 0) {
        const dataUrl = await new Promise((resolve) => {
          const fr = new FileReader();
          fr.onloadend = () => resolve(fr.result);
          fr.readAsDataURL(blob);
        });
        localStorage.setItem(key, JSON.stringify({ src: dataUrl, url: remoteUrl, ts: Date.now() }));
        return dataUrl;
      }
    } catch (e) {
      console.warn('Avatar cache fetch failed:', e);
    }
    return remoteUrl ?? null;
  };

  const handleCopyUserId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await navigator.clipboard.writeText(user.id);
      setShowToast(true);
    }
  };

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { user: sessUser } } = await supabase.auth.getUser();
      if (!sessUser) return;
      let teamRole = null;
      if (teamId) {
        const { data: tm, error: tmErr } = await supabase
          .from('team_members')
          .select('role')
          .eq('user_id', sessUser.id)
          .eq('team_id', teamId)
          .maybeSingle();
        if (!tmErr) teamRole = tm?.role ?? null; // 'captain' | 'editor' | 'player' | 'viewer' | null
      }
      const avatarUrl = await getAvatarFromCacheOrFetch(
        sessUser.id,
        sessUser.user_metadata?.avatar_url
      );

      setUser({
        id: sessUser.id,
        email: sessUser.email,
        name: sessUser.user_metadata?.full_name || sessUser.email,
        avatarUrl,
        role: teamRole || 'viewer',
      });
    };
    fetchUserData();
  }, [teamId]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setIsPopupOpen(false);
      }
    };
    if (isPopupOpen) window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isPopupOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <div className="relative">
      {!mini && (
        <div className="text-center text-[10px] text-gray-400 mb-1">
          Last updated: {new Date(__BUILD_DATE__).toLocaleString()}
        </div>
      )}
      <div className={mini ? "h-px bg-gray-300 my-2 w-6 mx-auto" : "h-px bg-gray-300 mx-2"} />  
      <button
        onClick={() => setIsPopupOpen((prev) => !prev)}
        className={`mt-auto cursor-pointer focus:outline-none ${
          mini
            ? 'p-1 rounded hover:bg-gray-200'
            : 'block w-full px-2 py-2 flex items-center justify-between'
        }`}
      >
        {mini ? (
          user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt="User"
              className="w-6 h-6 rounded-full object-cover"
              onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/default-avatar.png'; }}
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center text-white text-xs font-semibold">
              {user?.name?.[0] || 'U'}
            </div>
          )
        ) : (
          <div className="w-full px-2 py-2 rounded-md hover:bg-gray-300 transition flex items-center space-x-3">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt="User"
                className="w-8 h-8 rounded-full object-cover"
                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/default-avatar.png'; }}
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-400 flex items-center justify-center text-white font-semibold">
                {user?.name?.[0] || 'U'}
              </div>
            )}
            <div className="text-left">
              <div className="text-sm font-medium text-gray-900">{user?.name}</div>
              <div className="text-xs text-gray-500 capitalize">
                {user?.role || 'viewer'}
              </div>
            </div>
          </div>
        )}
      </button>
      {isPopupOpen && (
        <div
          ref={popupRef}
          className={`absolute z-50 shadow-lg border border-gray-300 rounded-[12px] bg-white ${
            mini
              ? 'fixed bottom-[60px] left-[10px] w-48'
              : 'bottom-[60px] left-[10px] right-[10px] w-[calc(100%-20px)]'
          }`}
        >
          <div className="p-4 flex items-center space-x-2 w-full overflow-hidden">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-gray-500" viewBox="0 0 20 20" fill="currentColor"><path d="M16.585 10C16.585 6.3632 13.6368 3.41504 10 3.41504C6.3632 3.41504 3.41504 6.3632 3.41504 10C3.41504 11.9528 4.26592 13.7062 5.61621 14.9121C6.6544 13.6452 8.23235 12.835 10 12.835C11.7674 12.835 13.3447 13.6454 14.3828 14.9121C15.7334 13.7062 16.585 11.9531 16.585 10ZM10 14.165C8.67626 14.165 7.49115 14.7585 6.69531 15.6953C7.66679 16.2602 8.79525 16.585 10 16.585C11.2041 16.585 12.3316 16.2597 13.3027 15.6953C12.5069 14.759 11.3233 14.1651 10 14.165ZM11.835 8.5C11.835 7.48656 11.0134 6.66504 10 6.66504C8.98656 6.66504 8.16504 7.48656 8.16504 8.5C8.16504 9.51344 8.98656 10.335 10 10.335C11.0134 10.335 11.835 9.51344 11.835 8.5ZM17.915 10C17.915 14.3713 14.3713 17.915 10 17.915C5.62867 17.915 2.08496 14.3713 2.08496 10C2.08496 5.62867 5.62867 2.08496 10 2.08496C14.3713 2.08496 17.915 5.62867 17.915 10ZM13.165 8.5C13.165 10.248 11.748 11.665 10 11.665C8.25202 11.665 6.83496 10.248 6.83496 8.5C6.83496 6.75202 8.25202 5.33496 10 5.33496C11.748 5.33496 13.165 6.75202 13.165 8.5Z" /></svg>
            </div>
            <button
              onClick={handleCopyUserId}
              className="truncate text-left text-sm text-gray-400 hover:text-gray-600 focus:outline-none w-full"
              title={user?.email}
            >
              {user?.email}
            </button>
          </div>
          <div className="border-t border-gray-200" />
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2 rounded-b-[12px] transition"
          >
            <span>Log out</span>
          </button>
        </div>
      )}
      <Toast
        message="Copied your User ID to clipboard"
        show={showToast}
        onClose={() => setShowToast(false)}
        type="success"
      />
    </div>
  );
};

export default SidebarFooter;

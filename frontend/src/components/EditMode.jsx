import { useState, useEffect } from 'react';
import supabase from '../supabaseClient';

const EditMode = () => {
  const [editMode, setEditMode] = useState(null);
  const isAdmin = editMode === 'admin';
  const toggleEditMode = () => {
    setEditMode((prev) => (prev === 'admin' ? null : 'admin'));
  };

  useEffect(() => {
    const checkUserRole = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) return;

      const role = session.user.user_metadata?.role;
      if (role === 'admin') {
        setEditMode('admin');
      }
    };

    checkUserRole();
  }, []);

  const authorizedFetch = async (url, options = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');

    const token = session.access_token;

    const method = options.method || 'POST';
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      'Authorization': `Bearer ${token}`,
    };

    const finalBody =
      headers['Content-Type'] === 'application/json' && typeof options.body !== 'string'
        ? JSON.stringify(options.body)
        : options.body;

    const finalOptions = {
      ...options,
      method,
      headers,
      body: finalBody,
    };

    return fetch(url, finalOptions);
  };

  return {
    isAdmin,
    editMode,
    authorizedFetch,
    toggleEditMode, 
    logout: async () => {
      await supabase.auth.signOut();
      setEditMode(null);
    },
  };
};

export default EditMode;

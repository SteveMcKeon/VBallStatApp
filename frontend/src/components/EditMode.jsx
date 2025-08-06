import { useState, useEffect } from 'react';
import supabase from '../supabaseClient';
import authorizedFetch from '../utils/authorizedFetch';

const EditMode = () => {
  const [editMode, setEditMode] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const toggleEditMode = () => {
    if (editMode) {
      setEditMode(null);
    } else if (userRole) {
      setEditMode(userRole);
    }
  };
  useEffect(() => {
    const fetchUserRole = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) return;

      const role = session.user.user_metadata?.role;
      setUserRole(role || null);
    };

    fetchUserRole();
  }, []);

  return {
    editMode,
    authorizedFetch,
    toggleEditMode, 
  };
};

export default EditMode;

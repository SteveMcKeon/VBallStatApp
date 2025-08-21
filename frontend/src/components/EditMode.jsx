import { useState, useEffect } from 'react';
import supabase from '../supabaseClient';
const EditMode = (teamId) => {
  const [editMode, setEditMode] = useState(null);
  const [allowedRole, setAllowedRole] = useState(null); // 'admin' | 'editor' | null
  useEffect(() => {
    const fetchTeamRole = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session || !teamId) {
        setAllowedRole(null);
        setEditMode(null);
        return;
      }
      const userId = session.user.id;
      const { data, error: qErr } = await supabase
        .from('team_members')
        .select('role')
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .maybeSingle();
      if (qErr) {
        console.error('Failed to fetch team role:', qErr);
        setAllowedRole(null);
        setEditMode(null);
        return;
      }
      const mapped =
        data?.role === 'captain' ? 'admin' :
          data?.role === 'editor' ? 'editor' : null;
      setAllowedRole(mapped);
      setEditMode(prev => mapped ? prev : null);
    };
    fetchTeamRole();
  }, [teamId]);
  const toggleEditMode = () => {
    setEditMode(prev => (prev ? null : allowedRole));
  };
  return { editMode, toggleEditMode, allowedRole };
};
export default EditMode;

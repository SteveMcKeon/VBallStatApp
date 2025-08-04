import supabase from '../supabaseClient';

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

export default authorizedFetch;

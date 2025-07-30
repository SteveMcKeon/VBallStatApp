// utils/authedFetch.js

let isRefreshing = false;
let pendingRequests = [];

export const tryRefreshToken = async () => {
  const oldToken = sessionStorage.getItem('adminToken');
  if (!oldToken) return null;

  if (isRefreshing) {
    return new Promise((resolve) => pendingRequests.push(resolve));
  }

  isRefreshing = true;

  try {
    const res = await fetch('/api/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: oldToken }),
    });

    const result = await res.json();

    if (!result.success) {
      sessionStorage.removeItem('adminToken');
      pendingRequests.forEach((cb) => cb(null));
      pendingRequests = [];
      return null;
    }

    const newToken = result.token;
    sessionStorage.setItem('adminToken', newToken);
    pendingRequests.forEach((cb) => cb(newToken));
    pendingRequests = [];
    return newToken;
  } catch (err) {
    console.error('Token refresh failed:', err);
    sessionStorage.removeItem('adminToken');
    pendingRequests.forEach((cb) => cb(null));
    pendingRequests = [];
    return null;
  } finally {
    isRefreshing = false;
  }
};

export const authedFetch = async (url, options = {}, onAuthFailure) => {
  let token = sessionStorage.getItem('adminToken');

  const makeRequest = async (authToken) => {
    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${authToken}`,
      },
    });
  };

  let res = await makeRequest(token);

  if (res.status === 403) {
    const newToken = await tryRefreshToken();
    if (!newToken) {
      if (onAuthFailure) onAuthFailure();
      return res; // Still return the 403 response so you can handle it explicitly
    }
    res = await makeRequest(newToken);
  }

  return res;
};

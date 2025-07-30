import { useState } from 'react';

const EditMode = () => {
  let isPrompting = false; 
  const [editMode, setEditMode] = useState(() => {
    return sessionStorage.getItem('adminToken') ? 'admin' : null;
  });

  const isAdmin = editMode === 'admin';

  const refreshToken = async () => {
    const oldToken = sessionStorage.getItem('adminToken');
    if (!oldToken) return null;

    try {
      const res = await fetch('/api/refresh-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: oldToken }),
      });

      const result = await res.json();
      if (!result.success) {
        sessionStorage.removeItem('adminToken');
        setEditMode(null);
        return null;
      }

      sessionStorage.setItem('adminToken', result.token);
      return result.token;
    } catch (err) {
      console.error('Token refresh failed:', err);
      sessionStorage.removeItem('adminToken');
      setEditMode(null);
      return null;
    }
  };

  const authorizedFetch = async (url, options = {}, onFailure) => {
    const {
      method = 'POST',
      headers = { 'Content-Type': 'application/json' },
      body,
      ...rest
    } = options;

    const finalBody =
      headers['Content-Type'] === 'application/json' && typeof body !== 'string'
        ? JSON.stringify(body)
        : body;

    const makeRequest = async (token) => {
      const combinedHeaders = new Headers(headers);
      combinedHeaders.set('Authorization', `Bearer ${token}`);
      return fetch(url, {
        method,
        headers: combinedHeaders,
        body: finalBody,
        ...rest,
      });
    };
    let token = sessionStorage.getItem('adminToken');
    let res = await makeRequest(token);

    if (res.status === 403) {
      token = await refreshToken();
      if (token) {
        res = await makeRequest(token);
        if (res.status !== 403) return res;
      }

      if (isPrompting) return null;
      isPrompting = true;

      const password = prompt("Session expired. Please re-enter admin password:");
      if (!password) {
        alert("Login cancelled.");
        sessionStorage.removeItem('adminToken');
        setEditMode(null);
        onFailure?.();
        isPrompting = false;
        return null;
      }

      const loginRes = await fetch('/api/validate-admin-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const loginResult = await loginRes.json();
      if (!loginResult.success) {
        alert("Invalid password. Logging out.");
        sessionStorage.removeItem('adminToken');
        setEditMode(null);
        onFailure?.();
        isPrompting = false;
        return null;
      }

      sessionStorage.setItem('adminToken', loginResult.token);
      setEditMode('admin');
      isPrompting = false;
      return await makeRequest(loginResult.token);
    }

    return res;
  };
  
  const handleEditModeLogin = async () => {
    if (isAdmin) {
      setEditMode(null);
      return;
    }

    const existingToken = sessionStorage.getItem('adminToken');
    if (existingToken) {
      const refreshed = await refreshToken();
      if (refreshed) {
        setEditMode('admin');
        return;
      }
    }

    const password = prompt("Enter admin password:");
    if (!password) return;

    const res = await fetch('/api/validate-admin-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    const result = await res.json();
    if (result.success) {
      sessionStorage.setItem('adminToken', result.token);
      setEditMode('admin');
    } else {
      alert("Invalid password.");
    }
  };

  return {
    isAdmin,
    editMode,
    handleEditModeLogin,
    authorizedFetch,
    logout: () => {
      sessionStorage.removeItem('adminToken');
      setEditMode(null);
    },
  };
};

export default EditMode;

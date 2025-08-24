import React, { useState, useEffect } from 'react';
import supabase from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import FloatingLabelInput from './FloatingLabelInput';

const ResetPassword = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState('send');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get('type') === 'recovery') {
      setMode('reset');
      supabase.auth.exchangeCodeForSession().catch(() => {
        setMessage('Invalid or expired reset link.');
      });
    }
  }, []);
  const handleSendReset = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://vballtracker.mckeon.ca/reset-password',
    });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Password reset email sent. Check your inbox!');
    }
  };
  const handleResetPassword = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Password updated successfully! You can now log in.');
    }
  };
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {mode === 'send' ? (
          <>
            <h2 className="text-2xl font-semibold text-center mb-6">Forgot Password</h2>
            <form onSubmit={handleSendReset} className="space-y-4">
              <FloatingLabelInput
                label="Email Address"
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button
                type="submit"
                className="w-full py-3 bg-black text-white rounded-full font-semibold hover:bg-gray-600 transition-colors"
              >
                Send Reset Link
              </button>
            </form>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-semibold text-center mb-6">Reset Password</h2>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <FloatingLabelInput
                label="New Password"
                id="new-password"
                name="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="submit"
                className="w-full py-3 bg-black text-white rounded-full font-semibold hover:bg-gray-600 transition-colors"
              >
                Update Password
              </button>
            </form>
          </>
        )}
        {message && <p className="text-center text-sm mt-4 text-gray-500">{message}</p>}
        <p className="text-center text-sm mt-4 text-blue-600 cursor-pointer hover:underline" onClick={() => navigate('/login')}>
          Back to Login
        </p>
      </div>
    </div>
  );
};
export default ResetPassword;

import React, { useState } from 'react';
import supabase from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import Toast from './Toast';

const FloatingLabelInput = ({ label, type = 'text', id, name, isError, value, onChange }) => {
  const [isFocused, setIsFocused] = useState(false);
  const shouldFloat = isFocused || value.length > 0;
  return (
    <div className="relative w-full mt-6">
      <input
        type={type}
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={`w-full px-4 pt-6 pb-2 text-sm text-black border rounded-full focus:outline-none transition-all ${
          isError
            ? 'border-red-500 focus:border-red-500'
            : 'border-gray-400 focus:border-blue-500'
        }`}
      />
      <label
        htmlFor={id}
        className={`absolute left-4 px-1 transition-all pointer-events-none duration-300 ease-in-out
          ${shouldFloat ? 'top-1 text-xs' : 'top-3.5 text-base'} ${
            isError ? 'text-red-500' : shouldFloat ? 'text-blue-500' : 'text-gray-400'
          }`}
      >
        {label}
      </label>
    </div>
  );
};

const LoginPage = () => {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('error');
  const [showToast, setShowToast] = useState(false);

  const setToast = (message, type = 'error') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
  };

  const handleLogin = async (provider) => {
    await supabase.auth.signInWithOAuth({ provider });
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    const email = e.target.email.value;
    const password = e.target.password.value;
    const displayName = isSignUp ? e.target.displayName.value : null;

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password,   options: { data: { display_name: displayName } } });
      if (error) setAuthError(error.message);
      else setToast('Check your email to verify your account!', 'success');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError(error.message);
      else navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <img src="../../public/android-chrome-512x512.png" alt="Logo" className="w-20 h-20 mx-auto mb-6 animate-bounce" />
        <h2 className="text-2xl font-semibold text-center mb-6">
          {isSignUp ? 'Create an account' : 'Welcome back'}
        </h2>
        <form onSubmit={handleAuth} className="space-y-4">
          {isSignUp && (
            <FloatingLabelInput label="Display Name" id="displayName" name="displayName" value={displayName} onChange={(e) => { setDisplayName(e.target.value); setAuthError(''); }} />
          )}        
          <FloatingLabelInput label="Email address" id="email" name="email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setAuthError(''); }} />
          <FloatingLabelInput label="Password" id="password" name="password" type="password" value={password} isError={!!authError} onChange={(e) => { setPassword(e.target.value); setAuthError(''); }} />
          {authError && (
            <div className="flex items-center text-sm text-red-500 mt-1 ml-4">
              <span className="mr-1">❗</span> {authError}
            </div>
          )}          
          <button
            type="submit"
            className="w-full py-3 bg-black text-white rounded-full font-semibold hover:bg-gray-600 transition-colors cursor-pointer"
          >
            {isSignUp ? 'Sign Up' : 'Log In'}
          </button>
        </form>

        <p className="text-sm text-center mt-4 text-gray-500">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <span
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-blue-600 cursor-pointer"
          >
            {isSignUp ? 'Log In' : 'Sign up'}
          </span>
        </p>

        {!isSignUp && (
          <p className="text-sm text-center mt-4 text-gray-500">
            <a href="/reset-password" className="text-blue-600 hover:underline">
              Forgot your password?
            </a>
          </p>
        )}
        <div className="flex items-center my-6">
          <hr className="flex-grow border-gray-300" />
          <span className="mx-2 text-sm text-gray-400">OR</span>
          <hr className="flex-grow border-gray-300" />
        </div>

        <div className="space-y-3">
          <button
            onClick={() => handleLogin('google')}
            className="w-full flex items-center justify-center border border-gray-300 rounded-full py-2 hover:bg-gray-200 cursor-pointer"
          >
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5 mr-2" />
            Continue with Google
          </button>

          {/* Placeholder buttons for future OAuth providers 
          <button
            disabled
            className="w-full flex items-center justify-center border border-gray-300 rounded-full py-2 text-gray-400 cursor-not-allowed"
          >
            <span className="mr-2">🪟</span>
            Continue with Microsoft
          </button>

          <button
            disabled
            className="w-full flex items-center justify-center border border-gray-300 rounded-full py-2 text-gray-400 cursor-not-allowed"
          >
            <span className="mr-2"></span>
            Continue with Apple
          </button>
        */}
        </div>
        <p className="text-xs text-center text-gray-400 mt-6">
          <a href="#" className="hover:underline">Terms of Use</a> | <a href="#" className="hover:underline">Privacy Policy</a>
        </p>       
      </div>
    </div>
  <Toast
    message={toastMessage}
    show={showToast}
    onClose={() => setShowToast(false)}
    type={toastType}
  />    
  );
};

export default LoginPage;


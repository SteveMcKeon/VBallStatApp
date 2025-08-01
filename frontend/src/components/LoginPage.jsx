import React, { useState } from 'react';
import supabase from '../supabaseClient';

const FloatingLabelInput = ({ label, type = 'text', id, name }) => {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const shouldFloat = isFocused || value.length > 0;
  return (
    <div className="relative w-full mt-6">
      <input
        type={type}
        id={id}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className="w-full px-4 pt-6 pb-2 text-sm text-black border border-gray-400 rounded-full focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
      />
      <label
        htmlFor={id}
        className={`absolute left-4 px-1 transition-all bg-white pointer-events-none duration-300 ease-in-out
          ${shouldFloat ? 'top-1 text-xs text-blue-500' : 'top-3.5 text-base text-gray-400'}`}
      >
        {label}
      </label>
    </div>
  );
};

const LoginPage = () => {
  const handleLogin = async (provider) => {
    await supabase.auth.signInWithOAuth({ provider });
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h2 className="text-2xl font-semibold text-center mb-6">Welcome back</h2>
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <FloatingLabelInput label="Email address" id="email" name="email" type="email" />
          <FloatingLabelInput label="Password" id="password" name="password" type="password" />
          <button
            type="submit"
            className="w-full py-3 bg-black text-white rounded-full font-semibold hover:bg-gray-600 transition-colors cursor-pointer"
          >
            Continue
          </button>
        </form>

        <p className="text-sm text-center mt-4 text-gray-500">
          Don’t have an account? <span className="text-blue-600 cursor-pointer">Sign up</span>
        </p>

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
  );
};

export default LoginPage;

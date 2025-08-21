import React from 'react';
import { Routes, Route, useLocation, matchRoutes } from 'react-router-dom';
import MainPage from './components/MainPage';
import LoginPage from './components/LoginPage';
import NotFound from './components/NotFound';
import ResetPassword from './components/ResetPassword';
import AcceptInvite from './components/AcceptInvite';
const AppRoutes = () => {
  const location = useLocation();
  const routes = [
    { path: '/' },
    { path: '/login' },
    { path: '/reset-password' },
    { path: '/accept-invite' },
  ];

  const isKnownRoute = matchRoutes(routes, location) !== null;
  return (
    <div className="App">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<MainPage />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
};
export default AppRoutes;

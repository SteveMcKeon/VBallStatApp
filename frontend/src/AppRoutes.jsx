import React from 'react';
import { Routes, Route, useLocation, matchRoutes } from 'react-router-dom';
import MainPage from './components/MainPage';
import StatsSummary from './components/StatsSummary';
import LoginPage from './components/LoginPage';
import NotFound from './components/NotFound';
import Header from './components/Header';
import ResetPassword from './components/ResetPassword';

const AppRoutes = () => {
  const location = useLocation();

  const routes = [
    { path: '/' },
    { path: '/login' },
    { path: '/stats' },
    { path: '/reset-password' },
  ];
  const hideHeaderOn = [
    '/login', 
    '/reset-password',
  ];
  
  const isKnownRoute = matchRoutes(routes, location) !== null;
  const shouldShowHeader = isKnownRoute && !hideHeaderOn.includes(location.pathname);

  return (
    <div className="App">
      {shouldShowHeader && <Header />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<MainPage />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/stats" element={<StatsSummary />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
};

export default AppRoutes;

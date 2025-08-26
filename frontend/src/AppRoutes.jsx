import { Routes, Route } from 'react-router-dom';
import MainPage from './components/Routes/MainPage';
import LoginPage from './components/Routes/LoginPage';
import NotFound from './components/Routes/NotFound';
import ResetPassword from './components/Routes/ResetPassword';
import AcceptInvite from './components/Routes/AcceptInvite';
import TeamGameView from './components/Routes/TeamGameView';
import StatsSummary from './components/Routes/StatsSummary';
const AppRoutes = () => {
  return (
    <div className="App">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<MainPage />}>
          <Route index element={ <TeamGameView /> } />
          <Route path="stats/team" element={<StatsSummary scope="team" />} />
          <Route path="stats/player"   element={<StatsSummary scope="player" />} />
        </Route>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
};
export default AppRoutes;

import React, { useRef, useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom'; // Import Routes instead of Switch
import MainPage from './components/MainPage';
import StatsSummary from './components/StatsSummary';
import { SidebarProvider, useSidebar } from './components/SidebarContext';

const Header = () => {
  const { toggleSidebar } = useSidebar();
  const [showHeader, setShowHeader] = useState(true);

  return (
    <header
      className={`fixed top-0 left-0 right-0 h-14 bg-gray-200 border-b flex items-center px-4 z-30 shadow-sm transition-transform duration-300 ${
        showHeader ? 'translate-y-0' : '-translate-y-full'
      }`}
    >
      <button className="mr-4 p-2 hover:bg-gray-400 rounded" onClick={toggleSidebar} aria-label="Toggle sidebar">
        <svg viewBox="0 0 24 24" className="w-6 h-6">
          <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
        </svg>
      </button>
      <h1 className="text-xl font-bold flex items-baseline">
        Volleyball Tracker
      </h1>
    </header>   
  );
};

const App = () => {
  return (
    <Router>
      <SidebarProvider>
        <div className="App">
          <Header />
          <Routes>
            <Route path="/" element={<MainPage />} />
            <Route path="/stats" element={<StatsSummary />} />
          </Routes>
        </div>
      </SidebarProvider>
    </Router>
  );
};
export default App;

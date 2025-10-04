import React, { useState } from 'react';
import './App.css';
import TimeTrialComponent from './components/TimeTrialComponent';
import Dashboard from './components/Dashboard';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');

  return (
    <div className="App">
      {/* Simple navigation */}
      <div className="bg-gray-800 text-white p-4 flex gap-4">
        <button 
          onClick={() => setCurrentView('dashboard')}
          className={`px-4 py-2 rounded ${currentView === 'dashboard' ? 'bg-blue-600' : 'bg-gray-600'}`}
        >
          Dashboard
        </button>
        <button 
          onClick={() => setCurrentView('timetrial')}
          className={`px-4 py-2 rounded ${currentView === 'timetrial' ? 'bg-blue-600' : 'bg-gray-600'}`}
        >
          Time Trial
        </button>
      </div>

      {currentView === 'dashboard' && <Dashboard />}
      {currentView === 'timetrial' && <TimeTrialComponent />}
    </div>
  );
}

export default App;

import React, { useState } from 'react';
import './App.css';
import TimeTrialComponent from './components/TimeTrialComponent';
import Dashboard from './components/Dashboard';
import TrainingDayComponent from './components/TrainingDayComponent';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedDay, setSelectedDay] = useState(null);

  const handleDayClick = (dayNumber) => {
    setSelectedDay(dayNumber);
    setCurrentView('trainingday');
  };

  const handleBackToDashboard = () => {
    setSelectedDay(null);
    setCurrentView('dashboard');
  };

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

      {currentView === 'dashboard' && <Dashboard onDayClick={handleDayClick} />}
      {currentView === 'timetrial' && <TimeTrialComponent />}
      {currentView === 'trainingday' && selectedDay && (
        <TrainingDayComponent 
          dayNumber={selectedDay} 
          onBack={handleBackToDashboard} 
        />
      )}
    </div>
  );
}

export default App;

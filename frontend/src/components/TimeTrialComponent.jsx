import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Clock, Trophy, TrendingUp, RotateCcw, CheckCircle } from 'lucide-react';

const TimeTrialComponent = () => {
  // Timer state
  const [timeRemaining, setTimeRemaining] = useState(600); // 10 minutes in seconds
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  // Trial data
  const [selectedModality, setSelectedModality] = useState('');
  const [score, setScore] = useState('');
  const [units, setUnits] = useState('');
  const [baseline, setBaseline] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Historical data
  const [previousBaselines, setPreviousBaselines] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  
  // Database connection
  const [supabaseUrl] = useState('https://jucqobldwrhehufxdisd.supabase.co');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [userId] = useState(1);
  
  const intervalRef = useRef(null);
  
  // Available units for all modalities
  const scoreUnits = [
    { value: 'calories', label: 'Calories' },
    { value: 'meters', label: 'Meters' },
    { value: 'kilometers', label: 'Kilometers' },
    { value: 'miles', label: 'Miles' },
    { value: 'watts', label: 'Watts (Average)' }
  ];

  // Available modalities - organized by equipment category
  const modalities = [
    // Rowing Equipment
    { value: 'c2_rowing_erg', label: 'C2 Rowing Erg', category: 'Rowing' },
    { value: 'rogue_rowing_erg', label: 'Rogue Rowing Erg', category: 'Rowing' },
    
    // Cycling Equipment
    { value: 'c2_bike_erg', label: 'C2 Bike Erg', category: 'Cycling' },
    { value: 'echo_bike', label: 'Echo Bike', category: 'Cycling' },
    { value: 'air_bike', label: 'Air Bike', category: 'Cycling' },
    { value: 'peloton', label: 'Peloton', category: 'Cycling' },
    { value: 'airdyne', label: 'AirDyne', category: 'Cycling' },
    { value: 'other_bike', label: 'Other Bike', category: 'Cycling' },
    
    // Ski Equipment
    { value: 'c2_ski_erg', label: 'C2 Ski Erg', category: 'Ski' },
    
    // Treadmill/Running Equipment
    { value: 'assault_runner_treadmill', label: 'Assault Runner Treadmill', category: 'Treadmill' },
    { value: 'trueform_treadmill', label: 'TrueForm Treadmill', category: 'Treadmill' },
    { value: 'other_curved_treadmill', label: 'Other Curved Treadmill', category: 'Treadmill' },
    { value: 'motorized_treadmill', label: 'Motorized Treadmill', category: 'Treadmill' },
    
    // Running (Outdoor)
    { value: 'run_track', label: 'Run (Track)', category: 'Running' },
    { value: 'run_road', label: 'Run (Road)', category: 'Running' },
    { value: 'run_trails', label: 'Run (Trails)', category: 'Running' }
  ];

  // Timer effect with audio notifications
  useEffect(() => {
    if (isRunning && timeRemaining > 0) {
      intervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          const newTime = prev - 1;
          
          // Audio notifications
          if (newTime === 300) { // 5 minutes / halfway
            console.log('Halfway point notification');
          } else if (newTime === 60) { // 1 minute remaining
            console.log('1 minute remaining notification');
          } else if (newTime === 0) { // Finished
            console.log('Time trial completed notification');
            setIsRunning(false);
            setIsCompleted(true);
          }
          
          return newTime;
        });
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }

    return () => clearInterval(intervalRef.current);
  }, [isRunning, timeRemaining]);

  // Load previous baselines for selected modality
  useEffect(() => {
    if (selectedModality && supabaseKey) {
      loadPreviousBaselines();
    }
  }, [selectedModality, supabaseKey]);

  const loadPreviousBaselines = async () => {
    if (!supabaseKey) return;
    
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/time_trials?user_id=eq.${userId}&modality=eq.${selectedModality}&order=created_at.desc&limit=5`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setPreviousBaselines(data);
      }
    } catch (error) {
      console.error('Failed to load previous baselines:', error);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = () => {
    return ((600 - timeRemaining) / 600) * 100;
  };

  const startTimer = () => {
    if (!selectedModality) {
      alert('Please select a modality before starting');
      return;
    }
    setIsRunning(true);
    setIsPaused(false);
  };

  const pauseTimer = () => {
    setIsRunning(false);
    setIsPaused(true);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setIsPaused(false);
    setIsCompleted(false);
    setTimeRemaining(600);
    setScore('');
    setUnits('');
    setBaseline(null);
  };

  const calculateBaseline = () => {
    if (!score || isNaN(score) || parseFloat(score) <= 0) {
      alert('Please enter a valid score');
      return;
    }
    
    if (!units) {
      alert('Please select units for your score');
      return;
    }
    
    const unitsPerMinute = parseFloat(score) / 10;
    setBaseline(unitsPerMinute);
  };

  const submitTimeTrial = async () => {
    if (!baseline || !selectedModality || !units || !supabaseKey) {
      alert('Please complete all fields and connect to database');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const timeTrialData = {
        user_id: userId,
        modality: selectedModality,
        score: parseFloat(score),
        units: units,
        baseline_units_per_minute: baseline,
        duration_minutes: 10,
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      const response = await fetch(`${supabaseUrl}/rest/v1/time_trials`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(timeTrialData)
      });

      if (response.ok) {
        alert('Time trial saved successfully!');
        loadPreviousBaselines();
        console.log('Navigate to dashboard');
      } else {
        throw new Error('Failed to save time trial');
      }
    } catch (error) {
      console.error('Error saving time trial:', error);
      alert('Failed to save time trial. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-3">
          <Trophy className="w-8 h-8 text-yellow-500" />
          Time Trial - Baseline Establishment
        </h1>
        <p className="text-gray-600">
          Complete a 10-minute time trial to establish your baseline units per minute for workout pacing
        </p>
      </div>

      {/* Database Connection */}
      {!supabaseKey && (
        <div className="mb-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="font-medium text-yellow-900 mb-2">Database Connection Required</h3>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="Enter your Supabase API key to save results"
              className="flex-1 px-3 py-2 border border-yellow-300 rounded focus:ring-2 focus:ring-yellow-500"
              onChange={(e) => setSupabaseKey(e.target.value)}
            />
          </div>
          <p className="text-sm text-yellow-700 mt-1">
            Without database connection, you can practice but results won't be saved.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Timer and Controls */}
        <div className="space-y-6">
          {/* Modality Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Modality
            </label>
            <select
              value={selectedModality}
              onChange={(e) => setSelectedModality(e.target.value)}
              disabled={isRunning || isCompleted}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            >
              <option value="">Choose your equipment...</option>
              
              <optgroup label="Rowing Equipment">
                {modalities.filter(m => m.category === 'Rowing').map(modality => (
                  <option key={modality.value} value={modality.value}>
                    {modality.label}
                  </option>
                ))}
              </optgroup>
              
              <optgroup label="Cycling Equipment">
                {modalities.filter(m => m.category === 'Cycling').map(modality => (
                  <option key={modality.value} value={modality.value}>
                    {modality.label}
                  </option>
                ))}
              </optgroup>
              
              <optgroup label="Ski Equipment">
                {modalities.filter(m => m.category === 'Ski').map(modality => (
                  <option key={modality.value} value={modality.value}>
                    {modality.label}
                  </option>
                ))}
              </optgroup>
              
              <optgroup label="Treadmill Equipment">
                {modalities.filter(m => m.category === 'Treadmill').map(modality => (
                  <option key={modality.value} value={modality.value}>
                    {modality.label}
                  </option>
                ))}
              </optgroup>
              
              <optgroup label="Running (Outdoor)">
                {modalities.filter(m => m.category === 'Running').map(modality => (
                  <option key={modality.value} value={modality.value}>
                    {modality.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Timer Display */}
          <div className="text-center">
            <div className="relative w-48 h-48 mx-auto mb-4">
              {/* Progress Circle */}
              <svg className="w-48 h-48 transform -rotate-90">
                <circle
                  cx="96"
                  cy="96"
                  r="88"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  className="text-gray-200"
                />
                <circle
                  cx="96"
                  cy="96"
                  r="88"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 88}`}
                  strokeDashoffset={`${2 * Math.PI * 88 * (1 - getProgressPercentage() / 100)}`}
                  className={`transition-all duration-1000 ${
                    isCompleted ? 'text-green-500' : 'text-blue-500'
                  }`}
                />
              </svg>
              
              {/* Timer Text */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl font-bold text-gray-900">
                    {formatTime(timeRemaining)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {isCompleted ? 'Completed!' : isRunning ? 'Active' : isPaused ? 'Paused' : 'Ready'}
                  </div>
                </div>
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex justify-center gap-3">
              {!isRunning && !isCompleted && (
                <button
                  onClick={startTimer}
                  disabled={!selectedModality}
                  className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  {isPaused ? 'Resume' : 'Start'}
                </button>
              )}
              
              {isRunning && (
                <button
                  onClick={pauseTimer}
                  className="bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 flex items-center gap-2"
                >
                  <Pause className="w-5 h-5" />
                  Pause
                </button>
              )}

              <button
                onClick={resetTimer}
                className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 flex items-center gap-2"
              >
                <RotateCcw className="w-5 h-5" />
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Right Column - Score Input and Results */}
        <div className="space-y-6">
          {/* Score Input and Units */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Final Score
              </label>
              <input
                type="number"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="Enter score"
                disabled={!isCompleted}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Units
              </label>
              <select
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                disabled={!isCompleted}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="">Select units...</option>
                {scoreUnits.map(unit => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <p className="text-sm text-gray-500">
            {isCompleted ? 'Enter your final score and select units from the 10-minute trial' : 'Complete the time trial first'}
          </p>

          {/* Calculate Baseline */}
          {isCompleted && score && units && (
            <div>
              <button
                onClick={calculateBaseline}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <Clock className="w-4 h-4" />
                Calculate Baseline
              </button>
            </div>
          )}

          {/* Baseline Result */}
          {baseline && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-medium text-green-900 mb-2 flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Baseline Calculated
              </h3>
              <div className="text-2xl font-bold text-green-800">
                {baseline.toFixed(2)} {units}/minute
              </div>
              <p className="text-sm text-green-700 mt-1">
                Score: {score} {units} ÷ 10 minutes = {baseline.toFixed(2)} {units} per minute
              </p>
              
              <button
                onClick={submitTimeTrial}
                disabled={isSubmitting || !supabaseKey}
                className="mt-3 w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save & Return to Dashboard'}
              </button>
            </div>
          )}

          {/* Previous Baselines */}
          {selectedModality && previousBaselines.length > 0 && (
            <div>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="w-full flex items-center justify-between px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                <span className="font-medium">Previous {modalities.find(m => m.value === selectedModality)?.label} Baselines</span>
                <TrendingUp className="w-4 h-4" />
              </button>
              
              {showHistory && (
                <div className="mt-2 space-y-2">
                  {previousBaselines.map((baseline, index) => (
                    <div key={index} className="bg-gray-50 p-3 rounded border">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{baseline.baseline_units_per_minute?.toFixed(2)} units/min</span>
                        <span className="text-sm text-gray-500">
                          {new Date(baseline.completed_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        Score: {baseline.score} | {baseline.duration_minutes} minutes
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-medium text-blue-900 mb-2">Time Trial Instructions</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <strong>Goal:</strong> Maximum effort for 10 minutes to achieve the highest possible score</li>
          <li>• Select your equipment/modality first</li>
          <li>• You'll get notifications at 5 minutes (halfway) and 1 minute remaining</li>
          <li>• Record your final score in any units (calories, meters, kilometers, miles, or watts)</li>
          <li>• Your baseline = Score ÷ 10 minutes = units per minute</li>
          <li>• This baseline determines pacing targets for all future workouts in this modality</li>
          <li>• You can retake time trials anytime to update your baseline</li>
          <li>• <strong>Note:</strong> Scores are only comparable within the same modality and units</li>
        </ul>
      </div>
    </div>
  );
};

export default TimeTrialComponent;

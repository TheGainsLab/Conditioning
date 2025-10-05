import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  CheckCircle, 
  Clock, 
  Target, 
  TrendingUp, 
  AlertCircle,
  ArrowLeft,
  Timer,
  Zap
} from 'lucide-react';
import databaseService from '../services/databaseService';

const TrainingDayComponent = ({ dayNumber, onBack }) => {
  // Workout data
  const [workout, setWorkout] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Time trial baselines
  const [baselines, setBaselines] = useState({});
  const [selectedModality, setSelectedModality] = useState('');
  
  // Workout execution
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [currentInterval, setCurrentInterval] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [sessionData, setSessionData] = useState({
    intervals: [],
    totalOutput: 0,
    averagePace: 0
  });
  
  // Database connection state
  const [connected, setConnected] = useState(false);
  
  // Timer ref
  const intervalRef = useRef(null);
  
  // Available modalities (same as TimeTrialComponent)
  const modalities = [
    { value: 'c2_row_erg', label: 'C2 Rowing Erg', category: 'Rowing' },
    { value: 'rogue_row_erg', label: 'Rogue Rowing Erg', category: 'Rowing' },
    { value: 'c2_bike_erg', label: 'C2 Bike Erg', category: 'Cycling' },
    { value: 'echo_bike', label: 'Echo Bike', category: 'Cycling' },
    { value: 'assault_bike', label: 'Assault Bike', category: 'Cycling' },
    { value: 'airdyne_bike', label: 'AirDyne Bike', category: 'Cycling' },
    { value: 'other_bike', label: 'Other Bike', category: 'Cycling' },
    { value: 'c2_ski_erg', label: 'C2 Ski Erg', category: 'Ski' },
    { value: 'assault_runner', label: 'Assault Runner Treadmill', category: 'Treadmill' },
    { value: 'trueform_treadmill', label: 'TrueForm Treadmill', category: 'Treadmill' },
    { value: 'motorized_treadmill', label: 'Motorized Treadmill', category: 'Treadmill' },
    { value: 'outdoor_run', label: 'Outdoor Run', category: 'Running' }
  ];

  useEffect(() => {
    if (dayNumber) {
      loadWorkoutData();
    }
  }, [dayNumber]);

  useEffect(() => {
    if (selectedModality) {
      loadBaselineForModality();
    }
  }, [selectedModality]);

  // Check connection status
  useEffect(() => {
    setConnected(databaseService.isConnected());
    
    const unsubscribe = databaseService.subscribe((apiKey) => {
      setConnected(!!apiKey);
    });
    
    return unsubscribe;
  }, []);

  // Timer effect for workout intervals
  useEffect(() => {
    if (isActive && timeRemaining > 0) {
      intervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          const newTime = prev - 1;
          
          if (newTime === 0) {
            // Interval completed
            completeCurrentInterval();
          }
          
          return newTime;
        });
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }

    return () => clearInterval(intervalRef.current);
  }, [isActive, timeRemaining]);

  const loadWorkoutData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (connected) {
        const workoutData = await databaseService.loadWorkoutForDay(dayNumber);
        if (workoutData) {
          setWorkout(workoutData);
          initializeWorkout(workoutData);
        } else {
          setError('No workout found for this day');
        }
      } else {
        // Demo mode - create sample workout data
        const demoWorkout = createDemoWorkout(dayNumber);
        setWorkout(demoWorkout);
        initializeWorkout(demoWorkout);
      }
    } catch (err) {
      console.error('Error loading workout:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createDemoWorkout = (dayNum) => {
    // Create demo workout based on day number
    const workoutTypes = ['EMOM', 'AMRAP', 'Conditioning'];
    const type = workoutTypes[dayNum % 3];
    
    return {
      id: dayNum,
      day_number: dayNum,
      workout_type: type,
      duration: 15 + (dayNum % 10), // 15-24 minutes
      description: `${type} workout for Day ${dayNum}`,
      created_at: new Date().toISOString()
    };
  };

  const loadBaselineForModality = async () => {
    if (!selectedModality) return;
    
    if (connected) {
      try {
        const baseline = await databaseService.loadTimeTrialBaselines(selectedModality);
        if (baseline) {
          setBaselines(prev => ({
            ...prev,
            [selectedModality]: {
              baseline: baseline.calculated_rpm,
              units: baseline.units,
              date: baseline.date
            }
          }));
        }
      } catch (error) {
        console.error('Failed to load baseline:', error);
      }
    } else {
      // Demo mode - create sample baseline data
      const demoBaseline = createDemoBaseline(selectedModality);
      setBaselines(prev => ({
        ...prev,
        [selectedModality]: demoBaseline
      }));
    }
  };

  const createDemoBaseline = (modality) => {
    // Create demo baseline data based on modality
    const baselineValues = {
      'c2_row_erg': { baseline: 45.5, units: 'cal' },
      'echo_bike': { baseline: 38.2, units: 'cal' },
      'assault_bike': { baseline: 42.1, units: 'cal' },
      'c2_bike_erg': { baseline: 35.8, units: 'watts' },
      'c2_ski_erg': { baseline: 28.5, units: 'cal' },
      'outdoor_run': { baseline: 6.2, units: 'mph' },
      'motorized_treadmill': { baseline: 6.5, units: 'mph' }
    };
    
    const values = baselineValues[modality] || { baseline: 40.0, units: 'cal' };
    
    return {
      baseline: values.baseline,
      units: values.units,
      date: new Date().toISOString().split('T')[0]
    };
  };

  const initializeWorkout = (workoutData) => {
    // Parse workout structure - this would depend on your database schema
    // For now, assuming workout has intervals or duration structure
    const intervals = parseWorkoutIntervals(workoutData);
    setSessionData(prev => ({
      ...prev,
      intervals: intervals.map(interval => ({
        ...interval,
        targetPace: calculateTargetPace(interval),
        actualOutput: 0,
        completed: false
      }))
    }));
    
    if (intervals.length > 0) {
      setTimeRemaining(intervals[0].duration);
    }
  };

  const parseWorkoutIntervals = (workoutData) => {
    // This function would parse the workout structure from your database
    // For demo purposes, creating a sample interval structure
    if (workoutData.workout_type === 'EMOM') {
      return Array.from({ length: workoutData.duration || 10 }, (_, i) => ({
        id: i + 1,
        type: 'EMOM',
        duration: 60, // 1 minute
        targetPace: null, // Will be calculated based on baseline
        description: `Every minute on the minute - Round ${i + 1}`
      }));
    } else if (workoutData.workout_type === 'AMRAP') {
      return [{
        id: 1,
        type: 'AMRAP',
        duration: workoutData.duration * 60, // Convert minutes to seconds
        targetPace: null,
        description: `As many rounds as possible in ${workoutData.duration} minutes`
      }];
    } else {
      // Default interval structure
      return [{
        id: 1,
        type: 'Conditioning',
        duration: (workoutData.duration || 20) * 60,
        targetPace: null,
        description: workoutData.description || 'Conditioning workout'
      }];
    }
  };

  const calculateTargetPace = (interval) => {
    if (!selectedModality || !baselines[selectedModality]) {
      return null;
    }
    
    const baseline = baselines[selectedModality].baseline;
    const units = baselines[selectedModality].units;
    
    // Apply intensity scaling based on workout type and day progression
    let intensityMultiplier = 1.0;
    
    // Base intensity by workout type
    switch (interval.type) {
      case 'EMOM':
        intensityMultiplier = 0.85; // 85% of baseline for EMOM
        break;
      case 'AMRAP':
        intensityMultiplier = 0.90; // 90% of baseline for AMRAP
        break;
      case 'Conditioning':
        intensityMultiplier = 0.80; // 80% of baseline for general conditioning
        break;
      default:
        intensityMultiplier = 0.85;
    }
    
    // Progressive intensity based on day number (optional scaling)
    const dayProgression = Math.min(dayNumber / 100, 1); // Scale up to day 100, then plateau
    const progressionBonus = 0.05 * dayProgression; // Up to 5% bonus
    intensityMultiplier += progressionBonus;
    
    return {
      pace: baseline * intensityMultiplier,
      units: units,
      intensity: Math.round(intensityMultiplier * 100),
      baseline: baseline
    };
  };

  const completeCurrentInterval = () => {
    setSessionData(prev => {
      const updatedIntervals = [...prev.intervals];
      if (updatedIntervals[currentInterval]) {
        updatedIntervals[currentInterval].completed = true;
      }
      
      // Move to next interval
      const nextInterval = currentInterval + 1;
      if (nextInterval < updatedIntervals.length) {
        setCurrentInterval(nextInterval);
        setTimeRemaining(updatedIntervals[nextInterval].duration);
      } else {
        // All intervals completed
        setIsActive(false);
        setIsCompleted(true);
        saveWorkoutSession();
      }
      
      return {
        ...prev,
        intervals: updatedIntervals
      };
    });
  };

  const startWorkout = () => {
    if (!selectedModality) {
      alert('Please select a modality before starting');
      return;
    }
    
    if (!baselines[selectedModality]) {
      alert('No baseline found for selected modality. Please complete a time trial first.');
      return;
    }
    
    setIsActive(true);
    setIsPaused(false);
    
    // Initialize timer with first interval
    if (sessionData.intervals.length > 0) {
      setTimeRemaining(sessionData.intervals[0].duration);
      setCurrentInterval(0);
    }
  };

  const pauseWorkout = () => {
    setIsActive(false);
    setIsPaused(true);
  };

  const resumeWorkout = () => {
    setIsActive(true);
    setIsPaused(false);
  };

  const completeWorkout = () => {
    setIsActive(false);
    setIsCompleted(true);
    saveWorkoutSession();
  };

  const resetWorkout = () => {
    setIsActive(false);
    setIsPaused(false);
    setIsCompleted(false);
    setCurrentInterval(0);
    setSessionData(prev => ({
      ...prev,
      intervals: prev.intervals.map(interval => ({
        ...interval,
        actualOutput: 0,
        completed: false
      })),
      totalOutput: 0,
      averagePace: 0
    }));
    
    if (sessionData.intervals.length > 0) {
      setTimeRemaining(sessionData.intervals[0].duration);
    }
  };

  const saveWorkoutSession = async () => {
    if (!connected) return;
    
    try {
      const sessionData = {
        user_id: databaseService.userId,
        day_number: dayNumber,
        workout_id: workout?.id,
        completed_at: new Date().toISOString(),
        total_output: sessionData.totalOutput,
        average_pace: sessionData.averagePace,
        modality: selectedModality,
        intervals_completed: sessionData.intervals.filter(i => i.completed).length,
        total_intervals: sessionData.intervals.length
      };

      await databaseService.saveWorkoutSession(sessionData);
      console.log('Workout session saved successfully');
    } catch (error) {
      console.error('Error saving workout session:', error);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getCurrentInterval = () => {
    return sessionData.intervals[currentInterval] || null;
  };

  const getCurrentTargetPace = () => {
    const interval = getCurrentInterval();
    return interval?.targetPace || null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading workout...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Workout</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={onBack}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to Dashboard
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Day {dayNumber}</h1>
                <p className="text-gray-600">{workout?.workout_type || 'Conditioning'}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm text-gray-500">Duration</div>
                <div className="font-semibold">{workout?.duration || 20} min</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Side - Workout Controls */}
          <div className="space-y-6">
            {/* Modality Selection */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Target className="w-5 h-5" />
                Select Equipment
              </h2>
              
              <select
                value={selectedModality}
                onChange={(e) => setSelectedModality(e.target.value)}
                disabled={isActive || isCompleted}
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

            {/* Baseline Information */}
            {selectedModality && baselines[selectedModality] && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <h3 className="font-medium text-green-900 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Your Baseline
                </h3>
                <div className="text-2xl font-bold text-green-800">
                  {baselines[selectedModality].baseline.toFixed(2)} {baselines[selectedModality].units}/min
                </div>
                <p className="text-sm text-green-700 mt-1">
                  From time trial on {new Date(baselines[selectedModality].date).toLocaleDateString()}
                </p>
                
                {/* Show target paces for different workout types */}
                <div className="mt-4 space-y-2">
                  <h4 className="font-medium text-green-900 text-sm">Target Paces:</h4>
                  <div className="text-sm text-green-700">
                    <div>EMOM: {(baselines[selectedModality].baseline * 0.85).toFixed(2)} {baselines[selectedModality].units}/min (85%)</div>
                    <div>AMRAP: {(baselines[selectedModality].baseline * 0.90).toFixed(2)} {baselines[selectedModality].units}/min (90%)</div>
                    <div>Conditioning: {(baselines[selectedModality].baseline * 0.80).toFixed(2)} {baselines[selectedModality].units}/min (80%)</div>
                  </div>
                </div>
              </div>
            )}

            {/* Workout Controls */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Timer className="w-5 h-5" />
                Workout Controls
              </h2>
              
              <div className="space-y-4">
                {!isActive && !isCompleted && (
                  <button
                    onClick={startWorkout}
                    disabled={!selectedModality || !baselines[selectedModality]}
                    className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Play className="w-5 h-5" />
                    Start Workout
                  </button>
                )}
                
                {isActive && (
                  <button
                    onClick={pauseWorkout}
                    className="w-full bg-yellow-600 text-white px-6 py-3 rounded-lg hover:bg-yellow-700 flex items-center justify-center gap-2"
                  >
                    <Pause className="w-5 h-5" />
                    Pause
                  </button>
                )}
                
                {isPaused && (
                  <button
                    onClick={resumeWorkout}
                    className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                  >
                    <Play className="w-5 h-5" />
                    Resume
                  </button>
                )}
                
                {(isActive || isPaused) && (
                  <button
                    onClick={completeWorkout}
                    className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Complete Workout
                  </button>
                )}
                
                <button
                  onClick={resetWorkout}
                  className="w-full bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-5 h-5" />
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* Right Side - Workout Display */}
          <div className="space-y-6">
            {/* Current Interval */}
            {getCurrentInterval() && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Current Interval
                </h2>
                
                <div className="text-center mb-6">
                  <div className="text-4xl font-bold text-gray-900 mb-2">
                    {formatTime(timeRemaining)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {getCurrentInterval()?.description}
                  </div>
                </div>
                
                {getCurrentTargetPace() && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-medium text-blue-900 mb-2">Target Pace</h3>
                    <div className="text-2xl font-bold text-blue-800">
                      {getCurrentTargetPace().pace.toFixed(2)} {getCurrentTargetPace().units}/min
                    </div>
                    <p className="text-sm text-blue-700 mt-1">
                      {getCurrentTargetPace().intensity}% of your baseline
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Workout Progress */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Progress</h2>
              
              <div className="space-y-3">
                {sessionData.intervals.map((interval, index) => (
                  <div
                    key={interval.id}
                    className={`p-3 rounded-lg border ${
                      index === currentInterval && isActive
                        ? 'bg-blue-50 border-blue-200'
                        : interval.completed
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        Interval {interval.id}
                      </span>
                      <span className="text-sm text-gray-500">
                        {interval.duration}s
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {interval.description}
                    </div>
                    {interval.targetPace && (
                      <div className="text-xs text-blue-600 mt-1">
                        Target: {interval.targetPace.pace.toFixed(2)} {interval.targetPace.units}/min ({interval.targetPace.intensity}%)
                      </div>
                    )}
                    {interval.completed && (
                      <div className="flex items-center gap-2 mt-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-sm text-green-700">Completed</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Workout Completion Summary */}
            {isCompleted && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <h3 className="font-medium text-green-900 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Workout Completed!
                </h3>
                <div className="space-y-2 text-sm text-green-700">
                  <div>Intervals completed: {sessionData.intervals.filter(i => i.completed).length}/{sessionData.intervals.length}</div>
                  <div>Total duration: {Math.round(sessionData.intervals.reduce((sum, i) => sum + i.duration, 0) / 60)} minutes</div>
                  {getCurrentTargetPace() && (
                    <div>Target pace: {getCurrentTargetPace().pace.toFixed(2)} {getCurrentTargetPace().units}/min</div>
                  )}
                </div>
                <button
                  onClick={onBack}
                  className="mt-4 w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                >
                  Return to Dashboard
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Database Connection */}
        {!connected && (
          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-medium text-blue-900 mb-2">Demo Mode - Connect for Real Data</h3>
            <p className="text-sm text-blue-700">
              Please connect to your database from the Dashboard to load real workout data and time trial baselines.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrainingDayComponent;

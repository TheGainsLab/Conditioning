import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  CheckCircle, 
  Clock, 
  Target, 
  AlertCircle,
  ArrowLeft,
  Timer,
  Zap,
  History,
  BarChart3
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
  
  // Performance metrics (rolling_avg_ratio, learned_max_pace)
  const [performanceMetrics, setPerformanceMetrics] = useState(null);
  
  // Workout history for this day_type/modality
  const [workoutHistory, setWorkoutHistory] = useState([]);

  // Workout execution
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [currentInterval, setCurrentInterval] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [currentPhase, setCurrentPhase] = useState('work'); // 'work' or 'rest'
  const [sessionData, setSessionData] = useState({
    intervals: [],
    totalOutput: 0,
    averagePace: 0,
    averageHeartRate: null,
    peakHeartRate: null,
    perceivedExertion: null
  });
  const [isWorkoutSaved, setIsWorkoutSaved] = useState(false); // Track if workout has been logged
  const [rpeValue, setRpeValue] = useState(5); // Track RPE slider value for display
  
  // Database connection state
  const [connected, setConnected] = useState(false);
  
  // Timer ref
  const intervalRef = useRef(null);
  // Refs for accessing current state in timer callback
  const currentPhaseRef = useRef('work');
  const currentIntervalRef = useRef(0);
  const sessionDataRef = useRef({ intervals: [] });
  
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

  // Load baseline when modality changes
  useEffect(() => {
    if (selectedModality) {
      loadBaselineForModality();
    }
  }, [selectedModality]);

  // Load performance metrics and workout history when modality and workout are available
  useEffect(() => {
    // Check connection directly - same pattern as loadWorkoutData
    const isActuallyConnected = databaseService.isConnected();
    if (selectedModality && workout?.day_type && isActuallyConnected) {
      console.log('🔄 Loading performance metrics and workout history');
      loadPerformanceMetrics();
      loadWorkoutHistory();
    }
  }, [selectedModality, workout?.day_type, connected]);

  // Auto-recalculate target paces when baseline or performance metrics change
  useEffect(() => {
    if (selectedModality && baselines[selectedModality] && (performanceMetrics !== null || !connected)) {
      console.log('🔄 Auto-recalculating paces due to data change');
      recalculateTargetPaces();
    } else if (!selectedModality || !baselines[selectedModality]) {
      console.log('🔄 Cannot recalculate paces - baselines not loaded yet');
    }
  }, [selectedModality, baselines, performanceMetrics]);

  // Check connection status
  useEffect(() => {
    const isConnected = databaseService.isConnected();
    console.log('🔍 TrainingDay: Database connection status:', isConnected);
    setConnected(isConnected);
    
    const unsubscribe = databaseService.subscribe((apiKey) => {
      const newConnected = !!apiKey;
      console.log('🔌 TrainingDayComponent connection changed:', newConnected);
      setConnected(newConnected);
    });
    
    return unsubscribe;
  }, []);

  // Keep refs in sync with state
  useEffect(() => {
    currentPhaseRef.current = currentPhase;
  }, [currentPhase]);

  useEffect(() => {
    currentIntervalRef.current = currentInterval;
  }, [currentInterval]);

  useEffect(() => {
    sessionDataRef.current = sessionData;
  }, [sessionData]);

  // Timer effect for workout intervals
  useEffect(() => {
    if (isActive && timeRemaining > 0) {
      intervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          const newTime = prev - 1;
          
          if (newTime === 0) {
            // Time segment completed - handle phase transition
            handlePhaseCompletion();
          }
          
          return newTime;
        });
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }

    return () => clearInterval(intervalRef.current);
  }, [isActive, timeRemaining, currentPhase, currentInterval]);

  // Handle completion of work or rest phase
  const handlePhaseCompletion = () => {
    // Use refs to get latest values in timer callback
    const phase = currentPhaseRef.current;
    const intervalIndex = currentIntervalRef.current;
    const data = sessionDataRef.current;
    const currentInt = data.intervals[intervalIndex];
    
    if (phase === 'work') {
      // Work phase completed - switch to rest phase if rest duration exists
      if (currentInt && currentInt.restDuration && currentInt.restDuration > 0) {
        setCurrentPhase('rest');
        setTimeRemaining(currentInt.restDuration);
        // Mark work as completed
        completeWorkPhase();
      } else {
        // No rest period - move to next interval's work phase
        completeCurrentInterval();
      }
    } else {
      // Rest phase completed - move to next interval's work phase
      completeCurrentInterval();
    }
  };

  const loadWorkoutData = async () => {
    setLoading(true);
    setError(null);
    
    const isActuallyConnected = databaseService.isConnected();
    
    console.log('🔍 TrainingDay: Loading workout for day', dayNumber);
    
    try {
      if (isActuallyConnected) {
        console.log('✅ Connected - loading workout for day:', dayNumber);
        const workoutData = await databaseService.loadWorkoutForDay(dayNumber);
        console.log('📦 Workout data received:', workoutData);
        
        if (workoutData) {
          setWorkout(workoutData);
          initializeWorkout(workoutData);
        } else {
          console.warn('⚠️ No workout found for day:', dayNumber);
          setError('No workout found for this day');
        }
      } else {
        console.warn('⚠️ NOT CONNECTED - using demo data');
        // Demo mode - create sample workout data
        const demoWorkout = createDemoWorkout(dayNumber);
        setWorkout(demoWorkout);
        initializeWorkout(demoWorkout);
      }
    } catch (err) {
      console.error('❌ Error loading workout:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createDemoWorkout = (dayNum) => {
    const workoutTypes = ['EMOM', 'AMRAP', 'Conditioning'];
    const type = workoutTypes[dayNum % 3];
    
    return {
      id: dayNum,
      day_number: dayNum,
      workout_type: type,
      duration: 15 + (dayNum % 10),
      description: `${type} workout for Day ${dayNum}`,
      created_at: new Date().toISOString()
    };
  };

  const loadBaselineForModality = async () => {
    if (!selectedModality) return;
    
    console.log('🔍 Loading baseline for modality:', selectedModality);
    
    // Check connection directly - same pattern as loadWorkoutData
    const isActuallyConnected = databaseService.isConnected();
    console.log('🔍 Connection check for baseline:', isActuallyConnected);
    
    if (isActuallyConnected) {
      try {
        const baseline = await databaseService.loadTimeTrialBaselines(selectedModality);
        console.log('🔍 Baseline API response:', baseline);
        if (baseline && baseline.calculated_rpm) {
          console.log('✅ Baseline loaded successfully');
          setBaselines(prev => ({
            ...prev,
            [selectedModality]: {
              baseline: baseline.calculated_rpm,
              units: baseline.units,
              date: baseline.date
            }
          }));
    } else {
          console.warn('⚠️ Baseline is null or missing calculated_rpm');
      }
    } catch (error) {
        console.error('❌ Failed to load baseline:', error);
      }
      } else {
      console.warn('⚠️ Not connected - cannot load baseline');
    }
  };

  const createDemoBaseline = (modality) => {
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

  // Load performance metrics for this day_type and modality
  const loadPerformanceMetrics = async () => {
    // Check connection directly - same pattern as loadWorkoutData
    const isActuallyConnected = databaseService.isConnected();
    if (!isActuallyConnected || !selectedModality || !workout?.day_type) return;
    
    try {
      const userId = databaseService.userId;
      if (!userId) {
        console.warn('No user ID available for loading performance metrics');
        return;
      }
      
      const metrics = await databaseService.getPerformanceMetrics(
        userId,
        workout.day_type,
        selectedModality
      );
      
      if (metrics) {
        console.log('📊 Loaded performance metrics:', metrics);
        setPerformanceMetrics(metrics);
      } else {
        console.log('No performance metrics found yet');
        setPerformanceMetrics(null);
      }
    } catch (error) {
      console.error('Error loading performance metrics:', error);
      setPerformanceMetrics(null);
    }
  };

  // Load workout history for this day_type and modality
  const loadWorkoutHistory = async () => {
    // Check connection directly - same pattern as loadWorkoutData
    const isActuallyConnected = databaseService.isConnected();
    if (!isActuallyConnected || !selectedModality || !workout?.day_type) {
      return;
    }
    
    console.log('🔍 Loading workout history for:', {
      modality: selectedModality,
      day_type: workout.day_type
    });
    
    try {
      const userId = databaseService.userId;
      if (!userId) {
        console.warn('No user ID available for loading workout history');
        return;
      }
      
      // Load all completed sessions
      const allSessions = await databaseService.loadCompletedSessions();
      console.log('🔍 All completed sessions:', allSessions);
      
      // Filter sessions by modality and day_type
      const filteredSessions = (allSessions || []).filter(session => {
        const sessionModality = session.modality;
        const sessionDayType = session.day_type;
        const workoutDataDayType = workout.day_type;
        
        const modalityMatch = sessionModality === selectedModality;
        const dayTypeMatch = sessionDayType === workoutDataDayType;
        
        console.log('🔍 Session filter check:', {
          sessionId: session.id,
          sessionModality,
          sessionDayType,
          workoutDataDayType,
          modalityMatch,
          dayTypeMatch,
          passes: modalityMatch && dayTypeMatch
        });
        
        return modalityMatch && dayTypeMatch;
      });
      
      console.log('🔍 Filtered sessions:', filteredSessions);
      
      // Sort by date (most recent first)
      const sortedSessions = filteredSessions.sort((a, b) => {
        const dateA = new Date(a.date || a.created_at || 0);
        const dateB = new Date(b.date || b.created_at || 0);
        return dateB - dateA;
      });
      
      console.log('🔍 Final workout history:', sortedSessions);
      setWorkoutHistory(sortedSessions);
    } catch (error) {
      console.error('Error loading workout history:', error);
      setWorkoutHistory([]);
    }
  };

  const initializeWorkout = (workoutData) => {
    const intervals = parseWorkoutIntervals(workoutData);
    setSessionData(prev => ({
      ...prev,
      intervals: intervals.map(interval => ({
        ...interval,
        targetPace: null, // Will be calculated after baseline/metrics load
        actualOutput: 0,
        completed: false
      }))
    }));
    
    if (intervals.length > 0) {
      setTimeRemaining(intervals[0].duration);
    }
  };

  // Recalculate target paces for all intervals
  const recalculateTargetPaces = () => {
    setSessionData(prev => ({
      ...prev,
      intervals: prev.intervals.map(interval => ({
        ...interval,
        targetPace: calculateTargetPaceWithData(interval)
      }))
    }));
  };

  // Get workout progress percentage for donut chart
  const getWorkoutProgressPercentage = () => {
    if (sessionData.intervals.length === 0) return 0;
    const completed = sessionData.intervals.filter(i => i.completed).length;
    return Math.round((completed / sessionData.intervals.length) * 100);
  };

  // Get color for progress donut based on percentage
  const getProgressColor = (percentage) => {
    if (percentage >= 100) return '#3b82f6'; // Blue - complete
    if (percentage >= 75) return '#22c55e';  // Green
    if (percentage >= 50) return '#eab308'; // Yellow
    if (percentage >= 25) return '#f59e0b'; // Orange
    return '#ef4444'; // Red - just starting
  };

  // Helper function to get workout type display name (matches Dashboard)
  const getWorkoutTypeDisplayName = (dayType) => {
    if (!dayType) return 'Workout';
    const typeMap = {
      'time_trial': 'Time Trial',
      'endurance': 'Endurance',
      'anaerobic': 'Anaerobic',
      'max_aerobic_power': 'Max Aerobic Power',
      'interval': 'Interval',
      'polarized': 'Polarized',
      'threshold': 'Threshold',
      'tempo': 'Tempo',
      'recovery': 'Recovery',
      'flux': 'Flux',
      'flux_stages': 'Flux Stages',
      'devour': 'Devour',
      'towers': 'Towers',
      'towers_block_1': 'Towers',
      'afterburner': 'Afterburner',
      'synthesis': 'Synthesis',
      'hybrid_anaerobic': 'Hybrid Anaerobic',
      'hybrid_aerobic': 'Hybrid Aerobic',
      'ascending': 'Ascending',
      'descending': 'Descending',
      'ascending_devour': 'Ascending Devour',
      'descending_devour': 'Descending Devour',
      'infinity': 'Infinity',
      'infinity_block_1': 'Infinity',
      'infinity_block_2': 'Infinity',
      'atomic': 'Atomic',
      'atomic_block_2': 'Atomic',
      'rocket_races_a': 'Rocket Race A',
      'rocket_races_b': 'Rocket Race B'
    };
    return typeMap[dayType] || dayType?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Workout';
  };

  // Helper function to get workout type color (matches Dashboard)
  const getWorkoutTypeColor = (dayType) => {
    if (!dayType) return '#6b7280';
    const colorMap = {
      'time_trial': '#ef4444',      // red
      'endurance': '#10b981',        // green
      'anaerobic': '#f59e0b',        // amber
      'max_aerobic_power': '#8b5cf6', // purple
      'interval': '#3b82f6',        // blue
      'polarized': '#ec4899',       // pink
      'threshold': '#06b6d4',       // cyan
      'tempo': '#84cc16',           // lime
      'recovery': '#6b7280',        // gray
      'flux': '#14b8a6',            // teal
      'flux_stages': '#14b8a6',     // teal
      'devour': '#a855f7',          // violet
      'towers': '#f97316',          // orange
      'towers_block_1': '#f97316',  // orange
      'afterburner': '#dc2626',     // red-600
      'synthesis': '#6366f1',       // indigo
      'hybrid_anaerobic': '#f43f5e', // rose
      'hybrid_aerobic': '#22c55e',  // green-500
      'ascending': '#eab308',       // yellow
      'descending': '#a16207',      // yellow-700
      'ascending_devour': '#eab308', // yellow
      'descending_devour': '#a16207', // yellow-700
      'infinity': '#7c3aed',        // violet-600
      'infinity_block_1': '#7c3aed', // violet-600
      'infinity_block_2': '#7c3aed', // violet-600
      'atomic': '#06b6d4',          // cyan
      'atomic_block_2': '#06b6d4',  // cyan
      'rocket_races_a': '#ef4444',  // red
      'rocket_races_b': '#ef4444'   // red
    };
    return colorMap[dayType] || '#6b7280';
  };

  // Check if workout type needs inheritance (e.g., rocket_races_b inherits from rocket_races_a)
  const workoutNeedsInheritance = (dayType) => {
    return dayType === 'rocket_races_b';
  };

  // Parse workout intervals from all blocks
  const parseWorkoutIntervals = (workoutData) => {
    if (!workoutData || !workoutData.day_type) {
      return [{
        id: 1,
        type: 'Workout',
        duration: (workoutData?.duration || 20) * 60,
        targetPace: null,
        description: workoutData?.description || 'Workout',
        blockNumber: null,
        roundNumber: null
      }];
    }

    const dayType = workoutData.day_type;
    const intervals = [];
    let intervalId = 1;
    
    // Process all blocks (block_1, block_2, block_3, block_4)
    const blocks = [
      { params: workoutData.block_1_params, number: 1 },
      { params: workoutData.block_2_params, number: 2 },
      { params: workoutData.block_3_params, number: 3 },
      { params: workoutData.block_4_params, number: 4 }
    ].filter(block => block.params && Object.keys(block.params).length > 0);

    console.log(`🔍 Processing ${blocks.length} blocks for day type: ${dayType}`);

    blocks.forEach((block, blockIndex) => {
      const blockParams = block.params;
      const blockNumber = block.number;
      
      console.log(`🔍 Processing Block ${blockNumber}:`, blockParams);

      const workDuration = blockParams.workDuration || 60;
      const restDuration = blockParams.restDuration || 0;
      const rounds = blockParams.rounds || 1;
      const paceRange = blockParams.paceRange || null;
      const paceProgression = blockParams.paceProgression || null;

      // Check if block has valid duration data
      const hasValidDuration = workDuration > 0;
      console.log(`✅ Block ${blockNumber} has valid duration data:`, {
        workDuration,
        workDurationOptions: blockParams.workDurationOptions,
        restDuration,
        restDurationOptions: blockParams.restDurationOptions
      });

      // Special handling for different day types
      if (dayType === 'endurance' || dayType === 'time_trial') {
        // Single continuous interval
        intervals.push({
          id: intervalId++,
          type: dayType,
          duration: workDuration,
          restDuration: 0,
          targetPace: null,
          description: getWorkoutTypeDisplayName(dayType),
          blockNumber: blockNumber,
          roundNumber: 1,
          paceRange: paceRange,
          isMaxEffort: dayType === 'time_trial' || dayType === 'anaerobic' || blockParams.isMaxEffort
        });
      } else if (dayType === 'towers' || dayType === 'towers_block_1') {
        // Towers: pyramid pattern
        const towerPatterns = [
          workDuration * 0.5,
          workDuration,
          workDuration * 1.5,
          workDuration * 2,
          workDuration * 2.5
        ];
        
        towerPatterns.forEach((towerDuration, index) => {
        intervals.push({
          id: intervalId++,
            type: dayType,
            duration: Math.round(towerDuration),
            restDuration: restDuration || 60, // Default rest between towers
          targetPace: null,
            description: `${getWorkoutTypeDisplayName(dayType)} - Tower ${index + 1}`,
            blockNumber: blockNumber,
            roundNumber: index + 1,
            paceRange: paceRange,
            towerIndex: index
          });
        });
      } else if (dayType === 'atomic' || dayType === 'atomic_block_2') {
        // Atomic: short burst intervals
        const atomicWorkDuration = Math.round(workDuration * 0.3);
        const atomicRestDuration = Math.round((restDuration || 60) * 0.2);
        
        for (let i = 0; i < rounds; i++) {
          intervals.push({
            id: intervalId++,
            type: dayType,
            duration: atomicWorkDuration,
            restDuration: atomicRestDuration,
            targetPace: null,
            description: `${getWorkoutTypeDisplayName(dayType)} - Burst ${i + 1}`,
            blockNumber: blockNumber,
          roundNumber: i + 1,
            paceRange: paceRange
          });
        }
      } else if (dayType === 'infinity' || dayType === 'infinity_block_1' || dayType === 'infinity_block_2') {
        // Infinity: progressive pace over rounds
        const basePace = paceRange ? paceRange[0] : 0.85;
        const maxPace = paceRange ? paceRange[1] : 1.0;
        
    for (let i = 0; i < rounds; i++) {
          const progress = rounds > 1 ? i / (rounds - 1) : 0;
          const currentPaceMultiplier = basePace + (maxPace - basePace) * progress;
      
      intervals.push({
        id: intervalId++,
            type: dayType,
            duration: workDuration,
            restDuration: restDuration,
        targetPace: null,
            description: `${getWorkoutTypeDisplayName(dayType)} - Round ${i + 1}`,
            blockNumber: blockNumber,
        roundNumber: i + 1,
            paceRange: [currentPaceMultiplier, currentPaceMultiplier],
            paceProgression: 'increasing'
          });
        }
      } else if (dayType === 'ascending') {
        // Ascending: increasing work duration
        const workDurationIncrement = blockParams.workDurationIncrement || 30;
        
        for (let i = 0; i < rounds; i++) {
        intervals.push({
          id: intervalId++,
            type: dayType,
            duration: workDuration + (workDurationIncrement * i),
            restDuration: restDuration,
          targetPace: null,
            description: `${getWorkoutTypeDisplayName(dayType)} - Round ${i + 1}`,
            blockNumber: blockNumber,
          roundNumber: i + 1,
            paceRange: paceRange
          });
        }
      } else if (dayType === 'descending_devour') {
        // Descending devour: constant work, decreasing rest
        const restDurationIncrement = Math.abs(blockParams.restDurationIncrement || 10);
        
    for (let i = 0; i < rounds; i++) {
      intervals.push({
        id: intervalId++,
            type: dayType,
            duration: workDuration,
            restDuration: Math.max(0, restDuration - (restDurationIncrement * i)),
        targetPace: null,
            description: `${getWorkoutTypeDisplayName(dayType)} - Round ${i + 1}`,
            blockNumber: blockNumber,
        roundNumber: i + 1,
            paceRange: paceRange
          });
        }
      } else {
        // Standard interval workout
        for (let i = 0; i < rounds; i++) {
          intervals.push({
            id: intervalId++,
            type: dayType,
            duration: workDuration,
            restDuration: restDuration,
            targetPace: null,
            description: `${getWorkoutTypeDisplayName(dayType)} - Round ${i + 1}`,
            blockNumber: blockNumber,
            roundNumber: i + 1,
            paceRange: paceRange,
            paceProgression: paceProgression,
            isMaxEffort: blockParams.isMaxEffort || false
            });
          }
        }
    });
        
    // If no intervals were created, create a default one
    if (intervals.length === 0) {
          intervals.push({
        id: 1,
        type: dayType,
        duration: workoutData.total_work_time || 1200, // Use total_work_time if available, else 20 min default
            targetPace: null,
        description: getWorkoutTypeDisplayName(dayType),
        blockNumber: null,
        roundNumber: null
      });
    }
    
    return intervals;
  };

  // Calculate target pace using baseline and performance metrics
  const calculateTargetPaceWithData = (interval) => {
    if (!selectedModality || !baselines[selectedModality]) {
      return null;
    }
    
    const baseline = baselines[selectedModality].baseline;
    const units = baselines[selectedModality].units;
    const dayType = workout?.day_type;

    // For max effort days (time_trial, anaerobic, rocket races), use learned_max_pace if available
    const isMaxEffortDay = dayType === 'time_trial' || 
                          dayType === 'anaerobic' || 
                          dayType === 'rocket_races_a' || 
                          dayType === 'rocket_races_b' ||
                          interval.isMaxEffort;

    if (isMaxEffortDay && performanceMetrics?.learned_max_pace) {
      // Use learned max pace for max effort days
      return {
        pace: performanceMetrics.learned_max_pace,
        units: units,
        intensity: 100,
            baseline: baseline,
        source: 'learned_max'
      };
    }

    // Use paceRange from the interval data (always available from database)
    // Use the midpoint of the range
    let intensityMultiplier = (interval.paceRange[0] + interval.paceRange[1]) / 2;

    // Apply performance metrics adjustment - direct multiplication
    let metricsWereApplied = false;
    if (performanceMetrics?.rolling_avg_ratio) {
      intensityMultiplier *= performanceMetrics.rolling_avg_ratio;
      metricsWereApplied = true;
    }

    return {
      pace: baseline * intensityMultiplier,
      units: units,
      intensity: Math.round(intensityMultiplier * 100),
            baseline: baseline,
      source: metricsWereApplied ? 'metrics_adjusted' : 'baseline_only'
    };
  };

  // Mark work phase as completed (but stay on same interval for rest)
  const completeWorkPhase = () => {
    const intervalIndex = currentIntervalRef.current;
    setSessionData(prev => {
      const updatedIntervals = [...prev.intervals];
      if (updatedIntervals[intervalIndex]) {
        updatedIntervals[intervalIndex].workCompleted = true;
      }
      return {
        ...prev,
        intervals: updatedIntervals
      };
    });
  };

  // Move to next interval's work phase (called after rest completes or if no rest)
  const completeCurrentInterval = () => {
    const intervalIndex = currentIntervalRef.current;
    setSessionData(prev => {
      const updatedIntervals = [...prev.intervals];
      if (updatedIntervals[intervalIndex]) {
        updatedIntervals[intervalIndex].completed = true;
      }
      
      // Move to next interval's work phase
      const nextInterval = intervalIndex + 1;
      if (nextInterval < updatedIntervals.length) {
        setCurrentInterval(nextInterval);
        setCurrentPhase('work'); // Reset to work phase
        setTimeRemaining(updatedIntervals[nextInterval].duration);
      } else {
        // All intervals completed - wait for user to enter results
        setIsActive(false);
        setIsCompleted(true);
        // Don't auto-save - wait for user to submit results via form
      }
      
      return {
        ...prev,
        intervals: updatedIntervals
      };
    });
  };

  const startWorkout = () => {
    if (!selectedModality) {
      window.alert('Please select a modality before starting');
      return;
    }
    
    if (!baselines[selectedModality]) {
      window.alert('No baseline found for selected modality. Please complete a time trial first.');
      return;
    }
    
    setIsActive(true);
    setIsPaused(false);
    
    // Initialize timer with first interval's work phase
    if (sessionData.intervals.length > 0) {
      setTimeRemaining(sessionData.intervals[0].duration);
      setCurrentInterval(0);
      setCurrentPhase('work');
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
    // Don't auto-save - wait for user to submit results via form
  };

  const resetWorkout = () => {
    setIsActive(false);
    setIsPaused(false);
    setIsCompleted(false);
    setIsWorkoutSaved(false);
    setRpeValue(5); // Reset RPE slider to default
    setCurrentInterval(0);
    setCurrentPhase('work');
    setSessionData(prev => ({
      ...prev,
      intervals: prev.intervals.map(interval => ({
        ...interval,
        actualOutput: 0,
        completed: false,
        workCompleted: false
      })),
      totalOutput: 0,
      averagePace: 0,
      averageHeartRate: null,
      peakHeartRate: null,
      perceivedExertion: null
    }));
    
    if (sessionData.intervals.length > 0) {
      setTimeRemaining(sessionData.intervals[0].duration);
    }
  };

  const saveWorkoutSession = async (formValues = null) => {
    if (!connected) return;
    
    if (!selectedModality || !baselines[selectedModality]) {
      console.warn('Cannot save: no modality selected or baseline missing');
      return;
    }

    // Use form values if provided (from immediate form submission), otherwise use state
    const totalOutput = formValues?.totalOutput ?? sessionData.totalOutput;
    const averagePace = formValues?.averagePace ?? sessionData.averagePace;
    const averageHeartRate = formValues?.averageHeartRate ?? sessionData.averageHeartRate;
    const peakHeartRate = formValues?.peakHeartRate ?? sessionData.peakHeartRate;
    const perceivedExertion = formValues?.perceivedExertion ?? sessionData.perceivedExertion;

    if (totalOutput === 0) {
      console.warn('Cannot save: total output is 0');
      return;
    }
    
    try {
      // Load user's program_version
      let programVersion = await databaseService.loadProgramVersion();
      
      // Default to '5-day' if null (backward compatibility)
      if (!programVersion) {
        programVersion = '5-day';
      }
      
      // Get program_day_number for this source day_number
      let programDayNumber = null;
      if (programVersion === '5-day') {
        programDayNumber = dayNumber;
      } else if (programVersion === '3-day') {
        programDayNumber = await databaseService.getProgramDayNumber(
          dayNumber,
          programVersion
        );
      }
      
      if (programDayNumber === null) {
        programDayNumber = dayNumber;
      }

      // Calculate performance ratio if we have target pace
      let performanceRatio = null;
      
      console.log('🔍 Performance Ratio Calculation Debug:', {
        totalIntervals: sessionData.intervals.length,
        intervalsWithTargetPace: sessionData.intervals.filter(i => i.targetPace).length,
        averagePace: averagePace,
        sampleIntervals: sessionData.intervals.slice(0, 3).map(i => ({
          hasTargetPace: !!i.targetPace,
          targetPaceValue: i.targetPace?.pace
        }))
      });
      
      const avgTargetPace = sessionData.intervals
        .filter(i => i.targetPace)
        .reduce((sum, i) => sum + i.targetPace.pace, 0) / sessionData.intervals.filter(i => i.targetPace).length;
      
      console.log('📊 Calculation Results:', {
        avgTargetPace: avgTargetPace,
        averagePace: averagePace,
        conditionPasses: avgTargetPace > 0 && averagePace > 0,
        willCalculate: avgTargetPace > 0 && averagePace > 0
      });
      
      if (avgTargetPace > 0 && averagePace > 0) {
        performanceRatio = averagePace / avgTargetPace;
        console.log('✅ Performance Ratio Calculated:', performanceRatio);
      } else {
        console.warn('⚠️ Performance Ratio NOT Calculated:', {
          reason: !(avgTargetPace > 0) ? 'avgTargetPace <= 0' : 'averagePace <= 0',
          avgTargetPace,
          averagePace
        });
      }
      
      const sessionDataToSave = {
        user_id: databaseService.userId,
        program_day: dayNumber,
        program_version: programVersion,
        program_day_number: programDayNumber,
        workout_id: workout?.id,
        day_type: workout?.day_type,
        date: new Date().toISOString().split('T')[0],
        completed: true,
        total_output: totalOutput,
        actual_pace: averagePace,
        target_pace: avgTargetPace || null,
        performance_ratio: performanceRatio,
        modality: selectedModality,
        average_heart_rate: averageHeartRate,
        peak_heart_rate: peakHeartRate,
        perceived_exertion: perceivedExertion,
        workout_data: {
          intervals_completed: sessionData.intervals.filter(i => i.completed).length,
          total_intervals: sessionData.intervals.length
        }
      };

      console.log('💾 Saving workout session with:', {
        total_output: sessionDataToSave.total_output,
        actual_pace: sessionDataToSave.actual_pace,
        target_pace: sessionDataToSave.target_pace,
        performance_ratio: sessionDataToSave.performance_ratio,
        day_type: sessionDataToSave.day_type
      });

      await databaseService.saveWorkoutSession(sessionDataToSave);
      
      // Update performance metrics after saving
      const isMaxEffort = workout?.day_type === 'time_trial' || 
                         workout?.day_type === 'anaerobic' || 
                         workout?.day_type === 'rocket_races_a' || 
                         workout?.day_type === 'rocket_races_b';
      
      // For max effort days, update using actualPace (doesn't need performanceRatio)
      // For other days, only update if we have performanceRatio
      if (workout?.day_type && selectedModality && (isMaxEffort || performanceRatio)) {
        console.log('🔄 Updating performance metrics:', {
          day_type: workout.day_type,
          modality: selectedModality,
          performanceRatio: performanceRatio,
          actualPace: averagePace,
          isMaxEffort: isMaxEffort
        });
        
        await databaseService.updatePerformanceMetrics(
          databaseService.userId,
          workout.day_type,
          selectedModality,
          performanceRatio,
          averagePace,
          isMaxEffort
        );
        
        console.log('✅ Performance metrics updated');
      } else {
        console.warn('⚠️ Performance metrics NOT updated:', {
          reason: !workout?.day_type ? 'no day_type' : !selectedModality ? 'no modality' : isMaxEffort ? 'max effort but no actualPace' : 'no performanceRatio',
          performanceRatio,
          day_type: workout?.day_type,
          modality: selectedModality,
          isMaxEffort,
          actualPace: averagePace
        });
      }
      
      // Mark workout as saved
      setIsWorkoutSaved(true);
      
      console.log('Workout session saved successfully', {
        program_day: dayNumber,
        program_version: programVersion,
        program_day_number: programDayNumber
      });
    } catch (error) {
      console.error('Error saving workout session:', error);
      window.alert('Error saving workout session. Please try again.');
    }
  };

  // Handle result submission from the inline form
  const handleResultSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const totalOutputInput = formData.get('totalOutput');
    const averageHRInput = formData.get('averageHeartRate');
    const peakHRInput = formData.get('peakHeartRate');
    const perceivedExertionInput = formData.get('perceivedExertion');
    
    if (!totalOutputInput) {
      window.alert('Please enter a total output value');
      return;
    }

    const totalOutput = parseFloat(totalOutputInput);
    
    if (isNaN(totalOutput) || totalOutput < 0) {
      window.alert('Please enter a valid positive number for total output');
      return;
    }

    // Parse heart rate values (optional)
    let averageHeartRate = null;
    if (averageHRInput) {
      const parsed = parseFloat(averageHRInput);
      if (!isNaN(parsed) && parsed > 0) {
        averageHeartRate = parsed;
      }
    }

    let peakHeartRate = null;
    if (peakHRInput) {
      const parsed = parseFloat(peakHRInput);
      if (!isNaN(parsed) && parsed > 0) {
        peakHeartRate = parsed;
      }
    }

    // Parse perceived exertion (optional, 1-10)
    let perceivedExertion = null;
    if (perceivedExertionInput) {
      const parsed = parseInt(perceivedExertionInput);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
        perceivedExertion = parsed;
      }
    }

    // Calculate average pace and update session data
    const totalDuration = sessionData.intervals.reduce((sum, interval) => sum + interval.duration, 0);
    const totalDurationInMinutes = totalDuration / 60;
    const averagePace = totalDurationInMinutes > 0 ? totalOutput / totalDurationInMinutes : 0;

    // Update session data with the entered values (for display)
    setSessionData(prev => ({
      ...prev,
      totalOutput: totalOutput,
      averagePace: averagePace,
      averageHeartRate: averageHeartRate,
      peakHeartRate: peakHeartRate,
      perceivedExertion: perceivedExertion
    }));

    // Save immediately with the values we just calculated (don't wait for state to update)
    await saveWorkoutSession({
      totalOutput: totalOutput,
      averagePace: averagePace,
      averageHeartRate: averageHeartRate,
      peakHeartRate: peakHeartRate,
      perceivedExertion: perceivedExertion
    });
  };

  // Skip to end - mirror natural completion (for testing)
  const skipToEnd = () => {
    if (!selectedModality || !baselines[selectedModality]) {
      window.alert('Please select a modality before skipping to end');
      return;
    }

    // Mark all intervals as completed (mirror natural completion)
    setSessionData(prev => ({
      ...prev,
      intervals: prev.intervals.map(interval => ({
        ...interval,
        completed: true,
        workCompleted: true
      }))
    }));

    // Mirror natural completion flow: stop workout, mark completed
    setIsActive(false);
    setIsCompleted(true);
    // Don't auto-save - wait for user to submit results via form
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (totalSeconds) => {
    if (!totalSeconds) return '0 min';
    const minutes = Math.floor(totalSeconds / 60);
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
  };

  const getCurrentInterval = () => {
    return sessionData.intervals[currentInterval] || null;
  };

  const getCurrentTargetPace = () => {
    const interval = getCurrentInterval();
    return interval?.targetPace || null;
  };

  // Calculate total work duration only (excludes rest)
  const getTotalWorkDuration = () => {
    if (workout?.total_work_time) {
      return workout.total_work_time;
    }
    
    return sessionData.intervals.reduce((sum, interval) => sum + interval.duration, 0);
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
      <div className="bg-white shadow-lg border-b">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to Dashboard
              </button>
              <div className="flex items-center gap-3">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Day {dayNumber}</h1>
              </div>
                {workout?.day_type && (
                  <div
                style={{
                      display: 'inline-block',
                      padding: '0.5rem 1rem',
                      background: getWorkoutTypeColor(workout.day_type),
                      borderRadius: '0.75rem',
                      fontSize: '0.875rem',
                      fontWeight: '700',
                      color: 'white',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                    }}
                  >
                    {getWorkoutTypeDisplayName(workout.day_type)}
              </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl px-4 py-3 border border-blue-200">
                <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">Duration</div>
                <div className="text-lg font-bold text-gray-900">{formatDuration(getTotalWorkDuration())}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Side - Workout Controls */}
          <div className="space-y-6">
            {/* Modality Selection */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-600" />
                Select Equipment
              </h2>
              
              {/* Equipment Category Buttons */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.75rem',
                marginBottom: '1rem'
              }}>
                {['Rowing', 'Cycling', 'Ski', 'Running'].map(category => {
                  const categoryModalities = modalities.filter(m => m.category === category);
                  const isSelected = selectedModality && modalities.find(m => m.value === selectedModality)?.category === category;
                  
                  return (
                    <button
                      key={category}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedModality(''); // Deselect if already selected
                        } else {
                          // Select first modality in category
                          setSelectedModality(categoryModalities[0].value);
                        }
                      }}
                      disabled={isActive || isCompleted}
                      style={{
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        border: '2px solid',
                        borderColor: isSelected ? '#2563eb' : '#e5e7eb',
                        background: isSelected ? '#eff6ff' : '#ffffff',
                        color: isSelected ? '#2563eb' : '#374151',
                        fontWeight: '600',
                        fontSize: '0.875rem',
                        cursor: (isActive || isCompleted) ? 'not-allowed' : 'pointer',
                        opacity: (isActive || isCompleted) ? 0.5 : 1,
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem'
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive && !isCompleted) {
                          e.target.style.transform = 'translateY(-1px)';
                          e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive && !isCompleted) {
                          e.target.style.transform = 'translateY(0)';
                          e.target.style.boxShadow = 'none';
                        }
                      }}
                    >
                      {category}
                      {isSelected && <CheckCircle style={{ width: '1rem', height: '1rem' }} />}
                    </button>
                  );
                })}
              </div>
              
              {/* Equipment Sub-menu */}
              {selectedModality && modalities.find(m => m.value === selectedModality) && (
                <div style={{
                  background: '#f8fafc',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  border: '1px solid #e2e8f0'
                }}>
                  <h3 style={{
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: '#475569',
                    marginBottom: '0.75rem'
                  }}>
                    {modalities.find(m => m.value === selectedModality)?.category} Equipment
                  </h3>
                  
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '0.5rem'
                  }}>
                    {modalities
                      .filter(m => m.category === modalities.find(mod => mod.value === selectedModality)?.category)
                      .map(modality => (
                        <button
                          key={modality.value}
                          onClick={() => setSelectedModality(modality.value)}
                          disabled={isActive || isCompleted}
                          style={{
                            padding: '0.75rem',
                            borderRadius: '0.375rem',
                            border: '1px solid',
                            borderColor: selectedModality === modality.value ? '#2563eb' : '#d1d5db',
                            background: selectedModality === modality.value ? '#2563eb' : '#ffffff',
                            color: selectedModality === modality.value ? '#ffffff' : '#374151',
                            fontWeight: '500',
                            fontSize: '0.875rem',
                            cursor: (isActive || isCompleted) ? 'not-allowed' : 'pointer',
                            opacity: (isActive || isCompleted) ? 0.5 : 1,
                            transition: 'all 0.2s ease',
                            textAlign: 'left'
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive && !isCompleted && selectedModality !== modality.value) {
                              e.target.style.background = '#f3f4f6';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive && !isCompleted && selectedModality !== modality.value) {
                              e.target.style.background = '#ffffff';
                            }
                          }}
                        >
                          {modality.label}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Performance Metrics */}
            {selectedModality && baselines[selectedModality] && performanceMetrics && (
              <div style={{
                background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                borderRadius: '1rem',
                boxShadow: '0 4px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                padding: '1.5rem',
                border: '2px solid #86efac'
              }}>
                <h3 style={{
                  fontWeight: '600',
                  color: '#065f46',
                  marginBottom: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '1.125rem'
                }}>
                  <BarChart3 size={24} color="#059669" />
                  Performance Metrics
                </h3>
                {performanceMetrics.rolling_avg_ratio && (
                  <div style={{
                    background: 'white',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    border: '1px solid #86efac'
                  }}>
                    <div style={{
                      fontSize: '0.75rem',
                      color: '#059669',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '0.25rem',
                      fontWeight: '500'
                    }}>Avg Performance Ratio</div>
                    <div style={{
                      fontSize: '1.125rem',
                      fontWeight: 'bold',
                      color: '#065f46'
                    }}>{(performanceMetrics.rolling_avg_ratio * 100).toFixed(1)}%</div>
                  </div>
                )}
                {performanceMetrics.learned_max_pace && (
                  <div style={{
                    background: 'white',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    border: '1px solid #86efac'
                  }}>
                    <div style={{
                      fontSize: '0.75rem',
                      color: '#059669',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '0.25rem',
                      fontWeight: '500'
                    }}>Learned Max Pace</div>
                    <div style={{
                      fontSize: '1.125rem',
                      fontWeight: 'bold',
                      color: '#065f46'
                    }}>
                      {performanceMetrics.learned_max_pace.toFixed(2)} <span style={{ fontSize: '0.875rem' }}>{baselines[selectedModality].units}/min</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Workout History - Always show */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.9)',
              borderRadius: '1rem',
              boxShadow: '0 4px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              padding: '1.5rem',
              border: '1px solid rgba(0, 0, 0, 0.1)'
            }}>
              <h2 style={{
                fontSize: '1.125rem',
                fontWeight: '600',
                color: '#111827',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <History size={20} color="#9333ea" />
                <span>Previous Sessions</span>
                {workoutHistory.length > 0 && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '0.75rem',
                    fontWeight: '400',
                    color: '#6b7280',
                    background: '#f3f4f6',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '9999px'
                  }}>
                    {workoutHistory.length}
                  </span>
                )}
              </h2>
              
              {workoutHistory.length > 0 ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  maxHeight: '16rem',
                  overflowY: 'auto'
                }}>
                  {workoutHistory.slice(0, 5).map((session, index) => (
                    <div 
                      key={session.id || index} 
                      style={{
                        padding: '1rem',
                        background: 'linear-gradient(90deg, #f9fafb 0%, #f3f4f6 100%)',
                        borderRadius: '0.75rem',
                        border: '1px solid #e5e7eb',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '0.5rem'
                      }}>
                        <span style={{
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          color: '#111827'
                        }}>
                          {session.date ? new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown Date'}
                        </span>
                        {session.actual_pace && (
                          <span style={{
                            fontSize: '0.875rem',
                            fontWeight: 'bold',
                            color: '#1e40af',
                            background: '#dbeafe',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.5rem'
                          }}>
                            {session.actual_pace.toFixed(2)} {baselines[selectedModality]?.units || 'units'}/min
                          </span>
                        )}
                      </div>
                      {session.performance_ratio && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          marginTop: '0.5rem'
                        }}>
                          <div style={{
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            color: '#4b5563',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                          }}>Performance</div>
                          <div style={{
                            fontSize: '0.875rem',
                            fontWeight: 'bold',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.25rem',
                            background: session.performance_ratio >= 0.95 && session.performance_ratio <= 1.05
                              ? '#dcfce7'
                              : session.performance_ratio < 0.95
                              ? '#fee2e2'
                              : '#fef3c7',
                            color: session.performance_ratio >= 0.95 && session.performance_ratio <= 1.05
                              ? '#166534'
                              : session.performance_ratio < 0.95
                              ? '#991b1b'
                              : '#92400e'
                          }}>
                            {(session.performance_ratio * 100).toFixed(1)}%
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '2rem 0',
                  color: '#6b7280'
                }}>
                  <History size={48} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                  <p style={{ fontSize: '0.875rem' }}>No previous sessions for this workout type</p>
                </div>
              )}
            </div>

            {/* Workout Controls */}
            <div style={{
              background: 'white',
              borderRadius: '0.75rem',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              padding: '1.5rem',
              border: '1px solid #f3f4f6'
            }}>
              <h2 style={{
                fontSize: '1.125rem',
                fontWeight: '600',
                color: '#111827',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <Timer style={{ width: '1.25rem', height: '1.25rem', color: '#ea580c' }} />
                Workout Controls
              </h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {!isActive && !isCompleted && (
                  <button
                    onClick={startWorkout}
                    disabled={!selectedModality || !baselines[selectedModality]}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #16a34a 0%, #059669 100%)',
                      color: 'white',
                      padding: '1rem 1.5rem',
                      borderRadius: '0.75rem',
                      border: 'none',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      cursor: (!selectedModality || !baselines[selectedModality]) ? 'not-allowed' : 'pointer',
                      opacity: (!selectedModality || !baselines[selectedModality]) ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedModality && baselines[selectedModality]) {
                        e.target.style.background = 'linear-gradient(135deg, #15803d 0%, #047857 100%)';
                        e.target.style.transform = 'translateY(-2px)';
                        e.target.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedModality && baselines[selectedModality]) {
                        e.target.style.background = 'linear-gradient(135deg, #16a34a 0%, #059669 100%)';
                        e.target.style.transform = 'translateY(0)';
                        e.target.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                      }
                    }}
                  >
                    <Play style={{ width: '1.25rem', height: '1.25rem' }} />
                    Start Workout
                  </button>
                )}
                
                {isActive && (
                  <button
                    onClick={pauseWorkout}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #eab308 0%, #f97316 100%)',
                      color: 'white',
                      padding: '1rem 1.5rem',
                      borderRadius: '0.75rem',
                      border: 'none',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'linear-gradient(135deg, #ca8a04 0%, #ea580c 100%)';
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'linear-gradient(135deg, #eab308 0%, #f97316 100%)';
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                    }}
                  >
                    <Pause style={{ width: '1.25rem', height: '1.25rem' }} />
                    Pause
                  </button>
                )}
                
                {isPaused && (
                  <button
                    onClick={resumeWorkout}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #16a34a 0%, #059669 100%)',
                      color: 'white',
                      padding: '1rem 1.5rem',
                      borderRadius: '0.75rem',
                      border: 'none',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'linear-gradient(135deg, #15803d 0%, #047857 100%)';
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'linear-gradient(135deg, #16a34a 0%, #059669 100%)';
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                    }}
                  >
                    <Play style={{ width: '1.25rem', height: '1.25rem' }} />
                    Resume
                  </button>
                )}
                
                {(isActive || isPaused) && (
                  <button
                    onClick={completeWorkout}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
                      color: 'white',
                      padding: '1rem 1.5rem',
                      borderRadius: '0.75rem',
                      border: 'none',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'linear-gradient(135deg, #1d4ed8 0%, #4338ca 100%)';
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)';
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                    }}
                  >
                    <CheckCircle style={{ width: '1.25rem', height: '1.25rem' }} />
                    Complete Workout
                  </button>
                )}

                {/* Skip to End button - only show when workout is active (for testing) */}
                {(isActive || isPaused) && (
                  <button
                    onClick={skipToEnd}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #9333ea 0%, #ec4899 100%)',
                      color: 'white',
                      padding: '1rem 1.5rem',
                      borderRadius: '0.75rem',
                      border: 'none',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'linear-gradient(135deg, #7e22ce 0%, #db2777 100%)';
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'linear-gradient(135deg, #9333ea 0%, #ec4899 100%)';
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                    }}
                    title="Skip to end and enter results manually (for testing)"
                  >
                    <Zap style={{ width: '1.25rem', height: '1.25rem' }} />
                    Skip to End (Test)
                  </button>
                )}
                
                <button
                  onClick={resetWorkout}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                    color: 'white',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.75rem',
                    border: 'none',
                    fontWeight: '500',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'linear-gradient(135deg, #4b5563 0%, #374151 100%)';
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                  }}
                >
                  <RotateCcw style={{ width: '1.25rem', height: '1.25rem' }} />
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* Right Side - Workout Display */}
          <div className="space-y-6">
            {/* Current Interval */}
            {getCurrentInterval() && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl shadow-lg p-6 border-2 border-blue-300">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Zap className="w-6 h-6 text-blue-600" />
                  Current Interval
                </h2>
                
                {/* Progress Donut */}
                <div className="text-center mb-6">
                  <div className="relative w-48 h-48 mx-auto mb-4" style={{ overflow: 'visible' }}>
                    <svg 
                      className="w-48 h-48" 
                      viewBox="0 0 192 192"
                      style={{ 
                        display: 'block',
                        position: 'relative',
                        zIndex: 1
                      }}
                    >
                      {/* Group for circles only - rotated so progress fills from top */}
                      <g transform="rotate(-90 96 96)">
                        {/* Background circle */}
                        <circle
                          cx="96"
                          cy="96"
                          r="88"
                          stroke="#e5e7eb"
                          strokeWidth="8"
                          fill="none"
                        />
                        {/* Progress circle - fills based on current phase (work or rest) */}
                        {(() => {
                          const currentInt = getCurrentInterval();
                          let progress = 0;
                          let totalDuration = 0;
                          
                          if (currentInt) {
                            if (currentPhase === 'work') {
                              // Work phase: progress based on work duration
                              totalDuration = currentInt.duration || 0;
                              const remaining = timeRemaining;
                              const elapsed = totalDuration - remaining;
                              progress = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;
                            } else {
                              // Rest phase: progress based on rest duration
                              totalDuration = currentInt.restDuration || 0;
                              const remaining = timeRemaining;
                              const elapsed = totalDuration - remaining;
                              progress = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;
                            }
                          }
                          
                          const circumference = 2 * Math.PI * 88;
                          const offset = circumference - (progress / 100) * circumference;
                          // Use blue for work, orange for rest
                          const strokeColor = currentPhase === 'work' ? '#3b82f6' : '#f97316';
                          const shadowColor = currentPhase === 'work' 
                            ? 'rgba(59, 130, 246, 0.3)' 
                            : 'rgba(249, 115, 22, 0.3)';
                          
                          return (
                            <circle
                              cx="96"
                              cy="96"
                              r="88"
                              stroke={strokeColor}
                              strokeWidth="8"
                              fill="none"
                              strokeLinecap="round"
                              strokeDasharray={circumference}
                              strokeDashoffset={offset}
                              className="transition-all duration-1000 ease-out"
                              style={{
                                filter: `drop-shadow(0 2px 4px ${shadowColor})`
                              }}
                            />
                          );
                        })()}
                      </g>
                      
                      {/* Day type and round - above timer */}
                      <text
                        x="96"
                        y="65"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="10"
                        fontWeight="600"
                        fill="#374151"
                        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                      >
                        {getCurrentInterval()?.description || getWorkoutTypeDisplayName(workout?.day_type) || 'Workout'}
                      </text>
                      
                      {/* Timer text - not rotated, so it appears horizontal */}
                      <text
                        x="96"
                        y="96"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="48"
                        fontWeight="bold"
                        fill="#111827"
                        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                      >
                        {formatTime(timeRemaining)}
                      </text>
                      
                      {/* Phase indicator (Work/Rest) - below timer */}
                      <text
                        x="96"
                        y="128"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="10"
                        fontWeight="600"
                        fill={currentPhase === 'work' ? '#3b82f6' : '#f97316'}
                        style={{ fontFamily: 'system-ui, -apple-system, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      >
                        {currentPhase === 'work' ? 'Work' : 'Rest'}
                      </text>
                    </svg>
                    </div>
                </div>
                
                {getCurrentTargetPace() && (
                  <div style={{
                    background: 'linear-gradient(135deg, #ede9fe 0%, #fce7f3 100%)',
                    borderRadius: '1rem',
                    boxShadow: '0 4px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    padding: '1.5rem',
                    border: '2px solid #c084fc'
                  }}>
                    <h3 style={{
                      fontWeight: '600',
                      color: '#6b21a8',
                      marginBottom: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '1.125rem'
                    }}>
                      <Target size={24} color="#9333ea" />
                      Target Pace
                      {getCurrentTargetPace().source === 'metrics_adjusted' && (
                        <span style={{
                          marginLeft: 'auto',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          background: '#f3e8ff',
                          color: '#9333ea',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '9999px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}>
                          AI Adjusted
                        </span>
                      )}
                    </h3>
                    
                    <div style={{
                      background: 'white',
                      borderRadius: '0.5rem',
                      padding: '0.75rem',
                      border: '1px solid #c084fc'
                    }}>
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#9333ea',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: '0.25rem',
                        fontWeight: '500'
                      }}>Target Pace</div>
                      <div style={{
                        fontSize: '1.5rem',
                        fontWeight: 'bold',
                        color: '#6b21a8',
                        marginBottom: '0.5rem'
                      }}>
                        {getCurrentTargetPace().pace.toFixed(2)} <span style={{ fontSize: '1rem', fontWeight: '500' }}>{getCurrentTargetPace().units}/min</span>
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#9333ea',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: '0.25rem',
                        fontWeight: '500'
                      }}>Intensity</div>
                      <div style={{
                        fontSize: '1.125rem',
                        fontWeight: 'bold',
                        color: '#6b21a8'
                      }}>
                        {getCurrentTargetPace().intensity}% of baseline
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Workout Progress */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-600" />
                Progress
                <span className="ml-auto text-sm font-normal text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                  {sessionData.intervals.filter(i => i.completed).length} / {sessionData.intervals.length}
                                  </span>
              </h2>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {sessionData.intervals.map((interval, index) => {
                  const isCurrent = index === currentInterval && isActive;
                  const isCompleted = interval.completed;
                  const target = interval.targetPace || calculateTargetPaceWithData(interval);
                  
                  // Calculate bar width based on duration (normalize to max duration)
                  const maxDuration = Math.max(...sessionData.intervals.map(i => i.duration));
                  const barWidth = maxDuration > 0 ? (interval.duration / maxDuration) * 100 : 0;
                  
                  // Determine bar color based on status
                  const barColor = isCurrent 
                    ? 'linear-gradient(to right, #3b82f6, #2563eb)' 
                    : isCompleted 
                    ? 'linear-gradient(to right, #16a34a, #15803d)' 
                    : 'linear-gradient(to right, #6b7280, #4b5563)';
                        
                        return (
                    <div
                      key={interval.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '0.75rem',
                        background: isCurrent 
                          ? 'rgba(59, 130, 246, 0.1)' 
                          : isCompleted 
                          ? 'rgba(22, 163, 74, 0.05)' 
                          : 'rgba(255, 255, 255, 0.5)',
                        borderRadius: '0.5rem',
                        border: isCurrent 
                          ? '1px solid rgba(59, 130, 246, 0.3)' 
                          : isCompleted 
                          ? '1px solid rgba(22, 163, 74, 0.3)' 
                          : '1px solid rgba(255, 255, 255, 0.3)'
                      }}
                    >
                      {/* Left label - Round number */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        width: '8rem',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        color: isCurrent ? '#1e40af' : isCompleted ? '#166534' : '#374151'
                      }}>
                        {isCompleted && <CheckCircle style={{ width: '1rem', height: '1rem', color: '#16a34a' }} />}
                        {isCurrent && <Zap style={{ width: '1rem', height: '1rem', color: '#3b82f6' }} />}
                                  <span>
                          {interval.blockNumber ? `Block ${interval.blockNumber} - ` : ''}Round {interval.roundNumber || interval.id}
                                  </span>
                            </div>
                            
                      {/* Bar chart */}
                      <div style={{
                        flex: 1,
                        background: '#e5e7eb',
                        borderRadius: '9999px',
                        height: '2rem',
                        position: 'relative',
                        overflow: 'hidden'
                      }}>
                        <div 
                          style={{
                            background: barColor,
                            height: '100%',
                            borderRadius: '9999px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingLeft: '0.75rem',
                            paddingRight: '0.75rem',
                            transition: 'width 0.5s ease',
                            width: `${Math.min(barWidth, 100)}%`,
                            minWidth: 'fit-content'
                          }}
                        >
                          <span style={{
                            color: 'white',
                            fontSize: '0.75rem',
                            fontWeight: '600'
                          }}>
                            {formatTime(interval.duration)}
                            {interval.restDuration > 0 && ` + ${formatTime(interval.restDuration)} rest`}
                                  </span>
                          {target && (() => {
                            const durationInMinutes = interval.duration / 60;
                            const totalWork = durationInMinutes * target.pace;
                            return (
                              <span style={{
                                color: 'white',
                                fontSize: '0.75rem',
                                fontWeight: '500',
                                marginLeft: '0.5rem'
                              }}>
                                {totalWork.toFixed(1)} {target.units}
                              </span>
                            );
                          })()}
                              </div>
                          </div>
                      
                      {/* Right labels - Target pace details */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        width: '8rem',
                        justifyContent: 'flex-end',
                        fontSize: '0.75rem'
                      }}>
                        {target ? (
                          <>
                            <span style={{
                              color: '#6b7280',
                              fontWeight: '500'
                            }}>
                              {target.intensity}%
                                        </span>
                            {target.source === 'metrics_adjusted' && (
                              <span style={{
                                background: '#9333ea',
                                color: 'white',
                                padding: '0.125rem 0.375rem',
                                borderRadius: '0.25rem',
                                fontSize: '0.625rem',
                                fontWeight: '600'
                              }}>
                                AI
                                        </span>
                            )}
                          </>
                        ) : (
                          <span style={{
                            color: '#9ca3af',
                            fontStyle: 'italic',
                            fontSize: '0.625rem'
                          }}>
                            Loading...
                                          </span>
                                        )}
                                      </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

            {/* Workout Completion Summary */}
            {isCompleted && (
              <div style={{
                background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                borderRadius: '1rem',
                border: '2px solid #22c55e',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                padding: '1.5rem'
              }}>
                <h3 className="font-bold text-2xl text-green-900 mb-4 flex items-center gap-3">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                  Workout Completed!
                </h3>
                <div style={{
                  background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
                  borderRadius: '0.75rem',
                  padding: '1.25rem',
                  border: '2px solid #86efac',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                  marginBottom: '1rem'
                }}>
                  <div className="space-y-3 text-sm font-medium text-green-800">
                    <div className="flex items-center justify-between">
                      <span>Intervals completed:</span>
                      <span className="font-bold text-green-700">{sessionData.intervals.filter(i => i.completed).length}/{sessionData.intervals.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Total duration:</span>
                      <span className="font-bold text-green-700">{formatDuration(getTotalWorkDuration())}</span>
                    </div>
                    {getCurrentTargetPace() && (
                      <div className="flex items-center justify-between">
                        <span>Target pace:</span>
                        <span className="font-bold text-green-700">{getCurrentTargetPace().pace.toFixed(2)} {getCurrentTargetPace().units}/min</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Show input form if results not yet entered */}
                {sessionData.totalOutput === 0 && selectedModality && baselines[selectedModality] && !isWorkoutSaved && (
                  <form onSubmit={handleResultSubmit} className="mb-6">
                    <div style={{
                      background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
                      borderRadius: '1rem',
                      padding: '1.5rem',
                      border: '2px solid #22c55e',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                    }}>
                      {/* Total Output */}
                      <div className="mb-6">
                        <label htmlFor="totalOutput" className="block text-sm font-bold text-green-900 mb-3 uppercase tracking-wide">
                          Enter Total Output ({baselines[selectedModality].units})
                        </label>
                        <input
                          type="number"
                          id="totalOutput"
                          name="totalOutput"
                          step="0.1"
                          min="0"
                          required
                          className="w-full px-5 py-4 border-2 border-green-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-xl font-bold bg-white shadow-sm transition-all"
                          placeholder={`Enter total ${baselines[selectedModality].units}`}
                          autoFocus
                          style={{
                            fontSize: '1.25rem',
                            fontWeight: 'bold'
                          }}
                        />
                      </div>

                      {/* Heart Rate Fields */}
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                          <label htmlFor="averageHeartRate" className="block text-sm font-semibold text-green-800 mb-2">
                            Average Heart Rate (bpm)
                          </label>
                          <input
                            type="number"
                            id="averageHeartRate"
                            name="averageHeartRate"
                            step="1"
                            min="0"
                            max="220"
                            className="w-full px-4 py-3 border-2 border-green-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg font-semibold bg-white shadow-sm"
                            placeholder="Optional"
                          />
                        </div>
                        <div>
                          <label htmlFor="peakHeartRate" className="block text-sm font-semibold text-green-800 mb-2">
                            Peak Heart Rate (bpm)
                          </label>
                          <input
                            type="number"
                            id="peakHeartRate"
                            name="peakHeartRate"
                            step="1"
                            min="0"
                            max="220"
                            className="w-full px-4 py-3 border-2 border-green-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg font-semibold bg-white shadow-sm"
                            placeholder="Optional"
                          />
                        </div>
                      </div>

                      {/* RPE Slider */}
                      <div className="mb-6">
                        <label htmlFor="perceivedExertion" className="block text-sm font-semibold text-green-800 mb-3">
                          Rate of Perceived Exertion (RPE): <span className="font-bold text-green-700">{rpeValue}</span>/10
                        </label>
                        <div className="px-2">
                          <input
                            type="range"
                            id="perceivedExertion"
                            name="perceivedExertion"
                            min="1"
                            max="10"
                            step="1"
                            value={rpeValue}
                            className="w-full h-3 bg-gradient-to-r from-green-200 via-green-400 to-green-600 rounded-lg appearance-none cursor-pointer"
                            style={{
                              background: 'linear-gradient(to right, #86efac 0%, #4ade80 50%, #22c55e 100%)',
                              WebkitAppearance: 'none',
                              appearance: 'none',
                              height: '12px',
                              borderRadius: '9999px'
                            }}
                            onChange={(e) => {
                              setRpeValue(parseInt(e.target.value));
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-600 mt-2 px-2">
                          <span>1 - Very Easy</span>
                          <span>5 - Moderate</span>
                          <span>10 - Max Effort</span>
                        </div>
                        <style>{`
                          input[type="range"]::-webkit-slider-thumb {
                            appearance: none;
                            width: 24px;
                            height: 24px;
                            border-radius: 50%;
                            background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
                            border: 3px solid white;
                            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
                            cursor: pointer;
                            transition: all 0.2s;
                          }
                          input[type="range"]::-webkit-slider-thumb:hover {
                            transform: scale(1.1);
                            box-shadow: 0 4px 10px rgba(34, 197, 94, 0.4);
                          }
                          input[type="range"]::-moz-range-thumb {
                            width: 24px;
                            height: 24px;
                            border-radius: 50%;
                            background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
                            border: 3px solid white;
                            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
                            cursor: pointer;
                            transition: all 0.2s;
                          }
                          input[type="range"]::-moz-range-thumb:hover {
                            transform: scale(1.1);
                            box-shadow: 0 4px 10px rgba(34, 197, 94, 0.4);
                          }
                        `}</style>
                      </div>

                      {/* Submit Button */}
                      <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-green-600 via-emerald-600 to-green-700 text-white px-8 py-4 rounded-xl hover:from-green-700 hover:via-emerald-700 hover:to-green-800 font-bold text-lg shadow-xl transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                        style={{
                          background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                          boxShadow: '0 10px 25px -5px rgba(34, 197, 94, 0.4)'
                        }}
                      >
                        Save Results
                      </button>
                    </div>
                  </form>
                )}

                {/* Show saved results and logged status */}
                {sessionData.totalOutput > 0 && (
                  <div className="space-y-3 mb-4">
                    <div className="bg-white rounded-lg p-4 border border-green-200">
                      <div className="space-y-2 text-sm font-medium text-green-800">
                        <div className="flex items-center justify-between">
                          <span>Total output:</span>
                          <span className="font-bold text-green-700">{sessionData.totalOutput.toFixed(2)} {selectedModality && baselines[selectedModality] ? baselines[selectedModality].units : ''}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Average pace:</span>
                          <span className="font-bold text-green-700">{sessionData.averagePace.toFixed(2)} {selectedModality && baselines[selectedModality] ? baselines[selectedModality].units + '/min' : ''}</span>
                        </div>
                        {sessionData.averageHeartRate && (
                          <div className="flex items-center justify-between">
                            <span>Average HR:</span>
                            <span className="font-bold text-green-700">{sessionData.averageHeartRate} bpm</span>
                          </div>
                        )}
                        {sessionData.peakHeartRate && (
                          <div className="flex items-center justify-between">
                            <span>Peak HR:</span>
                            <span className="font-bold text-green-700">{sessionData.peakHeartRate} bpm</span>
                          </div>
                        )}
                        {sessionData.perceivedExertion && (
                          <div className="flex items-center justify-between">
                            <span>RPE:</span>
                            <span className="font-bold text-green-700">{sessionData.perceivedExertion}/10</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {isWorkoutSaved && connected && (
                      <div className="bg-green-50 border-2 border-green-300 rounded-lg p-3 flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                        <span className="text-sm font-semibold text-green-800">Workout logged successfully!</span>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={onBack}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-3 rounded-xl hover:from-green-700 hover:to-emerald-700 font-semibold shadow-lg transition-all transform hover:scale-105"
                >
                  Return to Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Database Connection */}
      {!connected && (
        <div className="mt-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl shadow-lg">
          <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Demo Mode - Connect for Real Data
          </h3>
          <p className="text-sm text-blue-700">
            Please connect to your database from the Dashboard to load real workout data and time trial baselines.
          </p>
        </div>
      )}
    </div>
  );
};

export default TrainingDayComponent;

import React, { useState, useEffect } from 'react';
import { Calendar, Lock, Unlock, Trophy, TrendingUp, Settings, User, ChevronRight, Clock, CheckCircle } from 'lucide-react';

const Dashboard = () => {
  // User state
  const [user, setUser] = useState({
    name: 'Demo User',
    months_unlocked: 3,
    current_day: 25
  }); // Mock user for demo
  const [loading, setLoading] = useState(false); // Start with false for demo
  const [selectedMonth, setSelectedMonth] = useState(1);
  const [workouts, setWorkouts] = useState([]);
  const [completedSessions, setCompletedSessions] = useState([
    { day_number: 1 }, { day_number: 2 }, { day_number: 3 }, { day_number: 21 }
  ]); // Mock completed sessions
  
  // Database connection
  const [supabaseUrl] = useState('https://jucqobldwrhehufxdisd.supabase.co');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [connected, setConnected] = useState(false); // Will be true when API key is entered
  const [userId] = useState(1);

  // Program structure - 36 months, 20 days each = 720 days
  const totalMonths = 36;
  const daysPerMonth = 20;

  useEffect(() => {
    if (supabaseKey) {
      setConnected(true);
      loadUserData();
      loadWorkouts();
      loadCompletedSessions();
    }
  }, [supabaseKey]);

  const loadUserData = async () => {
    if (!supabaseKey) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          setUser(data[0]);
          setConnected(true);
        }
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWorkouts = async () => {
    if (!supabaseKey) return;
    
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/workouts?order=day_number.asc`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setWorkouts(data);
      }
    } catch (error) {
      console.error('Failed to load workouts:', error);
    }
  };

  const loadCompletedSessions = async () => {
    if (!supabaseKey) return;
    
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/workout_sessions?user_id=eq.${userId}`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCompletedSessions(data);
      }
    } catch (error) {
      console.error('Failed to load completed sessions:', error);
    }
  };

  const getMonthAccess = (monthNumber) => {
    if (!user) return false;
    // User gains access to new month with each payment
    // Assuming user has 'months_unlocked' field or similar
    return monthNumber <= (user.months_unlocked || 1);
  };

  const getCurrentDay = () => {
    if (!user) return 1;
    // Calculate current day based on user's progression
    return user.current_day || 1;
  };

  const getDayStatus = (dayNumber) => {
    const completedDays = completedSessions.map(session => session.day_number || session.workout_day);
    if (completedDays.includes(dayNumber)) {
      return 'completed';
    } else if (dayNumber === getCurrentDay()) {
      return 'current';
    } else if (dayNumber < getCurrentDay()) {
      return 'available';
    } else {
      return 'locked';
    }
  };

  const getWorkoutForDay = (dayNumber) => {
    return workouts.find(workout => workout.day_number === dayNumber);
  };

  const handleDayClick = (dayNumber) => {
    const status = getDayStatus(dayNumber);
    if (status === 'locked') return;
    
    // Navigate to workout day or time trial
    console.log(`Navigate to day ${dayNumber}`);
    // This will integrate with routing when we add React Router
  };

  const renderMonthGrid = () => {
    const startDay = (selectedMonth - 1) * daysPerMonth + 1;
    const endDay = selectedMonth * daysPerMonth;
    const days = [];

    for (let day = startDay; day <= endDay; day++) {
      const status = getDayStatus(day);
      const workout = getWorkoutForDay(day);
      const isTimeTrialDay = day % 20 === 1; // First day of each month is time trial

      days.push(
        <div
          key={day}
          onClick={() => handleDayClick(day)}
          className={`
            relative p-3 rounded-lg border-2 cursor-pointer transition-all
            ${status === 'completed' ? 'bg-green-50 border-green-200 hover:bg-green-100' : ''}
            ${status === 'current' ? 'bg-blue-50 border-blue-400 hover:bg-blue-100 ring-2 ring-blue-300' : ''}
            ${status === 'available' ? 'bg-white border-gray-200 hover:bg-gray-50' : ''}
            ${status === 'locked' ? 'bg-gray-50 border-gray-200 cursor-not-allowed opacity-50' : ''}
          `}
        >
          {/* Day Number */}
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-medium ${
              status === 'current' ? 'text-blue-700' : 
              status === 'completed' ? 'text-green-700' : 
              'text-gray-700'
            }`}>
              Day {day}
            </span>
            
            {/* Status Icons */}
            {status === 'completed' && <CheckCircle className="w-4 h-4 text-green-600" />}
            {status === 'current' && <Clock className="w-4 h-4 text-blue-600" />}
            {status === 'locked' && <Lock className="w-4 h-4 text-gray-400" />}
            {isTimeTrialDay && <Trophy className="w-4 h-4 text-yellow-600" />}
          </div>

          {/* Workout Type */}
          {workout && (
            <div className="text-xs text-gray-600">
              {isTimeTrialDay ? 'Time Trial' : workout.workout_type || 'Conditioning'}
            </div>
          )}

          {/* Duration if available */}
          {workout && workout.duration && (
            <div className="text-xs text-gray-500 mt-1">
              {workout.duration} min
            </div>
          )}
        </div>
      );
    }

    return days;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your training program...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">720-Day Conditioning Program</h1>
              <p className="text-gray-600">
                {user ? `Welcome back, ${user.name || 'Athlete'}` : 'Your personalized training dashboard'}
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <TrendingUp className="w-4 h-4" />
                Analytics
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                <Settings className="w-4 h-4" />
                Account
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Database Connection - Optional for demo */}
      {!supabaseKey && (
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-2">Demo Mode - Connect for Real Data</h3>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Enter your Supabase API key for live data"
                className="flex-1 px-3 py-2 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500"
                onChange={(e) => setSupabaseKey(e.target.value)}
              />
            </div>
            <p className="text-sm text-blue-700 mt-1">
              Currently showing demo data. Enter API key to connect to your real database.
            </p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Sidebar - Month Navigation */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Training Months
              </h2>
              
              <div className="space-y-2">
                {Array.from({ length: totalMonths }, (_, i) => {
                  const monthNum = i + 1;
                  const hasAccess = getMonthAccess(monthNum);
                  const isSelected = selectedMonth === monthNum;
                  
                  return (
                    <button
                      key={monthNum}
                      onClick={() => hasAccess && setSelectedMonth(monthNum)}
                      disabled={!hasAccess}
                      className={`
                        w-full flex items-center justify-between p-3 rounded-lg text-left transition-all
                        ${isSelected ? 'bg-blue-100 border-blue-300 text-blue-700' : ''}
                        ${hasAccess && !isSelected ? 'bg-gray-50 hover:bg-gray-100 text-gray-700' : ''}
                        ${!hasAccess ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}
                      `}
                    >
                      <div className="flex items-center gap-3">
                        {hasAccess ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        <span>Month {monthNum}</span>
                      </div>
                      {isSelected && <ChevronRight className="w-4 h-4" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Main Content - Training Days Grid */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900">
                  Month {selectedMonth} - Days {(selectedMonth - 1) * daysPerMonth + 1} to {selectedMonth * daysPerMonth}
                </h2>
                
                {!getMonthAccess(selectedMonth) && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-lg">
                    <Lock className="w-4 h-4" />
                    <span className="text-sm">Subscription Required</span>
                  </div>
                )}
              </div>

              {getMonthAccess(selectedMonth) ? (
                <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-5 gap-3">
                  {renderMonthGrid()}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Lock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Month {selectedMonth} Locked</h3>
                  <p className="text-gray-600 mb-4">
                    Subscribe to unlock Month {selectedMonth} of your training program
                  </p>
                  <button className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
                    Upgrade Subscription
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

// Database service for managing Supabase connection and API key
class DatabaseService {
  constructor() {
    this.supabaseUrl = 'https://jucqobldwrhehufxdisd.supabase.co';
    this.userId = '910e5b5b-fa51-4c10-a219-2b537eee0ea5';
    this.apiKey = this.loadApiKey();
    this.listeners = [];
  }

  // Load API key from localStorage
  loadApiKey() {
    try {
      return localStorage.getItem('supabase_api_key') || '';
    } catch (error) {
      console.error('Failed to load API key from localStorage:', error);
      return '';
    }
  }

  // Save API key to localStorage
  saveApiKey(apiKey) {
    try {
      localStorage.setItem('supabase_api_key', apiKey);
      this.apiKey = apiKey;
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to save API key to localStorage:', error);
    }
  }

  // Clear API key
  clearApiKey() {
    try {
      localStorage.removeItem('supabase_api_key');
      this.apiKey = '';
      this.notifyListeners();
    } catch (error) {
      console.error('Failed to clear API key from localStorage:', error);
    }
  }

  // Get current API key
  getApiKey() {
    return this.apiKey;
  }

  // Check if connected
  isConnected() {
    return !!this.apiKey;
  }

  // Subscribe to API key changes
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  // Notify all listeners of changes
  notifyListeners() {
    this.listeners.forEach(listener => listener(this.apiKey));
  }

  // Make authenticated request
  async makeRequest(endpoint, options = {}) {
    if (!this.apiKey) {
      throw new Error('No API key available');
    }

    const url = `${this.supabaseUrl}/rest/v1/${endpoint}`;
    const headers = {
      'apikey': this.apiKey,
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  // Load user data
  async loadUserData() {
    const response = await this.makeRequest(`users?id=eq.${this.userId}`);
    const data = await response.json();
    return data.length > 0 ? data[0] : null;
  }

  // Load workouts
  async loadWorkouts() {
    const response = await this.makeRequest('workouts?order=day_number.asc');
    return await response.json();
  }

  // Load workout for specific day
  async loadWorkoutForDay(dayNumber) {
    const response = await this.makeRequest(`workouts?day_number=eq.${dayNumber}`);
    const data = await response.json();
    return data.length > 0 ? data[0] : null;
  }

  // Load completed sessions
  async loadCompletedSessions() {
    const response = await this.makeRequest(`workout_sessions?user_id=eq.${this.userId}`);
    return await response.json();
  }

  // Load time trial baselines
  async loadTimeTrialBaselines(modality) {
    const response = await this.makeRequest(
      `time_trials?user_id=eq.${this.userId}&modality=eq.${modality}&is_current=eq.true`
    );
    const data = await response.json();
    return data.length > 0 ? data[0] : null;
  }

  // Load previous baselines for modality
  async loadPreviousBaselines(modality, limit = 5) {
    const response = await this.makeRequest(
      `time_trials?user_id=eq.${this.userId}&modality=eq.${modality}&order=created_at.desc&limit=${limit}`
    );
    return await response.json();
  }

  // Save time trial
  async saveTimeTrial(timeTrialData) {
    const response = await this.makeRequest('time_trials', {
      method: 'POST',
      headers: {
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(timeTrialData)
    });
    return response;
  }

  // Save workout session
  async saveWorkoutSession(sessionData) {
    const response = await this.makeRequest('workout_sessions', {
      method: 'POST',
      headers: {
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(sessionData)
    });
    return response;
  }
}

// Create singleton instance
const databaseService = new DatabaseService();

export default databaseService;
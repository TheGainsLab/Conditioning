import React, { useState, useEffect } from 'react';
import { Database, Key, CheckCircle, AlertCircle } from 'lucide-react';
import databaseService from '../services/databaseService';

const ApiKeyManager = ({ onConnectionChange }) => {
  const [apiKey, setApiKey] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    // Load current API key
    const currentKey = databaseService.getApiKey();
    setApiKey(currentKey);
    setIsConnected(!!currentKey);

    // Subscribe to changes
    const unsubscribe = databaseService.subscribe((newKey) => {
      setApiKey(newKey);
      setIsConnected(!!newKey);
      if (onConnectionChange) {
        onConnectionChange(!!newKey);
      }
    });

    return unsubscribe;
  }, [onConnectionChange]);

  const handleApiKeyChange = (e) => {
    setApiKey(e.target.value);
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      alert('Please enter an API key');
      return;
    }

    setIsValidating(true);
    
    try {
      // Test the API key by making a simple request
      await databaseService.makeRequest('users?limit=1');
      
      // If successful, save the key
      databaseService.saveApiKey(apiKey.trim());
      setShowInput(false);
      
      if (onConnectionChange) {
        onConnectionChange(true);
      }
    } catch (error) {
      console.error('API key validation failed:', error);
      alert('Invalid API key. Please check your key and try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleDisconnect = () => {
    databaseService.clearApiKey();
    setShowInput(false);
    
    if (onConnectionChange) {
      onConnectionChange(false);
    }
  };

  const handleClearKey = () => {
    setApiKey('');
  };

  if (isConnected) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div>
              <h3 className="font-medium text-green-900">Database Connected</h3>
              <p className="text-sm text-green-700">
                API key: {apiKey.substring(0, 8)}...{apiKey.substring(apiKey.length - 4)}
              </p>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            className="text-sm text-green-700 hover:text-green-900 underline"
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-600" />
          <h3 className="font-medium text-blue-900">Database Connection</h3>
        </div>
        {!showInput && (
          <button
            onClick={() => setShowInput(true)}
            className="text-sm text-blue-700 hover:text-blue-900 underline"
          >
            Connect
          </button>
        )}
      </div>

      {showInput && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-blue-900 mb-1">
              Supabase API Key
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={handleApiKeyChange}
                placeholder="Enter your Supabase API key"
                className="flex-1 px-3 py-2 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isValidating}
              />
              <button
                onClick={handleClearKey}
                className="px-3 py-2 text-blue-700 hover:text-blue-900"
                disabled={isValidating}
              >
                Clear
              </button>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleSaveApiKey}
              disabled={isValidating || !apiKey.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isValidating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Validating...
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  Connect
                </>
              )}
            </button>
            
            <button
              onClick={() => setShowInput(false)}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded hover:bg-gray-200"
              disabled={isValidating}
            >
              Cancel
            </button>
          </div>
          
          <p className="text-sm text-blue-700">
            Your API key is stored locally and will be remembered for future sessions.
          </p>
        </div>
      )}

      {!showInput && (
        <p className="text-sm text-blue-700">
          Connect to your Supabase database to save and load your training data.
        </p>
      )}
    </div>
  );
};

export default ApiKeyManager;

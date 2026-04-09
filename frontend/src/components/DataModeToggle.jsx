import React, { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import axios from 'axios';
import { getAuthToken, getUser, setUser } from '@/lib/auth';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

export default function DataModeToggle({ onModeChange }) {
  const user = getUser();
  const [includeDemoData, setIncludeDemoData] = useState(
    user?.data_mode === 'user_plus_demo'
  );
  const [loading, setLoading] = useState(false);

  async function handleToggle(checked) {
    setLoading(true);
    const mode = checked ? 'user_plus_demo' : 'user_only';

    try {
      await axios.post(
        `${API}/user/data-mode`,
        { mode },
        {
          headers: {
            Authorization: `Bearer ${getAuthToken()}`
          }
        }
      );

      setIncludeDemoData(checked);
      
      // Update local user object
      const updatedUser = { ...user, data_mode: mode };
      setUser(updatedUser);

      toast.success(
        checked ? 'Demo data included' : 'Showing only your data'
      );

      if (onModeChange) {
        onModeChange();
      }
    } catch (err) {
      toast.error('Failed to update data mode');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center space-x-3 p-4 bg-white rounded-lg border">
      <Switch
        id="demo-data"
        checked={includeDemoData}
        onCheckedChange={handleToggle}
        disabled={loading}
      />
      <Label htmlFor="demo-data" className="cursor-pointer">
        <div className="font-medium">Include Demo Data</div>
        <div className="text-xs text-gray-500">
          {includeDemoData 
            ? 'Viewing your data + demo dataset' 
            : 'Viewing only your data'}
        </div>
      </Label>
    </div>
  );
}

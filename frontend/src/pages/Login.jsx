import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import axios from 'axios';
import { setAuthToken, setUser } from '@/lib/auth';
import logo from '@/assets/logo.png';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

export default function Login() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    try {
      const endpoint = isLogin ? `${API}/auth/login` : `${API}/auth/signup`;
      const res = await axios.post(endpoint, { email, password });

      setAuthToken(res.data.token);
      setUser(res.data.user);

      toast.success(isLogin ? 'Logged in successfully' : 'Account created successfully');
      navigate('/');
    } catch (err) {
      if (!err.response) {
        toast.error(`Cannot reach backend at ${BACKEND_URL}. Make sure the API server is running.`);
      } else {
        toast.error(err.response?.data?.detail || 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  }

  function fillDemoAccount(accountEmail) {
    setEmail(accountEmail);
    setPassword('demo123');
    setIsLogin(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <Toaster />
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <img src={logo} alt="FinFusion logo" className="h-16 object-contain" />
          </div>
          <p className="text-gray-600">
            {isLogin ? 'Welcome back' : 'Create your account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Loading...' : isLogin ? 'Login' : 'Sign Up'}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-blue-600 hover:underline"
          >
            {isLogin ? 'Need an account? Sign up' : 'Already have an account? Login'}
          </button>
        </div>

        <div className="mt-6 pt-6 border-t space-y-3">
          <div className="text-center">
            <p className="text-sm font-medium text-slate-700">Demo accounts</p>
            <p className="text-xs text-gray-500 mt-1">
              One preloaded account and one clean account for live manual entry
            </p>
          </div>

          <Button
            onClick={() => fillDemoAccount('demo@example.com')}
            variant="outline"
            className="w-full justify-between"
          >
            <span>Use Preloaded Demo</span>
            <span className="text-xs text-gray-500">demo@example.com</span>
          </Button>

          <Button
            onClick={() => fillDemoAccount('demo2@example.com')}
            variant="outline"
            className="w-full justify-between"
          >
            <span>Use Empty Demo</span>
            <span className="text-xs text-gray-500">demo2@example.com</span>
          </Button>

          <p className="text-xs text-gray-500 text-center">
            Password for both accounts: demo123
          </p>
        </div>
      </Card>
    </div>
  );
}

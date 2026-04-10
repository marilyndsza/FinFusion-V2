import React from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import GroupExpenses from './pages/GroupExpenses';
import Budgets from './pages/Budgets';
import Forecasting from './pages/Forecasting';
import Insights from './pages/Insights';
import Login from './pages/Login';
import { isAuthenticated } from './lib/auth';
import CursorAura from './components/CursorAura';
import { TrendModeProvider } from './context/TrendModeContext';

function ProtectedRoute({ children }) {
  return isAuthenticated() ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <div className="App">
      <TrendModeProvider>
        <CursorAura />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/groups" element={<ProtectedRoute><GroupExpenses /></ProtectedRoute>} />
            <Route path="/budgets" element={<ProtectedRoute><Budgets /></ProtectedRoute>} />
            <Route path="/forecast" element={<ProtectedRoute><Forecasting /></ProtectedRoute>} />
            <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </TrendModeProvider>
    </div>
  );
}

export default App;

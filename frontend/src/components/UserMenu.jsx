import React, { useState, useRef, useEffect } from 'react';
import { LogOut, User as UserIcon } from 'lucide-react';
import { getUser, logout } from '@/lib/auth';
import { useTrendMode } from '@/context/TrendModeContext';

export default function UserMenu({ className = '' }) {
  const user = getUser();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const { trendMode, setTrendMode } = useTrendMode();

  // Get user initial (first letter of email)
  const userInitial = user?.email ? user.email.charAt(0).toUpperCase() : 'U';

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  function handleLogout() {
    logout();
    window.location.href = '/login';
  }

  return (
    <div className={`relative ml-auto order-1 md:ml-0 md:order-none ${className}`.trim()} ref={menuRef}>
      {/* Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="h-9 w-9 rounded-full bg-gradient-to-tr from-indigo-400 to-purple-400 flex items-center justify-center text-white text-sm font-semibold hover:shadow-lg transition-shadow"
      >
        {userInitial}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] bg-white rounded-2xl shadow-xl border border-gray-200 py-2 z-50">
          {/* User Info Section */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <UserIcon className="w-4 h-4 text-gray-500" />
              <p className="text-base font-medium text-gray-900 break-all">{user?.email}</p>
            </div>
            <p className="text-sm text-gray-500 ml-6">Logged in</p>
          </div>

          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400 mb-2">Trend View</p>
            <div className="inline-flex rounded-full bg-slate-100 p-1 w-full">
              <button
                onClick={() => setTrendMode('weekly')}
                className={`flex-1 px-3 py-2 rounded-full text-xs font-semibold transition-colors ${
                  trendMode === 'weekly' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                Weekly
              </button>
              <button
                onClick={() => setTrendMode('monthly')}
                className={`flex-1 px-3 py-2 rounded-full text-xs font-semibold transition-colors ${
                  trendMode === 'monthly' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                Monthly
              </button>
            </div>
          </div>

          {/* Logout Button */}
          <div className="px-2 py-2">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

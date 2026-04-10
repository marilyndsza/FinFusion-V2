import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

export default function Navbar() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  
  const isActive = (path) => location.pathname === path;
  
  const linkClass = (path) => `
    hover:text-slate-900 transition-colors whitespace-nowrap
    ${isActive(path) ? 'text-indigo-600 font-semibold border-b-2 border-indigo-600 pb-1' : 'text-slate-700'}
  `;

  const links = [
    { to: '/', label: 'Dashboard', testId: 'nav-dashboard' },
    { to: '/budgets', label: 'Budgets', testId: 'nav-budgets' },
    { to: '/forecast', label: 'Forecast', testId: 'nav-forecast' },
    { to: '/groups', label: 'Groups', testId: 'nav-groups' },
    { to: '/insights', label: 'Insights', testId: 'nav-insights' },
  ];
  
  return (
    <div className="relative order-2 md:order-none">
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="md:hidden h-10 w-10 rounded-full border border-slate-200 bg-white text-slate-700 flex items-center justify-center shadow-sm"
        aria-label="Toggle navigation"
      >
        {isOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      <nav className="hidden md:flex items-center gap-9 lg:gap-12 text-[16px]">
        {links.map((link) => (
          <Link key={link.to} to={link.to} className={linkClass(link.to)} data-testid={link.testId}>
            {link.label}
          </Link>
        ))}
      </nav>

      {isOpen && (
        <nav className="md:hidden absolute top-12 left-1/2 -translate-x-1/2 w-[220px] rounded-2xl border border-slate-200 bg-white/95 backdrop-blur p-3 shadow-[0_20px_50px_rgba(15,23,42,0.16)] z-50">
          <div className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-2.5 rounded-xl text-sm ${isActive(link.to) ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-slate-700 hover:bg-slate-50'}`}
                data-testid={link.testId}
                onClick={() => setIsOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

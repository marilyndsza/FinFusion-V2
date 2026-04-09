import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const location = useLocation();
  
  const isActive = (path) => location.pathname === path;
  
  const linkClass = (path) => `
    hover:text-slate-800 transition-colors
    ${isActive(path) ? 'text-indigo-600 font-semibold border-b-2 border-indigo-600 pb-1' : 'text-slate-600'}
  `;
  
  return (
    <nav className="flex items-center gap-8 text-sm">
      <Link to="/" className={linkClass('/')} data-testid="nav-dashboard">
        Dashboard
      </Link>
      <Link to="/budgets" className={linkClass('/budgets')} data-testid="nav-budgets">
        Budgets
      </Link>
      <Link to="/forecast" className={linkClass('/forecast')} data-testid="nav-forecast">
        Forecast
      </Link>
      <Link to="/groups" className={linkClass('/groups')} data-testid="nav-groups">
        Groups
      </Link>
      <Link to="/insights" className={linkClass('/insights')} data-testid="nav-insights">
        Insights
      </Link>
    </nav>
  );
}

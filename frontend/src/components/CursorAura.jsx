import React, { useEffect, useState } from 'react';

export default function CursorAura() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const updateEnabled = () => {
      setEnabled(mediaQuery.matches && !reducedMotion.matches);
    };

    updateEnabled();

    const handleMove = (event) => {
      setPosition({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener('mousemove', handleMove);
    mediaQuery.addEventListener('change', updateEnabled);
    reducedMotion.addEventListener('change', updateEnabled);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      mediaQuery.removeEventListener('change', updateEnabled);
      reducedMotion.removeEventListener('change', updateEnabled);
    };
  }, []);

  if (!enabled) return null;

  return (
    <>
      <div
        className="cursor-aura pointer-events-none"
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        aria-hidden="true"
      />
      <div
        className="cursor-aura-core pointer-events-none"
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
        aria-hidden="true"
      />
    </>
  );
}

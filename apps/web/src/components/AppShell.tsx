import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Dialog from './Dialog';

export default function AppShell() {
  const location = useLocation();
  const [preferences, setPreferences] = useState(false);
  const [booting, setBooting] = useState(() => { try { return sessionStorage.getItem('wisper-booted') !== 'yes' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } });
  const [mood, setMood] = useState(() => { try { return localStorage.getItem('library-mood') || 'candle'; } catch { return 'candle'; } });
  const [ambience, setAmbience] = useState(() => { try { return localStorage.getItem('library-ambience') !== 'off'; } catch { return true; } });
  useEffect(() => {
    document.documentElement.dataset.mood = mood;
    document.documentElement.dataset.ambience = ambience ? 'on' : 'off';
    try { localStorage.setItem('library-mood', mood); localStorage.setItem('library-ambience', ambience ? 'on' : 'off'); } catch { /* Preferences remain usable in this session. */ }
  }, [mood, ambience]);
  useEffect(() => {
    if (!booting) return;
    const finish = () => { try { sessionStorage.setItem('wisper-booted', 'yes'); } catch { /* The intro still closes without storage. */ } setBooting(false); };
    const timer = window.setTimeout(finish, 1050);
    return () => window.clearTimeout(timer);
  }, [booting]);
  const page = location.pathname.startsWith('/write') ? 'Writing desk' : location.pathname.startsWith('/reviews') ? 'Personal reviews' : location.pathname.startsWith('/notes') ? 'Notebook' : 'Library';
  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className="app-header"><NavLink to="/library" className="brand" aria-label="wisper-lib home"><span className="brand-mark" aria-hidden="true">w</span><span>wisper-lib<small>YOUR PERSONAL READING ROOM</small></span></NavLink>
      <span className="room-current">{page}</span>
      <button className="room-preferences" aria-label="Customize your reading room" onClick={() => setPreferences(true)}><span className="room-light" aria-hidden="true">✦</span><span>Set the mood</span></button>
    </header>
    <nav className="room-launcher" aria-label="Open a room">{[['/library','▤','Library','Read and track'],['/notes','✎','Notebook','Keep a thought'],['/write/new','✦','Writing desk','Make a book'],['/reviews','★','Reviews','Share a review']].map(([to,icon,label,description]) => <NavLink key={to} to={to} className={({isActive}) => `launcher-button ${isActive || (to === '/write/new' && location.pathname.startsWith('/write/')) ? 'is-active' : ''}`}><span className="launcher-icon" aria-hidden="true">{icon}</span><span className="launcher-copy"><strong>{label}</strong><small>{description}</small></span></NavLink>)}</nav>
    <div className="sr-only" role="status" aria-live="polite">{page}</div>
    <main id="main-content" className="app-content"><div className="route-scene" key={location.pathname}><Outlet /></div></main>
    <footer className="app-footer"><span>A little quieter. A little more yours.</span><span>Personal library · Local reading room</span></footer>
    {preferences && <Dialog title="Make room for your kind of quiet" onClose={() => setPreferences(false)}><div className="stack"><p className="muted">A subtle atmosphere around the shelves. The reading page stays calm.</p><label className="field">Room palette<select value={mood} onChange={event => setMood(event.target.value)}><option value="candle">Candlelight</option><option value="moon">Moonlit study</option><option value="forest">Forest after dark</option></select></label><label className="check-row"><input type="checkbox" checked={ambience} onChange={event => setAmbience(event.target.checked)} /> Ambient shelf lighting</label><p className="fine-print">Motion follows your device's reduced-motion preference. Sound is controlled separately in each book preview.</p><button className="button button-primary" onClick={() => setPreferences(false)}>Back to my books</button></div></Dialog>}
    {booting && <div className="room-boot" role="status" aria-live="polite"><div className="boot-orbit" aria-hidden="true"><span>✦</span></div><p className="boot-wordmark">wisper-lib</p><p className="boot-caption">Opening your reading room</p><button className="boot-skip" onClick={() => { try { sessionStorage.setItem('wisper-booted', 'yes'); } catch { /* Optional session preference. */ } setBooting(false); }}>Skip intro</button></div>}
  </div>;
}

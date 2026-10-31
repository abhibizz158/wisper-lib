import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Dialog from './Dialog';

export default function AppShell() {
  const location = useLocation();
  const [preferences, setPreferences] = useState(false);
  const [mood, setMood] = useState(() => { try { return localStorage.getItem('library-mood') || 'candle'; } catch { return 'candle'; } });
  const [ambience, setAmbience] = useState(() => { try { return localStorage.getItem('library-ambience') !== 'off'; } catch { return true; } });
  useEffect(() => {
    document.documentElement.dataset.mood = mood;
    document.documentElement.dataset.ambience = ambience ? 'on' : 'off';
    try { localStorage.setItem('library-mood', mood); localStorage.setItem('library-ambience', ambience ? 'on' : 'off'); } catch { /* Preferences remain usable in this session. */ }
  }, [mood, ambience]);
  const page = location.pathname.startsWith('/write') ? 'Writing desk' : location.pathname.startsWith('/reviews') ? 'Personal reviews' : location.pathname.startsWith('/notes') ? 'Notebook' : 'Library';
  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className="app-header"><NavLink to="/library" className="brand" aria-label="wisper-lib home"><span className="brand-mark" aria-hidden="true">w</span><span>wisper-lib<small>YOUR PERSONAL READING ROOM</small></span></NavLink>
      <nav aria-label="Main navigation">{[['/library','Library'],['/notes','Notebook'],['/write/new','Writing desk'],['/reviews','Reviews']].map(([to,label]) => <NavLink key={to} to={to} className={({isActive}) => `nav-link ${isActive || (to === '/write/new' && location.pathname.startsWith('/write/')) ? 'is-active' : ''}`}>{label}</NavLink>)}</nav>
      <button className="room-preferences" aria-label="Customize your reading room" onClick={() => setPreferences(true)}><span className="room-light" aria-hidden="true">✦</span><span>Set the mood</span></button>
    </header>
    <div className="sr-only" role="status" aria-live="polite">{page}</div>
    <main id="main-content" className="app-content"><Outlet /></main>
    <footer className="app-footer"><span>A little quieter. A little more yours.</span><span>Personal library · Local reading room</span></footer>
    {preferences && <Dialog title="Make room for your kind of quiet" onClose={() => setPreferences(false)}><div className="stack"><p className="muted">A subtle atmosphere around the shelves. The reading page stays calm.</p><label className="field">Room palette<select value={mood} onChange={event => setMood(event.target.value)}><option value="candle">Candlelight</option><option value="moon">Moonlit study</option><option value="forest">Forest after dark</option></select></label><label className="check-row"><input type="checkbox" checked={ambience} onChange={event => setAmbience(event.target.checked)} /> Ambient shelf lighting</label><p className="fine-print">Motion follows your device's reduced-motion preference. Sound is controlled separately in each book preview.</p><button className="button button-primary" onClick={() => setPreferences(false)}>Back to my books</button></div></Dialog>}
  </div>;
}

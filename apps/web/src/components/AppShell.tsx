import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import Dialog from './Dialog';

export default function AppShell() {
  const location = useLocation();
  const [preferences, setPreferences] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
    <header className="app-header"><NavLink to="/library" className="brand" aria-label="wisper-lib home"><span className="brand-mark" aria-hidden="true">w</span><span>wisper-lib<small>BOOKS & NOTES</small></span></NavLink>
      <span className="room-current">{page}</span>
      <div className="app-header-actions"><button className="room-preferences menu-trigger" aria-label="Open library menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><span aria-hidden="true">•••</span></button></div>
    </header>
    <div className="sr-only" role="status" aria-live="polite">{page}</div>
    <main id="main-content" className="app-content"><div className="route-scene" key={location.pathname}><Outlet /></div></main>
    {menuOpen && <Dialog title="wisper-lib" onClose={() => setMenuOpen(false)}><nav className="space-menu" aria-label="Reading spaces"><NavLink to="/library" onClick={() => setMenuOpen(false)}><span>▤</span><strong>Library</strong><small>Browse and track your books</small></NavLink><NavLink to="/notes" onClick={() => setMenuOpen(false)}><span>✎</span><strong>Notebook</strong><small>Return to saved thoughts</small></NavLink><NavLink to="/write/new" onClick={() => setMenuOpen(false)}><span>✦</span><strong>Writing desk</strong><small>Work on a book of your own</small></NavLink><NavLink to="/reviews" onClick={() => setMenuOpen(false)}><span>★</span><strong>Reviews</strong><small>Collect and share your reflections</small></NavLink></nav><button className="button button-quiet menu-settings-toggle" onClick={() => { setMenuOpen(false); setPreferences(true); }}>Reading room settings</button></Dialog>}
    {preferences && <Dialog title="Make room for your kind of quiet" onClose={() => setPreferences(false)}><div className="stack"><p className="muted">A subtle atmosphere around the shelves. The reading page stays calm.</p><label className="field">Room palette<select value={mood} onChange={event => setMood(event.target.value)}><option value="candle">Candlelight</option><option value="moon">Moonlit study</option><option value="forest">Forest after dark</option></select></label><label className="check-row"><input type="checkbox" checked={ambience} onChange={event => setAmbience(event.target.checked)} /> Ambient shelf lighting</label><p className="fine-print">Motion follows your device's reduced-motion preference. Sound is controlled separately in each book preview.</p><button className="button button-primary" onClick={() => setPreferences(false)}>Back to my books</button></div></Dialog>}
  </div>;
}

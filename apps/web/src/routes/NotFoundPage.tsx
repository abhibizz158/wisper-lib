import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage(): React.ReactElement {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: '1rem',
        fontFamily: 'var(--font-ui)',
        color: 'var(--color-text-secondary)',
      }}
    >
      <span style={{ fontSize: '3rem' }} role="img" aria-label="ghost">
        👻
      </span>
      <h1 style={{ color: 'var(--color-violet)', fontFamily: 'var(--font-reading)' }}>
        Page not found
      </h1>
      <p>This shelf doesn't exist.</p>
      <Link
        to="/library"
        style={{
          color: 'var(--color-amber)',
          textDecoration: 'underline',
          marginTop: '0.5rem',
        }}
      >
        Return to the library
      </Link>
    </main>
  );
}

import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppShell from '@/components/AppShell';
import LibraryPage from '@/routes/LibraryPage';
import NotFoundPage from '@/routes/NotFoundPage';
import '@/styles/global.css';

const ReaderPage = React.lazy(() => import('@/routes/ReaderPage'));
const NotesPage = React.lazy(() => import('@/routes/NotesPage'));
const WriterPage = React.lazy(() => import('@/routes/WriterPage'));
const ReviewsPage = React.lazy(() => import('@/routes/ReviewsPage'));
const BookDetailPage = React.lazy(() => import('@/routes/BookDetailPage'));
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false }, mutations: { retry: 0 } } });
function LazyPage({ children }: { children: React.ReactNode }) { return <Suspense fallback={<div className="route-loading" role="status">Opening your room…</div>}>{children}</Suspense>; }
const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/library" replace /> },
  { element: <AppShell />, children: [
    { path: '/library', element: <LibraryPage /> },
    { path: '/library/:id', element: <LazyPage><BookDetailPage /></LazyPage> },
    { path: '/notes', element: <LazyPage><NotesPage /></LazyPage> },
    { path: '/notes/:id', element: <LazyPage><NotesPage /></LazyPage> },
    { path: '/write/:id', element: <LazyPage><WriterPage /></LazyPage> },
    { path: '/reviews', element: <LazyPage><ReviewsPage /></LazyPage> },
    { path: '*', element: <NotFoundPage /> },
  ] },
  { path: '/reader/:id', element: <LazyPage><ReaderPage /></LazyPage> },
]);
const root = document.getElementById('root');
if (!root) throw new Error('Application root was not found.');
ReactDOM.createRoot(root).render(<React.StrictMode><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></React.StrictMode>);

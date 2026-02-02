import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/components/ui/toast';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initAnalytics } from './lib/firebase';
import './styles/globals.css';

// Initialize Firebase Analytics
initAnalytics();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <TooltipProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </TooltipProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

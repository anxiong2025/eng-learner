import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics (only in browser and if supported)
let analytics: ReturnType<typeof getAnalytics> | null = null;

export async function initAnalytics() {
  if (typeof window !== 'undefined' && await isSupported()) {
    analytics = getAnalytics(app);
    console.log('Firebase Analytics initialized');
  }
}

// Track page view
export function trackPageView(pageName: string, pageLocation?: string) {
  if (analytics) {
    logEvent(analytics, 'page_view', {
      page_title: pageName,
      page_location: pageLocation || window.location.href,
    });
  }
}

// Track custom event
export function trackEvent(eventName: string, params?: Record<string, unknown>) {
  if (analytics) {
    logEvent(analytics, eventName, params);
  }
}

// Common events for your app
export const AppEvents = {
  // Video events
  videoPlay: (videoId: string, videoTitle: string) =>
    trackEvent('video_play', { video_id: videoId, video_title: videoTitle }),

  videoComplete: (videoId: string) =>
    trackEvent('video_complete', { video_id: videoId }),

  // Learning events
  wordSaved: (word: string) =>
    trackEvent('word_saved', { word }),

  vocabReview: (count: number) =>
    trackEvent('vocab_review', { word_count: count }),

  // User events
  signIn: (provider: string) =>
    trackEvent('login', { method: provider }),

  signUp: (provider: string) =>
    trackEvent('sign_up', { method: provider }),

  // Feature usage
  featureUsed: (featureName: string) =>
    trackEvent('feature_used', { feature: featureName }),
};

export { app, analytics };

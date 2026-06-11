/**
 * kc-speed-insights.js — Vercel Speed Insights Boot
 * 
 * Injects Vercel Speed Insights tracking script to monitor web vitals
 * and performance metrics. This script is loaded early to ensure proper
 * tracking throughout the application lifecycle.
 * 
 * @see https://vercel.com/docs/speed-insights
 */

(function() {
  'use strict';
  
  // Check if we're in a browser environment
  if (typeof window === 'undefined') return;
  
  // Initialize Speed Insights queue
  function initQueue() {
    if (window.si) return;
    window.si = function(...params) {
      window.siq = window.siq || [];
      window.siq.push(params);
    };
  }
  
  // Detect environment
  function isDevelopment() {
    try {
      return window.location.hostname === 'localhost' || 
             window.location.hostname === '127.0.0.1' ||
             window.location.hostname.includes('preview');
    } catch {
      return false;
    }
  }
  
  // Get script source based on environment
  function getScriptSrc() {
    if (isDevelopment()) {
      return 'https://va.vercel-scripts.com/v1/speed-insights/script.debug.js';
    }
    return '/_vercel/speed-insights/script.js';
  }
  
  // Inject Speed Insights
  function injectSpeedInsights() {
    // Initialize queue first
    initQueue();
    
    const src = getScriptSrc();
    
    // Check if script is already loaded
    if (document.head.querySelector('script[src*="' + src + '"]')) {
      console.log('[KinoCampus] Speed Insights already loaded');
      return;
    }
    
    // Create and configure script element
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    
    // Add SDK metadata
    script.dataset.sdkn = '@vercel/speed-insights/vanilla';
    script.dataset.sdkv = '2.0.0';
    
    // Error handler
    script.onerror = function() {
      console.warn(
        '[KinoCampus] Failed to load Speed Insights script. ' +
        'This may be due to content blockers or network issues.'
      );
    };
    
    // Inject script into page
    document.head.appendChild(script);
    
    console.log('[KinoCampus] Speed Insights initialized');
  }
  
  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSpeedInsights);
  } else {
    injectSpeedInsights();
  }
})();

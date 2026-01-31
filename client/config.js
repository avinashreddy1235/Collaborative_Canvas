/**
 * Frontend Configuration
 * This file contains configuration for the frontend application
 */

const CONFIG = {
    // Backend URL - change this to your Render backend URL after deployment
    // For local development, leave as empty string to use same origin
    // For production, set to your Render backend URL like: 'https://your-app.onrender.com'
    BACKEND_URL: '',

    // API endpoints (relative to BACKEND_URL)
    API: {
        ROOMS: '/api/rooms',
        METRICS: '/api/metrics'
    }
};

// Make config available globally
window.CONFIG = CONFIG;

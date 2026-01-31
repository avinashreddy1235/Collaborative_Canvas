/**
 * Frontend Configuration
 * This file contains configuration for the frontend application
 */

const CONFIG = {
    // Backend URL - Render backend for production
    // For local development, change to empty string ''
    BACKEND_URL: 'https://collaborative-canvas-backend-5yia.onrender.com',

    // API endpoints (relative to BACKEND_URL)
    API: {
        ROOMS: '/api/rooms',
        METRICS: '/api/metrics'
    }
};

// Make config available globally
window.CONFIG = CONFIG;

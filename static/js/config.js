// Static Configuration for Blazers Mars Rover Frontend
// This approach works without Node.js or build tools

const CONFIG = {
    // Production vs Development Detection
    IS_DEVELOPMENT: window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1' ||
                   window.location.hostname.includes('local'),
    
    // Environment-based API Configuration
    API_ENDPOINTS: {
        DEVELOPMENT: {
             HUGGINGFACE_API: 'https://elameen123-blazers-image-analysis-station.hf.space/',
            FALLBACK_API: 'https://elameen123-blazers-image-analysis-station.hf.space/'
        },
        PRODUCTION: {
            // You'll replace this with your actual Hugging Face Space URL
            HUGGINGFACE_API: 'https://elameen123-blazers-image-analysis-station.hf.space/',
            FALLBACK_API: 'https://elameen123-blazers-image-analysis-station.hf.space/'
        }
    },
    
    // Firebase Configuration - Keep as is for now, move to env later
    FIREBASE: {
        apiKey: "AIzaSyA6c_4j2Zw33NdlP2jSbIp0ySHGSmpluQ8",
        authDomain: "blazers-rovers-sample-database.firebaseapp.com",
        projectId: "blazers-rovers-sample-database",
        storageBucket: "blazers-rovers-sample-database.appspot.com",
        messagingSenderId: "464730486363",
        appId: "1:464730486363:web:78ccfde176cea53e21317e"
    },
    
    // ESP32 Configuration
    ESP32_IP: "192.168.0.102",
    
    // API Endpoint Paths
    ENDPOINTS: {
        HEALTH: '/api/health',
        PREDICT: '/api/predict', 
        CONFIG: '/api/config',
        DETECT: '/detect' // Your current Hugging Face endpoint
    }
};

// Dynamic API URL based on environment
CONFIG.getApiUrl = function(endpoint = '') {
    const baseUrl = this.IS_DEVELOPMENT ? 
        this.API_ENDPOINTS.DEVELOPMENT.HUGGINGFACE_API : 
        this.API_ENDPOINTS.PRODUCTION.HUGGINGFACE_API;
    
    return baseUrl + endpoint;
};

// Helper method to get full endpoint URL
CONFIG.getEndpointUrl = function(endpointKey) {
    const endpoint = this.ENDPOINTS[endpointKey] || '';
    return this.getApiUrl(endpoint);
};

// For debugging - remove in production
CONFIG.debug = function() {
    console.log('🚀 Blazers Configuration:', {
        environment: this.IS_DEVELOPMENT ? 'DEVELOPMENT' : 'PRODUCTION',
        hostname: window.location.hostname,
        apiBaseUrl: this.getApiUrl(),
        healthEndpoint: this.getEndpointUrl('HEALTH'),
        predictEndpoint: this.getEndpointUrl('PREDICT')
    });
};

// Make available globally
window.CONFIG = CONFIG;

// Auto-debug in development
if (CONFIG.IS_DEVELOPMENT) {
    CONFIG.debug();
}

console.log('✅ Blazers Configuration loaded successfully');
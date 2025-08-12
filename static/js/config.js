// Static Configuration for Blazers Mars Rover Frontend with ESP32-CAM Support
// This approach works without Node.js or build tools

const CONFIG = {
    // Production vs Development Detection
    IS_DEVELOPMENT: window.location.hostname === 'localhost' || 
                   window.location.hostname === '127.0.0.1' ||
                   window.location.hostname.includes('local'),
    
    // Environment-based API Configuration
    API_ENDPOINTS: {
        DEVELOPMENT: {
             HUGGINGFACE_API: 'https://elameen123-blazers-image-analysis-station.hf.space',
            FALLBACK_API: 'https://elameen123-blazers-image-analysis-station.hf.space'
        },
        PRODUCTION: {
            // You'll replace this with your actual Hugging Face Space URL to use
            HUGGINGFACE_API: 'https://elameen123-blazers-image-analysis-station.hf.space',
            FALLBACK_API: 'https://elameen123-blazers-image-analysis-station.hf.space'
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
    
    // ESP32-CAM Configuration
    ESP32_CONFIG: {
        // IMPORTANT: Update this IP address with your ESP32-CAM's actual IP
        // Check your Arduino Serial Monitor after uploading the code
        IP: "192.168.0.102", // Replace with your ESP32-CAM IP address
        PORT: 80, // Standard HTTP port for ESP32-CAM web server
        
        // Connection settings
        RECONNECT_DELAY: 3000,
        MAX_RETRIES: 5,
        CONNECTION_TIMEOUT: 5000,
        HEARTBEAT_INTERVAL: 10000,
        
        // Camera quality presets
        QUALITY_PRESETS: {
            HIGH: { quality: 10, framesize: 9 },    // Best quality, SXGA
            MEDIUM: { quality: 20, framesize: 7 },  // Good quality, VGA
            LOW: { quality: 40, framesize: 5 }      // Fast streaming, CIF
        },
        
        // Default camera settings
        DEFAULT_SETTINGS: {
            brightness: 0,    // -2 to 2
            contrast: 0,      // -2 to 2
            saturation: 0,    // -2 to 2
            quality: 20,      // 10-63 (lower = better quality)
            framesize: 7,     // 0-10 (see framesize constants)
            special_effect: 0, // 0-6 (No Effect, Negative, Grayscale, etc.)
            wb_mode: 0        // 0-4 (Auto, Sunny, Cloudy, Office, Home)
        }
    },
    
    // Legacy ESP32 Configuration (kept for compatibility)
    ESP32_IP: "192.168.0.102", // This will be updated from ESP32_CONFIG.IP
    
    // API Endpoint Paths
    ENDPOINTS: {
        HEALTH: '/api/health',
        PREDICT: '/api/predict', 
        CONFIG: '/api/config',
        DETECT: '/detect' // Your current Hugging Face endpoint
    },
    
    // ESP32-CAM Specific Endpoints
    ESP32_ENDPOINTS: {
        STREAM: '/stream',
        CAPTURE: '/capture',
        STATUS: '/status',
        CONTROL: '/control'
    }
};

// Update legacy ESP32_IP from new config
CONFIG.ESP32_IP = CONFIG.ESP32_CONFIG.IP;

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

// ESP32-CAM URL builders
CONFIG.getESP32Url = function(endpoint = '') {
    return `http://${this.ESP32_CONFIG.IP}:${this.ESP32_CONFIG.PORT}${endpoint}`;
};

CONFIG.getESP32EndpointUrl = function(endpointKey) {
    const endpoint = this.ESP32_ENDPOINTS[endpointKey] || '';
    return this.getESP32Url(endpoint);
};

// Convenience methods for ESP32-CAM URLs
CONFIG.getStreamUrl = function() {
    return this.getESP32EndpointUrl('STREAM');
};

CONFIG.getCaptureUrl = function() {
    return this.getESP32EndpointUrl('CAPTURE');
};

CONFIG.getControlUrl = function(parameter, value) {
    return `${this.getESP32EndpointUrl('CONTROL')}?var=${parameter}&val=${value}`;
};

// ESP32-CAM connection test
CONFIG.testESP32Connection = async function() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.ESP32_CONFIG.CONNECTION_TIMEOUT);
        
        const response = await fetch(this.getESP32Url('/'), {
            method: 'HEAD',
            signal: controller.signal,
            cache: 'no-cache'
        });
        
        clearTimeout(timeoutId);
        return response.ok || response.status === 404; // 404 is OK, server is responding
    } catch (error) {
        console.error('ESP32-CAM connection test failed:', error);
        return false;
    }
};

// ESP32-CAM setup validation
CONFIG.validateESP32Setup = async function() {
    console.log('🔍 Validating ESP32-CAM setup...');
    
    const results = {
        ipReachable: false,
        streamAvailable: false,
        captureAvailable: false,
        recommendations: []
    };
    
    // Test basic connectivity
    results.ipReachable = await this.testESP32Connection();
    
    if (!results.ipReachable) {
        results.recommendations.push('❌ ESP32-CAM not reachable. Check:');
        results.recommendations.push('   • IP address in config.js matches ESP32 Serial Monitor output');
        results.recommendations.push('   • ESP32-CAM and computer are on same WiFi network');
        results.recommendations.push('   • ESP32-CAM code is uploaded and running');
        return results;
    }
    
    // Test stream endpoint
    try {
        const streamResponse = await fetch(this.getStreamUrl(), { 
            method: 'HEAD',
            cache: 'no-cache' 
        });
        results.streamAvailable = streamResponse.ok;
    } catch (error) {
        results.streamAvailable = false;
    }
    
    // Test capture endpoint
    try {
        const captureResponse = await fetch(this.getCaptureUrl(), { 
            method: 'HEAD',
            cache: 'no-cache' 
        });
        results.captureAvailable = captureResponse.ok;
    } catch (error) {
        results.captureAvailable = false;
    }
    
    // Generate recommendations
    if (results.streamAvailable && results.captureAvailable) {
        results.recommendations.push('✅ ESP32-CAM fully functional!');
        results.recommendations.push('📹 Stream available at: ' + this.getStreamUrl());
        results.recommendations.push('📸 Capture available at: ' + this.getCaptureUrl());
    } else {
        results.recommendations.push('⚠️ ESP32-CAM partially functional:');
        if (!results.streamAvailable) {
            results.recommendations.push('   • Stream endpoint not working');
        }
        if (!results.captureAvailable) {
            results.recommendations.push('   • Capture endpoint not working');
        }
        results.recommendations.push('   • Try uploading standard ESP32-CAM web server example');
    }
    
    return results;
};

// Auto-detect ESP32-CAM IP (experimental)
CONFIG.scanForESP32 = async function() {
    console.log('🔍 Scanning local network for ESP32-CAM...');
    
    // Get local IP range (basic implementation)
    const getLocalIPRange = () => {
        // This is a simplified approach - in production, you might want more sophisticated network detection
        const commonRanges = [
            '192.168.1.',
            '192.168.0.',
            '10.0.0.',
            '172.16.0.'
        ];
        
        // Try to detect from current page URL if running locally
        try {
            const hostname = window.location.hostname;
            if (hostname.startsWith('192.168.') || hostname.startsWith('10.0.') || hostname.startsWith('172.16.')) {
                const parts = hostname.split('.');
                return parts.slice(0, 3).join('.') + '.';
            }
        } catch (error) {
            // Fallback to common ranges
        }
        
        return commonRanges;
    };
    
    const ipRanges = getLocalIPRange();
    const foundDevices = [];
    
    // This is a basic scan - in production, you'd want to use more sophisticated methods
    console.log('⚠️ ESP32-CAM auto-detection is experimental. Manual IP configuration recommended.');
    
    return foundDevices;
};

// For debugging - remove in production
CONFIG.debug = function() {
    console.log('🚀 Blazers Configuration:', {
        environment: this.IS_DEVELOPMENT ? 'DEVELOPMENT' : 'PRODUCTION',
        hostname: window.location.hostname,
        apiBaseUrl: this.getApiUrl(),
        esp32IP: this.ESP32_CONFIG.IP,
        esp32StreamUrl: this.getStreamUrl(),
        healthEndpoint: this.getEndpointUrl('HEALTH'),
        predictEndpoint: this.getEndpointUrl('PREDICT')
    });
};

// ESP32-CAM specific debugging
CONFIG.debugESP32 = function() {
    console.log('📹 ESP32-CAM Configuration:', {
        ip: this.ESP32_CONFIG.IP,
        port: this.ESP32_CONFIG.PORT,
        streamUrl: this.getStreamUrl(),
        captureUrl: this.getCaptureUrl(),
        defaultSettings: this.ESP32_CONFIG.DEFAULT_SETTINGS,
        qualityPresets: this.ESP32_CONFIG.QUALITY_PRESETS
    });
};

// Initialize ESP32-CAM validation on load
CONFIG.initESP32Validation = async function() {
    if (this.IS_DEVELOPMENT) {
        console.log('🔧 Development mode: Running ESP32-CAM validation...');
        
        // Wait a bit for page to load
        setTimeout(async () => {
            const validation = await this.validateESP32Setup();
            
            console.log('📹 ESP32-CAM Validation Results:');
            validation.recommendations.forEach(rec => console.log(rec));
            
            if (!validation.ipReachable) {
                console.log('💡 Quick Fix: Update CONFIG.ESP32_CONFIG.IP in config.js with your ESP32-CAM IP address');
                console.log('   You can find this in the Arduino Serial Monitor after uploading the code');
            }
        }, 3000);
    }
};

// Make available globally
window.CONFIG = CONFIG;

// Auto-debug in development
if (CONFIG.IS_DEVELOPMENT) {
    CONFIG.debug();
    CONFIG.debugESP32();
    CONFIG.initESP32Validation();
}

console.log('✅ Blazers Configuration with ESP32-CAM support loaded successfully');
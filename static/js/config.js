// Static Configuration for Blazers Mars Rover Frontend with ESP32-CAM Proxy Support
// This approach works without Node.js or build tools and solves HTTPS mixed content issues

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
            // Your actual Hugging Face Space URL
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
    
    // ESP32-CAM Configuration - Now uses HTTPS proxy instead of direct HTTP
    ESP32_CONFIG: {
        // The actual ESP32-CAM IP (used by backend proxy)
        IP: "192.168.0.102", // Still needed for backend proxy
        PORT: 80,
        
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
        },
        
        // NEW: Use HTTPS proxy instead of direct HTTP connection
        USE_PROXY: true
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
    
    // ESP32-CAM Proxy Endpoints (HTTPS-safe)
    ESP32_PROXY_ENDPOINTS: {
        STREAM: '/esp32/stream',
        CAPTURE: '/esp32/capture',
        STATUS: '/esp32/status',
        CONTROL: '/esp32/control',
        COMMAND: '/esp32/command' // WebSocket proxy
    },
    
    // ESP32-CAM Direct Endpoints (for fallback/local development)
    ESP32_DIRECT_ENDPOINTS: {
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

// ESP32-CAM URL builders - Now supports both proxy and direct modes
CONFIG.getESP32Url = function(endpoint = '') {
    if (this.ESP32_CONFIG.USE_PROXY) {
        // Use HTTPS proxy through the backend (solves mixed content issue)
        return this.getApiUrl(endpoint);
    } else {
        // Direct HTTP connection (for local development only)
        return `http://${this.ESP32_CONFIG.IP}:${this.ESP32_CONFIG.PORT}${endpoint}`;
    }
};

CONFIG.getESP32EndpointUrl = function(endpointKey) {
    const endpoints = this.ESP32_CONFIG.USE_PROXY ? 
        this.ESP32_PROXY_ENDPOINTS : 
        this.ESP32_DIRECT_ENDPOINTS;
    
    const endpoint = endpoints[endpointKey] || '';
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
    const baseUrl = this.getESP32EndpointUrl('CONTROL');
    return `${baseUrl}?var=${parameter}&val=${value}`;
};

// ESP32-CAM WebSocket URL (uses proxy for HTTPS sites)
CONFIG.getCommandWebSocketUrl = function() {
    if (this.ESP32_CONFIG.USE_PROXY) {
        // Use WSS proxy through backend
        const apiUrl = this.getApiUrl('');
        const wsUrl = apiUrl.replace('https://', 'wss://').replace('http://', 'ws://');
        return `${wsUrl}/esp32/command?esp32_ip=${this.ESP32_CONFIG.IP}`;
    } else {
        // Direct WebSocket connection (for local development)
        return `ws://${this.ESP32_CONFIG.IP}:${this.ESP32_CONFIG.PORT}/Command`;
    }
};

// ESP32-CAM connection test - Updated for proxy support
CONFIG.testESP32Connection = async function() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.ESP32_CONFIG.CONNECTION_TIMEOUT);
        
        // Use proxy status endpoint if proxy is enabled
        const testUrl = this.ESP32_CONFIG.USE_PROXY ? 
            this.getApiUrl('/esp32/status') : 
            this.getESP32Url('/');
        
        const response = await fetch(testUrl, {
            method: 'GET',
            signal: controller.signal,
            cache: 'no-cache',
            headers: this.ESP32_CONFIG.USE_PROXY ? {
                'X-ESP32-IP': this.ESP32_CONFIG.IP
            } : {}
        });
        
        clearTimeout(timeoutId);
        
        if (this.ESP32_CONFIG.USE_PROXY) {
            // For proxy, check the JSON response
            const status = await response.json();
            return status.status === 'online';
        } else {
            // For direct connection
            return response.ok || response.status === 404;
        }
    } catch (error) {
        console.error('ESP32-CAM connection test failed:', error);
        return false;
    }
};

// ESP32-CAM setup validation - Updated for proxy support
CONFIG.validateESP32Setup = async function() {
    console.log('Validating ESP32-CAM setup...');
    
    const results = {
        ipReachable: false,
        streamAvailable: false,
        captureAvailable: false,
        proxyMode: this.ESP32_CONFIG.USE_PROXY,
        recommendations: []
    };
    
    // Test basic connectivity
    results.ipReachable = await this.testESP32Connection();
    
    if (!results.ipReachable) {
        if (this.ESP32_CONFIG.USE_PROXY) {
            results.recommendations.push('ESP32-CAM not reachable through proxy. Check:');
            results.recommendations.push('   • Backend proxy server is running');
            results.recommendations.push('   • ESP32-CAM IP is correct in config.js');
            results.recommendations.push('   • ESP32-CAM and backend server are on same network');
        } else {
            results.recommendations.push('ESP32-CAM not reachable directly. Check:');
            results.recommendations.push('   • IP address in config.js matches ESP32 Serial Monitor output');
            results.recommendations.push('   • ESP32-CAM and computer are on same WiFi network');
            results.recommendations.push('   • ESP32-CAM code is uploaded and running');
        }
        return results;
    }
    
    // Test stream endpoint
    try {
        const streamResponse = await fetch(this.getStreamUrl(), { 
            method: 'HEAD',
            cache: 'no-cache',
            headers: this.ESP32_CONFIG.USE_PROXY ? {
                'X-ESP32-IP': this.ESP32_CONFIG.IP
            } : {}
        });
        results.streamAvailable = streamResponse.ok;
    } catch (error) {
        results.streamAvailable = false;
    }
    
    // Test capture endpoint
    try {
        const captureResponse = await fetch(this.getCaptureUrl(), { 
            method: 'HEAD',
            cache: 'no-cache',
            headers: this.ESP32_CONFIG.USE_PROXY ? {
                'X-ESP32-IP': this.ESP32_CONFIG.IP
            } : {}
        });
        results.captureAvailable = captureResponse.ok;
    } catch (error) {
        results.captureAvailable = false;
    }
    
    // Generate recommendations
    const mode = this.ESP32_CONFIG.USE_PROXY ? 'HTTPS Proxy' : 'Direct HTTP';
    
    if (results.streamAvailable && results.captureAvailable) {
        results.recommendations.push(`ESP32-CAM fully functional via ${mode}!`);
        results.recommendations.push(`Stream available at: ${this.getStreamUrl()}`);
        results.recommendations.push(`Capture available at: ${this.getCaptureUrl()}`);
    } else {
        results.recommendations.push(`ESP32-CAM partially functional via ${mode}:`);
        if (!results.streamAvailable) {
            results.recommendations.push('   • Stream endpoint not working');
        }
        if (!results.captureAvailable) {
            results.recommendations.push('   • Capture endpoint not working');
        }
        
        if (this.ESP32_CONFIG.USE_PROXY) {
            results.recommendations.push('   • Check backend proxy server logs');
            results.recommendations.push('   • Verify ESP32-CAM is accessible from backend server');
        } else {
            results.recommendations.push('   • Try uploading standard ESP32-CAM web server example');
        }
    }
    
    return results;
};

// Auto-detect ESP32-CAM IP (experimental)
CONFIG.scanForESP32 = async function() {
    console.log('Scanning local network for ESP32-CAM...');
    
    // Get local IP range (basic implementation)
    const getLocalIPRange = () => {
        const commonRanges = [
            '192.168.1.',
            '192.168.0.',
            '10.0.0.',
            '172.16.0.'
        ];
        
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
    
    console.log('ESP32-CAM auto-detection is experimental. Manual IP configuration recommended.');
    
    return foundDevices;
};

// For debugging - remove in production
CONFIG.debug = function() {
    console.log('Blazers Configuration:', {
        environment: this.IS_DEVELOPMENT ? 'DEVELOPMENT' : 'PRODUCTION',
        hostname: window.location.hostname,
        apiBaseUrl: this.getApiUrl(),
        esp32IP: this.ESP32_CONFIG.IP,
        proxyMode: this.ESP32_CONFIG.USE_PROXY,
        esp32StreamUrl: this.getStreamUrl(),
        esp32CommandWsUrl: this.getCommandWebSocketUrl(),
        healthEndpoint: this.getEndpointUrl('HEALTH'),
        predictEndpoint: this.getEndpointUrl('PREDICT')
    });
};

// ESP32-CAM specific debugging
CONFIG.debugESP32 = function() {
    console.log('ESP32-CAM Configuration:', {
        ip: this.ESP32_CONFIG.IP,
        port: this.ESP32_CONFIG.PORT,
        useProxy: this.ESP32_CONFIG.USE_PROXY,
        streamUrl: this.getStreamUrl(),
        captureUrl: this.getCaptureUrl(),
        commandWsUrl: this.getCommandWebSocketUrl(),
        defaultSettings: this.ESP32_CONFIG.DEFAULT_SETTINGS,
        qualityPresets: this.ESP32_CONFIG.QUALITY_PRESETS
    });
};

// Initialize ESP32-CAM validation on load
CONFIG.initESP32Validation = async function() {
    if (this.IS_DEVELOPMENT) {
        console.log('Development mode: Running ESP32-CAM validation...');
        
        setTimeout(async () => {
            const validation = await this.validateESP32Setup();
            
            console.log('ESP32-CAM Validation Results:');
            validation.recommendations.forEach(rec => console.log(rec));
            
            if (!validation.ipReachable) {
                if (this.ESP32_CONFIG.USE_PROXY) {
                    console.log('Quick Fix: Ensure backend proxy server is running and ESP32-CAM is accessible');
                } else {
                    console.log('Quick Fix: Update CONFIG.ESP32_CONFIG.IP in config.js with your ESP32-CAM IP address');
                    console.log('   You can find this in the Arduino Serial Monitor after uploading the code');
                }
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

console.log('Blazers Configuration with ESP32-CAM HTTPS proxy support loaded successfully');
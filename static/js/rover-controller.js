// Enhanced Rover Control System with ESP32-CAM HTTP Stream Integration
class RoverController {
    constructor() {
        // Use static configuration
        this.API_BASE_URL = window.CONFIG ? window.CONFIG.getApiUrl() : 'https://your-space-name.hf.space';
        this.esp32IP = window.CONFIG ? window.CONFIG.ESP32_IP : "192.168.0.102";
        
        // Log the configuration being used
        console.log('🤖 RoverController initialized with:', {
            apiBaseUrl: this.API_BASE_URL,
            esp32IP: this.esp32IP,
            environment: window.CONFIG?.IS_DEVELOPMENT ? 'DEVELOPMENT' : 'PRODUCTION'
        });
        
        // ESP32-CAM HTTP Stream Controller
        this.esp32Cam = null;
        
        // Legacy WebSocket properties (kept for compatibility)
        this.websockets = {
            camera: null,
            servo: null,
            command: null
        };
        
        this.connectionStatus = false;
        this.missionState = {
            autonomous: false,
            sweeping: false,
            currentBalloon: 0
        };
        this.objectDetectionRunning = false;
        this.missionLogs = [];
        this.detectionInterval = null;
        this.currentCameraSource = "esp32"; // Default to ESP32-CAM
        this.localStream = null;
        this.allVideoElements = [];
        
        this.detectableObjects = [
            'person', 'hammer', 'balloon', 'tennis_ball', 'traffic_cone'
        ];
        
        this.detectedObjects = new Set();
        this.init();
    }
    
    init() {
        this.initVideoElements();
        this.initESP32Camera(); // New HTTP stream initialization
        this.initWebSockets(); // Keep for command interface
        this.startHeartbeat();
        this.initEventListeners();
        this.loadMissionLogsBackup();
        this.initObjectDetectionPanel();
    }
    
    // Initialize ESP32-CAM HTTP Stream
    initESP32Camera() {
        this.esp32Cam = new ESP32CamHTTPController(this.esp32IP, this);
        console.log('ESP32-CAM HTTP controller initialized');
    }
    
    // Initialize and track all video elements for synchronization
    initVideoElements() {
        const webcam = document.getElementById('webcam');
        const roverVideoFeed = document.getElementById('roverVideoFeed');
        const streamElement = document.getElementById('stream');
        
        this.allVideoElements = [];
        if (webcam) this.allVideoElements.push(webcam);
        if (roverVideoFeed) this.allVideoElements.push(roverVideoFeed);
        if (streamElement) this.allVideoElements.push(streamElement);
        
        console.log(`Tracking ${this.allVideoElements.length} video elements for ESP32-CAM stream`);
    }
    
    initWebSockets() {
        // Only initialize command WebSocket (camera is handled by HTTP stream)
        const commandUrl = `ws://${this.esp32IP}/Command`;
        console.log("Attempting to connect to command interface at:", commandUrl);
        
        this.websockets.command = new WebSocket(commandUrl);
        
        this.websockets.command.onopen = () => {
            console.log("Command WebSocket connected");
            this.addStatusLog("Command interface ready", "good");
        };
        
        this.websockets.command.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.updateMissionStatus(data);
            } catch (error) {
                console.error("Error parsing command data:", error);
            }
        };
        
        this.websockets.command.onclose = () => {
            console.log("Command WebSocket disconnected");
            this.addStatusLog("Command interface lost", "error");
            setTimeout(() => this.initWebSockets(), 3000);
        };
        
        this.websockets.command.onerror = (error) => {
            console.error("Command WebSocket error:", error);
            this.addStatusLog("Command connection error", "error");
        };
    }
    
    // Enhanced camera source switching (now primarily ESP32-CAM focused)
    switchCameraSource(source) {
        console.log(`Switching camera source from ${this.currentCameraSource} to ${source}`);
        
        // Stop previous local stream if switching away from webcam
        if (this.localStream && source !== 'webcam') {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        this.currentCameraSource = source;
        
        switch(source) {
            case 'webcam':
                this.initLocalWebcam();
                this.addStatusLog("Switched to local webcam", "good");
                break;
            case 'esp32':
                // ESP32-CAM HTTP stream is handled automatically
                if (this.esp32Cam) {
                    this.esp32Cam.startStream();
                }
                this.addStatusLog("Switched to ESP32-CAM", "good");
                break;
            case 'external':
                this.addStatusLog("External camera source selected", "warning");
                break;
            default:
                this.addStatusLog("Unknown camera source", "error");
        }
        
        // Update the camera source dropdown
        const cameraSourceSelect = document.getElementById('camera-source-select');
        if (cameraSourceSelect && cameraSourceSelect.value !== source) {
            cameraSourceSelect.value = source;
        }
    }
    
    async initLocalWebcam() {
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                // Stop existing stream first
                if (this.localStream) {
                    this.localStream.getTracks().forEach(track => track.stop());
                }
                
                this.localStream = await navigator.mediaDevices.getUserMedia({ 
                    video: { 
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                        frameRate: { ideal: 30 }
                    } 
                });
                
                // Apply stream to video elements only
                this.allVideoElements.forEach(element => {
                    if (element && element.tagName.toLowerCase() === 'video') {
                        element.srcObject = this.localStream;
                        element.play().catch(e => console.log('Video play error:', e));
                    }
                });
                
                this.addStatusLog("Local webcam synchronized", "good");
                console.log('Local webcam initialized');
            }
        } catch (error) {
            console.error('Error accessing local webcam:', error);
            this.addStatusLog("Local webcam access failed", "error");
        }
    }
    
    initObjectDetectionPanel() {
        const panel = document.getElementById('object-detection-panel');
        if (panel) {
            const objectGrid = document.getElementById('object-grid');
            if (objectGrid) {
                this.detectableObjects.forEach(objName => {
                    const objButton = document.createElement('div');
                    objButton.className = 'detection-object-btn';
                    objButton.id = `obj-${objName}`;
                    objButton.textContent = objName.toUpperCase().replace('_', ' ');
                    objButton.setAttribute('data-object', objName);
                    objButton.style.cssText = `
                        font-size: 0.7rem;
                        padding: 2px 4px;
                        margin: 1px;
                        background: rgba(0, 255, 65, 0.1);
                        border: 1px solid #00ff41;
                        color: #00ff41;
                        text-align: center;
                        cursor: pointer;
                        border-radius: 2px;
                        transition: all 0.3s ease;
                    `;
                    
                    objectGrid.appendChild(objButton);
                });
            }
        }
    }
    
    highlightDetectedObject(objectClass) {
        const objButton = document.getElementById(`obj-${objectClass.toLowerCase()}`);
        if (objButton) {
            objButton.style.background = 'rgba(255, 170, 0, 0.8)';
            objButton.style.color = '#000';
            objButton.style.borderColor = '#ffaa00';
            this.detectedObjects.add(objectClass.toLowerCase());
            
            const detectionCount = document.getElementById('detection-count');
            if (detectionCount) {
                detectionCount.textContent = this.detectedObjects.size;
            }
            
            setTimeout(() => {
                objButton.style.background = 'rgba(0, 255, 65, 0.1)';
                objButton.style.color = '#c95afdff';
                objButton.style.borderColor = '#c95afdff';
            }, 10000);
        }
    }
    
    sendCommand(command, value, extraData = {}) {
        if (this.websockets.command && this.websockets.command.readyState === WebSocket.OPEN) {
            const data = {
                command: command,
                value: value,
                timestamp: Date.now(),
                ...extraData
            };
            this.websockets.command.send(JSON.stringify(data));
            console.log('Command sent:', data);
            this.addStatusLog(`Command: ${command} - ${value}`, "good");
        } else {
            this.addStatusLog("Cannot send command - not connected", "error");
            console.warn("Command WebSocket not connected. Command:", command, value);
        }
    }
    
    updateConnectionStatus(connected) {
        this.connectionStatus = connected;
        const dot = document.getElementById('connectionDot');
        const status = document.getElementById('connectionStatus');
        
        if (dot && status) {
            if (connected) {
                dot.classList.add('connected');
                status.textContent = 'ESP32-CAM CONNECTED';
            } else {
                dot.classList.remove('connected');
                status.textContent = 'ESP32-CAM DISCONNECTED';
            }
        }
    }
    
    addStatusLog(message, type = "good") {
        const now = new Date();
        const timestamp = now.toTimeString().split(' ')[0];
        const statusLog = document.getElementById('statusLog');
        
        if (statusLog) {
            const logEntry = document.createElement('div');
            const envIndicator = window.CONFIG?.IS_DEVELOPMENT ? '[DEV] ' : '[PROD] ';
            const finalMessage = ['good', 'error'].includes(type) ? envIndicator + message : message;
            
            logEntry.innerHTML = `<span class="timestamp">${timestamp}</span><span class="status-${type}">${finalMessage.toUpperCase()}</span>`;
            statusLog.appendChild(logEntry);
            statusLog.scrollTop = statusLog.scrollHeight;
            
            while (statusLog.children.length > 50) {
                statusLog.removeChild(statusLog.firstChild);
            }
        }
    }
    
    updateMissionStatus(data) {
        this.missionState = { ...this.missionState, ...data };
        
        const roverStatus = document.getElementById('roverStatus');
        const currentMission = document.getElementById('currentMission');
        const currentTarget = document.getElementById('currentTarget');
        
        if (roverStatus && data.missionStatus) {
            roverStatus.textContent = data.missionStatus;
        }
        
        if (currentMission && data.currentBalloon !== undefined) {
            const balloonColors = ["BLACK", "WHITE", "PINK", "YELLOW", "BLUE"];
            const target = data.currentBalloon < balloonColors.length ? 
                balloonColors[data.currentBalloon] : "COMPLETE";
            currentMission.textContent = `BALLOON SEQUENCE - ${target}`;
        }
        
        if (currentTarget && data.targetInfo) {
            currentTarget.textContent = data.targetInfo;
        }
    }
    
    startHeartbeat() {
        setInterval(() => {
            if (this.connectionStatus) {
                this.sendCommand('heartbeat', 'ping');
            }
        }, 10000);
    }
    
    async sendFrameForDetection(frameBlob) {
        try {
            const formData = new FormData();
            formData.append('frame', frameBlob);
            
            const detectUrl = window.CONFIG ? window.CONFIG.getEndpointUrl('PREDICT') : `${this.API_BASE_URL}/api/predict`;
            
            const response = await fetch(detectUrl, {
                method: 'POST',
                body: formData,
                timeout: 5000
            });
            
            if (response.ok) {
                const result = await response.json();
                this.processDetectionResult(result);
            } else {
                console.warn('Backend detection failed:', response.statusText);
            }
        } catch (error) {
            console.error('Error sending frame for detection:', error);
            if (Date.now() % 10000 < 1000) {
                this.addStatusLog("Detection service unavailable", "warning");
            }
        }
    }
    
    processDetectionResult(result) {
        const depthDisplay = document.getElementById('depth-display');
        const cameraIcon = document.getElementById('camera-icon');
        const currentTarget = document.getElementById('currentTarget');
        
        if (result.objects && result.objects.length > 0) {
            const primaryObject = result.objects[0];
            
            if (depthDisplay) {
                const detectionText = `DETECTED: ${primaryObject.class.toUpperCase()} (${(primaryObject.confidence * 100).toFixed(1)}%)`;
                depthDisplay.innerHTML = detectionText;
                depthDisplay.style.color = '#ffaa00';
            }
            
            if (cameraIcon) {
                cameraIcon.style.color = 'red';
            }
            
            if (currentTarget) {
                currentTarget.textContent = `${primaryObject.class.toUpperCase()} DETECTED`;
            }
            
            this.highlightDetectedObject(primaryObject.class);
            this.addStatusLog(`Detected: ${primaryObject.class} (${(primaryObject.confidence * 100).toFixed(1)}%)`, "warning");
            
            const missionObjects = ['hammer', 'tennis_ball', 'traffic_cone', 'balloon'];
            if (missionObjects.some(obj => primaryObject.class.toLowerCase().includes(obj))) {
                this.addStatusLog(`MISSION OBJECT FOUND: ${primaryObject.class} - MANUAL CAPTURE REQUIRED`, "warning");
                if (cameraIcon) {
                    cameraIcon.style.animation = 'flash 1s infinite';
                    setTimeout(() => {
                        cameraIcon.style.animation = 'none';
                    }, 3000);
                }
            }
            
            if (result.navigation && this.missionState.autonomous) {
                this.processNavigationGuidance(result.navigation);
            }
        } else {
            if (depthDisplay) {
                depthDisplay.innerHTML = "SCANNING FOR OBJECTS...";
                depthDisplay.style.color = '#00ff41';
            }
            
            if (cameraIcon) {
                cameraIcon.style.color = 'white';
                cameraIcon.style.animation = 'none';
            }
            
            if (currentTarget) {
                currentTarget.textContent = "SCANNING...";
            }
        }
    }
    
    processNavigationGuidance(guidance) {
        if (!guidance || !this.missionState.autonomous) return;
        
        this.addStatusLog(`Navigation: ${guidance.message}`, "good");
        
        switch (guidance.action) {
            case 'move_forward':
                this.sendCommand('move', 'forward');
                setTimeout(() => this.sendCommand('move', 'stop'), 500);
                break;
            case 'turn_left':
                this.sendCommand('move', 'left');
                setTimeout(() => this.sendCommand('move', 'stop'), 300);
                break;
            case 'turn_right':
                this.sendCommand('move', 'right');
                setTimeout(() => this.sendCommand('move', 'stop'), 300);
                break;
            case 'continue_search':
                break;
        }
    }
    
    // Enhanced screenshot method using ESP32-CAM
    async takeScreenshot(objectDetected = "Manual", depth = 1.5) {
        let frameBlob = null;
        
        // Try to get frame from ESP32-CAM first
        if (this.esp32Cam && this.esp32Cam.isConnected) {
            frameBlob = await this.esp32Cam.getCurrentFrameBlob();
            this.addStatusLog(`Screenshot from ESP32-CAM: ${objectDetected}`, "good");
        }
        
        // Fallback to local webcam
        if (!frameBlob && this.currentCameraSource === 'webcam') {
            frameBlob = await this.captureFromVideoElement();
            this.addStatusLog(`Screenshot from webcam: ${objectDetected}`, "good");
        }
        
        if (frameBlob) {
            console.log("Screenshot taken for:", objectDetected);
            
            try {
                const timestamp = Date.now();
                const storageRef = window.firebaseRefs.ref(window.firebaseStorage, `EXPLORATION_SAMPLES/screenshot_${timestamp}.png`);
                
                await window.firebaseRefs.uploadBytes(storageRef, frameBlob);
                const downloadURL = await window.firebaseRefs.getDownloadURL(storageRef);
                await this.updateDatabaseWithImage(downloadURL, depth, objectDetected);
                
            } catch (error) {
                console.error('Error saving screenshot:', error);
                this.addStatusLog("Screenshot save failed", "error");
            }
        } else {
            this.addStatusLog("No frame available for screenshot", "error");
        }
    }
    
    // Fallback method to capture from video element
    async captureFromVideoElement() {
        let activeVideo = null;
        
        for (const video of this.allVideoElements) {
            if (video && video.tagName.toLowerCase() === 'video' && 
                video.srcObject && video.readyState >= video.HAVE_CURRENT_DATA) {
                activeVideo = video;
                break;
            }
        }
        
        if (!activeVideo) return null;
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = activeVideo.videoWidth || 640;
        canvas.height = activeVideo.videoHeight || 480;
        
        try {
            context.drawImage(activeVideo, 0, 0, canvas.width, canvas.height);
            
            return new Promise((resolve) => {
                canvas.toBlob(resolve, 'image/png');
            });
        } catch (error) {
            console.error('Error capturing from video element:', error);
            return null;
        }
    }
    
    async updateDatabaseWithImage(imageUrl, depth, objectDetected) {
        try {
            const userCredential = await window.firebaseRefs.signInWithEmailAndPassword(
                window.firebaseAuth, 
                'lanre.mohammed23@gmail.com', 
                'Wilmar.jr7'
            );
            
            const videoImageRef = window.firebaseRefs.dbRef(window.firebaseDatabase, 'Samples/');
            const timestamp = Date.now();
            
            await window.firebaseRefs.update(window.firebaseRefs.child(videoImageRef, timestamp.toString()), {
                object: objectDetected,
                image_name: `manual_capture_${objectDetected}_${timestamp}`,
                image: imageUrl,
                timestamp: timestamp,
                depth: depth,
                mode: 'exploration_manual',
                camera_source: this.currentCameraSource,
                analyst_name: 'Rover System',
                analyst_comment: `Manually captured during exploration mission. Context: ${objectDetected}. Source: ${this.currentCameraSource.toUpperCase()}`
            });

            this.addStatusLog("Manual capture uploaded to database", "good");
            
        } catch (error) {
            console.error('Database update error:', error);
            this.addStatusLog("Database update failed", "error");
        }
    }
    
    startObjectDetection() {
        if (this.objectDetectionRunning) return;
        
        this.objectDetectionRunning = true;
        this.addStatusLog(`Object detection started using ${this.currentCameraSource.toUpperCase()} - MANUAL CAPTURE ONLY`, "good");
        
        this.detectionInterval = setInterval(async () => {
            if (this.objectDetectionRunning) {
                await this.captureAndAnalyzeFrame();
            }
        }, 2000);
    }
    
    stopObjectDetection() {
        this.objectDetectionRunning = false;
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }
        this.addStatusLog("Object detection stopped", "warning");
        
        const detectedButtons = document.querySelectorAll('.detection-object-btn');
        detectedButtons.forEach(btn => {
            btn.style.background = 'rgba(0, 255, 65, 0.1)';
            btn.style.color = '#00ff41';
            btn.style.borderColor = '#00ff41';
        });
        
        const detectionCount = document.getElementById('detection-count');
        if (detectionCount) {
            detectionCount.textContent = '0';
        }
        this.detectedObjects.clear();
    }
    
    async captureAndAnalyzeFrame() {
        let frameBlob = null;
        
        // Get frame from ESP32-CAM first
        if (this.esp32Cam && this.esp32Cam.isConnected) {
            frameBlob = await this.esp32Cam.getCurrentFrameBlob();
        }
        
        // Fallback to webcam
        if (!frameBlob && this.currentCameraSource === 'webcam') {
            frameBlob = await this.captureFromVideoElement();
        }
        
        if (frameBlob && this.objectDetectionRunning) {
            await this.sendFrameForDetection(frameBlob);
        }
    }
    
    initEventListeners() {
        // Modal controls
        const expandIcon = document.getElementById('expand-icon');
        const modal = document.getElementById('roverControlModal');
        const closeModal = document.getElementById('closeModal');
        
        if (expandIcon) {
            expandIcon.addEventListener('click', () => {
                if (modal) {
                    modal.style.display = 'block';
                    this.startObjectDetection();
                    this.addStatusLog("Mission control interface opened", "good");
                }
            });
        }
        
        if (closeModal) {
            closeModal.addEventListener('click', () => {
                if (modal) {
                    modal.style.display = 'none';
                    this.stopObjectDetection();
                    this.addStatusLog("Mission control interface closed", "warning");
                }
            });
        }
        
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                    this.stopObjectDetection();
                    this.addStatusLog("Mission control interface closed", "warning");
                }
            });
        }
        
        // Mission control buttons
        const buttons = {
            'startAutonomous': () => {
                this.missionState.autonomous = !this.missionState.autonomous;
                this.sendCommand('autonomous', this.missionState.autonomous.toString());
                this.addStatusLog(`Autonomous mode: ${this.missionState.autonomous ? 'ON' : 'OFF'}`, "good");
            },
            'startMission': () => {
                this.sendCommand('startTask', 'true');
                this.addStatusLog("Mission sequence initiated", "good");
            },
            'toggleSweep': () => {
                this.missionState.sweeping = !this.missionState.sweeping;
                this.sendCommand('sweepMode', 'toggle');
                this.addStatusLog(`Sweep mode: ${this.missionState.sweeping ? 'ON' : 'OFF'}`, "good");
            },
            'resetSequence': () => {
                this.sendCommand('resetSequence', 'true');
                this.missionState.currentBalloon = 0;
                this.addStatusLog("Mission sequence reset", "warning");
            },
            'abortMission': () => {
                this.sendCommand('abortMission', 'true');
                this.missionState.autonomous = false;
                this.addStatusLog("Mission aborted", "error");
            },
            'emergencyStop': () => {
                this.sendCommand('emergencyStop', 'true');
                this.missionState.autonomous = false;
                this.addStatusLog("EMERGENCY STOP ACTIVATED", "error");
            }
        };
        
        Object.entries(buttons).forEach(([id, action]) => {
            const btn = document.getElementById(id);
            if (btn) {
                if (['startAutonomous', 'startMission', 'toggleSweep', 'resetSequence', 'abortMission'].includes(id)) {
                    btn.style.cssText += `
                        font-size: 0.8rem;
                        padding: 6px 10px;
                        margin: 2px;
                        min-height: 30px;
                    `;
                }
                btn.addEventListener('click', action);
            }
        });
        
        // Mission log functionality
        const addLogBtn = document.getElementById('addLogEntry');
        const logInput = document.getElementById('logInput');
        
        if (addLogBtn && logInput) {
            addLogBtn.addEventListener('click', () => {
                const logText = logInput.value.trim();
                if (logText) {
                    this.addMissionLog(logText);
                    logInput.value = '';
                }
            });
            
            logInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    const logText = logInput.value.trim();
                    if (logText) {
                        this.addMissionLog(logText);
                        logInput.value = '';
                    }
                }
            });
        }
    }
    
    addMissionLog(text) {
        const now = new Date();
        const timestamp = now.toTimeString().split(' ')[0];
        
        this.missionLogs.push({
            timestamp: timestamp,
            text: text,
            date: now.toISOString()
        });
        
        const logEntries = document.getElementById('logEntries');
        if (logEntries) {
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            logEntry.innerHTML = `<strong>${timestamp}</strong> - ${text}`;
            logEntries.appendChild(logEntry);
            logEntries.scrollTop = logEntries.scrollHeight;
            
            while (logEntries.children.length > 20) {
                logEntries.removeChild(logEntries.firstChild);
            }
        }
        
        this.addStatusLog("Mission log updated", "good");
        this.saveMissionLogsBackup();
    }
    
    saveMissionLogsBackup() {
        try {
            const backupData = {
                logs: this.missionLogs,
                timestamp: Date.now(),
                missionState: this.missionState
            };
            window.missionBackup = backupData;
        } catch (error) {
            console.warn('Could not save mission logs backup:', error);
        }
    }
    
    loadMissionLogsBackup() {
        try {
            if (window.missionBackup) {
                const data = window.missionBackup;
                if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
                    this.missionLogs = data.logs || [];
                    this.missionState = { ...this.missionState, ...data.missionState };
                    
                    const logEntries = document.getElementById('logEntries');
                    if (logEntries && this.missionLogs.length > 0) {
                        this.missionLogs.forEach(log => {
                            const logEntry = document.createElement('div');
                            logEntry.className = 'log-entry';
                            logEntry.innerHTML = `<strong>${log.timestamp}</strong> - ${log.text}`;
                            logEntries.appendChild(logEntry);
                        });
                        logEntries.scrollTop = logEntries.scrollHeight;
                    }
                }
            }
        } catch (error) {
            console.warn('Could not load mission logs backup:', error);
        }
    }
    
    async checkBackendHealth() {
        try {
            const healthUrl = window.CONFIG 
                ? window.CONFIG.getEndpointUrl('HEALTH') 
                : `${this.API_BASE_URL}/api/health`;

            const response = await fetch(healthUrl, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status} - ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                throw new Error(`Expected JSON, got: ${contentType}`);
            }

            const health = await response.json();
            this.addStatusLog("Object detection backend online", "good");
            console.log('✅ Backend health check passed:', health);
            return true;

        } catch (error) {
            this.addStatusLog("Backend not available - using fallback mode", "warning");
            console.error('❌ Backend health check error:', error);
            return false;
        }
    }
    
    getCurrentCameraInfo() {
        return {
            source: this.currentCameraSource,
            connected: this.esp32Cam ? this.esp32Cam.isConnected : false,
            activeElements: this.allVideoElements.filter(v => v && (v.srcObject || v.src)).length,
            totalElements: this.allVideoElements.length,
            detectionRunning: this.objectDetectionRunning
        };
    }
    
    forceCameraSync() {
        console.log('Forcing camera synchronization...');
        this.addStatusLog("Forcing camera synchronization", "warning");
        
        if (this.currentCameraSource === 'webcam' && this.localStream) {
            this.allVideoElements.forEach(element => {
                if (element && element.tagName.toLowerCase() === 'video') {
                    element.srcObject = this.localStream;
                    element.play().catch(e => console.log('Video play error:', e));
                }
            });
        } else if (this.currentCameraSource === 'esp32' && this.esp32Cam) {
            this.esp32Cam.startStream();
        }
        
        const info = this.getCurrentCameraInfo();
        console.log('Camera sync info:', info);
    }
}

// ESP32-CAM HTTP Controller Class
class ESP32CamHTTPController {
    constructor(esp32IP, parentController) {
        this.esp32IP = esp32IP || "192.168.0.102";
        this.streamPort = 80;
        this.parentController = parentController;
        
        // Stream endpoints based on ESP32-CAM web server
        this.endpoints = {
            stream: `http://${this.esp32IP}:${this.streamPort}/stream`,
            capture: `http://${this.esp32IP}:${this.streamPort}/capture`,
            status: `http://${this.esp32IP}:${this.streamPort}/status`,
            control: `http://${this.esp32IP}:${this.streamPort}/control`
        };
        
        this.isConnected = false;
        this.videoElements = [];
        this.connectionCheckInterval = null;
        this.streamImg = null;
        this.retryCount = 0;
        this.maxRetries = 5;
        
        console.log('ESP32-CAM HTTP Controller initialized with IP:', this.esp32IP);
        this.init();
    }
    
    init() {
        this.findVideoElements();
        this.createStreamImage();
        this.startConnectionMonitoring();
        this.setupEventListeners();
    }
    
    findVideoElements() {
        // Find all elements that should show the ESP32-CAM stream
        const videoSelectors = [
            '#webcam',
            '#roverVideoFeed', 
            '#stream',
            '.camera-feed',
            '[data-camera="esp32"]'
        ];
        
        this.videoElements = [];
        videoSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                if (el && !this.videoElements.includes(el)) {
                    this.videoElements.push(el);
                }
            });
        });
        
        console.log(`Found ${this.videoElements.length} elements for ESP32-CAM stream`);
    }
    
    createStreamImage() {
        // Create a hidden image element to handle the MJPEG stream
        this.streamImg = document.createElement('img');
        this.streamImg.style.display = 'none';
        this.streamImg.crossOrigin = 'anonymous';
        this.streamImg.id = 'esp32-stream-handler';
        document.body.appendChild(this.streamImg);
        
        // Handle stream load events
        this.streamImg.onload = () => {
            if (!this.isConnected) {
                this.isConnected = true;
                this.retryCount = 0;
                this.updateConnectionStatus(true);
                console.log('✅ ESP32-CAM stream connected');
            }
            this.updateVideoElements();
        };
        
        this.streamImg.onerror = () => {
            if (this.isConnected) {
                this.isConnected = false;
                this.updateConnectionStatus(false);
                console.log('❌ ESP32-CAM stream error');
            }
            this.handleStreamError();
        };
    }
    
    startStream() {
        console.log('Starting ESP32-CAM HTTP stream...');
        console.log('Stream URL:', this.endpoints.stream);
        
        // Add timestamp to prevent caching issues
        const streamUrl = `${this.endpoints.stream}?t=${Date.now()}`;
        
        // Set the stream source
        this.streamImg.src = streamUrl;
        
        // Also directly set video/img elements to the stream
        this.videoElements.forEach(element => {
            if (element) {
                if (element.tagName.toLowerCase() === 'img') {
                    element.src = streamUrl;
                    element.onerror = () => this.handleElementError(element);
                } else if (element.tagName.toLowerCase() === 'video') {
                    // For video elements showing MJPEG stream
                    element.src = streamUrl;
                    element.load();
                    element.onerror = () => this.handleElementError(element);
                }
            }
        });
        
        if (this.parentController) {
            this.parentController.addStatusLog("Starting ESP32-CAM stream", "good");
        }
    }
    
    stopStream() {
        console.log('Stopping ESP32-CAM stream');
        
        if (this.streamImg) {
            this.streamImg.src = '';
        }
        
        this.videoElements.forEach(element => {
            if (element) {
                element.src = '';
                if (element.tagName.toLowerCase() === 'video') {
                    element.load();
                }
            }
        });
        
        this.isConnected = false;
        this.updateConnectionStatus(false);
        
        if (this.parentController) {
            this.parentController.addStatusLog("ESP32-CAM stream stopped", "warning");
        }
    }
    
    handleStreamError() {
        this.retryCount++;
        if (this.retryCount <= this.maxRetries) {
            const retryDelay = Math.min(1000 * Math.pow(2, this.retryCount), 10000); // Exponential backoff
            console.log(`ESP32-CAM stream retry ${this.retryCount}/${this.maxRetries} in ${retryDelay}ms`);
            
            if (this.parentController) {
                this.parentController.addStatusLog(`ESP32-CAM retry ${this.retryCount}/${this.maxRetries}`, "warning");
            }
            
            setTimeout(() => {
                if (this.retryCount <= this.maxRetries) {
                    this.startStream();
                }
            }, retryDelay);
        } else {
            console.error('ESP32-CAM stream failed after maximum retries');
            if (this.parentController) {
                this.parentController.addStatusLog("ESP32-CAM stream failed - check connection", "error");
            }
        }
    }
    
    handleElementError(element) {
        console.warn('Stream element error:', element.id || element.tagName);
        // Try to reload the element after a short delay
        setTimeout(() => {
            if (this.isConnected && element) {
                element.src = `${this.endpoints.stream}?t=${Date.now()}`;
                if (element.tagName.toLowerCase() === 'video') {
                    element.load();
                }
            }
        }, 2000);
    }
    
    updateVideoElements() {
        // Update all video elements with the current stream
        const timestamp = Date.now();
        const streamUrl = `${this.endpoints.stream}?t=${timestamp}`;
        
        this.videoElements.forEach(element => {
            if (element && this.isConnected) {
                if (element.tagName.toLowerCase() === 'img') {
                    element.src = streamUrl;
                } else if (element.tagName.toLowerCase() === 'video') {
                    element.src = streamUrl;
                }
            }
        });
    }
    
    startConnectionMonitoring() {
        // Check connection every 10 seconds
        this.connectionCheckInterval = setInterval(async () => {
            const isAlive = await this.checkConnection();
            
            if (isAlive && !this.isConnected) {
                console.log('ESP32-CAM detected - starting stream');
                this.startStream();
            } else if (!isAlive && this.isConnected) {
                console.log('ESP32-CAM connection lost');
                this.isConnected = false;
                this.updateConnectionStatus(false);
            }
        }, 10000);
        
        // Initial connection attempt after 2 seconds
        setTimeout(() => this.startStream(), 2000);
    }
    
    async checkConnection() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            // Try to fetch the main page instead of status (which might not exist)
            const response = await fetch(`http://${this.esp32IP}:${this.streamPort}/`, {
                method: 'HEAD', // Use HEAD to minimize data transfer
                signal: controller.signal,
                cache: 'no-cache'
            });
            
            clearTimeout(timeoutId);
            return response.ok || response.status === 404; // 404 is OK, means server is responding
        } catch (error) {
            return false;
        }
    }
    
    updateConnectionStatus(connected) {
        this.isConnected = connected;
        
        // Update parent controller's connection status
        if (this.parentController) {
            this.parentController.updateConnectionStatus(connected);
        }
        
        console.log(`ESP32-CAM connection status: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);
    }
    
    // Capture a single frame from the ESP32-CAM
    async captureFrame() {
        try {
            const response = await fetch(this.endpoints.capture, {
                cache: 'no-cache'
            });
            
            if (response.ok) {
                const blob = await response.blob();
                console.log('Frame captured from ESP32-CAM');
                return blob;
            } else {
                throw new Error(`Capture failed: ${response.status}`);
            }
        } catch (error) {
            console.error('Error capturing frame from ESP32-CAM:', error);
            return null;
        }
    }
    
    // Get current frame as canvas (for analysis)
    getCurrentFrameCanvas() {
        return new Promise((resolve) => {
            if (!this.streamImg || !this.streamImg.complete || !this.isConnected) {
                resolve(null);
                return;
            }
            
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                canvas.width = this.streamImg.naturalWidth || 640;
                canvas.height = this.streamImg.naturalHeight || 480;
                
                ctx.drawImage(this.streamImg, 0, 0, canvas.width, canvas.height);
                resolve(canvas);
            } catch (error) {
                console.error('Error creating canvas from stream:', error);
                resolve(null);
            }
        });
    }
    
    // Get current frame as blob (for sending to backend)
    async getCurrentFrameBlob() {
        // Try capture endpoint first (better quality)
        let frameBlob = await this.captureFrame();
        
        if (!frameBlob) {
            // Fallback to canvas capture from stream
            const canvas = await this.getCurrentFrameCanvas();
            if (canvas) {
                frameBlob = await new Promise((resolve) => {
                    canvas.toBlob(resolve, 'image/jpeg', 0.8);
                });
            }
        }
        
        return frameBlob;
    }
    
    // Camera control methods (ESP32-CAM web server supports these)
    async setCameraParameter(parameter, value) {
        try {
            const url = `${this.endpoints.control}?var=${parameter}&val=${value}`;
            const response = await fetch(url, { cache: 'no-cache' });
            
            if (response.ok) {
                console.log(`Camera parameter ${parameter} set to ${value}`);
                if (this.parentController) {
                    this.parentController.addStatusLog(`Camera ${parameter}: ${value}`, "good");
                }
                return true;
            } else {
                throw new Error(`Failed to set ${parameter}: ${response.status}`);
            }
        } catch (error) {
            console.error('Error setting camera parameter:', error);
            if (this.parentController) {
                this.parentController.addStatusLog(`Camera control error: ${parameter}`, "error");
            }
            return false;
        }
    }
    
    // Convenience methods for common camera adjustments
    async setBrightness(value) { // -2 to 2
        return this.setCameraParameter('brightness', Math.max(-2, Math.min(2, value)));
    }
    
    async setContrast(value) { // -2 to 2
        return this.setCameraParameter('contrast', Math.max(-2, Math.min(2, value)));
    }
    
    async setSaturation(value) { // -2 to 2
        return this.setCameraParameter('saturation', Math.max(-2, Math.min(2, value)));
    }
    
    async setFrameSize(value) { // 0-10 (FRAMESIZE_96X96 to FRAMESIZE_UXGA)
        const success = await this.setCameraParameter('framesize', Math.max(0, Math.min(10, value)));
        if (success) {
            // Restart stream after frame size change
            setTimeout(() => {
                this.stopStream();
                setTimeout(() => this.startStream(), 1000);
            }, 500);
        }
        return success;
    }
    
    async setQuality(value) { // 10-63 (lower = better quality)
        return this.setCameraParameter('quality', Math.max(10, Math.min(63, value)));
    }
    
    async setSpecialEffect(value) { // 0-6 (No Effect, Negative, Grayscale, etc.)
        return this.setCameraParameter('special_effect', Math.max(0, Math.min(6, value)));
    }
    
    async setWhiteBalance(value) { // 0-4 (Auto, Sunny, Cloudy, Office, Home)
        return this.setCameraParameter('wb_mode', Math.max(0, Math.min(4, value)));
    }
    
    setupEventListeners() {
        // Camera control UI elements (if they exist)
        const controls = [
            { id: 'esp32-brightness', method: 'setBrightness', min: -2, max: 2 },
            { id: 'esp32-contrast', method: 'setContrast', min: -2, max: 2 },
            { id: 'esp32-saturation', method: 'setSaturation', min: -2, max: 2 },
            { id: 'esp32-quality', method: 'setQuality', min: 10, max: 63 },
            { id: 'esp32-framesize', method: 'setFrameSize', min: 0, max: 10 },
            { id: 'esp32-special-effect', method: 'setSpecialEffect', min: 0, max: 6 },
            { id: 'esp32-white-balance', method: 'setWhiteBalance', min: 0, max: 4 }
        ];
        
        controls.forEach(({ id, method, min, max }) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', (e) => {
                    const value = parseInt(e.target.value);
                    const clampedValue = Math.max(min, Math.min(max, value));
                    this[method](clampedValue);
                });
            }
        });
        
        // Manual reconnect button
        const reconnectBtn = document.getElementById('reconnect-esp32');
        if (reconnectBtn) {
            reconnectBtn.addEventListener('click', () => {
                console.log('Manual ESP32-CAM reconnect requested');
                this.retryCount = 0;
                this.stopStream();
                setTimeout(() => this.startStream(), 1000);
            });
        }
        
        // Stream quality preset buttons
        const presetButtons = {
            'esp32-preset-high': () => this.applyPreset('high'),
            'esp32-preset-medium': () => this.applyPreset('medium'),
            'esp32-preset-low': () => this.applyPreset('low')
        };
        
        Object.entries(presetButtons).forEach(([id, action]) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', action);
            }
        });
    }
    
    async applyPreset(preset) {
        console.log(`Applying ESP32-CAM preset: ${preset}`);
        
        switch (preset) {
            case 'high':
                await this.setQuality(10); // Best quality
                await this.setFrameSize(9); // SXGA (1280x1024)
                break;
            case 'medium':
                await this.setQuality(20);
                await this.setFrameSize(7); // VGA (640x480)
                break;
            case 'low':
                await this.setQuality(40);
                await this.setFrameSize(5); // CIF (400x296)
                break;
        }
        
        if (this.parentController) {
            this.parentController.addStatusLog(`Applied ${preset} quality preset`, "good");
        }
    }
    
    // Get camera status info
    getCameraInfo() {
        return {
            connected: this.isConnected,
            ip: this.esp32IP,
            streamUrl: this.endpoints.stream,
            retryCount: this.retryCount,
            maxRetries: this.maxRetries,
            videoElements: this.videoElements.length
        };
    }
    
    // Cleanup method
    destroy() {
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
        
        this.stopStream();
        
        if (this.streamImg && this.streamImg.parentNode) {
            this.streamImg.parentNode.removeChild(this.streamImg);
            this.streamImg = null;
        }
        
        console.log('ESP32-CAM HTTP Controller destroyed');
    }
}

// Export RoverController for global use
window.RoverController = RoverController;
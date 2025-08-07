// Enhanced Rover Control System - Manual Capture Only, No Keyboard Shortcuts
class RoverController {
    constructor() {
        this.esp32IP = "192.168.0.102";
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
        this.currentCameraSource = "webcam";
        this.localStream = null;
        this.allVideoElements = [];
        
        // Detectable objects list
        this.detectableObjects = [
            'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck',
            'boat', 'traffic_light', 'fire_hydrant', 'stop_sign', 'parking_meter', 'bench',
            'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra',
            'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
            'skis', 'snowboard', 'sports_ball', 'kite', 'baseball_bat', 'baseball_glove',
            'skateboard', 'surfboard', 'tennis_racket', 'bottle', 'wine_glass', 'cup',
            'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
            'broccoli', 'carrot', 'hot_dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
            'potted_plant', 'bed', 'dining_table', 'toilet', 'tv', 'laptop', 'mouse',
            'remote', 'keyboard', 'cell_phone', 'microwave', 'oven', 'toaster', 'sink',
            'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy_bear', 'hair_dryer',
            'toothbrush', 'hammer', 'balloon', 'tennis_ball', 'traffic_cone'
        ];
        
        this.detectedObjects = new Set();
        this.init();
    }
    
    init() {
        this.initVideoElements();
        this.initWebSockets();
        this.startHeartbeat();
        this.initEventListeners();
        this.loadMissionLogsBackup();
        this.initObjectDetectionPanel();
    }
    
    // Initialize and track all video elements for synchronization
    initVideoElements() {
        const webcam = document.getElementById('webcam');
        const roverVideoFeed = document.getElementById('roverVideoFeed');
        
        this.allVideoElements = [];
        if (webcam) this.allVideoElements.push(webcam);
        if (roverVideoFeed) this.allVideoElements.push(roverVideoFeed);
        
        console.log(`Tracking ${this.allVideoElements.length} video elements for synchronization`);
    }
    
    initWebSockets() {
        // Camera WebSocket
        const cameraUrl = `ws://${this.esp32IP}/Camera`;
        console.log("Attempting to connect to camera at:", cameraUrl);
        
        this.websockets.camera = new WebSocket(cameraUrl);
        this.websockets.camera.binaryType = 'blob';
        
        this.websockets.camera.onopen = () => {
            console.log("Camera WebSocket connected");
            this.updateConnectionStatus(true);
            this.addStatusLog("Camera feed connected", "good");
            
            // Switch to ESP32 camera if connected
            if (this.currentCameraSource === 'esp32' || this.currentCameraSource === 'webcam') {
                this.switchCameraSource('esp32');
            }
        };
        
        this.websockets.camera.onclose = () => {
            console.log("Camera WebSocket disconnected");
            this.updateConnectionStatus(false);
            this.addStatusLog("Camera feed disconnected", "error");
            
            // Fallback to local webcam
            this.switchCameraSource('webcam');
            
            // Attempt to reconnect after 3 seconds
            setTimeout(() => this.initWebSockets(), 3000);
        };
        
        this.websockets.camera.onerror = (error) => {
            console.error("Camera WebSocket error:", error);
            this.addStatusLog("Camera connection error", "error");
        };
        
        this.websockets.camera.onmessage = (event) => {
            if (this.currentCameraSource === 'esp32') {
                const imageUrl = URL.createObjectURL(event.data);
                this.updateAllVideoFeeds(imageUrl);
                
                // Send frame to Python backend for object detection if running (NO AUTO-CAPTURE)
                if (this.objectDetectionRunning) {
                    this.sendFrameForDetection(event.data);
                }
            }
        };
        
        // Command WebSocket
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
    
    // Enhanced method to update all video feeds synchronously
    updateAllVideoFeeds(source) {
        this.allVideoElements.forEach(videoElement => {
            if (videoElement) {
                if (typeof source === 'string') {
                    // URL source (ESP32 camera)
                    videoElement.src = source;
                    videoElement.srcObject = null;
                } else if (source instanceof MediaStream) {
                    // Stream source (local webcam)
                    videoElement.srcObject = source;
                    videoElement.src = '';
                    videoElement.play().catch(e => console.log('Video play error:', e));
                }
            }
        });
    }
    
    // Enhanced camera source switching with full synchronization
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
                // Clear local stream from all video elements
                this.allVideoElements.forEach(videoElement => {
                    if (videoElement) {
                        videoElement.srcObject = null;
                        videoElement.src = '';
                    }
                });
                this.addStatusLog("Switched to ESP32 camera", "good");
                break;
            case 'external':
                // For future external camera sources
                this.addStatusLog("External camera source selected", "warning");
                break;
            default:
                this.addStatusLog("Unknown camera source", "error");
        }
        
        // Update the camera source dropdown to reflect current selection
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
                
                // Apply stream to all video elements
                this.updateAllVideoFeeds(this.localStream);
                
                this.addStatusLog("Local webcam synchronized across all feeds", "good");
                console.log('Local webcam initialized and synchronized');
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
                // Create object buttons with smaller styling for better fit
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
            
            // Update detection counter
            const detectionCount = document.getElementById('detection-count');
            if (detectionCount) {
                detectionCount.textContent = this.detectedObjects.size;
            }
            
            // Remove highlight after 5 seconds
            setTimeout(() => {
                objButton.style.background = 'rgba(0, 255, 65, 0.1)';
                objButton.style.color = '#00ff41';
                objButton.style.borderColor = '#00ff41';
            }, 5000);
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
                status.textContent = 'CONNECTED';
            } else {
                dot.classList.remove('connected');
                status.textContent = 'DISCONNECTED';
            }
        }
    }
    
    addStatusLog(message, type = "good") {
        const now = new Date();
        const timestamp = now.toTimeString().split(' ')[0];
        const statusLog = document.getElementById('statusLog');
        
        if (statusLog) {
            const logEntry = document.createElement('div');
            logEntry.innerHTML = `<span class="timestamp">${timestamp}</span><span class="status-${type}">${message.toUpperCase()}</span>`;
            statusLog.appendChild(logEntry);
            statusLog.scrollTop = statusLog.scrollHeight;
            
            // Limit log entries to prevent memory issues
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
        }, 10000); // Every 10 seconds
    }
    
    async sendFrameForDetection(frameBlob) {
        try {
            const formData = new FormData();
            formData.append('frame', frameBlob);
            
            const response = await fetch('http://localhost:5000/detect', {
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
            // Don't spam logs with detection errors
            if (Date.now() % 10000 < 1000) { // Log once every 10 seconds
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
            
            // Update depth display
            if (depthDisplay) {
                const detectionText = `DETECTED: ${primaryObject.class.toUpperCase()} (${(primaryObject.confidence * 100).toFixed(1)}%)`;
                depthDisplay.innerHTML = detectionText;
                depthDisplay.style.color = '#ffaa00';
            }
            
            // Update camera icon
            if (cameraIcon) {
                cameraIcon.style.color = 'red';
            }
            
            // Update mission control target
            if (currentTarget) {
                currentTarget.textContent = `${primaryObject.class.toUpperCase()} DETECTED`;
            }
            
            // Highlight detected object in panel
            this.highlightDetectedObject(primaryObject.class);
            
            // Log detection
            this.addStatusLog(`Detected: ${primaryObject.class} (${(primaryObject.confidence * 100).toFixed(1)}%)`, "warning");
            
            // NO AUTO-CAPTURE - Only manual capture allowed
            // Mission objects are only logged, not auto-captured
            const missionObjects = ['hammer', 'tennis_ball', 'traffic_cone', 'balloon'];
            if (missionObjects.some(obj => primaryObject.class.toLowerCase().includes(obj))) {
                this.addStatusLog(`MISSION OBJECT FOUND: ${primaryObject.class} - MANUAL CAPTURE REQUIRED`, "warning");
                // Flash camera icon to indicate mission object detected
                if (cameraIcon) {
                    cameraIcon.style.animation = 'flash 1s infinite';
                    setTimeout(() => {
                        cameraIcon.style.animation = 'none';
                    }, 3000);
                }
            }
            
            // Process navigation guidance for autonomous mode
            if (result.navigation && this.missionState.autonomous) {
                this.processNavigationGuidance(result.navigation);
            }
            
        } else {
            // No objects detected
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
        
        // Auto-execute navigation commands
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
                // Continue current movement pattern
                break;
        }
    }
    
    // Enhanced screenshot method using the current active video feed - MANUAL ONLY
    async takeScreenshot(objectDetected = "Manual", depth = 1.5) {
        // Use the first available video element with active feed
        let activeVideo = null;
        
        for (const video of this.allVideoElements) {
            if (video && (video.srcObject || video.src) && video.readyState >= video.HAVE_CURRENT_DATA) {
                activeVideo = video;
                break;
            }
        }
        
        if (!activeVideo) {
            this.addStatusLog("No active video feed available for screenshot", "error");
            return;
        }
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = activeVideo.videoWidth || 640;
        canvas.height = activeVideo.videoHeight || 480;
        
        try {
            context.drawImage(activeVideo, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(async (blob) => {
                if (blob) {
                    console.log("Manual screenshot taken for:", objectDetected);
                    this.addStatusLog(`Manual screenshot captured: ${objectDetected} (${this.currentCameraSource.toUpperCase()})`, "good");
                    
                    try {
                        const timestamp = Date.now();
                        const storageRef = window.firebaseRefs.ref(window.firebaseStorage, `EXPLORATION_SAMPLES/screenshot_${timestamp}.png`);
         
                        await window.firebaseRefs.uploadBytes(storageRef, blob);
                        const downloadURL = await window.firebaseRefs.getDownloadURL(storageRef);
                        await this.updateDatabaseWithImage(downloadURL, depth, objectDetected);
                        
                    } catch (error) {
                        console.error('Error saving screenshot:', error);
                        this.addStatusLog("Screenshot save failed", "error");
                    }
                }
            }, 'image/png');
        } catch (error) {
            console.error('Error capturing screenshot:', error);
            this.addStatusLog("Screenshot capture failed", "error");
        }
    }
    
    async updateDatabaseWithImage(imageUrl, depth, objectDetected) {
        try {
            const userCredential = await window.firebaseRefs.signInWithEmailAndPassword(window.firebaseAuth, 'lanre.mohammed23@gmail.com', 'Wilmar.jr7');
            
            const videoImageRef = window.firebaseRefs.dbRef(window.firebaseDatabase, 'Samples/');
            const timestamp = Date.now();
            
            await window.firebaseRefs.update(window.firebaseRefs.child(videoImageRef, timestamp.toString()), {
                object: objectDetected,
                image_name: `manual_capture_${objectDetected}_${timestamp}`,
                image: `EXPLORATION_SAMPLES/screenshot_${timestamp}.png`,
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
        
        // Send frames every 2 seconds to avoid overloading
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
        
        // Clear all highlighted objects
        const detectedButtons = document.querySelectorAll('.detection-object-btn');
        detectedButtons.forEach(btn => {
            btn.style.background = 'rgba(0, 255, 65, 0.1)';
            btn.style.color = '#00ff41';
            btn.style.borderColor = '#00ff41';
        });
        
        // Reset detection counter
        const detectionCount = document.getElementById('detection-count');
        if (detectionCount) {
            detectionCount.textContent = '0';
        }
        this.detectedObjects.clear();
    }
    
    // Enhanced frame capture using current active video source
    async captureAndAnalyzeFrame() {
        // Find the active video element
        let activeVideo = null;
        
        for (const video of this.allVideoElements) {
            if (video && (video.srcObject || video.src) && video.readyState >= video.HAVE_CURRENT_DATA) {
                activeVideo = video;
                break;
            }
        }
        
        if (!activeVideo) {
            console.warn('No active video feed for frame analysis');
            return;
        }
        
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = activeVideo.videoWidth || 640;
            canvas.height = activeVideo.videoHeight || 480;
            
            ctx.drawImage(activeVideo, 0, 0, canvas.width, canvas.height);
            
            canvas.toBlob(async (blob) => {
                if (blob) {
                    await this.sendFrameForDetection(blob);
                }
            }, 'image/jpeg', 0.8);
            
        } catch (error) {
            console.error('Error capturing frame for analysis:', error);
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
        
        // Close modal with outside click
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                    this.stopObjectDetection();
                    this.addStatusLog("Mission control interface closed", "warning");
                }
            });
        }
        
        // Mission control buttons with enhanced functionality and smaller styling
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
                // Make autonomous control buttons smaller
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
        
        // Movement controls with enhanced touch support
        const movementButtons = {
            'moveForward': 'forward',
            'moveBackward': 'backward',
            'moveLeft': 'left',
            'moveRight': 'right',
            'moveStop': 'stop'
        };
        
        Object.entries(movementButtons).forEach(([id, direction]) => {
            const btn = document.getElementById(id);
            if (btn) {
                // Mouse events
                btn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    this.sendCommand('move', direction);
                });
                btn.addEventListener('mouseup', (e) => {
                    e.preventDefault();
                    if (direction !== 'stop') this.sendCommand('move', 'stop');
                });
                
                // Touch events for mobile
                btn.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    this.sendCommand('move', direction);
                });
                btn.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    if (direction !== 'stop') this.sendCommand('move', 'stop');
                });
                
                // Prevent context menu on long press
                btn.addEventListener('contextmenu', (e) => e.preventDefault());
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
            
            // Limit log entries
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
            // Using a simple storage mechanism
            window.missionBackup = backupData;
        } catch (error) {
            console.warn('Could not save mission logs backup:', error);
        }
    }
    
    loadMissionLogsBackup() {
        try {
            if (window.missionBackup) {
                const data = window.missionBackup;
                // Load logs if they're from today
                if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
                    this.missionLogs = data.logs || [];
                    this.missionState = { ...this.missionState, ...data.missionState };
                    
                    // Restore log entries to UI
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
    
    // Health check for backend services
    async checkBackendHealth() {
        try {
            const response = await fetch('http://localhost:5000/health', {
                method: 'GET'
            });
            
            if (response.ok) {
                const health = await response.json();
                this.addStatusLog("Object detection backend online", "good");
                return true;
            } else {
                this.addStatusLog("Backend health check failed", "warning");
                return false;
            }
        } catch (error) {
            this.addStatusLog("Backend not available - using fallback mode", "warning");
            return false;
        }
    }
    
    // Enhanced method to get current active camera info
    getCurrentCameraInfo() {
        return {
            source: this.currentCameraSource,
            connected: this.connectionStatus,
            activeElements: this.allVideoElements.filter(v => v && (v.srcObject || v.src)).length,
            totalElements: this.allVideoElements.length,
            detectionRunning: this.objectDetectionRunning
        };
    }
    
    // Method to manually sync camera feeds (for debugging)
    forceCameraSync() {
        console.log('Forcing camera synchronization...');
        this.addStatusLog("Forcing camera synchronization", "warning");
        
        if (this.currentCameraSource === 'webcam' && this.localStream) {
            this.updateAllVideoFeeds(this.localStream);
        } else if (this.currentCameraSource === 'esp32' && this.connectionStatus) {
            // ESP32 feeds are handled by WebSocket messages
            this.addStatusLog("ESP32 feed sync requested", "good");
        }
        
        const info = this.getCurrentCameraInfo();
        console.log('Camera sync info:', info);
    }
}

// Export RoverController for global use
window.RoverController = RoverController;
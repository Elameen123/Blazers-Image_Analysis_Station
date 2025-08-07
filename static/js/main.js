// Enhanced Main Application Logic - Consolidated Image Analysis and UI Management

// Global variables
let roverController;
const analysisSection = document.getElementById('analysis-section');
if (analysisSection) {
    analysisSection.style.display = 'none';
}

// Model Configuration
const TEACHABLE_MACHINE_MODELS = {
    rock: "https://teachablemachine.withgoogle.com/models/NzfitzWEF/",
    object: "https://teachablemachine.withgoogle.com/models/X3sa_-yoQ/" // Replace with actual object model URL
};

let model = null;
let maxPredictions = 0;
let selectedModel = null;
let modelLoaded = false;
let currentCameraSource = "webcam";

// Initialize the application
document.addEventListener('DOMContentLoaded', function () {
    // Initialize Firebase components first
    const gallery = document.getElementById('rock-gallery');
    const displayImage = document.getElementById('display-image');
    const displayName = document.getElementById('display-name');

    // Firebase rock data loading
    async function loadRockData() {
        const email = "lanre.mohammed23@gmail.com";
        const password = "Wilmar.jr7";

        try {
            const userCredential = await window.firebaseRefs.signInWithEmailAndPassword(window.firebaseAuth, email, password);
            console.log("User signed in successfully");

            const rockDataRef = window.firebaseRefs.dbRef(window.firebaseDatabase, 'Samples');
            
            window.firebaseRefs.onValue(window.firebaseRefs.child(rockDataRef, '/'), (snapshot) => {
                if (snapshot.exists()) {
                    const rockData = snapshot.val();
                    const processedData = {};
                    
                    snapshot.forEach((childSnapshot) => {
                        const key = childSnapshot.key;
                        const data = childSnapshot.val();
                        processedData[key] = data;
                    });

                    console.log(processedData);
                    displayRockGallery(processedData);
                } else {
                    console.error("No data available");
                }
            }, (error) => {
                console.error("Error fetching data in real-time:", error);
            });
        } catch (error) {
            console.error("Error during authentication or fetching rock data:", error);
        }
    }

    function displayRockGallery(rockData) {
        const gallery = document.getElementById('rock-gallery');

        Object.values(rockData).forEach(imgData => {
            const card = document.createElement('div');
            card.className = 'image-card';

            const img = document.createElement('img');
            img.setAttribute('loading', 'lazy');

            const placeholder = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjY2NjIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5Mb2FkaW5nLi4uPC90ZXh0Pjwvc3ZnPg==';
            img.src = placeholder;

            // Fetch actual image
            const imgRef = window.firebaseRefs.ref(window.firebaseStorage, imgData.image);
            window.firebaseRefs.getDownloadURL(imgRef).then((url) => {
                img.src = url;
            }).catch((error) => {
                console.error("Error fetching image:", error);
            });

            const name = document.createElement('div');
            name.className = 'image-name';
            name.innerText = imgData.image_name;

            card.addEventListener('click', () => {
                analysisSection.style.display = 'none';
                clearDetectionResults();
                displayImage.src = img.src;
                displayName.innerText = imgData.image_name;
                storeImageInSession(displayImage.src);
                resetModelSelection();
            });

            card.appendChild(img);
            card.appendChild(name);
            gallery.appendChild(card);
        });
    }

    // Initialize rover controller AFTER DOM is loaded
    roverController = new window.RoverController();
    
    // Mode switching functionality
    const toggleMode = document.getElementById('toggleMode');
    const toggleText = document.getElementById('toggleText');
    const imageBox = document.querySelector('.selectedImage_box');
    const stream = document.getElementById('stream');
    const imageDisplay = document.getElementById('display-image');
    const depthDisplay = document.getElementById('depth-display');
    const cameraIcon = document.getElementById('camera-icon');
    const expandIcon = document.getElementById('expand-icon');
    const cameraSourceDropdown = document.getElementById('camera-source-dropdown');

    function switchToExplorationMode() {
        toggleText.innerText = "Exploration Mode";
        depthDisplay.style.display = "flex";
        cameraIcon.style.display = "flex";
        stream.style.display = "flex";
        imageBox.style.display = "none";
        imageDisplay.style.display = "none";
        if (expandIcon) expandIcon.style.display = "block";
        if (cameraSourceDropdown) cameraSourceDropdown.style.display = "block";
        
        // Start object detection when switching to exploration mode (manual capture only)
        if (roverController) {
            setTimeout(() => roverController.startObjectDetection(), 1000);
        }
    }

    function switchToAnalysisMode() {
        toggleText.innerText = "Analysis Mode";
        depthDisplay.style.display = "none";
        cameraIcon.style.display = "none";
        stream.style.display = "none";
        imageBox.style.display = "flex";
        imageDisplay.style.display = "flex";
        if (expandIcon) expandIcon.style.display = "none";
        if (cameraSourceDropdown) cameraSourceDropdown.style.display = "none";
        
        // Stop object detection when switching to analysis mode
        if (roverController) {
            roverController.stopObjectDetection();
        }
    }

    if (toggleMode) {
        toggleMode.addEventListener('change', function() {
            if (toggleMode.checked) {
                switchToExplorationMode();
            } else {
                switchToAnalysisMode();
            }
        });
    }

    // Initialize in Analysis Mode
    switchToAnalysisMode();
    
    // Enhanced camera icon functionality - manual capture only
    if (cameraIcon) {
        cameraIcon.addEventListener('click', () => {
            if (roverController) {
                roverController.takeScreenshot("Manual Capture");
            }
        });
    }

    // Enhanced camera source selection functionality
    const cameraSourceSelect = document.getElementById('camera-source-select');
    if (cameraSourceSelect) {
        cameraSourceSelect.addEventListener('change', function() {
            currentCameraSource = this.value;
            console.log('Camera source changed to:', currentCameraSource);
            
            if (roverController) {
                roverController.switchCameraSource(currentCameraSource);
            }
        });
    }

    // Upload functionality
    const uploadIcon = document.getElementById('upload-icon');
    const imageUploadInput = document.getElementById('image-upload-input');
    
    if (uploadIcon && imageUploadInput) {
        uploadIcon.addEventListener('click', () => {
            imageUploadInput.click();
        });

        imageUploadInput.addEventListener('change', handleImageUpload);
    }
    
    // Initialize webcam with fallback
    initializeWebcam();
    
    // Load rock data
    loadRockData();
});

// Clear detection results display
function clearDetectionResults() {
    const detectionResults = document.getElementById('detection-results');
    if (detectionResults) {
        detectionResults.style.display = 'none';
        detectionResults.innerHTML = '';
    }
}

// Reset model selection state
function resetModelSelection() {
    selectedModel = null;
    modelLoaded = false;
    model = null;
    updateModelStatus("No Model Selected");
    updateAnalyzeButtonState();
}

// Handle image upload with enhanced model workflow
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const displayImage = document.getElementById('display-image');
            const displayName = document.getElementById('display-name');
            
            displayImage.src = e.target.result;
            displayName.innerText = file.name;
            
            // Clear any previous results
            clearDetectionResults();
            const analysisSection = document.getElementById('analysis-section');
            if (analysisSection) {
                analysisSection.style.display = 'none';
            }
            
            // Reset model selection for new upload
            resetModelSelection();
            
            // Show model selection modal
            showModelSelectionModal(file.name);
            
            // Store uploaded image data
            storeImageInSession(e.target.result);
        };
        reader.readAsDataURL(file);
    } else {
        alert('Please select a valid image file.');
    }
}

// Show model selection modal
function showModelSelectionModal(fileName) {
    const modal = document.getElementById('model-selection-modal');
    const fileNameSpan = document.getElementById('selected-file-name');
    
    if (modal && fileNameSpan) {
        fileNameSpan.textContent = fileName;
        modal.style.display = 'block';
    }
}

// Enhanced model selection with proper loading validation
function selectModel(modelType) {
    selectedModel = modelType;
    modelLoaded = false;
    
    const modal = document.getElementById('model-selection-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    updateModelStatus(`Loading ${modelType.toUpperCase()} Model...`);
    updateAnalyzeButtonState();
    
    console.log('Model selected:', modelType);
    
    // Load the appropriate model based on selection
    if (modelType === 'general') {
        initializeGeneralVisionModel();
    } else {
        loadTeachableMachineModel(modelType);
    }
}

// Initialize General Vision model (Python backend with YOLOv8)
async function initializeGeneralVisionModel() {
    try {
        updateModelStatus("Connecting to GENERAL VISION backend...");
        
        const response = await fetch('http://localhost:5000/health', {
            method: 'GET',
            timeout: 5000
        });
        
        if (response.ok) {
            const health = await response.json();
            modelLoaded = true;
            updateModelStatus("GENERAL VISION Model Ready");
            updateAnalyzeButtonState();
            console.log('General Vision model (YOLOv8) initialized via Python backend');
        } else {
            throw new Error('Backend health check failed');
        }
    } catch (error) {
        console.error('Error initializing General Vision model:', error);
        modelLoaded = false;
        updateModelStatus("General Vision backend unavailable - Retrying...");
        updateAnalyzeButtonState();
        
        // Retry mechanism
        setTimeout(() => {
            if (selectedModel === 'general' && !modelLoaded) {
                initializeGeneralVisionModel();
            }
        }, 3000);
    }
}

// Load Teachable Machine models for rock and object detection
async function loadTeachableMachineModel(modelType) {
    try {
        let modelURL;
        
        if (TEACHABLE_MACHINE_MODELS[modelType]) {
            modelURL = TEACHABLE_MACHINE_MODELS[modelType];
        } else {
            throw new Error(`Unknown model type: ${modelType}`);
        }
        
        updateModelStatus(`Loading ${modelType.toUpperCase()} model...`);
        
        const modelJSONURL = modelURL + "model.json";
        const metadataURL = modelURL + "metadata.json";
        
        model = await tmImage.load(modelJSONURL, metadataURL);
        maxPredictions = model.getTotalClasses();
        
        modelLoaded = true;
        updateModelStatus(`${modelType.toUpperCase()} Model Ready`);
        updateAnalyzeButtonState();
        
        console.log(`${modelType.toUpperCase()} model loaded successfully`);
        
    } catch (error) {
        console.error(`Error loading ${modelType} model:`, error);
        modelLoaded = false;
        updateModelStatus(`Error loading ${modelType} model - Retrying...`);
        updateAnalyzeButtonState();
        
        // Retry mechanism
        setTimeout(() => {
            if (selectedModel === modelType && !modelLoaded) {
                loadTeachableMachineModel(modelType);
            }
        }, 3000);
    }
}

// Update model status display
function updateModelStatus(statusText) {
    const modelStatus = document.getElementById('model-status');
    if (modelStatus) {
        modelStatus.textContent = statusText;
        
        if (statusText.includes('Ready')) {
            modelStatus.style.color = 'lightblue';
        } else if (statusText.includes('Loading') || statusText.includes('Connecting')) {
            modelStatus.style.color = 'orange';
        } else if (statusText.includes('Error') || statusText.includes('unavailable')) {
            modelStatus.style.color = 'red';
        } else {
            modelStatus.style.color = '#666';
        }
    }
}

// Update analyze button state based on model loading
function updateAnalyzeButtonState() {
    const analyzeBtn = document.getElementById('analyze-btn');
    if (analyzeBtn) {
        if (selectedModel && modelLoaded) {
            analyzeBtn.disabled = false;
            analyzeBtn.style.opacity = '1';
            analyzeBtn.style.cursor = 'pointer';
            analyzeBtn.textContent = 'Analyze';
        } else {
            analyzeBtn.disabled = true;
            analyzeBtn.style.opacity = '0.5';
            analyzeBtn.style.cursor = 'not-allowed';
            if (selectedModel && !modelLoaded) {
                analyzeBtn.textContent = 'Loading Model...';
            } else {
                analyzeBtn.textContent = 'Select Model First';
            }
        }
    }
}

// Close model selection modal
function closeModelSelectionModal() {
    const modal = document.getElementById('model-selection-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Webcam initialization
function initializeWebcam() {
    const video = document.getElementById('webcam');
    
    setTimeout(() => {
        if (currentCameraSource === 'webcam' && (!roverController || !roverController.connectionStatus)) {
            initializeLocalWebcam();
        }
    }, 3000);
}

async function initializeLocalWebcam() {
    try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            
            const webcam = document.getElementById('webcam');
            const roverVideoFeed = document.getElementById('roverVideoFeed');
            
            if (webcam) {
                webcam.srcObject = stream;
                webcam.play();
            }
            if (roverVideoFeed) {
                roverVideoFeed.srcObject = stream;
                roverVideoFeed.play();
            }
            
            console.log('Local webcam initialized');
        }
    } catch (error) {
        console.error('Error accessing local webcam:', error);
    }
}

// Enhanced analyze image function with model-specific workflows
async function analyzeImage() {
    if (!selectedModel || !modelLoaded) {
        alert("Please select and wait for a model to load first.");
        return;
    }

    const displayImage = document.getElementById('display-image');
    const displayName = document.getElementById('display-name');
    
    // Store image data for session
    try {
        const imageData = {
            src: displayImage.src,
            name: displayName.innerText,
            timestamp: Date.now(),
            model: selectedModel
        };
        window.currentImageData = imageData;
    } catch (error) {
        console.error("Error storing image data:", error);
    }

    // Route to appropriate analysis method based on selected model
    if (selectedModel === 'general') {
        await performGeneralVisionAnalysis(displayImage);
    } else {
        await performTeachableMachineAnalysis(displayImage);
    }
}

// General Vision analysis using Python backend (YOLOv8)
async function performGeneralVisionAnalysis(imageElement) {
    try {
        // Convert image to blob for sending to Python backend
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = imageElement.naturalWidth || 640;
        canvas.height = imageElement.naturalHeight || 480;
        
        ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob(async (blob) => {
            const formData = new FormData();
            formData.append('frame', blob);
            
            try {
                const response = await fetch('http://localhost:5000/detect', {
                    method: 'POST',
                    body: formData
                });
                
                if (response.ok) {
                    const result = await response.json();
                    displayGeneralVisionResults(result);
                } else {
                    throw new Error('Detection failed');
                }
            } catch (error) {
                console.error('General Vision detection error:', error);
                displayGeneralVisionError();
            }
        }, 'image/jpeg', 0.8);
        
    } catch (error) {
        console.error('Error in General Vision analysis:', error);
        displayGeneralVisionError();
    }
}

// Display General Vision results
function displayGeneralVisionResults(result) {
    const displayName = document.getElementById('display-name');
    const fileName = displayName.innerText;
    
    // Create or update detection results container
    let detectionResults = document.getElementById('detection-results');
    if (!detectionResults) {
        detectionResults = document.createElement('div');
        detectionResults.id = 'detection-results';
        detectionResults.style.cssText = `
            background: rgba(0, 0, 0, 0.8);
            border: 1px solid #00ff41;
            border-radius: 5px;
            padding: 15px;
            margin-top: 10px;
            color: #00ff41;
            font-family: monospace;
        `;
        displayName.parentNode.appendChild(detectionResults);
    }
    
    let resultsHTML = `<h4 style="color: #ffaa00; margin-top: 0;">GENERAL VISION ANALYSIS</h4>`;
    resultsHTML += `<p><strong>File:</strong> ${fileName}</p>`;
    resultsHTML += `<p><strong>Model:</strong> YOLOv8 (GENERAL VISION)</p>`;
    
    if (result.objects && result.objects.length > 0) {
        resultsHTML += `<h5>Detected Objects:</h5>`;
        result.objects.slice(0, 5).forEach((obj, index) => {
            const confidence = (obj.confidence * 100).toFixed(1);
            const confidenceColor = obj.confidence > 0.7 ? '#00ff41' : obj.confidence > 0.5 ? '#ffaa00' : '#ff6b6b';
            resultsHTML += `<p style="color: ${confidenceColor};">${index + 1}. ${obj.class.toUpperCase()} (${confidence}%)</p>`;
        });
        
        // Show primary detection
        const primaryObject = result.objects[0];
        showTemporaryDetection(primaryObject);
        
    } else {
        resultsHTML += `<p style="color: #ff6b6b;">No objects detected with sufficient confidence.</p>`;
    }
    
    resultsHTML += `<p><small>Timestamp: ${new Date().toLocaleTimeString()}</small></p>`;
    
    detectionResults.innerHTML = resultsHTML;
    detectionResults.style.display = 'block';
    
    // Show analysis section
    analysisSection.style.display = 'flex';
    
    // Setup save analysis button for general vision results
    setupSaveAnalysisButton();
}

// Display General Vision error
function displayGeneralVisionError() {
    let detectionResults = document.getElementById('detection-results');
    if (!detectionResults) {
        detectionResults = document.createElement('div');
        detectionResults.id = 'detection-results';
        detectionResults.style.cssText = `
            background: rgba(0, 0, 0, 0.8);
            border: 1px solid #ff6b6b;
            border-radius: 5px;
            padding: 15px;
            margin-top: 10px;
            color: #ff6b6b;
            font-family: monospace;
        `;
        const displayName = document.getElementById('display-name');
        displayName.parentNode.appendChild(detectionResults);
    }
    
    detectionResults.innerHTML = `
        <h4 style="color: #ff6b6b; margin-top: 0;">GENERAL VISION ERROR</h4>
        <p>Unable to connect to General Vision backend.</p>
        <p>Please ensure the Python server is running on localhost:5000</p>
        <p><small>Try using Rock or Object models instead.</small></p>
    `;
    detectionResults.style.display = 'block';
}

// Show temporary detection in depth display
function showTemporaryDetection(detection) {
    const depthDisplay = document.getElementById('depth-display');
    if (depthDisplay) {
        const detectionText = `DETECTED: ${detection.class.toUpperCase()} (${(detection.confidence * 100).toFixed(1)}%)`;
        depthDisplay.innerHTML = detectionText;
        depthDisplay.style.display = 'flex';
        depthDisplay.style.color = detection.confidence > 0.7 ? '#00ff41' : '#ffaa00';
        
        // Hide after 5 seconds
        setTimeout(() => {
            depthDisplay.style.display = 'none';
        }, 5000);
    }
}

// Teachable Machine analysis workflow
async function performTeachableMachineAnalysis(imageElement) {
    if (!model) {
        console.warn("Teachable Machine model not loaded");
        return;
    }
    
    const predictions = await predictImage(imageElement);

    if (predictions && predictions.length > 0) {
        const highestPrediction = predictions.reduce((prev, current) => 
            (prev.probability > current.probability) ? prev : current);
        const imageName = highestPrediction.className.toLowerCase();
        
        // Update detection display
        updateDetectionDisplay(highestPrediction);
        
        // For rock analysis, show geological data
        if (selectedModel === 'rock') {
            displayAnalysisData(imageName);
        } else {
            // For object detection, show basic results
            displayObjectDetectionBasicResults(predictions);
        }
        
        analysisSection.style.display = 'flex';
    } else {
        console.warn("No predictions available");
        updateDetectionDisplay({ className: "Unknown", probability: 0 });
        analysisSection.style.display = 'flex';
    }
}

async function predictImage(image) {
    if (!model) {
        console.warn("Model not loaded yet");
        return [];
    }
    
    const imgElement = document.createElement('img');
    imgElement.crossOrigin = 'anonymous';
    imgElement.src = image.src;

    await new Promise(resolve => imgElement.onload = resolve);

    const prediction = await model.predict(imgElement);
    return prediction;
}

// Update detection display for teachable machine results
function updateDetectionDisplay(prediction) {
    const depthDisplay = document.getElementById('depth-display');
    
    if (depthDisplay && !document.getElementById('toggleMode').checked) {
        const detectionText = `DETECTED: ${prediction.className.toUpperCase()} (${(prediction.probability * 100).toFixed(1)}%)`;
        depthDisplay.innerHTML = detectionText;
        depthDisplay.style.display = 'flex';
        depthDisplay.style.color = prediction.probability > 0.5 ? '#00ff41' : '#ffaa00';
        
        // Hide after 5 seconds
        setTimeout(() => {
            if (!document.getElementById('toggleMode').checked) {
                depthDisplay.style.display = 'none';
            }
        }, 5000);
    }
}

// Display basic object detection results for teachable machine object model
function displayObjectDetectionBasicResults(predictions) {
    const propertiesContainer = document.getElementById('properties-container');
    const lifeSupportContainer = document.getElementById('life-support-container');
    
    if (propertiesContainer) {
        const topPredictions = predictions
            .sort((a, b) => b.probability - a.probability)
            .slice(0, 3);
            
        let resultsHTML = `<h4>OBJECT DETECTION RESULTS</h4>`;
        topPredictions.forEach((pred, index) => {
            const confidence = (pred.probability * 100).toFixed(1);
            resultsHTML += `<p><strong>${index + 1}. ${pred.className.toUpperCase()}:</strong> ${confidence}%</p>`;
        });
        resultsHTML += `<p><strong>Model Used:</strong> ${selectedModel.toUpperCase()}</p>`;
        
        propertiesContainer.innerHTML = resultsHTML;
    }
    
    if (lifeSupportContainer) {
        lifeSupportContainer.innerHTML = `
            <h4>Analysis Summary</h4>
            <p><strong>Detection Method:</strong> Teachable Machine Object Recognition</p>
            <p><strong>Status:</strong> Object classification complete</p>
            <p><strong>Confidence:</strong> ${(predictions[0].probability * 100).toFixed(1)}%</p>
        `;
    }
}

// Store image data in session
function storeImageInSession(imageData) {
    try {
        window.selectedImageData = {
            src: imageData,
            timestamp: Date.now()
        };
    } catch (error) {
        console.error("Error storing image in session:", error);
    }
}

// Analysis button functionality
document.addEventListener('DOMContentLoaded', function() {
    const analyzeBtn = document.getElementById('analyze-btn');
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', function () {
            if (!selectedModel || !modelLoaded) {
                alert("Please select a model and wait for it to load properly.");
                return;
            }

            const status = document.getElementById('status');
            const progressBar = document.getElementById('progress-bar');
            const resultMessage = document.getElementById('result-message');

            status.style.display = 'flex';
            resultMessage.style.display = 'none';
            progressBar.style.width = '0%';

            let progress = 0;
            const interval = setInterval(async () => {
                progress += 10;
                progressBar.style.width = progress + '%';

                if (progress >= 100) {
                    clearInterval(interval);
                    status.style.display = 'none';
                    resultMessage.style.display = 'block';

                    await analyzeImage();
                    analysisSection.style.display = 'flex';

                    // Set up save analysis button
                    setupSaveAnalysisButton();
                }
            }, 1000);
        });
    }
});

// Enhanced save analysis button setup
function setupSaveAnalysisButton() {
    const saveAnalysisBtn = document.getElementById('save-analysis-btn');
    if (saveAnalysisBtn) {
        // Remove existing event listeners
        const newBtn = saveAnalysisBtn.cloneNode(true);
        saveAnalysisBtn.parentNode.replaceChild(newBtn, saveAnalysisBtn);
        
        newBtn.addEventListener('click', async () => {
            const imageNameInput = document.getElementById('image-name-input').value;
            const commentInput = document.getElementById('comment-input').value;
            const analystName = document.getElementById('analyst-name').value;

            if (imageNameInput && commentInput && analystName) {
                const updateData = {
                    analyst_name: analystName,
                    analyst_comment: commentInput,
                    image_name: imageNameInput,
                    model_used: selectedModel,
                    analysis_timestamp: Date.now()
                };

                try {
                    const rockDataRef = window.firebaseRefs.dbRef(window.firebaseDatabase, 'Samples');
                    const displayName = document.getElementById('display-name').innerText.toLowerCase();

                    const snapshot = await window.firebaseRefs.get(window.firebaseRefs.child(rockDataRef, '/'));
                    if (snapshot.exists()) {
                        const rockData = snapshot.val();
                        console.log(rockData);

                        for (const key in rockData) {
                            if (rockData.hasOwnProperty(key)) {
                                const sample = rockData[key];
                                if (sample.image_name && sample.image_name.toLowerCase() === displayName) {
                                    await window.firebaseRefs.update(window.firebaseRefs.child(rockDataRef, key), updateData);
                                    alert("Analysis saved successfully!");
                                    generatePDFReport();
                                    analysisSection.style.display = 'none';
                                    break;
                                }
                            }
                        }
                    } else {
                        console.error("No data available to update with analyst input");
                    }
                } catch (error) {
                    console.error("Error saving analysis:", error);
                    alert("Error saving analysis. Please try again.");
                }
            } else {
                alert("Please fill out all fields in the Analyst section.");
            }
        });
    }
}

// Display analysis data for rock samples
function displayAnalysisData(imageName) {
  console.log("Searching for data with image name:", imageName.toLowerCase());
  const datasetRef = window.firebaseRefs.dbRef(window.firebaseDatabase, 'Dataset');
  
  window.firebaseRefs.get(datasetRef).then(snapshot => {
      if (snapshot.exists()) {
          const dataset = snapshot.val();
          let sample = null;

          for (const key in dataset) {
              if (dataset.hasOwnProperty(key)) {
                  const subdata = dataset[key];
                  if (subdata.type && subdata.type.toLowerCase() === imageName.toLowerCase()) {
                      sample = subdata;
                      break;
                  }
              }
          }

          if (sample) {
              console.log("Sample found:", sample);

              const propertiesContainer = document.getElementById('properties-container');
              if (propertiesContainer) {
                  propertiesContainer.innerHTML = `
                      <h4>ROCK CHARACTERISTICS</h4>
                      <p><strong>Type:</strong> ${sample.type}  |  <strong>Formation Process:</strong> ${sample.formation_process}</p>
                      <p><strong>Description:</strong> ${sample.description}</p>
                      <p><strong>Texture:</strong> ${sample.texture}  |  <strong>Structure:</strong> ${sample.structure}</p>
                      <p><strong>Mineral Composition:</strong> ${sample.mineral_composition ? sample.mineral_composition.join(", ") : "N/A"}</p>
                  `;
              }

              const lifeSupportContainer = document.getElementById('life-support-container');
              if (lifeSupportContainer) {
                  const lifeSupportYesNo = sample.life_support_potential && sample.life_support_potential.percentage >= 50 ? 
                      `<span style="color: lightgreen;">Yes</span>` : `<span style="color: red;">No</span>`;
                  lifeSupportContainer.innerHTML = `
                      <h4>Habitability Assessment</h4>
                      <p><strong>Signs of Water:</strong> ${sample.signs_of_water ? 'Yes' : 'No'}</p>
                      <p><strong>Potential to support life:</strong> ${lifeSupportYesNo}, with a ${sample.life_support_potential ? sample.life_support_potential.percentage : 0}% probability</p>
                      <p><strong>Reason:</strong> ${sample.life_support_potential ? sample.life_support_potential.description : "No data available"}</p>
                  `;
              }
          } else {
              console.log("No matching sample found for the selected image.");
              
              // Show default analysis for unknown samples
              const propertiesContainer = document.getElementById('properties-container');
              if (propertiesContainer) {
                  propertiesContainer.innerHTML = `
                      <h4>ROCK CHARACTERISTICS</h4>
                      <p><strong>Type:</strong> Unknown Sample</p>
                      <p><strong>Description:</strong> Analysis in progress. Manual identification required.</p>
                      <p><strong>Status:</strong> Awaiting detailed geological assessment.</p>
                      <p><strong>Model Used:</strong> ${selectedModel.toUpperCase()}</p>
                  `;
              }

              const lifeSupportContainer = document.getElementById('life-support-container');
              if (lifeSupportContainer) {
                  lifeSupportContainer.innerHTML = `
                      <h4>Habitability Assessment</h4>
                      <p><strong>Status:</strong> Preliminary scan required for habitability assessment.</p>
                      <p><strong>Recommendation:</strong> Collect additional samples for detailed analysis.</p>
                  `;
              }
          }
      } else {
          console.log("No data found in the dataset.");
          alert("No data found in the dataset.");
      }
  }).catch(error => {
      console.error("Error fetching dataset data:", error);
  });
}

// PDF Report Generation
function generatePDFReport() {
  const analysisImageSrc = document.getElementById('display-image').src;
  const rockCharacteristics = document.getElementById('properties-container').innerText;
  const habitabilityAssessment = document.getElementById('life-support-container').innerText;
  const analystComment = document.getElementById('comment-input').value;
  const analystName = document.getElementById('analyst-name').value;
  const imageNameInput = document.getElementById('image-name-input').value;
  const logoImageSrc = './Blazers-Logo.png';

  const reportContainer = document.createElement('div');
  reportContainer.className = 'report-container';
  reportContainer.style.cssText = `
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background: white;
      color: black;
  `;

  const letterhead = document.createElement('div');
  letterhead.className = 'letterhead';
  letterhead.style.cssText = `
      display: flex;
      align-items: center;
      margin-bottom: 30px;
      border-bottom: 2px solid #333;
      padding-bottom: 20px;
  `;

  const logoSection = document.createElement('div');
  logoSection.className = 'logo-section';
  const logoImg = document.createElement('img');
  logoImg.src = logoImageSrc;
  logoImg.style.cssText = 'width: 80px; height: 80px; margin-right: 20px;';
  logoSection.appendChild(logoImg);

  const textSection = document.createElement('div');
  textSection.className = 'text-section';
  const title = document.createElement('h1');
  title.innerText = 'Mars Rover Image Analysis Report';
  title.style.cssText = 'margin: 0; font-size: 24px;';
  textSection.appendChild(title);

  letterhead.appendChild(logoSection);
  letterhead.appendChild(textSection);

  // Sample Details section
  const reportSection1 = document.createElement('div');
  reportSection1.className = 'report-section';
  reportSection1.style.cssText = 'margin-bottom: 30px;';
  
  const sampleDetailsTitle = document.createElement('h2');
  sampleDetailsTitle.innerText = 'Sample Details';
  sampleDetailsTitle.style.cssText = 'color: #333; border-bottom: 1px solid #ccc; padding-bottom: 5px;';
  
  const togetherDiv = document.createElement('div');
  togetherDiv.className = 'together';
  togetherDiv.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 20px;';
  
  const sampleName = document.createElement('p');
  sampleName.innerHTML = `<b>Sample Name: </b> ${imageNameInput}`;
  
  const dateCaptured = document.createElement('p');
  dateCaptured.innerHTML = `<b>Date Captured: </b><span>${new Date().toLocaleDateString()}</span>`;
  
  const modelUsed = document.createElement('p');
  modelUsed.innerHTML = `<b>Model Used: </b><span>${selectedModel.toUpperCase()}</span>`;
  
  togetherDiv.appendChild(sampleName);
  togetherDiv.appendChild(dateCaptured);

  const sampleImage = document.createElement('img');
  sampleImage.id = imageNameInput;
  sampleImage.style.cssText = 'max-width: 100%; height: auto; margin: 20px 0;';
  
  const sampleCaption = document.createElement('i');
  sampleCaption.innerText = `Fig.1 ${imageNameInput}_Sample`;
  sampleCaption.style.cssText = 'display: block; text-align: center; margin-bottom: 20px;';

  reportSection1.appendChild(sampleDetailsTitle);
  reportSection1.appendChild(togetherDiv);
  reportSection1.appendChild(modelUsed);
  reportSection1.appendChild(sampleImage);
  reportSection1.appendChild(sampleCaption);

  // Analysis Results section
  const reportSection2 = document.createElement('div');
  reportSection2.className = 'report-section';
  reportSection2.style.cssText = 'margin-bottom: 30px;';
  
  const analysisResultsTitle = document.createElement('h2');
  analysisResultsTitle.innerText = 'Analysis Results';
  analysisResultsTitle.style.cssText = 'color: #333; border-bottom: 1px solid #ccc; padding-bottom: 5px;';
  
  const rockCharacteristicsP = document.createElement('p');
  rockCharacteristicsP.innerText = rockCharacteristics;
  rockCharacteristicsP.style.cssText = 'line-height: 1.6; margin-bottom: 15px;';
  
  const habitabilityAssessmentP = document.createElement('p');
  habitabilityAssessmentP.innerText = habitabilityAssessment;
  habitabilityAssessmentP.style.cssText = 'line-height: 1.6;';

  reportSection2.appendChild(analysisResultsTitle);
  reportSection2.appendChild(rockCharacteristicsP);
  reportSection2.appendChild(habitabilityAssessmentP);

  // Analyst Information section
  const reportSection3 = document.createElement('div');
  reportSection3.className = 'report-section';
  reportSection3.style.cssText = 'margin-bottom: 30px;';
  
  const analystInfoTitle = document.createElement('h2');
  analystInfoTitle.innerText = 'Analyst Information';
  analystInfoTitle.style.cssText = 'color: #333; border-bottom: 1px solid #ccc; padding-bottom: 5px;';
  
  const analystCommentP = document.createElement('p');
  analystCommentP.innerHTML = `<b>Analyst Comment: </b>${analystComment}`;
  analystCommentP.style.cssText = 'line-height: 1.6; margin-bottom: 15px;';
  
  const analystNameP = document.createElement('p');
  analystNameP.innerHTML = `<b>Analyst Name: </b>${analystName}`;
  analystNameP.style.cssText = 'line-height: 1.6;';

  reportSection3.appendChild(analystInfoTitle);
  reportSection3.appendChild(analystCommentP);
  reportSection3.appendChild(analystNameP);

  // Signature line section
  const signatureLine = document.createElement('div');
  signatureLine.className = 'signature-line';
  signatureLine.style.cssText = 'margin-top: 50px;';
  
  const signatureTitle = document.createElement('p');
  signatureTitle.innerText = 'Signature:';
  
  const signatureLineHr = document.createElement('hr');
  signatureLineHr.style.cssText = 'width: 300px; margin-left: 0;';
  
  signatureLine.appendChild(signatureTitle);
  signatureLine.appendChild(signatureLineHr);

  // Footer section
  const footer = document.createElement('footer');
  footer.innerHTML = 'Gale Crater Research Station, Latitude -5.4, Longitude 137.8, Mars. blazersteam@gmail.com';
  footer.style.cssText = 'text-align: center; margin-top: 50px; padding-top: 20px; border-top: 1px solid #ccc; font-size: 12px;';

  // Append all sections
  reportContainer.appendChild(letterhead);
  reportContainer.appendChild(reportSection1);
  reportContainer.appendChild(reportSection2);
  reportContainer.appendChild(reportSection3);
  reportContainer.appendChild(signatureLine);
  reportContainer.appendChild(footer);

  // Add to document body temporarily
  document.body.appendChild(reportContainer);

  // Convert image and generate PDF
  convertToBase64(analysisImageSrc).then(base64Image => {
      sampleImage.src = base64Image;

      html2canvas(reportContainer, { scale: 2 }).then(canvas => {
          const { jsPDF } = window.jspdf;
          const pdf = new jsPDF('p', 'mm', 'a4');

          const imgWidth = 210; // A4 width in mm
          const pageHeight = 295; // A4 height in mm
          const imgHeight = canvas.height * imgWidth / canvas.width;
          const heightLeft = imgHeight - pageHeight;

          let position = 0;

          pdf.addImage(canvas.toDataURL('image/jpeg'), 'JPEG', 0, position, imgWidth, imgHeight);

          if (heightLeft > 0) {
              pdf.addPage();
              pdf.addImage(canvas.toDataURL('image/jpeg'), 'JPEG', 0, -pageHeight, imgWidth, imgHeight);
          }

          pdf.save(`${imageNameInput}_Image_Analysis_Report.pdf`);
          document.body.removeChild(reportContainer);
      }).catch(error => {
          console.error("Error generating PDF:", error);
          document.body.removeChild(reportContainer);
      });
  }).catch(error => {
      console.error("Error converting image to Base64:", error);
      document.body.removeChild(reportContainer);
  });
}

function convertToBase64(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = url;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const dataURL = canvas.toDataURL('image/jpeg');
            resolve(dataURL);
        };
        img.onerror = error => reject(error);
    });
}

// Health check for backend
setTimeout(() => {
    if (roverController) {
        roverController.checkBackendHealth();
    }
}, 5000);

// Periodic health check every 30 seconds
setInterval(() => {
    if (roverController) {
        roverController.checkBackendHealth();
    }
}, 30000);

// Connection monitoring
setInterval(() => {
    if (roverController) {
        const cameraConnected = roverController.websockets.camera && 
                              roverController.websockets.camera.readyState === WebSocket.OPEN;
        const commandConnected = roverController.websockets.command && 
                               roverController.websockets.command.readyState === WebSocket.OPEN;
        
        const overallConnected = cameraConnected && commandConnected;
        
        if (overallConnected !== roverController.connectionStatus) {
            roverController.updateConnectionStatus(overallConnected);
        }
    }
}, 2000);

// Export global functions
window.roverController = roverController;
window.takeScreenshot = function(objectDetected) {
    if (roverController) {
        roverController.takeScreenshot(objectDetected);
    }
}

// Export upload and model selection functions
window.handleImageUpload = handleImageUpload;
window.selectModel = selectModel;
window.closeModelSelectionModal = closeModelSelectionModal;
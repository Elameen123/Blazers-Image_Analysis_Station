#!/usr/bin/env python3
"""
Mars Rover YOLOv8 Object Detection - Vercel Optimized
Streamlined detection service for serverless deployment
"""

import torch
import cv2
import numpy as np
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import io
from PIL import Image
import time
from datetime import datetime
import logging
import os
from pathlib import Path
import tempfile

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get the correct paths relative to api folder
import sys
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)  # Go up one level from api/


app = Flask(
    __name__,
    template_folder=os.path.join(parent_dir, 'templates'),  # ../templates
    static_folder=os.path.join(parent_dir, 'static')        # ../static
)
CORS(app, origins=["*"])  # Allow all origins for Vercel deployment

# Global model cache
_cached_model = None
_model_loading = False

class StreamlinedRoverDetector:
    def __init__(self, confidence_threshold=0.25):
        """
        Streamlined detector optimized for Vercel deployment
        """
        self.confidence_threshold = confidence_threshold
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        
        # Set up model directory - check api folder first, then parent
        self.current_dir = os.path.dirname(os.path.abspath(__file__))
        self.models_dir = os.path.join(self.current_dir, 'models')  # api/models
        
        # If models not in api folder, try parent directory
        if not os.path.exists(self.models_dir):
            parent_dir = os.path.dirname(self.current_dir)
            self.models_dir = os.path.join(parent_dir, 'models')  # ../models
        
        # Create models directory if it doesn't exist
        Path(self.models_dir).mkdir(exist_ok=True)
        
        # Simplified object mapping for Mars rover mission
        self.target_objects = {
            'sports ball': 'tennis_ball',
            'ball': 'tennis_ball', 
            'frisbee': 'balloon',
            'kite': 'balloon',
            'person': 'astronaut',
            'scissors': 'hammer',
            'knife': 'hammer',
            'orange': 'traffic_cone'
        }
        
        # Color mapping for balloons (simplified)
        self.balloon_colors = ['red', 'blue', 'green', 'yellow', 'pink', 'white', 'orange']
        
        logger.info(f"Streamlined Detector initialized - Device: {self.device}")
        logger.info(f"Models directory: {self.models_dir}")

    def get_model(self):
        """
        Lazy load YOLOv8 model with caching - handles api folder structure
        """
        global _cached_model, _model_loading
        
        if _cached_model is not None:
            return _cached_model
        
        if _model_loading:
            # Wait for concurrent loading to complete
            timeout = 30  # 30 second timeout
            start_time = time.time()
            while _model_loading and (time.time() - start_time) < timeout:
                time.sleep(0.5)
            
            if _cached_model is not None:
                return _cached_model
        
        try:
            _model_loading = True
            logger.info("Loading YOLOv8 model...")
            
            # Import ultralytics here for lazy loading
            from ultralytics import YOLO
            
            # Try multiple model locations in order of preference
            model_locations = [
                # 1. Local models directory (api/models/ or ../models/)
                os.path.join(self.models_dir, 'yolov8n.pt'),
                # 2. Temp directory (Vercel)
                os.path.join(tempfile.gettempdir(), 'yolov8n.pt'),
                # 3. Current directory
                os.path.join(self.current_dir, 'yolov8n.pt'),
                # 4. Let YOLO download automatically
                'yolov8n.pt'
            ]
            
            model_loaded = False
            
            for model_path in model_locations:
                try:
                    if model_path == 'yolov8n.pt':
                        # Let YOLO download automatically
                        logger.info("Downloading YOLOv8n model automatically...")
                        _cached_model = YOLO(model_path)
                        model_loaded = True
                        
                        # Try to save to models directory for future use
                        try:
                            save_path = os.path.join(self.models_dir, 'yolov8n.pt')
                            if hasattr(_cached_model, 'model') and not os.path.exists(save_path):
                                logger.info(f"Caching model to {save_path}")
                                # Copy the downloaded model file
                                import shutil
                                yolo_cache = os.path.expanduser('~/.ultralytics/yolov8n.pt')
                                if os.path.exists(yolo_cache):
                                    shutil.copy2(yolo_cache, save_path)
                        except Exception as cache_error:
                            logger.warning(f"Could not cache model: {cache_error}")
                        
                        break
                        
                    elif os.path.exists(model_path):
                        logger.info(f"Loading cached model from {model_path}")
                        _cached_model = YOLO(model_path)
                        model_loaded = True
                        break
                        
                except Exception as load_error:
                    logger.warning(f"Failed to load from {model_path}: {load_error}")
                    continue
            
            if not model_loaded:
                raise Exception("Could not load YOLOv8 model from any location")
            
            logger.info(f"YOLOv8 model loaded successfully with {len(_cached_model.names)} classes")
            return _cached_model
            
        except Exception as e:
            logger.error(f"Error loading YOLOv8 model: {e}")
            _cached_model = None
            raise Exception(f"Model loading failed: {str(e)}")
        finally:
            _model_loading = False

    def detect_objects(self, image):
        """
        Main detection method using YOLOv8
        """
        try:
            start_time = time.time()
            
            # Convert image format
            if isinstance(image, Image.Image):
                image_np = np.array(image)
            else:
                image_np = image
            
            # Get model (lazy loading)
            model = self.get_model()
            
            # Perform detection
            results = model(image_np, conf=self.confidence_threshold, verbose=False)
            
            detected_objects = []
            
            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    for box in boxes:
                        try:
                            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                            conf = float(box.conf[0].cpu().numpy())
                            cls = int(box.cls[0].cpu().numpy())
                            
                            original_class = model.names[cls]
                            
                            # Map to mission-specific objects
                            mapped_class = self._map_to_mission_object(
                                original_class, image_np, (x1, y1, x2, y2)
                            )
                            
                            if mapped_class:
                                obj_data = {
                                    'class': mapped_class,
                                    'original_class': original_class,
                                    'confidence': conf,
                                    'bbox': {
                                        'x1': int(x1), 'y1': int(y1), 
                                        'x2': int(x2), 'y2': int(y2)
                                    },
                                    'center': {
                                        'x': int((x1 + x2) / 2), 
                                        'y': int((y1 + y2) / 2)
                                    },
                                    'detection_method': 'yolo'
                                }
                                detected_objects.append(obj_data)
                        except Exception as box_error:
                            logger.warning(f"Error processing detection box: {box_error}")
                            continue
            
            # Filter overlapping detections
            filtered_objects = self._filter_overlapping_detections(detected_objects)
            
            processing_time = round(time.time() - start_time, 4)
            
            result_data = {
                'timestamp': time.time(),
                'objects': filtered_objects,
                'total_detections': len(filtered_objects),
                'processing_time': processing_time,
                'image_size': image_np.shape[:2][::-1],  # width, height
                'model_device': str(self.device),
                'detection_methods': ['yolo']
            }
            
            logger.info(f"Detected {len(filtered_objects)} objects in {processing_time}s")
            return result_data
            
        except Exception as e:
            logger.error(f"Detection error: {e}")
            return {
                'timestamp': time.time(),
                'objects': [],
                'total_detections': 0,
                'processing_time': 0,
                'error': str(e),
                'status': 'error'
            }

    def _map_to_mission_object(self, yolo_class, image_np, bbox):
        """
        Map YOLO class to Mars mission objects with simple validation
        """
        try:
            # Direct mapping from YOLO classes
            if yolo_class in self.target_objects:
                mapped_class = self.target_objects[yolo_class]
                
                # Special handling for balloons - try to detect color
                if mapped_class == 'balloon':
                    color = self._detect_dominant_color(image_np, bbox)
                    if color != 'unknown':
                        return f'{color}_balloon'
                    return 'balloon'
                
                return mapped_class
            
            # Additional generic mappings
            if 'person' in yolo_class.lower():
                return 'astronaut'
            elif any(tool in yolo_class.lower() for tool in ['tool', 'hammer', 'scissors', 'knife']):
                return 'hammer'
            elif any(ball in yolo_class.lower() for ball in ['ball', 'sphere']):
                return 'tennis_ball'
            
            return None
            
        except Exception as e:
            logger.warning(f"Object mapping error: {e}")
            return None

    def _detect_dominant_color(self, image_np, bbox):
        """
        Simple dominant color detection for balloons
        """
        try:
            x1, y1, x2, y2 = map(int, bbox)
            
            # Extract object region
            if x1 >= x2 or y1 >= y2:
                return 'unknown'
            
            # Ensure coordinates are within image bounds
            h, w = image_np.shape[:2]
            x1, x2 = max(0, x1), min(w, x2)
            y1, y2 = max(0, y1), min(h, y2)
            
            object_crop = image_np[y1:y2, x1:x2]
            
            if object_crop.size == 0:
                return 'unknown'
            
            # Convert to HSV for better color detection
            hsv_crop = cv2.cvtColor(object_crop, cv2.COLOR_RGB2HSV)
            
            # Get center region to avoid edges
            center_h, center_w = hsv_crop.shape[:2]
            if center_h < 10 or center_w < 10:
                return 'unknown'
            
            center_crop = hsv_crop[
                center_h//4:3*center_h//4, 
                center_w//4:3*center_w//4
            ]
            
            # Calculate average hue
            avg_hue = np.mean(center_crop[:,:,0])
            
            # Map hue to color names (simplified)
            if avg_hue < 15 or avg_hue > 165:
                return 'red'
            elif 15 <= avg_hue < 35:
                return 'orange'
            elif 35 <= avg_hue < 85:
                return 'yellow'
            elif 85 <= avg_hue < 125:
                return 'green'
            elif 125 <= avg_hue < 145:
                return 'blue'
            else:
                return 'pink'
                
        except Exception as e:
            logger.warning(f"Color detection error: {e}")
            return 'unknown'

    def _filter_overlapping_detections(self, detections):
        """
        Remove overlapping detections using IoU threshold
        """
        if not detections:
            return []
        
        # Sort by confidence
        detections.sort(key=lambda x: x['confidence'], reverse=True)
        
        filtered = []
        
        for detection in detections:
            # Check for overlaps with existing detections
            overlap_found = False
            
            for existing in filtered:
                iou = self._calculate_iou(detection['bbox'], existing['bbox'])
                if iou > 0.3:  # 30% overlap threshold
                    overlap_found = True
                    break
            
            if not overlap_found:
                filtered.append(detection)
        
        return filtered

    def _calculate_iou(self, box1, box2):
        """
        Calculate Intersection over Union (IoU) of two bounding boxes
        """
        try:
            # Get intersection coordinates
            x1 = max(box1['x1'], box2['x1'])
            y1 = max(box1['y1'], box2['y1'])
            x2 = min(box1['x2'], box2['x2'])
            y2 = min(box1['y2'], box2['y2'])
            
            # No intersection
            if x2 <= x1 or y2 <= y1:
                return 0.0
            
            # Calculate areas
            intersection = (x2 - x1) * (y2 - y1)
            area1 = (box1['x2'] - box1['x1']) * (box1['y2'] - box1['y1'])
            area2 = (box2['x2'] - box2['x1']) * (box2['y2'] - box2['y1'])
            union = area1 + area2 - intersection
            
            return intersection / union if union > 0 else 0.0
            
        except Exception as e:
            logger.warning(f"IoU calculation error: {e}")
            return 0.0

    def get_navigation_guidance(self, objects, image_width=640):
        """
        Provide navigation guidance based on detected objects
        """
        if not objects:
            return {
                'action': 'continue_search',
                'message': 'No target objects detected, continue searching',
                'confidence': 0.0
            }
        
        # Find highest confidence target
        target = max(objects, key=lambda x: x['confidence'])
        
        image_center = image_width // 2
        object_center_x = target['center']['x']
        
        # Determine navigation action
        if abs(object_center_x - image_center) < 50:
            action = 'move_forward'
            message = f"Target {target['class']} centered - move forward"
        elif object_center_x < image_center - 50:
            action = 'turn_left'
            message = f"Target {target['class']} to the left - turn left"
        else:
            action = 'turn_right'
            message = f"Target {target['class']} to the right - turn right"
        
        return {
            'action': action,
            'message': message,
            'target': target['class'],
            'confidence': target['confidence'],
            'detection_method': target.get('detection_method', 'yolo')
        }

# Initialize detector (lazy loading will happen on first detection)
detector = StreamlinedRoverDetector()

# Flask Routes
@app.route('/')
def index():
    """Serve the main application"""
    try:
        # First try to serve the HTML template
        return render_template('index.html')
    except Exception as e:
        logger.warning(f"Template loading error: {e}")
        # Fallback API response for when templates aren't available
        return jsonify({
            'service': 'Mars Rover Object Detection',
            'status': 'running',
            'version': 'v2.0-vercel',
            'endpoints': ['/detect', '/health', '/config'],
            'note': 'Frontend template not found - API endpoints available'
        })

@app.route('/static/<path:filename>')
def serve_static(filename):
    """Serve static files"""
    try:
        return app.send_static_file(filename)
    except Exception as e:
        logger.error(f"Static file error: {e}")
        return jsonify({'error': f'Static file not found: {filename}'}), 404

@app.route('/detect', methods=['POST'])
def detect_objects():
    """Main detection endpoint"""
    try:
        if 'frame' not in request.files:
            return jsonify({'error': 'No frame provided'}), 400
        
        file = request.files['frame']
        
        # Validate file
        if not file or file.filename == '':
            return jsonify({'error': 'No valid file provided'}), 400
        
        # Load and validate image
        try:
            image = Image.open(io.BytesIO(file.read()))
            if image.mode != 'RGB':
                image = image.convert('RGB')
        except Exception as img_error:
            logger.error(f"Image processing error: {img_error}")
            return jsonify({'error': 'Invalid image format'}), 400
        
        logger.info(f"Processing image: {image.size}")
        
        # Perform detection
        results = detector.detect_objects(image)
        
        # Get navigation guidance
        guidance = detector.get_navigation_guidance(
            results.get('objects', []),
            image.size[0]
        )
        
        response = {
            **results,
            'navigation': guidance,
            'status': 'success',
            'service': 'mars_rover_detection',
            'version': 'v2.0-vercel'
        }
        
        object_classes = [obj['class'] for obj in results.get('objects', [])]
        logger.info(f"Detection complete - Objects: {object_classes}")
        
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Detection endpoint error: {e}")
        return jsonify({
            'error': str(e),
            'objects': [],
            'total_detections': 0,
            'status': 'error',
            'service': 'mars_rover_detection'
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        # Check if model can be loaded
        model_status = 'not_loaded'
        model_classes = 0
        
        try:
            if _cached_model is not None:
                model_status = 'loaded'
                model_classes = len(_cached_model.names)
            else:
                model_status = 'ready_to_load'
        except Exception as model_error:
            logger.warning(f"Model check error: {model_error}")
            model_status = 'error'
        
        health_data = {
            'status': 'healthy',
            'service': 'Mars Rover Object Detection',
            'version': 'v2.0-vercel',
            'model_status': model_status,
            'model_classes': model_classes,
            'device': str(detector.device),
            'confidence_threshold': detector.confidence_threshold,
            'target_objects': list(detector.target_objects.values()),
            'supported_formats': ['image/jpeg', 'image/png', 'image/webp'],
            'max_image_size': '10MB',
            'timestamp': datetime.now().isoformat(),
            'python_version': os.sys.version.split()[0],
            'memory_info': 'available' if hasattr(os, 'getpid') else 'unavailable'
        }
        
        return jsonify(health_data)
        
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'service': 'mars_rover_detection',
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/config', methods=['POST'])
def update_config():
    """Update detector configuration"""
    try:
        config = request.get_json()
        
        if not config:
            return jsonify({'error': 'No configuration data provided'}), 400
        
        updated_fields = []
        
        # Update confidence threshold
        if 'confidence_threshold' in config:
            try:
                new_threshold = float(config['confidence_threshold'])
                if 0.1 <= new_threshold <= 1.0:
                    detector.confidence_threshold = new_threshold
                    updated_fields.append('confidence_threshold')
                    logger.info(f"Updated confidence threshold to {new_threshold}")
                else:
                    return jsonify({'error': 'Confidence threshold must be between 0.1 and 1.0'}), 400
            except ValueError:
                return jsonify({'error': 'Invalid confidence threshold value'}), 400
        
        return jsonify({
            'message': 'Configuration updated successfully',
            'updated_fields': updated_fields,
            'current_config': {
                'confidence_threshold': detector.confidence_threshold,
                'device': str(detector.device),
                'model_status': 'loaded' if _cached_model else 'not_loaded',
                'target_objects': list(detector.target_objects.values())
            },
            'status': 'success',
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Config update error: {e}")
        return jsonify({
            'error': str(e), 
            'status': 'error',
            'timestamp': datetime.now().isoformat()
        }), 500

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'error': 'Endpoint not found',
        'available_endpoints': ['/detect', '/health', '/config'],
        'status': 'error'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'error': 'Internal server error',
        'status': 'error',
        'timestamp': datetime.now().isoformat()
    }), 500

# Vercel serverless function entry point
def handler(request):
    """Vercel serverless function handler"""
    return app(request.environ, start_response)

# Traditional Flask entry point (for local development)
if __name__ == '__main__':
    logger.info("Starting Streamlined Mars Rover Object Detection Service...")
    logger.info(f"Device: {detector.device}")
    logger.info(f"Target objects: {list(detector.target_objects.values())}")
    logger.info("Model will be loaded on first detection request (lazy loading)")
    
    # Local development server
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
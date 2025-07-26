#!/usr/bin/env python3
"""
Mars Rover YOLOv5 Object Detection Backend (Using YOLOv5 PyTorch Hub Interface)
"""

import torch
import cv2
import numpy as np
from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
import io
from PIL import Image
import base64
import json
import time
from datetime import datetime
import logging
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(
    __name__,
    template_folder='../templates',
    static_folder='../static'
)
CORS(app)  # Enable CORS for all routes


class RoverObjectDetector:
    def __init__(self, model_path='yolov5s.pt', confidence_threshold=0.5):
        """
        Initialize YOLOv5 Object Detector using PyTorch Hub
        """
        self.confidence_threshold = confidence_threshold
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        logger.info(f"Loading YOLOv5 model from {model_path} on {self.device}")

        # Load model from PyTorch Hub
        self.model = torch.hub.load('ultralytics/yolov5', 'custom', path=model_path, force_reload=False)
        self.model.to(self.device)
        self.model.conf = self.confidence_threshold

        # Mission-relevant object classes
        self.mission_objects = {
            'hammer': 'hammer',
            'sports ball': 'tennis_ball',
            'orange': 'traffic_cone',
            'person': 'astronaut',
            'bottle': 'sample_container',
            'cup': 'sample_container',
            'bowl': 'sample_container'
        }

        self.balloon_colors = ['black', 'white', 'pink', 'yellow', 'blue']
        self.detection_history = []

    def detect_objects(self, image):
        """
        Detect objects in given image
        """
        try:
            start_time = time.time()

            # Convert image to numpy if PIL
            if isinstance(image, Image.Image):
                image = np.array(image)

            # Inference
            results = self.model(image)

            objects = []
            for det in results.xyxy[0]:
                x1, y1, x2, y2, conf, cls = det.cpu().numpy()
                if conf < self.confidence_threshold:
                    continue
                class_id = int(cls)
                class_name = self.model.names[class_id]
                mapped_class = self.mission_objects.get(class_name, class_name)

                obj_data = {
                    'class': mapped_class,
                    'original_class': class_name,
                    'confidence': float(conf),
                    'bbox': {'x1': int(x1), 'y1': int(y1), 'x2': int(x2), 'y2': int(y2)},
                    'center': {'x': int((x1 + x2) / 2), 'y': int((y1 + y2) / 2)}
                }
                objects.append(obj_data)

            # Update detection history
            current_time = time.time()
            self.detection_history.append({'timestamp': current_time, 'objects': objects})
            self.detection_history = [d for d in self.detection_history if current_time - d['timestamp'] < 30]

            return {
                'timestamp': current_time,
                'objects': objects,
                'total_detections': len(objects),
                'processing_time': round(time.time() - start_time, 4),
                'image_size': image.shape[:2][::-1]
            }

        except Exception as e:
            logger.error(f"Error during object detection: {e}")
            return {
                'timestamp': time.time(),
                'objects': [],
                'total_detections': 0,
                'error': str(e)
            }

    def get_navigation_guidance(self, objects, image_width=640):
        if not objects:
            return {'action': 'continue_search', 'message': 'No objects detected, continue searching'}

        primary_object = max(objects, key=lambda x: x['confidence'])
        image_center = image_width // 2
        object_center_x = primary_object['center']['x']

        if abs(object_center_x - image_center) < 50:
            action = 'move_forward'
        elif object_center_x < image_center - 50:
            action = 'turn_left'
        else:
            action = 'turn_right'

        return {
            'action': action,
            'message': f"Target {primary_object['class']} at {action.replace('_', ' ')}",
            'target': primary_object['class'],
            'confidence': primary_object['confidence']
        }

    def get_detection_statistics(self):
        if not self.detection_history:
            return {'total_frames': 0, 'avg_detections': 0, 'most_common_object': None}

        total_frames = len(self.detection_history)
        all_objects = [obj['class'] for frame in self.detection_history for obj in frame['objects']]
        avg_detections = len(all_objects) / total_frames if total_frames > 0 else 0

        from collections import Counter
        most_common = Counter(all_objects).most_common(1)
        most_common_object = {'class': most_common[0][0], 'count': most_common[0][1]} if most_common else None

        return {
            'total_frames': total_frames,
            'avg_detections': round(avg_detections, 2),
            'most_common_object': most_common_object,
            'unique_objects': len(set(all_objects))
        }


# Initialize detector
detector = RoverObjectDetector()

# Flask Routes remain the same

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory(app.static_folder, filename)

@app.route('/detect', methods=['POST'])
def detect_objects():
    try:
        if 'frame' not in request.files:
            return jsonify({'error': 'No frame provided'}), 400

        file = request.files['frame']
        image = Image.open(io.BytesIO(file.read()))
        results = detector.detect_objects(image)
        guidance = detector.get_navigation_guidance(results['objects'], image.size[0])

        response = {**results, 'navigation': guidance, 'status': 'success'}
        logger.info(f"Detected {results['total_detections']} objects")
        return jsonify(response)

    except Exception as e:
        logger.error(f"Error in detect endpoint: {e}")
        return jsonify({'error': str(e), 'objects': [], 'total_detections': 0, 'status': 'error'}), 500

@app.route('/statistics', methods=['GET'])
def get_statistics():
    try:
        stats = detector.get_detection_statistics()
        return jsonify({'statistics': stats, 'status': 'success'})
    except Exception as e:
        logger.error(f"Error getting statistics: {e}")
        return jsonify({'error': str(e), 'status': 'error'}), 500

@app.route('/config', methods=['POST'])
def update_config():
    try:
        config = request.get_json()
        if 'confidence_threshold' in config:
            detector.confidence_threshold = float(config['confidence_threshold'])
            detector.model.conf = detector.confidence_threshold
            logger.info(f"Updated confidence threshold to {detector.confidence_threshold}")

        return jsonify({
            'message': 'Configuration updated successfully',
            'current_config': {
                'confidence_threshold': detector.confidence_threshold,
                'device': str(detector.device)
            },
            'status': 'success'
        })
    except Exception as e:
        logger.error(f"Error updating config: {e}")
        return jsonify({'error': str(e), 'status': 'error'}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'model_loaded': detector.model is not None,
        'device': str(detector.device),
        'timestamp': datetime.now().isoformat()
    })

@app.route('/mission_objects', methods=['GET'])
def get_mission_objects():
    return jsonify({
        'mission_objects': detector.mission_objects,
        'balloon_colors': detector.balloon_colors,
        'status': 'success'
    })

if __name__ == '__main__':
    logger.info("Starting Mars Rover Object Detection Service...")
    logger.info(f"Using device: {detector.device}")
    logger.info(f"Model confidence threshold: {detector.confidence_threshold}")

    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)

def handler(request, context):
    return app(request, context)

from flask import Flask, send_from_directory, request, jsonify
import logging
import os
import time
import webbrowser
import threading
import json
import re
import shutil
from datetime import datetime
from typing import Any, Dict, Optional

import numpy as np

from training import DQNTrainer, TrainingConfig, available_agents

app = Flask(__name__)

logging.basicConfig(level=os.environ.get("TRAINER_LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)


class TrainerService:
    """Manages the in-process RL trainer lifecycle and HTTP bridge."""

    def __init__(self, config: TrainingConfig) -> None:
        self._config = config
        self._trainer = DQNTrainer(config)
        self._lock = threading.Lock()
        self._agent_name: Optional[str] = None
        self._last_metrics: Dict[str, float] = {}

    def start(self, agent_name: str) -> Dict[str, Any]:
        agents = available_agents()
        if agent_name not in agents:
            raise ValueError(f"Unknown agent '{agent_name}'")
        with self._lock:
            self._agent_name = agent_name
            self._trainer.start()
            logger.info("Training started with agent %s", agent_name)
            return self.status()

    def stop(self) -> Dict[str, Any]:
        with self._lock:
            self._trainer.stop()
            logger.info("Training stopped")
            self._agent_name = None
            self._last_metrics = {}
            return self.status()

    def status(self) -> Dict[str, Any]:
        status = self._trainer.get_status()
        status.update(
            {
                "agent": self._agent_name,
                "state_size": self._config.state_size,
                "action_size": self._config.action_size,
                "last_metrics": self._last_metrics,
            }
        )
        # Ensure JSON serialisable primitives
        status["buffer_size"] = int(status.get("buffer_size", 0))
        status["total_steps"] = int(status.get("total_steps", 0))
        status["training_steps"] = int(status.get("training_steps", 0))
        status["current_episode_length"] = int(status.get("current_episode_length", 0))
        status["running"] = bool(status.get("running", False))
        return status

    def step(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            if not self._trainer.running:
                response = self.status()
                response["action"] = self._trainer.default_action()
                response["running"] = False
                return response

            state = self._ensure_state_vector(payload.get("state"))

            prev_state_raw = payload.get("prev_state")
            prev_state = (
                self._ensure_state_vector(prev_state_raw)
                if prev_state_raw is not None
                else None
            )
            prev_action = payload.get("prev_action")
            if prev_action is not None:
                prev_action = int(prev_action)

            reward = float(payload.get("reward", 0.0))
            done = bool(payload.get("done", False))
            reset = bool(payload.get("reset", False))

            metrics: Dict[str, float] = {}
            if prev_state is not None and prev_action is not None:
                metrics = self._trainer.record_transition(prev_state, prev_action, reward, state, done)
                self._last_metrics = metrics
            elif prev_state is None:
                self._last_metrics = self._last_metrics or {}

            if reset:
                self._trainer.reset_episode()

            action = self._trainer.default_action() if done else self._trainer.select_action(state)

            response = self.status()
            response.update(
                {
                    "action": int(action),
                    "running": self._trainer.running,
                    "metrics": metrics,
                }
            )
            return response

    def _ensure_state_vector(self, value: Any) -> np.ndarray:
        array = np.asarray(value, dtype=np.float32)
        expected_shape = (self._config.state_size,)
        if array.shape != expected_shape:
            raise ValueError(
                f"Expected state vector of shape {expected_shape}, received {array.shape}"
            )
        return array


TRAINING_CONFIG = TrainingConfig(
    state_size=19,
    action_size=5,
    replay_buffer_size=100_000,
    batch_size=64,
    gamma=0.99,
    learning_rate=1e-4,
    train_frequency=4,
    target_update_frequency=1_000,
    save_every_steps=5_000,
    max_training_steps=1_000_000,
)

trainer_service = TrainerService(TRAINING_CONFIG)


def slugify(text):
    """Convert text to a URL-friendly slug."""
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    text = re.sub(r'_+', '_', text)
    return text.strip('_')


def create_track_folder(track_name, author, file, cover=None):
    """Create track folder structure and save files."""
    tracks_dir = os.path.join(os.path.dirname(__file__), '..', 'tracks')
    os.makedirs(tracks_dir, exist_ok=True)
    
    # Create unique folder name
    base_slug = slugify(track_name)
    folder_name = base_slug
    counter = 1
    while os.path.exists(os.path.join(tracks_dir, folder_name)):
        folder_name = f"{base_slug}_{counter}"
        counter += 1
    
    track_dir = os.path.join(tracks_dir, folder_name)
    os.makedirs(track_dir)
    
    # Save original file
    filename = file.filename
    ext = os.path.splitext(filename)[1].lower()
    original_path = os.path.join(track_dir, f"original{ext}")
    file.save(original_path)
    
    # Create canonical.png (copy of original for now)
    canonical_path = os.path.join(track_dir, "canonical.png")
    if ext == '.png':
        shutil.copy2(original_path, canonical_path)
    else:
        # For non-PNG, just copy as canonical for now
        shutil.copy2(original_path, canonical_path)
    
    # Save cover if provided
    if cover:
        cover_ext = os.path.splitext(cover.filename)[1].lower()
        cover_path = os.path.join(track_dir, f"cover{cover_ext}")
        cover.save(cover_path)
    
    # Create meta.json
    meta = {
        "id": folder_name,
        "name": track_name,
        "author": author,
        "original": f"original{ext}",
        "canonical": "canonical.png",
        "geometry": None,  # Optional
        "createdAt": datetime.utcnow().isoformat() + 'Z'
    }
    meta_path = os.path.join(track_dir, "meta.json")
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2)
    
    # Check if this matches legacy filename and copy to root if so
    legacy_filename = "Albert_Park_Circuit_Melbourne_Track_Transparent.png"
    if filename == legacy_filename or track_name.lower().replace(' ', '_') in legacy_filename.lower():
        legacy_path = os.path.join(tracks_dir, legacy_filename)
        if not os.path.exists(legacy_path):
            shutil.copy2(canonical_path, legacy_path)
    
    return meta


def get_tracks_list():
    """Get list of all tracks with meta.json."""
    tracks_dir = os.path.join(os.path.dirname(__file__), '..', 'tracks')
    tracks = []
    if os.path.exists(tracks_dir):
        for item in os.listdir(tracks_dir):
            track_dir = os.path.join(tracks_dir, item)
            if os.path.isdir(track_dir):
                meta_path = os.path.join(track_dir, "meta.json")
                if os.path.exists(meta_path):
                    with open(meta_path, 'r') as f:
                        try:
                            meta = json.load(f)
                            tracks.append(meta)
                        except json.JSONDecodeError:
                            pass
    return tracks


def get_track_meta(track_id):
    """Get meta for a specific track."""
    tracks_dir = os.path.join(os.path.dirname(__file__), '..', 'tracks')
    track_dir = os.path.join(tracks_dir, track_id)
    meta_path = os.path.join(track_dir, "meta.json")
    if os.path.exists(meta_path):
        with open(meta_path, 'r') as f:
            return json.load(f)
    return None


@app.route('/')
def index():
    directory = os.path.join(os.path.dirname(__file__), '..', 'web')
    return send_from_directory(directory, 'index.html')


@app.route('/tracks/<path:filename>')
def tracks(filename):
    directory = os.path.join(os.path.dirname(__file__), '..', 'tracks')
    return send_from_directory(directory, filename)


@app.route('/cars/<path:filename>')
def cars(filename):
    directory = os.path.join(os.path.dirname(__file__), '..', 'cars')
    return send_from_directory(directory, filename)


@app.route('/tracks/upload', methods=['POST'])
def upload_track():
    try:
        name = request.form.get('name', '').strip()
        author = request.form.get('author', 'Unknown').strip()
        file = request.files.get('file')
        cover = request.files.get('cover')
        
        if not name or not file:
            return jsonify({'error': 'Name and file are required'}), 400
        
        # Check file size (25MB limit)
        if file.content_length > 25 * 1024 * 1024:
            return jsonify({'error': 'File too large (max 25MB)'}), 400
        
        # Check file type
        allowed_exts = {'.png', '.jpg', '.jpeg', '.svg'}
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in allowed_exts:
            return jsonify({'error': 'Invalid file type. Allowed: png, jpg, jpeg, svg'}), 400
        
        meta = create_track_folder(name, author, file, cover)
        return jsonify({'status': 'ok', 'meta': meta})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/tracks/list')
def list_tracks():
    try:
        tracks = get_tracks_list()
        return jsonify(tracks)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/tracks/load/<track_id>')
def load_track(track_id):
    try:
        meta = get_track_meta(track_id)
        if meta:
            return jsonify(meta)
        else:
            return jsonify({'error': 'Track not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/tracks/<track_id>/geometry', methods=['GET'])
def get_geometry(track_id):
    try:
        tracks_dir = os.path.join(os.path.dirname(__file__), '..', 'tracks')
        track_dir = os.path.join(tracks_dir, track_id)
        geometry_path = os.path.join(track_dir, 'geometry.json')
        
        if not os.path.exists(geometry_path):
            return jsonify({'error': 'Geometry not found'}), 404
        
        with open(geometry_path, 'r') as f:
            geometry = json.load(f)
        
        return jsonify(geometry)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/tracks/<track_id>/geometry', methods=['POST'])
def save_geometry(track_id):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        # Validate the geometry
        validation_error = validate_geometry(data, track_id)
        if validation_error:
            return jsonify({'error': validation_error}), 400
        
        tracks_dir = os.path.join(os.path.dirname(__file__), '..', 'tracks')
        track_dir = os.path.join(tracks_dir, track_id)
        
        if not os.path.exists(track_dir):
            return jsonify({'error': 'Track not found'}), 404
        
        geometry_path = os.path.join(track_dir, 'geometry.json')
        backups_dir = os.path.join(track_dir, 'backups')
        os.makedirs(backups_dir, exist_ok=True)
        
        # Check for optimistic concurrency
        if os.path.exists(geometry_path):
            with open(geometry_path, 'r') as f:
                existing = json.load(f)
            
            prev_updated_at = data.get('prevUpdatedAt')
            if prev_updated_at and existing.get('updatedAt') != prev_updated_at:
                return jsonify({
                    'error': 'Track has been modified by another user',
                    'currentVersion': existing
                }), 409
        
        # Create backup if geometry exists
        if os.path.exists(geometry_path):
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            backup_path = os.path.join(backups_dir, f'geometry_{timestamp}.json')
            shutil.copy2(geometry_path, backup_path)
        
        # Update timestamps
        data['updatedAt'] = datetime.utcnow().isoformat() + 'Z'
        if 'createdAt' not in data:
            data['createdAt'] = data['updatedAt']
        
        # Atomic write: write to temp file then rename
        temp_path = geometry_path + '.tmp'
        with open(temp_path, 'w') as f:
            json.dump(data, f, indent=2)
        
        # On Windows, remove target file if it exists before rename
        if os.path.exists(geometry_path):
            os.remove(geometry_path)
        os.rename(temp_path, geometry_path)
        
        # Update meta.json to reference geometry
        meta_path = os.path.join(track_dir, 'meta.json')
        if os.path.exists(meta_path):
            with open(meta_path, 'r') as f:
                meta = json.load(f)
            meta['geometry'] = 'geometry.json'
            with open(meta_path, 'w') as f:
                json.dump(meta, f, indent=2)
        
        # Generate version ID
        version_id = f"v_{int(datetime.utcnow().timestamp())}"
        
        return jsonify({
            'status': 'ok',
            'versionId': version_id,
            'updatedAt': data['updatedAt']
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/tracks/<track_id>/geometry/versions')
def get_geometry_versions(track_id):
    try:
        tracks_dir = os.path.join(os.path.dirname(__file__), '..', 'tracks')
        track_dir = os.path.join(tracks_dir, track_id)
        backups_dir = os.path.join(track_dir, 'backups')
        
        versions = []
        if os.path.exists(backups_dir):
            for filename in os.listdir(backups_dir):
                if filename.startswith('geometry_') and filename.endswith('.json'):
                    filepath = os.path.join(backups_dir, filename)
                    stat = os.stat(filepath)
                    timestamp_str = filename.replace('geometry_', '').replace('.json', '')
                    try:
                        # Parse timestamp from filename
                        dt = datetime.strptime(timestamp_str, '%Y%m%d_%H%M%S')
                        versions.append({
                            'timestamp': dt.isoformat() + 'Z',
                            'versionId': f"backup_{timestamp_str}",
                            'author': 'Unknown',  # Could be enhanced to track authors
                            'message': 'Automatic backup'
                        })
                    except ValueError:
                        continue
        
        # Sort by timestamp descending
        versions.sort(key=lambda x: x['timestamp'], reverse=True)
        
        return jsonify(versions)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/training/agents', methods=['GET'])
def training_agents():
    try:
        data = {
            'agents': available_agents(),
            'config': {
                'state_size': TRAINING_CONFIG.state_size,
                'action_size': TRAINING_CONFIG.action_size,
            },
            'status': trainer_service.status(),
        }
        return jsonify(data)
    except Exception as exc:
        logger.exception('Failed to list training agents: %s', exc)
        return jsonify({'error': 'Unable to retrieve agents'}), 500


@app.route('/training/start', methods=['POST'])
def start_training():
    payload = request.get_json(silent=True) or {}
    agent = payload.get('agent', 'DQN')
    try:
        status = trainer_service.start(agent)
        return jsonify(status)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.exception('Failed to start training: %s', exc)
        return jsonify({'error': 'Failed to start training'}), 500


@app.route('/training/stop', methods=['POST'])
def stop_training():
    try:
        status = trainer_service.stop()
        return jsonify(status)
    except Exception as exc:
        logger.exception('Failed to stop training: %s', exc)
        return jsonify({'error': 'Failed to stop training'}), 500


@app.route('/training/status', methods=['GET'])
def training_status():
    try:
        return jsonify(trainer_service.status())
    except Exception as exc:
        logger.exception('Failed to fetch training status: %s', exc)
        return jsonify({'error': 'Failed to fetch status'}), 500


@app.route('/training/step', methods=['POST'])
def training_step():
    payload = request.get_json(silent=True) or {}
    try:
        result = trainer_service.step(payload)
        return jsonify(result)
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.exception('Training step failed: %s', exc)
        return jsonify({'error': 'Training step failed'}), 500


def validate_geometry(geometry, track_id):
    """Validate geometry JSON structure and data."""
    required_fields = ['trackId', 'walls', 'checkpoints', 'spawn']
    for field in required_fields:
        if field not in geometry:
            return f"Missing required field: {field}"
    
    if geometry['trackId'] != track_id:
        return "trackId mismatch"
    
    # Validate walls
    if not isinstance(geometry['walls'], list):
        return "walls must be an array"
    
    for i, wall in enumerate(geometry['walls']):
        if not isinstance(wall, dict) or 'id' not in wall or 'polyline' not in wall:
            return f"Wall {i} missing id or polyline"
        if not isinstance(wall['polyline'], list) or len(wall['polyline']) < 2:
            return f"Wall {i} polyline must have at least 2 points"
        for j, point in enumerate(wall['polyline']):
            if not isinstance(point, list) or len(point) != 2:
                return f"Wall {i} point {j} must be [x,y]"
            x, y = point
            if not (isinstance(x, (int, float)) and isinstance(y, (int, float))):
                return f"Wall {i} point {j} coordinates must be numbers"
            if not (abs(x) < 100000 and abs(y) < 100000):  # Reasonable bounds
                return f"Wall {i} point {j} coordinates out of bounds"
    
    # Validate checkpoints
    if not isinstance(geometry['checkpoints'], list):
        return "checkpoints must be an array"
    
    for i, cp in enumerate(geometry['checkpoints']):
        required_cp_fields = ['id', 'x', 'y', 'angle', 'radius']
        for field in required_cp_fields:
            if field not in cp:
                return f"Checkpoint {i} missing {field}"
        for field in ['x', 'y', 'angle', 'radius']:
            if not isinstance(cp[field], (int, float)):
                return f"Checkpoint {i} {field} must be a number"
        if not (abs(cp['x']) < 100000 and abs(cp['y']) < 100000):
            return f"Checkpoint {i} coordinates out of bounds"
    
    # Validate spawn
    if not isinstance(geometry['spawn'], dict):
        return "spawn must be an object"
    required_spawn_fields = ['x', 'y', 'angle']
    for field in required_spawn_fields:
        if field not in geometry['spawn']:
            return f"Spawn missing {field}"
        if not isinstance(geometry['spawn'][field], (int, float)):
            return f"Spawn {field} must be a number"
    
    # Validate startLine if present
    if 'startLine' in geometry:
        sl = geometry['startLine']
        if not isinstance(sl, dict):
            return "startLine must be an object"
        required_sl_fields = ['x1', 'y1', 'x2', 'y2', 'angle']
        for field in required_sl_fields:
            if field not in sl:
                return f"StartLine missing {field}"
            if not isinstance(sl[field], (int, float)):
                return f"StartLine {field} must be a number"
    
    # Sanitize keys and check for nested objects (simple check)
    def sanitize_dict(d, max_depth=3, current_depth=0):
        if current_depth > max_depth:
            return "Object too deeply nested"
        if isinstance(d, dict):
            for key, value in list(d.items()):
                if not isinstance(key, str) or len(key) > 100:
                    return f"Invalid key: {key}"
                if isinstance(value, dict):
                    error = sanitize_dict(value, max_depth, current_depth + 1)
                    if error:
                        return error
                elif isinstance(value, list):
                    for item in value:
                        if isinstance(item, dict):
                            error = sanitize_dict(item, max_depth, current_depth + 1)
                            if error:
                                return error
        return None
    
    error = sanitize_dict(geometry)
    if error:
        return error
    
    return None


@app.route('/log_performance', methods=['POST'])
def log_performance():
    data = request.get_json()
    timestamp = time.strftime('%Y-%m-%d %H:%M:%S')

    log_entry = f"[{timestamp}] FPS: {data.get('fps', 0)}, Update: {data.get('updateTime', 0):.2f}ms, Draw: {data.get('drawTime', 0):.2f}ms, Car: {data.get('carTime', 0):.2f}ms, Sensor: {data.get('sensorTime', 0):.2f}ms, Camera: {data.get('cameraTime', 0):.2f}ms\n"

    with open('performance.log', 'a') as f:
        f.write(log_entry)

    return jsonify({'status': 'logged'})


@app.route('/favicon.ico')
def favicon():
    return '', 204  # Return 204 No Content for favicon


@app.route('/<path:filename>')
def static_files(filename):
    directory = os.path.join(os.path.dirname(__file__), '..', 'web')
    return send_from_directory(directory, filename)


def _open_browser_later(url: str, delay: float = 1.0):
    """Open the default web browser after a short delay in a background thread.

    This avoids race conditions where the browser attempts to connect before the
    Flask server starts listening.
    """

    def _open():
        try:
            webbrowser.open_new(url)
        except Exception:
            # Don't crash the server if opening the browser fails
            print(f'Failed to open browser to {url}')

    t = threading.Timer(delay, _open)
    t.daemon = True
    t.start()


if __name__ == '__main__':
    host = '127.0.0.1'
    port = 5000
    url = f'http://{host}:{port}/'
    # Launch the browser only in the main process, not the reloader process
    # (Flask debug mode spawns a reloader that would open a second tab)
    if os.environ.get('WERKZEUG_RUN_MAIN') != 'true':
        _open_browser_later(url, delay=1.5)
    app.run(host=host, port=port, debug=True)
from flask import Flask, send_from_directory, request, jsonify
import os
import time
import webbrowser
import threading
import json
import re
import shutil
from datetime import datetime

app = Flask(__name__)


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
from flask import Flask, send_from_directory, request, jsonify
import os
import time
import webbrowser
import threading

app = Flask(__name__)


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
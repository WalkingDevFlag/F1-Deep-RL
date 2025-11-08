from flask import Flask, send_from_directory
import os

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

@app.route('/<path:filename>')
def static_files(filename):
    directory = os.path.join(os.path.dirname(__file__), '..', 'web')
    return send_from_directory(directory, filename)

if __name__ == '__main__':
    app.run(debug=True)
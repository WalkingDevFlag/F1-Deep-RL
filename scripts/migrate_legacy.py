#!/usr/bin/env python3
"""
Migration script to move the legacy track file into the new folder structure.
Run this once to migrate Albert_Park_Circuit_Melbourne_Track_Transparent.png
"""

import os
import json
import shutil
from datetime import datetime

def migrate_legacy_track():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    tracks_dir = os.path.join(repo_root, 'tracks')
    legacy_file = 'Albert_Park_Circuit_Melbourne_Track_Transparent.png'
    legacy_path = os.path.join(tracks_dir, legacy_file)
    
    if not os.path.exists(legacy_path):
        print(f"Legacy file {legacy_file} not found. Nothing to migrate.")
        return
    
    # Create subfolder
    folder_name = 'albert_park_circuit_melbourne_track_transparent'
    track_dir = os.path.join(tracks_dir, folder_name)
    os.makedirs(track_dir, exist_ok=True)
    
    # Move original
    original_path = os.path.join(track_dir, 'original.png')
    shutil.move(legacy_path, original_path)
    
    # Create canonical.png (copy)
    canonical_path = os.path.join(track_dir, 'canonical.png')
    shutil.copy2(original_path, canonical_path)
    
    # Create meta.json
    meta = {
        "id": folder_name,
        "name": "Albert Park Circuit Melbourne Track Transparent",
        "author": "Unknown",
        "original": "original.png",
        "canonical": "canonical.png",
        "geometry": None,
        "createdAt": datetime.utcnow().isoformat() + 'Z'
    }
    meta_path = os.path.join(track_dir, 'meta.json')
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2)
    
    # Copy back to legacy path for compatibility
    shutil.copy2(canonical_path, legacy_path)
    
    print(f"Migrated {legacy_file} to {folder_name}/")
    print("Legacy file preserved at root for compatibility.")

if __name__ == '__main__':
    migrate_legacy_track()
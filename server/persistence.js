/**
 * Persistence Manager
 * Saves and loads room drawing state to/from JSON files
 */

const fs = require('fs');
const path = require('path');

class PersistenceManager {
    constructor() {
        this.dataDir = path.join(__dirname, '..', 'data', 'rooms');
        this.ensureDataDirectory();
    }

    /**
     * Ensure the data directory exists
     */
    ensureDataDirectory() {
        try {
            fs.mkdirSync(this.dataDir, { recursive: true });
        } catch (error) {
            console.error('Failed to create data directory:', error);
        }
    }

    /**
     * Get file path for a room
     */
    getRoomFilePath(roomId) {
        // Sanitize roomId to prevent path traversal
        const safeRoomId = roomId.replace(/[^a-zA-Z0-9-_]/g, '');
        return path.join(this.dataDir, `${safeRoomId}.json`);
    }

    /**
     * Save room state to file
     */
    saveRoom(roomId, strokes) {
        try {
            const filePath = this.getRoomFilePath(roomId);
            const data = {
                roomId: roomId,
                strokes: strokes,
                savedAt: new Date().toISOString(),
                strokeCount: strokes.length
            };

            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            console.log(`Saved room ${roomId} with ${strokes.length} strokes`);
            return true;
        } catch (error) {
            console.error(`Failed to save room ${roomId}:`, error);
            return false;
        }
    }

    /**
     * Load room state from file
     */
    loadRoom(roomId) {
        try {
            const filePath = this.getRoomFilePath(roomId);

            if (!fs.existsSync(filePath)) {
                return null;
            }

            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            console.log(`Loaded room ${roomId} with ${data.strokes?.length || 0} strokes`);
            return data.strokes || [];
        } catch (error) {
            console.error(`Failed to load room ${roomId}:`, error);
            return null;
        }
    }

    /**
     * Delete room file
     */
    deleteRoom(roomId) {
        try {
            const filePath = this.getRoomFilePath(roomId);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`Deleted room file for ${roomId}`);
            }
            return true;
        } catch (error) {
            console.error(`Failed to delete room ${roomId}:`, error);
            return false;
        }
    }

    /**
     * Get list of saved rooms
     */
    getSavedRooms() {
        try {
            const files = fs.readdirSync(this.dataDir);
            return files
                .filter(f => f.endsWith('.json'))
                .map(f => {
                    try {
                        const data = JSON.parse(fs.readFileSync(path.join(this.dataDir, f), 'utf8'));
                        return {
                            id: data.roomId,
                            strokeCount: data.strokeCount || 0,
                            savedAt: data.savedAt
                        };
                    } catch {
                        return null;
                    }
                })
                .filter(r => r !== null);
        } catch (error) {
            return [];
        }
    }

    /**
     * Auto-save with debounce (save after changes settle)
     */
    scheduleSave(roomId, strokes, delay = 2000) {
        // Clear existing timeout for this room
        if (this.saveTimeouts && this.saveTimeouts[roomId]) {
            clearTimeout(this.saveTimeouts[roomId]);
        }

        if (!this.saveTimeouts) {
            this.saveTimeouts = {};
        }

        // Schedule new save
        this.saveTimeouts[roomId] = setTimeout(() => {
            this.saveRoom(roomId, strokes);
            delete this.saveTimeouts[roomId];
        }, delay);
    }
}

module.exports = { PersistenceManager };

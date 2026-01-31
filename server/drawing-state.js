/**
 * Drawing State Manager - Handles canvas state and operation history
 * Manages strokes, undo/redo operations, and state synchronization
 */

const { v4: uuidv4 } = require('uuid');

class DrawingState {
    constructor() {
        // Map of roomId -> room drawing state
        this.rooms = new Map();
    }

    /**
     * Initialize drawing state for a room
     * @param {string} roomId - Room identifier
     */
    initRoom(roomId) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, {
                // All completed strokes (active ones)
                strokes: [],
                // Currently active (in-progress) strokes by user
                activeStrokes: new Map(),
                // Undo stack per user (stores stroke IDs)
                undoStack: new Map(),
                // Redo stack per user (stores stroke objects)
                redoStack: new Map()
            });
        }
    }

    /**
     * Get room state, creating if necessary
     * @param {string} roomId - Room identifier
     * @returns {Object} Room state
     */
    getRoom(roomId) {
        this.initRoom(roomId);
        return this.rooms.get(roomId);
    }

    /**
     * Start a new stroke
     * @param {string} roomId - Room identifier
     * @param {string} userId - User socket ID
     * @param {Object} data - Stroke initial data
     * @returns {Object} Created stroke object
     */
    startStroke(roomId, userId, data) {
        const room = this.getRoom(roomId);

        const stroke = {
            id: data.strokeId || uuidv4(),
            userId: userId,
            tool: data.tool || 'brush',
            color: data.color || '#000000',
            width: data.width || 3,
            points: [{ x: data.x, y: data.y }],
            timestamp: Date.now(),
            completed: false
        };

        // Store as active stroke
        room.activeStrokes.set(userId, stroke);

        return stroke;
    }

    /**
     * Add points to an active stroke
     * @param {string} roomId - Room identifier
     * @param {string} userId - User socket ID
     * @param {Array} points - Array of {x, y} points
     */
    addPoints(roomId, userId, points) {
        const room = this.getRoom(roomId);
        const stroke = room.activeStrokes.get(userId);

        if (stroke && points && points.length > 0) {
            stroke.points.push(...points);
        }
    }

    /**
     * Complete a stroke
     * @param {string} roomId - Room identifier
     * @param {string} userId - User socket ID
     * @param {string} strokeId - Stroke identifier
     */
    endStroke(roomId, userId, strokeId) {
        const room = this.getRoom(roomId);
        const stroke = room.activeStrokes.get(userId);

        if (stroke) {
            stroke.completed = true;

            // Move from active to completed strokes
            room.strokes.push(stroke);
            room.activeStrokes.delete(userId);

            // Add to user's undo stack
            if (!room.undoStack.has(userId)) {
                room.undoStack.set(userId, []);
            }
            room.undoStack.get(userId).push(stroke.id);

            // Clear redo stack when new stroke is made
            room.redoStack.set(userId, []);
        }
    }

    /**
     * Get all strokes for a room (completed only)
     * @param {string} roomId - Room identifier
     * @returns {Array} Array of stroke objects
     */
    getStrokes(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return [];
        return room.strokes;
    }

    /**
     * Set strokes for a room (for loading from persistence)
     * @param {string} roomId - Room identifier
     * @param {Array} strokes - Array of stroke objects
     */
    setStrokes(roomId, strokes) {
        const room = this.getRoom(roomId);
        room.strokes = strokes || [];
    }

    /**
     * Undo last stroke by user
     * @param {string} roomId - Room identifier
     * @param {string} userId - User socket ID
     * @returns {Object} Result with success flag
     */
    undo(roomId, userId) {
        const room = this.getRoom(roomId);

        // Get user's undo stack
        const userUndoStack = room.undoStack.get(userId);
        if (!userUndoStack || userUndoStack.length === 0) {
            return { success: false, reason: 'Nothing to undo' };
        }

        // Get the last stroke ID from user's undo stack
        const strokeId = userUndoStack.pop();

        // Find and remove the stroke from strokes array
        const strokeIndex = room.strokes.findIndex(s => s.id === strokeId);
        if (strokeIndex === -1) {
            return { success: false, reason: 'Stroke not found' };
        }

        // Remove stroke and add to redo stack
        const [stroke] = room.strokes.splice(strokeIndex, 1);

        if (!room.redoStack.has(userId)) {
            room.redoStack.set(userId, []);
        }
        room.redoStack.get(userId).push(stroke);

        return { success: true, strokeId: strokeId };
    }

    /**
     * Redo last undone stroke by user
     * @param {string} roomId - Room identifier
     * @param {string} userId - User socket ID
     * @returns {Object} Result with success flag
     */
    redo(roomId, userId) {
        const room = this.getRoom(roomId);

        // Get user's redo stack
        const userRedoStack = room.redoStack.get(userId);
        if (!userRedoStack || userRedoStack.length === 0) {
            return { success: false, reason: 'Nothing to redo' };
        }

        // Get the last stroke from redo stack
        const stroke = userRedoStack.pop();

        // Add back to strokes array
        room.strokes.push(stroke);

        // Add back to undo stack
        if (!room.undoStack.has(userId)) {
            room.undoStack.set(userId, []);
        }
        room.undoStack.get(userId).push(stroke.id);

        return { success: true, strokeId: stroke.id };
    }

    /**
     * Clear all strokes in a room
     * @param {string} roomId - Room identifier
     */
    clearRoom(roomId) {
        const room = this.getRoom(roomId);
        room.strokes = [];
        room.activeStrokes.clear();
        room.undoStack.clear();
        room.redoStack.clear();
    }

    /**
     * Delete a room entirely
     * @param {string} roomId - Room identifier
     */
    deleteRoom(roomId) {
        this.rooms.delete(roomId);
    }

    /**
     * Get room statistics
     * @param {string} roomId - Room identifier
     * @returns {Object} Room stats
     */
    getRoomStats(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) {
            return { strokeCount: 0, activeStrokes: 0 };
        }
        return {
            strokeCount: room.strokes.length,
            activeStrokes: room.activeStrokes.size
        };
    }
}

module.exports = DrawingState;

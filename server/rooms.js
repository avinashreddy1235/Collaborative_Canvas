/**
 * Room Manager - Handles room creation and user management
 * Each room represents an isolated collaborative canvas
 */

const { v4: uuidv4 } = require('uuid');

// Predefined color palette for user identification
const USER_COLORS = [
    '#FF6B6B', // Coral Red
    '#4ECDC4', // Teal
    '#45B7D1', // Sky Blue
    '#96CEB4', // Sage Green
    '#FFEAA7', // Soft Yellow
    '#DDA0DD', // Plum
    '#98D8C8', // Mint
    '#F7DC6F', // Gold
    '#BB8FCE', // Lavender
    '#85C1E9', // Light Blue
    '#F8B500', // Amber
    '#00CED1', // Dark Cyan
];

class RoomManager {
    constructor() {
        // Map of roomId -> room data
        this.rooms = new Map();
    }

    /**
     * Create a new room or get existing room
     * @param {string} roomId - Room identifier
     * @returns {Object} Room object
     */
    createRoom(roomId) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, {
                id: roomId,
                users: new Map(),
                createdAt: Date.now(),
                colorIndex: 0
            });
        }
        return this.rooms.get(roomId);
    }

    /**
     * Add a user to a room
     * @param {string} roomId - Room identifier
     * @param {string} socketId - Socket connection ID
     * @param {string} username - Display name
     * @returns {Object} User object with assigned color
     */
    addUser(roomId, socketId, username) {
        const room = this.createRoom(roomId);

        // Assign a color from the palette
        const color = USER_COLORS[room.colorIndex % USER_COLORS.length];
        room.colorIndex++;

        const user = {
            id: socketId,
            username: username || `User ${room.users.size + 1}`,
            color: color,
            joinedAt: Date.now()
        };

        room.users.set(socketId, user);
        return user;
    }

    /**
     * Remove a user from a room
     * @param {string} roomId - Room identifier
     * @param {string} socketId - Socket connection ID
     */
    removeUser(roomId, socketId) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.users.delete(socketId);
        }
    }

    /**
     * Get all users in a room
     * @param {string} roomId - Room identifier
     * @returns {Array} Array of user objects
     */
    getUsers(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return [];
        return Array.from(room.users.values());
    }

    /**
     * Get a specific user
     * @param {string} roomId - Room identifier
     * @param {string} socketId - Socket connection ID
     * @returns {Object|null} User object or null
     */
    getUser(roomId, socketId) {
        const room = this.rooms.get(roomId);
        if (!room) return null;
        return room.users.get(socketId) || null;
    }

    /**
     * Check if a room is empty
     * @param {string} roomId - Room identifier
     * @returns {boolean}
     */
    isRoomEmpty(roomId) {
        const room = this.rooms.get(roomId);
        return !room || room.users.size === 0;
    }

    /**
     * Delete a room
     * @param {string} roomId - Room identifier
     */
    deleteRoom(roomId) {
        this.rooms.delete(roomId);
    }

    /**
     * Get list of all active rooms with user counts
     * @returns {Array} Array of room info objects
     */
    getRoomsList() {
        const roomsList = [];
        for (const [id, room] of this.rooms) {
            roomsList.push({
                id: id,
                userCount: room.users.size,
                createdAt: room.createdAt
            });
        }
        return roomsList;
    }

    /**
     * Generate a unique room ID
     * @returns {string} New room ID
     */
    generateRoomId() {
        return uuidv4().substring(0, 8);
    }
}

module.exports = RoomManager;

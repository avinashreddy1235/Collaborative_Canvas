/**
 * Main Server - Express + Socket.io WebSocket Server
 * Handles HTTP requests and real-time WebSocket connections
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const RoomManager = require('./rooms');
const DrawingState = require('./drawing-state');
const { PersistenceManager } = require('./persistence');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS configuration for development
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// CORS middleware for API endpoints (needed for Netlify frontend)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// Initialize managers
const roomManager = new RoomManager();
const drawingState = new DrawingState();
const persistence = new PersistenceManager();

// Performance metrics tracking
const metrics = {
    serverStartTime: Date.now(),
    totalConnections: 0,
    totalStrokes: 0,
    strokesPerMinute: [],
    lastMinuteStrokes: 0
};

// Track strokes per minute
setInterval(() => {
    metrics.strokesPerMinute.push(metrics.lastMinuteStrokes);
    if (metrics.strokesPerMinute.length > 60) {
        metrics.strokesPerMinute.shift(); // Keep last 60 minutes
    }
    metrics.lastMinuteStrokes = 0;
}, 60000);

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    metrics.totalConnections++;

    // Handle ping for latency measurement
    socket.on('ping-request', (timestamp) => {
        socket.emit('ping-response', timestamp);
    });

    // Handle room joining
    socket.on('join-room', (data) => {
        const { roomId, username } = data;

        // Join the socket.io room
        socket.join(roomId);

        // Add user to room manager
        const user = roomManager.addUser(roomId, socket.id, username);

        // Initialize room state (or load from persistence)
        drawingState.initRoom(roomId);

        // Try to load persisted strokes if room is new
        const roomStrokes = drawingState.getStrokes(roomId);
        if (roomStrokes.length === 0) {
            const savedStrokes = persistence.loadRoom(roomId);
            if (savedStrokes && savedStrokes.length > 0) {
                drawingState.setStrokes(roomId, savedStrokes);
                console.log(`Loaded ${savedStrokes.length} persisted strokes for room ${roomId}`);
            }
        }

        // Send current state to new user
        socket.emit('state-sync', {
            strokes: drawingState.getStrokes(roomId),
            users: roomManager.getUsers(roomId),
            userId: socket.id,
            userColor: user.color
        });

        // Notify others in room
        socket.to(roomId).emit('user-joined', {
            userId: socket.id,
            username: user.username,
            color: user.color
        });

        // Store room reference on socket
        socket.roomId = roomId;

        console.log(`${username} joined room: ${roomId}`);
    });

    // Handle drawing start
    socket.on('draw-start', (data) => {
        const { roomId } = socket;
        if (!roomId) return;

        const stroke = drawingState.startStroke(roomId, socket.id, data);

        // Broadcast to others in room
        socket.to(roomId).emit('stroke-start', {
            userId: socket.id,
            stroke: stroke
        });
    });

    // Handle drawing move (continuous points)
    socket.on('draw-move', (data) => {
        const { roomId } = socket;
        if (!roomId) return;

        drawingState.addPoints(roomId, socket.id, data.points);

        // Broadcast to others in room
        socket.to(roomId).emit('stroke-move', {
            userId: socket.id,
            strokeId: data.strokeId,
            points: data.points
        });
    });

    // Handle drawing end
    socket.on('draw-end', (data) => {
        const { roomId } = socket;
        if (!roomId) return;

        drawingState.endStroke(roomId, socket.id, data.strokeId);

        // Track metrics
        metrics.totalStrokes++;
        metrics.lastMinuteStrokes++;

        // Auto-save to persistence (debounced)
        persistence.scheduleSave(roomId, drawingState.getStrokes(roomId));

        // Broadcast to others in room
        socket.to(roomId).emit('stroke-end', {
            userId: socket.id,
            strokeId: data.strokeId
        });
    });

    // Handle cursor movement
    socket.on('cursor-move', (data) => {
        const { roomId } = socket;
        if (!roomId) return;

        // Broadcast cursor position to others
        socket.to(roomId).emit('cursor-update', {
            userId: socket.id,
            x: data.x,
            y: data.y
        });
    });

    // Handle undo operation
    socket.on('undo', () => {
        const { roomId } = socket;
        if (!roomId) return;

        const result = drawingState.undo(roomId, socket.id);

        if (result.success) {
            // Broadcast undo to all users in room (including sender)
            io.to(roomId).emit('undo-performed', {
                userId: socket.id,
                strokes: drawingState.getStrokes(roomId)
            });
        }
    });

    // Handle redo operation
    socket.on('redo', () => {
        const { roomId } = socket;
        if (!roomId) return;

        const result = drawingState.redo(roomId, socket.id);

        if (result.success) {
            // Broadcast redo to all users in room (including sender)
            io.to(roomId).emit('redo-performed', {
                userId: socket.id,
                strokes: drawingState.getStrokes(roomId)
            });
        }
    });

    // Handle clear canvas
    socket.on('clear-canvas', () => {
        const { roomId } = socket;
        if (!roomId) return;

        drawingState.clearRoom(roomId);

        // Broadcast clear to all users in room
        io.to(roomId).emit('canvas-cleared', {
            userId: socket.id
        });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const { roomId } = socket;

        if (roomId) {
            // Remove user from room
            roomManager.removeUser(roomId, socket.id);

            // Notify others in room
            socket.to(roomId).emit('user-left', {
                userId: socket.id
            });

            // Save and clean up empty rooms
            if (roomManager.isRoomEmpty(roomId)) {
                // Save final state before deleting
                const strokes = drawingState.getStrokes(roomId);
                if (strokes.length > 0) {
                    persistence.saveRoom(roomId, strokes);
                }
                drawingState.deleteRoom(roomId);
                roomManager.deleteRoom(roomId);
                console.log(`Room ${roomId} saved and cleared from memory`);
            }
        }

        console.log(`User disconnected: ${socket.id}`);
    });
});

// API endpoint to get active rooms
app.get('/api/rooms', (req, res) => {
    res.json(roomManager.getRoomsList());
});

// API endpoint for performance metrics
app.get('/api/metrics', (req, res) => {
    const activeRooms = roomManager.getRoomsList();
    const totalUsers = activeRooms.reduce((sum, r) => sum + r.userCount, 0);

    res.json({
        uptime: Math.floor((Date.now() - metrics.serverStartTime) / 1000),
        totalConnections: metrics.totalConnections,
        activeUsers: totalUsers,
        activeRooms: activeRooms.length,
        totalStrokes: metrics.totalStrokes,
        strokesLastMinute: metrics.lastMinuteStrokes,
        avgStrokesPerMinute: metrics.strokesPerMinute.length > 0
            ? Math.round(metrics.strokesPerMinute.reduce((a, b) => a + b, 0) / metrics.strokesPerMinute.length)
            : 0
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});

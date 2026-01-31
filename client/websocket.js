/**
 * WebSocket Client
 * Handles real-time communication with the server
 * Manages connection, reconnection, and message handling
 */

class WebSocketClient {
    constructor() {
        this.socket = null;
        this.roomId = null;
        this.userId = null;
        this.username = null;
        this.userColor = null;
        this.isConnected = false;

        // Callbacks
        this.onConnected = null;
        this.onDisconnected = null;
        this.onUserJoined = null;
        this.onUserLeft = null;
        this.onStateSync = null;
        this.onStrokeStart = null;
        this.onStrokeMove = null;
        this.onStrokeEnd = null;
        this.onCursorUpdate = null;
        this.onUndoPerformed = null;
        this.onRedoPerformed = null;
        this.onCanvasCleared = null;
        this.onLatencyUpdate = null;

        // Cursor throttling
        this.lastCursorEmit = 0;
        this.CURSOR_THROTTLE = 50; // ms

        // Latency tracking
        this.latency = 0;
        this.pingInterval = null;
    }

    /**
     * Connect to server and join room
     */
    connect(roomId, username) {
        return new Promise((resolve, reject) => {
            try {
                // Get backend URL from config (empty = same origin)
                const backendUrl = window.CONFIG?.BACKEND_URL || '';

                // Connect to Socket.io server
                this.socket = io(backendUrl, {
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionAttempts: 5,
                    reconnectionDelay: 1000
                });

                this.roomId = roomId;
                this.username = username;

                // Connection established
                this.socket.on('connect', () => {
                    console.log('Connected to server');
                    this.isConnected = true;

                    // Join the room
                    this.socket.emit('join-room', {
                        roomId: roomId,
                        username: username
                    });
                });

                // State sync (received after joining)
                this.socket.on('state-sync', (data) => {
                    this.userId = data.userId;
                    this.userColor = data.userColor;

                    if (this.onStateSync) {
                        this.onStateSync(data);
                    }

                    if (this.onConnected) {
                        this.onConnected();
                    }

                    // Start ping interval for latency measurement
                    this.startPingInterval();

                    resolve(data);
                });

                // Ping response for latency measurement
                this.socket.on('ping-response', (timestamp) => {
                    this.latency = Date.now() - timestamp;
                    if (this.onLatencyUpdate) {
                        this.onLatencyUpdate(this.latency);
                    }
                });

                // User events
                this.socket.on('user-joined', (data) => {
                    if (this.onUserJoined) {
                        this.onUserJoined(data);
                    }
                });

                this.socket.on('user-left', (data) => {
                    if (this.onUserLeft) {
                        this.onUserLeft(data);
                    }
                });

                // Drawing events from others
                this.socket.on('stroke-start', (data) => {
                    if (this.onStrokeStart) {
                        this.onStrokeStart(data);
                    }
                });

                this.socket.on('stroke-move', (data) => {
                    if (this.onStrokeMove) {
                        this.onStrokeMove(data);
                    }
                });

                this.socket.on('stroke-end', (data) => {
                    if (this.onStrokeEnd) {
                        this.onStrokeEnd(data);
                    }
                });

                // Cursor updates
                this.socket.on('cursor-update', (data) => {
                    if (this.onCursorUpdate) {
                        this.onCursorUpdate(data);
                    }
                });

                // Undo/Redo events
                this.socket.on('undo-performed', (data) => {
                    if (this.onUndoPerformed) {
                        this.onUndoPerformed(data);
                    }
                });

                this.socket.on('redo-performed', (data) => {
                    if (this.onRedoPerformed) {
                        this.onRedoPerformed(data);
                    }
                });

                // Canvas cleared
                this.socket.on('canvas-cleared', (data) => {
                    if (this.onCanvasCleared) {
                        this.onCanvasCleared(data);
                    }
                });

                // Disconnection
                this.socket.on('disconnect', () => {
                    console.log('Disconnected from server');
                    this.isConnected = false;

                    if (this.onDisconnected) {
                        this.onDisconnected();
                    }
                });

                // Connection error
                this.socket.on('connect_error', (error) => {
                    console.error('Connection error:', error);
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        this.stopPingInterval();
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.isConnected = false;
        this.roomId = null;
        this.userId = null;
    }

    /**
     * Emit stroke start event
     */
    emitStrokeStart(data) {
        if (!this.isConnected) return;

        this.socket.emit('draw-start', {
            strokeId: data.strokeId,
            x: data.x,
            y: data.y,
            tool: data.tool,
            color: data.color,
            width: data.width
        });
    }

    /**
     * Emit stroke move event (points batch)
     */
    emitStrokeMove(data) {
        if (!this.isConnected) return;

        this.socket.emit('draw-move', {
            strokeId: data.strokeId,
            points: data.points
        });
    }

    /**
     * Emit stroke end event
     */
    emitStrokeEnd(data) {
        if (!this.isConnected) return;

        this.socket.emit('draw-end', {
            strokeId: data.strokeId
        });
    }

    /**
     * Emit cursor position (throttled)
     */
    emitCursorMove(x, y) {
        if (!this.isConnected) return;

        const now = Date.now();
        if (now - this.lastCursorEmit < this.CURSOR_THROTTLE) return;

        this.lastCursorEmit = now;
        this.socket.emit('cursor-move', { x, y });
    }

    /**
     * Emit undo request
     */
    emitUndo() {
        if (!this.isConnected) return;
        this.socket.emit('undo');
    }

    /**
     * Emit redo request
     */
    emitRedo() {
        if (!this.isConnected) return;
        this.socket.emit('redo');
    }

    /**
     * Emit clear canvas request
     */
    emitClearCanvas() {
        if (!this.isConnected) return;
        this.socket.emit('clear-canvas');
    }

    /**
     * Get current user ID
     */
    getUserId() {
        return this.userId;
    }

    /**
     * Get current user color
     */
    getUserColor() {
        return this.userColor;
    }

    /**
     * Get room ID
     */
    getRoomId() {
        return this.roomId;
    }

    /**
     * Check connection status
     */
    getIsConnected() {
        return this.isConnected;
    }

    /**
     * Start ping interval for latency measurement
     */
    startPingInterval() {
        this.stopPingInterval(); // Clear existing
        this.pingInterval = setInterval(() => {
            if (this.isConnected && this.socket) {
                this.socket.emit('ping-request', Date.now());
            }
        }, 3000); // Ping every 3 seconds
    }

    /**
     * Stop ping interval
     */
    stopPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    /**
     * Get current latency
     */
    getLatency() {
        return this.latency;
    }
}

// Export for use in other modules
window.WebSocketClient = WebSocketClient;

/**
 * Main Application
 * Coordinates between Canvas Engine, WebSocket Client, and UI
 */

class App {
    constructor() {
        // Core modules
        this.canvas = null;
        this.ws = null;

        // State
        this.users = new Map();
        this.remoteCursors = new Map();

        // UI Elements
        this.elements = {};

        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    /**
     * Initialize the application
     */
    init() {
        this.cacheElements();
        this.bindUIEvents();
        this.loadActiveRooms();

        console.log('Collaborative Canvas initialized');
    }

    /**
     * Cache DOM elements for quick access
     */
    cacheElements() {
        this.elements = {
            // Screens
            landingScreen: document.getElementById('landing-screen'),
            canvasScreen: document.getElementById('canvas-screen'),

            // Landing inputs
            usernameInput: document.getElementById('username-input'),
            roomCodeInput: document.getElementById('room-code-input'),
            createRoomBtn: document.getElementById('create-room-btn'),
            joinRoomBtn: document.getElementById('join-room-btn'),
            activeRoomsSection: document.getElementById('active-rooms-section'),
            roomsList: document.getElementById('rooms-list'),

            // Canvas screen
            canvas: document.getElementById('drawing-canvas'),
            roomIdDisplay: document.getElementById('room-id-display'),
            copyRoomBtn: document.getElementById('copy-room-btn'),
            leaveRoomBtn: document.getElementById('leave-room-btn'),
            connectionStatus: document.getElementById('connection-status'),

            // Toolbar
            toolButtons: document.querySelectorAll('.tool-btn'),
            colorPicker: document.getElementById('color-picker'),
            colorPresets: document.querySelectorAll('.color-preset'),
            strokeWidth: document.getElementById('stroke-width'),
            sizeValue: document.getElementById('size-value'),
            undoBtn: document.getElementById('undo-btn'),
            redoBtn: document.getElementById('redo-btn'),
            clearBtn: document.getElementById('clear-btn'),

            // Users sidebar
            usersList: document.getElementById('users-list'),
            userCount: document.getElementById('user-count'),

            // Cursors
            cursorsContainer: document.getElementById('cursors-container'),

            // Toast
            toastContainer: document.getElementById('toast-container'),

            // Metrics
            metricLatency: document.getElementById('metric-latency'),
            metricStrokes: document.getElementById('metric-strokes'),
            metricUptime: document.getElementById('metric-uptime')
        };
    }

    /**
     * Bind UI event handlers
     */
    bindUIEvents() {
        // Landing screen events
        this.elements.createRoomBtn.addEventListener('click', () => this.createRoom());
        this.elements.joinRoomBtn.addEventListener('click', () => this.joinRoom());

        // Enter key handling
        this.elements.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.elements.roomCodeInput.focus();
        });

        this.elements.roomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });

        // Canvas screen events
        this.elements.leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
        this.elements.copyRoomBtn.addEventListener('click', () => this.copyRoomCode());

        // Tool selection
        this.elements.toolButtons.forEach(btn => {
            btn.addEventListener('click', () => this.selectTool(btn.dataset.tool));
        });

        // Color picker
        this.elements.colorPicker.addEventListener('input', (e) => {
            this.setColor(e.target.value);
        });

        // Color presets
        this.elements.colorPresets.forEach(preset => {
            preset.addEventListener('click', () => {
                this.setColor(preset.dataset.color);
                this.elements.colorPicker.value = preset.dataset.color;
            });
        });

        // Stroke width
        this.elements.strokeWidth.addEventListener('input', (e) => {
            this.setStrokeWidth(e.target.value);
        });

        // Action buttons
        this.elements.undoBtn.addEventListener('click', () => this.undo());
        this.elements.redoBtn.addEventListener('click', () => this.redo());
        this.elements.clearBtn.addEventListener('click', () => this.clearCanvas());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    /**
     * Load and display active rooms
     */
    async loadActiveRooms() {
        try {
            const backendUrl = window.CONFIG?.BACKEND_URL || '';
            const response = await fetch(`${backendUrl}/api/rooms`);
            const rooms = await response.json();

            if (rooms.length > 0) {
                this.elements.activeRoomsSection.style.display = 'block';
                this.elements.roomsList.innerHTML = rooms.map(room => `
                    <div class="room-item" data-room="${room.id}">
                        ${room.id} (${room.userCount} users)
                    </div>
                `).join('');

                // Bind click events
                this.elements.roomsList.querySelectorAll('.room-item').forEach(item => {
                    item.addEventListener('click', () => {
                        this.elements.roomCodeInput.value = item.dataset.room;
                        this.joinRoom();
                    });
                });
            }
        } catch (error) {
            console.log('Could not load active rooms');
        }
    }

    /**
     * Create a new room
     */
    createRoom() {
        const username = this.elements.usernameInput.value.trim() || 'Anonymous';
        const roomId = this.generateRoomId();

        this.connectToRoom(roomId, username);
    }

    /**
     * Join an existing room
     */
    joinRoom() {
        const username = this.elements.usernameInput.value.trim() || 'Anonymous';
        const roomId = this.elements.roomCodeInput.value.trim().toUpperCase();

        if (!roomId) {
            this.showToast('Please enter a room code', 'error');
            return;
        }

        this.connectToRoom(roomId, username);
    }

    /**
     * Connect to a room
     */
    async connectToRoom(roomId, username) {
        try {
            // Initialize WebSocket client
            this.ws = new WebSocketClient();

            // Set up WebSocket callbacks
            this.setupWebSocketCallbacks();

            // Connect
            await this.ws.connect(roomId, username);

            // Switch to canvas screen FIRST (so canvas container has dimensions)
            this.showCanvasScreen(roomId);

            // Initialize canvas AFTER screen is visible
            // Use a small delay to ensure DOM has updated
            setTimeout(() => {
                this.initCanvas();

                // Set user info from WebSocket
                if (this.canvas && this.ws) {
                    this.canvas.setUserId(this.ws.getUserId());
                    this.canvas.setUserColor(this.ws.getUserColor());
                }
            }, 50);

            this.showToast(`Joined room ${roomId}`, 'success');

            // Start fetching metrics
            this.startMetricsInterval();

        } catch (error) {
            console.error('Failed to connect:', error);
            this.showToast('Failed to connect to room', 'error');
        }
    }

    /**
     * Setup WebSocket event callbacks
     */
    setupWebSocketCallbacks() {
        // Connection events
        this.ws.onConnected = () => {
            this.updateConnectionStatus(true);
        };

        this.ws.onDisconnected = () => {
            this.updateConnectionStatus(false);
        };

        // State sync (initial state when joining)
        this.ws.onStateSync = (data) => {
            // Set canvas strokes
            if (this.canvas) {
                this.canvas.setUserId(data.userId);
                this.canvas.setUserColor(data.userColor);
                this.canvas.setStrokes(data.strokes);
            }

            // Update users list
            this.users.clear();
            data.users.forEach(user => {
                this.users.set(user.id, user);
            });
            this.updateUsersList();
        };

        // User events
        this.ws.onUserJoined = (data) => {
            this.users.set(data.userId, {
                id: data.userId,
                username: data.username,
                color: data.color
            });
            this.updateUsersList();
            this.showToast(`${data.username} joined`, 'info');
        };

        this.ws.onUserLeft = (data) => {
            const user = this.users.get(data.userId);
            if (user) {
                this.showToast(`${user.username} left`, 'info');
            }
            this.users.delete(data.userId);
            this.removeRemoteCursor(data.userId);
            this.updateUsersList();
        };

        // Drawing events
        this.ws.onStrokeStart = (data) => {
            if (this.canvas) {
                this.canvas.handleRemoteStrokeStart(data.userId, data.stroke);
            }
        };

        this.ws.onStrokeMove = (data) => {
            if (this.canvas) {
                this.canvas.handleRemoteStrokeMove(data.userId, data.strokeId, data.points);
            }
        };

        this.ws.onStrokeEnd = (data) => {
            if (this.canvas) {
                this.canvas.handleRemoteStrokeEnd(data.userId, data.strokeId);
            }
        };

        // Cursor updates
        this.ws.onCursorUpdate = (data) => {
            this.updateRemoteCursor(data.userId, data.x, data.y);
        };

        // Undo/Redo
        this.ws.onUndoPerformed = (data) => {
            if (this.canvas) {
                this.canvas.setStrokes(data.strokes);
            }
        };

        this.ws.onRedoPerformed = (data) => {
            if (this.canvas) {
                this.canvas.setStrokes(data.strokes);
            }
        };

        // Canvas cleared
        this.ws.onCanvasCleared = (data) => {
            if (this.canvas) {
                this.canvas.clearCanvas();
            }
            this.showToast('Canvas cleared', 'info');
        };

        // Latency update
        this.ws.onLatencyUpdate = (latency) => {
            this.updateMetrics({ latency });
        };
    }

    /**
     * Initialize canvas engine
     */
    initCanvas() {
        this.canvas = new CanvasEngine(this.elements.canvas);

        // Set up canvas callbacks
        this.canvas.onStrokeStart = (data) => {
            this.ws.emitStrokeStart(data);
        };

        this.canvas.onStrokeMove = (data) => {
            this.ws.emitStrokeMove(data);
        };

        this.canvas.onStrokeEnd = (data) => {
            this.ws.emitStrokeEnd(data);
        };

        this.canvas.onCursorMove = (x, y) => {
            this.ws.emitCursorMove(x, y);
        };

        // Set initial values
        this.canvas.setStrokeWidth(this.elements.strokeWidth.value);
        this.canvas.setColor(this.elements.colorPicker.value);
    }

    /**
     * Show canvas screen
     */
    showCanvasScreen(roomId) {
        this.elements.landingScreen.classList.remove('active');
        this.elements.canvasScreen.classList.add('active');
        this.elements.roomIdDisplay.textContent = roomId;

        // Trigger canvas resize
        setTimeout(() => {
            if (this.canvas) {
                this.canvas.resizeCanvas();
            }
        }, 100);
    }

    /**
     * Leave current room
     */
    leaveRoom() {
        if (this.ws) {
            this.ws.disconnect();
            this.ws = null;
        }

        this.canvas = null;
        this.users.clear();
        this.clearRemoteCursors();

        // Switch back to landing screen
        this.elements.canvasScreen.classList.remove('active');
        this.elements.landingScreen.classList.add('active');

        // Refresh active rooms list
        this.loadActiveRooms();
    }

    /**
     * Copy room code to clipboard
     */
    async copyRoomCode() {
        const roomId = this.elements.roomIdDisplay.textContent;
        try {
            await navigator.clipboard.writeText(roomId);
            this.showToast('Room code copied!', 'success');
        } catch (error) {
            // Fallback
            this.showToast(`Room code: ${roomId}`, 'info');
        }
    }

    /**
     * Select a tool
     */
    selectTool(tool) {
        // Update UI
        this.elements.toolButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });

        // Update canvas
        if (this.canvas) {
            this.canvas.setTool(tool);
        }
    }

    /**
     * Set drawing color
     */
    setColor(color) {
        if (this.canvas) {
            this.canvas.setColor(color);
        }

        // Update presets active state
        this.elements.colorPresets.forEach(preset => {
            preset.classList.toggle('active', preset.dataset.color === color);
        });
    }

    /**
     * Set stroke width
     */
    setStrokeWidth(width) {
        this.elements.sizeValue.textContent = width;
        if (this.canvas) {
            this.canvas.setStrokeWidth(width);
        }
    }

    /**
     * Undo last action
     */
    undo() {
        if (this.ws) {
            this.ws.emitUndo();
        }
    }

    /**
     * Redo last undone action
     */
    redo() {
        if (this.ws) {
            this.ws.emitRedo();
        }
    }

    /**
     * Clear canvas
     */
    clearCanvas() {
        if (confirm('Are you sure you want to clear the canvas?')) {
            if (this.ws) {
                this.ws.emitClearCanvas();
            }
        }
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyboard(e) {
        // Only handle when on canvas screen
        if (!this.elements.canvasScreen.classList.contains('active')) return;

        // Undo: Ctrl+Z
        if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            this.undo();
        }

        // Redo: Ctrl+Y or Ctrl+Shift+Z
        if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
            e.preventDefault();
            this.redo();
        }

        // Tool shortcuts
        if (e.key === 'b' || e.key === 'B') {
            this.selectTool('brush');
        }
        if (e.key === 'e' || e.key === 'E') {
            this.selectTool('eraser');
        }
    }

    /**
     * Update users list in sidebar
     */
    updateUsersList() {
        const myId = this.ws?.getUserId();

        let html = '';
        this.users.forEach(user => {
            const isMe = user.id === myId;
            html += `
                <li class="user-item ${isMe ? 'is-you' : ''}">
                    <span class="user-color-dot" style="background: ${user.color}"></span>
                    <span class="user-name">${user.username}</span>
                    ${isMe ? '<span class="user-you-badge">(You)</span>' : ''}
                </li>
            `;
        });

        this.elements.usersList.innerHTML = html;
        this.elements.userCount.textContent = this.users.size;
    }

    /**
     * Update connection status indicator
     */
    updateConnectionStatus(connected) {
        const statusEl = this.elements.connectionStatus;
        const textEl = statusEl.querySelector('.status-text');

        if (connected) {
            statusEl.classList.remove('disconnected');
            textEl.textContent = 'Connected';
        } else {
            statusEl.classList.add('disconnected');
            textEl.textContent = 'Disconnected';
        }
    }

    /**
     * Update remote cursor position
     */
    updateRemoteCursor(userId, x, y) {
        let cursorEl = this.remoteCursors.get(userId);
        const user = this.users.get(userId);

        if (!user) return;

        if (!cursorEl) {
            // Create cursor element
            cursorEl = document.createElement('div');
            cursorEl.className = 'remote-cursor';
            cursorEl.style.color = user.color;
            cursorEl.innerHTML = `
                <div class="cursor-pointer"></div>
                <div class="cursor-label"><span>${user.username}</span></div>
            `;
            this.elements.cursorsContainer.appendChild(cursorEl);
            this.remoteCursors.set(userId, cursorEl);
        }

        // Update position
        cursorEl.style.left = `${x}px`;
        cursorEl.style.top = `${y}px`;
    }

    /**
     * Remove remote cursor
     */
    removeRemoteCursor(userId) {
        const cursorEl = this.remoteCursors.get(userId);
        if (cursorEl) {
            cursorEl.remove();
            this.remoteCursors.delete(userId);
        }
    }

    /**
     * Clear all remote cursors
     */
    clearRemoteCursors() {
        this.remoteCursors.forEach(cursorEl => cursorEl.remove());
        this.remoteCursors.clear();
    }

    /**
     * Generate random room ID
     */
    generateRoomId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        this.elements.toastContainer.appendChild(toast);

        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Update metrics display
     */
    updateMetrics(data) {
        if (data.latency !== undefined && this.elements.metricLatency) {
            this.elements.metricLatency.textContent = `${data.latency} ms`;
        }
        if (data.strokes !== undefined && this.elements.metricStrokes) {
            this.elements.metricStrokes.textContent = data.strokes;
        }
        if (data.uptime !== undefined && this.elements.metricUptime) {
            this.elements.metricUptime.textContent = this.formatUptime(data.uptime);
        }
    }

    /**
     * Format uptime seconds to human-readable string
     */
    formatUptime(seconds) {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    }

    /**
     * Start fetching metrics from server
     */
    startMetricsInterval() {
        this.stopMetricsInterval();
        this.fetchMetrics(); // Fetch immediately
        this.metricsInterval = setInterval(() => this.fetchMetrics(), 5000);
    }

    /**
     * Stop fetching metrics
     */
    stopMetricsInterval() {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = null;
        }
    }

    /**
     * Fetch metrics from server
     */
    async fetchMetrics() {
        try {
            const backendUrl = window.CONFIG?.BACKEND_URL || '';
            const response = await fetch(`${backendUrl}/api/metrics`);
            const data = await response.json();
            this.updateMetrics({
                strokes: data.totalStrokes,
                uptime: data.uptime
            });
        } catch (error) {
            // Silently fail
        }
    }
}

// Initialize application
const app = new App();

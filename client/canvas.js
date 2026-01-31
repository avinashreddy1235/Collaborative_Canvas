/**
 * Canvas Drawing Engine
 * Implements all canvas operations without external drawing libraries
 * Handles path rendering, smoothing, and efficient redrawing
 */

class CanvasEngine {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');

        // Drawing state
        this.isDrawing = false;
        this.currentStroke = null;
        this.currentTool = 'brush';
        this.currentColor = '#000000';
        this.strokeWidth = 5;

        // Strokes storage (for redrawing)
        this.strokes = [];

        // Active strokes from remote users (in-progress)
        this.activeRemoteStrokes = new Map();

        // Event batching for performance
        this.pointBuffer = [];
        this.batchInterval = null;
        this.BATCH_DELAY = 16; // ~60fps

        // Callbacks
        this.onStrokeStart = null;
        this.onStrokeMove = null;
        this.onStrokeEnd = null;
        this.onCursorMove = null;

        // User info
        this.userId = null;
        this.userColor = '#000000';

        // Initialize canvas
        this.setupCanvas();
        this.bindEvents();
    }

    /**
     * Setup canvas dimensions and properties
     */
    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Set default canvas properties
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    /**
     * Resize canvas to fit container
     */
    resizeCanvas() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();

        // Store current image data before resize
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

        // Set canvas size
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

        // Restore canvas properties
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Redraw all strokes
        this.redrawCanvas();
    }

    /**
     * Bind mouse and touch events
     */
    bindEvents() {
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.handlePointerDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handlePointerMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handlePointerUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.handlePointerUp(e));

        // Touch events for mobile support
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));

        // Prevent context menu on right-click
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    /**
     * Get pointer position relative to canvas
     */
    getPointerPosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    /**
     * Handle pointer down (start drawing)
     */
    handlePointerDown(e) {
        if (e.button !== 0) return; // Only left click

        this.isDrawing = true;
        const pos = this.getPointerPosition(e);

        // Generate stroke ID
        const strokeId = this.generateStrokeId();

        // Create new stroke
        this.currentStroke = {
            id: strokeId,
            userId: this.userId,
            tool: this.currentTool,
            color: this.currentTool === 'eraser' ? '#FFFFFF' : this.currentColor,
            width: this.currentTool === 'eraser' ? this.strokeWidth * 3 : this.strokeWidth,
            points: [pos]
        };

        // Draw initial point
        this.drawPoint(pos, this.currentStroke.color, this.currentStroke.width);

        // Notify listeners
        if (this.onStrokeStart) {
            this.onStrokeStart({
                strokeId: strokeId,
                x: pos.x,
                y: pos.y,
                tool: this.currentTool,
                color: this.currentStroke.color,
                width: this.currentStroke.width
            });
        }

        // Start batch interval
        this.startBatching();
    }

    /**
     * Handle pointer move (continue drawing)
     */
    handlePointerMove(e) {
        const pos = this.getPointerPosition(e);

        // Always emit cursor position
        if (this.onCursorMove) {
            this.onCursorMove(pos.x, pos.y);
        }

        if (!this.isDrawing || !this.currentStroke) return;

        // Add point to buffer for batching
        this.pointBuffer.push(pos);

        // Draw the segment immediately for local responsiveness
        const prevPoint = this.currentStroke.points[this.currentStroke.points.length - 1];
        this.drawLine(prevPoint, pos, this.currentStroke.color, this.currentStroke.width);

        // Add to current stroke
        this.currentStroke.points.push(pos);
    }

    /**
     * Handle pointer up (end drawing)
     */
    handlePointerUp(e) {
        if (!this.isDrawing) return;

        this.isDrawing = false;
        this.stopBatching();

        if (this.currentStroke && this.currentStroke.points.length > 0) {
            // Save stroke
            this.strokes.push({ ...this.currentStroke });

            // Notify listeners
            if (this.onStrokeEnd) {
                this.onStrokeEnd({
                    strokeId: this.currentStroke.id
                });
            }
        }

        this.currentStroke = null;
    }

    /**
     * Touch event handlers
     */
    handleTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.handlePointerDown({
                button: 0,
                clientX: touch.clientX,
                clientY: touch.clientY
            });
        }
    }

    handleTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.handlePointerMove({
                clientX: touch.clientX,
                clientY: touch.clientY
            });
        }
    }

    handleTouchEnd(e) {
        e.preventDefault();
        this.handlePointerUp({});
    }

    /**
     * Start point batching for network efficiency
     */
    startBatching() {
        if (this.batchInterval) return;

        this.batchInterval = setInterval(() => {
            if (this.pointBuffer.length > 0 && this.onStrokeMove) {
                this.onStrokeMove({
                    strokeId: this.currentStroke?.id,
                    points: [...this.pointBuffer]
                });
                this.pointBuffer = [];
            }
        }, this.BATCH_DELAY);
    }

    /**
     * Stop point batching
     */
    stopBatching() {
        if (this.batchInterval) {
            // Send remaining points
            if (this.pointBuffer.length > 0 && this.onStrokeMove) {
                this.onStrokeMove({
                    strokeId: this.currentStroke?.id,
                    points: [...this.pointBuffer]
                });
            }
            this.pointBuffer = [];

            clearInterval(this.batchInterval);
            this.batchInterval = null;
        }
    }

    /**
     * Draw a single point (circle)
     */
    drawPoint(pos, color, width) {
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, width / 2, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.fill();
    }

    /**
     * Draw a line between two points
     */
    drawLine(from, to, color, width) {
        this.ctx.beginPath();
        this.ctx.moveTo(from.x, from.y);
        this.ctx.lineTo(to.x, to.y);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.stroke();
    }

    /**
     * Draw a complete stroke with smooth path
     */
    drawStroke(stroke) {
        if (!stroke || !stroke.points || stroke.points.length === 0) return;

        const points = stroke.points;
        const color = stroke.color || '#000000';
        const width = stroke.width || 3;

        this.ctx.beginPath();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        if (points.length === 1) {
            // Single point - draw a dot
            this.drawPoint(points[0], color, width);
            return;
        }

        // Draw smooth path using quadratic curves
        this.ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length - 1; i++) {
            const midX = (points[i].x + points[i + 1].x) / 2;
            const midY = (points[i].y + points[i + 1].y) / 2;
            this.ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
        }

        // Last point
        if (points.length > 1) {
            const lastPoint = points[points.length - 1];
            this.ctx.lineTo(lastPoint.x, lastPoint.y);
        }

        this.ctx.stroke();
    }

    /**
     * Clear and redraw entire canvas
     */
    redrawCanvas() {
        // Clear canvas with white background
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Redraw all completed strokes
        for (const stroke of this.strokes) {
            this.drawStroke(stroke);
        }

        // Redraw active remote strokes
        for (const [userId, stroke] of this.activeRemoteStrokes) {
            this.drawStroke(stroke);
        }
    }

    /**
     * Clear canvas completely
     */
    clearCanvas() {
        this.strokes = [];
        this.activeRemoteStrokes.clear();
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Generate unique stroke ID
     */
    generateStrokeId() {
        return `${this.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // ============================================
    // Remote Stroke Handling (from other users)
    // ============================================

    /**
     * Handle remote stroke start
     */
    handleRemoteStrokeStart(userId, stroke) {
        this.activeRemoteStrokes.set(userId, {
            id: stroke.id,
            userId: userId,
            tool: stroke.tool,
            color: stroke.color,
            width: stroke.width,
            points: [{ x: stroke.points?.[0]?.x || 0, y: stroke.points?.[0]?.y || 0 }]
        });

        // Draw initial point
        const s = this.activeRemoteStrokes.get(userId);
        if (s.points[0]) {
            this.drawPoint(s.points[0], s.color, s.width);
        }
    }

    /**
     * Handle remote stroke move
     */
    handleRemoteStrokeMove(userId, strokeId, points) {
        const stroke = this.activeRemoteStrokes.get(userId);
        if (!stroke) return;

        if (points && points.length > 0) {
            // Draw new segments
            let prevPoint = stroke.points[stroke.points.length - 1];

            for (const point of points) {
                this.drawLine(prevPoint, point, stroke.color, stroke.width);
                stroke.points.push(point);
                prevPoint = point;
            }
        }
    }

    /**
     * Handle remote stroke end
     */
    handleRemoteStrokeEnd(userId, strokeId) {
        const stroke = this.activeRemoteStrokes.get(userId);
        if (stroke) {
            // Move to completed strokes
            this.strokes.push({ ...stroke });
            this.activeRemoteStrokes.delete(userId);
        }
    }

    /**
     * Set all strokes (for state sync)
     */
    setStrokes(strokes) {
        this.strokes = strokes || [];
        this.redrawCanvas();
    }

    // ============================================
    // Tool and Settings
    // ============================================

    setTool(tool) {
        this.currentTool = tool;
        this.canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
    }

    setColor(color) {
        this.currentColor = color;
    }

    setStrokeWidth(width) {
        this.strokeWidth = parseInt(width) || 5;
    }

    setUserId(userId) {
        this.userId = userId;
    }

    setUserColor(color) {
        this.userColor = color;
    }
}

// Export for use in other modules
window.CanvasEngine = CanvasEngine;

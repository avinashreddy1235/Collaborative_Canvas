# Architecture Documentation

This document explains the technical architecture, design decisions, and implementation details of the Real-Time Collaborative Drawing Canvas.

## Table of Contents
1. [System Overview](#system-overview)
2. [Data Flow Diagram](#data-flow-diagram)
3. [WebSocket Protocol](#websocket-protocol)
4. [Undo/Redo Strategy](#undoredo-strategy)
5. [Performance Optimizations](#performance-optimizations)
6. [Conflict Resolution](#conflict-resolution)
7. [Technical Decisions](#technical-decisions)

---

## System Overview

The application follows a client-server architecture with real-time bidirectional communication via WebSockets.

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT SIDE                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐     │
│  │   main.js   │◄──►│  canvas.js   │    │  websocket.js   │     │
│  │  (App UI)   │    │  (Drawing)   │◄──►│  (Network)      │     │
│  └─────────────┘    └──────────────┘    └────────┬────────┘     │
└─────────────────────────────────────────────────│───────────────┘
                                                   │ Socket.io
                                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SERVER SIDE                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐     │
│  │  server.js  │◄──►│   rooms.js   │    │ drawing-state.js│     │
│  │  (Express)  │    │ (Users)      │    │ (Canvas State)  │     │
│  └─────────────┘    └──────────────┘    └─────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Responsibility |
|-----------|---------------|
| `server.js` | HTTP server, WebSocket routing, event handling |
| `rooms.js` | Room lifecycle, user tracking, color assignment |
| `drawing-state.js` | Stroke storage, undo/redo stacks, state sync |
| `canvas.js` | Canvas API operations, path rendering, event handling |
| `websocket.js` | Socket.io client, message serialization |
| `main.js` | UI coordination, state management |

---

## Data Flow Diagram

### Drawing Flow (User A draws, User B sees)

```
User A (Drawing)                Server                    User B (Viewing)
      │                           │                             │
      │──── draw-start ──────────►│                             │
      │     {x, y, color, width}  │                             │
      │                           │──── stroke-start ──────────►│
      │                           │     {userId, stroke}        │
      │                           │                             │
      │──── draw-move ───────────►│                             │
      │     {points: [...]}       │                             │
      │                           │──── stroke-move ───────────►│
      │                           │     {userId, points}        │
      │                           │                             │
      │──── draw-end ────────────►│                             │
      │     {strokeId}            │                             │
      │                           │──── stroke-end ────────────►│
      │                           │     {userId, strokeId}      │
```

### State Synchronization (New user joins)

```
New User                         Server
    │                               │
    │──── join-room ───────────────►│
    │     {roomId, username}        │
    │                               │
    │◄──── state-sync ─────────────│
    │      {strokes[], users[],    │
    │       userId, userColor}     │
```

---

## WebSocket Protocol

### Message Types

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `join-room` | C→S | `{roomId, username}` | Join/create room |
| `state-sync` | S→C | `{strokes[], users[], userId, userColor}` | Initial state |
| `user-joined` | S→C | `{userId, username, color}` | New user notification |
| `user-left` | S→C | `{userId}` | User left notification |
| `draw-start` | C→S | `{strokeId, x, y, tool, color, width}` | Begin stroke |
| `draw-move` | C→S | `{strokeId, points: [{x, y}...]}` | Stroke points |
| `draw-end` | C→S | `{strokeId}` | Complete stroke |
| `stroke-start` | S→C | `{userId, stroke}` | Broadcast stroke start |
| `stroke-move` | S→C | `{userId, strokeId, points}` | Broadcast points |
| `stroke-end` | S→C | `{userId, strokeId}` | Broadcast completion |
| `cursor-move` | C→S | `{x, y}` | Cursor position |
| `cursor-update` | S→C | `{userId, x, y}` | Remote cursor position |
| `undo` | C→S | (none) | Undo request |
| `redo` | C→S | (none) | Redo request |
| `undo-performed` | S→C | `{userId, strokes[]}` | Undo result |
| `redo-performed` | S→C | `{userId, strokes[]}` | Redo result |
| `clear-canvas` | C→S | (none) | Clear request |
| `canvas-cleared` | S→C | `{userId}` | Clear notification |

### Stroke Object Structure

```javascript
{
    id: "user123-1706700000000-abc123",  // Unique stroke ID
    userId: "socket_id",                  // Creator's socket ID
    tool: "brush",                        // "brush" or "eraser"
    color: "#FF6B6B",                     // Hex color
    width: 5,                             // Stroke width in pixels
    points: [{x: 100, y: 200}, ...],     // Array of points
    timestamp: 1706700000000,             // Creation timestamp
    completed: true                       // Whether stroke is finished
}
```

---

## Undo/Redo Strategy

### Approach: Per-User Operation Stack

Each user has their own undo/redo stack. When a user clicks undo, only their most recent stroke is removed.

### Data Structure

```javascript
// Server-side state per room
{
    strokes: [],           // All completed strokes (Array)
    activeStrokes: Map(),  // In-progress strokes by userId
    undoStack: Map(),      // userId → [strokeId, strokeId, ...]
    redoStack: Map()       // userId → [strokeObject, strokeObject, ...]
}
```

### Undo Algorithm

```
1. User A clicks Undo
2. Server receives 'undo' event
3. Server gets User A's undoStack
4. Pop last strokeId from undoStack
5. Find stroke in strokes[] array
6. Remove stroke from strokes[]
7. Push stroke object to User A's redoStack
8. Broadcast updated strokes[] to ALL users in room
9. All clients redraw canvas from strokes[]
```

### Why This Approach?

1. **User Ownership**: Users can only undo their own work
2. **Global Visibility**: All users see the undo effect
3. **No Conflicts**: No race conditions since server is authoritative
4. **Simple State**: Only need to track stroke ownership

### Trade-offs

- ✅ Simple implementation
- ✅ Intuitive for users
- ❌ Cannot undo other users' strokes
- ❌ Full redraw required on undo (could optimize with layers)

---

## Performance Optimizations

### 1. Event Batching

Instead of sending every mouse move event, points are collected and sent in batches:

```javascript
// canvas.js
this.BATCH_DELAY = 16; // ~60fps

startBatching() {
    this.batchInterval = setInterval(() => {
        if (this.pointBuffer.length > 0) {
            this.onStrokeMove({
                strokeId: this.currentStroke.id,
                points: [...this.pointBuffer]
            });
            this.pointBuffer = [];
        }
    }, this.BATCH_DELAY);
}
```

**Why**: Reduces network traffic by ~80% while maintaining smooth drawing.

### 2. Cursor Throttling

Cursor position updates are throttled to avoid flooding:

```javascript
// websocket.js
this.CURSOR_THROTTLE = 50; // ms

emitCursorMove(x, y) {
    const now = Date.now();
    if (now - this.lastCursorEmit < this.CURSOR_THROTTLE) return;
    this.lastCursorEmit = now;
    this.socket.emit('cursor-move', { x, y });
}
```

**Why**: Cursor precision isn't critical; 20 updates/second is sufficient.

### 3. Smooth Path Rendering

Uses quadratic Bezier curves for smoother lines:

```javascript
// canvas.js - drawStroke()
for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    this.ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
}
```

**Why**: Raw point-to-point lines look jagged; curves create natural-looking strokes.

### 4. Local-First Drawing

User sees their own drawing immediately without waiting for server:

```javascript
// canvas.js - handlePointerMove()
// Draw locally first
this.drawLine(prevPoint, pos, stroke.color, stroke.width);

// Then queue for network send
this.pointBuffer.push(pos);
```

**Why**: Eliminates perceived latency for the drawing user.

---

## Conflict Resolution

### Drawing Overlap Handling

**Approach**: Last-write-wins with visual layering

When multiple users draw in overlapping areas:
1. All strokes are rendered in chronological order
2. Later strokes appear on top of earlier ones
3. No data is lost or blocked

**Why this works**:
- Drawing is additive (paint on top of paint)
- Canvas API naturally handles overlapping paths
- No need for complex locking mechanisms

### Network Disconnection Handling

```javascript
// Server handles disconnect
socket.on('disconnect', () => {
    roomManager.removeUser(roomId, socket.id);
    socket.to(roomId).emit('user-left', { userId: socket.id });
});
```

- User's completed strokes remain on canvas
- User's in-progress stroke is discarded
- Other users see user leave notification
- Reconnecting user gets fresh state via `state-sync`

---

## Technical Decisions

### Why Socket.io over Native WebSockets?

| Feature | Socket.io | Native WS |
|---------|-----------|-----------|
| Auto-reconnection | ✅ Built-in | ❌ Manual |
| Fallback to polling | ✅ Yes | ❌ No |
| Room abstraction | ✅ Built-in | ❌ Manual |
| Binary support | ✅ Easy | ✅ Easy |
| Learning curve | Lower | Higher |

**Decision**: Socket.io provides essential features out-of-the-box that would require significant code to replicate with native WebSockets.

### Why Canvas API without Libraries?

- **Control**: Full control over rendering pipeline
- **Performance**: No abstraction overhead
- **Learning**: Demonstrates understanding of fundamentals
- **Size**: Smaller bundle, faster load

### Why In-Memory State?

- **Simplicity**: No database setup required
- **Speed**: No I/O latency
- **Sufficient**: For demo purposes, persistence not critical

For production, would add Redis or PostgreSQL for:
- State persistence across restarts
- Horizontal scaling with multiple servers
- Session recovery

---

## Scaling Considerations

### Current Limitations
- Single server instance
- In-memory state
- No horizontal scaling

### Scaling to 1000+ Users

1. **Redis Adapter** for Socket.io
   ```javascript
   const { createAdapter } = require("@socket.io/redis-adapter");
   io.adapter(createAdapter(pubClient, subClient));
   ```

2. **Horizontal Scaling** with load balancer
   - Sticky sessions for WebSocket affinity
   - Redis for shared state

3. **Room Sharding**
   - Distribute rooms across server instances
   - Each server handles subset of rooms

4. **Canvas Tiling**
   - Split large canvas into smaller tiles
   - Only sync affected tiles
   - Reduce redraw area

5. **Delta Compression**
   - Send point deltas instead of absolute positions
   - Compress batched updates

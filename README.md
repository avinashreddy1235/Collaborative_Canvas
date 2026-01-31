# Real-Time Collaborative Drawing Canvas

A multi-user drawing application where multiple people can draw simultaneously on the same canvas with real-time synchronization.

![Collaborative Canvas](https://img.shields.io/badge/Status-Complete-success)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![Socket.io](https://img.shields.io/badge/Socket.io-4.7-blue)

## ✨ Features

### Core Features
- **Real-time Drawing**: See other users' drawings as they draw (not after they finish)
- **Drawing Tools**: Brush and eraser with adjustable stroke width
- **Color Picker**: Full color palette with preset colors
- **User Indicators**: See where other users are drawing with live cursors
- **Global Undo/Redo**: Each user can undo/redo their own strokes
- **User Management**: Shows who's online with assigned colors

### Bonus Features
- **Multi-Room Support**: Create or join different canvas rooms
- **Mobile Touch Support**: Draw on mobile devices
- **Copy Room Code**: Easy sharing with clipboard support

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- npm (comes with Node.js)

### Installation & Running

```bash
# Clone or navigate to the project directory
cd collaborative-canvas

# Install dependencies
npm install

# Start the server
npm start
```

The server will start at `http://localhost:3000`

### Testing with Multiple Users

1. Open `http://localhost:3000` in your browser
2. Enter your name and click "Create Room"
3. Copy the room code
4. Open another browser window/tab (or use incognito)
5. Enter a different name and paste the room code
6. Click "Join Room"
7. Both users can now draw together in real-time!

## 📁 Project Structure

```
collaborative-canvas/
├── client/
│   ├── index.html        # Main HTML structure
│   ├── style.css         # Modern dark theme styling
│   ├── canvas.js         # Canvas drawing engine
│   ├── websocket.js      # WebSocket client
│   └── main.js           # App initialization & UI
├── server/
│   ├── server.js         # Express + Socket.io server
│   ├── rooms.js          # Room management
│   └── drawing-state.js  # Canvas state & undo/redo
├── package.json
├── README.md
└── ARCHITECTURE.md
```

## 🎮 Controls

### Drawing
- **Left Click + Drag**: Draw on canvas
- **Touch + Drag**: Draw on mobile devices

### Tools & Shortcuts
- `B`: Switch to Brush
- `E`: Switch to Eraser
- `Ctrl+Z`: Undo
- `Ctrl+Y`: Redo

## ⚠️ Known Limitations

1. **Canvas Persistence**: Canvas state is not saved to disk - refreshing loses drawings
2. **Large Rooms**: Performance may degrade with 50+ concurrent users
3. **Browser Support**: Works best on Chrome, Firefox, Safari. IE not supported.
4. **Undo/Redo Scope**: Users can only undo their own strokes

## 🔧 Configuration

### Environment Variables
- `PORT`: Server port (default: 3000)

### Customization
- Colors can be modified in `client/style.css` (CSS variables)
- User color palette in `server/rooms.js` (USER_COLORS array)

## 🌐 Deployment (Render.com)

1. Push to GitHub repository
2. Create new Web Service on Render
3. Connect your repository
4. Set build command: `npm install`
5. Set start command: `npm start`
6. Deploy!

## ⏱️ Time Spent

- **Planning & Architecture**: 1 hour
- **Backend Development**: 2 hours
- **Frontend Canvas Engine**: 3 hours
- **Real-time Sync & WebSocket**: 2 hours
- **UI/UX Styling**: 1.5 hours
- **Documentation**: 1 hour
- **Testing & Debugging**: 1.5 hours

**Total: ~12 hours**

## 📝 License

ISC License

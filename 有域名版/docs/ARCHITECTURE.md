# Architecture Documentation

## Overview

The Online Study Room is a real-time collaborative application built with FastAPI (backend) and vanilla JavaScript (frontend), featuring WebSocket communication and LiveKit for audio/video streaming.

## System Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│   Frontend      │◄───────►│   Backend       │◄───────►│   LiveKit       │
│   (Browser)     │         │   (FastAPI)     │         │   Server        │
│                 │         │                 │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
        │                           │
        │                           │
        ▼                           ▼
  LocalStorage              In-Memory State
  (Goals, Theme)            (Rooms, Users)
```

## Backend Architecture

### Components

1. **FastAPI Application** (`app.py`)
   - REST API endpoints for room management
   - WebSocket endpoint for real-time communication
   - LiveKit token generation

2. **Configuration Management** (`config.py`)
   - Environment variable handling with pydantic-settings
   - Validation and type safety

3. **Core Models**
   - `Room`: Manages individual study room state
   - `RoomManager`: Manages multiple rooms and cleanup
   - `RoomConfig`: Configuration for room creation
   - `RoomState`: Public state representation

### Key Features

- **Room Management**: Create, update, and list study rooms
- **Timer System**: Pomodoro-style focus/break cycles
- **Real-time Communication**: WebSocket for instant updates
- **Media State Tracking**: Track audio/video/screen sharing status
- **Automatic Cleanup**: Remove idle rooms to prevent memory leaks
- **Concurrent Broadcasting**: Efficient message delivery to all clients

### API Endpoints

- `POST /rooms` - Create or update a room
- `GET /rooms` - List all rooms
- `GET /rooms/{room_id}` - Get specific room state
- `POST /rooms/{room_id}/reset` - Reset room timer
- `POST /sfu/token` - Generate LiveKit access token
- `WS /ws/rooms/{room_id}` - WebSocket connection for real-time updates

### WebSocket Message Types

**Client → Server:**
- `join` - Join room as participant
- `leave` - Leave room
- `timer:start_focus` - Start focus timer
- `timer:start_break` - Start break timer
- `timer:pause` - Pause timer
- `timer:reset` - Reset timer
- `timer:skip_break` - Skip break and return to focus
- `chat` - Send chat message
- `goal:update` - Update room goal
- `media:update` - Update media state (audio/video/screen)

**Server → Client:**
- `state` - Full room state update
- `event` - Room event notification
- `chat` - Chat message broadcast
- `media:update` - Media state change

## Frontend Architecture

### Structure

```
frontend/
├── index.html          # Main HTML file
├── main.js            # Legacy monolithic code (to be refactored)
├── style.css          # Styles
├── src/
│   ├── config.js      # Configuration
│   ├── modules/       # Feature modules (planned)
│   └── utils/         # Utility functions
│       ├── helpers.js # Debounce, throttle, formatting
│       └── storage.js # LocalStorage wrapper
└── vite.config.js     # Build configuration
```

### Key Features

- **WebSocket Client**: Real-time communication with backend
- **LiveKit Integration**: Audio/video/screen sharing
- **Timer Display**: Visual countdown and status
- **Goal Management**: Personal goal tracking with localStorage
- **Chat System**: Real-time messaging
- **Media Controls**: Toggle audio/video/screen sharing
- **Theme Support**: Dark/light mode

### State Management

- **Local State**: Goals stored in localStorage per room
- **Remote State**: Room state synchronized via WebSocket
- **Media State**: LiveKit room and track management

## Data Flow

### Room Creation/Join

```
1. User navigates to /room/{room_id}
2. Frontend connects to WebSocket
3. Backend creates room if doesn't exist
4. Backend sends initial state
5. Frontend renders UI
6. User sends "join" message
7. Backend adds user to participants
8. Backend broadcasts updated state
```

### Timer Flow

```
1. User clicks "Start Focus"
2. Frontend sends timer:start_focus
3. Backend starts timer task
4. Backend broadcasts state every 5 seconds
5. When timer reaches 0:
   - Backend auto-starts break
   - Backend broadcasts event
6. Frontend updates UI
```

### Media Sharing Flow

```
1. User clicks mic/camera/screen button
2. Frontend requests media permissions
3. Frontend publishes track to LiveKit
4. Frontend sends media:update to backend
5. Backend broadcasts media state
6. Other clients receive update
7. LiveKit delivers media streams
```

## Security Considerations

### Implemented

- ✅ CORS restricted to specific origins
- ✅ Input validation and sanitization
- ✅ Environment variable configuration
- ✅ No hardcoded credentials
- ✅ Rate limiting via room count limit

### Recommended Additions

- 🔲 Authentication/Authorization
- 🔲 Rate limiting per IP
- 🔲 WebSocket message validation
- 🔲 HTTPS/WSS in production
- 🔲 Content Security Policy headers

## Performance Optimizations

### Backend

- Concurrent WebSocket broadcasting
- Automatic room cleanup
- Efficient state locking
- Minimal state serialization

### Frontend

- Debounced input handlers
- Throttled state updates
- LocalStorage for persistence
- Efficient DOM updates (planned)

## Deployment

### Development

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py

# Frontend
cd frontend
npm install
npm run dev
```

### Production (Docker)

```bash
# Build and run with docker-compose
docker-compose up -d

# Or build individually
docker build -t study-room-backend ./backend
docker build -t study-room-frontend ./frontend
```

## Monitoring and Logging

- Structured logging with Python logging module
- Log levels: DEBUG, INFO, WARNING, ERROR
- Health check endpoints for containers
- Request/error tracking in logs

## Future Improvements

1. **Database Integration**: Persist rooms and user data
2. **Redis Cache**: Distributed state management
3. **Authentication**: User accounts and permissions
4. **Analytics**: Usage tracking and metrics
5. **Mobile App**: Native mobile clients
6. **Notifications**: Push notifications for events
7. **Recording**: Session recording and playback

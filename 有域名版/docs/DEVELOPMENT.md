# Development Guide

## Prerequisites

- Python 3.12+
- Node.js 18+
- Git
- Docker (optional, for containerized development)

## Initial Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd study-room
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment (requires python3-venv package)
# On Ubuntu/Debian: sudo apt install python3.12-venv
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Create .env file
cp .env.example .env
# Edit .env and add your LiveKit credentials
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env if needed (defaults should work for local development)
```

## Running the Application

### Development Mode

**Backend:**
```bash
cd backend
source .venv/bin/activate
python app.py
# Server runs on http://localhost:8000
```

**Frontend:**
```bash
cd frontend
npm run dev
# Server runs on http://localhost:5500
```

### Using Docker

```bash
# Build and run all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Development Workflow

### Code Style

**Backend (Python):**
```bash
cd backend

# Format code
make format
# or
black .

# Lint code
make lint
# or
ruff check .

# Type check
make type-check
# or
mypy .
```

**Frontend (JavaScript):**
```bash
cd frontend

# Format code
npm run format

# Lint code
npm run lint
```

### Running Tests

**Backend:**
```bash
cd backend

# Run all tests
make test
# or
pytest

# Run with coverage
pytest --cov=. --cov-report=html

# Run specific test file
pytest tests/test_rooms.py

# Run specific test
pytest tests/test_rooms.py::test_create_room
```

**Frontend:**
Currently no automated tests. Manual testing required.

### Making Changes

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**

3. **Test your changes:**
   ```bash
   # Backend
   cd backend
   make test
   make lint

   # Frontend
   cd frontend
   npm run lint
   npm run build  # Ensure it builds
   ```

4. **Commit your changes:**
   ```bash
   git add .
   git commit -m "Description of changes"
   ```

5. **Push and create PR:**
   ```bash
   git push origin feature/your-feature-name
   ```

## Project Structure

```
study-room/
├── backend/
│   ├── app.py              # Main application
│   ├── config.py           # Configuration management
│   ├── requirements.txt    # Production dependencies
│   ├── requirements-dev.txt # Development dependencies
│   ├── pyproject.toml      # Tool configuration
│   ├── Makefile           # Common tasks
│   ├── Dockerfile         # Container definition
│   └── tests/             # Test suite
│       ├── conftest.py    # Test fixtures
│       ├── test_rooms.py  # Room tests
│       └── test_livekit.py # LiveKit tests
├── frontend/
│   ├── index.html         # Main HTML
│   ├── main.js           # Application code
│   ├── style.css         # Styles
│   ├── package.json      # Dependencies
│   ├── vite.config.js    # Build config
│   ├── Dockerfile        # Container definition
│   ├── nginx.conf        # Nginx config
│   └── src/              # Modular code
│       ├── config.js     # Configuration
│       ├── modules/      # Feature modules
│       └── utils/        # Utilities
├── docs/                 # Documentation
├── .github/
│   └── workflows/
│       └── ci.yml        # CI/CD pipeline
├── docker-compose.yml    # Multi-container setup
└── README.md            # Project overview
```

## Common Tasks

### Adding a New API Endpoint

1. Add endpoint to `backend/app.py`:
   ```python
   @app.get("/your-endpoint")
   async def your_endpoint():
       return {"message": "Hello"}
   ```

2. Add tests in `backend/tests/`:
   ```python
   def test_your_endpoint(client):
       response = client.get("/your-endpoint")
       assert response.status_code == 200
   ```

3. Update documentation in `docs/ARCHITECTURE.md`

### Adding a New Configuration Option

1. Add to `backend/config.py`:
   ```python
   class Settings(BaseSettings):
       your_setting: str = "default"
   ```

2. Add to `backend/.env.example`:
   ```
   YOUR_SETTING=value
   ```

3. Update `docker-compose.yml` if needed

### Debugging

**Backend:**
```python
# Add breakpoint
import pdb; pdb.set_trace()

# Or use logging
logger.debug(f"Debug info: {variable}")
```

**Frontend:**
```javascript
// Use browser DevTools
console.log("Debug info:", variable);
debugger;  // Breakpoint
```

### Database Migrations (Future)

When database is added:
```bash
# Create migration
alembic revision --autogenerate -m "Description"

# Apply migration
alembic upgrade head

# Rollback
alembic downgrade -1
```

## Troubleshooting

### Backend won't start

**Issue:** `ModuleNotFoundError: No module named 'fastapi'`
**Solution:** Activate virtual environment and install dependencies
```bash
source .venv/bin/activate
pip install -r requirements.txt
```

**Issue:** `ValueError: LIVEKIT_API_KEY is required`
**Solution:** Create `.env` file with LiveKit credentials
```bash
cp .env.example .env
# Edit .env and add credentials
```

### Frontend won't build

**Issue:** `Cannot find module 'livekit-client'`
**Solution:** Install dependencies
```bash
npm install
```

**Issue:** Build fails with syntax errors
**Solution:** Check Node.js version (requires 18+)
```bash
node --version
```

### Tests failing

**Issue:** Import errors in tests
**Solution:** Install dev dependencies
```bash
pip install -r requirements-dev.txt
```

**Issue:** WebSocket tests timeout
**Solution:** Increase timeout in `pytest.ini` or mark as slow
```python
@pytest.mark.slow
async def test_websocket():
    ...
```

## Performance Profiling

### Backend

```bash
# Profile with cProfile
python -m cProfile -o profile.stats app.py

# Analyze with snakeviz
pip install snakeviz
snakeviz profile.stats
```

### Frontend

Use browser DevTools:
1. Open DevTools (F12)
2. Go to Performance tab
3. Record interaction
4. Analyze flame graph

## Contributing

1. Follow the code style guidelines
2. Write tests for new features
3. Update documentation
4. Ensure CI passes
5. Request review from maintainers

## Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [LiveKit Documentation](https://docs.livekit.io/)
- [Vite Documentation](https://vitejs.dev/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

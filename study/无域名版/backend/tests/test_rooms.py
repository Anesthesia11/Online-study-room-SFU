"""Tests for room management endpoints."""

import pytest
from fastapi.testclient import TestClient


def test_create_room(client: TestClient):
    """Test creating a new room."""
    response = client.post("/rooms", json={
        "room_id": "test123",
        "goal": "Study Python",
        "timer_length": 1500,
        "break_length": 300
    })
    assert response.status_code == 200
    data = response.json()
    assert data["room_id"] == "test123"
    assert data["goal"] == "Study Python"
    assert data["timer_length"] == 1500
    assert data["break_length"] == 300
    assert data["status"] == "idle"
    assert data["cycle"] == "focus"


def test_create_room_with_defaults(client: TestClient):
    """Test creating a room with default values."""
    response = client.post("/rooms", json={
        "room_id": "test456"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["room_id"] == "test456"
    assert data["goal"] == ""
    assert data["timer_length"] == 25 * 60
    assert data["break_length"] == 5 * 60


def test_create_room_invalid_id(client: TestClient):
    """Test creating a room with invalid ID."""
    response = client.post("/rooms", json={
        "room_id": "test-123"  # Contains hyphen
    })
    assert response.status_code == 422


def test_list_rooms(client: TestClient):
    """Test listing all rooms."""
    # Create some rooms
    client.post("/rooms", json={"room_id": "room1"})
    client.post("/rooms", json={"room_id": "room2"})

    response = client.get("/rooms")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2
    room_ids = [room["room_id"] for room in data]
    assert "room1" in room_ids
    assert "room2" in room_ids


def test_get_room(client: TestClient):
    """Test getting a specific room."""
    # Create a room
    client.post("/rooms", json={"room_id": "test789", "goal": "Learn FastAPI"})

    response = client.get("/rooms/test789")
    assert response.status_code == 200
    data = response.json()
    assert data["room_id"] == "test789"
    assert data["goal"] == "Learn FastAPI"


def test_get_nonexistent_room(client: TestClient):
    """Test getting a room that doesn't exist."""
    response = client.get("/rooms/nonexistent")
    assert response.status_code == 404


def test_reset_room(client: TestClient):
    """Test resetting a room."""
    # Create a room
    client.post("/rooms", json={"room_id": "testreset"})

    # Reset it
    response = client.post("/rooms/testreset/reset", params={"user": "testuser"})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "idle"
    assert data["cycle"] == "focus"


def test_update_existing_room(client: TestClient):
    """Test updating an existing room's configuration."""
    # Create a room
    client.post("/rooms", json={
        "room_id": "testupdate",
        "goal": "Original goal",
        "timer_length": 1500
    })

    # Update it
    response = client.post("/rooms", json={
        "room_id": "testupdate",
        "goal": "Updated goal",
        "timer_length": 3000
    })
    assert response.status_code == 200
    data = response.json()
    assert data["goal"] == "Updated goal"
    assert data["timer_length"] == 3000


@pytest.mark.asyncio
async def test_websocket_connection(client: TestClient):
    """Test WebSocket connection to a room."""
    with client.websocket_connect("/ws/rooms/testws") as websocket:
        # Should receive initial state
        data = websocket.receive_json()
        assert data["type"] == "state"
        assert data["data"]["room_id"] == "testws"


@pytest.mark.asyncio
async def test_websocket_join(client: TestClient):
    """Test joining a room via WebSocket."""
    with client.websocket_connect("/ws/rooms/testjoin") as websocket:
        # Receive initial state
        websocket.receive_json()

        # Send join message
        websocket.send_json({"type": "join", "user": "testuser"})

        # Should receive event and updated state
        event = websocket.receive_json()
        assert event["type"] == "event"
        assert event["event"] == "user:join"
        assert event["user"] == "testuser"

        state = websocket.receive_json()
        assert state["type"] == "state"
        assert "testuser" in state["data"]["participants"]


@pytest.mark.asyncio
async def test_websocket_chat(client: TestClient):
    """Test sending chat messages via WebSocket."""
    with client.websocket_connect("/ws/rooms/testchat") as websocket:
        # Receive initial state
        websocket.receive_json()

        # Send chat message
        websocket.send_json({
            "type": "chat",
            "user": "testuser",
            "text": "Hello, world!"
        })

        # Should receive chat message back
        chat = websocket.receive_json()
        assert chat["type"] == "chat"
        assert chat["user"] == "testuser"
        assert chat["text"] == "Hello, world!"

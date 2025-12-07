"""Tests for LiveKit token generation."""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch


def test_livekit_token_success(client: TestClient):
    """Test successful LiveKit token generation."""
    with patch("config.settings.livekit_api_key", "test_key"), \
         patch("config.settings.livekit_api_secret", "test_secret"):
        response = client.post("/sfu/token", json={
            "room_id": "testroom",
            "user": "testuser"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["room"] == "testroom"
        assert data["identity"] == "testuser"
        assert "server_url" in data


def test_livekit_token_missing_credentials(client: TestClient):
    """Test LiveKit token generation with missing credentials."""
    with patch("config.settings.livekit_api_key", ""), \
         patch("config.settings.livekit_api_secret", ""):
        response = client.post("/sfu/token", json={
            "room_id": "testroom",
            "user": "testuser"
        })
        assert response.status_code == 503
        assert "not configured" in response.json()["detail"]


def test_livekit_token_invalid_room_id(client: TestClient):
    """Test LiveKit token generation with invalid room ID."""
    response = client.post("/sfu/token", json={
        "room_id": "test-room",  # Contains hyphen
        "user": "testuser"
    })
    assert response.status_code == 422


def test_livekit_token_invalid_user(client: TestClient):
    """Test LiveKit token generation with invalid user."""
    response = client.post("/sfu/token", json={
        "room_id": "testroom",
        "user": ""  # Empty user
    })
    assert response.status_code == 422

"""Pytest configuration and fixtures."""

import pytest
from fastapi.testclient import TestClient

from app import app, manager


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


@pytest.fixture(autouse=True)
async def cleanup_rooms():
    """Clean up rooms after each test."""
    yield
    # Clear all rooms after each test
    async with manager.lock:
        manager.rooms.clear()

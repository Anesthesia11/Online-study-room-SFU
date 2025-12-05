"""轻量级在线自习室的 FastAPI 后端"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Dict, List, Optional, Set

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from livekit import AccessToken, VideoGrant
from pydantic import BaseModel, Field, validator

from config import settings

# 配置日志
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def sanitize_room_id(value: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise ValueError("room_id must not be empty.")
    if not cleaned.isalnum():
        raise ValueError("room_id must be alphanumeric.")
    return cleaned.lower()


def sanitize_user_name(value: str) -> str:
    cleaned = (value or "").strip()
    if not cleaned:
        raise ValueError("user must not be empty.")
    return cleaned[:64]


class RoomConfig(BaseModel):
    """用于创建或更新房间的配置"""

    room_id: str = Field(..., min_length=3, max_length=32)
    goal: str = Field(default="")
    timer_length: int = Field(default=25 * 60, ge=60, le=120 * 60)
    break_length: int = Field(default=5 * 60, ge=60, le=30 * 60)

    @validator("room_id")
    def room_id_slug(cls, value: str) -> str:
        return sanitize_room_id(value)


class RoomState(BaseModel):
    """房间的当前公开状态"""

    room_id: str
    goal: str
    timer_length: int
    break_length: int
    remaining: int
    status: str
    cycle: str
    participants: List[str]
    media_states: Dict[str, Dict[str, bool]] = Field(default_factory=dict)
    leaderboard: List[Dict[str, int]] = Field(default_factory=list)
    updated_at: float


class LiveKitTokenRequest(BaseModel):
    """请求 LiveKit 访问令牌的载荷"""

    room_id: str = Field(..., min_length=3, max_length=32)
    user: str = Field(..., min_length=1, max_length=64)

    @validator("room_id")
    def validate_room_id(cls, value: str) -> str:
        return sanitize_room_id(value)

    @validator("user")
    def validate_user(cls, value: str) -> str:
        return sanitize_user_name(value)


class Room:
    """表示一个带有计时器和聊天状态的自习室"""

    def __init__(self, config: RoomConfig):
        self.room_id = config.room_id
        self.goal = config.goal
        self.timer_length = config.timer_length
        self.break_length = config.break_length
        self.status = "idle"  # idle | running | paused
        self.cycle = "focus"  # focus | break
        self.remaining = self.timer_length
        self.updated_at = time.time()
        self.participants: Dict[str, float] = {}
        self.clients: Set[WebSocket] = set()
        self.media_states: Dict[str, Dict[str, bool]] = {}
        self.timer_task: Optional[asyncio.Task] = None
        self.lock = asyncio.Lock()

    async def apply_config(self, config: RoomConfig) -> None:
        async with self.lock:
            self.goal = config.goal
            self.timer_length = config.timer_length
            self.break_length = config.break_length
            if self.cycle == "focus":
                self.remaining = min(self.remaining, self.timer_length)
            else:
                self.remaining = min(self.remaining, self.break_length)
            self.updated_at = time.time()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self.lock:
            self.clients.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self.lock:
            self.clients.discard(websocket)

    async def add_participant(self, name: str) -> None:
        async with self.lock:
            self.participants[name] = time.time()

    async def remove_participant(self, name: str) -> None:
        async with self.lock:
            self.participants.pop(name, None)
            self.media_states.pop(name, None)

    async def pause(self, user: str) -> None:
        async with self.lock:
            if self.status != "running":
                return
            self.status = "paused"
            self.updated_at = time.time()
            if self.timer_task:
                self.timer_task.cancel()
                self.timer_task = None
        await self.broadcast({"type": "event", "event": "timer:pause", "user": user})
        await self.broadcast_state()

    async def reset(self, user: str) -> None:
        async with self.lock:
            if self.timer_task:
                self.timer_task.cancel()
                self.timer_task = None
            self.cycle = "focus"
            self.status = "idle"
            self.remaining = self.timer_length
            self.updated_at = time.time()
        await self.broadcast({"type": "event", "event": "timer:reset", "user": user})
        await self.broadcast_state()

    async def skip_break(self, user: str) -> None:
        async with self.lock:
            if self.cycle != "break":
                return
            if self.timer_task:
                self.timer_task.cancel()
                self.timer_task = None
            self.cycle = "focus"
            self.status = "idle"
            self.remaining = self.timer_length
            self.updated_at = time.time()
        await self.broadcast({"type": "event", "event": "timer:skip_break", "user": user})
        await self.broadcast_state()

    async def start_focus(self, user: str) -> None:
        async with self.lock:
            if self.timer_task:
                self.timer_task.cancel()
            if self.cycle != "focus":
                self.cycle = "focus"
                self.remaining = self.timer_length
            elif self.status == "idle":
                self.remaining = self.timer_length
            self.status = "running"
            self.updated_at = time.time()
            self.timer_task = asyncio.create_task(self._timer_loop())
        await self.broadcast({"type": "event", "event": "timer:start_focus", "user": user})
        await self.broadcast_state()

    async def start_break(self, user: str) -> None:
        async with self.lock:
            if self.timer_task:
                self.timer_task.cancel()
            self.cycle = "break"
            self.status = "running"
            self.remaining = self.break_length
            self.updated_at = time.time()
            self.timer_task = asyncio.create_task(self._timer_loop())
        await self.broadcast({"type": "event", "event": "timer:start_break", "user": user})
        await self.broadcast_state()

    async def _timer_loop(self) -> None:
        try:
            while True:
                async with self.lock:
                    if self.status != "running":
                        self.timer_task = None
                        return
                    remaining = self.remaining
                    cycle = self.cycle
                if remaining <= 0:
                    proceed = await self._advance_cycle()
                    if not proceed:
                        return
                    continue
                await asyncio.sleep(1)
                async with self.lock:
                    if self.status != "running":
                        self.timer_task = None
                        return
                    self.remaining = max(0, self.remaining - 1)
                    remaining = self.remaining
                if remaining % 5 == 0 or remaining <= 10:
                    await self.broadcast_state()
        except asyncio.CancelledError:
            pass
        finally:
            async with self.lock:
                if self.timer_task and self.timer_task.done():
                    self.timer_task = None

    async def _advance_cycle(self) -> bool:
        async with self.lock:
            if self.cycle == "focus":
                self.cycle = "break"
                self.status = "running"
                self.remaining = self.break_length
                self.updated_at = time.time()
                continue_running = True
                event = "timer:break_auto"
            else:
                self.cycle = "focus"
                self.status = "idle"
                self.remaining = self.timer_length
                self.updated_at = time.time()
                continue_running = False
                event = "timer:cycle_complete"
        await self.broadcast({"type": "event", "event": event})
        await self.broadcast_state()
        return continue_running

    async def serialize(self) -> RoomState:
        async with self.lock:
            return RoomState(
                room_id=self.room_id,
                goal=self.goal,
                timer_length=self.timer_length,
                break_length=self.break_length,
                remaining=self.remaining,
                status=self.status,
                cycle=self.cycle,
                participants=sorted(self.participants.keys()),
                media_states={k: dict(v) for k, v in self.media_states.items()},
                updated_at=self.updated_at,
            )

    async def broadcast_state(self) -> None:
        state = await self.serialize()
        await self.broadcast({"type": "state", "data": state.dict()})

    async def broadcast(self, payload: dict) -> None:
        """并发地向所有连接的客户端广播消息"""
        async with self.lock:
            targets = list(self.clients)

        async def send_to_client(ws: WebSocket) -> tuple[WebSocket, bool]:
            """向单个客户端发送消息并返回成功状态"""
            try:
                await ws.send_json(payload)
                return ws, True
            except (WebSocketDisconnect, RuntimeError):
                return ws, False

        # 并发发送到所有客户端
        results = await asyncio.gather(
            *[send_to_client(ws) for ws in targets],
            return_exceptions=True
        )

        # 断开失败的客户端
        dead = []
        for result in results:
            if isinstance(result, tuple):
                ws, success = result
                if not success:
                    dead.append(ws)
            else:
                # 发生异常
                logger.error(f"向客户端广播时出错: {result}")

        for ws in dead:
            await self.disconnect(ws)

    async def update_media_state(self, user: str, media: Optional[Dict[str, bool]]) -> Dict[str, bool]:
        defaults = {"audio": False, "video": False, "screen": False}
        media = media or {}
        normalized = {
            "audio": bool(media.get("audio")),
            "video": bool(media.get("video")),
            "screen": bool(media.get("screen")),
        }
        async with self.lock:
            self.media_states[user] = normalized
            snapshot = dict(self.media_states[user])
        return snapshot


class RoomManager:
    """管理多个房间"""

    def __init__(self) -> None:
        self.rooms: Dict[str, Room] = {}
        self.lock = asyncio.Lock()
        self._cleanup_task: Optional[asyncio.Task] = None

    async def start_cleanup_task(self) -> None:
        """启动后台清理任务"""
        if self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())
            logger.info("房间清理任务已启动")

    async def stop_cleanup_task(self) -> None:
        """停止后台清理任务"""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None
            logger.info("房间清理任务已停止")

    async def _cleanup_loop(self) -> None:
        """定期清理空闲房间"""
        while True:
            try:
                await asyncio.sleep(settings.room_cleanup_interval)
                await self._cleanup_idle_rooms()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"清理循环出错: {e}", exc_info=True)

    async def _cleanup_idle_rooms(self) -> None:
        """移除空闲时间过长的房间"""
        now = time.time()
        to_remove = []

        async with self.lock:
            for room_id, room in self.rooms.items():
                # 清理没有参与者且已空闲的房间
                if not room.participants and (now - room.updated_at) > settings.room_idle_timeout:
                    to_remove.append(room_id)

            for room_id in to_remove:
                # 取消任何正在运行的计时器任务
                room = self.rooms[room_id]
                if room.timer_task:
                    room.timer_task.cancel()
                del self.rooms[room_id]

        if to_remove:
            logger.info(f"已清理 {len(to_remove)} 个空闲房间: {to_remove}")

    async def upsert(self, config: RoomConfig) -> Room:
        async with self.lock:
            # Check room limit
            if len(self.rooms) >= settings.max_rooms and config.room_id not in self.rooms:
                raise HTTPException(
                    status_code=429,
                    detail=f"Maximum number of rooms ({settings.max_rooms}) reached"
                )

            room = self.rooms.get(config.room_id)
            if room:
                await room.apply_config(config)
                logger.info(f"Updated room: {config.room_id}")
            else:
                room = Room(config)
                self.rooms[config.room_id] = room
                logger.info(f"Created room: {config.room_id}")
            return room

    async def get(self, room_id: str) -> Room:
        async with self.lock:
            room = self.rooms.get(room_id)
            if room is None:
                raise KeyError(room_id)
            return room

    async def list_states(self) -> List[RoomState]:
        async with self.lock:
            rooms = list(self.rooms.values())
        return await asyncio.gather(*(room.serialize() for room in rooms))


manager = RoomManager()

app = FastAPI(title="Online Study Room API")

# Configure CORS with specific origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Global exception handler for unhandled errors."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )


@app.on_event("startup")
async def startup_event() -> None:
    """Validate configuration and start background tasks on startup."""
    logger.info("Starting application...")
    try:
        settings.validate_required()
        logger.info("Configuration validated successfully")
    except ValueError as e:
        logger.warning(f"Configuration validation failed: {e}")
        logger.warning("LiveKit features will be disabled")

    await manager.start_cleanup_task()
    logger.info("Application started successfully")


@app.on_event("shutdown")
async def shutdown_event() -> None:
    """Clean up resources on shutdown."""
    logger.info("Shutting down application...")
    await manager.stop_cleanup_task()
    logger.info("Application shut down successfully")


class RoomCreateRequest(RoomConfig):
    pass


class Message(BaseModel):
    type: str
    user: Optional[str] = None
    text: Optional[str] = None
    goal: Optional[str] = None
    media: Optional[Dict[str, bool]] = None


@app.post("/rooms", response_model=RoomState)
async def create_room(payload: RoomCreateRequest) -> RoomState:
    room = await manager.upsert(payload)
    return await room.serialize()


@app.get("/rooms", response_model=List[RoomState])
async def list_rooms() -> List[RoomState]:
    return await manager.list_states()


@app.get("/rooms/{room_id}", response_model=RoomState)
async def get_room(room_id: str) -> RoomState:
    try:
        room = await manager.get(room_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Room not found") from exc
    return await room.serialize()


@app.post("/rooms/{room_id}/reset", response_model=RoomState)
async def reset_room(room_id: str, user: str = "system") -> RoomState:
    try:
        room = await manager.get(room_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Room not found") from exc
    await room.reset(user=user)
    return await room.serialize()


@app.post("/sfu/token")
async def issue_livekit_token(payload: LiveKitTokenRequest) -> Dict[str, str]:
    """Issue a LiveKit access token for a user to join a room."""
    if not settings.livekit_api_key or not settings.livekit_api_secret:
        raise HTTPException(
            status_code=503,
            detail="LiveKit credentials are not configured."
        )

    identity = payload.user
    room_id = payload.room_id

    logger.info(f"Issuing LiveKit token for user '{identity}' in room '{room_id}'")

    token = AccessToken(
        settings.livekit_api_key,
        settings.livekit_api_secret,
        identity=identity,
        ttl=settings.livekit_token_ttl
    )
    grant = VideoGrant(
        room_join=True,
        room=room_id,
        can_publish=True,
        can_subscribe=True,
        can_publish_data=True,
    )
    token.add_grants(grant)

    return {
        "token": token.to_jwt(),
        "server_url": settings.livekit_server_url,
        "room": room_id,
        "identity": identity,
        "ttl": settings.livekit_token_ttl,
    }


@app.websocket("/ws/rooms/{room_id}")
async def room_socket(websocket: WebSocket, room_id: str) -> None:
    try:
        room = await manager.get(room_id)
    except KeyError:
        config = RoomConfig(room_id=room_id)
        room = await manager.upsert(config)

    await room.connect(websocket)
    await room.broadcast_state()

    user_name = f"guest-{int(time.time())}"

    try:
        while True:
            try:
                raw = await websocket.receive_json()
            except RuntimeError as exc:
                # Starlette raises RuntimeError instead of WebSocketDisconnect
                # when the client disappears before we can accept / read.
                message = str(exc)
                if "WebSocket is not connected" in message:
                    raise WebSocketDisconnect() from exc
                raise
            message = Message(**raw)
            user = message.user or user_name

            if message.type == "join":
                user_name = user
                await room.add_participant(user)
                await room.broadcast({"type": "event", "event": "user:join", "user": user})
                await room.broadcast_state()
            elif message.type == "leave":
                await room.remove_participant(user)
                await room.broadcast({"type": "event", "event": "user:leave", "user": user})
                await room.broadcast_state()
            elif message.type == "timer:start_focus":
                await room.start_focus(user=user)
            elif message.type == "timer:start_break":
                await room.start_break(user=user)
            elif message.type == "timer:pause":
                await room.pause(user=user)
            elif message.type == "timer:reset":
                await room.reset(user=user)
            elif message.type == "timer:skip_break":
                await room.skip_break(user=user)
            elif message.type == "chat":
                if not message.text:
                    continue
                payload = {
                    "type": "chat",
                    "user": user,
                    "text": message.text.strip(),
                    "ts": time.time(),
                }
                await room.broadcast(payload)
            elif message.type == "goal:update":
                goal_text = message.goal or ""
                room.goal = goal_text[:120]
                room.updated_at = time.time()
                await room.broadcast({"type": "event", "event": "goal:update", "goal": room.goal})
                await room.broadcast_state()
            elif message.type == "media:update":
                snapshot = await room.update_media_state(user, message.media)
                payload = {"type": "media:update", "user": user, "media": snapshot}
                await room.broadcast(payload)
    except WebSocketDisconnect:
        await room.disconnect(websocket)
    except RuntimeError as exc:
        # Some uvicorn/starlette versions bubble a RuntimeError instead of
        # WebSocketDisconnect when the client closes the tab abruptly.
        if "WebSocket is not connected" not in str(exc):
            raise
        await room.disconnect(websocket)
    finally:
        await room.remove_participant(user_name)
        await room.broadcast_state()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
        log_level=settings.log_level.lower()
    )

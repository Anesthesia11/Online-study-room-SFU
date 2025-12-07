# 在线自习室

一个支持实时视频会议、番茄钟计时和聊天功能的协作学习应用。

## 功能特性

- 🎥 **实时音视频** - 基于 LiveKit 的多人视频会议
- 🍅 **番茄钟计时** - 同步的专注和休息时段
- 💬 **实时聊天** - 与所有参与者实时消息交流
- 🎯 **目标追踪** - 为每个房间设置和追踪学习目标
- 🌙 **暗黑模式** - 在明亮和暗黑主题之间切换
- 📱 **响应式设计** - 支持桌面和移动设备
- 🔒 **安全可靠** - CORS 保护、输入验证和基于环境的配置

## 技术架构

- **后端** - FastAPI + WebSocket 支持
- **前端** - 原生 JavaScript + Vite 构建系统
- **媒体服务器** - LiveKit SFU 音视频流媒体
- **实时通信** - WebSocket 状态同步

## 快速开始

### 环境要求

- Python 3.12+
- Node.js 18+
- Docker（可选，用于 LiveKit）

### 1. 设置 LiveKit（可选）

如果需要音视频功能，运行 LiveKit 服务器：

```bash
docker run --rm -it --name livekit \
  -p 7880:7880 \
  -p 7881:7881/udp \
  -e LIVEKIT_KEYS="devkey:supersecret" \
  livekit/livekit-server \
  --dev --bind 0.0.0.0
```

### 2. 后端设置

```bash
cd backend

# 创建虚拟环境
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件并设置你的 LiveKit 凭证

# 运行服务器
python app.py
```

后端将在 `http://localhost:8000` 运行

### 3. 前端设置

```bash
cd frontend

# 安装依赖
npm install

# 配置环境变量（可选）
cp .env.example .env

# 运行开发服务器
npm run dev
```

前端将在 `http://localhost:5500` 运行

### 4. 使用 Docker Compose

或者，使用 Docker 运行所有服务：

```bash
# 复制环境变量文件
cp backend/.env.example backend/.env
# 编辑 backend/.env 并设置你的 LiveKit 凭证

# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

## 使用说明

1. 在浏览器中打开 `http://localhost:5500`
2. 输入房间 ID 和你的用户名
3. 点击"加入房间"
4. 使用控制按钮：
   - 启动/暂停/重置番茄钟计时器
   - 切换麦克风、摄像头或屏幕共享
   - 发送聊天消息
   - 设置房间目标

## API 文档

后端运行后，访问：
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### 主要接口

- `POST /rooms` - 创建或更新房间
- `GET /rooms` - 列出所有房间
- `GET /rooms/{room_id}` - 获取房间状态
- `POST /sfu/token` - 生成 LiveKit 访问令牌
- `WS /ws/rooms/{room_id}` - WebSocket 连接用于实时更新

## 开发

### 运行测试

**后端：**
```bash
cd backend
pytest
```

**代码质量检查：**
```bash
# 格式化代码
make format

# 代码检查
make lint

# 类型检查
make type-check
```

### 项目结构

```
study-room/
├── backend/           # FastAPI 后端
│   ├── app.py        # 主应用程序
│   ├── config.py     # 配置管理
│   └── tests/        # 测试套件
├── frontend/         # 前端应用
│   ├── src/          # 源代码
│   ├── index.html    # 主 HTML
│   └── main.js       # 应用逻辑
├── docs/             # 文档
│   ├── ARCHITECTURE.md
│   └── DEVELOPMENT.md
└── docker-compose.yml
```

## 配置说明

### 后端环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LIVEKIT_SERVER_URL` | LiveKit 服务器 WebSocket 地址 | `ws://127.0.0.1:7880` |
| `LIVEKIT_API_KEY` | LiveKit API 密钥 | 必填 |
| `LIVEKIT_API_SECRET` | LiveKit API 密钥 | 必填 |
| `LIVEKIT_TOKEN_TTL` | 令牌有效期（秒） | `3600` |
| `ALLOWED_ORIGINS` | CORS 允许的来源（逗号分隔） | `http://localhost:5500` |
| `MAX_ROOMS` | 最大并发房间数 | `1000` |
| `ROOM_CLEANUP_INTERVAL` | 清理间隔（秒） | `300` |
| `ROOM_IDLE_TIMEOUT` | 空闲超时（秒） | `1800` |
| `LOG_LEVEL` | 日志级别 | `INFO` |

### 前端环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_WS_BASE` | 后端 WebSocket 地址 | `ws://127.0.0.1:8000` |
| `VITE_HTTP_BASE` | 后端 HTTP 地址 | `http://127.0.0.1:8000` |
| `VITE_LIVEKIT_TOKEN_ENDPOINT` | LiveKit 令牌端点 | `http://127.0.0.1:8000/sfu/token` |

## 部署

### 生产环境部署

1. **构建前端：**
   ```bash
   cd frontend
   npm run build
   ```

2. **配置环境：**
   - 设置生产环境变量
   - 更新 CORS 来源
   - 配置 HTTPS/WSS

3. **使用 Docker 部署：**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Cloudflare Tunnel（可选）

用于 HTTPS 公网访问：

1. 安装 cloudflared
2. 创建隧道：`cloudflared tunnel create study-room`
3. 配置 DNS 路由
4. 更新前端 WebSocket URL 使用 `wss://`

详细说明请参见 [DEPLOYMENT.md](docs/DEPLOYMENT.md)

## 故障排查

### 后端无法启动

**问题：** `ModuleNotFoundError: No module named 'fastapi'`

**解决方案：** 在虚拟环境中安装依赖
```bash
source .venv/bin/activate
pip install -r requirements.txt
```

### 媒体设备无法工作

**问题：** 无法访问摄像头/麦克风

**解决方案：** 确保使用 HTTPS 或 localhost。现代浏览器需要安全上下文才能访问媒体设备。

### WebSocket 连接失败

**问题：** 无法连接到 WebSocket

**解决方案：**
- 检查后端是否在正确端口运行
- 验证 CORS 设置允许你的前端来源
- 检查防火墙设置


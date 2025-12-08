"""使用 pydantic-settings 进行配置管理"""

from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """从环境变量加载的应用程序设置"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # LiveKit 配置
    livekit_server_url: str = "ws://127.0.0.1:7880"
    livekit_api_key: str = ""
    livekit_api_secret: str = ""
    livekit_token_ttl: int = 3600

    # CORS 配置
    allowed_origins: str = "http://localhost:5500,http://127.0.0.1:5500"

    # 应用程序配置
    max_rooms: int = 1000
    room_cleanup_interval: int = 300  # 秒
    room_idle_timeout: int = 1800  # 秒

    # 服务器配置
    host: str = "0.0.0.0"
    port: int = 8000
    reload: bool = True

    # 日志配置
    log_level: str = "INFO"

    @property
    def allowed_origins_list(self) -> List[str]:
        """将逗号分隔的来源解析为列表"""
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    def validate_required(self) -> None:
        """验证必需的设置是否存在"""
        if not self.livekit_api_key:
            raise ValueError("LIVEKIT_API_KEY is required")
        if not self.livekit_api_secret:
            raise ValueError("LIVEKIT_API_SECRET is required")


# 全局设置实例
settings = Settings()

import redis
from app.core.config import settings
from app.core.database import engine
import asyncio

async def test_db():
    print(f"Testing DB connection to {settings.database_url}")
    try:
        async with engine.connect() as conn:
            print("DB connection successful")
    except Exception as e:
        print(f"DB connection failed: {e}")

def test_redis():
    print(f"Testing Redis connection to {settings.redis_url}")
    try:
        r = redis.from_url(settings.redis_url)
        print(f"Redis PING: {r.ping()}")
    except Exception as e:
        print(f"Redis connection failed: {e}")

if __name__ == "__main__":
    test_redis()
    asyncio.run(test_db())

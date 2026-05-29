"""
ARGOS SLOPE 4.0 — Async database engine and session management.

Provides the async SQLModel engine (asyncpg driver), table creation on
startup, and a FastAPI-compatible session dependency for route injection.
"""

from __future__ import annotations

import os
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

# ── Connection string ──────────────────────────────────────────────────
# Override via DATABASE_URL env var or rely on the local dev default.
DATABASE_URL: str = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/mineriadb",
)

# ── Engine ─────────────────────────────────────────────────────────────
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

# ── Session factory ────────────────────────────────────────────────────
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Lifecycle helpers ──────────────────────────────────────────────────


async def init_db() -> None:
    """Create all tables defined by SQLModel ``table=True`` models.

    If the database is unreachable (e.g. PostgreSQL is not running), the
    error is logged but **not** re-raised so the application can still
    serve non-DB endpoints (RQD, convert, growth, deformation, health).
    """
    try:
        async with engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "Database unavailable — skipping table creation. "
            "DB-dependent endpoints will return 500. "
            "Error: %s",
            exc,
        )


async def close_db() -> None:
    """Dispose the engine's connection pool gracefully."""
    await engine.dispose()


# ── FastAPI dependency ─────────────────────────────────────────────────


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency — yields an async database session.

    Usage::

        async def my_route(session: AsyncSession = Depends(get_session)):
            ...
    """
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()

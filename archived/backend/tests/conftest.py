"""
Pytest configuration for ARGOS SLOPE 4.0 backend tests.

Sets the default asyncio fixture loop scope to avoid deprecation warnings
and provides a test-only environment for FastAPI TestClient.

The test suite currently tests non-DB endpoints (RQD, convert, growth,
deformation, health) via TestClient.  DB-dependent endpoints (fisuras, resumen,
alertas, configuracion, seed) are NOT tested in the unit suite — they
require a running PostgreSQL instance.

``init_db()`` in ``backend.database`` handles connection failures gracefully,
so the TestClient fixture works even without PostgreSQL running.
"""

from __future__ import annotations

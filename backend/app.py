"""Ward Life GH server. Run from the backend folder:  uvicorn app:app --reload"""
import asyncio
import os
import re
import secrets
import uuid
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import db
from content import ROLES
from game import Engine

FRONTEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")
ADMIN_TOKEN = os.environ.get("WARDLIFE_ADMIN_TOKEN", "change-me")
NAME_RE = re.compile(r"^[A-Za-z0-9 .'\-]{2,24}$")

engine = Engine()


@asynccontextmanager
async def lifespan(_app):
    task = asyncio.create_task(engine.run())
    if ADMIN_TOKEN == "change-me":
        print("WARNING: set WARDLIFE_ADMIN_TOKEN before going live.")
    yield
    task.cancel()


app = FastAPI(title="Ward Life GH", lifespan=lifespan)

# The pages can be hosted elsewhere (e.g. Vercel). List those sites in WARDLIFE_ALLOWED_ORIGINS,
# comma-separated, e.g. "https://ward-simulation.vercel.app". Sign-in uses tokens, not cookies.
ORIGINS = [o.strip() for o in os.environ.get("WARDLIFE_ALLOWED_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"],
                   allow_headers=["Authorization", "Content-Type", "X-Admin-Token"])


def bearer(request: Request):
    auth = request.headers.get("authorization", "")
    return auth[7:] if auth.lower().startswith("bearer ") else None


@app.post("/api/register")
async def register(request: Request):
    body = await request.json()
    name = str(body.get("name", "")).strip()
    role = str(body.get("role", ""))
    institution = str(body.get("institution", "")).strip()[:80]
    password = str(body.get("password", ""))
    if not NAME_RE.match(name):
        raise HTTPException(400, "Use 2 to 24 letters, numbers or spaces for your name.")
    if role not in ROLES:
        raise HTTPException(400, "Choose your role.")
    if len(password) < 6:
        raise HTTPException(400, "Use a password of at least 6 characters.")
    user = db.create_user(name, role, institution, password)
    if not user:
        raise HTTPException(409, "That name is taken. Try adding your initials.")
    return {"token": db.new_session(user["id"]), "user": db.public_user(user)}


@app.post("/api/login")
async def login(request: Request):
    body = await request.json()
    user = db.check_login(str(body.get("name", "")), str(body.get("password", "")))
    if not user:
        raise HTTPException(401, "Name or password is wrong.")
    return {"token": db.new_session(user["id"]), "user": db.public_user(user)}


@app.post("/api/logout")
async def logout(request: Request):
    token = bearer(request)
    if token:
        db.delete_session(token)
    return {"ok": True}


@app.get("/api/me")
async def me(request: Request):
    user = db.user_by_token(bearer(request))
    if not user:
        raise HTTPException(401, "Sign in again.")
    return {"user": db.public_user(user)}


@app.post("/api/visit")
async def visit(request: Request):
    """Count a page view. The browser sends a random id kept in its own storage, so unique
    visitors can be told apart even when the pages are on another domain. No IP addresses are stored."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    vid = str(body.get("vid", ""))
    if not re.fullmatch(r"[0-9a-f]{32}", vid):
        vid = uuid.uuid4().hex
    db.log_visit(vid, str(body.get("path", "/")), urlparse(str(body.get("ref", ""))).netloc)
    return {"ok": True}


@app.get("/api/public-stats")
async def public_stats():
    return {"online": len(engine.players), "players": db.admin_stats()["players_total"]}


@app.get("/api/admin/stats")
async def admin_stats(request: Request):
    token = request.headers.get("x-admin-token", "")
    if not secrets.compare_digest(token, ADMIN_TOKEN):
        raise HTTPException(401, "Wrong admin token.")
    stats = db.admin_stats()
    stats.update(online_now=len(engine.players), peak_online=engine.peak,
                 patients_now=len(engine.patients),
                 online_by_role={r: n for r, n in engine.roles_online().items()},
                 online_by_dept={d: sum(1 for p in engine.players.values() if p["dept"] == d)
                                 for d in {p["dept"] for p in engine.players.values()}})
    return stats


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    user = db.user_by_token(ws.query_params.get("token"))
    await ws.accept()
    if not user:
        await ws.close(code=4401)
        return
    await engine.connect(ws, user)
    try:
        while True:
            raw = await ws.receive_text()
            if len(raw) < 8000:
                await engine.handle(ws, raw)
    except Exception:
        pass  # the browser closed or dropped the connection
    finally:
        await engine.disconnect(ws)


app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")

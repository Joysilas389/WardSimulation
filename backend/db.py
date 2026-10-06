"""SQLite storage. Ghana is on UTC all year, so UTC days are Accra days."""
import hashlib
import json
import os
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone

DB_PATH = os.environ.get("WARDLIFE_DB", os.path.join(os.path.dirname(os.path.abspath(__file__)), "wardlife.db"))

_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
_conn.row_factory = sqlite3.Row
_conn.execute("PRAGMA journal_mode=WAL")
_lock = threading.Lock()

_conn.executescript("""
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, name_key TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL, institution TEXT DEFAULT '',
  pw_hash TEXT NOT NULL, salt TEXT NOT NULL,
  xp INTEGER DEFAULT 0, created_at INTEGER NOT NULL, created_day TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS visits(id INTEGER PRIMARY KEY AUTOINCREMENT, vid TEXT NOT NULL, ts INTEGER NOT NULL,
  day TEXT NOT NULL, path TEXT, ref TEXT);
CREATE INDEX IF NOT EXISTS visits_day ON visits(day);
CREATE TABLE IF NOT EXISTS activity(user_id INTEGER NOT NULL, day TEXT NOT NULL, PRIMARY KEY(user_id, day));
CREATE TABLE IF NOT EXISTS game_stats(day TEXT NOT NULL, key TEXT NOT NULL, n INTEGER DEFAULT 0, PRIMARY KEY(day, key));
CREATE TABLE IF NOT EXISTS presentations(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, author TEXT, role TEXT,
  patient TEXT, case_title TEXT, body TEXT, score INTEGER, endorsements INTEGER DEFAULT 0, created_at INTEGER);
CREATE TABLE IF NOT EXISTS endorsements(pres_id INTEGER, user_id INTEGER, PRIMARY KEY(pres_id, user_id));
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
""")
_conn.commit()


def day(offset=0):
    return (datetime.now(timezone.utc) + timedelta(days=offset)).strftime("%Y-%m-%d")


def q(sql, args=()):
    with _lock:
        return [dict(r) for r in _conn.execute(sql, args).fetchall()]


def q1(sql, args=()):
    rows = q(sql, args)
    return rows[0] if rows else None


def x(sql, args=()):
    with _lock:
        cur = _conn.execute(sql, args)
        _conn.commit()
        return cur.lastrowid


def _hash(pw, salt):
    return hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 120_000).hex()


def public_user(u):
    return {k: u[k] for k in ("id", "name", "role", "institution", "xp")}


def create_user(name, role, institution, password):
    key = name.strip().lower()
    if q1("SELECT id FROM users WHERE name_key=?", (key,)):
        return None
    salt = secrets.token_hex(16)
    uid = x("INSERT INTO users(name,name_key,role,institution,pw_hash,salt,created_at,created_day) VALUES(?,?,?,?,?,?,?,?)",
            (name.strip(), key, role, institution.strip(), _hash(password, salt), salt, int(time.time()), day()))
    return q1("SELECT * FROM users WHERE id=?", (uid,))


def check_login(name, password):
    u = q1("SELECT * FROM users WHERE name_key=?", (name.strip().lower(),))
    if u and secrets.compare_digest(u["pw_hash"], _hash(password, u["salt"])):
        return u
    return None


def new_session(uid):
    token = secrets.token_urlsafe(32)
    x("INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)", (token, uid, int(time.time())))
    return token


def user_by_token(token):
    if not token:
        return None
    return q1("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?", (token,))


def delete_session(token):
    x("DELETE FROM sessions WHERE token=?", (token,))


def add_xp(uid, amount):
    x("UPDATE users SET xp=MAX(0, xp+?) WHERE id=?", (int(amount), uid))
    row = q1("SELECT xp FROM users WHERE id=?", (uid,))
    return row["xp"] if row else 0


def mark_active(uid):
    x("INSERT OR IGNORE INTO activity(user_id, day) VALUES(?,?)", (uid, day()))


def log_visit(vid, path, ref):
    x("INSERT INTO visits(vid,ts,day,path,ref) VALUES(?,?,?,?,?)", (vid, int(time.time()), day(), path[:200], ref[:200]))


def stat_inc(key, n=1):
    x("INSERT INTO game_stats(day,key,n) VALUES(?,?,?) ON CONFLICT(day,key) DO UPDATE SET n=n+excluded.n", (day(), key, n))


def meta_get(key):
    r = q1("SELECT value FROM meta WHERE key=?", (key,))
    return r["value"] if r else None


def meta_set(key, value):
    x("INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, str(value)))


def add_presentation(uid, author, role, patient, title, body, score):
    return x("INSERT INTO presentations(user_id,author,role,patient,case_title,body,score,created_at) VALUES(?,?,?,?,?,?,?,?)",
             (uid, author, role, patient, title, json.dumps(body), score, int(time.time())))


def recent_presentations(n=15):
    rows = q("SELECT * FROM presentations ORDER BY id DESC LIMIT ?", (n,))
    return [{"id": r["id"], "uid": r["user_id"], "author": r["author"], "role": r["role"], "patient": r["patient"],
             "title": r["case_title"], "body": json.loads(r["body"]), "score": r["score"],
             "endorsements": r["endorsements"], "ts": r["created_at"]} for r in rows]


def endorse(pres_id, uid):
    pres = q1("SELECT user_id FROM presentations WHERE id=?", (pres_id,))
    if not pres or pres["user_id"] == uid:
        return None
    with _lock:
        cur = _conn.execute("INSERT OR IGNORE INTO endorsements(pres_id,user_id) VALUES(?,?)", (pres_id, uid))
        if cur.rowcount == 0:
            _conn.commit()
            return None
        _conn.execute("UPDATE presentations SET endorsements=endorsements+1 WHERE id=?", (pres_id,))
        _conn.commit()
    return pres["user_id"]


def admin_stats():
    today, since7, since30 = day(), day(-6), day(-29)
    start_today = int(datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
    one = lambda sql, a=(): list(q1(sql, a).values())[0] or 0

    days = [day(-i) for i in range(29, -1, -1)]
    visits = {r["day"]: r for r in q("SELECT day, COUNT(*) v, COUNT(DISTINCT vid) u FROM visits WHERE day>=? GROUP BY day", (since30,))}
    signups = {r["created_day"]: r["n"] for r in q("SELECT created_day, COUNT(*) n FROM users WHERE created_day>=? GROUP BY created_day", (since30,))}
    active = {r["day"]: r["n"] for r in q("SELECT day, COUNT(*) n FROM activity WHERE day>=? GROUP BY day", (since30,))}
    series = [{"day": d, "visits": visits.get(d, {}).get("v", 0), "unique": visits.get(d, {}).get("u", 0),
               "signups": signups.get(d, 0), "active": active.get(d, 0)} for d in days]

    return {
        "players_total": one("SELECT COUNT(*) FROM users"),
        "players_today": one("SELECT COUNT(*) FROM users WHERE created_at>=?", (start_today,)),
        "players_7d": one("SELECT COUNT(*) FROM users WHERE created_day>=?", (since7,)),
        "active_today": one("SELECT COUNT(*) FROM activity WHERE day=?", (today,)),
        "active_7d": one("SELECT COUNT(DISTINCT user_id) FROM activity WHERE day>=?", (since7,)),
        "active_30d": one("SELECT COUNT(DISTINCT user_id) FROM activity WHERE day>=?", (since30,)),
        "visits_today": one("SELECT COUNT(*) FROM visits WHERE day=?", (today,)),
        "visits_7d": one("SELECT COUNT(*) FROM visits WHERE day>=?", (since7,)),
        "visits_all": one("SELECT COUNT(*) FROM visits"),
        "unique_today": one("SELECT COUNT(DISTINCT vid) FROM visits WHERE day=?", (today,)),
        "unique_7d": one("SELECT COUNT(DISTINCT vid) FROM visits WHERE day>=?", (since7,)),
        "unique_30d": one("SELECT COUNT(DISTINCT vid) FROM visits WHERE day>=?", (since30,)),
        "series": series,
        "roles": q("SELECT role, COUNT(*) n FROM users GROUP BY role ORDER BY n DESC"),
        "institutions": q("SELECT institution, COUNT(*) n FROM users WHERE institution<>'' GROUP BY LOWER(institution) ORDER BY n DESC LIMIT 10"),
        "referrers": q("SELECT ref, COUNT(*) n FROM visits WHERE day>=? AND ref<>'' GROUP BY ref ORDER BY n DESC LIMIT 10", (since30,)),
        "top_players": q("SELECT name, role, institution, xp FROM users ORDER BY xp DESC LIMIT 10"),
        "game_today": {r["key"]: r["n"] for r in q("SELECT key, n FROM game_stats WHERE day=?", (today,))},
        "game_all": {r["key"]: r["n"] for r in q("SELECT key, SUM(n) n FROM game_stats GROUP BY key")},
    }

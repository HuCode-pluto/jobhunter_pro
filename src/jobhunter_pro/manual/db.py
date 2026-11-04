"""手动流水线的 SQLite CRUD 助手（表名统一 manual_ 前缀，避免与采集侧 jobs 表冲突）。

约定：连接由调用方持有并关闭（与 jobhunter_pro.db.get_db 的 house 模式一致）。
"""
import sqlite3
from pathlib import Path

# 岗位状态流转：new → matched → interested → applied → interview → offer/rejected
JOB_STATUSES = ["new", "matched", "interested", "applied", "interview", "offer", "rejected"]

# 种子资料随包分发（pyproject artifacts: src/jobhunter_pro/data/*.sql），
# editable 与 wheel 安装下都位于包目录旁的 data/。
_DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def seed_manual_materials(conn: sqlite3.Connection) -> int:
    """导入学习资料种子库（包内 data/seed_materials*.sql 全部执行），返回新增条数。"""
    before = conn.execute("SELECT COUNT(*) FROM manual_materials").fetchone()[0]
    for sql_file in sorted(_DATA_DIR.glob("seed_materials*.sql")):
        conn.executescript(sql_file.read_text(encoding="utf-8"))
    conn.commit()
    after = conn.execute("SELECT COUNT(*) FROM manual_materials").fetchone()[0]
    return after - before


# ---------- 岗位 ----------

def insert_manual_job(conn: sqlite3.Connection, fields: dict) -> int:
    cols = ", ".join(fields.keys())
    marks = ", ".join("?" * len(fields))
    cur = conn.execute(
        f"INSERT INTO manual_jobs ({cols}) VALUES ({marks})", list(fields.values())
    )
    conn.commit()
    return cur.lastrowid


def get_manual_job(conn: sqlite3.Connection, job_id: int):
    return conn.execute("SELECT * FROM manual_jobs WHERE id = ?", (job_id,)).fetchone()


def list_manual_jobs(conn: sqlite3.Connection, role=None, status=None, min_score=None, limit=100):
    sql, args = "SELECT * FROM manual_jobs WHERE 1=1", []
    if role:
        sql += " AND role_type = ?"
        args.append(role)
    if status:
        sql += " AND status = ?"
        args.append(status)
    if min_score is not None:
        sql += " AND match_score >= ?"
        args.append(min_score)
    sql += " ORDER BY COALESCE(match_score, 0) DESC, id DESC LIMIT ?"
    args.append(limit)
    return conn.execute(sql, args).fetchall()


def update_manual_job(conn: sqlite3.Connection, job_id: int, **fields):
    sets = ", ".join(f"{k} = ?" for k in fields)
    sets += ", updated_at = CURRENT_TIMESTAMP"
    conn.execute(
        f"UPDATE manual_jobs SET {sets} WHERE id = ?", [*fields.values(), job_id]
    )
    conn.commit()


# ---------- 投递台账 ----------

def add_manual_application(conn: sqlite3.Connection, job_id: int, files: dict, note="") -> int:
    cur = conn.execute(
        "INSERT INTO manual_applications (job_id, resume_file, greeting_file, cover_letter_file, notes) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            job_id,
            files.get("resume", ""),
            files.get("greeting", ""),
            files.get("cover_letter", ""),
            note,
        ),
    )
    conn.commit()
    return cur.lastrowid


def get_manual_application(conn: sqlite3.Connection, job_id: int):
    return conn.execute(
        "SELECT * FROM manual_applications WHERE job_id = ? ORDER BY id DESC LIMIT 1",
        (job_id,),
    ).fetchone()


def update_manual_application(conn: sqlite3.Connection, job_id: int, status: str, note=""):
    conn.execute(
        "UPDATE manual_applications SET status = ?, notes = CASE WHEN ? != '' THEN ? ELSE notes END, "
        "submitted_at = CASE WHEN ? = 'submitted' THEN CURRENT_TIMESTAMP ELSE submitted_at END "
        "WHERE job_id = ?",
        (status, note, note, status, job_id),
    )
    conn.commit()


def update_manual_application_note(conn: sqlite3.Connection, job_id: int, note: str):
    """只追加备注，不改状态（避免把 submitted 误改回 drafted）。"""
    conn.execute("UPDATE manual_applications SET notes = ? WHERE job_id = ?", (note, job_id))
    conn.commit()


# ---------- 技能统计 ----------

def upsert_manual_skill(conn: sqlite3.Connection, name: str, role_type: str, category: str):
    """技能点出现一次 frequency+1（跨 JD 统计频次）。"""
    conn.execute(
        "INSERT INTO manual_skills (name, role_type, category, frequency) VALUES (?, ?, ?, 1) "
        "ON CONFLICT(name, role_type) DO UPDATE SET frequency = frequency + 1",
        (name, role_type, category),
    )
    conn.commit()


def list_manual_skills(conn: sqlite3.Connection, role=None, limit=200):
    sql, args = "SELECT * FROM manual_skills WHERE 1=1", []
    if role:
        sql += " AND role_type = ?"
        args.append(role)
    sql += " ORDER BY frequency DESC, id LIMIT ?"
    args.append(limit)
    return conn.execute(sql, args).fetchall()


# ---------- 面试复盘 ----------

def insert_manual_interview(conn: sqlite3.Connection, fields: dict) -> int:
    cols = ", ".join(fields.keys())
    marks = ", ".join("?" * len(fields))
    cur = conn.execute(f"INSERT INTO manual_interviews ({cols}) VALUES ({marks})", list(fields.values()))
    conn.commit()
    return cur.lastrowid


def update_manual_interview(conn: sqlite3.Connection, iid: int, **fields):
    sets = ", ".join(f"{k} = ?" for k in fields)
    conn.execute(f"UPDATE manual_interviews SET {sets} WHERE id = ?", [*fields.values(), iid])
    conn.commit()


def get_manual_interview(conn: sqlite3.Connection, iid: int):
    return conn.execute("SELECT * FROM manual_interviews WHERE id = ?", (iid,)).fetchone()


def list_manual_interviews(conn: sqlite3.Connection, limit=50):
    return conn.execute("SELECT * FROM manual_interviews ORDER BY id DESC LIMIT ?", (limit,)).fetchall()


def save_manual_interview_questions(conn: sqlite3.Connection, iid: int, questions: list[dict]):
    conn.execute("DELETE FROM manual_interview_questions WHERE interview_id = ?", (iid,))
    for q in questions:
        conn.execute(
            "INSERT INTO manual_interview_questions "
            "(interview_id, seq, question, category, your_answer, your_answer_rating, reference_answer, gap) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                iid, q.get("seq", 0), q.get("question", ""), q.get("category", ""),
                q.get("your_answer", ""), q.get("your_answer_rating", 0),
                q.get("reference_answer", ""), q.get("gap", ""),
            ),
        )
    conn.commit()


def get_manual_interview_questions(conn: sqlite3.Connection, iid: int):
    return conn.execute(
        "SELECT * FROM manual_interview_questions WHERE interview_id = ? ORDER BY seq", (iid,)
    ).fetchall()


def rebuild_manual_question_bank(conn: sqlite3.Connection):
    """把面试问题聚合进题库：同一问题按方向去重，频次=出现过的面试场数。

    只重建真实面试来源（source='interview'），准备包预测题（source='prep'）保留不动。
    """
    rows = conn.execute(
        "SELECT q.question, q.category, COALESCE(j.role_type, '') AS role_type, "
        "COUNT(DISTINCT q.interview_id) AS freq, "
        "(SELECT q2.reference_answer FROM manual_interview_questions q2 "
        " WHERE q2.question = q.question AND q2.reference_answer != '' "
        " ORDER BY q2.id DESC LIMIT 1) AS ref_answer "
        "FROM manual_interview_questions q "
        "LEFT JOIN manual_interviews i ON i.id = q.interview_id "
        "LEFT JOIN manual_jobs j ON j.id = i.job_id "
        "GROUP BY q.question, COALESCE(j.role_type, '')"
    ).fetchall()
    conn.execute("DELETE FROM manual_question_bank WHERE source != 'prep'")
    for r in rows:
        conn.execute(
            "INSERT INTO manual_question_bank (question, role_type, category, frequency, reference_answer) "
            "VALUES (?, ?, ?, ?, ?)",
            (r["question"], r["role_type"], r["category"], r["freq"], r["ref_answer"] or ""),
        )
    conn.commit()


def upsert_manual_prep_question(conn: sqlite3.Connection, question: str, role_type: str, answer: str):
    """准备包预测题入题库：已有（含真实面试题）则频次+1（保留面试答案），否则新增为预测来源。"""
    row = conn.execute(
        "SELECT id, source FROM manual_question_bank WHERE question = ? AND role_type = ?",
        (question, role_type),
    ).fetchone()
    if row:
        conn.execute(
            "UPDATE manual_question_bank SET frequency = frequency + 1 WHERE id = ?", (row["id"],)
        )
        if row["source"] == "prep" and answer:
            conn.execute(
                "UPDATE manual_question_bank SET reference_answer = ? WHERE id = ?", (answer, row["id"])
            )
    else:
        conn.execute(
            "INSERT INTO manual_question_bank (question, role_type, category, frequency, reference_answer, source) "
            "VALUES (?, ?, '预测考点', 1, ?, 'prep')",
            (question, role_type, answer),
        )
    conn.commit()


def list_manual_question_bank(conn: sqlite3.Connection, role=None, limit=200):
    sql, args = "SELECT * FROM manual_question_bank WHERE 1=1", []
    if role:
        sql += " AND role_type = ?"
        args.append(role)
    sql += " ORDER BY frequency DESC, id LIMIT ?"
    args.append(limit)
    return conn.execute(sql, args).fetchall()


# ---------- 模拟面试 ----------

def insert_manual_mock_session(conn: sqlite3.Connection, fields: dict) -> int:
    cols = ", ".join(fields.keys())
    marks = ", ".join("?" * len(fields))
    cur = conn.execute(f"INSERT INTO manual_mock_sessions ({cols}) VALUES ({marks})", list(fields.values()))
    conn.commit()
    return cur.lastrowid


def get_manual_mock_session(conn: sqlite3.Connection, sid: int):
    return conn.execute("SELECT * FROM manual_mock_sessions WHERE id = ?", (sid,)).fetchone()


def update_manual_mock_session(conn: sqlite3.Connection, sid: int, **fields):
    sets = ", ".join(f"{k} = ?" for k in fields)
    conn.execute(f"UPDATE manual_mock_sessions SET {sets} WHERE id = ?", [*fields.values(), sid])
    conn.commit()


# ---------- Offer 对比 ----------

def insert_manual_offer(conn: sqlite3.Connection, fields: dict) -> int:
    cols = ", ".join(fields.keys())
    marks = ", ".join("?" * len(fields))
    cur = conn.execute(f"INSERT INTO manual_offers ({cols}) VALUES ({marks})", list(fields.values()))
    conn.commit()
    return cur.lastrowid


def update_manual_offer(conn: sqlite3.Connection, oid: int, **fields):
    sets = ", ".join(f"{k} = ?" for k in fields)
    conn.execute(f"UPDATE manual_offers SET {sets} WHERE id = ?", [*fields.values(), oid])
    conn.commit()


def delete_manual_offer(conn: sqlite3.Connection, oid: int):
    conn.execute("DELETE FROM manual_offers WHERE id = ?", (oid,))
    conn.commit()


def list_manual_offers(conn: sqlite3.Connection):
    return conn.execute("SELECT * FROM manual_offers ORDER BY id DESC").fetchall()


# ---------- 学习资料 ----------

def match_manual_materials(conn: sqlite3.Connection, skill_name: str, top=4):
    """按关键词与技能点做子串匹配，返回最相关的学习资料。"""
    rows = conn.execute("SELECT * FROM manual_materials").fetchall()
    name_lower = skill_name.lower()
    scored = []
    for r in rows:
        keywords = [k.strip().lower() for k in r["keywords"].split(",") if k.strip()]
        score = sum(1 for k in keywords if k in name_lower)
        if score > 0:
            scored.append((score, r))
    scored.sort(key=lambda x: -x[0])
    return [r for _, r in scored[:top]]

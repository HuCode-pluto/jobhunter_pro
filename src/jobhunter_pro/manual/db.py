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


# ---------- 岗位(并入采集侧 jobs 表，source_platform='manual' 为手动岗位) ----------

LIBRARY_JOB_FIELDS = (
    "id", "title", "company", "salary", "city", "experience", "education",
    "recruitment_type", "jd", "hr_name", "hr_title", "hr_active",
    "company_size", "company_industry", "url", "score", "score_reason",
    "greeting", "status", "source_platform", "source_job_id", "source_keyword",
    "source_city_code", "role_type", "jd_json", "red_flags", "missing_skills",
    "reject_reason", "salary_note", "years_required", "education_required",
    "salary_min", "salary_max",
)


def insert_library_job(conn: sqlite3.Connection, fields: dict) -> str:
    """把手动解析的岗位写入 jobs 表(来源 manual)，返回 job_id(TEXT)。"""
    from uuid import uuid4

    job_id = str(fields.get("id") or f"manual-{uuid4().hex[:12]}")
    values = {"id": job_id}
    for key in LIBRARY_JOB_FIELDS:
        if key == "id":
            continue
        if key in fields:
            values[key] = fields[key]
    cols = ", ".join(values.keys())
    marks = ", ".join("?" * len(values))
    conn.execute(f"INSERT OR IGNORE INTO jobs ({cols}) VALUES ({marks})", list(values.values()))
    conn.commit()
    return job_id


def get_library_job(conn: sqlite3.Connection, job_id: str):
    return conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()


def _salary_range_from_text(salary_text: str) -> tuple[float | None, float | None]:
    """从薪资文本(如 '18-28K·14薪'、'3万-5万')解析月薪区间(元)。"""
    import re

    text = str(salary_text or "")
    m = re.search(r"(\d+(?:\.\d+)?)\s*[Kk]\s*-\s*(\d+(?:\.\d+)?)\s*[Kk]", text)
    if m:
        return float(m.group(1)) * 1000, float(m.group(2)) * 1000
    m = re.search(r"(\d+(?:\.\d+)?)\s*万\s*-\s*(\d+(?:\.\d+)?)\s*万", text)
    if m:
        return float(m.group(1)) * 10000, float(m.group(2)) * 10000
    m = re.search(r"(\d+(?:\.\d+)?)\s*[Kk]", text)
    if m:
        value = float(m.group(1)) * 1000
        return value, value
    return None, None


def list_library_jobs(
    conn: sqlite3.Connection,
    source=None, role=None, status=None, min_score=None, keyword=None,
    deleted="active", sort="score", order="desc", offset=0, limit=100,
    blocked_companies=None, created_within=None, salary_min=None, salary_max=None,
    education=None, recruitment_type=None, city=None,
):
    """统一岗位库列表：手动 + 采集岗位合并视图。

    source: 'manual'(手动粘贴)/'collected'(平台采集)/None(全部)；
    keyword 匹配标题/公司；status 过滤岗位状态(手动或 house 状态都按原值匹配)；
    deleted: 'active' 正常岗位 / 'only' 仅回收站 / 'all' 全部；
    sort: 'score'|'created'，order: 'desc'|'asc'。返回 (rows, total)。
    """
    where, args = "WHERE 1=1", []
    if deleted == "active":
        where += " AND deleted_at IS NULL"
    elif deleted == "only":
        where += " AND deleted_at IS NOT NULL"
    if source == "manual":
        where += " AND source_platform = 'manual'"
    elif source == "collected":
        where += " AND (source_platform IS NULL OR source_platform != 'manual')"
    if role:
        where += " AND role_type = ?"
        args.append(role)
    if status:
        where += " AND status = ?"
        args.append(status)
    if min_score is not None:
        where += " AND score >= ?"
        args.append(min_score)
    if keyword:
        where += " AND (title LIKE ? OR company LIKE ?)"
        args += [f"%{keyword}%", f"%{keyword}%"]
    if created_within in {"today", "3d", "7d"}:
        days = {"today": 1, "3d": 3, "7d": 7}[created_within]
        where += " AND created_at >= datetime('now', ?)"
        args.append(f"-{days} days")
    if education:
        where += " AND (education LIKE ? OR education_required LIKE ?)"
        args += [f"%{education}%", f"%{education}%"]
    if recruitment_type:
        where += " AND recruitment_type = ?"
        args.append(recruitment_type)
    if city:
        where += " AND city LIKE ?"
        args.append(f"%{city}%")
    total = conn.execute(f"SELECT COUNT(*) FROM jobs {where}", args).fetchone()[0]
    order_clause = "created_at" if sort == "created" else "COALESCE(score, 0)"
    direction = "ASC" if order == "asc" else "DESC"
    # 排序必须在 SQL 分页前完成，否则每一页只会在本页内重新排序。
    rows_holder = conn.execute(
        f"SELECT * FROM jobs {where} ORDER BY {order_clause} {direction}, id DESC LIMIT ? OFFSET ?",
        [*args, limit, offset],
    ).fetchall()
    salary_active = salary_min is not None or salary_max is not None
    if salary_active:
        # 薪资区间过滤:手动岗位用 salary_min/max 列,采集岗位解析薪资文本
        def _overlaps(row):
            low, high = row["salary_min"], row["salary_max"]
            if not low and not high:
                low, high = _salary_range_from_text(row["salary"])
            if not low and not high:
                return True  # 薪资未知不过滤
            if salary_min is not None and high is not None and high < salary_min:
                return False
            if salary_max is not None and low is not None and low > salary_max:
                return False
            return True

        rows_holder = [row for row in rows_holder if _overlaps(row)]
        # 薪资过滤在当前分页窗口内执行(与原岗位池前端过滤口径一致),total 同步近似
        total = len(rows_holder)
    rows = rows_holder
    if blocked_companies:
        from jobhunter_pro.job_filters import matching_blocked_company

        rows = [
            row for row in rows
            if matching_blocked_company(row["company"], blocked_companies) is None
        ]
    return rows, total


def recycle_filtered_jobs(conn: sqlite3.Connection, reason="已过滤岗位移入回收站") -> dict[str, int]:
    """Move every active filtered job into the recycle bin."""
    from jobhunter_pro.db import soft_delete_jobs

    ids = [
        str(row["id"])
        for row in conn.execute(
            "SELECT id FROM jobs WHERE deleted_at IS NULL AND status = 'filtered'"
        ).fetchall()
    ]
    if not ids:
        return {"requested_count": 0, "count": 0}
    result = soft_delete_jobs(conn, ids, confirmed=True, reason=reason)
    return {"requested_count": len(ids), "count": int(result.get("affected_count", 0))}


def update_library_job(conn: sqlite3.Connection, job_id: str, **fields):
    sets = ", ".join(f"{k} = ?" for k in fields)
    sets += ", updated_at = CURRENT_TIMESTAMP"
    conn.execute(f"UPDATE jobs SET {sets} WHERE id = ?", [*fields.values(), job_id])
    conn.commit()


# ---------- 投递台账(applications，TEXT job_id) ----------

def add_library_application(conn: sqlite3.Connection, job_id: str, files: dict, note="") -> int:
    cur = conn.execute(
        "INSERT INTO applications (job_id, resume_file, greeting_file, cover_letter_file, notes) "
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


def get_library_application(conn: sqlite3.Connection, job_id: str):
    return conn.execute(
        "SELECT * FROM applications WHERE job_id = ? ORDER BY id DESC LIMIT 1",
        (job_id,),
    ).fetchone()


def update_library_application(conn: sqlite3.Connection, job_id: str, status: str, note=""):
    conn.execute(
        "UPDATE applications SET status = ?, notes = CASE WHEN ? != '' THEN ? ELSE notes END, "
        "submitted_at = CASE WHEN ? = 'submitted' THEN CURRENT_TIMESTAMP ELSE submitted_at END "
        "WHERE job_id = ?",
        (status, note, note, status, job_id),
    )
    conn.commit()


def update_library_application_note(conn: sqlite3.Connection, job_id: str, note: str):
    """只追加备注，不改状态(避免把 submitted 误改回 drafted)。"""
    conn.execute("UPDATE applications SET notes = ? WHERE job_id = ?", (note, job_id))
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
        "LEFT JOIN jobs j ON j.id = i.job_id "
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

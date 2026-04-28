import os
import sqlite3
from contextlib import contextmanager

from flask import Flask, jsonify, redirect, render_template, request, url_for
from flask_login import (
    LoginManager,
    UserMixin,
    current_user,
    login_required,
    login_user,
    logout_user,
)
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__, template_folder="templates")
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "mindlaw-dev-secret")


class MindLawDB:
    def __init__(self) -> None:
        self.database_url = os.getenv("DATABASE_URL", "sqlite:///mindlaw_intel_v2.db")
        self.db_path = self._resolve_sqlite_path(self.database_url)

    @staticmethod
    def _resolve_sqlite_path(database_url: str) -> str:
        if database_url.startswith("sqlite:///"):
            sqlite_path = database_url.replace("sqlite:///", "", 1)
            if os.path.isabs(sqlite_path):
                return sqlite_path
            base_dir = os.path.dirname(os.path.abspath(__file__))
            return os.path.join(base_dir, sqlite_path)
        raise ValueError("DATABASE_URL atual deve usar sqlite:///caminho_do_arquivo.db")

    @contextmanager
    def connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def init_db(self) -> None:
        with self.connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS churn (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    data_registro TEXT,
                    cliente TEXT,
                    temas TEXT,
                    motivo TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    data_registro TEXT,
                    cliente TEXT,
                    nota INTEGER,
                    descricao TEXT
                )
                """
            )
            conn.commit()
        self.seed_default_user()

    def seed_default_user(self) -> None:
        default_username = os.getenv("DEFAULT_ADMIN_USERNAME", "admin")
        default_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "mindlaw123")
        with self.connection() as conn:
            existing = conn.execute(
                "SELECT id FROM users WHERE username = ?", (default_username,)
            ).fetchone()
            if not existing:
                conn.execute(
                    "INSERT INTO users (username, password) VALUES (?, ?)",
                    (default_username, generate_password_hash(default_password)),
                )
                conn.commit()

    def find_user_by_id(self, user_id: int):
        with self.connection() as conn:
            return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    def find_user_by_username(self, username: str):
        with self.connection() as conn:
            return conn.execute(
                "SELECT * FROM users WHERE username = ?", (username,)
            ).fetchone()

    def list_data(self):
        with self.connection() as conn:
            churns = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM churn ORDER BY data_registro DESC, id DESC"
                ).fetchall()
            ]
            feedbacks = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM feedback ORDER BY data_registro DESC, id DESC"
                ).fetchall()
            ]
            return {"churns": churns, "feedbacks": feedbacks}

    def add_churn(self, payload: dict) -> None:
        with self.connection() as conn:
            temas = payload.get("temas", [])
            temas_str = ", ".join(temas) if isinstance(temas, list) else str(temas)
            conn.execute(
                "INSERT INTO churn (data_registro, cliente, temas, motivo) VALUES (?, ?, ?, ?)",
                (
                    payload.get("data_registro"),
                    payload.get("cliente"),
                    temas_str,
                    payload.get("motivo"),
                ),
            )
            conn.commit()

    def update_churn(self, churn_id: int, payload: dict) -> None:
        with self.connection() as conn:
            conn.execute(
                "UPDATE churn SET data_registro=?, cliente=?, temas=?, motivo=? WHERE id=?",
                (
                    payload.get("data_registro"),
                    payload.get("cliente"),
                    payload.get("temas", ""),
                    payload.get("motivo"),
                    churn_id,
                ),
            )
            conn.commit()

    def delete_churn(self, churn_id: int) -> None:
        with self.connection() as conn:
            conn.execute("DELETE FROM churn WHERE id = ?", (churn_id,))
            conn.commit()

    def add_feedback(self, payload: dict) -> None:
        with self.connection() as conn:
            conn.execute(
                "INSERT INTO feedback (data_registro, cliente, nota, descricao) VALUES (?, ?, ?, ?)",
                (
                    payload.get("data_registro"),
                    payload.get("cliente"),
                    int(payload.get("nota", 0)),
                    payload.get("descricao"),
                ),
            )
            conn.commit()

    def update_feedback(self, feedback_id: int, payload: dict) -> None:
        with self.connection() as conn:
            conn.execute(
                "UPDATE feedback SET data_registro=?, cliente=?, nota=?, descricao=? WHERE id=?",
                (
                    payload.get("data_registro"),
                    payload.get("cliente"),
                    int(payload.get("nota", 0)),
                    payload.get("descricao"),
                    feedback_id,
                ),
            )
            conn.commit()

    def delete_feedback(self, feedback_id: int) -> None:
        with self.connection() as conn:
            conn.execute("DELETE FROM feedback WHERE id = ?", (feedback_id,))
            conn.commit()


db = MindLawDB()
db.init_db()


class User(UserMixin):
    def __init__(self, row) -> None:
        self.id = str(row["id"])
        self.username = row["username"]
        self.password_hash = row["password"]


login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login"


@login_manager.user_loader
def load_user(user_id):
    row = db.find_user_by_id(int(user_id))
    return User(row) if row else None


@login_manager.unauthorized_handler
def unauthorized_handler():
    if request.path.startswith("/api/"):
        return jsonify({"error": "Não autenticado"}), 401
    return redirect(url_for("login"))


@app.route("/")
def home():
    if not current_user.is_authenticated:
        return redirect(url_for("login"))
    return render_template("index.html", username=current_user.username)


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        row = db.find_user_by_username(username)
        if row and check_password_hash(row["password"], password):
            login_user(User(row))
            return redirect(url_for("home"))
        return render_template(
            "login.html",
            error="Credenciais inválidas. Tente novamente.",
            username=username,
        )

    if current_user.is_authenticated:
        return redirect(url_for("home"))
    return render_template("login.html", error=None, username="")


@app.route("/logout", methods=["POST"])
@login_required
def logout():
    logout_user()
    return redirect(url_for("login"))


@app.route("/api/data", methods=["GET"])
@login_required
def get_data():
    return jsonify(db.list_data())


@app.route("/api/churn", methods=["POST"])
@login_required
def add_churn():
    payload = request.get_json(silent=True) or {}
    db.add_churn(payload)
    return jsonify({"status": "ok"}), 201


@app.route("/api/feedback", methods=["POST"])
@login_required
def add_feedback():
    payload = request.get_json(silent=True) or {}
    db.add_feedback(payload)
    return jsonify({"status": "ok"}), 201


@app.route("/api/churn/<int:churn_id>", methods=["PUT", "DELETE"])
@login_required
def manage_churn(churn_id: int):
    if request.method == "DELETE":
        db.delete_churn(churn_id)
        return jsonify({"status": "deleted"})
    payload = request.get_json(silent=True) or {}
    db.update_churn(churn_id, payload)
    return jsonify({"status": "updated"})


@app.route("/api/feedback/<int:feedback_id>", methods=["PUT", "DELETE"])
@login_required
def manage_feedback(feedback_id: int):
    if request.method == "DELETE":
        db.delete_feedback(feedback_id)
        return jsonify({"status": "deleted"})
    payload = request.get_json(silent=True) or {}
    db.update_feedback(feedback_id, payload)
    return jsonify({"status": "updated"})


if __name__ == "__main__":
    app.run(port=5000, debug=True)
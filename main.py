import sys
import os
import threading
from PyQt5.QtCore import QUrl
from PyQt5.QtWidgets import QApplication, QMainWindow
from PyQt5.QtWebEngineWidgets import QWebEngineView

def resource_path(relative_path):
    """ Retorna o caminho absoluto para recursos (HTML, etc) """
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# Configuração da persistência do banco na pasta do .exe
if getattr(sys, 'frozen', False):
    current_dir = os.path.dirname(sys.executable)
else:
    current_dir = os.path.dirname(os.path.abspath(__file__))

# Mantém compatibilidade em execução desktop, apontando o DATABASE_URL para a pasta local
os.environ.setdefault("DATABASE_URL", f"sqlite:///{os.path.join(current_dir, 'mindlaw_intel_v2.db')}")

import app as backend

def run_flask():
    backend.app.run(port=5000, debug=False, use_reloader=False)

class MindLawApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('MindLaw - Intelligence Hub')
        self.resize(1280, 800)
        self.browser = QWebEngineView()
        self.browser.setUrl(QUrl("http://127.0.0.1:5000/")) 
        self.setCentralWidget(self.browser)

if __name__ == '__main__':
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    qt_app = QApplication(sys.argv)
    window = MindLawApp()
    window.show()
    sys.exit(qt_app.exec_())
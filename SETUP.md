# FastAPI Backend Setup

## 1. Create a virtual environment

PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

Command Prompt:

```bat
python -m venv .venv
.venv\Scripts\activate.bat
```

macOS / Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

## 2. Install dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

## 3. Run the development server

```bash
uvicorn main:app --reload
```

The API will be available at:

- `http://127.0.0.1:8000/`
- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/docs`

## 4. Freeze dependencies after changes

```bash
pip freeze > requirements.txt
```

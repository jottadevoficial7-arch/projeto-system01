    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE,
      password_hash TEXT, password_salt TEXT, is_demo INTEGER NOT NULL DEFAULT 0,
      avatar TEXT NOT NULL DEFAULT 'spark', goal TEXT NOT NULL DEFAULT '',
      daily_minutes INTEGER NOT NULL DEFAULT 30, created_at TEXT NOT NULL,
      discipline INTEGER NOT NULL DEFAULT 100 CHECK(discipline BETWEEN 0 AND 100),
      last_assessed TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL,
      difficulty TEXT NOT NULL, duration INTEGER NOT NULL, frequency TEXT NOT NULL,
      time TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS missions_user ON missions(user_id, active);
    CREATE TABLE IF NOT EXISTS completions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mission_id TEXT NOT NULL REFERENCES missions(id), period_key TEXT NOT NULL,
      title TEXT NOT NULL, normalized_title TEXT NOT NULL, category TEXT NOT NULL,
      difficulty TEXT NOT NULL, xp INTEGER NOT NULL CHECK(xp BETWEEN 0 AND 150),
      date TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(mission_id, period_key), UNIQUE(mission_id, date),
      UNIQUE(user_id, normalized_title, date)
    );
    CREATE INDEX IF NOT EXISTS completions_user_date ON completions(user_id, date);
    CREATE TABLE IF NOT EXISTS rest_days (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL,
      created_at TEXT NOT NULL, PRIMARY KEY(user_id, date)
    );
    CREATE TABLE IF NOT EXISTS day_assessments (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL,
      completed INTEGER NOT NULL, scheduled INTEGER NOT NULL, rest INTEGER NOT NULL,
      discipline_delta INTEGER NOT NULL, rules_version INTEGER NOT NULL,
      PRIMARY KEY(user_id, date)
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
    );

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'attendance.db');
const db = new sqlite3.Database(dbPath);

// Enable foreign keys
db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
});

// Helper functions that return promises
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Initialize tables
async function initDatabase() {
  const classesTable = `
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
  `;

  const studentsTable = `
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      roll_number TEXT NOT NULL UNIQUE,
      class_name TEXT NOT NULL,
      parent_name TEXT NOT NULL,
      parent_phone TEXT NOT NULL,
      parent_email TEXT NOT NULL
    );
  `;

  const attendanceTable = `
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Present', 'Absent')),
      absent_reason TEXT,
      marked_by TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
      UNIQUE(student_id, date)
    );
  `;

  const alertsTable = `
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('Info', 'Warning', 'Critical')),
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Resolved')),
      action_taken TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
    );
  `;

  await run(classesTable);
  await run(studentsTable);
  await run(attendanceTable);
  await run(alertsTable);

  // Seed default classes if classes table is empty
  const classCount = await get('SELECT COUNT(*) as count FROM classes');
  if (classCount.count === 0) {
    const defaultClasses = ['Class 10-A', 'Class 10-B', 'Class 11-A'];
    for (let c of defaultClasses) {
      await run('INSERT OR IGNORE INTO classes (name) VALUES (?)', [c]);
    }
  }
  // Auto-import any classes that exist in the students table
  await run('INSERT OR IGNORE INTO classes (name) SELECT DISTINCT class_name FROM students WHERE class_name IS NOT NULL AND class_name != ""');
}

module.exports = {
  db,
  run,
  get,
  all,
  exec,
  initDatabase
};

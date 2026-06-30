const express = require('express');
const cors = require('cors');
const path = require('path');
const { run, get, all, db, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rule-based alert engine
async function runAlertEngine() {
  try {
    // 1. Get all students
    const students = await all('SELECT * FROM students');
    const todayStr = new Date().toISOString().split('T')[0];

    for (let s of students) {
      // Get all attendance for student sorted by date desc
      const attendance = await all(
        'SELECT status, date FROM attendance WHERE student_id = ? ORDER BY date DESC',
        [s.id]
      );

      if (attendance.length === 0) continue;

      // Calculate overall attendance rate
      const presentCount = attendance.filter(r => r.status === 'Present').length;
      const totalCount = attendance.length;
      const attendanceRate = (presentCount / totalCount) * 100;

      // Rule A: Low Attendance Rate (below 75%)
      if (attendanceRate < 75) {
        const severity = attendanceRate < 70 ? 'Critical' : 'Warning';
        const message = `Overall attendance rate is critically low at ${attendanceRate.toFixed(1)}% (threshold: 75%).`;
        
        // Check if pending alert already exists
        const existing = await get(
          "SELECT id FROM alerts WHERE student_id = ? AND alert_type = 'Low Attendance Rate' AND status = 'Pending'",
          [s.id]
        );

        if (!existing) {
          await run(
            `INSERT INTO alerts (student_id, alert_type, severity, message, status, timestamp) 
             VALUES (?, ?, ?, ?, 'Pending', ?)`,
            [s.id, 'Low Attendance Rate', severity, message, new Date().toISOString()]
          );
        }
      }

      // Rule B: 3+ Consecutive Absences
      // Scan attendance from latest to oldest to find consecutive absences
      let consecutiveAbsences = 0;
      for (let att of attendance) {
        if (att.status === 'Absent') {
          consecutiveAbsences++;
        } else {
          break; // Stop when we hit a 'Present'
        }
      }

      if (consecutiveAbsences >= 3) {
        const severity = consecutiveAbsences >= 4 ? 'Critical' : 'Warning';
        const message = `Student was absent for ${consecutiveAbsences} consecutive marked days.`;

        // Check if pending alert already exists
        const existing = await get(
          "SELECT id FROM alerts WHERE student_id = ? AND alert_type = 'Consecutive Absence' AND status = 'Pending'",
          [s.id]
        );

        if (!existing) {
          await run(
            `INSERT INTO alerts (student_id, alert_type, severity, message, status, timestamp) 
             VALUES (?, ?, ?, ?, 'Pending', ?)`,
            [s.id, 'Consecutive Absence', severity, message, new Date().toISOString()]
          );
        }
      }
    }
  } catch (err) {
    console.error('Error running alert engine:', err);
  }
}

// Ensure database is initialized on startup
initDatabase().then(() => {
  console.log('Database connected and initialized.');
  runAlertEngine(); // Run on startup
});

// API Routes

// 1. GET /api/classes
app.get('/api/classes', async (req, res) => {
  try {
    const rows = await all('SELECT name FROM classes ORDER BY name');
    const classes = rows.map(r => r.name);
    res.json({ success: true, classes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1b. POST /api/classes
app.post('/api/classes', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ success: false, error: 'Class name is required' });
    }
    const trimmedName = name.trim();
    
    const existing = await get('SELECT id FROM classes WHERE name = ?', [trimmedName]);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Class already exists' });
    }

    await run('INSERT INTO classes (name) VALUES (?)', [trimmedName]);
    res.json({ success: true, message: 'Class registered successfully', class_name: trimmedName });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1c. POST /api/students
app.post('/api/students', async (req, res) => {
  try {
    const { name, roll_number, class_name, parent_name, parent_phone, parent_email } = req.body;
    if (!name || !roll_number || !class_name || !parent_name || !parent_phone || !parent_email) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    const tName = name.trim();
    const tRoll = roll_number.trim();
    const tClass = class_name.trim();
    const tParentName = parent_name.trim();
    const tParentPhone = parent_phone.trim();
    const tParentEmail = parent_email.trim();

    if (tName === '' || tRoll === '' || tClass === '' || tParentName === '' || tParentPhone === '' || tParentEmail === '') {
      return res.status(400).json({ success: false, error: 'Fields cannot be whitespace only' });
    }

    // Verify roll number uniqueness
    const existingRoll = await get('SELECT id FROM students WHERE roll_number = ?', [tRoll]);
    if (existingRoll) {
      return res.status(400).json({ success: false, error: 'Roll number already registered to another student' });
    }

    // Ensure the class exists in the classes table
    await run('INSERT OR IGNORE INTO classes (name) VALUES (?)', [tClass]);

    // Insert student
    const result = await run(
      `INSERT INTO students (name, roll_number, class_name, parent_name, parent_phone, parent_email) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tName, tRoll, tClass, tParentName, tParentPhone, tParentEmail]
    );

    res.json({ 
      success: true, 
      message: 'Student enrolled successfully', 
      student: { id: result.id, name: tName, roll_number: tRoll, class_name: tClass } 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// 2. GET /api/students
// Optionally filters by class_name. Returns student details and their calculated overall attendance rate.
// If a date is provided, returns their attendance status for that specific date.
app.get('/api/students', async (req, res) => {
  try {
    const { class_name, date } = req.query;
    let sql = 'SELECT * FROM students';
    const params = [];

    if (class_name) {
      sql += ' WHERE class_name = ?';
      params.push(class_name);
    }
    sql += ' ORDER BY name';

    const students = await all(sql, params);

    // Hydrate each student with stats
    const hydratedStudents = [];
    for (let s of students) {
      // Calculate overall attendance
      const attRecords = await all('SELECT status FROM attendance WHERE student_id = ?', [s.id]);
      const totalDays = attRecords.length;
      const presentDays = attRecords.filter(r => r.status === 'Present').length;
      const attendance_percentage = totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(1) : '100.0';

      // Check attendance for specified date
      let status = 'Present';
      let absent_reason = '';
      if (date) {
        const dayRecord = await get(
          'SELECT status, absent_reason FROM attendance WHERE student_id = ? AND date = ?',
          [s.id, date]
        );
        if (dayRecord) {
          status = dayRecord.status;
          absent_reason = dayRecord.absent_reason || '';
        }
      }

      hydratedStudents.push({
        ...s,
        attendance_percentage: parseFloat(attendance_percentage),
        total_days: totalDays,
        present_days: presentDays,
        status,
        absent_reason
      });
    }

    res.json({ success: true, students: hydratedStudents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. POST /api/attendance
app.post('/api/attendance', async (req, res) => {
  try {
    const { class_name, date, records, marked_by } = req.body;

    if (!class_name || !date || !records || !Array.isArray(records)) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const timestamp = new Date().toISOString();

    // Use a transaction or sequential runs
    db.serialize(async () => {
      try {
        await run('BEGIN TRANSACTION');
        for (let rec of records) {
          const { student_id, status, absent_reason } = rec;
          await run(
            `INSERT INTO attendance (student_id, date, status, absent_reason, marked_by, timestamp) 
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(student_id, date) DO UPDATE SET 
               status = excluded.status, 
               absent_reason = excluded.absent_reason,
               marked_by = excluded.marked_by,
               timestamp = excluded.timestamp`,
            [student_id, date, status, status === 'Absent' ? absent_reason : null, marked_by || 'System', timestamp]
          );
        }
        await run('COMMIT');
        
        // After successfully marking, run alert engine asynchronously
        runAlertEngine();

        res.json({ success: true, message: 'Attendance marked successfully' });
      } catch (txnErr) {
        await run('ROLLBACK');
        res.status(500).json({ success: false, error: txnErr.message });
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. GET /api/reports/dashboard
app.get('/api/reports/dashboard', async (req, res) => {
  try {
    // Total Students
    const studentCountRow = await get('SELECT COUNT(*) as count FROM students');
    const total_students = studentCountRow.count;

    // Overall Attendance Rate
    const attCountRow = await get('SELECT COUNT(*) as total, SUM(CASE WHEN status="Present" THEN 1 ELSE 0 END) as present FROM attendance');
    const overall_attendance_rate = attCountRow.total > 0 ? ((attCountRow.present / attCountRow.total) * 100).toFixed(1) : '100.0';

    // Active Alerts Count (Pending)
    const alertCountRow = await get("SELECT COUNT(*) as count FROM alerts WHERE status = 'Pending'");
    const active_alerts_count = alertCountRow.count;

    // Low Attendance Students Count (<75%)
    const allStudents = await all('SELECT id FROM students');
    let lowAttendanceCount = 0;
    for (let s of allStudents) {
      const recs = await all('SELECT status FROM attendance WHERE student_id = ?', [s.id]);
      if (recs.length > 0) {
        const present = recs.filter(r => r.status === 'Present').length;
        if ((present / recs.length) * 100 < 75) {
          lowAttendanceCount++;
        }
      }
    }

    // Daily Attendance Trend (Last 10 marked dates)
    const trendRows = await all(
      `SELECT date, 
              COUNT(*) as total, 
              SUM(CASE WHEN status="Present" THEN 1 ELSE 0 END) as present 
       FROM attendance 
       GROUP BY date 
       ORDER BY date DESC 
       LIMIT 10`
    );
    // Reverse to chronological order
    const daily_attendance_trend = trendRows.reverse().map(r => ({
      date: r.date,
      percentage: parseFloat(((r.present / r.total) * 100).toFixed(1))
    }));

    // Absent Reason Distribution
    const reasonRows = await all(
      `SELECT absent_reason, COUNT(*) as count 
       FROM attendance 
       WHERE status = 'Absent' AND absent_reason IS NOT NULL AND absent_reason != ''
       GROUP BY absent_reason 
       ORDER BY count DESC`
    );

    res.json({
      success: true,
      dashboard: {
        total_students,
        overall_attendance_rate: parseFloat(overall_attendance_rate),
        active_alerts_count,
        low_attendance_students_count: lowAttendanceCount,
        daily_attendance_trend,
        absent_reason_distribution: reasonRows
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. GET /api/reports/class
app.get('/api/reports/class', async (req, res) => {
  try {
    const { class_name } = req.query;
    if (!class_name) {
      return res.status(400).json({ success: false, error: 'class_name is required' });
    }

    const students = await all('SELECT * FROM students WHERE class_name = ? ORDER BY name', [class_name]);
    const report = [];

    for (let s of students) {
      const records = await all('SELECT status FROM attendance WHERE student_id = ?', [s.id]);
      const total = records.length;
      const present = records.filter(r => r.status === 'Present').length;
      const absent = total - present;
      const rate = total > 0 ? ((present / total) * 100).toFixed(1) : '100.0';

      const pendingAlerts = await all(
        "SELECT alert_type, severity, message FROM alerts WHERE student_id = ? AND status = 'Pending'",
        [s.id]
      );

      report.push({
        id: s.id,
        name: s.name,
        roll_number: s.roll_number,
        total_days: total,
        present_days: present,
        absent_days: absent,
        attendance_percentage: parseFloat(rate),
        alerts: pendingAlerts
      });
    }

    res.json({ success: true, class_name, report });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. GET /api/alerts
app.get('/api/alerts', async (req, res) => {
  try {
    const alerts = await all(`
      SELECT a.*, s.name as student_name, s.roll_number, s.class_name, s.parent_name, s.parent_phone
      FROM alerts a
      JOIN students s ON a.student_id = s.id
      ORDER BY a.status DESC, a.timestamp DESC
    `);
    res.json({ success: true, alerts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. POST /api/alerts/:id/resolve
app.post('/api/alerts/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const { action_taken } = req.body;

    if (!action_taken) {
      return res.status(400).json({ success: false, error: 'action_taken is required' });
    }

    await run(
      "UPDATE alerts SET status = 'Resolved', action_taken = ? WHERE id = ?",
      [action_taken, id]
    );

    res.json({ success: true, message: 'Alert resolved successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. POST /api/ai/query
// A rule-based local query processor that mimics LLM functionality to answer natural language questions about attendance and admissions.
app.post('/api/ai/query', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is empty' });
    }

    const q = query.toLowerCase().trim();

    // 1. Admission / Fees queries
    if (q.includes('admission') || q.includes('fee') || q.includes('cost') || q.includes('join')) {
      const response = `**Admission & Fee Structure FAQ Response (Sri Gowthami Educational Institutions):**
- **Admissions**: Open for Classes 1 to 12 (CBSE & State Board curriculums).
- **Fee Structure**:
  - Primary (1-5): ₹25,000 - ₹35,000 per annum
  - Middle School (6-8): ₹40,000 - ₹50,000 per annum
  - High School (9-10): ₹60,000 - ₹75,000 per annum
  - Higher Secondary (11-12): ₹85,000 - ₹1,10,000 per annum (includes lab charges)
- **Hostel / Mess Fees**: ₹50,000 additional per annum (including accommodation, laundry, and multi-cuisine dining).
- **Transport**: Varies based on route/distance, ranging from ₹10,000 to ₹18,000 per annum.
- **How to apply**: Visit the admission wing or contact counsellors via the admission CRM desk.`;

      return res.json({ success: true, response });
    }

    // 2. Risk / Dropout queries
    if (q.includes('risk') || q.includes('dropout') || q.includes('low attendance') || q.includes('irregular')) {
      // Find students with attendance < 75%
      const allStudents = await all('SELECT * FROM students');
      const riskStudents = [];

      for (let s of allStudents) {
        const recs = await all('SELECT status FROM attendance WHERE student_id = ?', [s.id]);
        if (recs.length > 0) {
          const present = recs.filter(r => r.status === 'Present').length;
          const rate = (present / recs.length) * 100;
          if (rate < 75) {
            riskStudents.push({
              name: s.name,
              class_name: s.class_name,
              rate: rate.toFixed(1),
              parent: s.parent_name,
              phone: s.parent_phone
            });
          }
        }
      }

      if (riskStudents.length === 0) {
        return res.json({
          success: true,
          response: `All students currently maintain attendance rates above 75%. No immediate dropout risks detected.`
        });
      }

      let response = `**Low Attendance & Dropout Risk Summary:**
I found **${riskStudents.length} students** with attendance rates below the 75% threshold.

`;
      riskStudents.forEach((student, index) => {
        response += `${index + 1}. **${student.name}** (${student.class_name}) - Attendance: **${student.rate}%**
   *Parent Contact:* ${student.parent} (${student.phone})
   *Suggested Action:* Send warning letter and schedule a counselling meeting with the parent.\n\n`;
      });

      return res.json({ success: true, response });
    }

    // 3. Class-specific statistics (Class 10-A, 10-B, 11-A)
    let targetClass = null;
    if (q.includes('10-a') || q.includes('10a')) targetClass = 'Class 10-A';
    else if (q.includes('10-b') || q.includes('10b')) targetClass = 'Class 10-B';
    else if (q.includes('11-a') || q.includes('11a')) targetClass = 'Class 11-A';

    if (q.includes('class') || targetClass) {
      if (!targetClass) {
        return res.json({
          success: true,
          response: `Please specify the class you are interested in. For example: "Show attendance for Class 10-A" or "Compare 10-B stats".`
        });
      }

      const students = await all('SELECT id FROM students WHERE class_name = ?', [targetClass]);
      if (students.length === 0) {
        return res.json({ success: true, response: `No students found in ${targetClass}.` });
      }

      let totalDays = 0;
      let presentDays = 0;

      for (let s of students) {
        const recs = await all('SELECT status FROM attendance WHERE student_id = ?', [s.id]);
        totalDays += recs.length;
        presentDays += recs.filter(r => r.status === 'Present').length;
      }

      const rate = totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(1) : '100.0';

      return res.json({
        success: true,
        response: `**Attendance Summary for ${targetClass}:**
- **Total Registered Students**: ${students.length}
- **Class Attendance Rate**: **${rate}%**
- **Status**: ${parseFloat(rate) >= 90 ? '🟢 Excellent' : parseFloat(rate) >= 75 ? '🟡 Average' : '🔴 Needs Attention'}
- **Recommendation**: ${parseFloat(rate) < 85 ? 'Perform a review of regular absent students and message parents.' : 'Maintain current engagement programs.'}`
      });
    }

    // 4. Common absence reasons
    if (q.includes('reason') || q.includes('why') || q.includes('absenteeism')) {
      const reasonRows = await all(
        `SELECT absent_reason, COUNT(*) as count 
         FROM attendance 
         WHERE status = 'Absent' AND absent_reason IS NOT NULL AND absent_reason != ''
         GROUP BY absent_reason 
         ORDER BY count DESC`
      );

      if (reasonRows.length === 0) {
        return res.json({ success: true, response: `No absence reasons have been recorded in the database yet.` });
      }

      let response = `**Analysis of Absence Reasons across Sri Gowthami Institutions:**
Here are the primary reasons reported by students/parents for absences:

`;
      const totalAbsences = reasonRows.reduce((sum, r) => sum + r.count, 0);
      reasonRows.forEach((r, idx) => {
        const percentage = ((r.count / totalAbsences) * 100).toFixed(1);
        response += `${idx + 1}. **${r.absent_reason}**: ${r.count} times (${percentage}% of total absences)\n`;
      });

      response += `\n**AI Suggestion**: A significant portion is due to health/sickness. We suggest organizing an institutional health checkup camp and checking in with the local hostel warden for campus sanitization status.`;

      return res.json({ success: true, response });
    }

    // Default Fallback
    res.json({
      success: true,
      response: `I'm your **Student Attendance System AI Assistant** 🤖. I can analyze statistics, identify risk students, and retrieve admission guidelines.
      
Here are some questions you can ask me:
1. *"Who is at risk of dropping out?"*
2. *"Show attendance report for Class 10-A"*
3. *"What is the most common reason for absence?"*
4. *"Tell me about the admission fees and structure"*`
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

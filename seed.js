const { run, initDatabase, all } = require('./database');

const classes = ['Class 10-A', 'Class 10-B', 'Class 11-A'];

const firstNames = [
  'Aarav', 'Vihaan', 'Aditya', 'Sai', 'Arjun', 'Krishna', 'Ishaan', 'Shaurya', 'Kabir', 'Rohan',
  'Ananya', 'Diya', 'Ishita', 'Myra', 'Kiara', 'Aadhya', 'Saanvi', 'Riya', 'Kavya', 'Pooja',
  'Rahul', 'Sanjay', 'Amit', 'Vikram', 'Rajesh', 'Suresh', 'Kunal', 'Deepak', 'Vijay', 'Anil',
  'Priya', 'Neha', 'Sneha', 'Meera', 'Ritu', 'Jyoti', 'Shalini', 'Kiran', 'Swati', 'Priti'
];

const lastNames = [
  'Sharma', 'Verma', 'Gupta', 'Patel', 'Kumar', 'Singh', 'Reddy', 'Rao', 'Nair', 'Iyer',
  'Joshi', 'Mehta', 'Mishra', 'Prasad', 'Choudhury', 'Das', 'Roy', 'Sen', 'Pillai', 'Bose'
];

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generatePhone() {
  return '+91 ' + Math.floor(6000000000 + Math.random() * 4000000000);
}

async function seed() {
  console.log('Initializing database tables...');
  await initDatabase();

  // Clear existing data
  console.log('Clearing old records...');
  await run('DELETE FROM alerts');
  await run('DELETE FROM attendance');
  await run('DELETE FROM students');

  console.log('Generating students...');
  const students = [];
  let rollNumCounter = 1001;

  for (let c of classes) {
    // Generate 12 students per class
    for (let i = 0; i < 12; i++) {
      const gender = Math.random() > 0.5 ? 'M' : 'F';
      const firstName = getRandomElement(firstNames);
      const lastName = getRandomElement(lastNames);
      const name = `${firstName} ${lastName}`;
      const roll_number = `${c.replace('Class ', '').replace('-', '')}-${rollNumCounter++}`;
      
      const parentFirstName = getRandomElement(firstNames);
      const parent_name = `${parentFirstName} ${lastName}`;
      const parent_phone = generatePhone();
      const parent_email = `${parentFirstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;

      students.push({
        name,
        roll_number,
        class_name: c,
        parent_name,
        parent_phone,
        parent_email
      });
    }
  }

  // Insert students and retrieve their IDs
  const studentIds = [];
  for (let s of students) {
    const result = await run(
      `INSERT INTO students (name, roll_number, class_name, parent_name, parent_phone, parent_email) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [s.name, s.roll_number, s.class_name, s.parent_name, s.parent_phone, s.parent_email]
    );
    s.id = result.id;
    studentIds.push(s);
  }
  console.log(`Successfully generated and saved ${studentIds.length} students.`);

  // Generate 15 working days of attendance history
  // e.g. from June 8, 2026 to June 26, 2026 (excluding weekends)
  console.log('Generating 15 days of attendance history...');
  const dates = [];
  let currentDate = new Date('2026-06-08');
  const endDate = new Date('2026-06-26');

  while (currentDate <= endDate) {
    const day = currentDate.getDay();
    if (day !== 0 && day !== 6) { // Exclude Sunday (0) and Saturday (6)
      const yyyy = currentDate.getFullYear();
      const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dd = String(currentDate.getDate()).padStart(2, '0');
      dates.push(`${yyyy}-${mm}-${dd}`);
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const reasons = [
    'Fever/Sickness',
    'Family Emergency',
    'Heavy Rains/No Transport',
    'Out of Station',
    'Personal work'
  ];

  // Let's customize a few students to have problematic attendance
  // Student 0: Absent for the last 4 days (dates index 11, 12, 13, 14 of 15)
  // Student 1: Absent very frequently (~50% attendance)
  // Student 2: Absent on days 3, 4, 5 consecutive, and then present
  // The rest have ~93% attendance rate
  const s0 = studentIds[0];
  const s1 = studentIds[1];
  const s2 = studentIds[2];

  for (let dateIndex = 0; dateIndex < dates.length; dateIndex++) {
    const date = dates[dateIndex];
    for (let i = 0; i < studentIds.length; i++) {
      const student = studentIds[i];
      let status = 'Present';
      let reason = null;

      if (student.id === s0.id) {
        // Absent for the last 4 days (indices 11, 12, 13, 14 - which correspond to June 23, 24, 25, 26)
        if (dateIndex >= 11) {
          status = 'Absent';
          reason = 'Fever/Sickness';
        }
      } else if (student.id === s1.id) {
        // 50% attendance - alternate days absent
        if (dateIndex % 2 === 0) {
          status = 'Absent';
          reason = getRandomElement(reasons);
        }
      } else if (student.id === s2.id) {
        // Absent on index 3, 4, 5 (June 11, 12, 15)
        if (dateIndex === 3 || dateIndex === 4 || dateIndex === 5) {
          status = 'Absent';
          reason = 'Out of Station';
        }
      } else {
        // General students: 7% chance of absence
        if (Math.random() < 0.07) {
          status = 'Absent';
          reason = getRandomElement(reasons);
        }
      }

      await run(
        `INSERT INTO attendance (student_id, date, status, absent_reason, marked_by, timestamp) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [student.id, date, status, reason, 'Teacher Rajesh', new Date().toISOString()]
      );
    }
  }
  console.log(`Successfully generated attendance records for ${dates.length} days.`);

  // Generate some alerts
  console.log('Generating initial alerts...');
  // Let's create an alert for S0: Consecutive absences
  await run(
    `INSERT INTO alerts (student_id, alert_type, severity, message, status, action_taken, timestamp) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      s0.id,
      'Consecutive Absence',
      'Critical',
      `Student ${s0.name} was absent for 4 consecutive days (since June 23, 2026).`,
      'Pending',
      null,
      new Date().toISOString()
    ]
  );

  // Let's create an alert for S1: Low overall attendance
  // Calculate attendance rate for S1
  const s1Attendance = await all(`SELECT status FROM attendance WHERE student_id = ?`, [s1.id]);
  const presentCount = s1Attendance.filter(r => r.status === 'Present').length;
  const attendancePercentage = ((presentCount / s1Attendance.length) * 100).toFixed(1);
  await run(
    `INSERT INTO alerts (student_id, alert_type, severity, message, status, action_taken, timestamp) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      s1.id,
      'Low Attendance Rate',
      'Critical',
      `Student ${s1.name} has a critically low attendance rate of ${attendancePercentage}% (target is 75%).`,
      'Pending',
      null,
      new Date().toISOString()
    ]
  );

  // Let's create a resolved alert for S2
  await run(
    `INSERT INTO alerts (student_id, alert_type, severity, message, status, action_taken, timestamp) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      s2.id,
      'Consecutive Absence',
      'Warning',
      `Student ${s2.name} was absent for 3 consecutive days.`,
      'Resolved',
      'Called parent. Student was out of station. Returned to class on June 16.',
      new Date('2026-06-16T10:00:00.000Z').toISOString()
    ]
  );

  console.log('Database seeding completed successfully!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});

const http = require('http');
const { all, get, initDatabase } = require('./database');

// We will start the express app on an alternate port and verify endpoints using standard Node http module
async function runTests() {
  console.log('--- Starting Verification Tests ---');

  // Test 1: Verify Database Schema and Data Seeding
  console.log('\n[Test 1] Verifying database seeding...');
  await initDatabase();
  
  const studentCountRow = await get('SELECT COUNT(*) as count FROM students');
  console.log(`- Students count in DB: ${studentCountRow.count} (Expected: 36)`);
  if (studentCountRow.count !== 36) {
    throw new Error(`Seeding mismatch! Expected 36 students, found ${studentCountRow.count}`);
  }
  
  const classesRow = await all('SELECT DISTINCT class_name FROM students');
  const classNames = classesRow.map(r => r.class_name);
  console.log(`- Classes found: ${classNames.join(', ')}`);
  if (classNames.length !== 3) {
    throw new Error(`Expected 3 unique classes, found ${classNames.length}`);
  }

  const attendanceCountRow = await get('SELECT COUNT(*) as count FROM attendance');
  console.log(`- Attendance rows in DB: ${attendanceCountRow.count}`);
  if (attendanceCountRow.count === 0) {
    throw new Error('No attendance records generated!');
  }

  const alertCountRow = await get('SELECT COUNT(*) as count FROM alerts');
  console.log(`- Alerts count in DB: ${alertCountRow.count}`);
  if (alertCountRow.count === 0) {
    throw new Error('No alert records found!');
  }
  console.log('✓ Database verification passed.');

  // Test 2: Start server on temporary port 3002 and test routes
  console.log('\n[Test 2] Starting temporary express server for route verification...');
  process.env.PORT = 3002;
  const server = require('./server'); // This will trigger listen on 3002

  // Helper to query local endpoints
  const getURL = (path) => {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:3002${path}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`Endpoint ${path} returned status ${res.statusCode}: ${data}`));
          } else {
            resolve(JSON.parse(data));
          }
        });
      }).on('error', err => reject(err));
    });
  };

  // Wait 1 second to ensure server is fully running
  await new Promise(r => setTimeout(r, 1000));

  try {
    console.log('- Testing GET /api/classes...');
    const classesRes = await getURL('/api/classes');
    if (!classesRes.success || classesRes.classes.length < 3) {
      throw new Error(`GET /api/classes returned invalid payload: ${JSON.stringify(classesRes)}`);
    }

    console.log('- Testing GET /api/students?class_name=Class%2010-A...');
    const studentsRes = await getURL('/api/students?class_name=Class%2010-A');
    if (!studentsRes.success || studentsRes.students.length !== 12) {
      throw new Error(`GET /api/students returned invalid payload length: ${studentsRes.students?.length}`);
    }
    // Verify attendance percentage is present
    if (typeof studentsRes.students[0].attendance_percentage !== 'number') {
      throw new Error('Student attendance percentage calculation is missing or not a number');
    }

    console.log('- Testing GET /api/reports/dashboard...');
    const dashboardRes = await getURL('/api/reports/dashboard');
    if (!dashboardRes.success || !dashboardRes.dashboard.overall_attendance_rate) {
      throw new Error(`GET /api/reports/dashboard payload invalid`);
    }

    console.log('- Testing GET /api/alerts...');
    const alertsRes = await getURL('/api/alerts');
    if (!alertsRes.success || alertsRes.alerts.length === 0) {
      throw new Error(`GET /api/alerts payload invalid`);
    }

    console.log('✓ All endpoint verifications passed successfully!');
  } catch (err) {
    console.error('✗ Endpoint testing failed:', err);
    process.exit(1);
  } finally {
    console.log('\nClosing temporary test server...');
    // We terminate the process or stop listening since this is a test.
    // In Node.js, we can do process.exit(0) as tests completed.
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('\n✗ Verification tests failed:', err);
  process.exit(1);
});

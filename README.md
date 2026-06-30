# Student Attendance Management System

A full-stack student attendance tracking portal and early risk warning dashboard prototype built for **Sri Gowthami Educational Institutions**.

---

## Features

- **Class Attendance Register**: Simple UI to mark daily presence/absence with specific reason tags.
- **KPI Metrics Dashboard**: Live counters for total registered students, overall attendance rates, at-risk students, and active warning flags.
- **Early Warning Alerts**: Automatic rule checking for dropping attendance (<75%) and consecutive absences (3+ days) with a resolution logging console.
- **Class Reports**: Aggregated class records support with custom print layout (Print to PDF) and CSV data downloads.
- **Local AI counselling Assistant**: A rule-based local Natural Language Processing chat box that answers queries in plain English.
- **Database Administration**: Forms to register new classes and enroll new students dynamically.

---

## Tech Stack

- **Frontend**: HTML5, CSS3 (Glassmorphism design language), JavaScript (ES6+, DOM, Fetch API), Chart.js
- **Backend**: Node.js, Express.js, CORS
- **Database**: SQLite3 (relational, file-based database)

---

## How to Set Up and Run the Project

Follow these steps to run the application on your local machine:

### 1. Clone the Repository
```bash
git clone https://github.com/koukuntlashiva333-droid/student_attendance_system.git
cd student_attendance_system
```

### 2. Install Dependencies
Ensure you have [Node.js](https://nodejs.org/) installed. Run:
```bash
npm install
```

### 3. Seed the Database
Populate the database with default classes, 36 mock students, emergency parent details, and 15 days of historical records:
```bash
npm run seed
```
This generates the SQLite database file `attendance.db` in your root folder.

### 4. Run the Server
Start the Express server:
```bash
npm start
```
The server will start listening at **[http://localhost:3000](http://localhost:3000)**. Open this link in any browser to interact with the dashboard.

### 5. Verify the Installation
Run the integration test suite to verify database schemas, seeds, and API routes:
```bash
npm run verify
```

---

## Project Presentation

We have built a fully interactive, slide-by-slide HTML presentation to showcase the project features, architecture design, and database schema:
1. Double-click the `presentation.html` file at the root of the project to open it in your browser.
2. Press **F11** to go full-screen.
3. Use the **Left/Right Arrow keys** or **Spacebar** to navigate between slides.

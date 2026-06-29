// API Endpoints Base URL - auto-fallbacks to local backend if served separately
const BASE_URL = window.location.port === '3000' ? '' : 'http://localhost:3000';

// UI State
let activeTab = 'dashboard';
let classes = [];
let trendChart = null;
let reasonsChart = null;

// DOM Elements
const navLinks = document.querySelectorAll('.nav-link');
const tabContents = document.querySelectorAll('.tab-content');
const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');
const currentSystemTimeSpan = document.getElementById('current-system-time');

// Set today's date on header
const todayStr = new Date().toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});
currentSystemTimeSpan.textContent = todayStr;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadClasses();
  loadDashboardData();
  initAiAssistant();
  
  // Set default date in mark attendance to today
  const dateInput = document.getElementById('attendance-date-select');
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }
});

// Tab Switching
function initTabs() {
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = link.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Link inside dashboard
  document.getElementById('dashboard-view-all-alerts').addEventListener('click', () => {
    switchTab('alerts');
  });
}

function switchTab(tabId) {
  activeTab = tabId;
  
  // Update nav active states
  navLinks.forEach(link => {
    if (link.getAttribute('data-tab') === tabId) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Update tab visibility
  tabContents.forEach(content => {
    if (content.id === tabId) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });

  // Update Titles
  if (tabId === 'dashboard') {
    pageTitle.textContent = 'Dashboard';
    pageSubtitle.textContent = 'Welcome to Sri Gowthami Student Attendance Management portal.';
    loadDashboardData();
  } else if (tabId === 'mark-attendance') {
    pageTitle.textContent = 'Mark Daily Attendance';
    pageSubtitle.textContent = 'Select a class and date to mark student presence or absence.';
  } else if (tabId === 'reports') {
    pageTitle.textContent = 'Class Attendance Reports';
    pageSubtitle.textContent = 'Generate class-wise summaries, print PDF reports, or export to CSV.';
  } else if (tabId === 'alerts') {
    pageTitle.textContent = 'Early Warning Alerts';
    pageSubtitle.textContent = 'Identify high-risk students and document academic/parent interventions.';
    loadAlertsData();
  } else if (tabId === 'ai-assistant') {
    pageTitle.textContent = 'AI Counselling Assistant';
    pageSubtitle.textContent = 'Analyze attendance patterns and lookup school guidelines with AI.';
  }
}

// Fetch Classes
async function loadClasses() {
  try {
    const res = await fetch(`${BASE_URL}/api/classes`);
    const data = await res.json();
    if (data.success) {
      classes = data.classes;
      
      const attSelect = document.getElementById('attendance-class-select');
      const repSelect = document.getElementById('report-class-select');
      
      attSelect.innerHTML = '<option value="">-- Choose Class --</option>';
      repSelect.innerHTML = '<option value="">-- Choose Class --</option>';

      classes.forEach(c => {
        const opt = `<option value="${c}">${c}</option>`;
        attSelect.innerHTML += opt;
        repSelect.innerHTML += opt;
      });
    }
  } catch (err) {
    console.error('Failed to load classes', err);
  }
}

// Fetch & Render Dashboard Data
async function loadDashboardData() {
  try {
    const res = await fetch(`${BASE_URL}/api/reports/dashboard`);
    const data = await res.json();
    if (data.success) {
      const stats = data.dashboard;
      
      // Update counters
      document.getElementById('stat-total-students').textContent = stats.total_students;
      document.getElementById('stat-attendance-rate').textContent = `${stats.overall_attendance_rate}%`;
      document.getElementById('stat-risk-students').textContent = stats.low_attendance_students_count;
      document.getElementById('stat-active-alerts').textContent = stats.active_alerts_count;

      // Update sidebar alert badge
      const alertBadge = document.getElementById('sidebar-alert-badge');
      if (stats.active_alerts_count > 0) {
        alertBadge.textContent = stats.active_alerts_count;
        alertBadge.style.display = 'block';
      } else {
        alertBadge.style.display = 'none';
      }

      // Initialize or Update Line Chart
      updateTrendChart(stats.daily_attendance_trend);

      // Initialize or Update Reasons Pie Chart
      updateReasonsChart(stats.absent_reason_distribution);

      // Load Recent Alerts table in dashboard
      loadRecentAlertsDashboard();
    }
  } catch (err) {
    console.error('Failed to load dashboard data', err);
  }
}

// Render Recent Alerts in Dashboard Table
async function loadRecentAlertsDashboard() {
  try {
    const res = await fetch(`${BASE_URL}/api/alerts`);
    const data = await res.json();
    if (data.success) {
      const tbody = document.getElementById('dashboard-alerts-tbody');
      tbody.innerHTML = '';

      const pendingAlerts = data.alerts.filter(a => a.status === 'Pending').slice(0, 5);

      if (pendingAlerts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No high-priority alerts pending. All clear!</td></tr>';
        return;
      }

      pendingAlerts.forEach(a => {
        const date = new Date(a.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${a.student_name}</strong></td>
          <td><code>${a.roll_number}</code></td>
          <td>${a.class_name}</td>
          <td>${a.alert_type}</td>
          <td><span class="severity-badge severity-${a.severity.toLowerCase()}">${a.severity}</span></td>
          <td>${date}</td>
          <td><span class="status-badge status-absent">${a.status}</span></td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error('Failed to load recent dashboard alerts', err);
  }
}

// Chart Render Helpers
function updateTrendChart(trendData) {
  const ctx = document.getElementById('trendChart').getContext('2d');
  
  const labels = trendData.map(d => {
    const parts = d.date.split('-');
    return `${parts[1]}/${parts[2]}`; // MM/DD
  });
  const dataValues = trendData.map(d => d.percentage);

  if (trendChart) {
    trendChart.destroy();
  }

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Overall Present Rate %',
        data: dataValues,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.15)',
        fill: true,
        tension: 0.35,
        borderWidth: 3,
        pointBackgroundColor: '#6366f1',
        pointHoverRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          min: 50,
          max: 100,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        },
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8' }
        }
      }
    }
  });
}

function updateReasonsChart(reasonsData) {
  const ctx = document.getElementById('reasonsChart').getContext('2d');
  
  if (reasonsData.length === 0) {
    // Empty State chart placeholder
    if (reasonsChart) reasonsChart.destroy();
    ctx.clearRect(0, 0, 300, 300);
    ctx.font = '14px Plus Jakarta Sans';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText('No absences recorded yet.', 150, 150);
    return;
  }

  const labels = reasonsData.map(r => r.absent_reason);
  const dataValues = reasonsData.map(r => r.count);
  const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981'];

  if (reasonsChart) {
    reasonsChart.destroy();
  }

  reasonsChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: dataValues,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#f8fafc',
            font: { family: 'Plus Jakarta Sans', size: 11 }
          }
        }
      }
    }
  });
}

// ==================== MARK ATTENDANCE ====================
const btnLoadAttendance = document.getElementById('btn-load-attendance-list');
const attendanceWorkspace = document.getElementById('attendance-workspace');
const attendanceTbody = document.getElementById('attendance-tbody');

btnLoadAttendance.addEventListener('click', loadAttendanceList);

async function loadAttendanceList() {
  const className = document.getElementById('attendance-class-select').value;
  const date = document.getElementById('attendance-date-select').value;

  if (!className || !date) {
    alert('Please select both a class and a date.');
    return;
  }

  btnLoadAttendance.disabled = true;
  btnLoadAttendance.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

  try {
    const res = await fetch(`${BASE_URL}/api/students?class_name=${encodeURIComponent(className)}&date=${date}`);
    const data = await res.json();

    if (data.success) {
      document.getElementById('workspace-class-title').textContent = className;
      
      const formattedDate = new Date(date).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
      document.getElementById('workspace-date-subtitle').textContent = `Marking attendance for ${formattedDate}`;

      attendanceTbody.innerHTML = '';
      
      data.students.forEach(student => {
        const isPresent = student.status === 'Present';
        const isAbsent = student.status === 'Absent';
        
        const tr = document.createElement('tr');
        tr.setAttribute('data-student-id', student.id);
        
        tr.innerHTML = `
          <td><code>${student.roll_number.split('-')[1]}</code></td>
          <td><strong>${student.name}</strong></td>
          <td>
            <div class="attendance-switch">
              <input type="radio" id="p-${student.id}" name="status-${student.id}" value="Present" ${isPresent ? 'checked' : ''}>
              <label for="p-${student.id}">Present</label>
              
              <input type="radio" id="a-${student.id}" name="status-${student.id}" value="Absent" ${isAbsent ? 'checked' : ''}>
              <label for="a-${student.id}">Absent</label>
            </div>
          </td>
          <td>
            <select id="reason-${student.id}" class="form-control" ${isPresent ? 'disabled' : ''}>
              <option value="">-- Choose Reason --</option>
              <option value="Fever/Sickness" ${student.absent_reason === 'Fever/Sickness' ? 'selected' : ''}>Fever/Sickness</option>
              <option value="Family Emergency" ${student.absent_reason === 'Family Emergency' ? 'selected' : ''}>Family Emergency</option>
              <option value="Heavy Rains/No Transport" ${student.absent_reason === 'Heavy Rains/No Transport' ? 'selected' : ''}>Heavy Rains/No Transport</option>
              <option value="Out of Station" ${student.absent_reason === 'Out of Station' ? 'selected' : ''}>Out of Station</option>
              <option value="Personal work" ${student.absent_reason === 'Personal work' ? 'selected' : ''}>Personal work</option>
            </select>
          </td>
          <td>
            <span class="status-badge ${student.attendance_percentage >= 75 ? 'status-present' : 'status-absent'}">
              ${student.attendance_percentage}%
            </span>
          </td>
        `;
        attendanceTbody.appendChild(tr);

        // Add event listener to radio switches to enable/disable absence reasons
        const pRadio = tr.querySelector(`#p-${student.id}`);
        const aRadio = tr.querySelector(`#a-${student.id}`);
        const reasonSelect = tr.querySelector(`#reason-${student.id}`);

        pRadio.addEventListener('change', () => {
          reasonSelect.disabled = true;
          reasonSelect.value = '';
          updateMarkingSummaryCount();
        });

        aRadio.addEventListener('change', () => {
          reasonSelect.disabled = false;
          updateMarkingSummaryCount();
        });
      });

      attendanceWorkspace.style.display = 'block';
      updateMarkingSummaryCount();
    }
  } catch (err) {
    alert('Error loading student attendance list: ' + err.message);
  } finally {
    btnLoadAttendance.disabled = false;
    btnLoadAttendance.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Load Student List';
  }
}

// Quick Fill Logic
document.getElementById('quick-fill-present').addEventListener('click', () => {
  const rows = attendanceTbody.querySelectorAll('tr');
  rows.forEach(row => {
    const presentRadio = row.querySelector('input[value="Present"]');
    const reasonSelect = row.querySelector('select');
    presentRadio.checked = true;
    reasonSelect.disabled = true;
    reasonSelect.value = '';
  });
  updateMarkingSummaryCount();
});

document.getElementById('quick-fill-absent').addEventListener('click', () => {
  const rows = attendanceTbody.querySelectorAll('tr');
  rows.forEach(row => {
    const absentRadio = row.querySelector('input[value="Absent"]');
    const reasonSelect = row.querySelector('select');
    absentRadio.checked = true;
    reasonSelect.disabled = false;
  });
  updateMarkingSummaryCount();
});

function updateMarkingSummaryCount() {
  const totalRows = attendanceTbody.querySelectorAll('tr').length;
  const presentRows = attendanceTbody.querySelectorAll('input[value="Present"]:checked').length;
  const absentRows = totalRows - presentRows;

  document.getElementById('marking-count-present').textContent = `Present: ${presentRows}`;
  document.getElementById('marking-count-absent').textContent = `Absent: ${absentRows}`;
}

// Save Attendance Records
const btnSaveAttendance = document.getElementById('btn-save-attendance');
btnSaveAttendance.addEventListener('click', async () => {
  const className = document.getElementById('attendance-class-select').value;
  const date = document.getElementById('attendance-date-select').value;
  const markedBy = document.getElementById('attendance-marked-by').value || 'Teacher Rajesh';

  const rows = attendanceTbody.querySelectorAll('tr');
  const records = [];

  let alertMissingReasons = false;

  rows.forEach(row => {
    const studentId = parseInt(row.getAttribute('data-student-id'));
    const status = row.querySelector('input[name^="status-"]:checked').value;
    const absent_reason = row.querySelector('select').value;

    if (status === 'Absent' && !absent_reason) {
      alertMissingReasons = true;
    }

    records.push({
      student_id: studentId,
      status,
      absent_reason: status === 'Absent' ? absent_reason : null
    });
  });

  if (alertMissingReasons) {
    if (!confirm('Some students are marked Absent without a specific reason. Do you want to submit anyway?')) {
      return;
    }
  }

  btnSaveAttendance.disabled = true;
  btnSaveAttendance.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving Records...';

  try {
    const res = await fetch(`${BASE_URL}/api/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class_name: className,
        date: date,
        marked_by: markedBy,
        records: records
      })
    });

    const data = await res.json();
    if (data.success) {
      alert('Attendance records successfully marked and database alerts updated!');
      loadAttendanceList(); // reload table to refresh local indicators
      loadDashboardData(); // update counters in background
    } else {
      alert('Failed to save records: ' + data.error);
    }
  } catch (err) {
    alert('Network error while saving attendance: ' + err.message);
  } finally {
    btnSaveAttendance.disabled = false;
    btnSaveAttendance.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Attendance Records';
  }
});

// ==================== CLASS REPORTS ====================
const btnGenerateReport = document.getElementById('btn-generate-report');
const reportWorkspace = document.getElementById('report-workspace');
const reportTbody = document.getElementById('report-tbody');
const btnExportCsv = document.getElementById('btn-export-csv');
const btnPrintReport = document.getElementById('btn-print-report');

let lastGeneratedReportData = null;
let lastGeneratedClassName = '';

btnGenerateReport.addEventListener('click', async () => {
  const className = document.getElementById('report-class-select').value;
  if (!className) {
    alert('Please select a class.');
    return;
  }

  btnGenerateReport.disabled = true;
  btnGenerateReport.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';

  try {
    const res = await fetch(`${BASE_URL}/api/reports/class?class_name=${encodeURIComponent(className)}`);
    const data = await res.json();

    if (data.success) {
      lastGeneratedReportData = data.report;
      lastGeneratedClassName = className;

      document.getElementById('report-class-title').textContent = `${className} - Attendance Summary`;
      document.getElementById('report-details-subtitle').textContent = `Aggregated attendance statistics across all history.`;
      
      reportTbody.innerHTML = '';
      
      data.report.forEach(s => {
        let riskStatus = '<span class="status-badge status-present">Satisfactory</span>';
        if (s.attendance_percentage < 70) {
          riskStatus = '<span class="status-badge status-absent">🔴 Critically Low</span>';
        } else if (s.attendance_percentage < 75) {
          riskStatus = '<span class="status-badge status-absent">⚠️ Risk Alert</span>';
        } else if (s.attendance_percentage < 85) {
          riskStatus = '<span class="status-badge status-present" style="background-color:var(--warning-light); color:var(--warning)">🟡 Warning</span>';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><code>${s.roll_number}</code></td>
          <td><strong>${s.name}</strong></td>
          <td class="text-center">${s.total_days}</td>
          <td class="text-center">${s.present_days}</td>
          <td class="text-center">${s.absent_days}</td>
          <td class="text-center"><strong>${s.attendance_percentage}%</strong></td>
          <td>${riskStatus}</td>
        `;
        reportTbody.appendChild(tr);
      });

      reportWorkspace.style.display = 'block';
      btnExportCsv.disabled = false;
      btnPrintReport.disabled = false;
    }
  } catch (err) {
    alert('Error generating report: ' + err.message);
  } finally {
    btnGenerateReport.disabled = false;
    btnGenerateReport.innerHTML = '<i class="fa-solid fa-chart-simple"></i> Generate Report';
  }
});

// CSV Export logic
btnExportCsv.addEventListener('click', () => {
  if (!lastGeneratedReportData || lastGeneratedReportData.length === 0) return;

  let csvContent = 'data:text/csv;charset=utf-8,';
  csvContent += 'Roll Number,Student Name,Total Days,Days Present,Days Absent,Attendance Percentage\n';

  lastGeneratedReportData.forEach(row => {
    csvContent += `"${row.roll_number}","${row.name}",${row.total_days},${row.present_days},${row.absent_days},${row.attendance_percentage}%\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `Attendance_Report_${lastGeneratedClassName.replace(/\s+/g, '_')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

// Print PDF logic
btnPrintReport.addEventListener('click', () => {
  // Set print header data
  document.getElementById('print-metadata').textContent = `Class: ${lastGeneratedClassName} | Report Generated on ${new Date().toLocaleString()}`;
  window.print();
});


// ==================== EARLY WARNING ALERTS ====================
async function loadAlertsData() {
  try {
    const res = await fetch(`${BASE_URL}/api/alerts`);
    const data = await res.json();
    if (data.success) {
      const pendingGrid = document.getElementById('pending-alerts-grid');
      const resolvedTbody = document.getElementById('resolved-alerts-tbody');

      pendingGrid.innerHTML = '';
      resolvedTbody.innerHTML = '';

      const pendingAlerts = data.alerts.filter(a => a.status === 'Pending');
      const resolvedAlerts = data.alerts.filter(a => a.status === 'Resolved');

      // Update badge counts
      const badge = document.getElementById('sidebar-alert-badge');
      if (pendingAlerts.length > 0) {
        badge.textContent = pendingAlerts.length;
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }

      // Render Active Alerts
      if (pendingAlerts.length === 0) {
        pendingGrid.innerHTML = `
          <div class="glass-panel text-center py-4" style="padding: 40px; color: var(--text-muted);">
            <i class="fa-solid fa-shield-halved" style="font-size: 40px; color: var(--success); margin-bottom:12px;"></i>
            <h3>No Active High-Risk Alerts</h3>
            <p>All student attendance indicators are currently in healthy thresholds!</p>
          </div>
        `;
      } else {
        pendingAlerts.forEach(a => {
          const card = document.createElement('div');
          card.className = `alert-card glass-panel ${a.severity.toLowerCase()}`;
          
          card.innerHTML = `
            <div class="alert-header-row">
              <div class="student-meta">
                <h4>${a.student_name}</h4>
                <p>Roll: <code>${a.roll_number}</code> | ${a.class_name}</p>
              </div>
              <span class="severity-badge severity-${a.severity.toLowerCase()}">${a.severity}</span>
            </div>
            <div class="alert-body">
              <p><strong>Reason:</strong> ${a.alert_type} - ${a.message}</p>
              <p class="text-muted" style="font-size:12px; margin-top:4px;">Parent Contact: ${a.parent_name} (${a.parent_phone})</p>
            </div>
            <div class="action-form">
              <input type="text" id="action-${a.id}" placeholder="Note action taken (e.g. Called parent, counselling scheduled)..." class="form-control">
              <button class="btn btn-success btn-sm" onclick="resolveAlert(${a.id})">
                <i class="fa-solid fa-check"></i> Resolve Alert
              </button>
            </div>
          `;
          pendingGrid.appendChild(card);
        });
      }

      // Render Resolved History
      if (resolvedAlerts.length === 0) {
        resolvedTbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No historical resolutions found.</td></tr>';
      } else {
        resolvedAlerts.forEach(a => {
          const resDate = new Date(a.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td><strong>${a.student_name}</strong></td>
            <td>${a.class_name}</td>
            <td><span class="severity-badge severity-warning">${a.alert_type}</span></td>
            <td>
              <div class="resolved-action-content">
                <p style="font-size:13px;">${a.action_taken || 'No comments entered.'}</p>
              </div>
            </td>
            <td><span class="text-muted">${resDate}</span></td>
          `;
          resolvedTbody.appendChild(tr);
        });
      }
    }
  } catch (err) {
    console.error('Failed to load alerts data', err);
  }
}

// Global scope resolution function triggered by inline HTML onclick
window.resolveAlert = async function(alertId) {
  const actionInput = document.getElementById(`action-${alertId}`);
  const actionTaken = actionInput.value.trim();

  if (!actionTaken) {
    alert('Please enter a note describing what action was taken (e.g. parent contacted) before resolving.');
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/alerts/${alertId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_taken: actionTaken })
    });

    const data = await res.json();
    if (data.success) {
      alert('Alert successfully logged as Resolved!');
      loadAlertsData();
      loadDashboardData();
    } else {
      alert('Failed to resolve alert: ' + data.error);
    }
  } catch (err) {
    alert('Network error while resolving alert: ' + err.message);
  }
};


// ==================== AI ASSISTANT ====================
function initAiAssistant() {
  const chatInput = document.getElementById('chat-input');
  const btnSend = document.getElementById('btn-send-message');
  const chatMessages = document.getElementById('chat-messages');

  btnSend.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

  // Query chips click listener
  const chips = document.querySelectorAll('.chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.getAttribute('data-query');
      chatInput.value = q;
      sendMessage();
    });
  });

  async function sendMessage() {
    const queryText = chatInput.value.trim();
    if (!queryText) return;

    // Append outgoing message
    appendMessage(queryText, 'outgoing');
    chatInput.value = '';

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Append temporary typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message incoming typing-indicator-msg';
    typingDiv.innerHTML = `
      <div class="message-content">
        <i class="fa-solid fa-spinner fa-spin"></i> Analyzing school database...
      </div>
    `;
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      const res = await fetch(`${BASE_URL}/api/ai/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText })
      });

      const data = await res.json();
      
      // Remove typing indicator
      const typingIndicator = chatMessages.querySelector('.typing-indicator-msg');
      if (typingIndicator) {
        chatMessages.removeChild(typingIndicator);
      }

      if (data.success) {
        appendMessage(data.response, 'incoming');
      } else {
        appendMessage('Error: ' + data.error, 'incoming');
      }
    } catch (err) {
      // Remove typing indicator
      const typingIndicator = chatMessages.querySelector('.typing-indicator-msg');
      if (typingIndicator) {
        chatMessages.removeChild(typingIndicator);
      }
      appendMessage('Unable to reach server. Please check connection. Error: ' + err.message, 'incoming');
    }
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendMessage(text, direction) {
    const msg = document.createElement('div');
    msg.className = `message ${direction}`;
    
    // Convert basic markdown in response to HTML elements
    let formattedText = text
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/🟢/g, '<span style="color:var(--success)">🟢</span>')
      .replace(/🟡/g, '<span style="color:var(--warning)">🟡</span>')
      .replace(/🔴/g, '<span style="color:var(--danger)">🔴</span>');

    msg.innerHTML = `
      <div class="message-content">
        ${formattedText}
      </div>
      <span class="message-time">Just now</span>
    `;
    chatMessages.appendChild(msg);
  }
}

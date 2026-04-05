/* ============================================
   ROOMEASE - Frontend Application Logic
   Fixes: entry/exit modal, curfew checking,
   exit exceptions, late warnings, fines, delete
   ============================================ */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────
  const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : window.location.origin;

  // Curfew thresholds (mirror of backend)
  const ENTRY_CURFEW = { h: 22, m: 30 }; // 10:30 PM
  const EXIT_CURFEW  = { h: 22, m: 20 }; // 10:20 PM

  // Fine map (mirror of backend)
  const FINES = {
    'Late Return (Curfew)' : 200,
    'Noise Complaint'      : 200,
    'Room Damage'          : 5000,
    'Property Damage'      : 5000,
    'Unauthorized Guest'   : 500,
    'Smoking / Alcohol'    : 1000,
    'Mess Rule Violation'  : 300,
    'Ragging'              : 2000,
    'Theft'                : 3000,
    'Abusive Behaviour'    : 500,
    'Other'                : 0
  };

  // ── State ────────────────────────────────────────────────────────────────
  let allStudents      = [];
  let allAttendance    = [];
  let allViolations    = [];
  let removeTargetId   = null;
  let attFilter        = 'all';
  let violFilter       = 'all';
  let clockInterval    = null;

  // ── Utility ──────────────────────────────────────────────────────────────
  function esc(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str ?? '')));
    return d.innerHTML;
  }
  function cap(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }
  function fmt(n)   { return String(n).padStart(2, '0'); }
  function fmtINR(n){ return n === 0 ? 'Nil' : '₹' + Number(n).toLocaleString('en-IN'); }

  function isAfterCurfew(h, m) {
    const now  = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins > h * 60 + m;
  }

  // ── Navbar ───────────────────────────────────────────────────────────────
  const navbar    = document.getElementById('navbar');
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('navLinks');

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 10);
    updateNav();
  }, { passive: true });

  hamburger.addEventListener('click', () => navLinks.classList.toggle('mobile-open'));
  navLinks.querySelectorAll('.nav-link').forEach(l => l.addEventListener('click', () => navLinks.classList.remove('mobile-open')));

  const sections = ['home', 'register', 'directory', 'attendance', 'violations'];
  function updateNav() {
    let cur = 'home';
    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el && window.scrollY >= el.offsetTop - 100) cur = id;
    });
    document.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active', l.getAttribute('href') === '#' + cur);
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.getElementById(a.getAttribute('href').slice(1));
      if (target) {
        e.preventDefault();
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 72, behavior: 'smooth' });
      }
    });
  });

  // ── Dynamic Form UI Settings ─────────────────────────────────────────────
  const MSRIT_BLOCKS = ["Aryabhatta Hostel", "Fresher's Block", "Ratan Tata Block"];
  const EXT_BLOCKS   = ["MSR Boys Home", "MSR Gokula", "MSR Gowramma", "White Lotus", "North Point Girls Hostel 1 and 2", "MSR NIMS Living Girls Hostel", "MSR Girls Hostel"];
  
  function updateBlockOptions(collegeSelect, blockSelect) {
    if (!collegeSelect || !collegeSelect.value) {
      if (blockSelect) blockSelect.innerHTML = '<option value="">-- Select Block --</option>';
      return;
    }
    const isExt = collegeSelect.value === 'MSRIT External Hostels';
    const opts = isExt ? EXT_BLOCKS : MSRIT_BLOCKS;
    
    // Preserve current value if possible when rebuilding list
    const currentVal = blockSelect.value;
    blockSelect.innerHTML = '<option value="">-- Select Block --</option>' + 
      opts.map(o => `<option value="${o}">${o}</option>`).join('');
    
    if (opts.includes(currentVal)) {
      blockSelect.value = currentVal;
    }
  }

  // ── Global Filter Logic ─────────────────────────────────────────────
  const globalCollegeFilter = document.getElementById('globalCollegeFilter');
  const globalBlockFilter = document.getElementById('globalBlockFilter');
  const globalFilterBtn = document.getElementById('globalFilterBtn');

  if (globalCollegeFilter && globalBlockFilter) {
    globalCollegeFilter.addEventListener('change', () => {
      updateBlockOptions(globalCollegeFilter, globalBlockFilter);
    });
    
    if (globalFilterBtn) {
      globalFilterBtn.addEventListener('click', () => {
        renderStudents();
        renderAttendance();
        renderViolations();
        updateStudentDropdowns();
      });
    }
  }

  const studentCollegeEl = document.getElementById('studentCollege');
  const hostelBlockEl = document.getElementById('hostelBlock');
  if (studentCollegeEl && hostelBlockEl) {
    studentCollegeEl.addEventListener('change', () => updateBlockOptions(studentCollegeEl, hostelBlockEl));
    // Init state
    updateBlockOptions(studentCollegeEl, hostelBlockEl);
  }

  const editStudentCollegeEl = document.getElementById('editStudentCollege');
  const editHostelBlockEl = document.getElementById('editHostelBlock');
  if (editStudentCollegeEl && editHostelBlockEl) {
    editStudentCollegeEl.addEventListener('change', () => updateBlockOptions(editStudentCollegeEl, editHostelBlockEl));
  }

  // ── Register Form ────────────────────────────────────────────────────────
  const registerForm  = document.getElementById('registerForm');
  const studentNameEl = document.getElementById('studentName');
  const roomNumberEl  = document.getElementById('roomNumber');
  const nameErrorEl   = document.getElementById('nameError');
  const roomErrorEl   = document.getElementById('roomError');
  const submitBtn     = document.getElementById('submitBtn');
  const formFeedback  = document.getElementById('formFeedback');
  const feedbackText  = document.getElementById('feedbackText');

  registerForm.addEventListener('submit', async e => {
    e.preventDefault();
    clearErrors(nameErrorEl, studentNameEl);
    clearErrors(roomErrorEl, roomNumberEl);
    const blockErrorEl = document.getElementById('blockError');
    const blockInputEl = document.getElementById('hostelBlock');
    clearErrors(blockErrorEl, blockInputEl);
    formFeedback.hidden = true;

    const name       = studentNameEl.value.trim();
    const roomNumber = parseInt(roomNumberEl.value.trim(), 10);
    const college    = document.getElementById('studentCollege').value;
    const hostelBlock = blockInputEl.value;
    let err = false;

    if (!name || name.length < 2) { setFieldErr(nameErrorEl, studentNameEl, name ? 'At least 2 characters required.' : 'Please enter the full name.'); err = true; }
    if (!roomNumberEl.value.trim() || isNaN(roomNumber) || roomNumber < 1) { setFieldErr(roomErrorEl, roomNumberEl, 'Enter a valid room number.'); err = true; }
    if (!hostelBlock) { setFieldErr(blockErrorEl, blockInputEl, 'Please select a hostel block.'); err = true; }
    if (err) return;

    setBtnLoading(submitBtn, true, 'Registering...');
    try {
      const res = await apiPost('/add', { name, roomNumber, college, hostelBlock });
      setBtnLoading(submitBtn, false, 'Register Student');
      showFeedback(true, `${res.name} has been registered in Room ${res.roomNumber}.`);
      registerForm.reset();
      showToast(`${res.name} registered successfully.`, 'success');
      loadStudents();
    } catch (ex) {
      setBtnLoading(submitBtn, false, 'Register Student');
      showFeedback(false, ex.message || 'Could not connect to the server.');
    }
  });

  function clearErrors(errEl, inputEl) { errEl.textContent = ''; inputEl.classList.remove('error'); }
  function setFieldErr(el, input, msg) { el.textContent = msg; input.classList.add('error'); }
  function showFeedback(ok, msg) {
    formFeedback.hidden = false;
    formFeedback.classList.toggle('error-state', !ok);
    const icon = formFeedback.querySelector('.feedback-icon');
    icon.classList.toggle('error-icon', !ok);
    feedbackText.textContent = msg;
  }

  // ── Directory ────────────────────────────────────────────────────────────
  const studentGrid     = document.getElementById('studentGrid');
  const loadingState    = document.getElementById('loadingState');
  const emptyState      = document.getElementById('emptyState');
  const dirFooter       = document.getElementById('directoryFooter');
  const countText       = document.getElementById('countText');
  const searchInput     = document.getElementById('searchInput');
  const refreshBtn      = document.getElementById('refreshBtn');
  const statTotal       = document.getElementById('stat-total');
  const statRooms       = document.getElementById('stat-rooms');
  const statViolations  = document.getElementById('stat-violations');
  const statFines       = document.getElementById('stat-fines');

  async function loadStudents() {
    loadingState.style.display = 'flex';
    emptyState.hidden = true;
    studentGrid.innerHTML = '';
    dirFooter.hidden = true;
    try {
      allStudents = await apiGet('/students');
      renderStudents();
      updateStudentDropdowns();
      fetchStats();
    } catch {
      loadingState.style.display = 'none';
      emptyState.hidden = false;
      setEmptyMsg(emptyState, 'Could not load students', 'Make sure the backend server is running.');
    }
  }

  function renderStudents() {
    loadingState.style.display = 'none';
    studentGrid.innerHTML = '';
    
    if (globalCollegeFilter && (!globalCollegeFilter.value || !globalBlockFilter.value)) {
      emptyState.hidden = false;
      dirFooter.hidden = true;
      setEmptyMsg(emptyState, 'Select Hostel Block', 'Please select a college and hostel block to view students.');
      return;
    }

    const q = searchInput.value.toLowerCase().trim();
    const filtered = allStudents.filter(s => {
      if (globalCollegeFilter && (s.college !== globalCollegeFilter.value || s.hostelBlock !== globalBlockFilter.value)) return false;
      if (q && !s.name.toLowerCase().includes(q) && !String(s.roomNumber).includes(q)) return false;
      return true;
    });

    if (filtered.length === 0) {
      emptyState.hidden = false;
      dirFooter.hidden = true;
      setEmptyMsg(emptyState, q ? 'No results found' : 'No students found',
        q ? 'Try a different name or room number.' : 'No students are registered in this block.');
      return;
    }

    emptyState.hidden = true;
    dirFooter.hidden = true;

    filtered.forEach((s, i) => studentGrid.appendChild(buildStudentCard(s, i)));
  }

  function buildStudentCard(student, index) {
    const card = document.createElement('div');
    card.className = 'student-card';
    card.style.animationDelay = `${index * 0.04}s`;

    const initial    = student.name.charAt(0).toUpperCase();
    const colorClass = `avatar-${index % 8}`;
    const warnCount  = student.warningCount || 0;
    const chipClass  = warnCount === 0 ? 'warning-chip-0' : warnCount === 1 ? 'warning-chip-1' : 'warning-chip-2';
    const warnLabel  = warnCount === 0
      ? 'No curfew warnings'
      : warnCount === 1
        ? '1 curfew warning'
        : `${warnCount} warnings — fines apply`;

    card.innerHTML = `
      <div class="student-card-top">
        <div class="student-avatar ${colorClass}">${initial}</div>
        <div class="student-info">
          <div class="student-name">${esc(student.name)}</div>
          <div class="student-room">
            ${student.hostelBlock ? esc(student.hostelBlock) + ' &bull; ' : ''}Room ${student.roomNumber}
          </div>
          <span class="warning-chip ${chipClass}">${warnLabel}</span>
        </div>
      </div>
      <div class="student-card-actions">
        <div class="action-group">
          <button class="student-action-btn action-entry"     data-action="entry">Entry</button>
          <button class="student-action-btn action-exit"      data-action="exit">Exit</button>
          <button class="student-action-btn action-violation" data-action="violation">Violation</button>
        </div>
        <div class="action-group">
          <button class="student-action-btn action-view"   data-action="view">History</button>
          <button class="student-action-btn action-edit"   data-action="edit">Edit</button>
          <button class="student-action-btn action-remove" data-action="remove">Delete</button>
        </div>
      </div>
    `;

    card.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        switch (btn.dataset.action) {
          case 'entry':     openAttendanceModal(student, 'entry');     break;
          case 'exit':      openAttendanceModal(student, 'exit');      break;
          case 'violation': openViolationModal(student);               break;
          case 'edit':      openEditStudentModal(student);             break;
          case 'remove':    openRemoveModal(student);                  break;
          case 'view':      openDetailModal(student);                  break;
        }
      });
    });

    return card;
  }

  async function fetchStats() {
    try {
      const stats = await apiGet('/stats');
      animateCount(statTotal,      stats.totalStudents);
      animateCount(statRooms,      stats.uniqueRooms);
      animateCount(statViolations, stats.totalViolations);
      statFines.textContent = fmtINR(stats.unpaidFineTotal);
    } catch {
      statTotal.textContent      = allStudents.length;
      statRooms.textContent      = new Set(allStudents.map(s => s.roomNumber)).size;
      statViolations.textContent = allViolations.length;
    }
  }

  function animateCount(el, target) {
    const t0 = performance.now();
    const tick = t => {
      const p = Math.min((t - t0) / 600, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  let searchTimer;
  searchInput.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderStudents, 200); });

  refreshBtn.addEventListener('click', async () => {
    refreshBtn.textContent = 'Refreshing...';
    refreshBtn.disabled = true;
    searchInput.value = '';
    await Promise.all([loadStudents(), loadAttendance(), loadViolations()]);
    refreshBtn.textContent = 'Refresh';
    refreshBtn.disabled = false;
  });

  // ── Student Dropdowns ────────────────────────────────────────────────────
  const attStudentSel  = document.getElementById('attStudent');
  const violStudentSel = document.getElementById('violStudent');

  function updateStudentDropdowns() {
    const gbCol = globalCollegeFilter ? globalCollegeFilter.value : '';
    const gbBlk = globalBlockFilter ? globalBlockFilter.value : '';

    [attStudentSel, violStudentSel].forEach(sel => {
      // Remember current selection
      const cur = sel.value;
      sel.innerHTML = '<option value="">-- Select a student --</option>';
      allStudents.forEach(s => {
        if (gbCol && gbBlk && (s.college !== gbCol || s.hostelBlock !== gbBlk)) return;
        const opt = document.createElement('option');
        opt.value       = s._id;
        opt.textContent = `${s.name} — Room ${s.roomNumber}`;
        sel.appendChild(opt);
      });
      // Restore if still valid
      if (cur && allStudents.find(s => s._id === cur)) sel.value = cur;
    });
  }

  // ── Remove Modal ─────────────────────────────────────────────────────────
  const removeModal      = document.getElementById('removeModal');
  const removeModalText  = document.getElementById('removeModalText');
  const confirmRemoveBtn = document.getElementById('confirmRemoveBtn');

  document.getElementById('closeRemoveModal').addEventListener('click',  () => closeModal(removeModal));
  document.getElementById('cancelRemoveModal').addEventListener('click', () => closeModal(removeModal));

  function openRemoveModal(student) {
    removeTargetId = student._id;
    removeModalText.textContent = `Remove "${student.name}" from Room ${student.roomNumber}? All attendance records and violations for this student will also be permanently deleted.`;
    openModal(removeModal);
  }

  confirmRemoveBtn.addEventListener('click', async () => {
    if (!removeTargetId) return;
    setBtnLoading(confirmRemoveBtn, true, 'Removing...');
    try {
      await apiDelete(`/students/${removeTargetId}`);
      closeModal(removeModal);
      removeTargetId = null;
      showToast('Student removed successfully.', 'success');
      await Promise.all([loadStudents(), loadAttendance(), loadViolations()]);
    } catch (ex) {
      showToast(ex.message || 'Could not remove student.', 'error');
    } finally {
      setBtnLoading(confirmRemoveBtn, false, 'Yes, Remove');
    }
  });

  // ── Attendance Modal (FIXED) ───────────────────────────────────────────
  const attModal         = document.getElementById('attendanceModal');
  const attForm          = document.getElementById('attendanceForm');
  const attStudentError  = document.getElementById('attStudentError');
  const attNoteEl        = document.getElementById('attNote');
  const submitAttBtn     = document.getElementById('submitAttendanceBtn');
  const exitExGroup      = document.getElementById('exitExceptionGroup');
  const exitException    = document.getElementById('exitException');
  const lateEntryWarning = document.getElementById('lateEntryWarning');
  const liveClock        = document.getElementById('liveClock');
  const curfewStatusLbl  = document.getElementById('curfewStatusLabel');

  document.getElementById('openAttendanceFormBtn').addEventListener('click', () => openAttendanceModal(null, 'entry'));
  document.getElementById('closeAttendanceModal').addEventListener('click',  () => closeAttendanceModalFn());
  document.getElementById('cancelAttendanceModal').addEventListener('click', () => closeAttendanceModalFn());

  // Type radio change → update UI
  attForm.querySelectorAll('input[name="attType"]').forEach(radio => {
    radio.addEventListener('change', updateAttendanceModalUI);
  });

  function openAttendanceModal(student = null, type = 'entry') {
    // Reset form FIRST
    attForm.reset();
    attStudentError.textContent  = '';
    attStudentSel.classList.remove('error');
    exitExGroup.hidden      = true;
    lateEntryWarning.hidden = true;

    // NOW set student — must happen AFTER reset
    if (student) {
      // Ensure dropdown is populated first
      updateStudentDropdowns();
      attStudentSel.value = student._id;
    }

    // Set radio AFTER reset
    const radio = attForm.querySelector(`input[name="attType"][value="${type}"]`);
    if (radio) {
      radio.checked = true;
    }

    openModal(attModal);
    startClock();
    updateAttendanceModalUI();
  }

  function closeAttendanceModalFn() {
    closeModal(attModal);
    stopClock();
  }

  function startClock() {
    stopClock();
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
  }

  function stopClock() {
    if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
  }

  function updateClock() {
    const now  = new Date();
    const h    = now.getHours();
    const m    = now.getMinutes();
    const s    = now.getSeconds();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12  = h % 12 || 12;
    liveClock.textContent = `${fmt(h12)}:${fmt(m)}:${fmt(s)} ${ampm}`;
    updateAttendanceModalUI();
  }

  function updateAttendanceModalUI() {
    const type = attForm.querySelector('input[name="attType"]:checked')?.value || 'entry';
    const now  = new Date();
    const h    = now.getHours();
    const m    = now.getMinutes();
    const mins = h * 60 + m;
    const morningMins = 6 * 60; // 6:00 AM ends curfew

    const afterEntryCurfew = mins > ENTRY_CURFEW.h * 60 + ENTRY_CURFEW.m || mins < morningMins;
    const afterExitCurfew  = mins > EXIT_CURFEW.h  * 60 + EXIT_CURFEW.m || mins < morningMins;

    if (type === 'exit') {
      exitExGroup.hidden      = !afterExitCurfew;
      lateEntryWarning.hidden = true;
      if (afterExitCurfew) {
        curfewStatusLbl.textContent = 'Exit curfew in effect (10:20 PM). Exception required.';
        curfewStatusLbl.className   = 'time-label status-warn';
      } else {
        curfewStatusLbl.textContent = 'Exit permitted — within curfew hours.';
        curfewStatusLbl.className   = 'time-label status-ok';
      }
    } else {
      exitExGroup.hidden      = true;
      lateEntryWarning.hidden = !afterEntryCurfew;
      if (afterEntryCurfew) {
        curfewStatusLbl.textContent = 'Past entry curfew (10:30 PM). This will count as a late entry.';
        curfewStatusLbl.className   = 'time-label status-late';
      } else if (mins >= ENTRY_CURFEW.h * 60 + ENTRY_CURFEW.m - 15 && mins <= ENTRY_CURFEW.h * 60 + ENTRY_CURFEW.m) {
        curfewStatusLbl.textContent = 'Entry curfew in 15 minutes.';
        curfewStatusLbl.className   = 'time-label status-warn';
      } else {
        curfewStatusLbl.textContent = 'Within curfew hours. Entry is permitted.';
        curfewStatusLbl.className   = 'time-label status-ok';
      }
    }
  }

  attForm.addEventListener('submit', async e => {
    e.preventDefault();
    attStudentError.textContent = '';
    attStudentSel.classList.remove('error');

    const studentId  = attStudentSel.value;
    const type       = attForm.querySelector('input[name="attType"]:checked')?.value || 'entry';
    const note       = attNoteEl.value.trim();
    const exceptionReason = (type === 'exit' && !exitExGroup.hidden) ? exitException.value : '';

    if (!studentId) {
      attStudentError.textContent = 'Please select a student.';
      attStudentSel.classList.add('error');
      return;
    }

    setBtnLoading(submitAttBtn, true, 'Saving...');
    try {
      const res = await apiPost('/attendance', { studentId, type, note, exceptionReason });
      closeAttendanceModalFn();

      const studentName = allStudents.find(s => s._id === studentId)?.name || 'Student';

      if (res.isLate && res.warningNum) {
        if (res.warningNum >= 2) {
          showToast(`Late entry for ${studentName} — Warning #${res.warningNum}. Fine of ₹200 raised automatically.`, 'error');
        } else {
          showToast(`Late entry for ${studentName} — Warning #${res.warningNum} issued (₹200 fine after 2nd warning).`, 'info');
        }
      } else {
        showToast(`${cap(type)} logged for ${studentName}.`, 'success');
      }

      await Promise.all([loadStudents(), loadAttendance(), loadViolations()]);
    } catch (ex) {
      if (ex.curfewBlocked) {
        showToast('Exit blocked: past 10:20 PM curfew. Select an approved exception.', 'error');
      } else {
        showToast(ex.message || 'Could not save record.', 'error');
      }
    } finally {
      setBtnLoading(submitAttBtn, false, 'Save Record');
    }
  });

  // ── Attendance Section ────────────────────────────────────────────────────
  const attLoading   = document.getElementById('attendanceLoading');
  const attEmpty     = document.getElementById('attendanceEmpty');
  const attTableWrap = document.getElementById('attendanceTableWrap');
  const attBody      = document.getElementById('attendanceBody');
  const attSearch    = document.getElementById('attendanceSearch');

  async function loadAttendance() {
    attLoading.style.display = 'flex';
    attEmpty.hidden = true;
    attTableWrap.hidden = true;
    try {
      allAttendance = await apiGet('/attendance');
      renderAttendance();
    } catch {
      attLoading.style.display = 'none';
      attEmpty.hidden = false;
    }
  }

  function renderAttendance() {
    attLoading.style.display = 'none';
    const q = attSearch.value.toLowerCase().trim();

    if (globalCollegeFilter && (!globalCollegeFilter.value || !globalBlockFilter.value)) {
      attTableWrap.hidden = true;
      attEmpty.hidden = false;
      setEmptyMsg(attEmpty, 'Select Hostel Block', 'Please select a college and hostel block to view logs.');
      return;
    }

    const validStudentIds = new Set(allStudents.filter(s => s.college === globalCollegeFilter.value && s.hostelBlock === globalBlockFilter.value).map(s => s._id));
    let records = allAttendance.filter(r => validStudentIds.has(r.studentId));

    if (attFilter === 'entry') records = records.filter(r => r.type === 'entry');
    else if (attFilter === 'exit')  records = records.filter(r => r.type === 'exit');
    else if (attFilter === 'late')  records = records.filter(r => r.isLate);
    if (q) records = records.filter(r => r.studentName.toLowerCase().includes(q) || String(r.roomNumber).includes(q));

    if (records.length === 0) {
      attTableWrap.hidden = true;
      attEmpty.hidden = false;
      setEmptyMsg(attEmpty, 'No records found', q ? 'Try a different search.' : 'Log the first entry or exit above.');
      return;
    }

    attEmpty.hidden = true;
    attTableWrap.hidden = false;
    attBody.innerHTML = '';

    records.forEach(r => {
      const tr = document.createElement('tr');
      if (r.isLate) tr.style.background = 'rgba(255,90,90,0.035)';

      const dt      = new Date(r.timestamp);
      const dateStr = dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

      let statusCell = '';
      if (r.isLate) {
        statusCell = `<span class="late-badge">Late #${r.warningNum}</span>`;
      } else if (r.hasException) {
        statusCell = `<span class="exception-badge">${esc(r.exceptionReason)}</span>`;
      } else if (r.note) {
        statusCell = `<span style="font-style:italic;color:var(--text-muted)">${esc(r.note)}</span>`;
      } else {
        statusCell = '<span style="color:var(--text-muted)">—</span>';
      }

      tr.innerHTML = `
        <td>${esc(r.studentName)}</td>
        <td>Room ${r.roomNumber}</td>
        <td><span class="${r.type === 'entry' ? 'entry-badge' : 'exit-badge'}">${cap(r.type)}</span></td>
        <td>${dateStr}</td>
        <td>${timeStr}</td>
        <td>${statusCell}</td>
        <td style="text-align:right">
          <button class="btn btn-ghost" style="padding: 4px 8px; font-size: 13px; color: var(--accent-amber)" onclick="openEditAttendanceModal('${r._id}')">Edit</button>
          <button class="btn btn-ghost" style="padding: 4px 8px; font-size: 13px; color: var(--accent-red)" onclick="deleteAttendance('${r._id}')">Del</button>
        </td>
      `;
      attBody.appendChild(tr);
    });
  }

  document.getElementById('attendanceFilter').querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.getElementById('attendanceFilter').querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      attFilter = tab.dataset.filter;
      renderAttendance();
    });
  });

  let attSearchTimer;
  attSearch.addEventListener('input', () => { clearTimeout(attSearchTimer); attSearchTimer = setTimeout(renderAttendance, 200); });

  // ── Violation Modal ───────────────────────────────────────────────────────
  const violModal      = document.getElementById('violationModal');
  const violForm       = document.getElementById('violationForm');
  const violStudErr    = document.getElementById('violStudentError');
  const violTypeEl     = document.getElementById('violType');
  const violTypeErr    = document.getElementById('violTypeError');
  const violDescEl     = document.getElementById('violDesc');
  const submitViolBtn  = document.getElementById('submitViolationBtn');
  const finePreview    = document.getElementById('finePreview');
  const fineAmountEl   = document.getElementById('fineAmount');

  document.getElementById('openViolationFormBtn').addEventListener('click',  () => openViolationModal(null));
  document.getElementById('closeViolationModal').addEventListener('click',   () => closeModal(violModal));
  document.getElementById('cancelViolationModal').addEventListener('click',  () => closeModal(violModal));

  // Live fine preview on type change
  violTypeEl.addEventListener('change', () => {
    const type = violTypeEl.value;
    if (type && FINES[type] !== undefined) {
      finePreview.hidden   = false;
      fineAmountEl.textContent = fmtINR(FINES[type]);
    } else {
      finePreview.hidden = true;
    }
  });

  function openViolationModal(student = null) {
    violForm.reset();
    violStudErr.textContent = '';
    violTypeErr.textContent = '';
    violStudentSel.classList.remove('error');
    violTypeEl.classList.remove('error');
    finePreview.hidden = true;

    if (student) {
      updateStudentDropdowns();   // ensure options exist
      violStudentSel.value = student._id;
    }
    openModal(violModal);
  }

  violForm.addEventListener('submit', async e => {
    e.preventDefault();
    violStudErr.textContent = '';
    violTypeErr.textContent = '';
    let hasErr = false;

    const studentId   = violStudentSel.value;
    const type        = violTypeEl.value;
    const severity    = violForm.querySelector('input[name="violSeverity"]:checked')?.value || 'medium';
    const description = violDescEl.value.trim();

    if (!studentId) { violStudErr.textContent = 'Please select a student.'; violStudentSel.classList.add('error'); hasErr = true; }
    if (!type)      { violTypeErr.textContent = 'Please select a violation type.';  violTypeEl.classList.add('error');       hasErr = true; }
    if (hasErr) return;

    setBtnLoading(submitViolBtn, true, 'Submitting...');
    try {
      await apiPost('/violations', { studentId, type, severity, description });
      closeModal(violModal);
      const name = allStudents.find(s => s._id === studentId)?.name || 'Student';
      const fine = FINES[type] ?? 0;
      showToast(`Violation filed for ${name}. Fine: ${fmtINR(fine)}.`, 'success');
      await Promise.all([loadViolations(), fetchStats()]);
    } catch (ex) {
      showToast(ex.message || 'Could not file violation.', 'error');
    } finally {
      setBtnLoading(submitViolBtn, false, 'File Violation');
    }
  });

  // ── Violations Section ────────────────────────────────────────────────────
  const violLoading = document.getElementById('violationsLoading');
  const violEmpty   = document.getElementById('violationsEmpty');
  const violGrid    = document.getElementById('violationsGrid');
  const violSearch  = document.getElementById('violationSearch');

  async function loadViolations() {
    violLoading.style.display = 'flex';
    violEmpty.hidden = true;
    violGrid.innerHTML = '';
    try {
      allViolations = await apiGet('/violations');
      renderViolations();
    } catch {
      violLoading.style.display = 'none';
      violEmpty.hidden = false;
    }
  }

  function renderViolations() {
    violLoading.style.display = 'none';
    const q = violSearch.value.toLowerCase().trim();
    
    if (globalCollegeFilter && (!globalCollegeFilter.value || !globalBlockFilter.value)) {
      violGrid.innerHTML = '';
      violEmpty.hidden = false;
      setEmptyMsg(violEmpty, 'Select Hostel Block', 'Please select a college and hostel block to view violations.');
      return;
    }

    const validStudentIds = new Set(allStudents.filter(s => s.college === globalCollegeFilter.value && s.hostelBlock === globalBlockFilter.value).map(s => s._id));
    let records = allViolations.filter(v => validStudentIds.has(v.studentId));

    if (violFilter === 'unpaid') records = records.filter(v => !v.isPaid && v.fine > 0);
    else if (violFilter === 'high')   records = records.filter(v => v.severity === 'high');
    else if (violFilter === 'medium') records = records.filter(v => v.severity === 'medium');
    else if (violFilter === 'low')    records = records.filter(v => v.severity === 'low');

    if (q) records = records.filter(v => v.studentName.toLowerCase().includes(q) || v.type.toLowerCase().includes(q));

    if (records.length === 0) {
      violGrid.innerHTML = '';
      violEmpty.hidden = false;
      setEmptyMsg(violEmpty, 'No violations found', q ? 'Try a different search.' : 'No violations recorded for this block.');
      return;
    }

    violEmpty.hidden = true;
    violGrid.innerHTML = '';
    records.forEach((v, i) => violGrid.appendChild(buildViolationCard(v, i)));
  }

  function buildViolationCard(v, index) {
    const card = document.createElement('div');
    card.className = 'violation-card';
    card.style.animationDelay = `${index * 0.04}s`;
    const dt  = new Date(v.reportedAt);
    const sc  = `sev-badge-${v.severity}`;
    const autoBadge = v.isAuto ? '<span class="auto-badge">Auto</span>' : '';
    const finePaid  = v.fine > 0
      ? `<span class="fine-badge ${v.isPaid ? 'fine-paid' : ''}">${fmtINR(v.fine)}</span>`
      : '';
    const payBtnHtml = (v.fine > 0 && !v.isPaid)
      ? `<button class="pay-btn" data-id="${v._id}">Mark Paid</button>`
      : '';

    card.innerHTML = `
      <div class="violation-card-header">
        <div class="violation-meta">
          <div class="violation-type">${esc(v.type)}${autoBadge}</div>
          <div class="violation-student">${esc(v.studentName)} — Room ${v.roomNumber}</div>
        </div>
        <span class="severity-badge ${sc}">${cap(v.severity)}</span>
      </div>
      <div class="violation-desc">${esc(v.description) || 'No additional details provided.'}</div>
      <div class="violation-footer">
        <div style="display:flex;align-items:center;gap:10px">
          ${finePaid}
          ${payBtnHtml}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="violation-date">${dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})} ${dt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>
          <button class="btn-delete-violation" data-id="${v._id}">Delete</button>
        </div>
      </div>
    `;

    card.querySelector('.btn-delete-violation').addEventListener('click', async () => {
      try {
        await apiDelete(`/violations/${v._id}`);
        showToast('Violation removed.', 'info');
        await Promise.all([loadViolations(), fetchStats()]);
      } catch (ex) { showToast(ex.message || 'Could not delete.', 'error'); }
    });

    const payBtn = card.querySelector('.pay-btn');
    if (payBtn) {
      payBtn.addEventListener('click', async () => {
        try {
          await apiPatch(`/violations/${v._id}/pay`);
          showToast(`Fine of ${fmtINR(v.fine)} marked as paid.`, 'success');
          await Promise.all([loadViolations(), fetchStats()]);
        } catch (ex) { showToast(ex.message || 'Could not update.', 'error'); }
      });
    }

    return card;
  }

  document.getElementById('violationFilter').querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.getElementById('violationFilter').querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      violFilter = tab.dataset.filter;
      renderViolations();
    });
  });

  let violSearchTimer;
  violSearch.addEventListener('input', () => { clearTimeout(violSearchTimer); violSearchTimer = setTimeout(renderViolations, 200); });

  // ── Student Detail Modal ──────────────────────────────────────────────────
  const detailModal   = document.getElementById('studentDetailModal');
  const detailContent = document.getElementById('studentDetailContent');
  const detailTitle   = document.getElementById('studentDetailTitle');

  document.getElementById('closeStudentDetailModal').addEventListener('click', () => closeModal(detailModal));

  async function openDetailModal(student) {
    detailTitle.textContent = `${student.name} — Room ${student.roomNumber}`;
    detailContent.innerHTML = '<div style="text-align:center;padding:40px"><div class="spinner" style="margin:auto"></div></div>';
    openModal(detailModal);

    const [attRes, violRes] = await Promise.allSettled([
      apiGet(`/attendance/${student._id}`),
      apiGet(`/violations/${student._id}`)
    ]);

    const att  = attRes.status  === 'fulfilled' ? attRes.value  : [];
    const viol = violRes.status === 'fulfilled' ? violRes.value : [];

    const colorClass = `avatar-${allStudents.findIndex(s => s._id === student._id) % 8}`;
    const initial    = student.name.charAt(0).toUpperCase();
    const warnCount  = student.warningCount || 0;

    const attRows = att.length === 0
      ? '<div class="detail-empty">No attendance records yet.</div>'
      : att.map(r => {
          const dt = new Date(r.timestamp);
          const lateBadge = r.isLate ? `<span class="late-badge">Late #${r.warningNum}</span>` : '';
          const excBadge  = r.hasException ? `<span class="exception-badge">${esc(r.exceptionReason)}</span>` : '';
          return `<div class="detail-log-row">
            <span class="detail-log-type"><span class="${r.type === 'entry' ? 'entry-badge' : 'exit-badge'}">${cap(r.type)}</span>${lateBadge}${excBadge}</span>
            <span class="detail-log-time">${dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})} &nbsp; ${dt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>
            <span class="detail-log-note">${esc(r.note) || ''}</span>
          </div>`;
        }).join('');

    const violRows = viol.length === 0
      ? '<div class="detail-empty">No violations recorded.</div>'
      : viol.map(v => {
          const dt = new Date(v.reportedAt);
          const sc = `sev-badge-${v.severity}`;
          const autoBadge = v.isAuto ? '<span class="auto-badge">Auto</span>' : '';
          return `<div class="detail-viol-row">
            <div class="detail-viol-top">
              <span class="detail-viol-type">${esc(v.type)}${autoBadge}</span>
              <div style="display:flex;align-items:center;gap:8px">
                <span class="severity-badge ${sc}">${cap(v.severity)}</span>
                ${v.fine > 0 ? `<span class="fine-badge ${v.isPaid ? 'fine-paid' : ''}">${fmtINR(v.fine)}</span>` : ''}
                <span class="detail-viol-date">${dt.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</span>
              </div>
            </div>
            ${v.description ? `<div class="detail-viol-desc">${esc(v.description)}</div>` : ''}
          </div>`;
        }).join('');

    const totFines = viol.reduce((s, v) => s + (v.isPaid ? 0 : (v.fine || 0)), 0);

    detailContent.innerHTML = `
      <div class="detail-student-header">
        <div class="detail-avatar ${colorClass}">${initial}</div>
        <div>
          <div class="detail-name">${esc(student.name)}</div>
          <div class="detail-room">Room ${student.roomNumber}</div>
          ${warnCount > 0 ? `<div style="margin-top:6px"><span class="warning-chip ${warnCount >= 2 ? 'warning-chip-2' : 'warning-chip-1'}">${warnCount} curfew warning${warnCount !== 1 ? 's' : ''}</span></div>` : ''}
          ${totFines > 0 ? `<div style="margin-top:4px;font-size:13px;color:var(--accent-red)">Outstanding fines: ${fmtINR(totFines)}</div>` : ''}
        </div>
      </div>
      <div class="detail-tabs">
        <button class="detail-tab active" data-tab="attendance">Attendance (${att.length})</button>
        <button class="detail-tab" data-tab="violations">Violations (${viol.length})</button>
      </div>
      <div class="detail-section active" id="detail-attendance">${attRows}</div>
      <div class="detail-section"        id="detail-violations">${violRows}</div>
    `;

    detailContent.querySelectorAll('.detail-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        detailContent.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
        detailContent.querySelectorAll('.detail-section').forEach(s => s.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`detail-${tab.dataset.tab}`)?.classList.add('active');
      });
    });
  }

  // ── Edit Student System ──────────────────────────────────────────────────
  const editStudentModal = document.getElementById('editStudentModal');
  const editStudentForm  = document.getElementById('editStudentForm');
  const btnSubmitEditStudent = document.getElementById('submitEditStudentBtn');

  document.getElementById('closeEditStudentModal').addEventListener('click', () => closeModal(editStudentModal));
  document.getElementById('cancelEditStudentModal').addEventListener('click', () => closeModal(editStudentModal));

  window.openEditStudentModal = function(student) {
    document.getElementById('editStudentId').value = student._id;
    document.getElementById('editStudentName').value = student.name;
    document.getElementById('editRoomNumber').value = student.roomNumber;
    
    const collegeTag = student.college || 'MSRIT';
    document.getElementById('editStudentCollege').value = collegeTag;
    updateBlockOptions(document.getElementById('editStudentCollege'), document.getElementById('editHostelBlock'));
    
    document.getElementById('editHostelBlock').value = student.hostelBlock || '';
    
    clearErrors(document.getElementById('editNameError'), document.getElementById('editStudentName'));
    clearErrors(document.getElementById('editRoomError'), document.getElementById('editRoomNumber'));
    clearErrors(document.getElementById('editBlockError'), document.getElementById('editHostelBlock'));
    openModal(editStudentModal);
  };

  editStudentForm.addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('editStudentId').value;
    const name = document.getElementById('editStudentName').value.trim();
    const roomNumber = parseInt(document.getElementById('editRoomNumber').value.trim(), 10);
    const college = document.getElementById('editStudentCollege').value;
    const hostelBlock = document.getElementById('editHostelBlock').value;
    
    let err = false;
    if (!name || name.length < 2) err = true;
    if (isNaN(roomNumber) || roomNumber < 1) err = true;
    if (!hostelBlock) err = true;
    if (err) return showToast('Please fix the errors in the form', 'error');

    setBtnLoading(btnSubmitEditStudent, true, 'Saving...');
    try {
      await apiPut(`/students/${id}`, { name, roomNumber, college, hostelBlock });
      showToast('Student details updated', 'success');
      closeModal(editStudentModal);
      loadStudents();
      loadAttendance();
      loadViolations();
    } catch (ex) {
      showToast(ex.message, 'error');
    } finally {
      setBtnLoading(btnSubmitEditStudent, false, 'Save Changes');
    }
  });

  // ── Edit/Delete Attendance System ─────────────────────────────────────────
  const editAttendanceModal = document.getElementById('editAttendanceModal');
  const editAttendanceForm  = document.getElementById('editAttendanceForm');
  const btnSubmitEditAtt = document.getElementById('submitEditAttendanceBtn');

  document.getElementById('closeEditAttendanceModal').addEventListener('click', () => closeModal(editAttendanceModal));
  document.getElementById('cancelEditAttendanceModal').addEventListener('click', () => closeModal(editAttendanceModal));

  window.openEditAttendanceModal = function(id) {
    const record = allAttendance.find(r => r._id === id);
    if (!record) return;
    document.getElementById('editAttendanceId').value = record._id;
    if (record.type === 'entry') document.getElementById('editAttTypeEntry').checked = true;
    else document.getElementById('editAttTypeExit').checked = true;
    
    document.getElementById('editAttNote').value = record.note || record.exceptionReason || '';
    openModal(editAttendanceModal);
  };

  editAttendanceForm.addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('editAttendanceId').value;
    const type = document.querySelector('input[name="editAttType"]:checked').value;
    const note = document.getElementById('editAttNote').value.trim();

    setBtnLoading(btnSubmitEditAtt, true, 'Saving...');
    try {
      await apiPut(`/attendance/${id}`, { type, note });
      showToast('Attendance record updated', 'success');
      closeModal(editAttendanceModal);
      loadAttendance();
    } catch (ex) {
      showToast(ex.message, 'error');
    } finally {
      setBtnLoading(btnSubmitEditAtt, false, 'Save Changes');
    }
  });

  window.deleteAttendance = async function(id) {
    if (!confirm('Are you sure you want to completely delete this attendance record?\n\nWarning: Auto-generated fines linked to late entries will NOT be deleted automatically.')) return;
    try {
      await apiDelete(`/attendance/${id}`);
      showToast('Attendance record deleted', 'success');
      loadAttendance();
    } catch (ex) {
      showToast(ex.message, 'error');
    }
  };

  // ── Modal Helpers ─────────────────────────────────────────────────────────
  function openModal(modal) {
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    // close on overlay click
    modal._overlayHandler = e => { if (e.target === modal) closeModal(modal); };
    modal.addEventListener('click', modal._overlayHandler);
  }
  function closeModal(modal) {
    modal.hidden = true;
    document.body.style.overflow = '';
    if (modal._overlayHandler) modal.removeEventListener('click', modal._overlayHandler);
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not([hidden])').forEach(m => {
        closeModal(m);
        if (m === attModal) stopClock();
      });
    }
  });

  // ── Button Loader Helper ──────────────────────────────────────────────────
  function setBtnLoading(btn, loading, label) {
    btn.disabled = loading;
    const lblEl = btn.querySelector('.btn-label');
    const ldrEl = btn.querySelector('.btn-loader');
    if (lblEl) lblEl.textContent = label;
    if (ldrEl) ldrEl.hidden = !loading;
  }

  // ── Empty message helper ──────────────────────────────────────────────────
  function setEmptyMsg(el, title, desc) {
    el.querySelector('h3').textContent = title;
    el.querySelector('p').textContent  = desc;
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  const toastContainer = document.getElementById('toastContainer');
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<div class="toast-dot"></div><span>${esc(message)}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  // ── API Helpers ──────────────────────────────────────────────────────────
  async function apiGet(path) {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
    return res.json();
  }
  async function apiPost(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.curfewBlocked = data.curfewBlocked;
      throw err;
    }
    return data;
  }
  async function apiDelete(path) {
    const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }
  async function apiPut(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }
  async function apiPatch(path) {
    const res = await fetch(`${API_BASE}${path}`, { method: 'PATCH' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  // ── Scroll Animations ─────────────────────────────────────────────────────
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity   = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.feature-card').forEach((card, i) => {
    card.style.cssText += `opacity:0;transform:translateY(12px);transition:opacity 0.4s ease ${i*0.1}s,transform 0.4s ease ${i*0.1}s`;
    observer.observe(card);
  });

  // ── BlurText Animation ────────────────────────────────────────────────────
  function applyBlurTextToNode(node, delayRef) {
    if (node.nodeType === Node.TEXT_NODE) {
      const words = node.textContent.split(/(\s+)/);
      const fragment = document.createDocumentFragment();
      words.forEach(word => {
        if (!word) return;
        if (word.trim() === '') {
          fragment.appendChild(document.createTextNode(word));
        } else {
          const span = document.createElement('span');
          span.textContent = word;
          span.className = 'blur-word';
          span.style.animationDelay = `${delayRef.current * 0.12}s`;
          delayRef.current++;
          fragment.appendChild(span);
        }
      });
      return fragment;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.tagName.toLowerCase() === 'br') return node.cloneNode();
      const newEl = node.cloneNode();
      newEl.innerHTML = '';
      Array.from(node.childNodes).forEach(child => {
        newEl.appendChild(applyBlurTextToNode(child, delayRef));
      });
      return newEl;
    }
  }

  function initBlurText() {
    document.querySelectorAll('.blur-text').forEach(el => {
      const delayRef = { current: 0 };
      const newContent = document.createDocumentFragment();
      Array.from(el.childNodes).forEach(child => {
        newContent.appendChild(applyBlurTextToNode(child, delayRef));
      });
      el.innerHTML = '';
      el.appendChild(newContent);
    });
  }

  // ── LightRays Canvas Background ───────────────────────────────────────────
  function initLightRays() {
    const canvas = document.getElementById('lightRaysCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let width, height;
    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    }
    window.addEventListener('resize', resize);
    resize();

    const rays = [];
    const numRays = 45;
    for (let i = 0; i < numRays; i++) {
      rays.push({
        angle: Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8, // pointing downwards
        width: Math.random() * 0.15 + 0.02, // cone width
        speed: (Math.random() - 0.5) * 0.0015,
        length: Math.random() * height * 0.6 + height * 0.8, // long rays
        opacity: Math.random() * 0.08 + 0.02
      });
    }

    let mouseX = width / 2;
    let mouseY = 0;
    
    window.addEventListener('mousemove', e => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    });

    // Smooth movement variables
    let currentOriginX = width / 2;
    let currentOriginY = -50;

    function draw() {
      ctx.clearRect(0, 0, width, height);

      // Interpolate origin roughly based on mouse position (mouseInfluence = 0.1)
      const targetOriginX = width / 2 + (mouseX - width / 2) * 0.1;
      const targetOriginY = -50 + (mouseY) * 0.05;
      
      currentOriginX += (targetOriginX - currentOriginX) * 0.05;
      currentOriginY += (targetOriginY - currentOriginY) * 0.05;

      rays.forEach(ray => {
        ray.angle += ray.speed;
        
        const endX = currentOriginX + Math.cos(ray.angle) * ray.length;
        const endY = currentOriginY + Math.sin(ray.angle) * ray.length;
        
        const grad = ctx.createLinearGradient(currentOriginX, currentOriginY, endX, endY);
        grad.addColorStop(0, `rgba(255, 255, 255, ${ray.opacity})`);
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.beginPath();
        ctx.moveTo(currentOriginX, currentOriginY);
        ctx.lineTo(currentOriginX + Math.cos(ray.angle - ray.width) * ray.length, currentOriginY + Math.sin(ray.angle - ray.width) * ray.length);
        ctx.lineTo(currentOriginX + Math.cos(ray.angle + ray.width) * ray.length, currentOriginY + Math.sin(ray.angle + ray.width) * ray.length);
        ctx.closePath();
        
        ctx.fillStyle = grad;
        ctx.fill();
      });

      requestAnimationFrame(draw);
    }
    draw();
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  updateNav();
  initBlurText();
  initLightRays();
  loadStudents();
  loadAttendance();
  loadViolations();

})();

// SMARTLIB CONNECT - app.js (v3 — Flask Backend & MySQL Database Integration)
// Supports MySQL persistent storage via Flask REST API + Offline/Local fallback
const FINE_PER_DAY = 5;

// ========================
// SECTION 0: API & STORAGE
// ========================
const IS_SERVER_ENV = window.location.protocol.startsWith('http');
let backendDatabaseType = null;

async function apiFetch(endpoint, options = {}) {
  if (!IS_SERVER_ENV) return null;
  try {
    const res = await fetch(endpoint, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || ('Server error ' + res.status));
    }
    return await res.json();
  } catch (e) {
    console.warn('API error (' + endpoint + '):', e);
    throw e;
  }
}

const STORAGE_KEYS = {
  books:        'slc_books',
  students:     'slc_students',
  loans:        'slc_loans',
  exchange:     'slc_exchange',
  activity:     'slc_activity',
  users:        'slc_users',
  issueReqs:    'slc_issue_requests',
};

// Clean slate migration: clear old demo cache so users start completely fresh
if (localStorage.getItem('slc_clean_slate_active_v2') !== 'true') {
  try {
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    localStorage.setItem('slc_clean_slate_active_v2', 'true');
  } catch(e) {}
}

function saveData() {
  localStorage.setItem(STORAGE_KEYS.books,     JSON.stringify(booksData));
  localStorage.setItem(STORAGE_KEYS.students,  JSON.stringify(studentsData));
  localStorage.setItem(STORAGE_KEYS.loans,     JSON.stringify(loansData));
  localStorage.setItem(STORAGE_KEYS.exchange,  JSON.stringify(exchangeData));
  localStorage.setItem(STORAGE_KEYS.activity,  JSON.stringify(activityLog));
  localStorage.setItem(STORAGE_KEYS.users,     JSON.stringify(DEMO_USERS));
  localStorage.setItem(STORAGE_KEYS.issueReqs, JSON.stringify(issueRequests));
}

function loadOrDefault(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

// ========================
// SECTION 1: SAMPLE DATA
// ========================
function daysAgo(n)     { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; }
function daysFromNow(n) { const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().split('T')[0]; }

const DEFAULT_BOOKS = [];
const DEFAULT_STUDENTS = [];
function buildDefaultLoans() { return []; }
const DEFAULT_EXCHANGE = [];
const DEFAULT_ACTIVITY = [];
const DEFAULT_USERS = [
  { email:'admin@college.edu', password:'admin123', role:'admin', name:'Library Admin', avatar:'LA', studentId:null },
];

// ---- In-memory state ----
let booksData     = loadOrDefault(STORAGE_KEYS.books)     || DEFAULT_BOOKS;
let studentsData  = loadOrDefault(STORAGE_KEYS.students)  || DEFAULT_STUDENTS;
studentsData.forEach(s => {
  if (!s.status) s.status = 'active';
  if (s.hasAccount === undefined) s.hasAccount = true;
});
let loansData     = loadOrDefault(STORAGE_KEYS.loans)     || buildDefaultLoans();
let exchangeData  = loadOrDefault(STORAGE_KEYS.exchange)  || DEFAULT_EXCHANGE;
let activityLog   = loadOrDefault(STORAGE_KEYS.activity)  || DEFAULT_ACTIVITY;
let DEMO_USERS    = loadOrDefault(STORAGE_KEYS.users)     || DEFAULT_USERS;
let issueRequests = loadOrDefault(STORAGE_KEYS.issueReqs) || [];

const recommendationsData = [
  { id:1,  title:'Clean Code',                   author:'Robert C. Martin',   subject:'Computer Science', tag:'popular', tagLabel:'Popular',    checkouts:28, rating:4.8 },
  { id:2,  title:'Engineering Mathematics',      author:'B.S. Grewal',        subject:'Mathematics',      tag:'popular', tagLabel:'Popular',    checkouts:24, rating:4.7 },
  { id:3,  title:'University Physics',           author:'Young and Freedman', subject:'Physics',          tag:'popular', tagLabel:'Popular',    checkouts:20, rating:4.6 },
  { id:4,  title:'Introduction to Algorithms',   author:'Cormen et al.',      subject:'Computer Science', tag:'popular', tagLabel:'Popular',    checkouts:19, rating:4.9 },
  { id:5,  title:'Thinking, Fast and Slow',      author:'Daniel Kahneman',    subject:'Psychology',       tag:'staff',   tagLabel:'Staff Pick', checkouts:14, rating:4.7 },
  { id:6,  title:'The Pragmatic Programmer',     author:'Hunt and Thomas',    subject:'Computer Science', tag:'staff',   tagLabel:'Staff Pick', checkouts:11, rating:4.8 },
  { id:7,  title:'A Brief History of Time',      author:'Stephen Hawking',    subject:'Physics',          tag:'staff',   tagLabel:'Staff Pick', checkouts:13, rating:4.9 },
  { id:8,  title:'Computer Networks',            author:'Andrew Tanenbaum',   subject:'Computer Science', tag:'new',     tagLabel:'New',        checkouts:6,  rating:4.5 },
  { id:9,  title:'Human Anatomy and Physiology', author:'Elaine Marieb',      subject:'Biology',          tag:'new',     tagLabel:'New',        checkouts:4,  rating:4.6 },
  { id:10, title:'Organic Chemistry',            author:'Paula Bruice',       subject:'Chemistry',        tag:'new',     tagLabel:'New',        checkouts:5,  rating:4.4 },
];

// ========================
// SECTION 2: STATE
// ========================
let currentPage = 'overview';
let currentLoanFilter = 'all';
let currentRecFilter = 'popular';
let selectedBookIdForDetail = null;
let selectedStudentIdForDetail = null;
let selectedExchangeIdForRequest = null;
let loggedInUser = null;
let selectedRole = 'student';
let selectedPhotos = { ab: null, eb: null, lb: null, el: null, elb: null };
let editHistoryData = [];

function handlePhotoSelect(eventOrInput, prefix) {
  const input = (eventOrInput && eventOrInput.target) ? eventOrInput.target : eventOrInput;
  const file = input && input.files && input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please select a valid image file (PNG, JPG, WebP).', 'error');
    if (input) input.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Image size should be under 5MB.', 'error');
    if (input) input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    selectedPhotos[prefix] = e.target.result;
    if (prefix === 'el') selectedPhotos['elb'] = e.target.result;
    if (prefix === 'elb') selectedPhotos['el'] = e.target.result;

    const wrap = document.getElementById(prefix + '-photo-preview') || 
                 document.getElementById(prefix + '-photo-preview-wrap') ||
                 document.getElementById('el-photo-preview') ||
                 document.getElementById('elb-photo-preview') ||
                 document.getElementById('lb-photo-preview');
    const img = document.getElementById(prefix + '-preview-img') || 
                document.getElementById(prefix + '-photo-preview') ||
                document.getElementById('el-preview-img') ||
                document.getElementById('elb-preview-img') ||
                document.getElementById('lb-preview-img') ||
                (wrap ? wrap.querySelector('img') : null);
    if (img && img.tagName === 'IMG') {
      img.src = e.target.result;
    }
    if (wrap) {
      wrap.style.display = 'block';
    }
  };
  reader.readAsDataURL(file);
}

function clearPhotoPreview(prefix) {
  // If prefix is 'eb' (edit book), setting to empty string marks cover for removal
  if (prefix === 'eb') {
    selectedPhotos['eb'] = '';
  } else {
    selectedPhotos[prefix] = null;
  }
  if (prefix === 'el') selectedPhotos['elb'] = null;
  if (prefix === 'elb') selectedPhotos['el'] = null;

  const input = document.getElementById(prefix + '-photo') || 
                document.getElementById('el-photo') || 
                document.getElementById('elb-photo') ||
                document.getElementById('lb-photo');
  if (input) input.value = '';

  const wrap = document.getElementById(prefix + '-photo-preview') || 
               document.getElementById(prefix + '-photo-preview-wrap') ||
               document.getElementById('el-photo-preview') ||
               document.getElementById('elb-photo-preview') ||
               document.getElementById('lb-photo-preview');
  const img = document.getElementById(prefix + '-preview-img') || 
              document.getElementById(prefix + '-photo-preview') ||
              document.getElementById('el-preview-img') ||
              document.getElementById('elb-preview-img') ||
              document.getElementById('lb-preview-img') ||
              (wrap ? wrap.querySelector('img') : null);
  if (img && img.tagName === 'IMG') img.src = '';
  if (wrap) wrap.style.display = 'none';
}

function validateAdminPhone(inputId, errorId) {
  const input = document.getElementById(inputId);
  const errEl = document.getElementById(errorId);
  if (!input) return false;
  const val = input.value.trim();
  const isValid = /^\d{10}$/.test(val);
  if (errEl) {
    if (!isValid && val.length > 0) {
      errEl.textContent = 'Contact number must contain exactly 10 digits.';
      errEl.style.display = 'block';
    } else if (val.length === 0) {
      errEl.textContent = 'Contact number must contain exactly 10 digits.';
      errEl.style.display = 'none';
    } else {
      errEl.style.display = 'none';
    }
  }
  return isValid;
}

// ========================
// SECTION 3: HELPERS
// ========================
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isAdmin() { return loggedInUser && loggedInUser.role === 'admin'; }
function getStudent(id) {
  if (id === null || id === undefined) return null;
  return studentsData.find(s => s.id == id || s.studentId == id || (s.studentId && String(s.studentId).toLowerCase() === String(id).toLowerCase()));
}
function getBook(id) {
  if (id === null || id === undefined) return null;
  return booksData.find(b => b.id == id);
}

function initials(name) {
  return (name || 'ST').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
}

function subjectClass(subject) {
  const s = (subject || '').toLowerCase();
  if (s.includes('computer') || s.includes('cse') || s.includes('data') || s.includes('database')) return 'cs';
  if (s.includes('math'))       return 'math';
  if (s.includes('phys'))       return 'phys';
  if (s.includes('chem'))       return 'chem';
  if (s.includes('econ'))       return 'econ';
  if (s.includes('mech') || s.includes('electron') || s.includes('engg') || s.includes('bio') || s.includes('control') || s.includes('signal') || s.includes('thermo')) return 'eng';
  return 'other';
}

function calcFine(loan) {
  if (loan.returned) return 0;
  const due = new Date(loan.due + 'T00:00:00');
  const now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.floor((now - due) / 86400000);
  return diff > 0 ? diff * FINE_PER_DAY : 0;
}

function loanStatus(loan) {
  if (loan.returned) return 'returned';
  return calcFine(loan) > 0 ? 'overdue' : 'active';
}

function formatDate(str) {
  if (!str) return '-';
  const d = new Date(str.includes('T') ? str : str + 'T00:00:00');
  return isNaN(d.getTime()) ? str : d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

function availableCopies(book) {
  const out     = loansData.filter(l => l.bookId === book.id && !l.returned).length;
  const pending = issueRequests.filter(r => r.bookId === book.id && r.status === 'pending').length;
  return Math.max(0, book.copies - out - pending);
}

// Update DB badge in UI
function updateBackendBadge(type) {
  let badge = document.getElementById('dbStatusBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'dbStatusBadge';
    badge.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:rgba(42,157,143,0.12);border:1px solid var(--mint);border-radius:12px;font-size:0.75rem;font-weight:600;color:var(--mint);margin-left:12px;';
    const topbarRight = document.querySelector('.topbar-right');
    if (topbarRight) topbarRight.prepend(badge);
  }
  const isMySQL = type === 'mysql';
  badge.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:${isMySQL ? '#2a9d8f' : '#e76f51'};display:inline-block;"></span> ${isMySQL ? 'MySQL Database' : 'SQLite Fallback'}`;
  badge.title = isMySQL ? 'Connected to MySQL server (students and all data stored in MySQL)' : 'Running on local SQLite database';
}

// ========================
// SECTION 4: NAVIGATION
// ========================
const pageMap = {
  overview:        { title:'Overview',          action:'Add Book',       modal:'addBookModal',    adminOnly:true  },
  catalogue:       { title:'Book Catalogue',    action:'Add Book',       modal:'addBookModal',    adminOnly:true  },
  loans:           { title:'Borrow & Returns',  action:'Issue Book',     modal:'issueBookModal',  adminOnly:true  },
  students:        { title:'Student Records',   action:'Add Student',    modal:'addStudentModal', adminOnly:true  },
  exchange:        { title:'Book Exchange',     action:'List Used Book', modal:'listBookModal',   adminOnly:false },
  recommendations: { title:'Book Recommendation', action:null,           modal:null,              adminOnly:false },
};

function navigate(page) {
  if (page === 'recommendations') {
    navigate('overview');
    setTimeout(() => {
      const recSection = document.getElementById('studentRecommendationsSection');
      if (recSection) recSection.scrollIntoView({ behavior: 'smooth' });
    }, 150);
    return;
  }
  if (page === 'students' && !isAdmin()) {
    showToast('Student records are restricted to administrators.', 'error');
    navigate('overview');
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); n.removeAttribute('aria-current'); });
  const pageEl = document.getElementById('page-' + page);
  const navEl  = document.getElementById('nav-' + page);
  if (!pageEl || !navEl) return;
  pageEl.classList.add('active');
  navEl.classList.add('active');
  navEl.setAttribute('aria-current','page');
  currentPage = page;
  const info = pageMap[page];
  document.getElementById('topbarTitle').textContent = info ? info.title : '';
  const actionBtn = document.getElementById('topbarActionBtn');
  if (actionBtn) {
    if (info && info.action) {
      if (page === 'exchange') {
        actionBtn.style.display = !isAdmin() ? '' : 'none';
      } else {
        actionBtn.style.display = isAdmin() ? '' : 'none';
      }
      const topLabel = document.getElementById('topbarActionLabel');
      if (topLabel) topLabel.textContent = info.action;
    } else {
      actionBtn.style.display = 'none';
    }
  }
  closeSidebar();
  window.scrollTo(0, 0);
  if (page === 'catalogue')       renderCatalogue();
  if (page === 'loans')           renderLoans();
  if (page === 'students')        renderStudents();
  if (page === 'exchange')        renderExchange();
  if (page === 'recommendations') renderRecommendations();
  if (page === 'overview')        renderOverview();
}

function handleTopbarAction() {
  const info = pageMap[currentPage];
  if (info && info.modal) openModal(info.modal);
}

// ========================
// SECTION 5: SIDEBAR
// ========================
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('active');
  document.body.style.overflow = '';
}

// ========================
// SECTION 6: MODALS
// ========================
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (id === 'issueBookModal')   populateIssueModal();
  if (id === 'directIssueModal') populateDirectIssueModal();
  if (id === 'listBookModal') {
    const sellerNameEl = document.getElementById('lb-seller-name');
    if (sellerNameEl && loggedInUser) {
      sellerNameEl.textContent = loggedInUser.name + ' (' + (loggedInUser.email || '') + ')';
    }
  }
  if (id === 'requestBookModal') populateAllStudents('rb-student');
}
function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id));
});
document.querySelectorAll('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov) closeModal(ov.id); });
});

// ========================
// SECTION 7: TOAST
// ========================
let toastTimer;
function showToast(msg, type) {
  type = type || 'info';
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show toast-' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ========================
// SECTION 8: OVERVIEW
// ========================
let currentStudentRecFilter = 'popular';

function renderStudentMyListingsOverview() {
  const container = document.getElementById('studentMyListingsSection');
  const listContainer = document.getElementById('studentMyListingsContainer');
  if (!container || !listContainer) return;
  if (!loggedInUser || loggedInUser.role !== 'student') {
    container.style.display = 'none';
    return;
  }
  const sid = loggedInUser.studentId;
  const myListings = exchangeData.filter(e => e.sellerId == sid || (loggedInUser.id && e.sellerId == loggedInUser.id));
  container.style.display = '';
  if (myListings.length === 0) {
    listContainer.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:0.88rem;">You have not listed any used books for exchange yet. <button class="btn btn-outline-mint btn-sm" onclick="openModal(\'listBookModal\')" style="margin-left:8px;">+ List a Book</button></div>';
    return;
  }
  listContainer.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:12px;">' +
    myListings.map(e => {
      const photoHtml = e.image ? '<img src="' + e.image + '" style="width:42px;height:56px;object-fit:cover;border-radius:4px;border:1px solid var(--border);flex-shrink:0;" alt="Cover"/>' : '';
      const reqCount = (e.requests && e.requests.length) ? e.requests.length : 0;
      const statusLabel = e.status === 'claimed' ? 'Collected' : (e.status === 'pending' ? 'Pending' : 'Available');
      return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px;display:flex;gap:12px;align-items:center;">' +
        photoHtml +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:600;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(e.title) + '</div>' +
          '<div style="font-size:0.75rem;color:var(--text-muted);">by ' + escapeHtml(e.author) + ' &bull; Rs ' + e.price + '</div>' +
          '<div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
            '<span class="exchange-status-badge ex-' + e.status + '" style="font-size:0.7rem;padding:2px 8px;">' + statusLabel + '</span>' +
            (reqCount > 0 ? '<span class="status-badge status-overdue" style="font-size:0.68rem;">' + reqCount + ' Req</span>' : '') +
            '<button class="link-btn" onclick="navigate(\'exchange\')" style="font-size:0.75rem;margin-left:auto;">Manage &rarr;</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('') +
  '</div>';
}

function renderOverview() {
  const adminGrid = document.getElementById('adminStatsGrid');
  const studentGrid = document.getElementById('studentStatsGrid');
  const searchSec = document.getElementById('studentOverviewSearchSection');
  const recSec = document.getElementById('studentRecommendationsSection');
  const myListingsSec = document.getElementById('studentMyListingsSection');

  if (isAdmin()) {
    if (adminGrid) { adminGrid.style.display = 'grid'; adminGrid.classList.remove('hidden'); }
    if (studentGrid) { studentGrid.style.display = 'none'; studentGrid.classList.add('hidden'); }
    if (searchSec) searchSec.style.display = 'none';
    if (recSec) recSec.style.display = 'none';
    if (myListingsSec) myListingsSec.style.display = 'none';

    // Requirement 1: Accurate admin dashboard statistics directly from database
    const totalCopies   = booksData.reduce((s,b) => s + (parseInt(b.copies) || 1), 0);
    const onLoan        = loansData.filter(l => !l.returned).length;
    const availCopies   = Math.max(0, totalCopies - onLoan);
    const overdue       = loansData.filter(l => !l.returned && calcFine(l) > 0).length;
    const pending       = exchangeData.reduce((s,e) => s + (e.requests ? e.requests.filter(r => r.status==='pending').length : 0), 0);
    const totalStudents = studentsData.length;

    const elTotal = document.getElementById('stat-totalBooks');
    const elAvail = document.getElementById('stat-availBooks');
    const elLoan = document.getElementById('stat-onLoan');
    const elOverdue = document.getElementById('stat-overdue');
    const elPending = document.getElementById('stat-pendingExchange');
    const elStudents = document.getElementById('stat-students');

    if (elTotal) elTotal.textContent = totalCopies;
    if (elAvail) elAvail.textContent = availCopies;
    if (elLoan) elLoan.textContent = onLoan;
    if (elOverdue) elOverdue.textContent = overdue;
    if (elPending) elPending.textContent = pending;
    if (elStudents) elStudents.textContent = totalStudents;

    if (IS_SERVER_ENV) {
      apiFetch('/api/stats').then(stats => {
        if (stats) {
          // db.get_dashboard_stats() returns camelCase keys
          if (elTotal && stats.totalBooks !== undefined) elTotal.textContent = stats.totalBooks;
          if (elAvail && stats.availBooks !== undefined) elAvail.textContent = stats.availBooks;
          if (elLoan && stats.onLoan !== undefined) elLoan.textContent = stats.onLoan;
          if (elOverdue && stats.overdue !== undefined) elOverdue.textContent = stats.overdue;
          if (elPending && stats.pendingExchange !== undefined) elPending.textContent = stats.pendingExchange;
          if (elStudents && stats.students !== undefined) elStudents.textContent = stats.students;
        }
      }).catch(() => {});
    }
  } else {
    if (adminGrid) { adminGrid.style.display = 'none'; adminGrid.classList.add('hidden'); }
    if (studentGrid) { studentGrid.style.display = 'grid'; studentGrid.classList.remove('hidden'); }
    if (searchSec) searchSec.style.display = '';
    if (recSec) recSec.style.display = '';
    if (myListingsSec) myListingsSec.style.display = '';

    // Requirement 13 & 2: Accurate student overview dashboard stats (4 cards ONLY)
    const sid = loggedInUser ? loggedInUser.studentId : null;
    const totalLibraryBooks = booksData.reduce((s,b) => s + (b.copies || 1), 0);
    const myLoans = loansData.filter(l => (l.studentId === sid || l.student_id === sid) && !l.returned);
    const pendingDues = myLoans.reduce((sum, l) => sum + calcFine(l), 0);
    const borrowedCount = myLoans.length;
    const pendingRequestsCount = issueRequests.filter(r => (r.studentId === sid || r.student_id === sid) && r.status === 'pending').length;

    const elStuTotal    = document.getElementById('stat-student-totalBooks') || document.getElementById('stat-stu-totalBooks');
    const elStuDues     = document.getElementById('stat-student-pendingDues') || document.getElementById('stat-stu-pendingDues');
    const elStuBorrowed = document.getElementById('stat-student-borrowed') || document.getElementById('stat-stu-borrowed');
    const elStuReqs     = document.getElementById('stat-student-pendingRequests') || document.getElementById('stat-stu-pendingReqs');

    if (elStuTotal) elStuTotal.textContent = totalLibraryBooks;
    if (elStuDues) elStuDues.textContent = 'Rs ' + pendingDues;
    if (elStuBorrowed) elStuBorrowed.textContent = borrowedCount;
    if (elStuReqs) elStuReqs.textContent = pendingRequestsCount;

    // Render student's own listed books on overview
    renderStudentMyListingsOverview();

    // Render recommendations on student overview page (Requirement 11)
    renderStudentOverviewRecommendations();
  }

  const pendingExchanges = exchangeData.reduce((s,e) => s + (e.requests ? e.requests.filter(r => r.status==='pending').length : 0), 0);
  const badge = document.getElementById('exchangeBadge');
  if (badge) badge.textContent = pendingExchanges;

  const pendingIssues = issueRequests.filter(r => r.status === 'pending').length;
  const issueBadge = document.getElementById('issueRequestsBadge');
  if (issueBadge) {
    issueBadge.textContent = pendingIssues;
    issueBadge.style.display = pendingIssues > 0 ? '' : 'none';
  }

  // Pending issue requests panel (admin only)
  const issueReqPanel = document.getElementById('pendingIssuePanel');
  if (issueReqPanel) {
    if (isAdmin()) {
      issueReqPanel.style.display = '';
      renderPendingIssueRequests();
    } else {
      issueReqPanel.style.display = 'none';
    }
  }

  // Admin Upcoming Due Dates and Recent Activity
  const ovUpcoming = document.getElementById('overviewUpcomingCard');
  const ovActivity = document.getElementById('overviewActivityCard');
  const ovGrid = document.getElementById('overviewGridContainer');

  if (!isAdmin()) {
    if (ovUpcoming) ovUpcoming.style.display = 'none';
    if (ovActivity) ovActivity.style.display = 'none';
    if (ovGrid) ovGrid.style.display = 'none';
  } else {
    if (ovUpcoming) ovUpcoming.style.display = '';
    if (ovActivity) ovActivity.style.display = '';
    if (ovGrid) ovGrid.style.display = '';

    const upcoming = loansData.filter(l => !l.returned).sort((a,b) => new Date(a.due)-new Date(b.due)).slice(0,5);
    const dueEl = document.getElementById('upcomingDueDates');
    if (dueEl) {
      if (upcoming.length === 0) {
        dueEl.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;padding:16px 0;">No upcoming due dates.</p>';
      } else {
        dueEl.innerHTML = upcoming.map(l => {
          const st = getStudent(l.studentId);
          const bk = getBook(l.bookId);
          if (!st || !bk) return '';
          const diff = Math.floor((new Date(l.due+' 00:00:00') - new Date()) / 86400000);
          const cls  = diff < 0 ? 'due-over' : diff <= 2 ? 'due-soon' : 'due-ok';
          const lbl  = diff < 0 ? Math.abs(diff)+'d overdue' : diff === 0 ? 'Due today' : diff+'d left';
          return '<div class="due-item"><div class="due-avatar">'+initials(st.name)+'</div><div class="due-info"><div class="due-name">'+st.name+'</div><div class="due-book">'+bk.title+'</div></div><span class="due-date '+cls+'">'+lbl+'</span></div>';
        }).join('');
      }
    }

    const actEl = document.getElementById('activityList');
    if (actEl) {
      actEl.innerHTML = activityLog.map(a =>
        '<li class="activity-item"><span class="activity-dot dot-'+a.type+'"></span><span class="activity-text">'+a.text+'</span><span class="activity-time">'+a.time+'</span></li>'
      ).join('');
    }
  }
}

// ========================
// SECTION 8b: STUDENT OVERVIEW LIVE SEARCH & RECOMMENDATIONS
// ========================
function handleOverviewBookSearch(event) {
  const input = document.getElementById('overviewBookSearch') || document.getElementById('studentOverviewSearchInput');
  const resultsContainer = document.getElementById('overviewSearchResults') || document.getElementById('studentOverviewSearchResults');
  const clearBtn = document.getElementById('clearOverviewSearch');
  if (!input || !resultsContainer) return;

  const query = (input.value || '').trim();
  if (clearBtn) clearBtn.style.display = query.length > 0 ? 'block' : 'none';

  if (!query) {
    resultsContainer.innerHTML = '';
    resultsContainer.style.display = 'none';
    return;
  }

  const qLower = query.toLowerCase();
  const matches = booksData.filter(b =>
    (b.title || '').toLowerCase().includes(qLower) ||
    (b.author || '').toLowerCase().includes(qLower) ||
    (b.subject || '').toLowerCase().includes(qLower) ||
    (b.isbn && b.isbn.toLowerCase().includes(qLower))
  ).slice(0, 8);

  if (matches.length === 0) {
    resultsContainer.innerHTML = '<div class="overview-search-no-results" style="padding:18px 16px;text-align:center;color:var(--text-muted);font-size:0.88rem;">No matching books found for "<strong>' + escapeHtml(query) + '</strong>"</div>';
    resultsContainer.style.display = 'block';
    return;
  }

  const sid = loggedInUser ? loggedInUser.studentId : null;
  resultsContainer.innerHTML = matches.map(b => {
    const av = availableCopies(b);
    const sc = subjectClass(b.subject);
    const pendingReq = sid ? issueRequests.find(r => r.bookId === b.id && r.studentId === sid && r.status === 'pending') : null;
    const borrowed = sid && loansData.some(l => l.bookId === b.id && l.studentId === sid && !l.returned);

    let actionBtn = '';
    if (borrowed) {
      actionBtn = '<span class="status-badge status-returned" style="font-size:0.75rem;">Borrowed</span>';
    } else if (pendingReq) {
      actionBtn = '<div style="display:flex;gap:4px;align-items:center;">' +
        '<span class="status-badge status-overdue" style="font-size:0.72rem;">&#9203; Requested</span>' +
        '<button class="btn btn-outline-danger btn-sm" style="padding:2px 8px;font-size:0.72rem;" onclick="cancelStudentIssueRequest(' + pendingReq.id + ',' + b.id + '); clearOverviewBookSearch();">&#10005; Cancel</button>' +
      '</div>';
    } else if (av === 0) {
      actionBtn = '<span class="avail-badge avail-no" style="font-size:0.72rem;">Out of Stock</span>';
    } else {
      actionBtn = '<button class="btn btn-primary btn-sm" style="padding:4px 10px;font-size:0.78rem;" onclick="studentRequestIssue(' + b.id + '); clearOverviewBookSearch();">Request</button>';
    }

    return '<div class="overview-search-item" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);gap:12px;">' +
      '<div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">' +
        (b.image ? '<img src="' + b.image + '" style="width:36px;height:48px;object-fit:cover;border-radius:4px;border:1px solid var(--border);" alt="Cover" onerror="this.onerror=null;this.style.display=\'none\';">' : '<div class="spine-' + sc + '" style="width:6px;height:44px;border-radius:3px;flex-shrink:0;"></div>') +
        '<div style="min-width:0;flex:1;">' +
          '<div style="font-weight:600;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(b.title) + '</div>' +
          '<div style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">by ' + escapeHtml(b.author) + ' &bull; <span class="book-subject-tag subject-' + sc + '" style="font-size:0.65rem;padding:1px 6px;">' + escapeHtml(b.subject) + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">' +
        '<button class="btn btn-ghost btn-sm" style="padding:4px 8px;font-size:0.75rem;" onclick="openBookDetail(' + b.id + '); clearOverviewBookSearch();">Details</button>' +
        actionBtn +
      '</div>' +
    '</div>';
  }).join('');
  resultsContainer.style.display = 'block';
}

function clearOverviewBookSearch() {
  const input = document.getElementById('overviewBookSearch') || document.getElementById('studentOverviewSearchInput');
  const results = document.getElementById('overviewSearchResults') || document.getElementById('studentOverviewSearchResults');
  const clearBtn = document.getElementById('clearOverviewSearch');
  if (input) input.value = '';
  if (clearBtn) clearBtn.style.display = 'none';
  if (results) {
    results.innerHTML = '';
    results.style.display = 'none';
  }
}

// Close overview search dropdown when clicking outside
document.addEventListener('click', function(e) {
  const searchSec = document.getElementById('studentOverviewSearchSection');
  const results = document.getElementById('overviewSearchResults');
  if (searchSec && results && results.style.display !== 'none' && !searchSec.contains(e.target)) {
    results.style.display = 'none';
  }
});

function filterStudentRec(tag, btn) {
  currentStudentRecFilter = tag;
  const container = document.getElementById('studentRecTabs');
  if (container) {
    container.querySelectorAll('.rec-tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
  }
  renderStudentOverviewRecommendations();
}

function getComputedRecommendations() {
  const borrowCounts = {};
  loansData.forEach(l => {
    const bid = l.bookId || l.book_id;
    if (bid) borrowCounts[bid] = (borrowCounts[bid] || 0) + 1;
  });

  const popular = booksData.map(b => ({
    id: b.id,
    title: b.title,
    author: b.author,
    subject: b.subject,
    isbn: b.isbn || '',
    copies: b.copies || 1,
    image: b.image || null,
    tag: 'popular',
    tagLabel: 'Popular This Month',
    checkouts: borrowCounts[b.id] || 0
  })).sort((a,b) => b.checkouts - a.checkouts || b.id - a.id);

  const recentlyAdded = [...booksData].sort((a,b) => b.id - a.id).map(b => ({
    id: b.id,
    title: b.title,
    author: b.author,
    subject: b.subject,
    isbn: b.isbn || '',
    copies: b.copies || 1,
    image: b.image || null,
    tag: 'new',
    tagLabel: 'Recently Added',
    checkouts: borrowCounts[b.id] || 0
  }));

  return { popular, new: recentlyAdded };
}

function renderStudentOverviewRecommendations() {
  const grid = document.getElementById('studentRecGrid');
  if (!grid) return;
  const computed = getComputedRecommendations();
  const list = (currentStudentRecFilter === 'new' ? computed.new : computed.popular).slice(0, 8);

  if (list.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--text-muted);font-size:0.9rem;">No book recommendations available yet.</div>';
    return;
  }

  const tagCls = currentStudentRecFilter === 'popular' ? 'tag-popular' : 'tag-new';
  grid.innerHTML = list.map((r, i) => {
    const matchedBook = booksData.find(b => b.id === r.id);
    const sid = loggedInUser ? loggedInUser.studentId : null;
    let actionBtn = '';
    if (matchedBook) {
      const av = availableCopies(matchedBook);
      const pendingReq = sid ? issueRequests.find(req => req.bookId === matchedBook.id && req.studentId === sid && req.status === 'pending') : null;
      const isBorrowed = sid && loansData.some(l => l.bookId === matchedBook.id && l.studentId === sid && !l.returned);
      if (isBorrowed) {
        actionBtn = '<span class="status-badge status-returned" style="font-size:0.75rem;">Borrowed</span>';
      } else if (pendingReq) {
        actionBtn = '<div style="display:flex;gap:4px;align-items:center;">' +
          '<span class="status-badge status-overdue" style="font-size:0.72rem;">&#9203; Requested</span>' +
          '<button class="btn btn-outline-danger btn-sm" style="padding:2px 8px;font-size:0.72rem;" onclick="cancelStudentIssueRequest(' + pendingReq.id + ',' + matchedBook.id + ')">&#10005; Cancel</button>' +
        '</div>';
      } else {
        actionBtn = '<button class="btn btn-outline-mint btn-sm" onclick="studentRequestIssue(' + matchedBook.id + ')"' + (av===0 ? ' disabled' : '') + '>' + (av===0 ? 'No Copies' : 'Borrow') + '</button>';
      }
    } else {
      actionBtn = '<button class="btn btn-ghost btn-sm" onclick="navigate(\'catalogue\')">Browse Library</button>';
    }

    const coverHtml = r.image
      ? '<img src="' + r.image + '" style="width:48px;height:64px;object-fit:cover;border-radius:4px;border:1px solid var(--border);box-shadow:var(--shadow-sm);margin-bottom:8px;" alt="Cover" onerror="this.onerror=null;this.style.display=\'none\';">'
      : '';

    return '<div class="rec-card">' +
      '<div class="rec-rank">' + (i+1) + '</div>' +
      '<div class="rec-body">' +
        coverHtml +
        '<span class="rec-tag ' + tagCls + '">' + r.tagLabel + '</span>' +
        '<div class="rec-title">' + escapeHtml(r.title) + '</div>' +
        '<div class="rec-author">by ' + escapeHtml(r.author) + '</div>' +
        '<div class="rec-subject">' + escapeHtml(r.subject) + '</div>' +
        '<div class="rec-stats">' +
          '<span class="rec-stat">&#128214; <strong>' + r.checkouts + '</strong> borrow' + (r.checkouts === 1 ? '' : 's') + '</span>' +
        '</div>' +
        '<div style="margin-top:12px;display:flex;justify-content:flex-end;">' + actionBtn + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ========================
// SECTION 8c: PENDING REQUESTS (Admin on Overview)
// ========================
function renderPendingIssueRequests() {
  const container = document.getElementById('pendingIssueList');
  if (!container) return;

  const pendingIssues = issueRequests.filter(r => r.status === 'pending');

  const pendingExchanges = [];
  exchangeData.forEach(e => {
    if (e.requests && e.requests.length > 0) {
      e.requests.forEach((r, idx) => {
        if (r.status === 'pending') {
          pendingExchanges.push({ ...r, exchangeItem: e, reqIndex: idx });
        }
      });
    }
  });

  if (pendingIssues.length === 0 && pendingExchanges.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;padding:16px 0;">No pending requests from students at this time.</p>';
    return;
  }

  let html = '';

  if (pendingIssues.length > 0) {
    html += '<div style="font-size:0.75rem;font-weight:700;color:var(--text-sub);letter-spacing:0.04em;text-transform:uppercase;margin:4px 0 10px;">Library Book Requests (' + pendingIssues.length + ')</div>';
    html += pendingIssues.map(r => {
      const sid = r.studentId || r.student_id;
      const bid = r.bookId || r.book_id;
      const st = getStudent(sid);
      const bk = getBook(bid);
      const stuName = st ? st.name : ('Student #' + sid);
      const stuIdStr = st ? st.studentId : ('ID: ' + sid);
      const bkTitle = bk ? bk.title : ('Book #' + bid);
      return '<div class="due-item" style="margin-bottom:10px;padding:12px;background:var(--warning-bg);border-radius:var(--radius-sm);border:1px solid #f0d8a8;display:flex;align-items:center;justify-content:space-between;gap:12px;">' +
        '<div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">' +
          '<div class="due-avatar" style="background:var(--warning);color:#fff;">' + initials(stuName) + '</div>' +
          '<div class="due-info" style="flex:1;min-width:0;">' +
            '<div class="due-name">' + escapeHtml(stuName) + ' <span style="color:var(--text-muted);font-size:.75rem;">(' + escapeHtml(stuIdStr) + ')</span></div>' +
            '<div class="due-book">Requested: <strong><em>' + escapeHtml(bkTitle) + '</em></strong></div>' +
            '<div style="font-size:.75rem;color:var(--text-muted);">Requested on ' + formatDate(r.requestedAt || r.requested_at) + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">' +
          '<button class="btn btn-mint btn-sm" onclick="markIssueCollected(' + r.id + ')">&#10003; Approve &amp; Issue</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="rejectIssueRequest(' + r.id + ')">Reject</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  if (pendingExchanges.length > 0) {
    html += '<div style="font-size:0.75rem;font-weight:700;color:var(--text-sub);letter-spacing:0.04em;text-transform:uppercase;margin:14px 0 10px;">Book Exchange Requests (' + pendingExchanges.length + ')</div>';
    html += pendingExchanges.map(px => {
      const rs = getStudent(px.studentId);
      const seller = getStudent(px.exchangeItem.sellerId);
      const requesterName = rs ? rs.name : ('Student #' + px.studentId);
      const sellerName = seller ? seller.name : ('Seller #' + px.exchangeItem.sellerId);
      return '<div class="due-item" style="margin-bottom:10px;padding:12px;background:rgba(95,158,160,0.06);border-radius:var(--radius-sm);border:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:600;font-size:0.88rem;">' + escapeHtml(requesterName) + ' requested <em>&ldquo;' + escapeHtml(px.exchangeItem.title) + '&rdquo;</em></div>' +
          '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">Listed by <strong>' + escapeHtml(sellerName) + '</strong> &bull; Price: Rs ' + px.exchangeItem.price + (px.message ? ' &bull; &ldquo;' + escapeHtml(px.message) + '&rdquo;' : '') + '</div>' +
        '</div>' +
        '<div style="flex-shrink:0;">' +
          '<span class="status-badge status-overdue" style="font-size:0.72rem;">Pending Seller</span>' +
          '<button class="btn btn-ghost btn-sm" onclick="navigate(\'exchange\')" style="margin-left:6px;font-size:0.75rem;">View</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  container.innerHTML = html;
}

async function markIssueCollected(reqId) {
  const req = issueRequests.find(r => r.id === reqId);
  if (!req || req.status !== 'pending') return;
  
  if (IS_SERVER_ENV) {
    try {
      await apiFetch('/api/issue-requests/' + reqId + '/collected', { method: 'POST' });
    } catch (e) {
      console.warn('API error in mark collected:', e);
    }
  }

  req.status = 'collected';
  const st = getStudent(req.studentId);
  const bk = getBook(req.bookId);
  const today  = new Date().toISOString().split('T')[0];
  const dueD   = new Date(); dueD.setDate(dueD.getDate() + 14);
  const dueStr = dueD.toISOString().split('T')[0];
  loansData.push({ id: Date.now(), studentId: req.studentId, bookId: req.bookId, issued: today, due: dueStr, returned: null });
  activityLog.unshift({ type:'issue', text:'Book collected by <strong>' + (st?st.name:'Student') + '</strong>: <em>' + (bk?bk.title:'Book') + '</em>', time:'Just now' });
  showToast((bk?bk.title:'Book') + ' marked as collected by ' + (st?st.name:'Student') + '!', 'success');
  saveData();
  renderOverview(); renderCatalogue(); renderLoans();
}

async function rejectIssueRequest(reqId) {
  const req = issueRequests.find(r => r.id === reqId);
  if (!req || req.status !== 'pending') return;

  if (IS_SERVER_ENV) {
    try {
      await apiFetch('/api/issue-requests/' + reqId + '/reject', { method: 'POST' });
    } catch (e) {
      console.warn('API error in reject:', e);
    }
  }

  req.status = 'rejected';
  const st = getStudent(req.studentId);
  const bk = getBook(req.bookId);
  activityLog.unshift({ type:'overdue', text:'Issue request rejected for <strong>' + (st?st.name:'Student') + '</strong>: <em>' + (bk?bk.title:'Book') + '</em>', time:'Just now' });
  showToast('Request from ' + (st?st.name:'Student') + ' rejected.', 'info');
  saveData();
  renderOverview(); renderCatalogue();
}

// ========================
// SECTION 9: CATALOGUE
// ========================
function renderCatalogue() {
  const q       = (document.getElementById('bookSearch')?.value||'').toLowerCase();
  const avail   = document.getElementById('availFilter')?.value||'all';
  const subject = document.getElementById('subjectFilter')?.value||'all';
  const sf = document.getElementById('subjectFilter');
  if (sf && sf.options.length <= 1) {
    [...new Set(booksData.map(b=>b.subject))].sort().forEach(s => {
      const o=document.createElement('option'); o.value=s; o.textContent=s; sf.appendChild(o);
    });
  }
  const filtered = booksData.filter(b => {
    const text=(b.title+' '+b.author+' '+b.subject).toLowerCase();
    if (q && !text.includes(q)) return false;
    const av=availableCopies(b);
    if (avail==='available' && av===0) return false;
    if (avail==='unavailable' && av>0) return false;
    if (subject!=='all' && b.subject!==subject) return false;
    return true;
  });
  const grid  = document.getElementById('booksGrid');
  const empty = document.getElementById('catalogueEmpty');
  if (filtered.length===0) { grid.innerHTML=''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  grid.innerHTML = filtered.map(b => {
    const av = availableCopies(b);
    const sc = subjectClass(b.subject);
    let actionBtn = '';
    if (isAdmin()) {
      actionBtn = '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
        '<button class="btn btn-primary btn-sm" onclick="quickIssue('+b.id+')"' + (av===0?' disabled title="No copies available"':'') + '>Issue</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="openEditBookModal('+b.id+')" title="Edit book details">&#9998; Edit</button>' +
        '<button class="btn btn-outline-danger btn-sm" onclick="confirmDeleteBook('+b.id+')" title="Delete book">&#128465; Delete</button>' +
      '</div>';
    } else {
      const sid = loggedInUser ? loggedInUser.studentId : null;
      const myPendingReq    = sid ? issueRequests.find(r => r.bookId===b.id && r.studentId===sid && r.status==='pending') : null;
      const alreadyBorrowed = sid && loansData.some(l => l.bookId===b.id && l.studentId===sid && !l.returned);
      if (alreadyBorrowed) {
        actionBtn = '<button class="btn btn-ghost btn-sm" disabled>Borrowed</button>';
      } else if (myPendingReq) {
        actionBtn = '<div style="display:flex;gap:4px;align-items:center;">' +
          '<span class="status-badge status-overdue" style="font-size:0.75rem;">&#9203; Requested</span>' +
          '<button class="btn btn-outline-danger btn-sm" style="padding:4px 8px;font-size:0.75rem;" onclick="cancelStudentIssueRequest(' + myPendingReq.id + ',' + b.id + ')">&#10005; Cancel</button>' +
        '</div>';
      } else {
        actionBtn = '<button class="btn btn-primary btn-sm" onclick="studentRequestIssue('+b.id+')"' + (av===0?' disabled title="No copies available"':'') + '>Request Book</button>';
      }
    }
    const photoHtml = b.image 
      ? '<img src="' + b.image + '" style="width:58px;height:78px;object-fit:cover;border-radius:6px;border:1px solid var(--border);flex-shrink:0;box-shadow:var(--shadow-sm);" alt="Cover" onerror="this.onerror=null;this.style.display=\'none\';">'
      : '';

    return '<div class="book-card">' +
      '<div class="book-spine spine-' + sc + '"></div>' +
      '<div class="book-body">' +
        '<div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:8px;">' +
          photoHtml +
          '<div style="flex:1;min-width:0;">' +
            '<span class="book-subject-tag subject-' + sc + '">' + b.subject + '</span>' +
            '<div class="book-title">' + b.title + '</div>' +
            '<div class="book-author">' + b.author + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="book-meta" style="margin-top:auto;">' +
          '<span class="book-copies"><strong>' + av + '</strong> / ' + b.copies + ' copies free</span>' +
          '<span class="avail-badge ' + (av>0?'avail-yes':'avail-no') + '">' + (av>0?'Available':'All Borrowed') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="book-actions">' +
        '<button class="btn btn-ghost btn-sm" onclick="openBookDetail(' + b.id + ')">View Details</button>' +
        actionBtn +
      '</div></div>';
  }).join('');
}

async function cancelStudentIssueRequest(reqId, bookId) {
  if (!confirm('Are you sure you want to cancel this book request?')) return;
  if (IS_SERVER_ENV && reqId) {
    try {
      await apiFetch('/api/issue-requests/' + reqId + '/cancel', { method: 'POST' });
    } catch (e) {
      console.warn('API error in cancel request:', e);
    }
  }
  const idx = issueRequests.findIndex(r => r.id === reqId || (r.bookId === bookId && r.status === 'pending'));
  if (idx !== -1) {
    issueRequests.splice(idx, 1);
  }
  const bk = getBook(bookId);
  showToast('Book request for "' + (bk ? bk.title : 'Book') + '" has been cancelled.', 'info');
  saveData();
  renderCatalogue();
  renderOverview();
  renderLoans();
  const detailModal = document.getElementById('bookDetailModal');
  if (detailModal && detailModal.classList.contains('open')) {
    openBookDetail(bookId);
  }
}

async function studentRequestIssue(bookId) {
  if (!loggedInUser || loggedInUser.role !== 'student') { showToast('Please log in as a student.', 'error'); return; }
  const book = getBook(bookId);
  if (!book) return;
  if (availableCopies(book) === 0) { showToast('No copies available for this book.', 'error'); return; }
  const sid = loggedInUser.studentId;
  if (!sid) { showToast('Your account is not linked to a student profile. Please contact admin.', 'error'); return; }
  if (issueRequests.some(r => r.bookId===bookId && r.studentId===sid && r.status==='pending')) {
    showToast('You already have a pending request for this book.', 'info'); return;
  }

  let reqId = Date.now();
  if (IS_SERVER_ENV) {
    try {
      const res = await apiFetch('/api/issue-requests', {
        method: 'POST',
        body: JSON.stringify({ studentId: sid, bookId })
      });
      if (res && res.id) reqId = res.id;
    } catch (e) {
      showToast(e.message || 'Error sending request to database.', 'error');
      return;
    }
  }

  issueRequests.push({ id: reqId, studentId: sid, bookId, requestedAt: new Date().toISOString().split('T')[0], status: 'pending' });
  const st = getStudent(sid);
  activityLog.unshift({ type:'issue', text:'<strong>' + (st?st.name:loggedInUser.name) + '</strong> requested: <em>' + book.title + '</em>', time:'Just now' });
  saveData();
  showToast('Book request sent! Admin will review and approve.', 'success');
  renderCatalogue(); renderOverview();
}

function openBookDetail(bookId) {
  selectedBookIdForDetail = bookId;
  const b = getBook(bookId); if (!b) return;
  const av = availableCopies(b);
  const sc = subjectClass(b.subject);
  document.getElementById('bookDetailTitle').textContent = 'Book Details';
  document.getElementById('bookDetailContent').innerHTML =
    '<div class="book-detail-header">' +
      '<div style="display:flex;gap:16px;align-items:flex-start;">' +
        (b.image ? '<img src="' + b.image + '" style="width:72px;height:96px;object-fit:cover;border-radius:6px;border:1px solid var(--border);box-shadow:var(--shadow-sm);flex-shrink:0;" alt="Cover">' : '<div class="book-spine spine-' + sc + '" style="width:6px;border-radius:4px;align-self:stretch;min-height:60px;flex-shrink:0;"></div>') +
        '<div><div class="book-detail-title">' + b.title + '</div>' +
        '<div class="book-detail-author">by ' + b.author + '</div>' +
        '<span class="book-subject-tag subject-' + sc + '">' + b.subject + '</span></div>' +
      '</div>' +
    '</div>' +
    '<div class="book-detail-body">' +
      '<div class="detail-row">' +
        '<div class="detail-field"><div class="detail-field-label">ISBN</div><div class="detail-field-value">' + (b.isbn||'-') + '</div></div>' +
        '<div class="detail-field"><div class="detail-field-label">Year</div><div class="detail-field-value">' + (b.year||'-') + '</div></div>' +
        '<div class="detail-field"><div class="detail-field-label">Total Copies</div><div class="detail-field-value">' + b.copies + '</div></div>' +
        '<div class="detail-field"><div class="detail-field-label">Available</div><div class="detail-field-value" style="color:' + (av>0?'var(--success)':'var(--danger)') + '">' + av + '</div></div>' +
      '</div>' +
      (b.description ? '<div class="book-description">' + b.description + '</div>' : '') +
    '</div>';

  const btn = document.getElementById('bookDetailIssueBtn');
  btn.className = 'btn btn-primary';
  if (isAdmin()) {
    btn.style.display = '';
    btn.disabled = av===0;
    btn.title = av===0 ? 'No copies available' : '';
    btn.textContent = 'Issue This Book';
    btn.onclick = quickIssueFromDetail;
  } else {
    const sid = loggedInUser ? loggedInUser.studentId : null;
    const myPendingReq    = sid ? issueRequests.find(r => r.bookId===bookId && r.studentId===sid && r.status==='pending') : null;
    const alreadyBorrowed = sid && loansData.some(l => l.bookId===bookId && l.studentId===sid && !l.returned);
    btn.style.display = '';
    if (alreadyBorrowed) {
      btn.disabled = true; btn.textContent = 'Already Borrowed';
    } else if (myPendingReq) {
      btn.disabled = false;
      btn.className = 'btn btn-outline-danger';
      btn.innerHTML = '&#10005; Cancel Request';
      btn.onclick = () => { closeModal('bookDetailModal'); cancelStudentIssueRequest(myPendingReq.id, bookId); };
    } else {
      btn.disabled = av===0;
      btn.textContent = av===0 ? 'No Copies Available' : 'Request This Book';
      btn.onclick = () => { closeModal('bookDetailModal'); studentRequestIssue(bookId); };
    }
  }
  openModal('bookDetailModal');
}

function applySelectedBookToModal(bookId) {
  const b = getBook(bookId);
  if (!b) return;
  const av = availableCopies(b);

  const idInput = document.getElementById('ib-selected-book-id');
  if (idInput) idInput.value = b.id;

  const card = document.getElementById('ib-selected-book-card');
  const bookSelectGroup = document.getElementById('ib-book-select-group');
  if (card) {
    card.style.display = 'flex';
    const titleEl = document.getElementById('ib-book-title');
    const metaEl  = document.getElementById('ib-book-meta');
    const coverEl = document.getElementById('ib-book-cover');
    if (titleEl) titleEl.textContent = b.title;
    if (metaEl)  metaEl.textContent = 'by ' + b.author + ' · ' + b.subject + ' · ' + av + ' available';
    if (coverEl) {
      if (b.image) {
        coverEl.innerHTML = '<img src="' + b.image + '" style="width:100%;height:100%;object-fit:cover;" alt="Cover" />';
      } else {
        const sc = subjectClass(b.subject);
        coverEl.innerHTML = '<div class="book-spine spine-' + sc + '" style="width:100%;height:100%;min-height:48px;"></div>';
      }
    }
  }
  if (bookSelectGroup) {
    bookSelectGroup.style.display = 'none';
  }
}

function showBookSelectorInModal() {
  const idInput = document.getElementById('ib-selected-book-id');
  if (idInput) idInput.value = '';
  const card = document.getElementById('ib-selected-book-card');
  if (card) card.style.display = 'none';
  const bookSelectGroup = document.getElementById('ib-book-select-group');
  if (bookSelectGroup) bookSelectGroup.style.display = '';
  const bsel = document.getElementById('ib-book');
  if (bsel) {
    bsel.value = '';
    bsel.focus();
  }
}

function handleModalBookSelect(bookId) {
  if (!bookId) return;
  applySelectedBookToModal(parseInt(bookId));
  const stuSel = document.getElementById('ib-student');
  if (stuSel) stuSel.focus();
}

function quickIssue(bookId) {
  if (!isAdmin()) { showToast('Only admin can directly issue books.', 'error'); return; }
  selectedBookIdForDetail = bookId;
  const b = getBook(bookId);
  if (!b) return;
  if (availableCopies(b) === 0) {
    showToast('No copies available for "' + b.title + '".', 'error');
    return;
  }
  populateIssueModal();
  applySelectedBookToModal(bookId);
  openModal('issueBookModal');
  const stuSel = document.getElementById('ib-student');
  if (stuSel) setTimeout(() => stuSel.focus(), 80);
}

function quickIssueFromDetail() {
  closeModal('bookDetailModal');
  quickIssue(selectedBookIdForDetail);
}

function openEditBookModal(bookId) {
  if (!isAdmin()) return;
  const b = getBook(bookId);
  if (!b) return;

  document.getElementById('eb-id').value = b.id;
  document.getElementById('eb-title').value = b.title || '';
  document.getElementById('eb-author').value = b.author || '';
  document.getElementById('eb-subject').value = b.subject || '';
  document.getElementById('eb-isbn').value = b.isbn || '';
  document.getElementById('eb-copies').value = b.copies || 1;
  document.getElementById('eb-year').value = b.year || '';
  document.getElementById('eb-description').value = b.description || '';

  const photoInput = document.getElementById('eb-photo');
  if (photoInput) photoInput.value = '';
  selectedPhotos['eb'] = null;

  const previewWrap = document.getElementById('eb-photo-preview');
  const previewImg = document.getElementById('eb-preview-img');
  if (b.image) {
    if (previewImg) previewImg.src = b.image;
    if (previewWrap) previewWrap.style.display = 'block';
  } else {
    if (previewImg) previewImg.src = '';
    if (previewWrap) previewWrap.style.display = 'none';
  }

  openModal('editBookModal');
}

async function submitEditBook(e) {
  e.preventDefault();
  if (!isAdmin()) { showToast('Only admin can edit books.', 'error'); return; }
  const id = parseInt(document.getElementById('eb-id').value);
  const title = document.getElementById('eb-title').value.trim();
  const author = document.getElementById('eb-author').value.trim();
  const subject = document.getElementById('eb-subject').value.trim();
  const isbn = document.getElementById('eb-isbn').value.trim();
  const copies = parseInt(document.getElementById('eb-copies').value);
  const year = parseInt(document.getElementById('eb-year').value) || null;
  const desc = document.getElementById('eb-description').value.trim();

  if (!title || !author || !subject || isNaN(copies) || copies < 1) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  const payload = {
    title,
    author,
    subject,
    isbn,
    copies,
    year,
    description: desc
  };

  if (selectedPhotos['eb'] !== null && selectedPhotos['eb'] !== undefined) {
    payload.image = selectedPhotos['eb'];
  }

  let updatedBook = null;
  if (IS_SERVER_ENV) {
    try {
      const res = await apiFetch('/api/books/' + id, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res && res.book) {
        updatedBook = res.book;
      }
    } catch (err) {
      showToast(err.message || 'Could not update book.', 'error');
      return;
    }
  }

  const idx = booksData.findIndex(b => b.id === id);
  if (idx !== -1) {
    if (updatedBook) {
      booksData[idx] = updatedBook;
    } else {
      booksData[idx] = {
        ...booksData[idx],
        title,
        author,
        subject,
        isbn,
        copies,
        year,
        description: desc,
        ...(payload.image !== undefined ? { image: payload.image } : {})
      };
    }
  }

  activityLog.unshift({ type: 'catalogue', text: 'Book details updated: <em>' + title + '</em>', time: 'Just now' });
  closeModal('editBookModal');
  showToast('Book "' + title + '" updated successfully!', 'success');
  saveData();
  renderCatalogue();
  renderOverview();
  const sf = document.getElementById('subjectFilter');
  while (sf && sf.options.length > 1) sf.remove(1);
}

async function confirmDeleteBook(bookId) {
  if (!isAdmin()) { showToast('Only admin can delete books.', 'error'); return; }
  const b = getBook(bookId);
  if (!b) return;

  if (!confirm('Are you sure you want to delete "' + b.title + '" from the catalogue?')) {
    return;
  }

  if (IS_SERVER_ENV) {
    try {
      const res = await apiFetch('/api/books/' + bookId, { method: 'DELETE' });
      if (res && res.message) {
        showToast(res.message, 'success');
      } else {
        showToast('Book "' + b.title + '" deleted successfully.', 'success');
      }
    } catch (err) {
      showToast(err.message || 'Cannot delete book.', 'error');
      return;
    }
  } else {
    const activeLoans = loansData.filter(l => l.bookId === bookId && !l.returned);
    if (activeLoans.length > 0) {
      showToast('Cannot delete book: Currently on loan to ' + activeLoans.length + ' student(s).', 'error');
      return;
    }
    showToast('Book "' + b.title + '" deleted successfully.', 'success');
  }

  const idx = booksData.findIndex(bk => bk.id === bookId);
  if (idx !== -1) booksData.splice(idx, 1);

  activityLog.unshift({ type: 'catalogue', text: 'Book deleted: <em>' + b.title + '</em>', time: 'Just now' });
  saveData();
  renderCatalogue();
  renderOverview();
  closeModal('bookDetailModal');
}

// ========================
// SECTION 10: LOANS
// ========================
function renderLoans() {
  const filter = currentLoanFilter;
  const reqPanel = document.getElementById('loansIssueRequestsPanel');

  // Render pending requests panel
  if (reqPanel) {
    if (isAdmin()) {
      reqPanel.style.display = '';
      const pending = issueRequests.filter(r => r.status === 'pending');
      if (pending.length === 0) {
        reqPanel.innerHTML = '<div class="card" style="margin-bottom:18px;"><div class="card-header"><h2 class="card-title">&#128235; Pending Book Requests</h2></div><p style="padding:16px;color:var(--text-muted);font-size:.85rem;">No pending requests from students.</p></div>';
      } else {
        reqPanel.innerHTML = '<div class="card" style="margin-bottom:18px;"><div class="card-header"><h2 class="card-title">&#128235; Pending Book Requests <span class="nav-badge" style="margin-left:8px;">' + pending.length + '</span></h2></div>' +
          '<div style="padding:0 16px 16px;">' +
          pending.map(r => {
            const sid = r.studentId || r.student_id;
            const bid = r.bookId || r.book_id;
            const st = getStudent(sid);
            const bk = getBook(bid);
            const stuName = st ? st.name : ('Student #' + sid);
            const stuIdStr = st ? st.studentId : ('ID: ' + sid);
            const bkTitle = bk ? bk.title : ('Book #' + bid);
            return '<div class="due-item" style="margin-bottom:10px;padding:12px;background:var(--warning-bg);border-radius:var(--radius-sm);border:1px solid #f0d8a8;display:flex;align-items:center;justify-content:space-between;gap:12px;">' +
              '<div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">' +
                '<div class="due-avatar" style="background:var(--warning);color:#fff;">' + initials(stuName) + '</div>' +
                '<div class="due-info" style="flex:1;min-width:0;">' +
                  '<div class="due-name">' + escapeHtml(stuName) + ' <span style="color:var(--text-muted);font-size:.75rem;">(' + escapeHtml(stuIdStr) + ')</span></div>' +
                  '<div class="due-book">Wants: <strong><em>' + escapeHtml(bkTitle) + '</em></strong></div>' +
                  '<div style="font-size:.75rem;color:var(--text-muted);">Requested on ' + formatDate(r.requestedAt || r.requested_at) + '</div>' +
                '</div>' +
              '</div>' +
              '<div style="display:flex;gap:8px;flex-shrink:0;">' +
                '<button class="btn btn-mint btn-sm" onclick="markIssueCollected(' + r.id + ')">&#10003; Approve &amp; Issue</button>' +
                '<button class="btn btn-ghost btn-sm" onclick="rejectIssueRequest(' + r.id + ')">Reject</button>' +
              '</div></div>';
          }).join('') +
          '</div></div>';
      }
    } else {
      // Student: show their own pending requests
      const sid = loggedInUser ? loggedInUser.studentId : null;
      const myPending = issueRequests.filter(r => r.studentId===sid && r.status==='pending');
      if (myPending.length > 0) {
        reqPanel.style.display = '';
        reqPanel.innerHTML = '<div class="card" style="margin-bottom:18px;"><div class="card-header"><h2 class="card-title">&#128235; My Book Requests</h2></div>' +
          '<div style="padding:0 16px 16px;">' +
          myPending.map(r => {
            const bk = getBook(r.bookId);
            if (!bk) return '';
            return '<div class="due-item" style="margin-bottom:8px;padding:12px;background:var(--warning-bg);border-radius:var(--radius-sm);border:1px solid #f0d8a8;display:flex;align-items:center;justify-content:space-between;gap:12px;">' +
              '<div class="due-info" style="flex:1;">' +
                '<div class="due-name"><em>' + bk.title + '</em></div>' +
                '<div class="due-book" style="color:var(--warning);">&#9203; Awaiting admin approval &mdash; requested ' + formatDate(r.requestedAt) + '</div>' +
              '</div>' +
              '<button class="btn btn-outline-danger btn-sm" onclick="cancelStudentIssueRequest(' + r.id + ',' + r.bookId + ')">&#10005; Cancel Request</button>' +
              '</div>';
          }).join('') +
          '</div></div>';
      } else {
        reqPanel.style.display = 'none';
      }
    }
  }

  // Main loans table
  let list;
  if (isAdmin()) {
    list = loansData.map(l => ({ ...l, status:loanStatus(l), fine:calcFine(l) }));
  } else {
    const sid = loggedInUser ? loggedInUser.studentId : null;
    list = loansData.filter(l => l.studentId===sid).map(l => ({ ...l, status:loanStatus(l), fine:calcFine(l) }));
  }
  if (filter !== 'all') list = list.filter(l => l.status === filter);
  list.sort((a,b) => new Date(a.due) - new Date(b.due));

  const tbody = document.getElementById('loansTableBody');
  const empty = document.getElementById('loansEmpty');
  const table = document.getElementById('loansTable');

  if (list.length === 0) {
    tbody.innerHTML=''; if(table) table.style.display='none';
    empty.classList.remove('hidden'); return;
  }
  if(table) table.style.display='';
  empty.classList.add('hidden');
  const statusLabel = { active:'Active', overdue:'Overdue', returned:'Returned' };
  tbody.innerHTML = list.map(l => {
    const st = getStudent(l.studentId);
    const bk = getBook(l.bookId);
    if (!st || !bk) return '';
    const fineStr = l.fine > 0
      ? '<span style="color:var(--danger);font-weight:600;">Rs ' + l.fine + '</span>'
      : (l.status==='returned' ? '-' : '<span style="color:var(--text-muted);">Rs 0</span>');
    let actions = '';
    if (l.status !== 'returned') {
      if (isAdmin()) {
        actions = '<button class="btn btn-mint btn-sm" onclick="recordReturn(' + l.id + ')">Record Return</button>';
      } else {
        actions = '<span style="color:var(--text-muted);font-size:.78rem;">Contact admin to return</span>';
      }
    } else {
      actions = '<span style="color:var(--text-muted);font-size:.78rem;">Returned ' + formatDate(l.returned) + '</span>';
    }
    return '<tr>' +
      '<td><strong>' + st.name + '</strong><br><span style="font-size:.75rem;color:var(--text-muted)">' + st.studentId + '</span></td>' +
      '<td><strong>' + bk.title + '</strong><br><span style="font-size:.75rem;color:var(--text-muted)">' + bk.author + '</span></td>' +
      '<td>' + formatDate(l.issued) + '</td>' +
      '<td>' + formatDate(l.due) + '</td>' +
      '<td><span class="status-badge status-' + l.status + '">' + statusLabel[l.status] + '</span></td>' +
      '<td>' + fineStr + '</td>' +
      '<td>' + actions + '</td>' +
      '</tr>';
  }).join('');
}

function filterLoans(filter, btn) {
  currentLoanFilter = filter;
  document.querySelectorAll('.tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
  btn.classList.add('active'); btn.setAttribute('aria-selected','true');
  renderLoans();
}

async function recordReturn(loanId) {
  if (!isAdmin()) { showToast('Only admin can record returns.', 'error'); return; }
  const loan = loansData.find(l => l.id === loanId);
  if (!loan || loan.returned) return;

  if (IS_SERVER_ENV) {
    try {
      await apiFetch('/api/loans/' + loanId + '/return', { method: 'POST' });
    } catch (e) {
      console.warn('API error in record return:', e);
    }
  }

  const fine = calcFine(loan);
  loan.returned = new Date().toISOString().split('T')[0];
  const st = getStudent(loan.studentId);
  const bk = getBook(loan.bookId);
  showToast(fine > 0 ? 'Return recorded. Fine due: Rs ' + fine : 'Book returned by ' + (st?st.name:'Student') + '. No fine!', fine > 0 ? 'info' : 'success');
  activityLog.unshift({ type:'return', text:'<strong>' + (st?st.name:'Student') + '</strong> returned <em>' + (bk?bk.title:'Book') + '</em>', time:'Just now' });
  saveData();
  renderLoans(); renderCatalogue(); renderOverview();
}

// ========================
// SECTION 11: STUDENTS (Stored in MySQL)
// ========================
function renderStudents() {
  if (!isAdmin()) {
    const grid = document.getElementById('studentsGrid');
    if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);"><div style="font-size:3rem;margin-bottom:12px;">&#128274;</div><h3>Admin Access Only</h3><p>Student records are only visible to administrators.</p></div>';
    const empty = document.getElementById('studentsEmpty');
    if (empty) empty.classList.add('hidden');
    return;
  }
  const q    = (document.getElementById('studentSearch')?.value||'').toLowerCase();
  const year = document.getElementById('yearFilter')?.value||'all';
  const list = studentsData.filter(s => {
    const text=(s.name+' '+s.studentId+' '+(s.course||'')).toLowerCase();
    if (q && !text.includes(q)) return false;
    if (year!=='all' && String(s.year)!==year) return false;
    return true;
  });
  const grid  = document.getElementById('studentsGrid');
  const empty = document.getElementById('studentsEmpty');
  if (list.length===0) { grid.innerHTML=''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  grid.innerHTML = list.map(s => {
    const active = loansData.filter(l => l.studentId===s.id && !l.returned).length;
    const isDeactivated = s.status === 'deactivated';
    const isNoAccount = s.hasAccount === false || s.has_account === 0;

    return '<div class="student-card ' + (isDeactivated ? 'deactivated' : '') + '">' +
      '<div class="student-avatar">' + initials(s.name) + '</div>' +
      '<div class="student-info" style="flex:1;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">' +
          '<div class="student-name">' + s.name + '</div>' +
          '<div>' +
            (isDeactivated ? '<span class="status-badge status-deactivated">Deactivated</span>' : '<span class="status-badge status-active">Active</span>') +
            (isNoAccount ? '<span class="non-account-badge" title="Student does not use website">No Website Acc</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="student-id">' + s.studentId + '</div>' +
        '<div class="student-meta">' +
          '<div class="student-course">' + (s.course||'General') + ' &bull; <span class="year-badge">Year ' + (s.year||1) + '</span></div>' +
          '<div>' + (s.email||'-') + '</div>' +
          (s.phone ? '<div style="font-size:.78rem;color:var(--text-muted);">&#128222; ' + s.phone + '</div>' : '') +
        '</div>' +
        '<div class="student-actions" style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;gap:8px;flex-wrap:wrap;">' +
          '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
            '<button class="btn btn-ghost btn-sm" onclick="openStudentDetail(' + s.id + ')">View Profile</button>' +
            (isAdmin() ? (
              '<button class="btn btn-ghost btn-sm" onclick="openEditStudentModal(' + s.id + ')" title="Edit Student Record">&#9998; Edit</button>' +
              (isDeactivated
                ? '<button class="btn btn-outline-mint btn-sm" onclick="toggleStudentDeactivation(' + s.id + ',\'active\')">&#10003; Reactivate</button>'
                : '<button class="btn btn-outline-danger btn-sm" onclick="toggleStudentDeactivation(' + s.id + ',\'deactivated\')">&#9888; Deactivate</button>')
            ) : '') +
          '</div>' +
          (active>0 ? '<span class="avail-badge avail-no" style="padding:4px 10px;">' + active + ' loan' + (active>1?'s':'') + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function toggleStudentDeactivation(studentId, newStatus) {
  if (!isAdmin()) {
    showToast('Only administrators can change student status.', 'error');
    return;
  }
  const s = getStudent(studentId);
  if (!s) return;
  s.status = newStatus;

  if (IS_SERVER_ENV) {
    try {
      await apiFetch('/api/students/' + studentId + '/status', {
        method: 'POST',
        body: JSON.stringify({ status: newStatus })
      });
    } catch(e) {
      console.warn('API notice updating student status:', e);
    }
  }

  const isDeactivated = newStatus === 'deactivated';
  activityLog.unshift({
    type: 'student',
    text: 'Student account ' + (isDeactivated ? 'deactivated' : 'reactivated') + ': <strong>' + s.name + '</strong> (' + s.studentId + ')',
    time: 'Just now'
  });
  showToast('Student ' + s.name + ' has been ' + (isDeactivated ? 'deactivated' : 'reactivated') + '.', isDeactivated ? 'info' : 'success');
  saveData();
  renderStudents();
  renderOverview();
}

function openStudentDetail(studentId) {
  if (!isAdmin()) return;
  selectedStudentIdForDetail = studentId;
  const s = getStudent(studentId); if (!s) return;
  const loans  = loansData.filter(l => l.studentId===studentId);
  const active = loans.filter(l => !l.returned);
  const past   = loans.filter(l => l.returned);
  const fine   = loans.reduce((sum,l) => sum+calcFine(l), 0);
  const isDeactivated = s.status === 'deactivated';
  const isNoAccount = s.hasAccount === false || s.has_account === 0;

  let html =
    '<div class="student-detail-header">' +
      '<div class="student-detail-avatar">' + initials(s.name) + '</div>' +
      '<div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<div style="font-family:var(--font-head);font-size:1.15rem;font-weight:700;">' + s.name + '</div>' +
          (isDeactivated ? '<span class="status-badge status-deactivated">Deactivated</span>' : '<span class="status-badge status-active">Active</span>') +
          (isNoAccount ? '<span class="non-account-badge">No Website Acc</span>' : '') +
        '</div>' +
        '<div style="color:var(--blue);font-weight:500;font-size:.85rem;">' + s.studentId + '</div>' +
        '<div style="color:var(--text-muted);font-size:.8rem;">' + (s.course||'General') + ' - Year ' + (s.year||1) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="student-detail-body">' +
      '<div class="detail-row">' +
        '<div class="detail-field"><div class="detail-field-label">Account Status</div><div class="detail-field-value">' +
          (isDeactivated ? '<span class="status-badge status-deactivated">Deactivated</span>' : '<span class="status-badge status-active">Active</span>') +
        '</div></div>' +
        '<div class="detail-field"><div class="detail-field-label">Email</div><div class="detail-field-value">' + (s.email||'-') + '</div></div>' +
        '<div class="detail-field"><div class="detail-field-label">Phone</div><div class="detail-field-value">' + (s.phone||'-') + '</div></div>' +
        '<div class="detail-field"><div class="detail-field-label">Active Loans</div>' +
          '<div class="detail-field-value" style="color:' + (active.length>0?'var(--warning)':'var(--success)') + '">' + active.length + '</div></div>' +
        '<div class="detail-field"><div class="detail-field-label">Outstanding Fine</div>' +
          '<div class="detail-field-value" style="color:' + (fine>0?'var(--danger)':'var(--success)') + '">' + (fine>0?'Rs '+fine:'None') + '</div></div>' +
      '</div>';
  if (active.length>0) {
    html += '<div class="student-loans-section"><h4>Currently Borrowed</h4>' +
      active.map(l => {
        const bk=getBook(l.bookId); const st=loanStatus(l);
        return '<div class="student-loan-item"><span>' + (bk?bk.title:'Book') + '</span><span><span class="status-badge status-' + st + '">' + st + '</span> - Due ' + formatDate(l.due) + '</span></div>';
      }).join('') + '</div>';
  }
  if (past.length>0) {
    html += '<div class="student-loans-section" style="margin-top:12px;"><h4>Past Loans (' + past.length + ')</h4>' +
      past.slice(0,3).map(l => '<div class="student-loan-item"><span>' + (getBook(l.bookId)?.title||'Book') + '</span><span>Returned ' + formatDate(l.returned) + '</span></div>').join('') +
      (past.length>3 ? '<p style="font-size:.78rem;color:var(--text-muted);margin-top:6px;">+ ' + (past.length-3) + ' more</p>' : '') +
      '</div>';
  }
  html += '</div>';
  document.getElementById('studentDetailContent').innerHTML = html;

  const actionContainer = document.getElementById('studentDetailStatusAction');
  if (actionContainer) {
    const editBtn = '<button class="btn btn-ghost btn-sm" onclick="closeModal(\'studentDetailModal\');openEditStudentModal(' + s.id + ');" style="margin-right:8px;">&#9998; Edit Student</button>';
    const statusBtn = isDeactivated
      ? '<button class="btn btn-mint btn-sm" onclick="toggleStudentDeactivation(' + s.id + ',\'active\');closeModal(\'studentDetailModal\');">&#10003; Reactivate Student</button>'
      : '<button class="btn btn-outline-danger btn-sm" onclick="toggleStudentDeactivation(' + s.id + ',\'deactivated\');closeModal(\'studentDetailModal\');">&#9888; Deactivate Student</button>';
    actionContainer.innerHTML = editBtn + statusBtn;
  }
  openModal('studentDetailModal');
}

function openEditStudentModal(studentId) {
  if (!isAdmin()) return;
  const s = getStudent(studentId);
  if (!s) return;

  document.getElementById('es-id').value = s.id;
  document.getElementById('es-name').value = s.name || '';
  document.getElementById('es-id-num').value = s.studentId || '';
  document.getElementById('es-email').value = s.email || '';
  document.getElementById('es-phone').value = s.phone || '';
  document.getElementById('es-course').value = s.course || '';
  document.getElementById('es-year').value = s.year || 1;

  const phoneErr = document.getElementById('es-phone-error');
  if (phoneErr) phoneErr.style.display = 'none';

  openModal('editStudentModal');
}

async function submitEditStudent(e) {
  e.preventDefault();
  if (!isAdmin()) { showToast('Only admin can edit student records.', 'error'); return; }
  const id = parseInt(document.getElementById('es-id').value);
  const name = document.getElementById('es-name').value.trim();
  const sid = document.getElementById('es-id-num').value.trim();
  const email = document.getElementById('es-email').value.trim();
  const phone = document.getElementById('es-phone').value.trim();
  const course = document.getElementById('es-course').value.trim();
  const year = parseInt(document.getElementById('es-year').value) || 1;

  if (!name || !sid || !email || !course) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  if (!/^\d{10}$/.test(phone)) {
    const errEl = document.getElementById('es-phone-error');
    if (errEl) {
      errEl.textContent = 'Contact number must contain exactly 10 digits.';
      errEl.style.display = 'block';
    }
    showToast('Contact number must contain exactly 10 digits.', 'error');
    document.getElementById('es-phone').focus();
    return;
  }

  let updatedStudent = null;
  if (IS_SERVER_ENV) {
    try {
      const res = await apiFetch('/api/students/' + id, {
        method: 'POST',
        body: JSON.stringify({ name, studentId: sid, email, course, year, phone })
      });
      if (res && res.student) {
        updatedStudent = res.student;
      }
    } catch (err) {
      showToast(err.message || 'Error updating student record.', 'error');
      return;
    }
  }

  const idx = studentsData.findIndex(s => s.id === id);
  if (idx !== -1) {
    if (updatedStudent) {
      studentsData[idx] = { ...studentsData[idx], ...updatedStudent };
    } else {
      studentsData[idx] = { ...studentsData[idx], name, studentId: sid, email, course, year, phone };
    }
  }

  activityLog.unshift({ type: 'student', text: 'Student details updated: <strong>' + name + '</strong> (' + sid + ')', time: 'Just now' });
  closeModal('editStudentModal');
  showToast('Student "' + name + '" updated successfully!', 'success');
  saveData();
  renderStudents();
  renderOverview();
  closeModal('studentDetailModal');
}

// ========================
// SECTION 12: EXCHANGE
// ========================
let currentExchangeViewFilter = 'all';

function filterExchangeView(view, btn) {
  currentExchangeViewFilter = view;
  document.querySelectorAll('#exchangeViewTabs .tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderExchange();
}

function renderExchange() {
  const q         = (document.getElementById('exchangeSearch')?.value||'').toLowerCase();
  const subject   = document.getElementById('exchangeSubjectFilter')?.value||'all';
  const condition = document.getElementById('exchangeConditionFilter')?.value||'all';
  const sf = document.getElementById('exchangeSubjectFilter');
  if (sf && sf.options.length<=1) {
    [...new Set(exchangeData.map(e=>e.subject))].sort().forEach(s => {
      const o=document.createElement('option'); o.value=s; o.textContent=s; sf.appendChild(o);
    });
  }

  const myTab = document.getElementById('myListingsTab');
  if (myTab) {
    myTab.style.display = isAdmin() ? 'none' : '';
    if (loggedInUser && loggedInUser.studentId) {
      const myCount = exchangeData.filter(e => e.sellerId == loggedInUser.studentId || (loggedInUser.id && e.sellerId == loggedInUser.id)).length;
      myTab.innerHTML = 'My Listed Books' + (myCount > 0 ? ' <span class="nav-badge" style="margin-left:6px;">' + myCount + '</span>' : '');
    }
  }

  const isFilterMy = (currentExchangeViewFilter === 'my');
  const list = exchangeData.filter(e => {
    const isSeller = loggedInUser && (loggedInUser.studentId == e.sellerId || (loggedInUser.id && loggedInUser.id == e.sellerId));
    if (isFilterMy) {
      if (!isSeller) return false;
    } else {
      // Requirements 5 & 6: Only remove when claimed or collected for non-seller browsing
      if (!isSeller && (e.status === 'claimed' || e.status === 'collected')) return false;
    }
    const text = (e.title + ' ' + e.author + ' ' + e.subject).toLowerCase();
    if (q && !text.includes(q)) return false;
    if (subject !== 'all' && e.subject !== subject) return false;
    if (condition !== 'all' && e.condition !== condition) return false;
    return true;
  });
  const grid  = document.getElementById('exchangeGrid');
  const empty = document.getElementById('exchangeEmpty');
  if (list.length === 0) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  const condCls = { 'Like New':'cond-new', 'Good':'cond-good', 'Fair':'cond-fair' };
  const stClass = { available:'ex-available', pending:'ex-pending', claimed:'ex-claimed', accepted:'ex-pending' };
  const stLabel = { available:'Available', pending:'Requested', claimed:'Claimed', accepted:'Accepted' };

  grid.innerHTML = list.map(e => {
    const seller   = getStudent(e.sellerId);
    const isSeller = loggedInUser && (loggedInUser.studentId == e.sellerId || (loggedInUser.id && loggedInUser.id == e.sellerId));
    const myReq    = (loggedInUser && loggedInUser.studentId && e.requests)
      ? e.requests.find(r => r.studentId == loggedInUser.studentId)
      : null;
    const allReqs  = e.requests || [];
    const pendReqs = allReqs.filter(r => r.status === 'pending');
    const acceptedReq = allReqs.find(r => r.status === 'accepted');

    // 1. Requests Section (Seller responds; Admin observes only without buttons)
    let reqsHtml = '';
    if ((isSeller || isAdmin()) && allReqs.length > 0) {
      reqsHtml = '<div class="requests-section">' +
        '<div style="font-size:.75rem;font-weight:700;color:var(--text-sub);margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">' +
          '<span>EXCHANGE REQUESTS (' + allReqs.length + ')</span>' +
          (pendReqs.length > 0 ? '<span class="status-badge status-overdue" style="font-size:.68rem;">' + pendReqs.length + ' Pending</span>' : '') +
        '</div>' +
        allReqs.map((r, idx) => {
          const rs = getStudent(r.studentId);
          const isPending  = r.status === 'pending';
          const isAccepted = r.status === 'accepted';
          const isDeclined = r.status === 'declined';
          const isCollected = r.status === 'collected';

          let contactHtml = '';
          if (isAdmin()) {
            contactHtml = '<div style="margin-top:4px;font-size:0.75rem;color:var(--text-muted);">&#128100; Requester: <strong>' + escapeHtml(rs ? rs.name : 'Student') + '</strong> &bull; Status: ' + (isAccepted ? '<span style="color:var(--success);font-weight:600;">Accepted</span>' : isDeclined ? '<span style="color:var(--danger);">Declined</span>' : '<span style="color:var(--warning);">Pending Response</span>') + '</div>';
          } else {
            // Student / Seller view
            if (isPending) {
              contactHtml = '<div style="margin-top:4px;"><span class="badge-contact-hidden"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Requester contact hidden until accepted</span></div>';
            } else if (isAccepted || isCollected) {
              contactHtml = '<div style="margin-top:4px;"><span class="badge-contact-revealed">&#128222; Requester Contact: <strong>' + escapeHtml(rs ? (rs.phone || 'Available on file') : 'Available') + '</strong> (' + escapeHtml(rs ? rs.name : 'Student') + ')</span></div>';
            } else if (isDeclined) {
              contactHtml = '<div style="margin-top:4px;"><span class="status-badge status-deactivated">Request Declined</span></div>';
            }
          }

          let actionHtml = '';
          // Requirement 5 & 6: Only seller responds, admin has read-only access
          if (isSeller) {
            if (isPending) {
              actionHtml = '<div style="display:flex;gap:6px;margin-top:8px;width:100%;">' +
                '<button class="btn btn-mint btn-sm" onclick="respondRequest(' + e.id + ',' + idx + ',\'accepted\')">&#10003; Accept Request</button>' +
                '<button class="btn btn-outline-danger btn-sm" onclick="respondRequest(' + e.id + ',' + idx + ',\'declined\')">&#10005; Decline</button>' +
              '</div>';
            } else if (isAccepted) {
              actionHtml = '<div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
                '<span class="status-badge status-returned">&#10003; Accepted &bull; Deal Connected</span>' +
                '<button class="btn btn-mint btn-sm" onclick="markExchangeCollected(' + e.id + ')" title="Mark as collected after book is handed over">&#10004; Mark as Collected</button>' +
              '</div>';
            }
          }

          return '<div class="request-item" style="border-left:3px solid ' + (isAccepted ? 'var(--success)' : isPending ? 'var(--warning)' : 'var(--danger)') + ';">' +
            '<div class="req-name">' + escapeHtml(rs ? rs.name : 'Student') + ' <span style="color:var(--text-muted);font-weight:400;font-size:.78rem;">(' + escapeHtml(rs ? rs.studentId : '') + ' &bull; ' + escapeHtml(rs ? rs.course : '') + ')</span></div>' +
            (r.message ? '<div class="req-msg">&ldquo;' + escapeHtml(r.message) + '&rdquo;</div>' : '') +
            contactHtml +
            actionHtml +
          '</div>';
        }).join('') + '</div>';
    }

    // 2. Requester student view
    let requesterBanner = '';
    if (myReq && !isAdmin()) {
      if (myReq.status === 'accepted') {
        requesterBanner = '<div class="exchange-accepted-box">' +
          '<div class="box-title">&#127881; Your Exchange Request was Accepted!</div>' +
          '<div class="box-phone">&#128222; Seller Contact Number: <strong>' + escapeHtml(seller ? (seller.phone || 'Contact library office') : 'Available') + '</strong> (' + escapeHtml(seller ? seller.name : 'Seller') + ')</div>' +
          '<div class="box-sub">Contact ' + escapeHtml(seller ? seller.name : 'the student') + ' directly to arrange collection of the book.</div>' +
        '</div>';
      } else if (myReq.status === 'pending') {
        requesterBanner = '<div class="exchange-pending-box">' +
          '<div>&#9203; <strong>Request Pending:</strong> Waiting for ' + escapeHtml(seller ? seller.name : 'the seller') + ' to accept or decline.</div>' +
          '<div class="box-note">&#128274; Contact number will be revealed as soon as your request is accepted.</div>' +
        '</div>';
      } else if (myReq.status === 'declined') {
        requesterBanner = '<div class="exchange-declined-box">&#10005; Your request for this book was declined by the seller.</div>';
      }
    }

    // Requirement 5 & 6: Seller controls
    let sellerControls = '';
    if (isSeller) {
      sellerControls = '<div style="display:flex;gap:6px;align-items:center;margin-top:10px;padding-top:8px;border-top:1px dashed var(--border);flex-wrap:wrap;">' +
        '<button class="btn btn-outline-mint btn-sm" onclick="openEditListingModal(' + e.id + ')">&#9998; Edit Listing</button>' +
        '<button class="btn btn-outline-danger btn-sm" onclick="deleteExchangeListing(' + e.id + ')">&#128465; Delete</button>' +
        (acceptedReq ? '<button class="btn btn-mint btn-sm" onclick="markExchangeCollected(' + e.id + ')">&#10004; Mark as Collected</button>' : '') +
        '<button class="btn btn-ghost btn-sm" onclick="openExchangeEditHistory(' + e.id + ')" title="View audit history">&#128221; History</button>' +
      '</div>';
    }

    // 3. Footer actions
    let footerAction = '';
    if (isAdmin()) {
      footerAction = '<span style="font-size:0.75rem;color:var(--text-muted);font-weight:600;">(Admin View Only)</span>';
    } else if (isSeller) {
      footerAction = '<span class="badge-your-listing">Your Listing</span>';
    } else if (myReq) {
      if (myReq.status === 'accepted') {
        footerAction = '<span class="status-badge status-returned">&#10003; Accepted</span>';
      } else if (myReq.status === 'pending') {
        footerAction = '<span class="status-badge status-overdue">&#9203; Requested</span>';
      } else {
        footerAction = '<span class="status-badge status-deactivated">Declined</span>';
      }
    } else if (acceptedReq) {
      footerAction = '<button class="btn btn-ghost btn-sm" disabled style="opacity:0.75;">In Exchange</button>';
    } else if (e.status === 'available') {
      footerAction = '<button class="btn btn-primary btn-sm" onclick="openRequestModal(' + e.id + ')">Request Book</button>';
    } else {
      footerAction = '<button class="btn btn-ghost btn-sm" disabled>' + (stLabel[e.status] || 'Requested') + '</button>';
    }

    const photoHtml = e.image 
      ? '<img src="' + e.image + '" style="width:58px;height:78px;object-fit:cover;border-radius:6px;border:1px solid var(--border);flex-shrink:0;box-shadow:var(--shadow-sm);" alt="Cover" onerror="this.onerror=null;this.style.display=\'none\';">'
      : '';

    return '<div class="exchange-card">' +
      '<div class="exchange-header">' +
        '<div style="display:flex;gap:12px;align-items:flex-start;">' +
          photoHtml +
          '<div><div class="exchange-title">' + escapeHtml(e.title) + '</div><div class="exchange-author">by ' + escapeHtml(e.author) + '</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="exchange-body">' +
        '<div class="exchange-meta">' +
          '<div class="exchange-field"><div class="exchange-field-label">Subject</div><div class="exchange-field-value">' + escapeHtml(e.subject) + '</div></div>' +
          '<div class="exchange-field"><div class="exchange-field-label">Condition</div>' +
            '<div class="exchange-field-value"><span class="condition-badge ' + (condCls[e.condition]||'') + '">' + escapeHtml(e.condition) + '</span></div></div>' +
        '</div>' +
        '<div class="seller-info">Listed by <strong>' + escapeHtml(seller ? seller.name : 'Student') + '</strong> &bull; Year ' + (seller ? seller.year : 3) + ' &bull; ' + escapeHtml(seller ? seller.course : '') + '</div>' +
        (e.notes ? '<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:10px;background:var(--surface);padding:8px 10px;border-radius:var(--radius-sm);">&#128221; ' + escapeHtml(e.notes) + '</div>' : '') +
        requesterBanner +
        reqsHtml +
        sellerControls +
      '</div>' +
      '<div class="exchange-footer">' +
        '<div class="exchange-price">Rs ' + e.price + '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<span class="exchange-status-badge ' + (acceptedReq ? 'ex-pending' : (stClass[e.status]||'ex-available')) + '">' + (acceptedReq ? 'In Exchange' : (stLabel[e.status]||'Available')) + '</span>' +
          footerAction +
        '</div>' +
      '</div></div>';
  }).join('');
}

// Requirement 2 & 8: Edit listed book
function openEditListingModal(exchangeId) {
  const listing = exchangeData.find(e => e.id === exchangeId);
  if (!listing) return;
  if (!loggedInUser || loggedInUser.studentId !== listing.sellerId) {
    showToast('Only the seller can edit this listing.', 'error');
    return;
  }
  const idEl = document.getElementById('elb-id') || document.getElementById('el-id');
  const titleEl = document.getElementById('elb-title') || document.getElementById('el-title');
  const authorEl = document.getElementById('elb-author') || document.getElementById('el-author');
  const subjectEl = document.getElementById('elb-subject') || document.getElementById('el-subject');
  const condEl = document.getElementById('elb-condition') || document.getElementById('el-condition');
  const priceEl = document.getElementById('elb-price') || document.getElementById('el-price');
  const notesEl = document.getElementById('elb-notes') || document.getElementById('el-notes');

  if (idEl) idEl.value = listing.id;
  if (titleEl) titleEl.value = listing.title;
  if (authorEl) authorEl.value = listing.author;
  if (subjectEl) subjectEl.value = listing.subject;
  if (condEl) condEl.value = listing.condition;
  if (priceEl) priceEl.value = listing.price;
  if (notesEl) notesEl.value = listing.notes || '';

  // Photo preview
  selectedPhotos['elb'] = listing.image || null;
  selectedPhotos['el'] = listing.image || null;
  const previewWrap = document.getElementById('elb-photo-preview-wrap') || document.getElementById('el-photo-preview');
  const previewImg  = document.getElementById('elb-photo-preview') || document.getElementById('el-preview-img');
  if (listing.image && previewImg && previewWrap) {
    previewImg.src = listing.image;
    previewWrap.style.display = 'block';
  } else if (previewWrap) {
    previewWrap.style.display = 'none';
  }

  openModal('editListingModal');
}

async function submitEditListing(e) {
  e.preventDefault();
  const idEl = document.getElementById('elb-id') || document.getElementById('el-id');
  const eid = parseInt(idEl?.value || '0');
  const listing = exchangeData.find(ex => ex.id === eid);
  if (!listing) return;
  if (!loggedInUser || loggedInUser.studentId !== listing.sellerId) {
    showToast('Only the seller can edit this listing.', 'error');
    return;
  }
  const title     = (document.getElementById('elb-title') || document.getElementById('el-title')).value.trim();
  const author    = (document.getElementById('elb-author') || document.getElementById('el-author')).value.trim();
  const subject   = (document.getElementById('elb-subject') || document.getElementById('el-subject')).value.trim();
  const condition = (document.getElementById('elb-condition') || document.getElementById('el-condition')).value;
  const price     = parseInt((document.getElementById('elb-price') || document.getElementById('el-price')).value);
  const notes     = (document.getElementById('elb-notes') || document.getElementById('el-notes')).value.trim();
  const image     = selectedPhotos['elb'] || selectedPhotos['el'] || listing.image || null;

  if (!title || !author || !subject || !condition || isNaN(price)) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  let savedImage = image;
  if (IS_SERVER_ENV) {
    try {
      const res = await apiFetch('/api/exchange/' + eid + '/edit', {
        method: 'POST',
        body: JSON.stringify({ 
          title, author, subject, condition, price, notes, image,
          userId: loggedInUser.studentId,
          userName: loggedInUser.name
        })
      });
      if (res && res.image) savedImage = res.image;
    } catch(err) {
      showToast(err.message || 'Error updating listing.', 'error');
      return;
    }
  }

  listing.title = title;
  listing.author = author;
  listing.subject = subject;
  listing.condition = condition;
  listing.price = price;
  listing.notes = notes;
  listing.image = savedImage;

  closeModal('editListingModal');
  showToast('Book listing "' + title + '" updated successfully!', 'success');
  saveData();
  renderExchange();
  renderOverview();
}

// Requirement 2: Delete listed book
async function deleteExchangeListing(exchangeId) {
  const listing = exchangeData.find(e => e.id === exchangeId);
  if (!listing) return;
  if (!loggedInUser || loggedInUser.studentId !== listing.sellerId) {
    showToast('Only the seller can delete this listing.', 'error');
    return;
  }
  if (!confirm('Are you sure you want to delete your listing for "' + listing.title + '"?')) return;

  if (IS_SERVER_ENV) {
    try {
      await apiFetch('/api/exchange/' + exchangeId, { method: 'DELETE' });
    } catch(err) {
      showToast(err.message || 'Error deleting listing.', 'error');
      return;
    }
  }

  const idx = exchangeData.findIndex(e => e.id === exchangeId);
  if (idx !== -1) exchangeData.splice(idx, 1);
  showToast('Listing for "' + listing.title + '" removed.', 'info');
  saveData();
  renderExchange();
  renderOverview();
}

// Requirement 6: Mark as Collected workflow - ONLY student who listed the book can mark collected
async function markExchangeCollected(exchangeId) {
  const listing = exchangeData.find(e => e.id === exchangeId);
  if (!listing) return;
  if (!loggedInUser || loggedInUser.studentId !== listing.sellerId) {
    showToast('Only the student who listed this book can mark it as collected.', 'error');
    return;
  }
  if (!confirm('Mark "' + listing.title + '" as collected? This confirms the student has collected the book and completes the exchange transaction.')) return;

  if (IS_SERVER_ENV) {
    try {
      await apiFetch('/api/exchange/' + exchangeId + '/collected', {
        method: 'POST',
        body: JSON.stringify({ userId: loggedInUser.studentId, role: loggedInUser.role })
      });
    } catch(err) {
      console.warn('API error in markExchangeCollected:', err);
    }
  }

  listing.status = 'claimed';
  if (listing.requests) {
    listing.requests.forEach(r => {
      if (r.status === 'accepted') r.status = 'collected';
    });
  }
  activityLog.unshift({
    type: 'exchange',
    text: 'Exchange completed & collected: <em>' + listing.title + '</em>',
    time: 'Just now'
  });
  showToast('Book marked as collected! Transaction completed and removed from active listings.', 'success');
  saveData();
  renderExchange();
  renderOverview();
}

// Backward compatibility alias for claim
async function claimExchangeListing(exchangeId) {
  return markExchangeCollected(exchangeId);
}

// Requirement 5: Admin CANNOT accept/decline requests - ONLY the seller who listed can respond
async function respondRequest(exchangeId, reqIndex, response) {
  const listing = exchangeData.find(e => e.id===exchangeId);
  if (!listing || !listing.requests) return;
  if (reqIndex >= listing.requests.length) return;

  if (isAdmin()) {
    showToast('Administrators have read-only access and cannot respond to student exchange requests.', 'error');
    return;
  }

  const isSeller = loggedInUser && loggedInUser.studentId === listing.sellerId;
  if (!isSeller) {
    showToast('Only the student who listed this book can accept or decline requests.', 'error');
    return;
  }

  const req = listing.requests[reqIndex];
  req.status = response;
  const rs = getStudent(req.studentId);
  const seller = getStudent(listing.sellerId);

  if (IS_SERVER_ENV) {
    try {
      await apiFetch('/api/exchange/' + exchangeId + '/respond', {
        method: 'POST',
        body: JSON.stringify({
          studentId: req.studentId,
          status: response,
          actorId: loggedInUser.studentId,
          actorRole: loggedInUser.role
        })
      });
    } catch(e) {
      console.warn('API error in respondRequest:', e);
    }
  }

  if (response === 'accepted') {
    // Requirement 5: Accepting a request must NOT remove the book from active exchange!
    listing.status = 'pending';
    listing.requests.forEach((r, idx) => {
      if (idx !== reqIndex && r.status === 'pending') {
        r.status = 'declined';
      }
    });
    showToast('Request accepted! Your contact number is now visible to the student to arrange collection.', 'success');
    activityLog.unshift({
      type: 'exchange',
      text: 'Exchange accepted: <strong>' + (rs ? rs.name : 'Student') + '</strong> gets <em>' + listing.title + '</em> from <strong>' + (seller ? seller.name : 'Seller') + '</strong>',
      time: 'Just now'
    });
  } else {
    const hasActive = listing.requests.some(r => r.status === 'pending' || r.status === 'accepted');
    if (!hasActive) listing.status = 'available';
    showToast('Exchange request declined.', 'info');
  }
  saveData();
  renderExchange();
  renderOverview();
}

function openRequestModal(exchangeId) {
  if (isAdmin()) {
    showToast('Administrators cannot request books on the student exchange.', 'error');
    return;
  }
  selectedExchangeIdForRequest = exchangeId;
  const listing = exchangeData.find(e => e.id===exchangeId); if (!listing) return;
  document.getElementById('requestBookContent').innerHTML =
    '<div style="padding:16px 24px;background:var(--surface);border-bottom:1px solid var(--border);">' +
    '<div style="font-weight:600;font-size:.95rem;">' + listing.title + '</div>' +
    '<div style="font-size:.8rem;color:var(--text-muted);">by ' + listing.author + ' &bull; Rs ' + listing.price + ' &bull; ' + listing.condition + '</div>' +
    '</div>';
  openModal('requestBookModal');
}

// ========================
// SECTION 13: RECOMMENDATIONS
// ========================
function renderRecommendations() { filterRec(currentRecFilter); }

function filterRec(tag, btn) {
  currentRecFilter = tag;
  document.querySelectorAll('.rec-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelectorAll('.rec-tab').forEach(t => { if(t.textContent.toLowerCase().includes(tag)) t.classList.add('active'); });
  const list   = recommendationsData.filter(r => r.tag===tag);
  const tagCls = tag==='popular' ? 'tag-popular' : tag==='staff' ? 'tag-staff' : 'tag-new';
  document.getElementById('recGrid').innerHTML = list.map((r,i) =>
    '<div class="rec-card">' +
      '<div class="rec-rank">' + (i+1) + '</div>' +
      '<div class="rec-subject">' + r.subject + '</div>' +
      '<div class="rec-title">' + r.title + '</div>' +
      '<div class="rec-author">by ' + r.author + '</div>' +
      '<div class="rec-stats">' +
        '<span class="rec-stat"><strong>' + r.checkouts + '</strong> checkouts</span>' +
        '<span class="rec-stat"><strong>' + r.rating + '</strong> &#9733;</span>' +
        '<span class="rec-tag ' + tagCls + '">' + r.tagLabel + '</span>' +
      '</div></div>'
  ).join('');
}

// ========================
// ========================
// SECTION 14: FORMS
// ========================
function populateIssueModal() {
  const sel = document.getElementById('ib-student');
  sel.innerHTML = '<option value="">Select a student...</option>';
  studentsData.filter(s => s.status !== 'deactivated').forEach(s => {
    const o=document.createElement('option');
    o.value=s.id;
    o.textContent=s.name+' ('+s.studentId+')' + (s.hasAccount===false?' [No Website Acc]':'');
    sel.appendChild(o);
  });
  const bsel = document.getElementById('ib-book');
  bsel.innerHTML = '<option value="">Select an available book...</option>';
  booksData.filter(b => availableCopies(b)>0).forEach(b => {
    const o=document.createElement('option'); o.value=b.id; o.textContent=b.title+' ('+availableCopies(b)+' available)'; bsel.appendChild(o);
  });
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('ib-issue').value = today;
  const due = new Date(); due.setDate(due.getDate()+14);
  document.getElementById('ib-due').value = due.toISOString().split('T')[0];

  const idInput = document.getElementById('ib-selected-book-id');
  if (!idInput || !idInput.value) {
    showBookSelectorInModal();
  }
}

function openDirectIssueModal() {
  if (!isAdmin()) { showToast('Only admin can directly issue books.', 'error'); return; }
  const phoneErr = document.getElementById('di-phone-error');
  if (phoneErr) phoneErr.style.display = 'none';
  openModal('directIssueModal');
}

function populateDirectIssueModal() {
  const bsel = document.getElementById('di-book');
  if (bsel) {
    bsel.innerHTML = '<option value="">Select an available book...</option>';
    booksData.filter(b => availableCopies(b) > 0).forEach(b => {
      const o = document.createElement('option');
      o.value = b.id;
      o.textContent = b.title + ' (' + availableCopies(b) + ' available)';
      bsel.appendChild(o);
    });
  }
  const today = new Date().toISOString().split('T')[0];
  const diIssue = document.getElementById('di-issue');
  if (diIssue) diIssue.value = today;
  const due = new Date();
  due.setDate(due.getDate() + 14);
  const diDue = document.getElementById('di-due');
  if (diDue) diDue.value = due.toISOString().split('T')[0];
}

async function submitDirectIssueBook(e) {
  e.preventDefault();
  if (!isAdmin()) { showToast('Only administrators can directly issue books.', 'error'); return; }

  const name      = document.getElementById('di-name').value.trim();
  const studentId = document.getElementById('di-id').value.trim();
  const course    = document.getElementById('di-course').value.trim();
  const year      = parseInt(document.getElementById('di-year').value) || 1;
  const phone     = document.getElementById('di-phone').value.trim();
  const bookId    = parseInt(document.getElementById('di-book').value);
  const issued    = document.getElementById('di-issue').value;
  const due       = document.getElementById('di-due').value;

  if (!name || !studentId || !course || !bookId || !issued || !due) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }
  if (!validateAdminPhone('di-phone', 'di-phone-error')) {
    const errEl = document.getElementById('di-phone-error');
    if (errEl) {
      errEl.textContent = 'Contact number must contain exactly 10 digits.';
      errEl.style.display = 'block';
    }
    showToast('Contact number must contain exactly 10 digits.', 'error');
    return;
  }
  if (new Date(due) <= new Date(issued)) {
    showToast('Due date must be after issue date.', 'error');
    return;
  }

  const bk = getBook(bookId);
  if (!bk || availableCopies(bk) === 0) {
    showToast('No copies available for this book.', 'error');
    return;
  }

  // Check if student exists or create offline student record
  let st = studentsData.find(s => s.studentId.toLowerCase() === studentId.toLowerCase());
  let studentRecordId = st ? st.id : null;

  if (st && st.status === 'deactivated') {
    showToast('Cannot issue book to a deactivated student.', 'error');
    return;
  }

  if (!st) {
    studentRecordId = Date.now();
    const newStudentObj = {
      id: studentRecordId,
      studentId: studentId,
      name: name,
      email: studentId.toLowerCase() + '@offline.library.local',
      course: course,
      year: year,
      phone: phone || '',
      status: 'active',
      hasAccount: false
    };

    if (IS_SERVER_ENV) {
      try {
        const sRes = await apiFetch('/api/students', {
          method: 'POST',
          body: JSON.stringify({ ...newStudentObj, hasAccount: false })
        });
        if (sRes && sRes.id) {
          studentRecordId = sRes.id;
          newStudentObj.id = studentRecordId;
        }
      } catch (err) {
        console.warn('API notice registering offline student:', err);
      }
    }
    studentsData.push(newStudentObj);
    st = newStudentObj;
  }

  // Direct loan creation (NO issueRequest, NO 'Mark as collected' step)
  let newLoanId = Date.now();
  if (IS_SERVER_ENV) {
    try {
      const lRes = await apiFetch('/api/loans', {
        method: 'POST',
        body: JSON.stringify({ studentId: studentRecordId, bookId, issued, due })
      });
      if (lRes && lRes.id) newLoanId = lRes.id;
    } catch (err) {
      showToast(err.message || 'Error recording loan.', 'error');
      return;
    }
  }

  loansData.push({
    id: newLoanId,
    studentId: studentRecordId,
    bookId: bookId,
    issued: issued,
    due: due,
    returned: null
  });

  activityLog.unshift({
    type: 'issue',
    text: 'Direct issue: Book issued to <strong>' + name + '</strong> (' + studentId + ', offline student): <em>' + (bk ? bk.title : 'Book') + '</em>',
    time: 'Just now'
  });

  closeModal('directIssueModal');
  document.getElementById('directIssueForm').reset();
  showToast('Book "' + (bk ? bk.title : 'Book') + '" directly issued to ' + name + '! (No collection step needed)', 'success');
  saveData();
  renderLoans();
  renderCatalogue();
  renderOverview();
  renderStudents();
}

function populateSeniorStudents() {
  const sel = document.getElementById('lb-seller');
  sel.innerHTML = '<option value="">Select your name...</option>';
  studentsData.filter(s => s.year>=3 && s.status !== 'deactivated').forEach(s => {
    const o=document.createElement('option'); o.value=s.id; o.textContent=s.name+' ('+s.studentId+' - Year '+s.year+')'; sel.appendChild(o);
  });
}

function populateAllStudents(selectId) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = '<option value="">Select your name...</option>';
  studentsData.filter(s => s.status !== 'deactivated').forEach(s => { const o=document.createElement('option'); o.value=s.id; o.textContent=s.name+' ('+s.studentId+')'; sel.appendChild(o); });
}

async function submitAddBook(e) {
  e.preventDefault();
  if (!isAdmin()) { showToast('Only admin can add books.', 'error'); return; }
  const title   = document.getElementById('ab-title').value.trim();
  const author  = document.getElementById('ab-author').value.trim();
  const subject = document.getElementById('ab-subject').value.trim();
  const isbn    = document.getElementById('ab-isbn').value.trim();
  const copies  = parseInt(document.getElementById('ab-copies').value);
  const year    = parseInt(document.getElementById('ab-year').value)||null;
  const desc    = document.getElementById('ab-description').value.trim();
  const image   = selectedPhotos['ab'] || null;

  if (!title||!author||!subject||copies<1) { showToast('Please fill in all required fields.','error'); return; }

  let newId = Date.now();
  let serverImg = image;
  if (IS_SERVER_ENV) {
    try {
      const res = await apiFetch('/api/books', {
        method: 'POST',
        body: JSON.stringify({ title, author, subject, isbn, copies, year, description:desc, image })
      });
      if (res && res.id) newId = res.id;
      if (res && res.image !== undefined) serverImg = res.image;
    } catch(err) {
      showToast(err.message || 'Could not save book.', 'error');
      return;
    }
  }

  booksData.push({ id:newId, title, author, subject, isbn, copies, year, description:desc, image:serverImg });
  activityLog.unshift({ type:'issue', text:'New book added: <em>'+title+'</em> by '+author, time:'Just now' });
  clearPhotoPreview('ab');
  closeModal('addBookModal'); document.getElementById('addBookForm').reset();
  showToast('Book "'+title+'" stored in database!','success');
  saveData();
  renderCatalogue(); renderOverview();
  const sf=document.getElementById('subjectFilter');
  while(sf && sf.options.length>1) sf.remove(1);
}

async function submitIssueBook(e) {
  e.preventDefault();
  if (!isAdmin()) { showToast('Only admin can directly issue books.', 'error'); return; }
  const selectedBookId = document.getElementById('ib-selected-book-id')?.value;
  const bookDropdownId = document.getElementById('ib-book')?.value;
  const bookId    = parseInt(selectedBookId) || parseInt(bookDropdownId);
  const studentId = parseInt(document.getElementById('ib-student').value);
  const issued    = document.getElementById('ib-issue').value;
  const due       = document.getElementById('ib-due').value;

  if (!bookId) { showToast('Please select a book to issue.', 'error'); return; }
  if (!studentId) { showToast('Please select a student.', 'error'); return; }
  if (!issued || !due) { showToast('Please fill in all fields.','error'); return; }
  if (new Date(due) <= new Date(issued)) { showToast('Due date must be after issue date.','error'); return; }

  const bk = getBook(bookId);
  const st = getStudent(studentId);
  if (!bk) { showToast('Selected book not found.', 'error'); return; }
  if (!st) { showToast('Selected student not found.', 'error'); return; }
  if (st.status === 'deactivated') { showToast('Cannot issue book to a deactivated student.', 'error'); return; }
  if (availableCopies(bk) === 0) { showToast('No copies available for this book.','error'); return; }

  let newId = Date.now();
  if (IS_SERVER_ENV) {
    try {
      const res = await apiFetch('/api/loans', {
        method: 'POST',
        body: JSON.stringify({ studentId, bookId, issued, due })
      });
      if (res && res.id) newId = res.id;
    } catch (err) {
      showToast(err.message || 'Error issuing loan.', 'error');
      return;
    }
  }

  loansData.push({ id:newId, studentId, bookId, issued, due, returned:null });
  activityLog.unshift({ type:'issue', text:'Book issued to <strong>'+st.name+'</strong>: <em>'+bk.title+'</em>', time:'Just now' });
  closeModal('issueBookModal');
  document.getElementById('issueBookForm').reset();
  showBookSelectorInModal();
  showToast('"'+bk.title+'" issued to '+st.name+'!','success');
  saveData();
  renderLoans(); renderCatalogue(); renderOverview();
}

// Storing student in MySQL
async function submitAddStudent(e) {
  e.preventDefault();
  if (!isAdmin()) { showToast('Only admin can add students.', 'error'); return; }
  const name   = document.getElementById('as-name').value.trim();
  const sid    = document.getElementById('as-id').value.trim();
  const email  = document.getElementById('as-email').value.trim();
  const course = document.getElementById('as-course').value.trim();
  const year   = parseInt(document.getElementById('as-year').value);
  const phone  = document.getElementById('as-phone').value.trim();

  if (!name||!sid||!email||!course||!year) { showToast('Please fill in all required fields.','error'); return; }
  if (studentsData.some(s => s.studentId===sid)) { showToast('A student with this ID already exists.','error'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Please enter a valid email address.','error'); return; }

  if (!/^\d{10}$/.test(phone)) {
    const errEl = document.getElementById('as-phone-error');
    if (errEl) {
      errEl.textContent = 'Contact number must contain exactly 10 digits.';
      errEl.style.display = 'block';
    }
    showToast('Contact number must contain exactly 10 digits.', 'error');
    document.getElementById('as-phone').focus();
    return;
  }

  let newId = Date.now();
  if (IS_SERVER_ENV) {
    try {
      const res = await apiFetch('/api/students', {
        method: 'POST',
        body: JSON.stringify({ name, studentId:sid, email, course, year, phone })
      });
      if (res && res.id) newId = res.id;
    } catch (err) {
      showToast(err.message || 'Error storing student in database.', 'error');
      return;
    }
  }

  studentsData.push({ id:newId, studentId:sid, name, email, course, year, phone });
  activityLog.unshift({ type:'student', text:'New student registered in MySQL: <strong>'+name+'</strong> ('+sid+')', time:'Just now' });
  closeModal('addStudentModal'); document.getElementById('addStudentForm').reset();
  showToast('Student "'+name+'" saved to database!','success');
  saveData();
  renderStudents(); renderOverview();
}

// Requirement 2: Auto-assign logged in student as seller and remove name selection dropdown
async function submitListBook(e) {
  e.preventDefault();
  if (!loggedInUser || loggedInUser.role !== 'student') {
    showToast('Please log in as a student to list a used book.', 'error');
    return;
  }
  const sellerId  = parseInt(loggedInUser.studentId || loggedInUser.id);
  const seller    = getStudent(sellerId);
  const title     = document.getElementById('lb-title').value.trim();
  const author    = document.getElementById('lb-author').value.trim();
  const subject   = document.getElementById('lb-subject').value.trim();
  const condition = document.getElementById('lb-condition').value;
  const price     = parseInt(document.getElementById('lb-price').value);
  const notes     = document.getElementById('lb-notes').value.trim();
  const image     = selectedPhotos['lb'] || null;

  if (!sellerId||!title||!author||!subject||!condition||isNaN(price)) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  let newId = Date.now();
  let serverImg = image;
  if (IS_SERVER_ENV) {
    try {
      const res = await apiFetch('/api/exchange', {
        method: 'POST',
        body: JSON.stringify({ sellerId, title, author, subject, condition, price, notes, image })
      });
      if (res && res.id) newId = res.id;
      if (res && res.image !== undefined) serverImg = res.image;
    } catch (err) {
      showToast(err.message || 'Error listing book.', 'error');
      return;
    }
  }

  exchangeData.unshift({ id: newId, sellerId, title, author, subject, condition, price, notes, status: 'available', image: serverImg, requests: [] });
  activityLog.unshift({ type: 'exchange', text: '<strong>' + (seller ? seller.name : loggedInUser.name) + '</strong> listed a book: <em>' + title + '</em>', time: 'Just now' });
  clearPhotoPreview('lb');
  closeModal('listBookModal');
  document.getElementById('listBookForm').reset();
  showToast('"' + title + '" listed for exchange!', 'success');
  const sf = document.getElementById('exchangeSubjectFilter');
  while (sf && sf.options.length > 1) sf.remove(1);
  saveData();
  if (IS_SERVER_ENV) {
    await syncWithBackend();
  } else {
    renderExchange();
    renderOverview();
  }
}

async function submitRequestBook(e) {
  e.preventDefault();
  if (isAdmin()) {
    showToast('Administrators cannot request books on the student exchange.', 'error');
    return;
  }
  const studentId = loggedInUser ? loggedInUser.studentId : parseInt(document.getElementById('rb-student')?.value);
  const message   = document.getElementById('rb-message').value.trim();
  if (!studentId) { showToast('Please select your name.','error'); return; }
  const listing = exchangeData.find(ex => ex.id===selectedExchangeIdForRequest);
  if (!listing) return;
  if (listing.sellerId===studentId) { showToast('You cannot request your own listing.','error'); return; }
  if (listing.requests && listing.requests.some(r => r.studentId===studentId)) { showToast('You already requested this book.','error'); return; }

  if (IS_SERVER_ENV) {
    try {
      await apiFetch('/api/exchange/' + selectedExchangeIdForRequest + '/request', {
        method: 'POST',
        body: JSON.stringify({ studentId, message })
      });
    } catch(err) {
      showToast(err.message || 'Error sending request.', 'error');
      return;
    }
  }

  if (!listing.requests) listing.requests = [];
  listing.requests.push({ studentId, message, status:'pending' });
  if (listing.status==='available') listing.status = 'pending';
  const st = getStudent(studentId);
  activityLog.unshift({ type:'exchange', text:'<strong>'+(st?st.name:loggedInUser.name)+'</strong> requested <em>'+listing.title+'</em>', time:'Just now' });
  closeModal('requestBookModal'); document.getElementById('requestBookForm').reset();
  showToast('Request sent for "'+listing.title+'"!','success');
  saveData();
  renderExchange(); renderOverview();
}

function handleProfileClick() {
  if (!loggedInUser) return;
  const isStu = loggedInUser.role === 'student';
  const st = isStu ? getStudent(loggedInUser.studentId) : null;

  const modalTitle = document.getElementById('editProfileModalTitle');
  if (modalTitle) modalTitle.textContent = isStu ? 'Edit Profile & Login Details' : 'Change Username & Password';

  const nameLabel = document.getElementById('ep-name-label');
  if (nameLabel) nameLabel.textContent = isStu ? 'Full Name *' : 'Username *';

  document.getElementById('ep-name').value     = loggedInUser.name || (st ? st.name : '');
  const epPassInput = document.getElementById('ep-password');
  if (epPassInput) {
    epPassInput.value = '';
    epPassInput.classList.remove('error');
  }
  checkPasswordRequirements('ep-password', 'ep-pwd-rules');

  // Show or hide student-only fields (Academic year, email, course, student id, phone)
  document.querySelectorAll('.ep-student-field').forEach(el => {
    el.style.display = isStu ? '' : 'none';
  });

  const emailInput = document.getElementById('ep-email');
  if (emailInput) {
    emailInput.value = loggedInUser.email || (st ? st.email : '');
    emailInput.required = isStu;
  }

  const sidInput = document.getElementById('ep-studentId');
  if (sidInput) {
    sidInput.value = (st ? st.studentId : '') || (loggedInUser.studentId || '');
  }

  const phoneInput = document.getElementById('ep-phone');
  if (phoneInput) {
    phoneInput.value = (st ? (st.phone || '') : '') || (loggedInUser.phone || '');
  }

  const courseInput = document.getElementById('ep-course');
  if (courseInput) {
    courseInput.value = st ? (st.course || '') : '';
  }

  const yearInput = document.getElementById('ep-year');
  if (yearInput) {
    yearInput.value = st ? (st.year || 1) : 1;
  }

  openModal('editProfileModal');
}

async function submitEditProfile(e) {
  e.preventDefault();
  if (!loggedInUser) return;
  const isStu = loggedInUser.role === 'student';
  const name     = document.getElementById('ep-name').value.trim();
  const password = document.getElementById('ep-password').value;
  const email    = isStu ? document.getElementById('ep-email').value.trim() : (loggedInUser.email || '');
  const phone    = isStu ? document.getElementById('ep-phone').value.trim() : (loggedInUser.phone || '');
  const course   = isStu ? (document.getElementById('ep-course')?.value.trim() || '') : '';
  const year     = isStu ? (parseInt(document.getElementById('ep-year')?.value) || 1) : 1;

  if (!name) {
    showToast(isStu ? 'Name is required.' : 'Username is required.', 'error');
    return;
  }

  if (isStu) {
    if (!email) {
      showToast('Email address is required.', 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }
    if (phone && !/^\d{10}$/.test(phone)) {
      showToast('Phone number must contain exactly 10 digits.', 'error');
      return;
    }
  }

  if (password) {
    const passCheck = validateSecurePassword(password);
    if (!passCheck.valid) {
      showToast(passCheck.message, 'error');
      const pwdInput = document.getElementById('ep-password');
      if (pwdInput) pwdInput.classList.add('error');
      return;
    }
  }

  if (IS_SERVER_ENV) {
    try {
      const payload = {
        name,
        email: email || loggedInUser.email,
        userId: loggedInUser.id || loggedInUser.studentId
      };
      if (password) payload.password = password;
      if (isStu) {
        payload.phone = phone;
        payload.course = course;
        payload.year = year;
      }
      const res = await apiFetch('/api/profile', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res && res.user) {
        loggedInUser = { ...loggedInUser, ...res.user };
      }
    } catch (err) {
      showToast(err.message || 'Error updating profile.', 'error');
      return;
    }
  }

  loggedInUser.name = name;
  if (email) loggedInUser.email = email;
  if (password) loggedInUser.password = password;
  if (isStu && phone) loggedInUser.phone = phone;
  loggedInUser.avatar = initials(name);

  // Update in DEMO_USERS
  const uIdx = DEMO_USERS.findIndex(u => u.studentId === loggedInUser.studentId || (u.email && u.email.toLowerCase() === loggedInUser.email.toLowerCase()));
  if (uIdx !== -1) {
    DEMO_USERS[uIdx] = { ...DEMO_USERS[uIdx], ...loggedInUser };
  }

  // Update in studentsData
  if (loggedInUser.studentId) {
    const s = getStudent(loggedInUser.studentId);
    if (s) {
      s.name = name;
      if (email) s.email = email;
      if (phone) s.phone = phone;
      if (course) s.course = course;
      if (year) s.year = year;
    }
  }

  // Update UI everywhere
  const userNameEl = document.querySelector('.user-name');
  const avatarEl   = document.querySelector('.sidebar-user .user-avatar');
  if (userNameEl) userNameEl.textContent = name;
  if (avatarEl)   avatarEl.textContent   = loggedInUser.avatar;

  const topbarAvatar = document.getElementById('topbarUserAvatar');
  const topbarName   = document.getElementById('topbarUserName');
  if (topbarName)   topbarName.textContent   = name;
  if (topbarAvatar) topbarAvatar.textContent = loggedInUser.avatar;

  const headingEl = document.getElementById('overview-heading');
  if (headingEl) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    headingEl.textContent = greeting + ', ' + name.split(' ')[0] + '!';
  }

  saveData();
  closeModal('editProfileModal');
  showToast(isStu ? 'Profile updated successfully!' : 'Username and password updated successfully!', 'success');
  renderOverview();
  renderStudents();
}

// ========================
// SECTION 14b: EDIT HISTORY & AUDIT LOG UI
// ========================
async function loadAndRenderEditHistory(recordType, recordId) {
  const container = document.getElementById('editHistoryContent');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);">Loading edit history...</div>';

  let url = '/api/edit-history?';
  const params = [];
  if (recordType) params.push('record_type=' + encodeURIComponent(recordType));
  if (recordId !== undefined && recordId !== null) params.push('record_id=' + encodeURIComponent(recordId));
  if (loggedInUser) {
    params.push('user_id=' + encodeURIComponent(loggedInUser.studentId || loggedInUser.id));
    params.push('role=' + encodeURIComponent(loggedInUser.role));
  }
  url += params.join('&');

  try {
    const list = await apiFetch(url);
    editHistoryData = Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn('Could not fetch edit history from server:', err);
  }

  renderEditHistoryUI();
}

function renderEditHistoryUI() {
  const container = document.getElementById('editHistoryContent');
  if (!container) return;

  if (!editHistoryData || editHistoryData.length === 0) {
    container.innerHTML = '<div class="edit-history-empty"><div style="font-size:2rem;margin-bottom:8px;">📋</div><p>No edit history records found.</p><p style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">When authorized records are updated, authentic modification logs will appear here.</p></div>';
    return;
  }

  let html = '<table class="edit-history-table"><thead><tr>' +
    '<th>Date &amp; Time</th>' +
    '<th>Record</th>' +
    '<th>Action</th>' +
    '<th>Changed By</th>' +
    '<th>Changes / Summary</th>' +
    '</tr></thead><tbody>';

  html += editHistoryData.map(h => {
    const dt = h.createdAt || h.created_at || 'Recently';
    const action = h.actionType || h.action_type || 'UPDATE';
    const badgeCls = action === 'STATUS_CHANGE' ? 'action-status' : 
                     action === 'MARK_COLLECTED' ? 'action-collect' : 
                     action === 'ACCEPT_REQUEST' ? 'action-accept' :
                     action === 'DECLINE_REQUEST' ? 'action-decline' : 'action-update';

    return '<tr>' +
      '<td style="white-space:nowrap;color:var(--text-muted);">' + escapeHtml(dt) + '</td>' +
      '<td><strong>' + escapeHtml(h.recordName || h.record_name || 'Record') + '</strong><br><span style="font-size:0.75rem;color:var(--text-muted);">' + escapeHtml(h.recordType || h.record_type || '') + '</span></td>' +
      '<td><span class="edit-history-badge ' + badgeCls + '">' + escapeHtml(action.replace('_', ' ')) + '</span></td>' +
      '<td>' + escapeHtml(h.userName || h.user_name || 'User') + ' <span style="font-size:0.75rem;color:var(--text-muted);">(' + escapeHtml(h.userRole || h.user_role || '') + ')</span></td>' +
      '<td style="color:var(--text-main);">' + escapeHtml(h.changeSummary || h.change_summary || 'Details updated') + '</td>' +
      '</tr>';
  }).join('');

  html += '</tbody></table>';
  container.innerHTML = html;
}

function openEditHistory(recordType, recordId) {
  const titleEl = document.getElementById('editHistoryTitle');
  const subEl = document.getElementById('editHistorySubtitle');
  if (titleEl) {
    titleEl.textContent = recordType === 'profile' ? 'Profile Edit History' : 
                          recordType === 'exchange_item' ? 'Book Exchange History' : 
                          recordType === 'student' ? 'Student Record History' : 'Edit History & Audit Log';
  }
  if (subEl) {
    subEl.textContent = loggedInUser && loggedInUser.role === 'admin' 
      ? 'Viewing authentic change audit logs across the library system.'
      : 'Viewing modification history for your records.';
  }
  openModal('editHistoryModal');
  loadAndRenderEditHistory(recordType, recordId);
}

function openStudentEditHistory() {
  if (selectedStudentIdForDetail) {
    openEditHistory('student', selectedStudentIdForDetail);
  } else {
    openEditHistory('student');
  }
}

function openExchangeEditHistory(exchangeId) {
  openEditHistory('exchange_item', exchangeId);
}

// ========================
// SECTION 15: ROLE UI
// ========================
function applyRoleUI() {
  const admin = isAdmin();
  const catAddBtn = document.querySelector('#page-catalogue .page-header .btn-primary');
  if (catAddBtn) catAddBtn.style.display = admin ? '' : 'none';
  const loanAddBtn = document.querySelector('#page-loans .page-header .btn-primary');
  if (loanAddBtn) loanAddBtn.style.display = admin ? '' : 'none';
  const stuAddBtn = document.querySelector('#page-students .page-header .btn-primary');
  if (stuAddBtn) stuAddBtn.style.display = admin ? '' : 'none';

  // Direct issue button visible only to admin
  const directIssueBtn = document.getElementById('loansDirectIssueBtn');
  if (directIssueBtn) directIssueBtn.style.display = admin ? '' : 'none';

  // Requirement 1 & 7: Remove student records from left sidebar for students
  const stuNav = document.getElementById('nav-students');
  if (stuNav) {
    const stuLi = stuNav.closest('li') || stuNav;
    stuLi.style.display = admin ? '' : 'none';
  }

  // Requirement 11: Remove Book Recommendation from left sidebar completely (now on student overview)
  const recNav = document.getElementById('nav-recommendations');
  if (recNav) {
    const recLi = recNav.closest('li') || recNav;
    recLi.style.display = 'none';
  }

  // Requirement 3: Exchange listing button in page header - only students can list used books, not admin!
  const exchangeListBtn = document.getElementById('exchangeListBookBtn');
  if (exchangeListBtn) {
    exchangeListBtn.style.display = admin ? 'none' : '';
  }

  // Topbar action button
  const info = pageMap[currentPage];
  const topbarActionBtn = document.getElementById('topbarActionBtn');
  if (topbarActionBtn) {
    if (currentPage === 'exchange') {
      topbarActionBtn.style.display = !admin ? '' : 'none';
    } else {
      topbarActionBtn.style.display = (info && info.action && admin) ? '' : 'none';
    }
  }

  // Admin stats grid vs Student stats grid & sections
  const adminGrid = document.getElementById('adminStatsGrid');
  const studentGrid = document.getElementById('studentStatsGrid');
  const searchSec = document.getElementById('studentOverviewSearchSection');
  const recSec = document.getElementById('studentRecommendationsSection');

  if (adminGrid) adminGrid.style.display = admin ? '' : 'none';
  if (studentGrid) studentGrid.style.display = admin ? 'none' : '';
  if (searchSec) searchSec.style.display = admin ? 'none' : '';
  if (recSec) recSec.style.display = admin ? 'none' : '';

  // Remove Upcoming Due Dates and Recent Activity from student overview
  const ovUpcoming = document.getElementById('overviewUpcomingCard');
  const ovActivity = document.getElementById('overviewActivityCard');
  const ovGrid = document.getElementById('overviewGridContainer');
  if (ovUpcoming) ovUpcoming.style.display = admin ? '' : 'none';
  if (ovActivity) ovActivity.style.display = admin ? '' : 'none';
  if (ovGrid) ovGrid.style.display = admin ? '' : 'none';

  // Requirement 4: Top-right header profile icon removed for both Admin and Student
  const topbarChip = document.getElementById('topbarUserChip');
  if (topbarChip) {
    topbarChip.style.display = 'none';
  }

  const loansNav = document.getElementById('nav-loans');
  if (loansNav && admin) {
    const pending = issueRequests.filter(r => r.status==='pending').length;
    let badge = loansNav.querySelector('.nav-badge');
    if (!badge && pending > 0) {
      badge = document.createElement('span');
      badge.className = 'nav-badge';
      badge.id = 'issueRequestsBadge';
      loansNav.appendChild(badge);
    }
    if (badge) { badge.textContent = pending; badge.style.display = pending>0?'':'none'; }
  }
}

// ========================
// SECTION 16: INIT & BACKEND SYNC
// ========================
async function syncWithBackend() {
  if (!IS_SERVER_ENV) return;
  try {
    const data = await apiFetch('/api/all-data');
    if (data) {
      studentsData = Array.isArray(data.students) ? data.students : [];
      booksData = Array.isArray(data.books) ? data.books : [];
      loansData = Array.isArray(data.loans) ? data.loans : [];
      exchangeData = Array.isArray(data.exchange) ? data.exchange : [];
      activityLog = Array.isArray(data.activity) ? data.activity : [];
      if (data.users && data.users.length > 0) DEMO_USERS = data.users;
      issueRequests = Array.isArray(data.issueRequests) ? data.issueRequests : [];
      editHistoryData = Array.isArray(data.editHistory) ? data.editHistory : [];
      backendDatabaseType = data.db_type || 'sqlite';
      saveData();
      updateBackendBadge(backendDatabaseType);
      renderOverview();
      renderCatalogue();
      renderLoans();
      renderStudents();
    }
  } catch (err) {
    console.log('Backend sync offline/fallback, using local cache:', err);
  }
}

function init() {
  renderOverview();
  renderCatalogue();
  const topLabel = document.getElementById('topbarActionLabel');
  if (topLabel) topLabel.textContent = 'Add Book';
  syncWithBackend();
}
init();

// ========================
// AUTH SYSTEM
// ========================
function switchAuthTab(tab) {
  const loginWrap = document.getElementById('loginFormWrap');
  const regWrap   = document.getElementById('registerFormWrap');
  if (tab === 'login') {
    loginWrap.style.display = ''; regWrap.style.display = 'none';
  } else {
    loginWrap.style.display = 'none'; regWrap.style.display = '';
  }
}

function setRole(role) {
  selectedRole = role;
  document.getElementById('roleStudent').classList.toggle('active', role === 'student');
  document.getElementById('roleAdmin').classList.toggle('active',   role === 'admin');
  const switchText = document.querySelector('.auth-switch-text');
  if (switchText) switchText.style.display = role === 'admin' ? 'none' : '';
  const emailInput = document.getElementById('loginEmail');
  const passInput  = document.getElementById('loginPassword');
  if (emailInput) emailInput.value = '';
  if (passInput) passInput.value = '';
  clearLoginErrors();
}

function fillCreds(role, autoSubmit = false) {
  setRole(role);
  clearLoginErrors();
  if (autoSubmit) {
    const form = document.getElementById('loginForm');
    if (form) {
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    }
  }
}

function togglePassword(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.style.opacity = isText ? '0.5' : '1';
}

function checkPasswordRequirements(inputId, rulesPrefix) {
  const input = document.getElementById(inputId);
  if (!input) return false;
  const val = input.value || '';
  
  const rules = {
    len:   val.length >= 6,
    upper: /[A-Z]/.test(val),
    lower: /[a-z]/.test(val),
    num:   /[0-9]/.test(val),
    sym:   /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(val)
  };

  const lenEl   = document.getElementById(rulesPrefix + '-len');
  const upperEl = document.getElementById(rulesPrefix + '-upper');
  const lowerEl = document.getElementById(rulesPrefix + '-lower');
  const numEl   = document.getElementById(rulesPrefix + '-num');
  const symEl   = document.getElementById(rulesPrefix + '-sym');

  if (lenEl) {
    lenEl.classList.toggle('valid', rules.len);
    lenEl.innerHTML = (rules.len ? '&#x2713; ' : '&#x25CF; ') + 'At least 6 characters';
  }
  if (upperEl) {
    upperEl.classList.toggle('valid', rules.upper);
    upperEl.innerHTML = (rules.upper ? '&#x2713; ' : '&#x25CF; ') + 'At least 1 uppercase letter (A-Z)';
  }
  if (lowerEl) {
    lowerEl.classList.toggle('valid', rules.lower);
    lowerEl.innerHTML = (rules.lower ? '&#x2713; ' : '&#x25CF; ') + 'At least 1 lowercase letter (a-z)';
  }
  if (numEl) {
    numEl.classList.toggle('valid', rules.num);
    numEl.innerHTML = (rules.num ? '&#x2713; ' : '&#x25CF; ') + 'At least 1 number (0-9)';
  }
  if (symEl) {
    symEl.classList.toggle('valid', rules.sym);
    symEl.innerHTML = (rules.sym ? '&#x2713; ' : '&#x25CF; ') + 'At least 1 symbol / special character (!@#$%^&*...)';
  }

  return rules.len && rules.upper && rules.lower && rules.num && rules.sym;
}

function validateSecurePassword(pwd) {
  if (!pwd || pwd.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters long.' };
  }
  if (!/[A-Z]/.test(pwd)) {
    return { valid: false, message: 'Password must include at least 1 capital/uppercase letter (A-Z).' };
  }
  if (!/[a-z]/.test(pwd)) {
    return { valid: false, message: 'Password must include at least 1 small/lowercase letter (a-z).' };
  }
  if (!/[0-9]/.test(pwd)) {
    return { valid: false, message: 'Password must include at least 1 number (0-9).' };
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(pwd)) {
    return { valid: false, message: 'Password must include at least 1 symbol or special character (!@#$%^&*...).' };
  }
  return { valid: true };
}

function clearLoginErrors() {
  ['emailError','passwordError','loginError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
  });
  const em = document.getElementById('loginEmail');
  const pw = document.getElementById('loginPassword');
  if (em) em.classList.remove('error');
  if (pw) pw.classList.remove('error');
}

async function handleLogin(e) {
  e.preventDefault();
  clearLoginErrors();
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  let valid = true;
  if (!email) {
    const errEl = document.getElementById('emailError');
    if (errEl) {
      errEl.textContent = 'Please enter your email address or username.';
      errEl.classList.add('show');
    }
    document.getElementById('loginEmail').classList.add('error');
    valid = false;
  }
  if (!password || password.length < 4) {
    document.getElementById('passwordError').classList.add('show');
    document.getElementById('loginPassword').classList.add('error');
    valid = false;
  }
  if (!valid) return;
  const btn = document.getElementById('loginBtn');
  btn.classList.add('loading'); btn.disabled = true;

  if (IS_SERVER_ENV) {
    try {
      const res = await apiFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, role: selectedRole })
      });
      if (res && res.user) {
        btn.classList.remove('loading'); btn.disabled = false;
        loggedInUser = res.user;
        completeLogin(res.user);
        return;
      }
    } catch(err) {
      btn.classList.remove('loading'); btn.disabled = false;
      const errEl = document.getElementById('loginError');
      errEl.textContent = err.message || 'Invalid credentials or role.';
      errEl.classList.add('show');
      const card = document.querySelector('.login-card');
      card.style.animation = 'shake 0.4s ease';
      setTimeout(() => card.style.animation = '', 400);
      return;
    }
  }

  // Local fallback
  setTimeout(() => {
    const ident = email.toLowerCase();
    const user = DEMO_USERS.find(u => {
      const emailMatch = u.email && u.email.toLowerCase() === ident;
      const nameMatch  = u.name && u.name.toLowerCase() === ident;
      const uPrefix    = u.email ? u.email.split('@')[0].toLowerCase() : '';
      const prefixMatch = uPrefix === ident;
      const st = u.studentId ? getStudent(u.studentId) : null;
      const stuIdMatch = st && st.studentId && st.studentId.toLowerCase() === ident;
      return (emailMatch || nameMatch || prefixMatch || stuIdMatch) &&
        u.password === password &&
        u.role === selectedRole;
    });
    if (!user) {
      btn.classList.remove('loading'); btn.disabled = false;
      const errEl = document.getElementById('loginError');
      errEl.textContent = 'Invalid credentials. Check your email or username, password, and selected role.';
      errEl.classList.add('show');
      const card = document.querySelector('.login-card');
      card.style.animation = 'shake 0.4s ease';
      setTimeout(() => card.style.animation = '', 400);
      return;
    }
    if (user.role === 'student' && user.studentId) {
      const student = getStudent(user.studentId);
      if (student && student.status === 'deactivated') {
        btn.classList.remove('loading'); btn.disabled = false;
        const errEl = document.getElementById('loginError');
        errEl.textContent = 'Your student account has been deactivated by the library administrator.';
        errEl.classList.add('show');
        const card = document.querySelector('.login-card');
        card.style.animation = 'shake 0.4s ease';
        setTimeout(() => card.style.animation = '', 400);
        return;
      }
    }
    loggedInUser = user;
    completeLogin(user);
  }, 400);
}

function validateRegistrationPhone() {
  const phoneInput = document.getElementById('regPhone');
  const errorEl = document.getElementById('regPhoneError');
  if (!phoneInput || !errorEl) return false;

  const val = phoneInput.value.trim();
  if (!val) {
    errorEl.textContent = 'Please enter your contact number.';
    errorEl.classList.remove('show');
    return false;
  }

  if (!/^\d+$/.test(val)) {
    errorEl.textContent = 'Phone number must contain digits only.';
    errorEl.classList.add('show');
    return false;
  }

  if (val.length !== 10) {
    errorEl.textContent = 'Phone number must contain exactly 10 digits.';
    errorEl.classList.add('show');
    return false;
  }

  errorEl.classList.remove('show');
  return true;
}

async function handleRegister(e) {
  e.preventDefault();
  ['regNameError','regIdError','regEmailError','regPhoneError','regPassError','registerError'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
  });
  const name     = document.getElementById('regName').value.trim();
  const sid      = document.getElementById('regStudentId').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const phone    = document.getElementById('regPhone')?.value.trim() || '';
  const course   = document.getElementById('regCourse').value.trim();
  const year     = document.getElementById('regYear').value;
  const password = document.getElementById('regPassword').value;
  let valid = true;
  if (!name) { document.getElementById('regNameError').classList.add('show'); valid = false; }
  if (!sid)  { document.getElementById('regIdError').classList.add('show');   valid = false; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { document.getElementById('regEmailError').classList.add('show'); valid = false; }

  // Requirement 9: Phone number must contain exactly 10 digits
  if (!phone) {
    const el = document.getElementById('regPhoneError');
    if (el) { el.textContent = 'Please enter your contact number.'; el.classList.add('show'); }
    valid = false;
  } else if (!/^\d{10}$/.test(phone)) {
    const el = document.getElementById('regPhoneError');
    if (el) { el.textContent = 'Phone number must contain exactly 10 digits.'; el.classList.add('show'); }
    valid = false;
  }

  const passCheck = validateSecurePassword(password);
  if (!passCheck.valid) {
    const el = document.getElementById('regPassError');
    if (el) {
      el.textContent = passCheck.message;
      el.classList.add('show');
    }
    const pwdInput = document.getElementById('regPassword');
    if (pwdInput) pwdInput.classList.add('error');
    valid = false;
  }
  if (!valid) return;

  const btn = document.getElementById('registerBtn');
  btn.classList.add('loading'); btn.disabled = true;

  if (IS_SERVER_ENV) {
    try {
      const res = await apiFetch('/api/register', {
        method: 'POST',
        body: JSON.stringify({ name, studentId: sid, email, phone, course: course||'Not specified', year: parseInt(year)||1, password })
      });
      if (res && res.user) {
        btn.classList.remove('loading'); btn.disabled = false;
        loggedInUser = res.user;
        studentsData.push({ id: res.user.studentId, studentId: sid, name, email, course: course||'Not specified', year: parseInt(year)||1, phone: phone });
        DEMO_USERS.push(res.user);
        saveData();
        showToast('Account registered successfully! Welcome, ' + name + '!', 'success');
        completeLogin(res.user);
        return;
      }
    } catch(err) {
      btn.classList.remove('loading'); btn.disabled = false;
      const errEl = document.getElementById('registerError');
      errEl.textContent = err.message || 'Registration failed.';
      errEl.classList.add('show');
      return;
    }
  }

  // Local fallback
  setTimeout(() => {
    const newId = Date.now();
    studentsData.push({ id:newId, studentId:sid, name, email, course:course||'Not specified', year:parseInt(year)||1, phone });
    const avatarStr = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    DEMO_USERS.push({ email, password, role:'student', name, avatar:avatarStr, studentId:newId, phone });
    activityLog.unshift({ type:'student', text:'New student registered: <strong>'+name+'</strong> ('+sid+')', time:'Just now' });
    saveData();
    btn.classList.remove('loading'); btn.disabled = false;
    loggedInUser = DEMO_USERS[DEMO_USERS.length - 1];
    showToast('Account created! Welcome, '+name+'!', 'success');
    completeLogin(loggedInUser);
  }, 400);
}

function completeLogin(user) {
  const userNameEl = document.querySelector('.user-name');
  const userRoleEl = document.querySelector('.user-role');
  const avatarEl   = document.querySelector('.sidebar-user .user-avatar');
  if (userNameEl) userNameEl.textContent = user.name;
  if (userRoleEl) userRoleEl.textContent = user.role === 'admin' ? 'Staff \u00b7 Admin' : 'Student';
  if (avatarEl)   avatarEl.textContent   = user.avatar || initials(user.name);

  // Topbar user chip (Requirement 1: only for admin, hidden for student panel)
  const topbarAvatar = document.getElementById('topbarUserAvatar');
  const topbarName   = document.getElementById('topbarUserName');
  const topbarRole   = document.getElementById('topbarUserRole');
  const topbarChip   = document.getElementById('topbarUserChip');
  if (topbarChip)   topbarChip.style.display = user.role === 'admin' ? 'flex' : 'none';
  if (topbarName)   topbarName.textContent   = user.name;
  if (topbarRole)   topbarRole.textContent   = user.role === 'admin' ? 'Staff \u00b7 Admin' : 'Student';
  if (topbarAvatar) topbarAvatar.textContent = user.avatar || initials(user.name);

  // Ensure topbar logout button is visible
  const topbarLogout = document.getElementById('topbarLogoutBtn');
  if (topbarLogout) topbarLogout.style.display = 'inline-flex';

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const headingEl = document.getElementById('overview-heading');
  if (headingEl) headingEl.textContent = greeting + ', ' + user.name.split(' ')[0] + '!';
  const screen = document.getElementById('loginScreen');
  screen.classList.add('fade-out');
  setTimeout(() => {
    screen.style.display = 'none';
    applyRoleUI();
    navigate('overview');
  }, 500);
}

function handleLogout() {
  if (!confirm('Are you sure you want to log out of SmartLib Connect?')) return;
  loggedInUser = null;
  const screen = document.getElementById('loginScreen');
  if (screen) {
    screen.style.display = 'flex';
    screen.classList.remove('fade-out');
  }
  closeSidebar();
  const pwdInput = document.getElementById('loginPassword');
  if (pwdInput) pwdInput.value = '';
  clearLoginErrors();
  showToast('You have been logged out successfully.', 'info');
}

// Shake animation
const shakeStyle = document.createElement('style');
shakeStyle.textContent = '@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}';
document.head.appendChild(shakeStyle);

window.addEventListener('DOMContentLoaded', () => {
  const em = document.getElementById('loginEmail');
  const pw = document.getElementById('loginPassword');
  if (em) { em.value = ''; em.focus(); }
  if (pw) { pw.value = ''; }
  setTimeout(() => {
    if (em) em.value = '';
    if (pw) pw.value = '';
  }, 100);
});

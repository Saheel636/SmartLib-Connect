"""
Database connection and operations layer for SmartLib Connect.
Supports MySQL (via PyMySQL) with automatic table creation, initial data seeding,
and a seamless SQLite fallback if MySQL server is not active on the machine.
"""
import os
import sys
import sqlite3
import datetime
import uuid
import pymysql
import pymysql.cursors
import config

USE_SQLITE_FALLBACK = False
DB_TYPE = 'mysql'
SQLITE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'smartlib.db')

def get_mysql_connection(select_db=True):
    """Attempt connecting to MySQL server."""
    return pymysql.connect(
        host=config.MYSQL_HOST,
        port=config.MYSQL_PORT,
        user=config.MYSQL_USER,
        password=config.MYSQL_PASSWORD,
        database=config.MYSQL_DB if select_db else None,
        charset=config.MYSQL_CHARSET,
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
        connect_timeout=2
    )

def get_sqlite_connection():
    """Fallback connection to local SQLite database."""
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_connection():
    global USE_SQLITE_FALLBACK, DB_TYPE
    if not USE_SQLITE_FALLBACK:
        try:
            return get_mysql_connection(select_db=True)
        except Exception:
            USE_SQLITE_FALLBACK = True
            DB_TYPE = 'sqlite'
    return get_sqlite_connection()

def init_database():
    """Initializes tables and seeds starter data in MySQL (or SQLite fallback)."""
    global USE_SQLITE_FALLBACK, DB_TYPE

    # Try initializing MySQL first
    try:
        print(f"Connecting to MySQL at {config.MYSQL_HOST}:{config.MYSQL_PORT} (User: {config.MYSQL_USER})...")
        conn = get_mysql_connection(select_db=False)
        with conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS `{config.MYSQL_DB}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
            cur.execute(f"USE `{config.MYSQL_DB}`;")
            _create_tables_mysql(cur)
            _seed_data_mysql(cur)
        conn.close()
        DB_TYPE = 'mysql'
        USE_SQLITE_FALLBACK = False
        print(" Successfully connected to MySQL database: 'smartlib'")
        clear_all_sample_data()
        return
    except Exception as e:
        print(f"[MySQL Notice] Could not connect: {e}")
        print("-> Falling back to SQLite (smartlib.db) for instant local operation.")
        print("   (To connect to MySQL, start MySQL/XAMPP and restart the server)")
        DB_TYPE = 'sqlite'
        USE_SQLITE_FALLBACK = True
        conn = get_sqlite_connection()
        _create_tables_sqlite(conn)
        _seed_data_sqlite(conn)
        conn.close()
        clear_all_sample_data()
        print("[Database] SQLite database initialized successfully.")

# -------------------------------------------------------------
# MySQL Table Definitions & Seeding
# -------------------------------------------------------------
def _create_tables_mysql(cur):
    cur.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        course VARCHAR(100) NOT NULL,
        year INT NOT NULL DEFAULT 1,
        phone VARCHAR(30) DEFAULT '',
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        has_account TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)
    try:
        cur.execute("ALTER TABLE students ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active';")
    except Exception:
        pass
    try:
        cur.execute("ALTER TABLE students ADD COLUMN has_account TINYINT(1) NOT NULL DEFAULT 1;")
    except Exception:
        pass

    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(150) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('student', 'admin') NOT NULL DEFAULT 'student',
        name VARCHAR(150) NOT NULL,
        avatar VARCHAR(10) NOT NULL DEFAULT 'ST',
        student_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS books (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        author VARCHAR(255) NOT NULL,
        subject VARCHAR(100) NOT NULL,
        isbn VARCHAR(50) NOT NULL UNIQUE,
        copies INT NOT NULL DEFAULT 1,
        year INT NOT NULL DEFAULT 2024,
        description TEXT,
        image LONGTEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)
    try:
        cur.execute("ALTER TABLE books ADD COLUMN image LONGTEXT NULL;")
    except Exception:
        pass

    cur.execute("""
    CREATE TABLE IF NOT EXISTS loans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        book_id INT NOT NULL,
        issued DATE NOT NULL,
        due DATE NOT NULL,
        returned DATE NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS issue_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        book_id INT NOT NULL,
        requested_at DATE NOT NULL,
        status ENUM('pending', 'collected', 'rejected') NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS exchange_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        seller_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        author VARCHAR(255) NOT NULL,
        subject VARCHAR(100) NOT NULL,
        condition_status VARCHAR(50) NOT NULL DEFAULT 'Good',
        price INT NOT NULL DEFAULT 0,
        notes TEXT,
        status ENUM('available', 'pending', 'claimed') NOT NULL DEFAULT 'available',
        image LONGTEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)
    try:
        cur.execute("ALTER TABLE exchange_items ADD COLUMN image LONGTEXT NULL;")
    except Exception:
        pass

    cur.execute("""
    CREATE TABLE IF NOT EXISTS exchange_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        exchange_id INT NOT NULL,
        student_id INT NOT NULL,
        message TEXT,
        status ENUM('pending', 'accepted', 'declined') NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS activity_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        text TEXT NOT NULL,
        time_str VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS edit_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        record_type VARCHAR(50) NOT NULL,
        record_id INT NOT NULL,
        record_name VARCHAR(255) NOT NULL,
        user_id INT NULL,
        user_name VARCHAR(150) NOT NULL,
        user_role VARCHAR(50) NOT NULL,
        action_type VARCHAR(50) NOT NULL,
        prev_values TEXT NULL,
        new_values TEXT NULL,
        change_summary TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """)

def _seed_data_mysql(cur):
    # Ensure default administrator exists (no dummy students or books)
    cur.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'")
    if cur.fetchone()['count'] == 0:
        cur.execute("INSERT INTO users (id, email, password, role, name, avatar, student_id) VALUES (1, 'admin@college.edu', 'admin123', 'admin', 'Library Admin', 'LA', NULL)")

# -------------------------------------------------------------
# SQLite Table Definitions & Seeding (Seamless Fallback)
# -------------------------------------------------------------
def _create_tables_sqlite(conn):
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        course TEXT NOT NULL,
        year INTEGER NOT NULL DEFAULT 1,
        phone TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        has_account INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    try:
        cur.execute("ALTER TABLE students ADD COLUMN status TEXT DEFAULT 'active'")
    except Exception:
        pass
    try:
        cur.execute("ALTER TABLE students ADD COLUMN has_account INTEGER DEFAULT 1")
    except Exception:
        pass

    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'student',
        name TEXT NOT NULL,
        avatar TEXT NOT NULL DEFAULT 'ST',
        student_id INTEGER NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        subject TEXT NOT NULL,
        isbn TEXT NOT NULL UNIQUE,
        copies INTEGER NOT NULL DEFAULT 1,
        year INTEGER NOT NULL DEFAULT 2024,
        description TEXT,
        image TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    try:
        cur.execute("ALTER TABLE books ADD COLUMN image TEXT")
    except Exception:
        pass

    cur.execute("""
    CREATE TABLE IF NOT EXISTS loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        book_id INTEGER NOT NULL,
        issued TEXT NOT NULL,
        due TEXT NOT NULL,
        returned TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS issue_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        book_id INTEGER NOT NULL,
        requested_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS exchange_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seller_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        subject TEXT NOT NULL,
        condition_status TEXT NOT NULL DEFAULT 'Good',
        price INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'available',
        image TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    try:
        cur.execute("ALTER TABLE exchange_items ADD COLUMN image TEXT")
    except Exception:
        pass

    cur.execute("""
    CREATE TABLE IF NOT EXISTS exchange_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        message TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        text TEXT NOT NULL,
        time_str TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS edit_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_type TEXT NOT NULL,
        record_id INTEGER NOT NULL,
        record_name TEXT NOT NULL,
        user_id INTEGER NULL,
        user_name TEXT NOT NULL,
        user_role TEXT NOT NULL,
        action_type TEXT NOT NULL,
        prev_values TEXT NULL,
        new_values TEXT NULL,
        change_summary TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    conn.commit()

def _seed_data_sqlite(conn):
    cur = conn.cursor()
    # Ensure default administrator exists (no dummy students or books)
    cur.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'")
    row = cur.fetchone()
    if row['count'] == 0:
        cur.execute("INSERT INTO users (id, email, password, role, name, avatar, student_id) VALUES (1, 'admin@college.edu', 'admin123', 'admin', 'Library Admin', 'LA', NULL)")
    conn.commit()

def clear_all_sample_data():
    """Wipes all sample records (books, students, loans, exchange, logs) keeping only the admin user."""
    tables = ['loans', 'issue_requests', 'exchange_requests', 'exchange_items', 'activity_log', 'edit_history', 'students', 'books']
    for tbl in tables:
        try:
            _execute_query(f"DELETE FROM {tbl}", commit=True)
        except Exception:
            pass
    try:
        _execute_query("DELETE FROM users WHERE role != 'admin'", commit=True)
    except Exception:
        pass
    # Make sure default admin account exists
    admin = _execute_query("SELECT id FROM users WHERE role = 'admin'", fetch_one=True)
    if not admin:
        _execute_query("INSERT INTO users (email, password, role, name, avatar, student_id) VALUES ('admin@college.edu', 'admin123', 'admin', 'Library Admin', 'LA', NULL)", commit=True)

# -------------------------------------------------------------
# Data Access Methods
# -------------------------------------------------------------
def _execute_query(query, params=None, fetch_all=True, fetch_one=False, commit=False):
    conn = get_connection()
    try:
        # Check if pymysql or sqlite
        is_mysql = not USE_SQLITE_FALLBACK
        if not is_mysql and params:
            # Replace %s with ? for SQLite
            query = query.replace('%s', '?')

        if is_mysql:
            with conn.cursor() as cur:
                cur.execute(query, params or ())
                last_id = cur.lastrowid
                if fetch_one:
                    res = cur.fetchone()
                elif fetch_all:
                    res = cur.fetchall()
                else:
                    res = None
            conn.close()
            return (res, last_id) if commit else res
        else:
            cur = conn.cursor()
            cur.execute(query, params or ())
            last_id = cur.lastrowid
            if fetch_one:
                row = cur.fetchone()
                res = dict(row) if row else None
            elif fetch_all:
                rows = cur.fetchall()
                res = [dict(r) for r in rows]
            else:
                res = None
            if commit:
                conn.commit()
            conn.close()
            return (res, last_id) if commit else res
    except Exception as e:
        if conn:
            try: conn.close()
            except: pass
        raise e

# --- Students CRUD in MySQL ---
def get_all_students():
    return _execute_query("SELECT id, student_id AS studentId, name, email, course, year, phone, COALESCE(status, 'active') AS status, COALESCE(has_account, 1) AS hasAccount FROM students ORDER BY name ASC")

def get_student_by_id(sid):
    return _execute_query("SELECT id, student_id AS studentId, name, email, course, year, phone, COALESCE(status, 'active') AS status, COALESCE(has_account, 1) AS hasAccount FROM students WHERE id = %s", (sid,), fetch_one=True)

def get_student_by_student_id(sid_str):
    return _execute_query("SELECT id, student_id AS studentId, name, email, course, year, phone, COALESCE(status, 'active') AS status, COALESCE(has_account, 1) AS hasAccount FROM students WHERE student_id = %s", (sid_str,), fetch_one=True)

def add_student(student_id, name, email, course, year, phone="", status="active", has_account=1):
    query = """
    INSERT INTO students (student_id, name, email, course, year, phone, status, has_account)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """
    _, last_id = _execute_query(query, (student_id, name, email, course, year, phone, status, has_account), commit=True)
    return last_id

def toggle_student_status(sid, status):
    query = "UPDATE students SET status = %s WHERE id = %s"
    _execute_query(query, (status, sid), commit=True)

def update_student(sid, name, student_id, email, course, year, phone):
    query = """
    UPDATE students
    SET name = %s, student_id = %s, email = %s, course = %s, year = %s, phone = %s
    WHERE id = %s
    """
    _execute_query(query, (name, student_id, email, course, int(year), phone, sid), commit=True)
    _execute_query("UPDATE users SET name = %s, email = %s WHERE student_id = %s", (name, email, sid), commit=True)
    return True

def delete_student(sid):
    _execute_query("DELETE FROM students WHERE id = %s", (sid,), commit=True)

# --- Books CRUD ---
def get_all_books():
    return _execute_query("SELECT id, title, author, subject, isbn, copies, year, description, image FROM books ORDER BY title ASC")

def get_book_by_id(bid):
    return _execute_query("SELECT id, title, author, subject, isbn, copies, year, description, image FROM books WHERE id = %s", (bid,), fetch_one=True)

def add_book(title, author, subject, isbn, copies, year, description, image=None):
    # Ensure a non-empty, unique ISBN to satisfy NOT NULL UNIQUE constraints
    if isbn and str(isbn).strip():
        isbn_val = str(isbn).strip()
    else:
        isbn_val = f"ISBN-AUTO-{uuid.uuid4().hex[:8].upper()}"
    query = """
    INSERT INTO books (title, author, subject, isbn, copies, year, description, image)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """
    _, last_id = _execute_query(query, (title, author, subject, isbn_val, copies, year, description, image), commit=True)
    return last_id

def update_book(bid, title, author, subject, isbn, copies, year, description, image=None):
    if isbn and str(isbn).strip():
        isbn_val = str(isbn).strip()
    else:
        existing = get_book_by_id(bid)
        isbn_val = (existing['isbn'] if existing and existing.get('isbn') else f"ISBN-AUTO-{uuid.uuid4().hex[:8].upper()}")

    if image is not None:
        query = """
        UPDATE books
        SET title = %s, author = %s, subject = %s, isbn = %s, copies = %s, year = %s, description = %s, image = %s
        WHERE id = %s
        """
        _execute_query(query, (title, author, subject, isbn_val, int(copies), int(year), description, image, bid), commit=True)
    else:
        query = """
        UPDATE books
        SET title = %s, author = %s, subject = %s, isbn = %s, copies = %s, year = %s, description = %s
        WHERE id = %s
        """
        _execute_query(query, (title, author, subject, isbn_val, int(copies), int(year), description, bid), commit=True)
    return True

def delete_book(bid):
    # Check for active unreturned loans
    active = _execute_query("SELECT id FROM loans WHERE book_id = %s AND returned IS NULL", (bid,))
    if active:
        return False, "Cannot delete book: 1 or more copies are currently issued to students."
    
    # Check for existing borrowing records or issue requests (transaction history)
    loans = _execute_query("SELECT id FROM loans WHERE book_id = %s", (bid,))
    reqs = _execute_query("SELECT id FROM issue_requests WHERE book_id = %s", (bid,))
    if loans or reqs:
        return False, "Cannot delete book: this book has associated borrowing transaction history. Transaction history must be preserved."
    
    _execute_query("DELETE FROM books WHERE id = %s", (bid,), commit=True)
    return True, "Book deleted successfully."

def get_dashboard_stats():
    total_copies_row = _execute_query("SELECT COALESCE(SUM(copies), 0) AS total FROM books", fetch_one=True)
    total_copies = total_copies_row.get('total') if isinstance(total_copies_row, dict) else (total_copies_row[0] if total_copies_row else 0)
    
    borrowed_row = _execute_query("SELECT COUNT(*) AS total FROM loans WHERE returned IS NULL", fetch_one=True)
    borrowed = borrowed_row.get('total') if isinstance(borrowed_row, dict) else (borrowed_row[0] if borrowed_row else 0)
    
    available = max(0, (total_copies or 0) - (borrowed or 0))
    
    today = datetime.date.today().isoformat()
    overdue_row = _execute_query("SELECT COUNT(*) AS total FROM loans WHERE returned IS NULL AND due < %s", (today,), fetch_one=True)
    overdue = overdue_row.get('total') if isinstance(overdue_row, dict) else (overdue_row[0] if overdue_row else 0)
    
    students_row = _execute_query("SELECT COUNT(*) AS total FROM students", fetch_one=True)
    students = students_row.get('total') if isinstance(students_row, dict) else (students_row[0] if students_row else 0)
    
    exchange_row = _execute_query("SELECT COUNT(*) AS total FROM exchange_requests WHERE status = 'pending'", fetch_one=True)
    exchange = exchange_row.get('total') if isinstance(exchange_row, dict) else (exchange_row[0] if exchange_row else 0)
    
    return {
        'totalBooks': total_copies or 0,
        'availBooks': available or 0,
        'onLoan': borrowed or 0,
        'overdue': overdue or 0,
        'pendingExchange': exchange or 0,
        'students': students or 0
    }

# --- Loans CRUD ---
def get_all_loans():
    rows = _execute_query("SELECT id, student_id AS studentId, book_id AS bookId, issued, due, returned FROM loans ORDER BY due ASC")
    for r in rows:
        if isinstance(r.get('issued'), (datetime.date, datetime.datetime)):
            r['issued'] = r['issued'].isoformat()
        if isinstance(r.get('due'), (datetime.date, datetime.datetime)):
            r['due'] = r['due'].isoformat()
        if isinstance(r.get('returned'), (datetime.date, datetime.datetime)):
            r['returned'] = r['returned'].isoformat()
    return rows

def add_loan(student_id, book_id, issued, due):
    query = "INSERT INTO loans (student_id, book_id, issued, due, returned) VALUES (%s, %s, %s, %s, NULL)"
    _, last_id = _execute_query(query, (student_id, book_id, str(issued), str(due)), commit=True)
    return last_id

def mark_loan_returned(loan_id, return_date=None):
    if not return_date:
        return_date = datetime.date.today().isoformat()
    query = "UPDATE loans SET returned = %s WHERE id = %s"
    _execute_query(query, (str(return_date), loan_id), commit=True)

# --- Issue Requests ---
def get_all_issue_requests():
    rows = _execute_query("SELECT id, student_id AS studentId, book_id AS bookId, requested_at AS requestedAt, status FROM issue_requests ORDER BY id DESC")
    for r in rows:
        if isinstance(r.get('requestedAt'), (datetime.date, datetime.datetime)):
            r['requestedAt'] = r['requestedAt'].isoformat()
    return rows

def add_issue_request(student_id, book_id, req_date=None):
    if not req_date:
        req_date = datetime.date.today().isoformat()
    query = "INSERT INTO issue_requests (student_id, book_id, requested_at, status) VALUES (%s, %s, %s, 'pending')"
    _, last_id = _execute_query(query, (student_id, book_id, str(req_date)), commit=True)
    return last_id

def update_issue_request_status(req_id, status):
    query = "UPDATE issue_requests SET status = %s WHERE id = %s"
    _execute_query(query, (status, req_id), commit=True)

def delete_issue_request(req_id):
    _execute_query("DELETE FROM issue_requests WHERE id = %s", (req_id,), commit=True)

# --- Exchange & Requests ---
def get_all_exchange():
    items = _execute_query("SELECT id, seller_id AS sellerId, title, author, subject, condition_status AS condition, price, notes, status, image FROM exchange_items ORDER BY id DESC")
    requests = _execute_query("SELECT id, exchange_id, student_id AS studentId, message, status FROM exchange_requests")
    req_map = {}
    for r in requests:
        ex_id = r['exchange_id']
        if ex_id not in req_map:
            req_map[ex_id] = []
        req_map[ex_id].append({ 'studentId': r['studentId'], 'message': r['message'], 'status': r['status'] })
    for item in items:
        item['condition'] = item.get('condition') or 'Good'
        item['requests'] = req_map.get(item['id'], [])
    return items

def add_exchange_item(seller_id, title, author, subject, condition_status, price, notes, image=None):
    query = """
    INSERT INTO exchange_items (seller_id, title, author, subject, condition_status, price, notes, status, image)
    VALUES (%s, %s, %s, %s, %s, %s, %s, 'available', %s)
    """
    _, last_id = _execute_query(query, (seller_id, title, author, subject, condition_status, price, notes, image), commit=True)
    return last_id

def update_exchange_item(exchange_id, title, author, subject, condition_status, price, notes, image=None):
    if image is not None and image != '':
        query = """
        UPDATE exchange_items
        SET title = %s, author = %s, subject = %s, condition_status = %s, price = %s, notes = %s, image = %s
        WHERE id = %s
        """
        _execute_query(query, (title, author, subject, condition_status, price, notes, image, exchange_id), commit=True)
    else:
        query = """
        UPDATE exchange_items
        SET title = %s, author = %s, subject = %s, condition_status = %s, price = %s, notes = %s
        WHERE id = %s
        """
        _execute_query(query, (title, author, subject, condition_status, price, notes, exchange_id), commit=True)

def delete_exchange_item(exchange_id):
    _execute_query("DELETE FROM exchange_requests WHERE exchange_id = %s", (exchange_id,), commit=True)
    _execute_query("DELETE FROM exchange_items WHERE id = %s", (exchange_id,), commit=True)

def mark_exchange_claimed(exchange_id):
    _execute_query("UPDATE exchange_items SET status = 'claimed' WHERE id = %s", (exchange_id,), commit=True)

def mark_exchange_collected(exchange_id):
    _execute_query("UPDATE exchange_items SET status = 'claimed' WHERE id = %s", (exchange_id,), commit=True)
    _execute_query("UPDATE exchange_requests SET status = 'collected' WHERE exchange_id = %s AND status = 'accepted'", (exchange_id,), commit=True)

def add_exchange_request(exchange_id, student_id, message=""):
    query = "INSERT INTO exchange_requests (exchange_id, student_id, message, status) VALUES (%s, %s, %s, 'pending')"
    _, last_id = _execute_query(query, (exchange_id, student_id, message), commit=True)
    _execute_query("UPDATE exchange_items SET status = 'pending' WHERE id = %s AND status = 'available'", (exchange_id,), commit=True)
    return last_id

def update_exchange_request(exchange_id, student_id, status):
    query = "UPDATE exchange_requests SET status = %s WHERE exchange_id = %s AND student_id = %s"
    _execute_query(query, (status, exchange_id, student_id), commit=True)
    if status == 'accepted':
        # Requirement 5: Accepting a request must NOT remove the book from active exchange!
        # Book listing remains available for the accepted transaction and is NOT set to claimed.
        _execute_query("UPDATE exchange_items SET status = 'pending' WHERE id = %s", (exchange_id,), commit=True)
    elif status == 'declined':
        reqs = _execute_query("SELECT status FROM exchange_requests WHERE exchange_id = %s", (exchange_id,))
        if not any(r.get('status') in ('pending', 'accepted') for r in reqs):
            _execute_query("UPDATE exchange_items SET status = 'available' WHERE id = %s", (exchange_id,), commit=True)

# --- Activity Log ---
def get_all_activity():
    return _execute_query("SELECT type, text, time_str AS time FROM activity_log ORDER BY id DESC LIMIT 20")

def add_activity(atype, text, time_str="Just now"):
    query = "INSERT INTO activity_log (type, text, time_str) VALUES (%s, %s, %s)"
    _execute_query(query, (atype, text, time_str), commit=True)

# --- Users & Auth ---
def get_all_users():
    return _execute_query("SELECT id, email, password, role, name, avatar, student_id AS studentId FROM users")

def find_user_by_email(email):
    if not email:
        return None
    ident = str(email).strip()
    # 1. Match direct email
    user = _execute_query("SELECT id, email, password, role, name, avatar, student_id AS studentId FROM users WHERE LOWER(email) = LOWER(%s)", (ident,), fetch_one=True)
    if user:
        return user
    # 2. Match student ID or name
    query = """
    SELECT u.id, u.email, u.password, u.role, u.name, u.avatar, u.student_id AS studentId
    FROM users u
    LEFT JOIN students s ON u.student_id = s.id
    WHERE LOWER(u.name) = LOWER(%s) OR (s.student_id IS NOT NULL AND LOWER(s.student_id) = LOWER(%s))
    """
    user = _execute_query(query, (ident, ident), fetch_one=True)
    if user:
        return user
    # 3. Match username prefix (e.g., 'admin' from 'admin@college.edu')
    all_users = _execute_query("SELECT id, email, password, role, name, avatar, student_id AS studentId FROM users")
    ident_lower = ident.lower()
    for u in all_users:
        em = (u.get('email') or '').lower()
        if em and em.split('@')[0] == ident_lower:
            return u
    return None

def create_user(email, password, role, name, avatar, student_id=None):
    query = "INSERT INTO users (email, password, role, name, avatar, student_id) VALUES (%s, %s, %s, %s, %s, %s)"
    _, last_id = _execute_query(query, (email, password, role, name, avatar, student_id), commit=True)
    return last_id

def update_user_profile(user_id, name, email, password=None, phone=None, course=None, year=None):
    user = _execute_query("SELECT id, student_id AS studentId FROM users WHERE id = %s", (user_id,), fetch_one=True)
    if not user:
        return False
    avatar = ''.join([w[0] for w in name.split() if w])[:2].upper() or 'ST'
    if password and password.strip():
        _execute_query("UPDATE users SET name = %s, email = %s, password = %s, avatar = %s WHERE id = %s", (name, email, password.strip(), avatar, user_id), commit=True)
    else:
        _execute_query("UPDATE users SET name = %s, email = %s, avatar = %s WHERE id = %s", (name, email, avatar, user_id), commit=True)
    
    student_id = user.get('studentId')
    if student_id:
        updates = ["name = %s", "email = %s"]
        params = [name, email]
        if phone is not None:
            updates.append("phone = %s")
            params.append(phone)
        if course is not None:
            updates.append("course = %s")
            params.append(course)
        if year is not None:
            updates.append("year = %s")
            params.append(int(year))
        params.append(student_id)
        sql = f"UPDATE students SET {', '.join(updates)} WHERE id = %s"
        _execute_query(sql, tuple(params), commit=True)
    return True

def add_edit_history(record_type, record_id, record_name, user_id, user_name, user_role, action_type, prev_values="", new_values="", change_summary=""):
    query = """
    INSERT INTO edit_history (record_type, record_id, record_name, user_id, user_name, user_role, action_type, prev_values, new_values, change_summary)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    _, last_id = _execute_query(query, (record_type, record_id, record_name, user_id, user_name, user_role, action_type, str(prev_values or ''), str(new_values or ''), change_summary), commit=True)
    return last_id

def get_edit_history(record_type=None, record_id=None, user_id=None, is_admin=False):
    sql = "SELECT id, record_type AS recordType, record_id AS recordId, record_name AS recordName, user_id AS userId, user_name AS userName, user_role AS userRole, action_type AS actionType, prev_values AS prevValues, new_values AS newValues, change_summary AS changeSummary, created_at AS createdAt FROM edit_history"
    conditions = []
    params = []
    if record_type:
        conditions.append("record_type = %s")
        params.append(record_type)
    if record_id is not None:
        conditions.append("record_id = %s")
        params.append(record_id)
    if not is_admin and user_id is not None:
        conditions.append("(user_id = %s OR (record_type = 'student' AND record_id = %s))")
        params.append(user_id)
        params.append(user_id)
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY id DESC LIMIT 100"
    return _execute_query(sql, tuple(params) if params else None)

def get_real_recommendations():
    """
    Computes genuine book recommendations from actual database tables.
    - popular: based on real borrow records from loans table (sorted by borrow count DESC)
    - new: based on actual book creation / addition date (id DESC / created_at DESC)
    """
    books = get_all_books() or []
    loans = get_all_loans() or []

    borrow_counts = {}
    for l in loans:
        bid = l.get('book_id') or l.get('bookId')
        if bid:
            borrow_counts[bid] = borrow_counts.get(bid, 0) + 1

    popular_list = []
    for b in books:
        count = borrow_counts.get(b['id'], 0)
        popular_list.append({
            'id': b['id'],
            'title': b['title'],
            'author': b['author'],
            'subject': b['subject'],
            'isbn': b.get('isbn', ''),
            'copies': b.get('copies', 1),
            'image': b.get('image'),
            'tag': 'popular',
            'tagLabel': 'Popular This Month',
            'checkouts': count
        })
    popular_list.sort(key=lambda x: (x['checkouts'], x['id']), reverse=True)

    sorted_new_books = sorted(books, key=lambda x: x['id'], reverse=True)
    new_list = []
    for b in sorted_new_books:
        count = borrow_counts.get(b['id'], 0)
        new_list.append({
            'id': b['id'],
            'title': b['title'],
            'author': b['author'],
            'subject': b['subject'],
            'isbn': b.get('isbn', ''),
            'copies': b.get('copies', 1),
            'image': b.get('image'),
            'tag': 'new',
            'tagLabel': 'Recently Added',
            'checkouts': count
        })

    return {
        'popular': popular_list[:10],
        'new': new_list[:10]
    }

def get_complete_library_state():
    return {
        'db_type': DB_TYPE,
        'students': get_all_students(),
        'books': get_all_books(),
        'loans': get_all_loans(),
        'exchange': get_all_exchange(),
        'issueRequests': get_all_issue_requests(),
        'activity': get_all_activity(),
        'users': get_all_users(),
        'recommendations': get_real_recommendations(),
        'editHistory': get_edit_history(is_admin=True)
    }

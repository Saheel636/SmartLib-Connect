"""
SmartLib Connect - Flask Application Backend
Serves frontend assets, exposes REST API endpoints, and interfaces with MySQL database.
"""
import os
import re
import json
import time
import uuid
import base64
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import config
import db

def _save_uploaded_image(img_data, prefix="img"):
    if not img_data or not isinstance(img_data, str):
        return img_data
    if img_data.startswith('data:image/'):
        try:
            header, encoded = img_data.split(',', 1)
            ext = None
            if 'jpeg' in header or 'jpg' in header:
                ext = 'jpg'
            elif 'webp' in header:
                ext = 'webp'
            elif 'png' in header:
                ext = 'png'
            elif 'gif' in header:
                ext = 'gif'
            else:
                return None  # Reject unsupported image type
            upload_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
            os.makedirs(upload_dir, exist_ok=True)
            filename = f"{prefix}_{int(time.time())}_{uuid.uuid4().hex[:6]}.{ext}"
            filepath = os.path.join(upload_dir, filename)
            with open(filepath, 'wb') as f:
                f.write(base64.b64decode(encoded))
            return f"uploads/{filename}"
        except Exception as e:
            print(f"Error saving image: {e}")
            return None
    return img_data

app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = config.SECRET_KEY
CORS(app)

@app.route('/uploads/<path:filename>')
def serve_uploads(filename):
    upload_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
    return send_from_directory(upload_dir, filename)

# Initialize Database on launch
with app.app_context():
    db.init_database()

# -------------------------------------------------------------
# Static Frontend Serving
# -------------------------------------------------------------
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), path)):
        return send_from_directory('.', path)
    return send_from_directory('.', 'index.html')

# -------------------------------------------------------------
# System & Health
# -------------------------------------------------------------
@app.route('/api/status', methods=['GET'])
def api_status():
    return jsonify({
        'status': 'online',
        'database_type': db.DB_TYPE,
        'mysql_configured': {
            'host': config.MYSQL_HOST,
            'port': config.MYSQL_PORT,
            'user': config.MYSQL_USER,
            'database': config.MYSQL_DB
        }
    })

@app.route('/api/all-data', methods=['GET'])
def api_all_data():
    """Provides initial hydrated state for frontend cache and tables."""
    try:
        data = db.get_complete_library_state()
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# -------------------------------------------------------------
# Student Management APIs (MySQL Stored)
# -------------------------------------------------------------
@app.route('/api/students', methods=['GET'])
def api_get_students():
    try:
        students = db.get_all_students()
        return jsonify(students)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/students', methods=['POST'])
def api_add_student():
    """Store new student record in MySQL/SQLite."""
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    student_id = (data.get('studentId') or data.get('student_id') or '').strip()
    email = (data.get('email') or '').strip()
    course = (data.get('course') or '').strip()
    year = int(data.get('year') or 1)
    phone = (data.get('phone') or '').strip()
    status = data.get('status') or 'active'
    has_account = 0 if (data.get('hasAccount') is False or data.get('has_account') == 0) else 1

    if not phone or not re.match(r'^\d{10}$', phone):
        return jsonify({'error': 'Contact number must contain exactly 10 digits.'}), 400

    # For students without website accounts, generate email/course if omitted
    if not email and has_account == 0:
        email = f"{student_id.lower()}@offline.library.local"
    if not course:
        course = 'General'

    if not name or not student_id or not email:
        return jsonify({'error': 'Name and Student ID are required'}), 400

    existing = db.get_student_by_student_id(student_id)
    if existing:
        return jsonify({'error': f'Student ID {student_id} already exists'}), 400

    try:
        new_id = db.add_student(student_id, name, email, course, year, phone, status, has_account)
        db.add_activity('student', f'New student registered: <strong>{name}</strong> ({student_id})')
        return jsonify({
            'success': True,
            'id': new_id,
            'student': {
                'id': new_id,
                'studentId': student_id,
                'name': name,
                'email': email,
                'course': course,
                'year': year,
                'phone': phone,
                'status': status,
                'hasAccount': bool(has_account)
            }
        }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/students/<int:sid>/status', methods=['POST'])
def api_toggle_student_status(sid):
    data = request.get_json() or {}
    new_status = data.get('status') or 'deactivated'
    if new_status not in ('active', 'deactivated'):
        return jsonify({'error': 'Invalid status'}), 400
    try:
        st = db.get_student_by_id(sid)
        old_status = st.get('status') if st else 'active'
        db.toggle_student_status(sid, new_status)
        st_name = st['name'] if st else f'Student #{sid}'
        action_text = 'deactivated' if new_status == 'deactivated' else 'reactivated'
        db.add_activity('student', f'Student account {action_text}: <strong>{st_name}</strong>')
        db.add_edit_history('student', sid, st_name, 0, 'Administrator', 'admin', 'STATUS_CHANGE', old_status, new_status, f"Status changed from {old_status} to {new_status}")
        return jsonify({'success': True, 'status': new_status})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/students/<int:sid>', methods=['GET'])
def api_get_student_detail(sid):
    student = db.get_student_by_id(sid)
    if not student:
        return jsonify({'error': 'Student not found'}), 404
    return jsonify(student)

@app.route('/api/students/<int:sid>', methods=['PUT', 'POST'])
def api_edit_student(sid):
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    student_id = (data.get('studentId') or data.get('student_id') or '').strip()
    email = (data.get('email') or '').strip()
    course = (data.get('course') or '').strip()
    year = int(data.get('year') or 1)
    phone = (data.get('phone') or '').strip()

    if not phone or not re.match(r'^\d{10}$', phone):
        return jsonify({'error': 'Contact number must contain exactly 10 digits.'}), 400

    if not name or not student_id or not email:
        return jsonify({'error': 'Name, Student ID, and Email are required'}), 400

    # Ensure student_id does not collide with another student
    other = db.get_student_by_student_id(student_id)
    if other and other['id'] != sid:
        return jsonify({'error': f'Student ID {student_id} is already in use by another student.'}), 400

    try:
        db.update_student(sid, name, student_id, email, course, year, phone)
        db.add_activity('student', f'Student details updated: <strong>{name}</strong> ({student_id})')
        db.add_edit_history('student', sid, name, 0, 'Administrator', 'admin', 'UPDATE', '', '', f'Updated student record: {name} ({student_id})')
        return jsonify({'success': True, 'student': {'id': sid, 'studentId': student_id, 'name': name, 'email': email, 'course': course, 'year': year, 'phone': phone}})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/students/<int:sid>', methods=['DELETE'])
def api_delete_student(sid):
    try:
        db.delete_student(sid)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# -------------------------------------------------------------
# Book Catalogue APIs
# -------------------------------------------------------------
@app.route('/api/books', methods=['GET'])
def api_get_books():
    try:
        books = db.get_all_books()
        return jsonify(books)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/books', methods=['POST'])
def api_add_book():
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    author = (data.get('author') or '').strip()
    subject = (data.get('subject') or '').strip()
    isbn = (data.get('isbn') or '').strip()
    copies = int(data.get('copies') or 1)
    year = int(data.get('year') or 2024)
    description = (data.get('description') or '').strip()
    image = _save_uploaded_image(data.get('image') or None, 'book')

    if not title or not author or not subject:
        return jsonify({'error': 'Title, Author, and Subject are required'}), 400

    try:
        new_id = db.add_book(title, author, subject, isbn, copies, year, description, image=image)
        db.add_activity('catalogue', f'New book added: <em>{title}</em> by {author}')
        db.add_edit_history('book', new_id, title, 0, 'Administrator', 'admin', 'CREATE', '', '', f'Added new book: {title}')
        return jsonify({'success': True, 'id': new_id, 'image': image}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/books/<int:bid>', methods=['PUT', 'POST'])
def api_edit_book(bid):
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    author = (data.get('author') or '').strip()
    subject = (data.get('subject') or '').strip()
    isbn = (data.get('isbn') or '').strip()
    copies = int(data.get('copies') or 1)
    year = int(data.get('year') or 2024)
    description = (data.get('description') or '').strip()

    if not title or not author or not subject:
        return jsonify({'error': 'Title, Author, and Subject are required'}), 400

    old_book = db.get_book_by_id(bid)
    if not old_book:
        return jsonify({'error': 'Book not found'}), 404

    # Handle image: if replacement data provided, save. If unchanged, retain existing photo.
    new_img_data = data.get('image')
    if new_img_data and isinstance(new_img_data, str) and new_img_data.startswith('data:image/'):
        image = _save_uploaded_image(new_img_data, 'book')
    elif new_img_data is not None:
        image = new_img_data
    else:
        image = old_book.get('image')

    try:
        db.update_book(bid, title, author, subject, isbn, copies, year, description, image=image)
        db.add_activity('catalogue', f'Book details updated: <em>{title}</em>')
        db.add_edit_history('book', bid, title, 0, 'Administrator', 'admin', 'UPDATE', '', '', f'Updated book details: {title} ({copies} copies)')
        return jsonify({
            'success': True,
            'id': bid,
            'image': image,
            'book': {
                'id': bid,
                'title': title,
                'author': author,
                'subject': subject,
                'isbn': isbn,
                'copies': copies,
                'year': year,
                'description': description,
                'image': image
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/books/<int:bid>', methods=['DELETE'])
def api_delete_book(bid):
    old_book = db.get_book_by_id(bid)
    if not old_book:
        return jsonify({'error': 'Book not found'}), 404

    try:
        ok, msg = db.delete_book(bid)
        if not ok:
            return jsonify({'error': msg}), 400

        db.add_activity('catalogue', f'Book removed from catalogue: <em>{old_book["title"]}</em>')
        db.add_edit_history('book', bid, old_book['title'], 0, 'Administrator', 'admin', 'DELETE', '', '', f'Deleted book from catalogue: {old_book["title"]}')
        return jsonify({'success': True, 'message': msg})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# -------------------------------------------------------------
# Loans & Returns APIs
# -------------------------------------------------------------
@app.route('/api/loans', methods=['GET'])
def api_get_loans():
    try:
        loans = db.get_all_loans()
        return jsonify(loans)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/loans', methods=['POST'])
def api_issue_loan():
    data = request.get_json() or {}
    student_id = int(data.get('studentId') or 0)
    book_id = int(data.get('bookId') or 0)
    issued = data.get('issued')
    due = data.get('due')

    if not student_id or not book_id or not issued or not due:
        return jsonify({'error': 'studentId, bookId, issued, and due dates are required'}), 400

    try:
        new_id = db.add_loan(student_id, book_id, issued, due)
        st = db.get_student_by_id(student_id)
        bk = db.get_book_by_id(book_id)
        st_name = st['name'] if st else 'Student'
        bk_title = bk['title'] if bk else 'Book'
        db.add_activity('issue', f'Book issued to <strong>{st_name}</strong>: <em>{bk_title}</em>')
        return jsonify({'success': True, 'id': new_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/loans/<int:lid>/return', methods=['POST'])
def api_return_loan(lid):
    try:
        db.mark_loan_returned(lid)
        loans = db.get_all_loans()
        loan = next((l for l in loans if l['id'] == lid), None)
        if loan:
            st = db.get_student_by_id(loan['studentId'])
            bk = db.get_book_by_id(loan['bookId'])
            st_name = st['name'] if st else 'Student'
            bk_title = bk['title'] if bk else 'Book'
            db.add_activity('return', f'<strong>{st_name}</strong> returned <em>{bk_title}</em>')
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# -------------------------------------------------------------
# Book Issue Requests (Student requests -> Admin approves)
# -------------------------------------------------------------
@app.route('/api/issue-requests', methods=['GET'])
def api_get_issue_requests():
    try:
        requests = db.get_all_issue_requests()
        return jsonify(requests)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/issue-requests', methods=['POST'])
def api_create_issue_request():
    data = request.get_json() or {}
    student_id = int(data.get('studentId') or 0)
    book_id = int(data.get('bookId') or 0)
    if not student_id or not book_id:
        return jsonify({'error': 'studentId and bookId are required'}), 400

    try:
        new_id = db.add_issue_request(student_id, book_id)
        st = db.get_student_by_id(student_id)
        bk = db.get_book_by_id(book_id)
        st_name = st['name'] if st else 'Student'
        bk_title = bk['title'] if bk else 'Book'
        db.add_activity('issue', f'<strong>{st_name}</strong> submitted request for <em>{bk_title}</em>')
        return jsonify({'success': True, 'id': new_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/issue-requests/<int:rid>/collected', methods=['POST'])
def api_mark_request_collected(rid):
    try:
        all_reqs = db.get_all_issue_requests()
        req_item = next((r for r in all_reqs if r['id'] == rid), None)
        if not req_item:
            return jsonify({'error': 'Request not found'}), 404

        db.update_issue_request_status(rid, 'collected')
        import datetime
        today = datetime.date.today()
        due = today + datetime.timedelta(days=14)
        loan_id = db.add_loan(req_item['studentId'], req_item['bookId'], today.isoformat(), due.isoformat())

        st = db.get_student_by_id(req_item['studentId'])
        bk = db.get_book_by_id(req_item['bookId'])
        st_name = st['name'] if st else 'Student'
        bk_title = bk['title'] if bk else 'Book'
        db.add_activity('issue', f'<strong>{st_name}</strong> collected book: <em>{bk_title}</em>')

        return jsonify({'success': True, 'loanId': loan_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/issue-requests/<int:rid>/reject', methods=['POST'])
def api_reject_request(rid):
    try:
        db.update_issue_request_status(rid, 'rejected')
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/issue-requests/<int:rid>', methods=['DELETE'])
@app.route('/api/issue-requests/<int:rid>/cancel', methods=['POST', 'DELETE'])
def api_cancel_issue_request(rid):
    try:
        reqs = db.get_all_issue_requests()
        req_item = next((r for r in reqs if r['id'] == rid), None)
        db.delete_issue_request(rid)
        if req_item:
            st = db.get_student_by_id(req_item['studentId'])
            bk = db.get_book_by_id(req_item['bookId'])
            st_name = st['name'] if st else 'Student'
            bk_title = bk['title'] if bk else 'Book'
            db.add_activity('issue', f'<strong>{st_name}</strong> cancelled request for <em>{bk_title}</em>')
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# -------------------------------------------------------------
# Exchange APIs
# -------------------------------------------------------------
@app.route('/api/exchange', methods=['GET'])
def api_get_exchange():
    try:
        return jsonify(db.get_all_exchange())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/exchange', methods=['POST'])
def api_add_exchange():
    data = request.get_json() or {}
    seller_id = int(data.get('sellerId') or 0)
    title = (data.get('title') or '').strip()
    author = (data.get('author') or '').strip()
    subject = (data.get('subject') or '').strip()
    condition = data.get('condition') or 'Good'
    price = int(data.get('price') or 0)
    notes = (data.get('notes') or '').strip()
    image = _save_uploaded_image(data.get('image') or None, 'ex')

    if not seller_id or not title:
        return jsonify({'error': 'sellerId and title required'}), 400

    try:
        new_id = db.add_exchange_item(seller_id, title, author, subject, condition, price, notes, image=image)
        st = db.get_student_by_id(seller_id)
        st_name = st['name'] if st else 'Student'
        db.add_activity('exchange', f'<strong>{st_name}</strong> listed a book: <em>{title}</em>')
        return jsonify({'success': True, 'id': new_id, 'image': image}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/exchange/<int:eid>', methods=['PUT', 'POST'])
@app.route('/api/exchange/<int:eid>/edit', methods=['POST', 'PUT'])
def api_edit_exchange(eid):
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    author = (data.get('author') or '').strip()
    subject = (data.get('subject') or '').strip()
    condition = data.get('condition') or 'Good'
    price = int(data.get('price') or 0)
    notes = (data.get('notes') or '').strip()
    image = _save_uploaded_image(data.get('image') or None, 'ex')
    user_id = data.get('userId') or data.get('studentId')
    user_name = data.get('userName') or 'Seller'

    if not title:
        return jsonify({'error': 'Title is required'}), 400

    exchanges = db.get_all_exchange()
    old_item = next((x for x in exchanges if x['id'] == eid), None)

    try:
        db.update_exchange_item(eid, title, author, subject, condition, price, notes, image=image)
        if old_item:
            diffs = []
            if old_item.get('title') != title: diffs.append(f"Title: {old_item.get('title')} -> {title}")
            if old_item.get('author') != author: diffs.append(f"Author: {old_item.get('author')} -> {author}")
            if old_item.get('subject') != subject: diffs.append(f"Subject: {old_item.get('subject')} -> {subject}")
            if old_item.get('condition') != condition: diffs.append(f"Condition: {old_item.get('condition')} -> {condition}")
            if old_item.get('price') != price: diffs.append(f"Price: Rs {old_item.get('price')} -> Rs {price}")
            if notes and notes != old_item.get('notes'): diffs.append("Notes updated")
            if image and image != old_item.get('image'): diffs.append("Photo updated")
            summary = "; ".join(diffs) if diffs else "Listing details updated"
            db.add_edit_history('exchange_item', eid, title, user_id or old_item['sellerId'], user_name, 'student', 'UPDATE', json.dumps(old_item), json.dumps(data), summary)
        return jsonify({'success': True, 'image': image})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/exchange/<int:eid>', methods=['DELETE'])
@app.route('/api/exchange/<int:eid>/delete', methods=['POST', 'DELETE'])
def api_delete_exchange(eid):
    try:
        db.delete_exchange_item(eid)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/exchange/<int:eid>/claim', methods=['POST'])
@app.route('/api/exchange/<int:eid>/collected', methods=['POST'])
def api_mark_exchange_collected(eid):
    data = request.get_json() or {}
    user_id = data.get('userId') or data.get('studentId')
    role = data.get('role', 'student')
    if role == 'admin':
        return jsonify({'error': 'Administrator cannot perform student exchange actions'}), 403

    exchanges = db.get_all_exchange()
    listing = next((x for x in exchanges if x['id'] == eid), None)
    if not listing:
        return jsonify({'error': 'Listing not found'}), 404

    if user_id and int(user_id) != listing['sellerId']:
        return jsonify({'error': 'Only the student who listed this book can mark it as collected'}), 403

    try:
        db.mark_exchange_collected(eid)
        title = listing['title']
        db.add_activity('exchange', f'Exchange completed & collected: <em>{title}</em>')
        db.add_edit_history('exchange_item', eid, title, listing['sellerId'], 'Listing Owner', 'student', 'MARK_COLLECTED', 'accepted', 'collected', f"Book marked as collected and removed from active exchange")
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/exchange/<int:eid>/request', methods=['POST'])
def api_request_exchange(eid):
    data = request.get_json() or {}
    student_id = int(data.get('studentId') or 0)
    message = (data.get('message') or '').strip()
    if not student_id:
        return jsonify({'error': 'studentId required'}), 400

    try:
        req_id = db.add_exchange_request(eid, student_id, message)
        st = db.get_student_by_id(student_id)
        st_name = st['name'] if st else 'Student'
        db.add_activity('exchange', f'<strong>{st_name}</strong> requested a book on the Exchange')
        return jsonify({'success': True, 'id': req_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/exchange/<int:eid>/respond', methods=['POST'])
def api_respond_exchange_request(eid):
    data = request.get_json() or {}
    student_id = int(data.get('studentId') or 0)
    response_status = data.get('status') or 'accepted'  # 'accepted' or 'declined'
    actor_id = data.get('actorId') or data.get('userId')
    actor_role = data.get('actorRole') or data.get('role', 'student')

    if actor_role == 'admin':
        return jsonify({'error': 'Administrator cannot accept or decline student exchange requests'}), 403

    if not student_id:
        return jsonify({'error': 'studentId required'}), 400

    exchanges = db.get_all_exchange()
    listing = next((x for x in exchanges if x['id'] == eid), None)
    if not listing:
        return jsonify({'error': 'Listing not found'}), 404

    if actor_id and int(actor_id) != listing['sellerId']:
        return jsonify({'error': 'Only the student who listed this book can accept or decline requests'}), 403

    try:
        db.update_exchange_request(eid, student_id, response_status)
        st = db.get_student_by_id(student_id)
        st_name = st['name'] if st else 'Student'
        bk_title = listing['title'] if listing else 'Exchange item'
        if response_status == 'accepted':
            db.add_activity('exchange', f'Exchange accepted: <strong>{st_name}</strong> gets <em>{bk_title}</em>')
            db.add_edit_history('exchange_item', eid, bk_title, listing['sellerId'], 'Listing Owner', 'student', 'ACCEPT_REQUEST', 'pending', 'accepted', f"Accepted exchange request from {st_name}")
        else:
            db.add_activity('exchange', f'Exchange declined for <strong>{st_name}</strong>: <em>{bk_title}</em>')
            db.add_edit_history('exchange_item', eid, bk_title, listing['sellerId'], 'Listing Owner', 'student', 'DECLINE_REQUEST', 'pending', 'declined', f"Declined exchange request from {st_name}")
        return jsonify({'success': True, 'status': response_status})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# -------------------------------------------------------------
# Authentication (Login & Register)
# -------------------------------------------------------------
@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json() or {}
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''
    role = data.get('role') or 'student'

    user = db.find_user_by_email(email)
    if not user or user.get('password') != password or user.get('role') != role:
        return jsonify({'error': 'Invalid credentials or role'}), 401

    if user.get('role') == 'student' and user.get('studentId'):
        st = db.get_student_by_id(user['studentId'])
        if st and st.get('status') == 'deactivated':
            return jsonify({'error': 'This student account has been deactivated. Please contact the administrator.'}), 403

    return jsonify({
        'success': True,
        'user': {
            'id': user['id'],
            'email': user['email'],
            'name': user['name'],
            'role': user['role'],
            'avatar': user['avatar'],
            'studentId': user['studentId']
        }
    })

@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    student_id = (data.get('studentId') or '').strip()
    email = (data.get('email') or '').strip()
    course = (data.get('course') or 'Not specified').strip()
    year = int(data.get('year') or 1)
    password = data.get('password') or ''
    phone = (data.get('phone') or '').strip()

    if not name or not student_id or not email or not password:
        return jsonify({'error': 'Please fill in all required fields'}), 400

    # Secure Password validation
    if len(password) < 6 or not re.search(r'[A-Z]', password) or not re.search(r'[a-z]', password) or not re.search(r'\d', password) or not re.search(r'[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?~`]', password):
        return jsonify({'error': 'Password must contain at least 6 characters, including at least 1 capital letter, 1 small letter, 1 number, and 1 special character.'}), 400

    # Phone validation: Exactly 10 digits
    if not re.match(r'^\d{10}$', phone):
        return jsonify({'error': 'Phone number must contain exactly 10 digits.'}), 400

    existing_stu = db.get_student_by_student_id(student_id)
    if existing_stu:
        return jsonify({'error': 'A student with this ID already exists.'}), 400

    existing_user = db.find_user_by_email(email)
    if existing_user:
        return jsonify({'error': 'An account with this email already exists.'}), 400

    try:
        new_stu_id = db.add_student(student_id, name, email, course, year, phone)
        avatar = ''.join([w[0] for w in name.split() if w])[:2].upper() or 'ST'
        user_id = db.create_user(email, password, 'student', name, avatar, new_stu_id)
        db.add_activity('student', f'New student registered: <strong>{name}</strong> ({student_id})')

        return jsonify({
            'success': True,
            'user': {
                'id': user_id,
                'email': email,
                'name': name,
                'role': 'student',
                'avatar': avatar,
                'studentId': new_stu_id,
                'phone': phone
            }
        }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/profile', methods=['POST', 'PUT'])
def api_update_profile():
    data = request.get_json() or {}
    user_id = int(data.get('userId') or data.get('id') or 0)
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    password = data.get('password')
    phone = data.get('phone')
    course = data.get('course')
    year = data.get('year')

    if not email and user_id:
        old_u = next((u for u in db.get_all_users() if u['id'] == user_id), None)
        if old_u:
            email = old_u.get('email', '')

    if not user_id or not name or not email:
        return jsonify({'error': 'User ID, name, and email are required'}), 400

    if phone is not None:
        phone = phone.strip()
        if phone and not re.match(r'^\d{10}$', phone):
            return jsonify({'error': 'Phone number must contain exactly 10 digits.'}), 400

    if password:
        if len(password) < 6 or not re.search(r'[A-Z]', password) or not re.search(r'[a-z]', password) or not re.search(r'\d', password) or not re.search(r'[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?~`]', password):
            return jsonify({'error': 'Password must contain at least 6 characters, including at least 1 capital letter, 1 small letter, 1 number, and 1 special character.'}), 400

    try:
        old_user = next((u for u in db.get_all_users() if u['id'] == user_id), None)
        old_st = db.get_student_by_id(old_user['studentId']) if (old_user and old_user.get('studentId')) else None

        ok = db.update_user_profile(user_id, name, email, password=password, phone=phone, course=course, year=year)
        if not ok:
            return jsonify({'error': 'User not found'}), 404
        user = next((u for u in db.get_all_users() if u['id'] == user_id), None)
        st = db.get_student_by_id(user['studentId']) if (user and user.get('studentId')) else None

        # Record diff in edit history
        diffs = []
        if old_user and old_user.get('name') != name: diffs.append(f"Name: {old_user.get('name')} -> {name}")
        if old_user and old_user.get('email') != email: diffs.append(f"Email: {old_user.get('email')} -> {email}")
        if old_st and phone and old_st.get('phone') != phone: diffs.append(f"Phone: {old_st.get('phone')} -> {phone}")
        if old_st and course and old_st.get('course') != course: diffs.append(f"Course: {old_st.get('course')} -> {course}")
        if old_st and year and old_st.get('year') != int(year): diffs.append(f"Year: {old_st.get('year')} -> {year}")
        if password and password.strip(): diffs.append("Password changed")
        summary = "; ".join(diffs) if diffs else "Profile details updated"
        db.add_edit_history('profile', user_id, name, user_id, name, user['role'], 'UPDATE', json.dumps(old_user), json.dumps(data), summary)

        db.add_activity('student', f'Profile updated for: <strong>{name}</strong>')
        return jsonify({
            'success': True,
            'user': {
                'id': user['id'],
                'email': user['email'],
                'name': user['name'],
                'role': user['role'],
                'avatar': user['avatar'],
                'studentId': user['studentId'],
                'phone': st['phone'] if st else '',
                'course': st['course'] if st else '',
                'year': st['year'] if st else 1
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/recommendations', methods=['GET'])
def api_get_recommendations():
    try:
        recs = db.get_real_recommendations()
        return jsonify(recs)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/edit-history', methods=['GET'])
def api_get_edit_history():
    try:
        record_type = request.args.get('record_type') or request.args.get('recordType')
        record_id = request.args.get('record_id') or request.args.get('recordId')
        if record_id:
            record_id = int(record_id)
        user_id = request.args.get('user_id') or request.args.get('userId')
        if user_id:
            user_id = int(user_id)
        role = request.args.get('role', 'student')
        is_admin = (role == 'admin')

        history = db.get_edit_history(record_type=record_type, record_id=record_id, user_id=user_id, is_admin=is_admin)
        return jsonify(history or [])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/stats', methods=['GET'])
def api_get_dashboard_stats():
    try:
        stats = db.get_dashboard_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# -------------------------------------------------------------
# Main Entry Point
# -------------------------------------------------------------
if __name__ == '__main__':
    print(f"\n=======================================================")
    print(f"  SmartLib Connect Flask Server Starting...")
    print(f"  URL: http://localhost:{config.PORT}")
    print(f"  Database Engine: {db.DB_TYPE.upper()}")
    print(f"=======================================================\n")
    app.run(host='0.0.0.0', port=config.PORT, debug=config.DEBUG)

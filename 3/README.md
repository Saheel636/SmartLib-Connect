# SmartLib Connect - Flask + MySQL Backend

A modern, role-based Library Management & Book Exchange System powered by **Python Flask** and **MySQL Database**.

---

## 🚀 Quick Start

### 1. Launch with One Click
Double-click **`run.bat`** in this folder, or open PowerShell/Terminal in this directory and run:
```powershell
& "C:\Users\HP\anaconda3\python.exe" app.py
```
Then open your browser to **http://localhost:5000**

---

## 🗄️ MySQL Database Setup & Configuration

### Default Configuration (`config.py`)
| Parameter | Default Value | Notes |
|---|---|---|
| **Host** | `localhost` | Local MySQL server / XAMPP / WampServer |
| **Port** | `3306` | Standard MySQL port |
| **User** | `root` | Default MySQL root user |
| **Password** | `""` (empty) | Standard default for local XAMPP/WAMP |
| **Database** | `smartlib` | Automatically created on startup |

### Changing Credentials
To change your MySQL user, password, or port, edit **`config.py`** or set environment variables:
```powershell
$env:MYSQL_USER = "root"
$env:MYSQL_PASSWORD = "your_mysql_password"
$env:MYSQL_HOST = "localhost"
$env:MYSQL_PORT = "3306"
```

### Automatic Table Creation & Fallback
1. When you run `app.py`, it automatically connects to MySQL, creates the database `smartlib` if it does not exist, creates all tables, and seeds default student and book records.
2. If MySQL is not running on your machine, it automatically uses SQLite (`smartlib.db`) as a seamless fallback so you can continue testing immediately. Start MySQL (e.g. from XAMPP or MySQL Service) and restart Flask to switch to MySQL.
3. You can also import **`schema.sql`** directly into **phpMyAdmin** or **MySQL Workbench**.

---

## 👥 Student Data Storage in MySQL

Student records are stored in the `students` table in MySQL:

| Column | Type | Description |
|---|---|---|
| `id` | `INT AUTO_INCREMENT` | Unique student record primary key |
| `student_id` | `VARCHAR(50) UNIQUE` | College ID (e.g., `STU2024001`) |
| `name` | `VARCHAR(150)` | Full Name of the student |
| `email` | `VARCHAR(150) UNIQUE` | College Email address |
| `course` | `VARCHAR(100)` | Degree / Department (e.g., `B.Tech CSE`) |
| `year` | `INT` | Current Year of Study (1 to 4) |
| `phone` | `VARCHAR(30)` | Contact phone number |
| `created_at` | `TIMESTAMP` | Registration timestamp |

---

## 🔑 Default Login Credentials

### Administrator
- **Email:** `admin@college.edu`
- **Password:** `admin123`
- **Role:** Staff / Admin
- **Capabilities:** Add books, add students, issue books, record returns, review student book requests, view all student records & active loans.

### Student
- **Email:** `student@college.edu`
- **Password:** `student123`
- **Role:** Student (`Priya Nair` - `STU2024001`)
- **Capabilities:** Browse catalogue, submit book issue requests to admin (turns grayed out with "Requested" status until admin marks collected), list used books on Exchange (Year 3/4), request exchange books.

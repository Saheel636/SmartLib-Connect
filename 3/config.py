"""
Configuration for SmartLib Connect Flask Backend & MySQL Database
"""
import os

# MySQL Database Configuration
# You can set these environment variables or edit the default values below:
MYSQL_HOST     = os.environ.get('MYSQL_HOST', 'localhost')
MYSQL_PORT     = int(os.environ.get('MYSQL_PORT', 3306))
MYSQL_USER     = os.environ.get('MYSQL_USER', 'root')
MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD', '')     # Default for XAMPP / local MySQL
MYSQL_DB       = os.environ.get('MYSQL_DB', 'smartlib')
MYSQL_CHARSET  = 'utf8mb4'

# Flask Settings
SECRET_KEY     = os.environ.get('SECRET_KEY', 'smartlib-super-secret-key-2026')
DEBUG          = os.environ.get('FLASK_DEBUG', 'True').lower() in ('true', '1', 'yes')
PORT           = int(os.environ.get('PORT', 5000))

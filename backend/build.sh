#!/usr/bin/env bash
# Exit immediately on error
set -o errexit

# Install production dependencies
pip install -r requirements.txt

# Collect static files into STATIC_ROOT
python manage.py collectstatic --noinput

# Run database migrations
python manage.py migrate

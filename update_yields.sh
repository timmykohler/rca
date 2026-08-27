#!/usr/bin/env bash
# /opt/rca-tool/update_yields.sh
# Fetches current TIPS yields from FRED and restarts the RCA Tool service.
# Scheduled via cron to run on the 1st of each month at 6 AM.
#
# Install:
#   sudo chmod +x /opt/rca-tool/update_yields.sh
#   sudo crontab -e
#   Add: 0 6 1 * * /opt/rca-tool/update_yields.sh >> /var/log/rca-yields.log 2>&1

set -e

LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"
BACKEND="/opt/rca-tool/backend"
ENV_FILE="/etc/rca-tool/env"
LOGFILE="/var/log/rca-yields.log"

echo "$LOG_PREFIX Starting TIPS yield curve update..."

# Load the API key from the env file
if [ -f "$ENV_FILE" ]; then
    export $(grep -v '^#' "$ENV_FILE" | xargs)
else
    echo "$LOG_PREFIX ERROR: env file not found at $ENV_FILE"
    exit 1
fi

if [ -z "$FRED_API_KEY" ]; then
    echo "$LOG_PREFIX ERROR: FRED_API_KEY not set in $ENV_FILE"
    exit 1
fi

# Activate the virtual environment and run the updater
source "$BACKEND/venv/bin/activate"
python "$BACKEND/yield_curve.py" --save

if [ $? -eq 0 ]; then
    echo "$LOG_PREFIX Yield curve updated successfully. Restarting service..."
    sudo systemctl restart rca-tool
    echo "$LOG_PREFIX Service restarted."
else
    echo "$LOG_PREFIX ERROR: yield_curve.py exited with an error. Service not restarted."
    exit 1
fi

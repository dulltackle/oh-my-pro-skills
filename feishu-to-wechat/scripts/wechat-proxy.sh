#!/bin/bash
# 微信 API SOCKS5 隧道保活脚本
SSH_KEY="/home/forclaw/.ssh/ali-nanobot.pem"
SERVER="root@121.40.243.4"
PROXY_PORT=12345
PIDFILE="/tmp/wechat-proxy.pid"
LOGFILE="/tmp/wechat-proxy.log"

check_tunnel() {
  if [ -f "$PIDFILE" ]; then
    local pid=$(cat "$PIDFILE")
    if kill -0 "$pid" 2>/dev/null; then
      if ss -tlnp | grep -q ":${PROXY_PORT} "; then
        return 0
      fi
    fi
  fi
  return 1
}

start_tunnel() {
  pkill -f "ssh.*-D ${PROXY_PORT}" 2>/dev/null
  sleep 1

  ssh -i "$SSH_KEY" -f -N -D "127.0.0.1:${PROXY_PORT}" \
    -o ServerAliveInterval=15 \
    -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    "$SERVER"

  sleep 1
  if ss -tlnp | grep -q ":${PROXY_PORT} "; then
    echo "$(date '+%F %T') OK tunnel on port=${PROXY_PORT}" >> "$LOGFILE"
    pgrep -f "ssh.*-D ${PROXY_PORT}" > "$PIDFILE"
    exit 0
  else
    echo "$(date '+%F %T') FAIL tunnel setup" >> "$LOGFILE"
    exit 1
  fi
}

case "$1" in
  start)
    if check_tunnel; then
      echo "Running (PID=$(cat $PIDFILE))"
      exit 0
    fi
    start_tunnel
    ;;
  stop)
    pkill -f "ssh.*-D ${PROXY_PORT}" 2>/dev/null
    rm -f "$PIDFILE"
    echo "Stopped"
    ;;
  status)
    if check_tunnel; then
      echo "OK (PID=$(cat $PIDFILE), port=${PROXY_PORT})"
      curl -x socks5://127.0.0.1:${PROXY_PORT} -s --max-time 5 ifconfig.me 2>/dev/null && echo ""
    else
      echo "NOT running"
    fi
    ;;
  restart)
    $0 stop; sleep 1; $0 start
    ;;
  *)
    echo "Usage: $0 {start|stop|status|restart}"
    ;;
esac

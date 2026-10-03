#!/bin/bash
# 小诺简录：查询清单
set -euo pipefail
HUB="${XIAONUO_HUB_URL:-http://localhost:3000}"

TYPE="" STATUS="" KEYWORD=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --type) TYPE="$2"; shift 2;;
    --status) STATUS="$2"; shift 2;;
    --keyword) KEYWORD="$2"; shift 2;;
    *) echo "未知参数: $1" >&2; exit 1;;
  esac
done

if [[ -n "$KEYWORD" ]]; then
  URL="$HUB/api/records/search?keyword=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))' "$KEYWORD")"
else
  URL="$HUB/api/records?pageSize=100"
  [[ -n "$TYPE" ]] && URL="$URL&type=$TYPE"
  [[ -n "$STATUS" ]] && URL="$URL&status=$STATUS"
fi

if ! RESP="$(curl -sf "$URL")"; then
  echo "无法连接小诺简录中枢（$HUB）。请确认中枢已启动（cd hub && npm start），或检查 XIAONUO_HUB_URL。" >&2
  exit 1
fi

echo "$RESP" | python3 -c '
import json, sys
d = json.load(sys.stdin)
records = d.get("records", [])
if not records:
    print("（空）")
for r in records:
    tags = ",".join(r["tags"]) if r["tags"] else "-"
    print("[%s] %s | %s | %s | %s" % (r["id"], r["type"], r["status"], r["title"], tags))
'

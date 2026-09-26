#!/bin/bash
# 使い方: ./scripts/notify-slack.sh <ISSUE_URL> <MESSAGE>
#
# ペイロードは jq で組み立てる。メッセージに " や改行、バックスラッシュが
# 入っても壊れないようにするため（レビュー本文をそのまま流すので必須）。

set -uo pipefail

ISSUE_URL="${1:?ISSUE_URL が必要です}"
MESSAGE="${2:?MESSAGE が必要です}"

if [ -z "${SLACK_WEBHOOK_URL:-}" ]; then
  echo "Error: SLACK_WEBHOOK_URL 環境変数が設定されていません。.env を参照してください。" >&2
  exit 1
fi

# エージェントの返答は GitHub 記法で来るが、Slack の mrkdwn は太字が *x* なので
# ** はそのまま文字として表示されてしまう。ここで単一アスタリスクに寄せる
PAYLOAD=$(jq -n --arg url "$ISSUE_URL" --arg msg "$MESSAGE" \
  '($msg | gsub("\\*\\*"; "*")) as $m
   | {text: (":robot_face: *Claude Code 通知*\n*Issue:* " + $url + "\n\n*内容:*\n" + $m)}')

# 送信結果を必ず確認する。失敗を黙って飲まないため
HTTP_CODE=$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST -H 'Content-type: application/json' \
  --data "$PAYLOAD" "$SLACK_WEBHOOK_URL" 2>/dev/null)
CURL_STATUS=$?

if [ $CURL_STATUS -ne 0 ]; then
  echo "Error: Slackへの送信に失敗しました（curl 終了コード ${CURL_STATUS}）。" >&2
  exit 1
fi

if [ "$HTTP_CODE" != "200" ]; then
  echo "Error: Slackが HTTP $HTTP_CODE を返しました。Webhook URL を確認してください。" >&2
  exit 1
fi

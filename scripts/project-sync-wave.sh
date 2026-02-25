#!/usr/bin/env bash
set -euo pipefail

PROJECT_NUMBER="${PROJECT_NUMBER:-6}"
OWNER="${OWNER:-@me}"
LIMIT="${LIMIT:-200}"
DRY_RUN="${DRY_RUN:-0}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

need gh
need jq

project_id=$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq '.id')
fields_json=$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json)

wave_field_id=$(echo "$fields_json" | jq -r '.fields[] | select(.name=="Wave") | .id')
if [[ -z "$wave_field_id" || "$wave_field_id" == "null" ]]; then
  echo "Wave field not found in project $PROJECT_NUMBER" >&2
  exit 1
fi

wave_option_id() {
  local name="$1"
  echo "$fields_json" | jq -r --arg n "$name" \
    '.fields[] | select(.name=="Wave") | .options[] | select(.name==$n) | .id' | head -n1
}

resolve_target_wave() {
  local milestone="$1"
  case "$milestone" in
    *"Wave 1"*) echo "Wave 1" ;;
    *"Wave 2"*) echo "Wave 2" ;;
    *"Wave 3"*) echo "Wave 3" ;;
    *"Wave 4"*) echo "Wave 4" ;;
    *"Wave 5"*) echo "Wave 5" ;;
    *"Architecture Improve"*) echo "Update" ;;
    *) echo "Update" ;;
  esac
}

updated=0
skipped=0
failed=0

gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --limit "$LIMIT" --format json \
  --jq '.items[] | [.id, (.milestone.title // ""), (.wave // ""), (.content.url // "")] | @tsv' |
while IFS=$'\t' read -r item_id milestone current_wave url; do
  target_wave=$(resolve_target_wave "$milestone")
  target_option_id=$(wave_option_id "$target_wave")

  if [[ -z "$target_option_id" || "$target_option_id" == "null" ]]; then
    echo "WARN: wave option '$target_wave' not found for $url"
    failed=$((failed + 1))
    continue
  fi

  if [[ "$current_wave" == "$target_wave" ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY_RUN: $url | '$current_wave' -> '$target_wave'"
    updated=$((updated + 1))
    continue
  fi

  if gh project item-edit \
      --id "$item_id" \
      --project-id "$project_id" \
      --field-id "$wave_field_id" \
      --single-select-option-id "$target_option_id" >/dev/null; then
    echo "UPDATED: $url | '$current_wave' -> '$target_wave'"
    updated=$((updated + 1))
  else
    echo "ERROR: failed updating $url"
    failed=$((failed + 1))
  fi
done

echo ""
echo "Sync finished."
echo "Updated: $updated"
echo "Skipped: $skipped"
echo "Failed:  $failed"

#!/usr/bin/env bash
set -euo pipefail

PROJECT_NUMBER="${PROJECT_NUMBER:-6}"
OWNER="${OWNER:-@me}"
LIMIT="${LIMIT:-200}"
DRY_RUN="${DRY_RUN:-0}"
ONLY_OPEN="${ONLY_OPEN:-0}"      # 1 = processa só issues OPEN
ONLY_WAVE="${ONLY_WAVE:-5}"       # ex.: "Wave 5"     # ex.: "Wave 5"
ONLY_ISSUE_NUMBER="${1:-}"       # opcional: processa só 1 issue

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing command: $1" >&2; exit 1; }
}

need gh
need jq

to_lower() {
  printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]'
}

to_upper() {
  printf '%s' "${1:-}" | tr '[:lower:]' '[:upper:]'
}

project_id=$(gh project view "$PROJECT_NUMBER" --owner "$OWNER" --format json --jq '.id')
fields_json=$(gh project field-list "$PROJECT_NUMBER" --owner "$OWNER" --format json)

field_id() {
  local name="$1"
  echo "$fields_json" | jq -r --arg n "$name" '.fields[] | select(.name==$n) | .id' | head -n1
}

option_id() {
  local field_name="$1"
  local option_name="$2"
  echo "$fields_json" | jq -r --arg f "$field_name" --arg o "$option_name" \
    '.fields[] | select(.name==$f) | .options[] | select(.name==$o) | .id' | head -n1
}

is_valid_option_value() {
  local field="$1"
  local value="$2"
  local id
  [[ -z "${value:-}" || "$value" == "null" ]] && return 1
  id="$(option_id "$field" "$value")"
  [[ -n "$id" && "$id" != "null" ]]
}

pick_valid_value() {
  local field="$1"
  shift
  local candidate
  for candidate in "$@"; do
    [[ -z "${candidate:-}" || "$candidate" == "null" ]] && continue
    if is_valid_option_value "$field" "$candidate"; then
      echo "$candidate"
      return
    fi
  done
  echo ""
}

FIELD_STATUS=$(field_id "Status")
FIELD_PRIORITY=$(field_id "Priority")
FIELD_AREA=$(field_id "Area")
FIELD_TYPE=$(field_id "Type")
FIELD_WAVE=$(field_id "Wave")
FIELD_RISK=$(field_id "Risk")

set_field() {
  local item_id="$1"
  local field="$2"
  local opt="$3"
  gh project item-edit --id "$item_id" --project-id "$project_id" --field-id "$field" --single-select-option-id "$opt" >/dev/null
}

label_value() {
  local csv="$1"
  local prefix="$2"
  echo "$csv" | tr ',' '\n' | sed -n "s/^${prefix}\(.*\)$/\1/p" | head -n1
}

normalize_priority() {
  local raw
  raw="$(to_upper "${1:-}")"
  case "$raw" in
    P0|P1|P2|P3) echo "$raw" ;;
    CRITICAL|HIGH|H) echo "P1" ;;
    MEDIUM|M) echo "P2" ;;
    LOW|L) echo "P3" ;;
    *) echo "P2" ;;
  esac
}

normalize_risk() {
  local raw
  raw="$(to_lower "${1:-}")"
  case "$raw" in
    low|l) echo "low" ;;
    medium|med|m) echo "medium" ;;
    high|h|critical) echo "high" ;;
    *) echo "medium" ;;
  esac
}

map_type_label() {
  local raw
  raw="$(to_lower "${1:-}")"
  case "$raw" in
    feat|feature) echo "feature" ;;
    fix|bug|hotfix) echo "reliability" ;;
    chore|test) echo "quality" ;;
    docs) echo "maintainability" ;;
    refactor) echo "architecture" ;;
    infra) echo "infra" ;;
    security) echo "security" ;;
    reliability) echo "reliability" ;;
    architecture) echo "architecture" ;;
    ops) echo "ops" ;;
    quality) echo "quality" ;;
    maintainability) echo "maintainability" ;;
    *) echo "architecture" ;;
  esac
}

infer_type_from_title() {
  local t
  t="$(to_lower "${1:-}")"
  if [[ "$t" == feat\(* ]]; then echo "feature"; return; fi
  if [[ "$t" == fix\(* ]]; then echo "reliability"; return; fi
  if [[ "$t" == refactor\(* ]]; then echo "architecture"; return; fi
  if [[ "$t" == chore\(* ]]; then echo "quality"; return; fi
  if [[ "$t" == docs\(* ]]; then echo "maintainability"; return; fi
  if [[ "$t" == test\(* ]]; then echo "quality"; return; fi
  if [[ "$t" == *"[arch-"* ]]; then echo "architecture"; return; fi
  echo "architecture"
}

infer_area_from_title() {
  local t
  t="$(to_lower "${1:-}")"
  if [[ "$t" == *"auth"* || "$t" == *"identity"* || "$t" == *"session"* || "$t" == *"jwt"* ]]; then echo "identity"; return; fi
  if [[ "$t" == *"invoice"* || "$t" == *"billing"* || "$t" == *"catalog"* || "$t" == *"plan"* || "$t" == *"pricing"* ]]; then echo "billing"; return; fi
  if [[ "$t" == *"subscription"* ]]; then echo "subscriptions"; return; fi
  if [[ "$t" == *"payment"* || "$t" == *"stripe"* || "$t" == *"webhook"* || "$t" == *"checkout"* ]]; then echo "payments"; return; fi
  if [[ "$t" == *"entitlement"* ]]; then echo "entitlements"; return; fi
  if [[ "$t" == *"async"* || "$t" == *"queue"* || "$t" == *"worker"* || "$t" == *"outbox"* || "$t" == *"retry"* || "$t" == *"dead-letter"* || "$t" == *"dlq"* ]]; then echo "async"; return; fi
  if [[ "$t" == *"observability"* || "$t" == *"metrics"* || "$t" == *"tracing"* || "$t" == *"slo"* || "$t" == *"log"* ]]; then echo "observability"; return; fi
  if [[ "$t" == *"ci"* || "$t" == *"pipeline"* || "$t" == *"github actions"* || "$t" == *"codeql"* || "$t" == *"quality gate"* ]]; then echo "ci-cd"; return; fi
  if [[ "$t" == *"postgres"* || "$t" == *"migration"* || "$t" == *"prisma"* || "$t" == *"rls"* || "$t" == *"data"* ]]; then echo "data"; return; fi
  echo "platform"
}

infer_wave_from_milestone() {
  local m="$1"
  case "$m" in
    *"Wave 1"*) echo "Wave 1" ;;
    *"Wave 2"*) echo "Wave 2" ;;
    *"Wave 3"*) echo "Wave 3" ;;
    *"Wave 4"*) echo "Wave 4" ;;
    *"Wave 5"*) echo "Wave 5" ;;
    *) echo "Update" ;;
  esac
}

infer_risk() {
  local area="$1"
  local type="$2"

  if [[ "$type" == "security" ]]; then echo "high"; return; fi
  if [[ "$area" == "payments" || "$area" == "async" || "$area" == "data" ]]; then
    if [[ "$type" == "reliability" || "$type" == "infra" || "$type" == "architecture" ]]; then
      echo "high"; return
    fi
  fi
  if [[ "$type" == "quality" || "$type" == "maintainability" ]]; then
    echo "low"; return
  fi
  echo "medium"
}

map_status_label() {
  local raw
  raw="$(to_lower "${1:-}")"
  case "$raw" in
    backlog|todo|planned|triage) echo "Backlog" ;;
    ready|next) echo "Ready" ;;
    in-progress|in_progress|doing|wip|active) echo "In Progress" ;;
    review|in-review|qa|validation) echo "Review" ;;
    done|closed|resolved) echo "Done" ;;
    *) echo "" ;;
  esac
}

resolve_status() {
  local state="$1"
  local labels_csv="$2"
  local current_status="$3"
  local s mapped

  if [[ "$state" == "CLOSED" ]]; then
    echo "Done"
    return
  fi

  s=$(label_value "$labels_csv" "status:")
  mapped=$(map_status_label "$s")
  if [[ -n "$mapped" ]]; then
    echo "$mapped"
    return
  fi

  if [[ -n "$current_status" && "$current_status" != "Done" ]]; then
    echo "$current_status"
    return
  fi

  echo "Backlog"
}

apply_if_changed() {
  local issue_number="$1"
  local item_id="$2"
  local field_id="$3"
  local opt_id="$4"
  local current_value="$5"
  local target_value="$6"
  local field_name="$7"

  if [[ "$current_value" == "$target_value" ]]; then
    return 0
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY_RUN: Issue #$issue_number field=$field_name ${current_value:-<empty>} -> ${target_value:-<empty>}"
  else
    set_field "$item_id" "$field_id" "$opt_id"
  fi

  changed_fields=$((changed_fields + 1))
}

items_jq='.items[] | select((.content.type // "")=="Issue") | [.id, (.content.url // ""), (.milestone.title // ""), (.status // ""), (.priority // ""), (.area // ""), (.type // ""), (.wave // ""), (.risk // "")] | @tsv'
if [[ -n "$ONLY_ISSUE_NUMBER" ]]; then
  items_jq=".items[] | select((.content.type // \"\")==\"Issue\" and ((.content.url // \"\") | test(\"/issues/${ONLY_ISSUE_NUMBER}$\"))) | [.id, (.content.url // \"\"), (.milestone.title // \"\"), (.status // \"\"), (.priority // \"\"), (.area // \"\"), (.type // \"\"), (.wave // \"\"), (.risk // \"\")] | @tsv"
fi

updated=0
skipped=0
warnings=0
changed_fields_total=0

while IFS=$'\t' read -r item_id url milestone current_status current_priority current_area current_type current_wave current_risk; do
  [[ -z "$url" ]] && continue

  repo=$(echo "$url" | awk -F/ '{print $4 "/" $5}')
  issue_number=$(echo "$url" | awk -F/ '{print $7}')

  issue_json=$(gh issue view "$issue_number" --repo "$repo" --json title,state,labels,milestone 2>/dev/null || true)
  if [[ -z "$issue_json" ]]; then
    echo "WARN: unable to read issue #$issue_number ($repo)"
    warnings=$((warnings + 1))
    skipped=$((skipped + 1))
    continue
  fi

  title=$(echo "$issue_json" | jq -r '.title // ""')
  state=$(echo "$issue_json" | jq -r '.state // ""')
  labels_csv=$(echo "$issue_json" | jq -r '[.labels[].name] | join(",")')
  issue_milestone=$(echo "$issue_json" | jq -r '.milestone.title // ""')

  if [[ "$ONLY_OPEN" == "1" && "$state" != "OPEN" ]]; then
    echo "SKIP: Issue #$issue_number (closed, ONLY_OPEN=1)"
    skipped=$((skipped + 1))
    continue
  fi

  effective_milestone="$milestone"
  if [[ -z "$effective_milestone" ]]; then
    effective_milestone="$issue_milestone"
  fi

if [[ -n "$effective_milestone" ]]; then
  inferred_wave_for_filter=$(infer_wave_from_milestone "$effective_milestone")
elif [[ -n "$current_wave" ]]; then
  inferred_wave_for_filter="$current_wave"
else
  inferred_wave_for_filter="Update"
fi

if [[ -n "$ONLY_WAVE" && "$inferred_wave_for_filter" != "$ONLY_WAVE" ]]; then
  echo "SKIP: Issue #$issue_number (wave=$inferred_wave_for_filter, ONLY_WAVE=$ONLY_WAVE)"
  skipped=$((skipped + 1))
  continue
fi

  status_name=$(resolve_status "$state" "$labels_csv" "$current_status")

  priority_label=$(label_value "$labels_csv" "priority:")
  priority_name=$(pick_valid_value "Priority" \
    "$(normalize_priority "$priority_label")" \
    "$current_priority" \
    "P2")

  area_label=$(label_value "$labels_csv" "area:")
  area_name=$(pick_valid_value "Area" \
    "$(to_lower "$area_label")" \
    "$current_area" \
    "$(infer_area_from_title "$title")" \
    "platform")

  type_label=$(label_value "$labels_csv" "type:")
  type_name=$(pick_valid_value "Type" \
    "$(map_type_label "$type_label")" \
    "$current_type" \
    "$(infer_type_from_title "$title")" \
    "architecture")

  risk_label=$(label_value "$labels_csv" "risk:")
  risk_name=$(pick_valid_value "Risk" \
    "$(normalize_risk "$risk_label")" \
    "$current_risk" \
    "$(infer_risk "$area_name" "$type_name")" \
    "medium")

  if [[ -n "$effective_milestone" ]]; then
    wave_from_milestone=$(infer_wave_from_milestone "$effective_milestone")
  else
    wave_from_milestone=""
  fi
  wave_name=$(pick_valid_value "Wave" \
    "$wave_from_milestone" \
    "$current_wave" \
    "Update")

  # Option IDs só para campos alterados
  status_opt=""
  priority_opt=""
  area_opt=""
  type_opt=""
  wave_opt=""
  risk_opt=""

  if [[ "$status_name" != "$current_status" ]]; then status_opt=$(option_id "Status" "$status_name"); fi
  if [[ "$priority_name" != "$current_priority" ]]; then priority_opt=$(option_id "Priority" "$priority_name"); fi
  if [[ "$area_name" != "$current_area" ]]; then area_opt=$(option_id "Area" "$area_name"); fi
  if [[ "$type_name" != "$current_type" ]]; then type_opt=$(option_id "Type" "$type_name"); fi
  if [[ "$wave_name" != "$current_wave" ]]; then wave_opt=$(option_id "Wave" "$wave_name"); fi
  if [[ "$risk_name" != "$current_risk" ]]; then risk_opt=$(option_id "Risk" "$risk_name"); fi

  changed_candidates=0
  missing=0

  check_changed_field() {
    local field_name="$1"
    local current_value="$2"
    local target_value="$3"
    local opt="$4"

    if [[ "$current_value" != "$target_value" ]]; then
      changed_candidates=$((changed_candidates + 1))
      if [[ -z "$opt" || "$opt" == "null" ]]; then
        echo "WARN: option not found -> field=$field_name value=$target_value (issue #$issue_number)"
        missing=1
      fi
    fi
  }

  check_changed_field "Status" "$current_status" "$status_name" "$status_opt"
  check_changed_field "Priority" "$current_priority" "$priority_name" "$priority_opt"
  check_changed_field "Area" "$current_area" "$area_name" "$area_opt"
  check_changed_field "Type" "$current_type" "$type_name" "$type_opt"
  check_changed_field "Wave" "$current_wave" "$wave_name" "$wave_opt"
  check_changed_field "Risk" "$current_risk" "$risk_name" "$risk_opt"

  if [[ "$changed_candidates" -eq 0 ]]; then
    echo "SKIP: Issue #$issue_number (no changes)"
    skipped=$((skipped + 1))
    continue
  fi

  if [[ "$missing" == "1" ]]; then
    warnings=$((warnings + 1))
    skipped=$((skipped + 1))
    continue
  fi

  changed_fields=0

  apply_if_changed "$issue_number" "$item_id" "$FIELD_STATUS"   "$status_opt"   "$current_status"   "$status_name"   "Status"
  apply_if_changed "$issue_number" "$item_id" "$FIELD_PRIORITY" "$priority_opt" "$current_priority" "$priority_name" "Priority"
  apply_if_changed "$issue_number" "$item_id" "$FIELD_AREA"     "$area_opt"     "$current_area"     "$area_name"     "Area"
  apply_if_changed "$issue_number" "$item_id" "$FIELD_TYPE"     "$type_opt"     "$current_type"     "$type_name"     "Type"
  apply_if_changed "$issue_number" "$item_id" "$FIELD_WAVE"     "$wave_opt"     "$current_wave"     "$wave_name"     "Wave"
  apply_if_changed "$issue_number" "$item_id" "$FIELD_RISK"     "$risk_opt"     "$current_risk"     "$risk_name"     "Risk"

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY_RUN: Issue #$issue_number changed_fields=$changed_fields"
  else
    echo "UPDATED: Issue #$issue_number changed_fields=$changed_fields"
  fi

  changed_fields_total=$((changed_fields_total + changed_fields))
  updated=$((updated + 1))
done < <(gh project item-list "$PROJECT_NUMBER" --owner "$OWNER" --limit "$LIMIT" --format json --jq "$items_jq")

echo ""
echo "Sync complete."
echo "Updated items: $updated"
echo "Skipped items: $skipped"
echo "Warnings: $warnings"
echo "Changed fields total: $changed_fields_total"

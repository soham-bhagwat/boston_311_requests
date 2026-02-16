"""
Fetch Boston 311 service requests from the CKAN DataStore API.
Appends only NEW records to the existing CSV (based on case_id).
On first run (no CSV exists), fetches everything.
"""

import csv
import json
import os
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone

API_BASE = "https://data.boston.gov/api/3/action/datastore_search"
RESOURCE_ID = "254adca6-64ab-4c5c-9fc0-a6da622be185"
PAGE_SIZE = 1000
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds

OUTPUT_DIR = os.environ.get("GITHUB_WORKSPACE", os.getcwd())

FIELDS = [
    "case_id",
    "open_date",
    "close_date",
    "target_close_date",
    "case_topic",
    "service_name",
    "assigned_department",
    "assigned_team",
    "case_status",
    "closure_reason",
    "closure_comments",
    "on_time",
    "report_source",
    "full_address",
    "street_number",
    "street_name",
    "zip_code",
    "neighborhood",
    "public_works_district",
    "city_council_district",
    "fire_district",
    "police_district",
    "ward",
    "precinct",
    "longitude",
    "latitude",
]


def fetch_page(offset, filters=None, retry=0):
    """Fetch a single page of results from the API."""
    params = {
        "resource_id": RESOURCE_ID,
        "limit": PAGE_SIZE,
        "offset": offset,
        "sort": "open_date asc",
    }
    if filters:
        params["filters"] = json.dumps(filters)

    url = API_BASE + "?" + urllib.parse.urlencode(params)
    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "Boston311-Dashboard/1.0")
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
        if not data.get("success"):
            raise RuntimeError(f"API returned success=false at offset {offset}")
        return data["result"]
    except Exception as e:
        if retry < MAX_RETRIES:
            print(f"  Retry {retry + 1}/{MAX_RETRIES} for offset {offset}: {e}")
            time.sleep(RETRY_DELAY)
            return fetch_page(offset, filters, retry + 1)
        raise


def fetch_records_after(last_date=None):
    """
    Fetch records from the API.
    If last_date is provided, uses SQL-based query to only get newer records.
    Otherwise fetches everything.
    """
    all_records = []
    offset = 0
    total = None

    if last_date:
        # Use datastore_search_sql for date filtering
        print(f"Fetching records with open_date > '{last_date}'...")
        sql_base = (
            f"SELECT * FROM \"{RESOURCE_ID}\" "
            f"WHERE open_date > '{last_date}' "
            f"ORDER BY open_date ASC"
        )
        url = "https://data.boston.gov/api/3/action/datastore_search_sql?" + urllib.parse.urlencode({"sql": sql_base})
        try:
            req = urllib.request.Request(url)
            req.add_header("User-Agent", "Boston311-Dashboard/1.0")
            with urllib.request.urlopen(req, timeout=60) as response:
                data = json.loads(response.read().decode("utf-8"))
            if data.get("success"):
                all_records = data["result"]["records"]
                print(f"  Fetched {len(all_records):,} new records via SQL query")
                return all_records
            else:
                print("  SQL query failed, falling back to full fetch...")
        except Exception as e:
            print(f"  SQL query error: {e}, falling back to full fetch...")

    # Full pagination fetch (first run or SQL fallback)
    print("Fetching all records...")
    while True:
        result = fetch_page(offset)
        records = result["records"]

        if total is None:
            total = result["total"]
            print(f"  Total records in dataset: {total:,}")

        all_records.extend(records)
        print(f"  Fetched {len(all_records):,} / {total:,} records")

        if len(records) < PAGE_SIZE or len(all_records) >= total:
            break

        offset += PAGE_SIZE
        time.sleep(0.5)

    return all_records


def read_existing_csv(filepath):
    """Read existing CSV and return (rows, set of case_ids, latest open_date)."""
    if not os.path.exists(filepath):
        return [], set(), None

    rows = []
    case_ids = set()
    latest_date = None

    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
            case_ids.add(row.get("case_id", ""))
            od = row.get("open_date", "")
            if od and (latest_date is None or od > latest_date):
                latest_date = od

    print(f"Existing CSV: {len(rows):,} records, latest open_date: {latest_date}")
    return rows, case_ids, latest_date


def update_existing_rows(existing_rows, new_records, existing_ids):
    """
    Update rows that exist in both old and new data.
    Cases may have changed status (e.g. Open → Closed) since last fetch.
    Returns updated existing rows.
    """
    new_by_id = {}
    for r in new_records:
        cid = r.get("case_id", "")
        if cid in existing_ids:
            new_by_id[cid] = r

    if not new_by_id:
        return existing_rows

    updated_count = 0
    for i, row in enumerate(existing_rows):
        cid = row.get("case_id", "")
        if cid in new_by_id:
            # Update with fresh data from API
            fresh = new_by_id[cid]
            existing_rows[i] = {k: (fresh.get(k) or "") for k in FIELDS}
            updated_count += 1

    print(f"  Updated {updated_count:,} existing records (status changes, etc.)")
    return existing_rows


def write_csv(records, filepath):
    """Write records to CSV."""
    os.makedirs(os.path.dirname(filepath) if os.path.dirname(filepath) else ".", exist_ok=True)

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        for record in records:
            row = {k: (record.get(k) or "") for k in FIELDS}
            writer.writerow(row)

    print(f"Wrote {len(records):,} records to {filepath}")


def write_metadata(total, new_count, filepath):
    """Write metadata JSON."""
    meta = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "total_records": total,
        "new_records_added": new_count,
        "resource_id": RESOURCE_ID,
        "source": "data.boston.gov",
    }
    meta_path = os.path.join(os.path.dirname(filepath) if os.path.dirname(filepath) else ".", "metadata.json")
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"Wrote metadata to {meta_path}")


def main():
    print("=== Boston 311 Data Fetch (Incremental) ===")
    print(f"Started: {datetime.now(timezone.utc).isoformat()}")
    print(f"Resource: {RESOURCE_ID}")
    print()

    csv_path = os.path.join(OUTPUT_DIR, "boston_311_requests.csv")

    # Step 1: Read existing data
    existing_rows, existing_ids, latest_date = read_existing_csv(csv_path)

    # Step 2: Fetch new records from API
    new_records = fetch_records_after(latest_date)

    if not new_records and not existing_rows:
        print("ERROR: No records fetched and no existing data!", file=sys.stderr)
        sys.exit(1)

    if not new_records:
        print("\nNo new records found. CSV is up to date.")
        write_metadata(len(existing_rows), 0, csv_path)
        return

    # Step 3: Separate truly new records from updates to existing ones
    truly_new = [r for r in new_records if r.get("case_id", "") not in existing_ids]
    print(f"\n{len(truly_new):,} new records to append")

    # Step 4: Update any existing records that may have changed
    if existing_rows:
        existing_rows = update_existing_rows(existing_rows, new_records, existing_ids)

    # Step 5: Merge — existing (updated) + new
    all_rows = existing_rows + [{k: (r.get(k) or "") for k in FIELDS} for r in truly_new]

    # Step 6: Sort by open_date
    all_rows.sort(key=lambda r: r.get("open_date", ""))

    # Step 7: Write
    write_csv(all_rows, csv_path)
    write_metadata(len(all_rows), len(truly_new), csv_path)

    print(f"\n=== Done! {len(all_rows):,} total records ({len(truly_new):,} new) ===")


if __name__ == "__main__":
    main()
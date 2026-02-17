"""
Fetch Boston 311 service requests from the CKAN DataStore API
and write to data/boston_311_requests.csv

- First run: fetches everything from API, writes CSV
- Later runs: fetches current API data, merges with existing CSV
  (old records not in API are kept, current records are refreshed)
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
RETRY_DELAY = 5

# In GitHub Actions this is the repo root; locally it's wherever you run from
OUTPUT_DIR = os.environ.get("GITHUB_WORKSPACE", os.getcwd())

FIELDS = [
    "case_id", "open_date", "close_date", "target_close_date",
    "case_topic", "service_name", "assigned_department", "assigned_team",
    "case_status", "closure_reason", "closure_comments", "on_time",
    "report_source", "full_address", "street_number", "street_name",
    "zip_code", "neighborhood", "public_works_district",
    "city_council_district", "fire_district", "police_district",
    "ward", "precinct", "longitude", "latitude",
]


def fetch_page(offset, retry=0):
    params = {
        "resource_id": RESOURCE_ID,
        "limit": PAGE_SIZE,
        "offset": offset,
    }
    url = API_BASE + "?" + urllib.parse.urlencode(params)
    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "Boston311-Dashboard/1.0")
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
        if not data.get("success"):
            raise RuntimeError("API returned success=false at offset %d" % offset)
        return data["result"]
    except Exception as e:
        if retry < MAX_RETRIES:
            print("  Retry %d/%d for offset %d: %s" % (retry + 1, MAX_RETRIES, offset, e))
            time.sleep(RETRY_DELAY)
            return fetch_page(offset, retry + 1)
        raise


def fetch_all():
    all_records = []
    offset = 0
    total = None

    while True:
        result = fetch_page(offset)
        records = result["records"]

        if total is None:
            total = result["total"]
            print("Total records in dataset: %d" % total)

        all_records.extend(records)
        print("  Fetched %d / %d records" % (len(all_records), total))

        if len(records) < PAGE_SIZE or len(all_records) >= total:
            break

        offset += PAGE_SIZE
        time.sleep(0.3)

    return all_records


def read_existing(filepath):
    if not os.path.exists(filepath):
        return {}, []

    rows = []
    by_id = {}
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
            cid = row.get("case_id", "")
            if cid:
                by_id[cid] = row

    print("Existing CSV: %d records" % len(rows))
    return by_id, rows


def write_csv(records, filepath):
    folder = os.path.dirname(filepath)
    if folder:
        os.makedirs(folder, exist_ok=True)

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        for record in records:
            row = {}
            for k in FIELDS:
                val = record.get(k)
                row[k] = val if val is not None else ""
            writer.writerow(row)

    print("Wrote %d records to %s" % (len(records), filepath))


def main():
    print("=== Boston 311 Data Fetch ===")
    print("Started: %s" % datetime.now(timezone.utc).isoformat())
    print("Output dir: %s" % OUTPUT_DIR)
    print()

    csv_path = os.path.join(OUTPUT_DIR, "data", "boston_311_requests.csv")
    print("CSV path: %s" % csv_path)

    # Step 1: Read existing CSV
    existing_by_id, existing_rows = read_existing(csv_path)

    # Step 2: Fetch all current records from API
    api_records = fetch_all()

    if not api_records:
        print("ERROR: No records fetched!", file=sys.stderr)
        sys.exit(1)

    # Step 3: Build lookup of fresh API data
    api_by_id = {}
    for r in api_records:
        cid = r.get("case_id", "")
        if cid:
            api_by_id[cid] = r

    # Step 4: Keep old records that are NOT in current API pull
    # (these are older cases no longer returned by the API)
    kept_old = []
    for cid, row in existing_by_id.items():
        if cid not in api_by_id:
            kept_old.append(row)

    new_count = sum(1 for cid in api_by_id if cid not in existing_by_id)

    # Step 5: Combine old + fresh
    all_rows = kept_old + list(api_by_id.values())
    all_rows.sort(key=lambda r: r.get("open_date", "") or "")

    # Step 6: Write
    write_csv(all_rows, csv_path)

    print()
    print("=== Done! ===")
    print("  Total records: %d" % len(all_rows))
    print("  Kept from previous: %d" % len(kept_old))
    print("  From API (refreshed): %d" % len(api_by_id))
    print("  Brand new cases: %d" % new_count)


if __name__ == "__main__":
    main()
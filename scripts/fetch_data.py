"""
Fetch Boston 311 service requests from the CKAN DataStore API
and write to a CSV file. Handles pagination automatically.
"""

import csv
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

API_BASE = "https://data.boston.gov/api/3/action/datastore_search"
RESOURCE_ID = "254adca6-64ab-4c5c-9fc0-a6da622be185"
PAGE_SIZE = 1000
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds

OUTPUT_DIR = os.getcwd()  # saves CSV in whatever folder you run the script from

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


def fetch_page(offset, retry=0):
    """Fetch a single page of results from the API."""
    url = f"{API_BASE}?resource_id={RESOURCE_ID}&limit={PAGE_SIZE}&offset={offset}"
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
            return fetch_page(offset, retry + 1)
        raise


def fetch_all_records():
    """Paginate through the entire dataset."""
    all_records = []
    offset = 0
    total = None

    while True:
        result = fetch_page(offset)
        records = result["records"]

        if total is None:
            total = result["total"]
            print(f"Total records in dataset: {total:,}")

        all_records.extend(records)
        print(f"  Fetched {len(all_records):,} / {total:,} records")

        if len(records) < PAGE_SIZE or len(all_records) >= total:
            break

        offset += PAGE_SIZE
        time.sleep(0.5)  # be polite to the API

    return all_records


def write_csv(records, filepath):
    """Write records to a CSV file."""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        for record in records:
            # Clean up: replace None with empty string
            row = {k: (record.get(k) or "") for k in FIELDS}
            writer.writerow(row)

    print(f"Wrote {len(records):,} records to {filepath}")


def write_metadata(total, filepath):
    """Write a small JSON metadata file with fetch timestamp."""
    meta = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "total_records": total,
        "resource_id": RESOURCE_ID,
        "source": "data.boston.gov",
    }
    meta_path = os.path.join(os.path.dirname(filepath), "metadata.json")
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"Wrote metadata to {meta_path}")


def main():
    print(f"=== Boston 311 Data Fetch ===")
    print(f"Started: {datetime.now(timezone.utc).isoformat()}")
    print(f"Resource: {RESOURCE_ID}")
    print()

    records = fetch_all_records()

    if not records:
        print("ERROR: No records fetched!", file=sys.stderr)
        sys.exit(1)

    csv_path = os.path.join(OUTPUT_DIR, "boston_311_requests.csv")
    write_csv(records, csv_path)
    write_metadata(len(records), csv_path)

    print()
    print(f"=== Done! {len(records):,} records saved ===")


if __name__ == "__main__":
    main()

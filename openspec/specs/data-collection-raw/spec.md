# Data Collection (Raw Frames) Specification

## Purpose

Periodically save raw camera frames to disk for future ML training dataset curation. Frames are stored lossily (JPEG) to balance storage cost against visual quality. A configurable retention window prevents unbounded disk growth.

## Requirements

### Requirement: Periodic frame capture

When `DATA_COLLECTION_ENABLED=true` (default `false`), the edge main loop SHALL save one raw (unannotated) frame every N frames to `data/training/raw/`.

- **Capture interval**: Controlled by `DATA_COLLECTION_INTERVAL_FRAMES` (default 300 frames ≈ every 20s at 15 FPS).
- **Frame source**: The raw (unprocessed, uncropped) camera frame, before ROI application or preprocessing.
- **Format**: JPEG at quality `DATA_COLLECTION_JPEG_QUALITY` (default 80).

#### Scenario: Frame saved on schedule

- GIVEN `DATA_COLLECTION_ENABLED=true`, `DATA_COLLECTION_INTERVAL_FRAMES=100`
- WHEN frame_count reaches 100, 200, 300, ...
- THEN a JPEG file is written to `data/training/raw/{YYYY-MM-DD}/frame_{frame_count:08d}.jpg`

#### Scenario: Collection disabled saves nothing

- GIVEN `DATA_COLLECTION_ENABLED=false`
- WHEN the edge loop processes any number of frames
- THEN no files are written to `data/training/raw/`

### Requirement: Date-partitioned directory structure

Frames SHALL be organized by capture date under `data/training/raw/`.

- **Path**: `data/training/raw/{YYYY-MM-DD}/frame_{frame_count:08d}.jpg`
- The date directory is auto-created if it does not exist.
- A frame counter TXT file `data/training/raw/_count.txt` records the total number of collected frames across all dates.

#### Scenario: Date directory auto-created

- GIVEN `data/training/raw/` does not exist
- WHEN the first frame is captured on 2026-06-11
- THEN the directory `data/training/raw/2026-06-11/` is created, and the frame file is written inside it

### Requirement: Retention window

The system SHALL enforce a configurable retention period (`DATA_COLLECTION_MAX_DAYS`, default 7). At startup and then every 1000 frames, directories older than the retention window SHALL be purged.

- **Purge scope**: Entire date directories under `data/training/raw/`.
- **Safety**: Purge is logged at INFO level with directory path and file count. A dry-run mode via `DATA_COLLECTION_DRY_RUN=true` logs what would be deleted without actually deleting.

#### Scenario: Old frames purged

- GIVEN `DATA_COLLECTION_MAX_DAYS=7`
- AND the directory `data/training/raw/2026-06-01/` exists (10 days old)
- WHEN the retention check runs
- THEN the directory and all its contents are deleted

### Requirement: Storage usage tracking

After every capture, the system SHALL log the current total storage used by `data/training/raw/` in MB (recursive size).

- **Log level**: INFO
- **Warning**: If total storage exceeds `DATA_COLLECTION_MAX_MB` (default 5000 MB), a WARNING is logged.

#### Scenario: Storage threshold warning

- GIVEN `DATA_COLLECTION_MAX_MB=100`
- WHEN the directory size exceeds 100 MB
- THEN a warning is logged: "Raw data collection storage exceeds 100 MB — consider reducing retention or interval"

# Synthetic Data Generation Specification

## Purpose

Generate realistic synthetic crack textures with YOLO-format annotations for training the crack detection model. Uses OpenCV drawing primitives (Bézier curves, variable-width strokes, branching) to simulate `fisura_fina`, `fisura_media`, and `fisura_gruesa` classes at 640px reference width.

## Requirements

### Requirement: Crack texture generation

The system MUST generate synthetic crack images using OpenCV drawing primitives.

- **Primitives**: Bézier curves via `cv2.polylines` on smoothed control points; variable-width strokes via repeated dilation; branching sub-branches from curve midpoints.
- **Class mapping** (3 classes by pixel width at 640px reference): `fisura_fina` < 3px, `fisura_media` 3–8px, `fisura_gruesa` > 8px.
- **Background**: Random noise + gradient or solid color overlay.

#### Scenario: Single crack with fina classification

- GIVEN `num_images=10`, `output=ml/dataset/`
- WHEN the generator runs
- THEN 10 .jpg files + 10 .txt files are created
- AND each .txt has exactly one YOLO line: `class_id x_center y_center width height` with valid class 0,1,2

#### Scenario: Multiple overlapping cracks

- GIVEN `crack_count=3`, `overlapping=True`
- WHEN generation runs
- THEN the output image contains branching crack structure
- AND the YOLO label has 3 lines (one per crack segment)

#### Scenario: No-crack negative image

- GIVEN `crack_count=0`
- WHEN generation runs
- THEN a .jpg is saved with no corresponding .txt
- AND the image contains no crack pixels

### Requirement: YOLO-format output

The system MUST produce one .jpg image and one .txt label per generated image. Labels follow YOLO format: `class_id x_center y_center width height` normalized to [0,1]. Bounding boxes are computed from contour extremes of the drawn crack mask.

- At least 10% of generated images MUST be no-crack negatives (empty label or absent .txt).

#### Scenario: Label coordinate normalization

- GIVEN a 640×640 image with a crack bounding box at pixel (100,150,200,300)
- WHEN the label is written
- THEN x_center = 0.3125, y_center = 0.46875, width = 0.15625, height = 0.234375

### Requirement: Automatic train/val split

The system MUST split generated images into train (80%) and val (20%) using `prepare_dataset.py split` or inline equivalent.

- **Output structure**: `ml/dataset/train/images/`, `ml/dataset/train/labels/`, `ml/dataset/val/images/`, `ml/dataset/val/labels/`.

#### Scenario: Split after generation

- GIVEN 1000 images generated
- WHEN the split runs
- THEN 800 images go to train/, 200 to val/
- AND train/val have matching .jpg + .txt pairs

### Requirement: Configurable parameters

The system SHOULD accept CLI arguments for:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `--output` | `ml/dataset/` | Output directory |
| `--num-images` | 1000 | Total images to generate |
| `--imgsz` | 640 | Image size (square) |
| `--crack-count` | 1 | Cracks per image (0 = background only) |
| `--noise-level` | 0.1 | Background noise stddev (0.0–1.0) |
| `--background` | `gradient` | `solid`, `gradient`, `texture` |
| `--val-ratio` | 0.2 | Validation split ratio |

#### Scenario: Custom parameters

- GIVEN `--num-images 50 --imgsz 416 --crack-count 2 --noise-level 0.3`
- WHEN generation completes
- THEN all images are 416×416 with 2 cracks each
- AND backgrounds have visible noise

#### Scenario: Zero images requested

- GIVEN `--num-images 0`
- WHEN generation runs
- THEN no files are written
- AND an INFO log message is emitted

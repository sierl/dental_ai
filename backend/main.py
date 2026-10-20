import base64
import io
from collections import Counter
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from ultralytics import YOLO

# Find the project folder and model file.
PROJECT_DIR = Path(__file__).resolve().parent.parent
DATASET_DIR = PROJECT_DIR / "data" / "dental-disease-panoramic-detection-dataset"
MODEL_PATH = DATASET_DIR / "best.pt"
SAMPLES_DIR = DATASET_DIR / "YOLO" / "YOLO" / "valid" / "images"

# Load the trained YOLO model once when the backend starts.
if not MODEL_PATH.is_file():
    raise FileNotFoundError(
        f"Model not found: {MODEL_PATH}\n"
        "Put best.pt at that location or update MODEL_PATH in backend/main.py."
    )

model = YOLO(str(MODEL_PATH))

app = FastAPI(title="DentalAI API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Simple setup for a local demo.
    allow_methods=["*"],
    allow_headers=["*"],
)


def open_image(data: bytes) -> Image.Image:
    """Check that the uploaded bytes are an image and convert it to RGB."""
    try:
        with Image.open(io.BytesIO(data)) as image:
            return image.convert("RGB")
    except (UnidentifiedImageError, OSError) as error:
        raise HTTPException(status_code=400, detail="Please upload a valid image.") from error


def screen(image: Image.Image, source: str = "upload") -> dict:
    """Run YOLO and convert its output into the JSON format used by the webpage."""
    result = model.predict(image, conf=0.25, verbose=False)[0]
    detections = []

    if result.boxes is not None:
        for box in result.boxes:
            class_id = int(box.cls[0].item())
            confidence = float(box.conf[0].item())
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            detections.append({
                "index": len(detections) + 1,
                "label": str(result.names[class_id]),
                "class_id": class_id,
                "confidence": round(confidence, 4),
                "bbox": {
                    "x1": round(x1, 1), "y1": round(y1, 1),
                    "x2": round(x2, 1), "y2": round(y2, 1),
                },
            })

    # Show the most confident detection first.
    detections.sort(key=lambda item: item["confidence"], reverse=True)
    for index, item in enumerate(detections, start=1):
        item["index"] = index

    # Count how many regions the model detected for each class.
    counts = Counter(item["label"] for item in detections)
    total = len(detections)
    categories = [
        {
            "label": label,
            "class_id": next(d["class_id"] for d in detections if d["label"] == label),
            "detections": count,
            "share": round(count / total * 100, 2) if total else 0,
            "max_confidence": max(d["confidence"] for d in detections if d["label"] == label),
        }
        for label, count in counts.most_common()
    ]

    if detections:
        top = detections[0]
        title = f"Possible {top['label']}"
        if len(detections) > 1:
            title += f" (+{len(detections) - 1} other findings)"
        summary = f"The model detected {total} region(s): " + ", ".join(
            f"{item['label']} ({item['detections']})" for item in categories[:4]
        ) + "."
    else:
        title = "No clear findings detected"
        summary = "The model did not detect any regions above the confidence threshold."

    # YOLO draws a simple visual overlay on the image.
    # plotted_image = Image.fromarray(result.plot()[..., ::-1])  # YOLO plot is BGR; PIL expects RGB.
    plotted_image = result.plot(pil=True)
    buffer = io.BytesIO()
    plotted_image.save(buffer, format="JPEG")
    image_data = base64.b64encode(buffer.getvalue()).decode("ascii")

    return {
        "screening": title,
        "confidence": detections[0]["confidence"] if detections else 0,
        "summary": summary,
        "categories": {item["label"]: item["share"] for item in categories},
        "category_details": categories,
        "screening_groups": (
            [{"group": "Detected findings", "detections": total,
              "share": 100.0, "labels": list(counts.keys())}] if total else []
        ),
        "detections": detections,
        "image": {
            "width": image.width,
            "height": image.height,
            "annotated_data_url": "data:image/jpeg;base64," + image_data,
        },
        "meta": {
            "model": MODEL_PATH.name,
            "device": str(getattr(model, "device", "auto")),
            "inference_ms": round(float(result.speed.get("inference", 0)), 1),
            "imgsz": 640,
            "conf_threshold": 0.25,
            "iou_threshold": 0.7,
            "num_detections": total,
            "source": source,
        },
        "note": "Experimental AI screening only, not a medical diagnosis. Consult a qualified dentist.",
    }


@app.get("/api/health")
def health():
    """Used by the webpage to show whether the API is responding."""
    return {"status": "ok", "model_loaded": True, "device": str(getattr(model, "device", "auto"))}


@app.post("/api/predict")
@app.post("/predict")  # Keep the shorter URL working too.
async def predict(file: UploadFile = File(...)):
    """Receive an uploaded image and send it to YOLO."""
    data = await file.read(10 * 1024 * 1024 + 1)
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image must be smaller than 10 MB.")
    image = open_image(data)
    return screen(image)


def sample_files():
    """Find a few dataset images for the optional demo-sample dropdown."""
    if not SAMPLES_DIR.is_dir():
        return []
    extensions = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    return sorted(
        [path for path in SAMPLES_DIR.iterdir() if path.suffix.lower() in extensions],
        key=lambda path: path.name,
    )[:40]


@app.get("/api/samples")
def list_samples():
    files = sample_files()
    return {
        "count": len(files),
        "samples": [
            {"id": path.stem, "filename": path.name, "split": "valid",
             "image_url": f"/api/samples/{path.stem}/image"}
            for path in files
        ],
    }


def find_sample(sample_id: str) -> Path:
    for path in sample_files():
        if path.stem == sample_id:
            return path
    raise HTTPException(status_code=404, detail="Sample image not found.")


@app.get("/api/samples/{sample_id}/image")
def get_sample_image(sample_id: str):
    return FileResponse(find_sample(sample_id))


@app.post("/api/samples/{sample_id}/predict")
def predict_sample(sample_id: str):
    path = find_sample(sample_id)
    with Image.open(path) as image:
        return screen(image.convert("RGB"), source=f"sample:{sample_id}")


# Serve the website from the same server, if the frontend folder exists.
FRONTEND_DIR = PROJECT_DIR / "frontend"
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

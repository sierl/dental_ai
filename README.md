# DentalAI

DentalAI is a simple web app that uses an AI model to find possible dental features in a panoramic dental X-ray. Upload an image to see the model's results.

**Note:** This is a college project for demonstration only. It does not give a medical diagnosis. Always ask a qualified dentist to review the results.

## Features

- Upload a dental X-ray image (JPG, JPEG or PNG, up to 10 MB).
- View possible findings and confidence scores.
- See an image marked with the model's detections.
- Try sample images from the dataset.

## Project Structure

```text
dental_ai/
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── backend/
│   └── main.py
├── data/
│   └── dental-disease-panoramic-detection-dataset/
│       └── best.pt
├── .gitignore
├── pyproject.toml
├── uv.lock
└── README.md
```

## Setup

1. Install [uv](https://docs.astral.sh/uv/).
2. Place the model `best.pt` at:

   `data/dental-disease-panoramic-detection-dataset/best.pt`

3. From the project root, install the dependencies:

   ```bash
   uv sync
   ```

## Run the App

From the project root, run:

```bash
uv run uvicorn backend.main:app --reload
```

Open <http://127.0.0.1:8000> in your browser.

## System Architecture

DentalAI has three main parts:

1. **Frontend:** The HTML, CSS and JavaScript page lets the user upload an X-ray and view the results.
2. **Backend:** FastAPI receives the image and sends it to the AI model.
3. **AI model:** `best.pt` analyzes the image and returns possible detections. The backend sends the results back to the webpage.

**Flow:** User uploads X-ray → Frontend sends image → FastAPI runs the model → Results are displayed.

## How It Works

1. The user uploads a dental X-ray in the webpage.
2. The frontend sends the image to the FastAPI backend.
3. The backend uses `best.pt` to detect possible features.
4. The results and marked image are shown on the webpage.

# References

- https://www.kaggle.com/datasets/lokisilvres/dental-disease-panoramic-detection-dataset

<hr>

```
(Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned) ; (& c:\src\DentalAi\.venv\Scripts\Activate.ps1)
```

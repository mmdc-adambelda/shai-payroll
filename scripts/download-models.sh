#!/bin/bash
# ============================================================
# S.H.A.I. — Download face-api.js model weights
# Run once before building: bash scripts/download-models.sh
# ============================================================

set -e

MODELS_DIR="public/models"
BASE_URL="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"

echo "📦 Creating $MODELS_DIR directory..."
mkdir -p "$MODELS_DIR"

echo "⬇️  Downloading SSD MobileNet V1 (face detection)..."
for f in ssd_mobilenetv1_model-weights_manifest.json ssd_mobilenetv1_model-shard1 ssd_mobilenetv1_model-shard2; do
  curl -sL "$BASE_URL/$f" -o "$MODELS_DIR/$f"
  echo "   ✓ $f"
done

echo "⬇️  Downloading Face Landmark 68 Net..."
for f in face_landmark_68_model-weights_manifest.json face_landmark_68_model-shard1; do
  curl -sL "$BASE_URL/$f" -o "$MODELS_DIR/$f"
  echo "   ✓ $f"
done

echo "⬇️  Downloading Face Recognition Net..."
for f in face_recognition_model-weights_manifest.json face_recognition_model-shard1 face_recognition_model-shard2; do
  curl -sL "$BASE_URL/$f" -o "$MODELS_DIR/$f"
  echo "   ✓ $f"
done

echo ""
echo "✅ All models downloaded to $MODELS_DIR/"
echo "   Total size: $(du -sh $MODELS_DIR | cut -f1)"
echo ""
echo "Next: npm run dev"

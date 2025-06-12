import base64
import os

# Absolute safe path — match your project structure
ENCODED_PATH = "./backend/cookies-encoded.txt"
DECODED_PATH = "./backend/cookies.txt"

if not os.path.exists(DECODED_PATH):
    with open(ENCODED_PATH, "r") as f:
        encoded = f.read()
    with open(DECODED_PATH, "wb") as f:
        f.write(base64.b64decode(encoded))
    print("✅ cookies.txt created.")
else:
    print("✅ cookies.txt already exists.")

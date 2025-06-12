import base64
import os

# Read the encoded file
with open("/backend/cookies-encode.txt", "r") as f:
    encoded = f.read()

# Decode and write to /backend/cookies.txt
with open("/backend/cookies.txt", "wb") as f:
    f.write(base64.b64decode(encoded))

print("✅ cookies.txt written successfully")

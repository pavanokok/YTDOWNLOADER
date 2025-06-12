import os
import base64

# Absolute-safe pathing
base_dir = os.path.dirname(__file__)
encoded_path = os.path.join(base_dir, "cookies-encoded.txt")
decoded_path = os.path.join(base_dir, "cookies.txt")

if not os.path.exists(decoded_path):
    with open(encoded_path, "r") as f:
        encoded = f.read()

    with open(decoded_path, "wb") as f:
        f.write(base64.b64decode(encoded))

    print("✅ cookies.txt created successfully!")
else:
    print("ℹ️ cookies.txt already exists.")


#!/bin/bash

# Install dependencies
pip install -r requirements.txt

# Create downloads directory
mkdir -p downloads

# Start the FastAPI server
python run.py

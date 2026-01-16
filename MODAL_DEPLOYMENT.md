# Modal Deployment Instructions

## Prerequisites

1. Python 3.9 or higher
2. Modal account (free tier available)

## Installation

```bash
pip install -r requirements-modal.txt
```

## Setup

```bash
# Authenticate with Modal
modal setup
```

## Deployment

```bash
# Deploy the compute backend
modal deploy modal_compute.py
```

This will output URLs for your endpoints:
- `compute_lattice_reduction` - For LLL/BKZ operations
- `analyze_signatures` - For batch signature analysis

## Configuration

After deployment, copy your endpoint URL and configure it in the app:
1. Navigate to app settings
2. Enter Modal Endpoint URL (e.g., `https://username--lll-attack-runner.modal.run`)
3. Test connection

## Local Testing

```bash
# Run locally for testing
modal serve modal_compute.py
```

## Monitoring

```bash
# View logs
modal app logs lll-attack-runner

# List deployments
modal app list
```

## Cost

Modal free tier includes $30/month in credits, which is typically sufficient for:
- 50-100 LLL attacks per day
- 20-30 BKZ attacks per day (block size 20)

For heavy usage, see Modal pricing: https://modal.com/pricing

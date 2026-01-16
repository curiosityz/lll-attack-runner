#!/bin/bash
# Quick Setup Script for Cloudflare D1 + Modal Integration

set -e

echo "=================================================="
echo "LLL Attack Runner - Automated Setup"
echo "=================================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi
echo "✅ Node.js found: $(node --version)"

if ! command -v npm &> /dev/null; then
    echo "❌ npm not found"
    exit 1
fi
echo "✅ npm found: $(npm --version)"

if ! command -v python3 &> /dev/null; then
    echo "⚠️  Python3 not found. Modal backend will not be available."
    SKIP_MODAL=1
else
    echo "✅ Python3 found: $(python3 --version)"
fi

echo ""
echo "Installing frontend dependencies..."
npm install

echo ""
if [ -z "$SKIP_MODAL" ]; then
    echo "Setting up Modal backend..."
    echo "Installing Modal requirements..."
    pip3 install -r requirements-modal.txt
    
    echo ""
    echo "To deploy Modal backend:"
    echo "  1. Run: modal setup"
    echo "  2. Run: modal deploy modal_compute.py"
    echo "  3. Copy the endpoint URL to app settings"
else
    echo "⚠️  Skipping Modal setup (Python not found)"
fi

echo ""
echo "=================================================="
echo "Setup Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "  1. Set up Cloudflare D1 (see CLOUDFLARE_MODAL_GUIDE.md)"
echo "  2. Deploy Modal backend (see MODAL_DEPLOYMENT.md)"
echo "  3. Run: npm run dev"
echo "  4. Navigate to Upload tab and drop your TSV files"
echo ""
echo "Documentation:"
echo "  - Quick Start: CLOUDFLARE_MODAL_GUIDE.md"
echo "  - Modal Setup: MODAL_DEPLOYMENT.md"
echo "  - Database Config: DATABASE_STREAMING.md"
echo ""

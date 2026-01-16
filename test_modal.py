#!/usr/bin/env python3
"""
Integration Test for Modal Compute Backend

Tests the deployed Modal functions with sample data.
Run after deploying: python test_modal.py <modal_endpoint_url>
"""

import sys
import json
import requests
from typing import Dict, Any


def test_lll_small_matrix(endpoint: str) -> bool:
    """Test LLL on a small 3x3 matrix."""
    print("Testing LLL with small matrix...")
    
    payload = {
        "algorithm": "lll",
        "basis": [
            [2, 0, 0],
            [0, 2, 0],
            [0, 0, 2]
        ],
        "delta": 0.99
    }
    
    try:
        response = requests.post(
            f"{endpoint}/compute_lattice_reduction",
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"❌ HTTP {response.status_code}: {response.text}")
            return False
        
        result = response.json()
        
        if not result.get("success"):
            print(f"❌ LLL failed: {result.get('error')}")
            return False
        
        print(f"✅ LLL succeeded in {result.get('executionTime', 0):.3f}s")
        print(f"   Reduced basis: {result.get('reducedBasis')}")
        return True
        
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False


def test_bkz_small_matrix(endpoint: str) -> bool:
    """Test BKZ on a small matrix."""
    print("\nTesting BKZ with small matrix...")
    
    payload = {
        "algorithm": "bkz",
        "basis": [
            [10, 2, 3],
            [1, 15, 4],
            [2, 3, 20]
        ],
        "delta": 0.99,
        "blockSize": 10
    }
    
    try:
        response = requests.post(
            f"{endpoint}/compute_lattice_reduction",
            json=payload,
            timeout=60
        )
        
        if response.status_code != 200:
            print(f"❌ HTTP {response.status_code}: {response.text}")
            return False
        
        result = response.json()
        
        if not result.get("success"):
            print(f"❌ BKZ failed: {result.get('error')}")
            return False
        
        print(f"✅ BKZ succeeded in {result.get('executionTime', 0):.3f}s")
        print(f"   Block size: {result.get('blockSize')}")
        return True
        
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False


def test_signature_analysis(endpoint: str) -> bool:
    """Test signature vulnerability analysis."""
    print("\nTesting signature analysis...")
    
    # Test signatures with known nonce reuse
    payload = {
        "signatures": [
            {
                "r": "0x123456789abcdef0",
                "s": "0xfedcba9876543210",
                "z": "0x111111111",
                "address": "test_address_1"
            },
            {
                "r": "0x123456789abcdef0",  # Same R = nonce reuse
                "s": "0xaaaaaaaaaaaa",
                "z": "0x222222222",
                "address": "test_address_1"
            },
            {
                "r": "0x0000000000000012",  # Small R (biased)
                "s": "0xbbbbbbbbbbbb",
                "z": "0x333333333",
                "address": "test_address_2"
            }
        ]
    }
    
    try:
        response = requests.post(
            f"{endpoint}/analyze_signatures",
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"❌ HTTP {response.status_code}: {response.text}")
            return False
        
        result = response.json()
        
        if not result.get("success"):
            print(f"❌ Analysis failed: {result.get('error')}")
            return False
        
        vulns = result.get('vulnerabilities', {})
        print(f"✅ Analysis succeeded in {result.get('executionTime', 0):.3f}s")
        print(f"   Nonce reuse detected: {len(vulns.get('nonce_reuse', []))}")
        print(f"   Biased nonces: {len(vulns.get('biased_nonce', []))}")
        
        # Verify we detected the nonce reuse
        if len(vulns.get('nonce_reuse', [])) < 1:
            print("⚠️  Warning: Expected to detect nonce reuse")
            return False
        
        return True
        
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python test_modal.py <modal_endpoint_url>")
        print("Example: python test_modal.py https://username--lll-attack-runner.modal.run")
        sys.exit(1)
    
    endpoint = sys.argv[1].rstrip('/')
    
    print("=" * 60)
    print("Modal Compute Integration Tests")
    print("=" * 60)
    print(f"Endpoint: {endpoint}\n")
    
    results = []
    results.append(("LLL Small Matrix", test_lll_small_matrix(endpoint)))
    results.append(("BKZ Small Matrix", test_bkz_small_matrix(endpoint)))
    results.append(("Signature Analysis", test_signature_analysis(endpoint)))
    
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    all_passed = all(result[1] for result in results)
    
    if all_passed:
        print("\n🎉 All tests passed!")
        sys.exit(0)
    else:
        print("\n⚠️  Some tests failed")
        sys.exit(1)


if __name__ == "__main__":
    main()

"""
Modal Serverless Compute for LLL/BKZ Lattice Reduction

This module provides serverless compute endpoints for computationally intensive
lattice basis reduction algorithms (LLL and BKZ) that would freeze browsers.

Usage:
  modal deploy modal_compute.py
"""

import modal
import json
from typing import List, Dict, Any, Optional
import numpy as np

# Create Modal app
app = modal.App("lll-attack-runner")

# Define image with required dependencies
image = modal.Image.debian_slim().pip_install(
    "numpy",
    "fpylll",  # High-performance LLL/BKZ implementation
)


def parse_basis_matrix(basis: List[List[float]]) -> np.ndarray:
    """Convert basis from JSON format to numpy array."""
    return np.array(basis, dtype=np.float64)


def format_result_matrix(matrix: np.ndarray) -> List[List[float]]:
    """Convert numpy array to JSON-serializable format."""
    return matrix.tolist()


@app.function(
    image=image,
    timeout=600,  # 10 minute timeout for large matrices
    memory=2048,  # 2GB memory for large computations
)
def run_lll(
    basis: List[List[float]], 
    delta: float = 0.99,
    capture_steps: bool = False
) -> Dict[str, Any]:
    """
    Run LLL algorithm on the provided basis matrix.
    
    Args:
        basis: Input basis matrix as list of lists
        delta: LLL parameter (0.25 < delta < 1.0, typically 0.99)
        capture_steps: Whether to capture intermediate steps (slower)
    
    Returns:
        Dictionary containing:
        - reducedBasis: Reduced basis matrix
        - iterations: Number of iterations performed
        - success: Whether reduction was successful
        - executionTime: Time taken in seconds
        - steps: Optional list of intermediate steps
    """
    import time
    from fpylll import IntegerMatrix, LLL
    
    start_time = time.time()
    
    try:
        # Convert to integer matrix for fpylll
        np_basis = parse_basis_matrix(basis)
        n, m = np_basis.shape
        
        # Create fpylll IntegerMatrix
        A = IntegerMatrix(n, m)
        for i in range(n):
            for j in range(m):
                A[i, j] = int(np_basis[i, j])
        
        # Run LLL reduction
        LLL.reduction(A, delta=delta)
        
        # Extract reduced basis
        reduced = np.zeros((n, m), dtype=np.float64)
        for i in range(n):
            for j in range(m):
                reduced[i, j] = float(A[i, j])
        
        execution_time = time.time() - start_time
        
        # Find solution vector (shortest non-zero vector)
        norms = [np.linalg.norm(reduced[i]) for i in range(n)]
        min_idx = int(np.argmin(norms))
        solution_vector = reduced[min_idx].tolist() if norms[min_idx] < 1e10 else None
        
        return {
            "success": True,
            "reducedBasis": format_result_matrix(reduced),
            "solutionVector": solution_vector,
            "iterations": n,  # fpylll doesn't expose iteration count
            "executionTime": execution_time,
            "algorithm": "lll",
            "delta": delta
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "executionTime": time.time() - start_time
        }


@app.function(
    image=image,
    timeout=1800,  # 30 minute timeout for BKZ
    memory=4096,   # 4GB memory for BKZ
)
def run_bkz(
    basis: List[List[float]], 
    block_size: int = 20,
    delta: float = 0.99,
    capture_steps: bool = False
) -> Dict[str, Any]:
    """
    Run BKZ algorithm on the provided basis matrix.
    
    Args:
        basis: Input basis matrix as list of lists
        block_size: BKZ block size (typically 10-50)
        delta: LLL parameter used in BKZ
        capture_steps: Whether to capture intermediate steps
    
    Returns:
        Dictionary containing:
        - reducedBasis: Reduced basis matrix
        - iterations: Number of iterations performed
        - success: Whether reduction was successful
        - executionTime: Time taken in seconds
        - blockSize: Block size used
    """
    import time
    from fpylll import IntegerMatrix, BKZ
    
    start_time = time.time()
    
    try:
        # Convert to integer matrix for fpylll
        np_basis = parse_basis_matrix(basis)
        n, m = np_basis.shape
        
        # Create fpylll IntegerMatrix
        A = IntegerMatrix(n, m)
        for i in range(n):
            for j in range(m):
                A[i, j] = int(np_basis[i, j])
        
        # Run BKZ reduction with specified block size
        param = BKZ.Param(
            block_size=block_size,
            delta=delta,
            strategies=BKZ.DEFAULT_STRATEGY
        )
        BKZ.reduction(A, param)
        
        # Extract reduced basis
        reduced = np.zeros((n, m), dtype=np.float64)
        for i in range(n):
            for j in range(m):
                reduced[i, j] = float(A[i, j])
        
        execution_time = time.time() - start_time
        
        # Find solution vector
        norms = [np.linalg.norm(reduced[i]) for i in range(n)]
        min_idx = int(np.argmin(norms))
        solution_vector = reduced[min_idx].tolist() if norms[min_idx] < 1e10 else None
        
        return {
            "success": True,
            "reducedBasis": format_result_matrix(reduced),
            "solutionVector": solution_vector,
            "iterations": n,
            "executionTime": execution_time,
            "algorithm": "bkz",
            "blockSize": block_size,
            "delta": delta
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "executionTime": time.time() - start_time
        }


@app.function(image=image, timeout=300)
def analyze_signatures_batch(
    signatures: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Analyze a batch of signatures for vulnerabilities.
    
    Args:
        signatures: List of signature objects with r, s, z values
    
    Returns:
        Dictionary containing detected vulnerabilities and recommended attacks
    """
    import time
    from collections import defaultdict
    
    start_time = time.time()
    
    try:
        vulnerabilities = {
            "nonce_reuse": [],
            "biased_nonce": [],
            "small_r": [],
            "related_nonce": []
        }
        
        # Group by R value to detect nonce reuse
        r_groups = defaultdict(list)
        for sig in signatures:
            r_value = sig.get('r', '')
            if r_value:
                r_groups[r_value].append(sig)
        
        # Detect nonce reuse
        for r_value, sigs in r_groups.items():
            if len(sigs) > 1:
                vulnerabilities["nonce_reuse"].append({
                    "r_value": r_value,
                    "count": len(sigs),
                    "signatures": sigs,
                    "severity": "critical"
                })
        
        # Detect biased nonces (small R values)
        for sig in signatures:
            r_hex = sig.get('r', '0')
            if isinstance(r_hex, str):
                try:
                    r_int = int(r_hex, 16) if r_hex.startswith('0x') else int(r_hex)
                    r_bits = r_int.bit_length()
                    if r_bits < 230:  # Significantly shorter than 256 bits
                        vulnerabilities["biased_nonce"].append({
                            "signature": sig,
                            "bit_length": r_bits,
                            "severity": "high"
                        })
                except:
                    pass
        
        execution_time = time.time() - start_time
        
        return {
            "success": True,
            "vulnerabilities": vulnerabilities,
            "total_signatures": len(signatures),
            "nonce_reuse_count": len(vulnerabilities["nonce_reuse"]),
            "biased_nonce_count": len(vulnerabilities["biased_nonce"]),
            "executionTime": execution_time
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "executionTime": time.time() - start_time
        }


# Web endpoint for HTTP access
@app.function()
@modal.web_endpoint(method="POST")
def compute_lattice_reduction(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    HTTP endpoint for triggering lattice reduction computations.
    
    Request body:
    {
        "algorithm": "lll" | "bkz",
        "basis": [[...]],
        "delta": 0.99,
        "blockSize": 20  (BKZ only)
    }
    """
    try:
        algorithm = request.get("algorithm", "lll").lower()
        basis = request.get("basis", [])
        delta = request.get("delta", 0.99)
        
        # Validate basis
        if not basis:
            return {"success": False, "error": "No basis provided"}
        
        if not isinstance(basis, list) or not all(isinstance(row, list) for row in basis):
            return {"success": False, "error": "Basis must be a 2D array"}
        
        # Validate delta parameter
        if not (0.25 < delta < 1.0):
            return {"success": False, "error": f"Delta must be between 0.25 and 1.0, got {delta}"}
        
        if algorithm == "lll":
            result = run_lll.remote(basis, delta)
        elif algorithm == "bkz":
            block_size = request.get("blockSize", 20)
            if not (2 <= block_size <= 100):
                return {"success": False, "error": f"Block size must be between 2 and 100, got {block_size}"}
            result = run_bkz.remote(basis, block_size, delta)
        else:
            return {"success": False, "error": f"Unknown algorithm: {algorithm}"}
        
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.function()
@modal.web_endpoint(method="POST")
def analyze_signatures(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    HTTP endpoint for signature vulnerability analysis.
    
    Request body:
    {
        "signatures": [{"r": "...", "s": "...", "z": "..."}, ...]
    }
    """
    try:
        signatures = request.get("signatures", [])
        if not signatures:
            return {"success": False, "error": "No signatures provided"}
        
        result = analyze_signatures_batch.remote(signatures)
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}

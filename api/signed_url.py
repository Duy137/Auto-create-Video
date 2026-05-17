# api/signed_url.py
import hmac
import hashlib
import time
from typing import Optional
from config import JWT_SECRET_KEY

def generate_signed_url_token(path: str, expires_in: int = 3600) -> str:
    """
    Generate a time-limited signature for a file path.
    Args:
        path: The relative file path to sign.
        expires_in: Expiration time in seconds (default 1 hour).
    Returns:
        A signature string containing expiration and HMAC.
    """
    expires = int(time.time()) + expires_in
    message = f"{path}:{expires}"
    
    signature = hmac.new(
        JWT_SECRET_KEY.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return f"{expires}:{signature}"

def verify_signed_url_token(path: str, token: str) -> bool:
    """
    Verify if a signed token is valid for a given path and has not expired.
    """
    try:
        expires_str, signature = token.split(":")
        expires = int(expires_str)
        
        if expires < time.time():
            return False
        
        expected_message = f"{path}:{expires}"
        expected_signature = hmac.new(
            JWT_SECRET_KEY.encode(),
            expected_message.encode(),
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(signature, expected_signature)
    except Exception:
        return False

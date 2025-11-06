# auth/schemas.py
from pydantic import BaseModel, EmailStr
from typing import Optional

# Schema for user registration
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str


# Schema for login
class UserLogin(BaseModel):
    email: EmailStr
    password: str


# Schema for returning user info
class UserOut(BaseModel):
    id: str
    username: str
    email: EmailStr


# Schema for token responses
class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


# Schema for refresh request
class TokenRefresh(BaseModel):
    refresh_token: str
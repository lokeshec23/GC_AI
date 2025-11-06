# auth/routes.py
from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import JSONResponse
from bson import ObjectId
from auth.models import users_collection, find_user_by_email, create_user
from auth.schemas import UserCreate, UserLogin, UserOut, TokenResponse, TokenRefresh
from auth.utils import hash_password, verify_password, create_tokens, verify_token

router = APIRouter(prefix="/auth", tags=["Authentication"])

# ✅ Register new user
@router.post("/register", response_model=UserOut)
async def register_user(user: UserCreate):
    existing_user = await find_user_by_email(user.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_pw = hash_password(user.password)
    user_data = {"username": user.username, "email": user.email, "password": hashed_pw}
    new_user = await create_user(user_data)

    return UserOut(id=str(new_user["_id"]), username=new_user["username"], email=new_user["email"])


# ✅ Login user
@router.post("/login", response_model=TokenResponse)
async def login_user(credentials: UserLogin):
    user = await find_user_by_email(credentials.email)
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access_token, refresh_token = create_tokens(str(user["_id"]))

    user_data = UserOut(id=str(user["_id"]), username=user["username"], email=user["email"])
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=user_data,
    )


# ✅ Get current logged-in user
@router.get("/me", response_model=UserOut)
async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")

    token = authorization.split(" ")[1]
    payload = verify_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("sub")
    user = await users_collection.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserOut(id=str(user["_id"]), username=user["username"], email=user["email"])


# ✅ Refresh access token using refresh token
@router.post("/refresh")
async def refresh_token(data: TokenRefresh):
    payload = verify_token(data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload.get("sub")
    new_access_token, _ = create_tokens(user_id)

    return JSONResponse({"access_token": new_access_token})
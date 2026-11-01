import User from "../models/userModel.js";
import RefreshToken from "../models/refreshTokenModel.js";
import {
  generateAccessToken,
  generateRefreshToken,
  setAccessTokenCookies,
  setRefreshTokenCookies,
} from "../utils/jwt.js";
import AppError from "../middlewares/appError.js";
import {
  comparePassword,
  calculateRefreshExpiresAt,
  generateSessionId,
} from "../utils/helpers.js";
import { userRefreshTokenPath } from "../config/constants.js";

export const loginUserService = async (identifier, password, res) => {
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
  const isPhone = /^\d{10}$/.test(identifier);

  if (!isEmail && !isPhone) {
    throw new AppError("Invalid email or phone number", 400, {
      errors: [
        {
          field: "identifier",
          message: "Invalid email or phone number",
        },
      ],
    });
  }

  const user = isEmail
    ? await User.findOne({ email: identifier })
    : await User.findOne({ phone: identifier });

  if (!user) {
    throw new AppError(
      isEmail
        ? "No user found with this email"
        : "No user found with this phone number",
      404,
      {
        errors: [
          {
            field: "identifier",
            message: isEmail
              ? "No user found with this email"
              : "No user found with this phone number",
          },
        ],
      },
    );
  }

  const isPasswordCorrect = await comparePassword(password, user.password);
  if (!isPasswordCorrect) {
    throw new AppError("Incorrect password", 401, {
      errors: [
        {
          field: "password",
          message: "Incorrect password",
        },
      ],
    });
  }

  // Generate sessionId
  const sessionId = generateSessionId();

  const detailedUser = {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    sessionId,
    role: user.role,
  };

  // Generate tokens
  const accessTokenDuration = process.env.JWT_ACCESS_EXPIRATION; // Access token expiration time
  const accessToken = generateAccessToken(
    detailedUser,
    accessTokenDuration,
    user.role,
  );
  const refreshTokenDuration = process.env.JWT_REFRESH_EXPIRATION; // Refresh token expiration time
  const refreshToken = generateRefreshToken(
    user._id.toString(),
    refreshTokenDuration,
    user.role,
  );

  // Dynamically calculate expiration time
  const expiresAt = calculateRefreshExpiresAt(refreshTokenDuration);

  // Save refresh token without replacing existing ones
  await RefreshToken.create({
    userId: user._id.toString(),
    sessionId,
    token: refreshToken,
    expiresAt,
  });

  // Set cookies
  setAccessTokenCookies(res, accessToken);
  setRefreshTokenCookies(res, refreshToken);

  return { accessToken, refreshToken, user: detailedUser };
};

export const refreshUserAccessTokenService = async (
  refreshToken,
  user,
  res,
) => {
  if (!refreshToken) {
    throw new AppError("Refresh token is missing", 400, {
      errors: [
        {
          field: "refreshToken",
          message: "Refresh token is missing",
        },
      ],
    });
  }

  const tokenRecord = await RefreshToken.findOne({
    token: refreshToken,
    userId: user.id,
  });
  if (!tokenRecord) {
    throw new AppError("Refresh token record doesn't exists", 403, {
      errors: [
        {
          field: "refreshToken",
          message: "Refresh token record doesn't exists",
        },
      ],
    });
  }

  const userRecord = await User.findById(tokenRecord.userId);

  // get sessionId
  const sessionId = tokenRecord.sessionId;

  const detailedUser = {
    id: userRecord._id,
    name: userRecord.name,
    email: userRecord.email,
    phone: userRecord.phone,
    createdAt: userRecord.createdAt,
    updatedAt: userRecord.updatedAt,
    sessionId,
  };

  const accessTokenDuration = process.env.JWT_ACCESS_EXPIRATION;
  const newAccessToken = generateAccessToken(detailedUser, accessTokenDuration);

  setAccessTokenCookies(res, newAccessToken);
  return { accessToken: newAccessToken };
};

export const logoutUserService = async (loggedInUser, res) => {
  // Delete only the specific session's refresh token
  const result = await RefreshToken.deleteOne({
    userId: loggedInUser.id,
    sessionId: loggedInUser.sessionId,
  });
  const deleted = result.acknowledged;

  // Clear cookies
  res.clearCookie("accessToken", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 0,
  });
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 0,
    path: userRefreshTokenPath,
  });

  return { deleted };
};

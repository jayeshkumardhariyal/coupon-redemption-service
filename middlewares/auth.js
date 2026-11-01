import jwt from "jsonwebtoken";
import { catchAsync } from "../utils/helpers.js";
import AppError from "./appError.js";

export const verifyToken = (type) =>
  catchAsync(async (req, res, next) => {
    const accessTokenSecret = process.env.JWT_ACCESS_SECRET;
    const refreshTokenSecret = process.env.JWT_REFRESH_SECRET;
    // Check header first, then check cookie
    const token =
      req.headers.authorization?.split(" ")[1] || req.cookies[`${type}Token`];

    if (!token) {
      return next(
        new AppError("Token is missing", 401, {
          errors: [{ field: "token", message: "Token is missing" }],
        })
      );
    }

    const decoded = jwt.verify(
      token,
      type === "access" ? accessTokenSecret : refreshTokenSecret
    );
    req.user = decoded;
    req.refreshToken = type === "refresh" ? token : null;
    next();
  });

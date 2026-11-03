import express from "express";
const couponRouter = express.Router();
import {
  createCouponSchema,
  updateCouponSchema,
} from "../utils/validationSchemas/couponSchema.js";

import { validateRequest } from "../middlewares/validations.js";
import { verifyToken } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/RoleValidator.js";
import {
  createCoupon,
  updateCoupon,
  getAllCoupons,
  getCouponById,
  deleteCoupon,
} from "../controllers/couponController.js";

couponRouter.post(
  "/",
  verifyToken("access"),
  requireRole("Admin"),
  validateRequest(createCouponSchema),
  createCoupon,
);

couponRouter.patch(
  "/:id",
  verifyToken("access"),
  requireRole("Admin"),
  validateRequest(updateCouponSchema),
  updateCoupon,
);

couponRouter.get(
  "/",
  verifyToken("access"),
  requireRole("Admin"),
  getAllCoupons,
);

couponRouter.get(
  "/:id",
  verifyToken("access"),
  requireRole("Admin"),
  getCouponById,
);

couponRouter.delete(
  "/:id",
  verifyToken("access"),
  requireRole("Admin"),
  deleteCoupon,
);

export default couponRouter;

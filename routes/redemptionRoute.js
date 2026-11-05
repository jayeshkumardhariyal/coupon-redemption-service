import express from "express";
import { verifyToken } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/RoleValidator.js";
import { validateRequest } from "../middlewares/validations.js";
import { redeemCouponSchema } from "../utils/validationSchemas/couponSchema.js";
import { redeemCoupon } from "../controllers/redemptionController.js";

const router = express.Router();

router.post("/redeem", validateRequest(redeemCouponSchema), redeemCoupon);

export default router;

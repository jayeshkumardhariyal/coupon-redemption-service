import Coupon from "../models/couponModel.js";
import AppError from "../middlewares/appError.js";

export const createCouponService = async ({
  code,
  discountType,
  discountValue,
  expiresAt,
}) => {
  // Normalize coupon code
  const normalizedCode = code.trim().toUpperCase();

  // Check for an existing coupon
  const existingCoupon = await Coupon.findOne({
    code: normalizedCode,
  });

  if (existingCoupon) {
    throw new AppError("Coupon code already exists", 409, {
      errors: [
        {
          field: "code",
          message: "Coupon code already exists",
        },
      ],
    });
  }

  // Create coupon as DRAFT
  try {
    const coupon = await Coupon.create({
      code: normalizedCode,
      discountType,
      discountValue,
      expiresAt: new Date(expiresAt),
      status: "DRAFT",
    });

    return coupon;
  } catch (error) {
    // Handle duplicate codes created by concurrent requests
    if (error.code === 11000) {
      throw new AppError("Coupon code already exists", 409, {
        errors: [
          {
            field: "code",
            message: "Coupon code already exists",
          },
        ],
      });
    }

    throw error;
  }
};

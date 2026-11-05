import Coupon from "../models/couponModel.js";
import AppError from "../middlewares/appError.js";

export const createCouponService = async ({
  code,
  discountType,
  discountValue,
  minOrderValue,
  expiresAt,
  maxRedemptions,
  maxRedemptionsPerUser,
}) => {
  const normalizedCode = code.trim().toUpperCase();

  if (maxRedemptionsPerUser > maxRedemptions) {
    throw new AppError("Invalid redemption limit", 400, {
      errors: [
        {
          field: "maxRedemptionsPerUser",
          message: "Per-user limit cannot exceed the global redemption limit",
        },
      ],
    });
  }

  const existingCoupon = await Coupon.findOne({ code: normalizedCode });

  if (existingCoupon) {
    throw new AppError("Coupon code already exists", 409, {
      errors: [{ field: "code", message: "Coupon code already exists" }],
    });
  }

  try {
    const coupon = await Coupon.create({
      code: normalizedCode,
      discountType,
      discountValue,
      minOrderValue,
      expiresAt: new Date(expiresAt),
      maxRedemptions,
      maxRedemptionsPerUser,
      status: "DRAFT",
    });

    return coupon;
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError("Coupon code already exists", 409, {
        errors: [{ field: "code", message: "Coupon code already exists" }],
      });
    }

    throw error;
  }
};

export const updateCouponService = async (id, updateData) => {
  // Find existing coupon
  const coupon = await Coupon.findById(id);

  if (!coupon) {
    throw new AppError("Coupon not found", 404, {
      errors: [
        {
          field: "id",
          message: "Coupon not found with this id",
        },
      ],
    });
  }
  const finalMaxRedemptions =
    updateData.maxRedemptions ?? coupon.maxRedemptions;

  const finalMaxRedemptionsPerUser =
    updateData.maxRedemptionsPerUser ?? coupon.maxRedemptionsPerUser;

  if (finalMaxRedemptionsPerUser > finalMaxRedemptions) {
    throw new AppError("Invalid redemption limit", 400, {
      errors: [
        {
          field: "maxRedemptionsPerUser",
          message: "Per-user limit cannot exceed the global redemption limit",
        },
      ],
    });
  }

  if (finalMaxRedemptions < coupon.redeemedCount) {
    throw new AppError("Invalid redemption limit", 400, {
      errors: [
        {
          field: "maxRedemptions",
          message:
            "Global redemption limit cannot be less than current active redemptions",
        },
      ],
    });
  }

  // Normalize coupon code if provided
  if (updateData.code !== undefined) {
    updateData.code = updateData.code.trim().toUpperCase();

    // Check duplicate coupon code
    const existingCoupon = await Coupon.findOne({
      code: updateData.code,
      _id: { $ne: id },
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
  }

  // Validate the final discount combination
  const finalDiscountType = updateData.discountType ?? coupon.discountType;

  const finalDiscountValue = updateData.discountValue ?? coupon.discountValue;

  if (finalDiscountType === "PERCENTAGE" && finalDiscountValue > 99) {
    throw new AppError("Invalid discount value", 400, {
      errors: [
        {
          field: "discountValue",
          message: "Percentage discount cannot exceed 99",
        },
      ],
    });
  }

  // Update coupon fields
  Object.assign(coupon, updateData);

  try {
    await coupon.save();
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

export const getAllCouponsService = async () => {
  const coupons = await Coupon.find();

  return coupons;
};

export const getCouponByIdService = async (id) => {
  const coupon = await Coupon.findById(id);

  if (!coupon) {
    throw new AppError("Coupon not found", 404, {
      errors: [{ field: "id", message: "Coupon not found with this id" }],
    });
  }

  return coupon;
};

export const deleteCouponService = async (id) => {
  const coupon = await Coupon.findByIdAndDelete(id);

  if (!coupon) {
    throw new AppError("Coupon not found", 404, {
      errors: [{ field: "id", message: "Coupon not found with this id" }],
    });
  }

  return coupon;
};

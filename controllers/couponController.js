import Coupon from "../models/couponModel.js";

export const createCoupon = async (req, res) => {
  try {
    const { code, discountType, discountValue, expiresAt } = req.body;

    // Validate required fields
    if (!code || !discountType || discountValue === undefined || !expiresAt) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Validate discount type
    if (!["PERCENTAGE", "FIXED"].includes(discountType)) {
      return res.status(400).json({
        success: false,
        message: "discountType must be PERCENTAGE or FIXED",
      });
    }

    // Validate discount value
    if (
      typeof discountValue !== "number" ||
      !Number.isFinite(discountValue) ||
      discountValue <= 0 ||
      (discountType === "PERCENTAGE" && discountValue > 100)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid discountValue",
      });
    }

    // Validate expiry date
    const expiryDate = new Date(expiresAt);

    if (Number.isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "expiresAt must be a valid future date",
      });
    }

    // Normalize coupon code
    const normalizedCode = code.trim().toUpperCase();

    // Check for an existing coupon
    const existingCoupon = await Coupon.findOne({
      code: normalizedCode,
    });

    if (existingCoupon) {
      return res.status(409).json({
        success: false,
        message: "Coupon code already exists",
      });
    }

    // Create coupon as DRAFT
    const coupon = await Coupon.create({
      code: normalizedCode,
      discountType,
      discountValue,
      expiresAt: expiryDate,
      status: "DRAFT",
    });

    return res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      data: coupon,
    });
  } catch (error) {
    // Handles duplicate codes created by concurrent requests
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Coupon code already exists",
      });
    }

    console.error("Create coupon error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

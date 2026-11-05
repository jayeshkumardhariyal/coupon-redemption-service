import mongoose from "mongoose";
import Coupon from "../models/couponModel.js";
import Redemption from "../models/redemptionModel.js";
import CouponUsage from "../models/couponUsageModel.js";
import AppError from "../middlewares/appError.js";

const toFraction = (value) => {
  const [coefficient, exponentString] = String(value).toLowerCase().split("e");

  const exponent = Number(exponentString || 0);
  const [whole, decimal = ""] = coefficient.split(".");

  let numerator = BigInt(`${whole}${decimal}`);
  const scale = decimal.length - exponent;

  if (scale < 0) {
    numerator *= 10n ** BigInt(-scale);
  }

  return {
    numerator,
    denominator: scale > 0 ? 10n ** BigInt(scale) : 1n,
  };
};

const roundHalfUp = (numerator, denominator) =>
  (2n * numerator + denominator) / (2n * denominator);

const toPaise = (value) => {
  const { numerator, denominator } = toFraction(value);
  return roundHalfUp(numerator * 100n, denominator);
};

export const redeemCouponService = async ({
  customerId,
  orderId,
  orderValue,
  couponCode,
}) => {
  const normalizedCode = couponCode.trim().toUpperCase();

  const coupon = await Coupon.findOne({ code: normalizedCode });

  if (!coupon) {
    throw new AppError("Coupon not found", 404, {
      errors: [{ field: "couponCode", message: "Invalid coupon code" }],
    });
  }

  if (coupon.status !== "ACTIVE") {
    throw new AppError("Coupon is not active", 400, {
      errors: [{ field: "couponCode", message: "This coupon is not active" }],
    });
  }

  if (coupon.expiresAt <= new Date()) {
    throw new AppError("Coupon has expired", 400, {
      errors: [{ field: "couponCode", message: "This coupon has expired" }],
    });
  }

  if (orderValue < coupon.minOrderValue) {
    throw new AppError("Minimum order value not met", 400, {
      errors: [
        {
          field: "orderValue",
          message: `Minimum order value for this coupon is ${coupon.minOrderValue}`,
        },
      ],
    });
  }
  const existingRedemption = await Redemption.findOne({
    customerId,
    couponId: coupon._id,
    orderId,
    status: "REDEEMED",
  });

  if (existingRedemption) {
    return existingRedemption;
  }

  const orderValuePaise = toPaise(orderValue);

  let discountPaise;

  if (coupon.discountType === "PERCENTAGE") {
    const percentage = toFraction(coupon.discountValue);

    discountPaise = roundHalfUp(
      orderValuePaise * percentage.numerator,
      percentage.denominator * 100n,
    );
  } else {
    discountPaise = toPaise(coupon.discountValue);
  }

  if (discountPaise > orderValuePaise) {
    throw new AppError("Invalid discount amount", 400, {
      errors: [
        {
          field: "discountValue",
          message: "Discount cannot be greater than the order value",
        },
      ],
    });
  }

  const discountAmount = Number(discountPaise) / 100;
  const session = await mongoose.startSession();

  try {
    let redemption;

    await session.withTransaction(async () => {
      // We'll add the atomic redemption operations here.
      const updatedCoupon = await Coupon.findOneAndUpdate(
        {
          _id: coupon._id,
          status: "ACTIVE",
          expiresAt: { $gt: new Date() },
          $expr: {
            $lt: ["$redeemedCount", "$maxRedemptions"],
          },
        },
        {
          $inc: { redeemedCount: 1 },
        },
        {
          new: true,
          session,
        },
      );

      if (!updatedCoupon) {
        throw new AppError("Coupon redemption limit reached", 400, {
          errors: [
            {
              field: "couponCode",
              message: "This coupon has reached its maximum redemption limit",
            },
          ],
        });
      }
      await CouponUsage.updateOne(
        { couponId: coupon._id, customerId },
        {
          $setOnInsert: {
            couponId: coupon._id,
            customerId,
            activeRedemptionCount: 0,
          },
        },
        { upsert: true, session },
      );
      const updatedUsage = await CouponUsage.findOneAndUpdate(
        {
          couponId: coupon._id,
          customerId,
          activeRedemptionCount: {
            $lt: updatedCoupon.maxRedemptionsPerUser,
          },
        },
        {
          $inc: { activeRedemptionCount: 1 },
        },
        {
          new: true,
          session,
        },
      );

      if (!updatedUsage) {
        const redemptionHistory = await Redemption.find({
          couponId: coupon._id,
          customerId,
        }).sort({ redeemedAt: -1 });

        throw new AppError("Customer redemption limit reached", 400, {
          errors: [
            {
              field: "couponCode",
              message: "You have reached your redemption limit for this coupon",
            },
          ],
          data: {
            redemptionHistory,
          },
        });
      }
      const createdRedemptions = await Redemption.create(
        [
          {
            couponId: coupon._id,
            customerId,
            orderId,
            orderValue,
            couponCode: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            discountAmount,
            status: "REDEEMED",
            redeemedAt: new Date(),
          },
        ],
        { session },
      );

      redemption = createdRedemptions[0];
    });

    return redemption;
  } catch (error) {
    if (error.code === 11000) {
      const existingRedemption = await Redemption.findOne({
        customerId,
        couponId: coupon._id,
        orderId,
        status: "REDEEMED",
      });

      if (existingRedemption) {
        return existingRedemption;
      }
    }

    throw error;
  } finally {
    await session.endSession();
  }
};

export const revertRedemptionService = async ({ redemptionId }) => {
  if (!mongoose.isValidObjectId(redemptionId)) {
    throw new AppError("Invalid redemption ID", 400, {
      errors: [
        {
          field: "redemptionId",
          message: "Please provide a valid redemption ID",
        },
      ],
    });
  }
  const session = await mongoose.startSession();

  try {
    let revertedRedemption;

    await session.withTransaction(async () => {
      const redemption =
        await Redemption.findById(redemptionId).session(session);

      if (!redemption) {
        throw new AppError("Redemption not found", 404, {
          errors: [
            {
              field: "redemptionId",
              message: "No redemption found with this ID",
            },
          ],
        });
      }

      if (redemption.status !== "REDEEMED") {
        throw new AppError("Redemption already reverted", 400, {
          errors: [
            {
              field: "redemptionId",
              message: "This redemption is already reverted",
            },
          ],
        });
      }

      // Change redemption status.
      revertedRedemption = await Redemption.findOneAndUpdate(
        {
          _id: redemptionId,
          status: "REDEEMED",
        },
        {
          $set: {
            status: "REVERSED",
            reversedAt: new Date(),
          },
        },
        {
          new: true,
          session,
        },
      );

      if (!revertedRedemption) {
        throw new AppError("Redemption could not be reverted", 400);
      }

      // Decrement the coupon's active redemption count.
      const updatedCoupon = await Coupon.findOneAndUpdate(
        {
          _id: redemption.couponId,
          redeemedCount: { $gt: 0 },
        },
        {
          $inc: { redeemedCount: -1 },
        },
        {
          new: true,
          session,
        },
      );

      if (!updatedCoupon) {
        throw new AppError("Coupon redemption counter update failed", 500);
      }

      // Decrement this customer's active redemption count.
      const updatedUsage = await CouponUsage.findOneAndUpdate(
        {
          couponId: redemption.couponId,
          customerId: redemption.customerId,
          activeRedemptionCount: { $gt: 0 },
        },
        {
          $inc: { activeRedemptionCount: -1 },
        },
        {
          new: true,
          session,
        },
      );

      if (!updatedUsage) {
        throw new AppError("Customer redemption counter update failed", 500);
      }
    });

    return revertedRedemption;
  } finally {
    await session.endSession();
  }
};

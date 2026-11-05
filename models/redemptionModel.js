import mongoose from "mongoose";

const redemptionSchema = new mongoose.Schema(
  {
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      required: true,
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    orderId: {
      type: String,
      required: true,
    },

    couponCode: {
      type: String,
      required: true,
    },

    discountType: {
      type: String,
      enum: ["PERCENTAGE", "FIXED"],
      required: true,
    },

    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: ["REDEEMED", "REVERSED"],
      default: "REDEEMED",
    },
    orderValue: {
      type: Number,
      required: true,
      min: 0,
    },

    discountAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    redeemedAt: {
      type: Date,
      default: Date.now,
    },

    reversedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

redemptionSchema.index(
  { customerId: 1, couponId: 1, orderId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "REDEEMED" },
  },
);

const Redemption = mongoose.model("Redemption", redemptionSchema);

export default Redemption;

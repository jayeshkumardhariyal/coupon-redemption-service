import { jest } from "@jest/globals";

// Mock Mongoose before importing the service.
jest.unstable_mockModule("mongoose", () => ({
  default: {
    startSession: jest.fn(),
    isValidObjectId: jest.fn(),
  },
}));

// Mock Coupon model.
jest.unstable_mockModule("../../models/couponModel.js", () => ({
  default: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

// Mock Redemption model.
jest.unstable_mockModule("../../models/redemptionModel.js", () => ({
  default: {
    findOne: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    create: jest.fn(),
  },
}));

// Mock CouponUsage model.
jest.unstable_mockModule("../../models/couponUsageModel.js", () => ({
  default: {
    updateOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

// Mock AppError.
jest.unstable_mockModule("../../middlewares/appError.js", () => ({
  default: jest.fn(),
}));

// Import mocked dependencies.
const mongoose = (await import("mongoose")).default;
const Coupon = (await import("../../models/couponModel.js")).default;
const Redemption = (await import("../../models/redemptionModel.js")).default;
const CouponUsage = (await import("../../models/couponUsageModel.js")).default;
const AppError = (await import("../../middlewares/appError.js")).default;

// Import service after mocks are configured.
const { redeemCouponService, revertRedemptionService } =
  await import("../../services/redemptionService.js");

describe("RedemptionService", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Re-apply AppError implementation before each test.
    AppError.mockImplementation((message, code, options) => {
      const error = new Error(message);
      error.statusCode = code;
      error.errors = options?.errors || [];
      error.data = options?.data || {};
      return error;
    });
  });
  describe("redeemCouponService", () => {
    it("should successfully redeem a valid coupon", async () => {
      // Test data
      const customerId = "customer1";
      const orderId = "order1";

      const coupon = {
        _id: "coupon1",
        code: "SAVE10",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 86400000),
        minOrderValue: 100,
        discountType: "PERCENTAGE",
        discountValue: 10,
        maxRedemptions: 100,
        maxRedemptionsPerUser: 5,
      };

      const createdRedemption = {
        _id: "redemption1",
        couponId: "coupon1",
        customerId,
        orderId,
        orderValue: 500,
        discountAmount: 50,
        status: "REDEEMED",
      };

      // Mock coupon lookup.
      Coupon.findOne.mockResolvedValue(coupon);

      // No previous redemption exists.
      Redemption.findOne.mockResolvedValue(null);

      // Mock MongoDB transaction session.
      const session = {
        withTransaction: jest.fn(async (callback) => callback()),
        endSession: jest.fn(),
      };

      mongoose.startSession.mockResolvedValue(session);

      // Mock atomic coupon counter update.
      Coupon.findOneAndUpdate.mockResolvedValue({
        ...coupon,
        redeemedCount: 1,
      });

      // Mock CouponUsage operations.
      CouponUsage.updateOne.mockResolvedValue({});
      CouponUsage.findOneAndUpdate.mockResolvedValue({
        activeRedemptionCount: 1,
      });

      // Mock redemption creation.
      Redemption.create.mockResolvedValue([createdRedemption]);

      // Execute service.
      const result = await redeemCouponService({
        customerId,
        orderId,
        orderValue: 500,
        couponCode: "save10",
      });

      // Verify result.
      expect(result).toBe(createdRedemption);

      // Verify coupon code was normalized.
      expect(Coupon.findOne).toHaveBeenCalledWith({
        code: "SAVE10",
      });

      // Verify transaction was used.
      expect(session.withTransaction).toHaveBeenCalledTimes(1);

      // Verify redemption was created.
      expect(Redemption.create).toHaveBeenCalledTimes(1);
      expect(Redemption.create.mock.calls[0][0][0]).toMatchObject({
        couponId: "coupon1",
        customerId,
        orderId,
        orderValue: 500,
        discountAmount: 50,
        status: "REDEEMED",
      });

      // Verify session was closed.
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });
    it("should return existing redemption for a duplicate request", async () => {
      const customerId = "customer1";
      const orderId = "order1";

      const coupon = {
        _id: "coupon1",
        code: "SAVE10",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 86400000),
        minOrderValue: 100,
        discountType: "PERCENTAGE",
        discountValue: 10,
      };

      const existingRedemption = {
        _id: "redemption1",
        couponId: "coupon1",
        customerId,
        orderId,
        discountAmount: 50,
        status: "REDEEMED",
      };

      Coupon.findOne.mockResolvedValue(coupon);

      // Simulate an existing active redemption.
      Redemption.findOne.mockResolvedValue(existingRedemption);

      const result = await redeemCouponService({
        customerId,
        orderId,
        orderValue: 500,
        couponCode: "SAVE10",
      });

      expect(result).toBe(existingRedemption);

      // No new transaction or database writes should happen.
      expect(mongoose.startSession).not.toHaveBeenCalled();
      expect(Coupon.findOneAndUpdate).not.toHaveBeenCalled();
      expect(CouponUsage.updateOne).not.toHaveBeenCalled();
      expect(CouponUsage.findOneAndUpdate).not.toHaveBeenCalled();
      expect(Redemption.create).not.toHaveBeenCalled();
    });
    it("should throw 404 when coupon does not exist", async () => {
      Coupon.findOne.mockResolvedValue(null);

      await expect(
        redeemCouponService({
          customerId: "customer1",
          orderId: "order1",
          orderValue: 500,
          couponCode: "INVALID",
        }),
      ).rejects.toMatchObject({
        message: "Coupon not found",
        statusCode: 404,
      });

      expect(Redemption.findOne).not.toHaveBeenCalled();
      expect(mongoose.startSession).not.toHaveBeenCalled();
    });
    it("should throw 400 when coupon is not active", async () => {
      Coupon.findOne.mockResolvedValue({
        _id: "coupon1",
        code: "SAVE10",
        status: "DRAFT",
        expiresAt: new Date(Date.now() + 86400000),
        minOrderValue: 100,
      });

      await expect(
        redeemCouponService({
          customerId: "customer1",
          orderId: "order1",
          orderValue: 500,
          couponCode: "SAVE10",
        }),
      ).rejects.toMatchObject({
        message: "Coupon is not active",
        statusCode: 400,
      });

      expect(Redemption.findOne).not.toHaveBeenCalled();
      expect(mongoose.startSession).not.toHaveBeenCalled();
    });
    it("should throw 400 when coupon has expired", async () => {
      Coupon.findOne.mockResolvedValue({
        _id: "coupon1",
        code: "SAVE10",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() - 86400000),
        minOrderValue: 100,
      });

      await expect(
        redeemCouponService({
          customerId: "customer1",
          orderId: "order1",
          orderValue: 500,
          couponCode: "SAVE10",
        }),
      ).rejects.toMatchObject({
        message: "Coupon has expired",
        statusCode: 400,
      });

      expect(Redemption.findOne).not.toHaveBeenCalled();
      expect(mongoose.startSession).not.toHaveBeenCalled();
    });
    it("should throw 400 when minimum order value is not met", async () => {
      Coupon.findOne.mockResolvedValue({
        _id: "coupon1",
        code: "SAVE10",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 86400000),
        minOrderValue: 500,
        discountType: "PERCENTAGE",
        discountValue: 10,
      });

      await expect(
        redeemCouponService({
          customerId: "customer1",
          orderId: "order1",
          orderValue: 300,
          couponCode: "SAVE10",
        }),
      ).rejects.toMatchObject({
        message: "Minimum order value not met",
        statusCode: 400,
      });

      expect(Redemption.findOne).not.toHaveBeenCalled();
      expect(mongoose.startSession).not.toHaveBeenCalled();
    });
    it("should throw 400 when discount exceeds order value", async () => {
      Coupon.findOne.mockResolvedValue({
        _id: "coupon1",
        code: "SAVE10",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 86400000),
        minOrderValue: 100,
        discountType: "FIXED",
        discountValue: 600,
      });

      await expect(
        redeemCouponService({
          customerId: "customer1",
          orderId: "order1",
          orderValue: 500,
          couponCode: "SAVE10",
        }),
      ).rejects.toMatchObject({
        message: "Invalid discount amount",
        statusCode: 400,
      });

      expect(mongoose.startSession).not.toHaveBeenCalled();
      expect(Redemption.create).not.toHaveBeenCalled();
    });
    it("should throw 400 when customer reaches per-user redemption limit", async () => {
      const coupon = {
        _id: "coupon1",
        code: "SAVE10",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 86400000),
        minOrderValue: 100,
        discountType: "PERCENTAGE",
        discountValue: 10,
        maxRedemptions: 100,
        maxRedemptionsPerUser: 1,
      };

      Coupon.findOne.mockResolvedValue(coupon);
      Redemption.findOne.mockResolvedValue(null);

      const session = {
        withTransaction: jest.fn(async (callback) => callback()),
        endSession: jest.fn(),
      };

      mongoose.startSession.mockResolvedValue(session);

      Coupon.findOneAndUpdate.mockResolvedValue({
        ...coupon,
        redeemedCount: 10,
      });

      CouponUsage.updateOne.mockResolvedValue({});

      // Simulate the customer's limit already being reached.
      CouponUsage.findOneAndUpdate.mockResolvedValue(null);

      const redemptionHistory = [
        {
          _id: "redemption1",
          orderId: "previous-order",
          status: "REDEEMED",
        },
      ];

      Redemption.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue(redemptionHistory),
      });

      await expect(
        redeemCouponService({
          customerId: "customer1",
          orderId: "new-order",
          orderValue: 500,
          couponCode: "SAVE10",
        }),
      ).rejects.toMatchObject({
        message: "Customer redemption limit reached",
        statusCode: 400,
        data: {
          redemptionHistory,
        },
      });

      expect(Redemption.create).not.toHaveBeenCalled();
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });
    it("should throw 400 when global redemption limit is reached", async () => {
      const coupon = {
        _id: "coupon1",
        code: "SAVE10",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 86400000),
        minOrderValue: 100,
        discountType: "PERCENTAGE",
        discountValue: 10,
        maxRedemptions: 10,
        maxRedemptionsPerUser: 5,
      };

      Coupon.findOne.mockResolvedValue(coupon);
      Redemption.findOne.mockResolvedValue(null);

      const session = {
        withTransaction: jest.fn(async (callback) => callback()),
        endSession: jest.fn(),
      };

      mongoose.startSession.mockResolvedValue(session);

      // Simulate the atomic coupon update failing because the global limit is reached.
      Coupon.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        redeemCouponService({
          customerId: "customer1",
          orderId: "order1",
          orderValue: 500,
          couponCode: "SAVE10",
        }),
      ).rejects.toMatchObject({
        message: "Coupon redemption limit reached",
        statusCode: 400,
      });

      expect(CouponUsage.updateOne).not.toHaveBeenCalled();
      expect(Redemption.create).not.toHaveBeenCalled();
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });
  });
  describe("revertRedemptionService", () => {
    it("should throw 400 when redemption ID is invalid", async () => {
      mongoose.isValidObjectId.mockReturnValue(false);

      await expect(
        revertRedemptionService({
          redemptionId: "invalid-id",
        }),
      ).rejects.toMatchObject({
        message: "Invalid redemption ID",
        statusCode: 400,
      });

      // Invalid IDs should be rejected before starting a transaction.
      expect(mongoose.startSession).not.toHaveBeenCalled();
    });
    it("should throw 404 when redemption does not exist", async () => {
      const redemptionId = "507f1f77bcf86cd799439011";

      mongoose.isValidObjectId.mockReturnValue(true);

      const session = {
        withTransaction: jest.fn(async (callback) => callback()),
        endSession: jest.fn(),
      };

      mongoose.startSession.mockResolvedValue(session);

      // Simulate a valid ID with no matching redemption.
      Redemption.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(null),
      });

      await expect(
        revertRedemptionService({ redemptionId }),
      ).rejects.toMatchObject({
        message: "Redemption not found",
        statusCode: 404,
      });

      expect(session.withTransaction).toHaveBeenCalledTimes(1);
      expect(session.endSession).toHaveBeenCalledTimes(1);

      // No counters should be changed.
      expect(Coupon.findOneAndUpdate).not.toHaveBeenCalled();
      expect(CouponUsage.findOneAndUpdate).not.toHaveBeenCalled();
    });
    it("should throw 400 when redemption is already reversed", async () => {
      const redemptionId = "507f1f77bcf86cd799439011";

      mongoose.isValidObjectId.mockReturnValue(true);

      const session = {
        withTransaction: jest.fn(async (callback) => callback()),
        endSession: jest.fn(),
      };

      mongoose.startSession.mockResolvedValue(session);

      Redemption.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue({
          _id: redemptionId,
          couponId: "coupon1",
          customerId: "customer1",
          status: "REVERSED",
        }),
      });

      await expect(
        revertRedemptionService({ redemptionId }),
      ).rejects.toMatchObject({
        message: "Redemption already reverted",
        statusCode: 400,
      });

      expect(Redemption.findOneAndUpdate).not.toHaveBeenCalled();
      expect(Coupon.findOneAndUpdate).not.toHaveBeenCalled();
      expect(CouponUsage.findOneAndUpdate).not.toHaveBeenCalled();

      expect(session.endSession).toHaveBeenCalledTimes(1);
    });
    it("should successfully revert a redemption and decrement counters", async () => {
      const redemptionId = "507f1f77bcf86cd799439011";

      mongoose.isValidObjectId.mockReturnValue(true);

      const session = {
        withTransaction: jest.fn(async (callback) => callback()),
        endSession: jest.fn(),
      };

      mongoose.startSession.mockResolvedValue(session);

      const redemption = {
        _id: redemptionId,
        couponId: "coupon1",
        customerId: "customer1",
        status: "REDEEMED",
      };

      const revertedRedemption = {
        ...redemption,
        status: "REVERSED",
      };

      Redemption.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(redemption),
      });

      Redemption.findOneAndUpdate.mockResolvedValue(revertedRedemption);

      Coupon.findOneAndUpdate.mockResolvedValue({
        _id: "coupon1",
        redeemedCount: 4,
      });

      CouponUsage.findOneAndUpdate.mockResolvedValue({
        couponId: "coupon1",
        customerId: "customer1",
        activeRedemptionCount: 1,
      });

      const result = await revertRedemptionService({ redemptionId });

      expect(result).toBe(revertedRedemption);

      expect(Redemption.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: redemptionId,
          status: "REDEEMED",
        },
        {
          $set: expect.objectContaining({
            status: "REVERSED",
          }),
        },
        {
          new: true,
          session,
        },
      );

      expect(Coupon.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: "coupon1",
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

      expect(CouponUsage.findOneAndUpdate).toHaveBeenCalledWith(
        {
          couponId: "coupon1",
          customerId: "customer1",
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

      expect(session.withTransaction).toHaveBeenCalledTimes(1);
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });
    it("should throw 500 when coupon counter update fails", async () => {
      const redemptionId = "507f1f77bcf86cd799439011";

      mongoose.isValidObjectId.mockReturnValue(true);

      const session = {
        withTransaction: jest.fn(async (callback) => callback()),
        endSession: jest.fn(),
      };

      mongoose.startSession.mockResolvedValue(session);

      const redemption = {
        _id: redemptionId,
        couponId: "coupon1",
        customerId: "customer1",
        status: "REDEEMED",
      };

      Redemption.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(redemption),
      });

      Redemption.findOneAndUpdate.mockResolvedValue({
        ...redemption,
        status: "REVERSED",
      });

      // Simulate failure to update the coupon counter.
      Coupon.findOneAndUpdate.mockResolvedValue(null);

      const result = revertRedemptionService({ redemptionId });

      await expect(result).rejects.toThrow(
        "Coupon redemption counter update failed",
      );

      await expect(result).rejects.toMatchObject({
        statusCode: 500,
      });

      expect(CouponUsage.findOneAndUpdate).not.toHaveBeenCalled();

      expect(session.endSession).toHaveBeenCalledTimes(1);
    });
    it("should throw 500 when customer counter update fails", async () => {
      const redemptionId = "507f1f77bcf86cd799439011";

      mongoose.isValidObjectId.mockReturnValue(true);

      const session = {
        withTransaction: jest.fn(async (callback) => callback()),
        endSession: jest.fn(),
      };

      mongoose.startSession.mockResolvedValue(session);

      const redemption = {
        _id: redemptionId,
        couponId: "coupon1",
        customerId: "customer1",
        status: "REDEEMED",
      };

      Redemption.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(redemption),
      });

      Redemption.findOneAndUpdate.mockResolvedValue({
        ...redemption,
        status: "REVERSED",
      });

      // Coupon counter update succeeds.
      Coupon.findOneAndUpdate.mockResolvedValue({
        _id: "coupon1",
        redeemedCount: 4,
      });

      // Customer counter update fails.
      CouponUsage.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        revertRedemptionService({ redemptionId }),
      ).rejects.toMatchObject({
        message: "Customer redemption counter update failed",
        statusCode: 500,
      });

      expect(Coupon.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(CouponUsage.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });
    it("should throw 400 when redemption cannot be atomically reverted", async () => {
      const redemptionId = "507f1f77bcf86cd799439011";

      mongoose.isValidObjectId.mockReturnValue(true);

      const session = {
        withTransaction: jest.fn(async (callback) => callback()),
        endSession: jest.fn(),
      };

      mongoose.startSession.mockResolvedValue(session);

      const redemption = {
        _id: redemptionId,
        couponId: "coupon1",
        customerId: "customer1",
        status: "REDEEMED",
      };

      Redemption.findById.mockReturnValue({
        session: jest.fn().mockResolvedValue(redemption),
      });

      // Simulate another request changing the redemption first.
      Redemption.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        revertRedemptionService({ redemptionId }),
      ).rejects.toMatchObject({
        message: "Redemption could not be reverted",
        statusCode: 400,
      });

      expect(Coupon.findOneAndUpdate).not.toHaveBeenCalled();
      expect(CouponUsage.findOneAndUpdate).not.toHaveBeenCalled();
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });
    it("should return existing redemption when a duplicate key error occurs", async () => {
      const customerId = "customer1";
      const orderId = "order1";

      const coupon = {
        _id: "coupon1",
        code: "SAVE10",
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 86400000),
        minOrderValue: 100,
        discountType: "PERCENTAGE",
        discountValue: 10,
        maxRedemptions: 100,
        maxRedemptionsPerUser: 5,
      };

      Coupon.findOne.mockResolvedValue(coupon);
      Redemption.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        _id: "redemption1",
        customerId,
        orderId,
        status: "REDEEMED",
      });

      const session = {
        withTransaction: jest.fn(async () => {
          const error = new Error("Duplicate key");
          error.code = 11000;
          throw error;
        }),
        endSession: jest.fn(),
      };

      mongoose.startSession.mockResolvedValue(session);

      const result = await redeemCouponService({
        customerId,
        orderId,
        orderValue: 1000,
        couponCode: "SAVE10",
      });

      expect(result).toMatchObject({
        _id: "redemption1",
        customerId,
        orderId,
        status: "REDEEMED",
      });

      expect(Redemption.findOne).toHaveBeenCalledTimes(2);
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });
  });
});

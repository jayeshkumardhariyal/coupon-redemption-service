import { jest } from "@jest/globals";
import mongoose from "mongoose";
import request from "supertest";
import jwt from "jsonwebtoken";
// Use the separate test database.
process.env.MONGO_TEST_URI =
  "mongodb://localhost:27017/S7C_Node_App_Starter_test?replicaSet=rs0";

// Secret used only by integration tests.
process.env.JWT_ACCESS_SECRET = "itest-access-secret";

import app from "../../app.js";

import Coupon from "../../models/couponModel.js";
import Redemption from "../../models/redemptionModel.js";
import CouponUsage from "../../models/couponUsageModel.js";

const createActiveCoupon = async (overrides = {}) => {
  return Coupon.create({
    code: "SAVE10",
    discountType: "PERCENTAGE",
    discountValue: 10,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    status: "ACTIVE",
    maxRedemptions: 10,
    maxRedemptionsPerUser: 3,
    minOrderValue: 100,
    ...overrides,
  });
};

const createAccessToken = (userId, role) => {
  return jwt.sign(
    { id: userId.toString(), role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "1h" },
  );
};

describe("Redemption API integration", () => {
  it("should successfully redeem a coupon and update MongoDB records", async () => {
    const customerId = new mongoose.Types.ObjectId();

    // Create a real coupon in the test database.
    const coupon = await createActiveCoupon();

    // Generate a valid Customer access token.
    const token = createAccessToken(customerId, "Customer");

    // Send a real HTTP request through Express.
    const response = await request(app)
      .post("/api/redemptions/redeem")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderId: "ORDER-001",
        orderValue: 1000,
        couponCode: "SAVE10",
      });

    // Verify HTTP response.
    expect(response.status).toBe(201);
    expect(response.body.message).toBe("Coupon redeemed successfully");

    // Verify the redemption was actually saved.
    const redemption = await Redemption.findOne({
      customerId,
      couponId: coupon._id,
      orderId: "ORDER-001",
      status: "REDEEMED",
    });

    expect(redemption).not.toBeNull();
    expect(redemption.discountAmount).toBe(100);

    // Verify the global coupon counter.
    const updatedCoupon = await Coupon.findById(coupon._id);

    expect(updatedCoupon.redeemedCount).toBe(1);

    // Verify the customer's usage counter.
    const usage = await CouponUsage.findOne({
      couponId: coupon._id,
      customerId,
    });

    expect(usage).not.toBeNull();
    expect(usage.activeRedemptionCount).toBe(1);
  });
  it("should reject redemption when no access token is provided", async () => {
    const response = await request(app).post("/api/redemptions/redeem").send({
      orderId: "ORDER-002",
      orderValue: 1000,
      couponCode: "SAVE10",
    });

    expect(response.status).toBe(401);
  });
  it("should reject redemption when the user is not a Customer", async () => {
    const userId = new mongoose.Types.ObjectId();
    const token = createAccessToken(userId, "Admin");

    const response = await request(app)
      .post("/api/redemptions/redeem")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderId: "ORDER-003",
        orderValue: 1000,
        couponCode: "SAVE10",
      });

    expect(response.status).toBe(403);
  });
  it("should reject redemption when the coupon does not exist", async () => {
    const customerId = new mongoose.Types.ObjectId();
    const token = createAccessToken(customerId, "Customer");

    const response = await request(app)
      .post("/api/redemptions/redeem")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderId: "ORDER-004",
        orderValue: 1000,
        couponCode: "UNKNOWN",
      });

    expect(response.status).toBe(404);
  });
  it("should reject a duplicate redemption for the same order", async () => {
    const customerId = new mongoose.Types.ObjectId();
    const coupon = await createActiveCoupon();
    const token = createAccessToken(customerId, "Customer");

    const payload = {
      orderId: "ORDER-005",
      orderValue: 1000,
      couponCode: coupon.code,
    };

    // First redemption should succeed.
    const firstResponse = await request(app)
      .post("/api/redemptions/redeem")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    expect(firstResponse.status).toBe(201);

    // Second redemption uses the same customer, coupon, and order.
    const secondResponse = await request(app)
      .post("/api/redemptions/redeem")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);

    // The service should return the existing redemption.
    expect(secondResponse.status).toBe(201);

    // Verify only one active redemption exists.
    const redemptions = await Redemption.find({
      customerId,
      couponId: coupon._id,
      orderId: payload.orderId,
      status: "REDEEMED",
    });

    expect(redemptions).toHaveLength(1);

    // Verify the coupon counter increased only once.
    const updatedCoupon = await Coupon.findById(coupon._id);
    expect(updatedCoupon.redeemedCount).toBe(1);
  });
  it("should reject redemption when the global limit is reached", async () => {
    const coupon = await createActiveCoupon({
      maxRedemptions: 1,
    });

    // First customer redeems successfully.
    const firstCustomerId = new mongoose.Types.ObjectId();
    const firstToken = createAccessToken(firstCustomerId, "Customer");

    const firstResponse = await request(app)
      .post("/api/redemptions/redeem")
      .set("Authorization", `Bearer ${firstToken}`)
      .send({
        orderId: "ORDER-006",
        orderValue: 1000,
        couponCode: coupon.code,
      });

    expect(firstResponse.status).toBe(201);

    // A different customer attempts to redeem the same coupon.
    const secondCustomerId = new mongoose.Types.ObjectId();
    const secondToken = createAccessToken(secondCustomerId, "Customer");

    const secondResponse = await request(app)
      .post("/api/redemptions/redeem")
      .set("Authorization", `Bearer ${secondToken}`)
      .send({
        orderId: "ORDER-007",
        orderValue: 1000,
        couponCode: coupon.code,
      });

    expect(secondResponse.status).toBe(400);

    // The global counter must remain at one.
    const updatedCoupon = await Coupon.findById(coupon._id);
    expect(updatedCoupon.redeemedCount).toBe(1);

    // Only one redemption should exist.
    const redemptions = await Redemption.find({
      couponId: coupon._id,
      status: "REDEEMED",
    });

    expect(redemptions).toHaveLength(1);
  });
  it("should reject redemption when the customer's usage limit is reached", async () => {
    const coupon = await createActiveCoupon({
      maxRedemptions: 10,
      maxRedemptionsPerUser: 1,
    });

    const customerId = new mongoose.Types.ObjectId();
    const token = createAccessToken(customerId, "Customer");

    // First order should redeem successfully.
    const firstResponse = await request(app)
      .post("/api/redemptions/redeem")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderId: "ORDER-008",
        orderValue: 1000,
        couponCode: coupon.code,
      });

    expect(firstResponse.status).toBe(201);

    // Same customer attempts another order.
    const secondResponse = await request(app)
      .post("/api/redemptions/redeem")
      .set("Authorization", `Bearer ${token}`)
      .send({
        orderId: "ORDER-009",
        orderValue: 1000,
        couponCode: coupon.code,
      });

    expect(secondResponse.status).toBe(400);

    // Verify only one active redemption exists for this customer.
    const redemptions = await Redemption.find({
      couponId: coupon._id,
      customerId,
      status: "REDEEMED",
    });

    expect(redemptions).toHaveLength(1);

    // Verify the customer's usage counter remains one.
    const usage = await CouponUsage.findOne({
      couponId: coupon._id,
      customerId,
    });

    expect(usage.activeRedemptionCount).toBe(1);
  });
  it("should reject redemption when the global limit is reached", async () => {
    const coupon = await createActiveCoupon({
      maxRedemptions: 1,
    });

    // First customer redeems successfully.
    const firstCustomerId = new mongoose.Types.ObjectId();
    const firstToken = createAccessToken(firstCustomerId, "Customer");

    const firstResponse = await request(app)
      .post("/api/redemptions/redeem")
      .set("Authorization", `Bearer ${firstToken}`)
      .send({
        orderId: "ORDER-006",
        orderValue: 1000,
        couponCode: coupon.code,
      });

    expect(firstResponse.status).toBe(201);

    // A different customer attempts to redeem the same coupon.
    const secondCustomerId = new mongoose.Types.ObjectId();
    const secondToken = createAccessToken(secondCustomerId, "Customer");

    const secondResponse = await request(app)
      .post("/api/redemptions/redeem")
      .set("Authorization", `Bearer ${secondToken}`)
      .send({
        orderId: "ORDER-007",
        orderValue: 1000,
        couponCode: coupon.code,
      });

    expect(secondResponse.status).toBe(400);

    // The global counter must remain at one.
    const updatedCoupon = await Coupon.findById(coupon._id);
    expect(updatedCoupon.redeemedCount).toBe(1);

    // Only one redemption should exist.
    const redemptions = await Redemption.find({
      couponId: coupon._id,
      status: "REDEEMED",
    });

    expect(redemptions).toHaveLength(1);
  });
  it("should allow only one redemption when the same customer redeems concurrently", async () => {
    const coupon = await createActiveCoupon({
      maxRedemptions: 100,
      maxRedemptionsPerUser: 1,
    });

    const customerId = new mongoose.Types.ObjectId();
    const token = createAccessToken(customerId, "Customer");

    const requests = Array.from({ length: 20 }, async (_, index) => {
      return request(app)
        .post("/api/redemptions/redeem")
        .set("Authorization", `Bearer ${token}`)
        .send({
          orderId: `USER-RACE-${index}`,
          orderValue: 1000,
          couponCode: coupon.code,
        });
    });

    const responses = await Promise.all(requests);

    const successfulResponses = responses.filter(
      (response) => response.status === 201,
    );

    const rejectedResponses = responses.filter(
      (response) => response.status === 400,
    );

    expect(successfulResponses).toHaveLength(1);
    expect(rejectedResponses).toHaveLength(19);

    const usage = await CouponUsage.findOne({
      couponId: coupon._id,
      customerId,
    });

    expect(usage.activeRedemptionCount).toBe(1);

    const redemptions = await Redemption.find({
      couponId: coupon._id,
      customerId,
      status: "REDEEMED",
    });

    expect(redemptions).toHaveLength(1);
  });
  it("should return the same redemption for concurrent duplicate requests", async () => {
    const coupon = await createActiveCoupon();

    const customerId = new mongoose.Types.ObjectId();
    const token = createAccessToken(customerId, "Customer");

    const payload = {
      orderId: "IDEMPOTENCY-RACE-001",
      orderValue: 1000,
      couponCode: coupon.code,
    };

    const [firstResponse, secondResponse] = await Promise.all([
      request(app)
        .post("/api/redemptions/redeem")
        .set("Authorization", `Bearer ${token}`)
        .send(payload),

      request(app)
        .post("/api/redemptions/redeem")
        .set("Authorization", `Bearer ${token}`)
        .send(payload),
    ]);

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    // Both responses should refer to the same redemption.
    expect(secondResponse.body.data._id).toBe(firstResponse.body.data._id);

    // Only one active redemption should exist.
    const redemptions = await Redemption.find({
      customerId,
      couponId: coupon._id,
      orderId: payload.orderId,
      status: "REDEEMED",
    });

    expect(redemptions).toHaveLength(1);

    // The coupon counter should increase only once.
    const updatedCoupon = await Coupon.findById(coupon._id);
    expect(updatedCoupon.redeemedCount).toBe(1);
  });
  it("should roll back all database changes when redemption creation fails", async () => {
    const coupon = await createActiveCoupon();
    const customerId = new mongoose.Types.ObjectId();
    const token = createAccessToken(customerId, "Customer");

    const createSpy = jest
      .spyOn(Redemption, "create")
      .mockRejectedValueOnce(
        new Error("Simulated redemption creation failure"),
      );

    try {
      const response = await request(app)
        .post("/api/redemptions/redeem")
        .set("Authorization", `Bearer ${token}`)
        .send({
          orderId: "ROLLBACK-001",
          orderValue: 1000,
          couponCode: coupon.code,
        });

      expect(response.status).toBe(500);
      expect(createSpy).toHaveBeenCalledTimes(1);

      // Coupon counter should be rolled back.
      const updatedCoupon = await Coupon.findById(coupon._id);
      expect(updatedCoupon.redeemedCount).toBe(0);

      // Coupon usage record should also be rolled back.
      const usage = await CouponUsage.findOne({
        couponId: coupon._id,
        customerId,
      });
      expect(usage).toBeNull();

      // No redemption should have been saved.
      const redemptionCount = await Redemption.countDocuments({
        couponId: coupon._id,
        customerId,
        orderId: "ROLLBACK-001",
      });
      expect(redemptionCount).toBe(0);
    } finally {
      createSpy.mockRestore();
    }
  });
});

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_TEST_URI);

  // Ensure model indexes are created before tests run.
  await Promise.all([Coupon.init(), Redemption.init(), CouponUsage.init()]);
});

afterEach(async () => {
  // Clean only the dedicated test database.
  await Promise.all([
    Coupon.deleteMany({}),
    Redemption.deleteMany({}),
    CouponUsage.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

import { jest } from "@jest/globals";
import request from "supertest";
import jwt from "jsonwebtoken";

// Must be set before app (and its auth middleware) is imported/used.
process.env.JWT_ACCESS_SECRET = "itest-access-secret";

// Mock the persistence layer so the HTTP/middleware/routing stack is exercised
// end-to-end without a database.
jest.unstable_mockModule("../../services/productService.js", () => ({
  getAllProductsService: jest.fn(),
  createProductService: jest.fn(),
  getProductByIdService: jest.fn(),
  updateProductService: jest.fn(),
  deleteProductService: jest.fn(),
  purchaseProductService: jest.fn(),
}));

// Silence structured logging during integration runs.
jest.unstable_mockModule("../../utils/logger.js", () => ({
  default: { log: jest.fn() },
}));

const productService = await import("../../services/productService.js");
const app = (await import("../../app.js")).default;

describe("app integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("GET /healthcheck should return 200", async () => {
    const res = await request(app).get("/healthcheck");
    expect(res.status).toBe(200);
    expect(res.text).toContain("HealthCheck");
  });

  it("unknown routes should hit the 404 error handler with the error envelope", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.errors[0].field).toBe("path");
  });

  it("public product list should return the success envelope", async () => {
    productService.getAllProductsService.mockResolvedValue({
      products: [{ name: "Widget" }],
      pagination: { totalCount: 1, page: 1, limit: 50 },
    });

    const res = await request(app).get("/api/public/products");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.products).toHaveLength(1);
  });

  it("purchase should reject an invalid quantity via validation (400)", async () => {
    const res = await request(app)
      .post("/api/public/products/p1/purchase")
      .send({ quantity: 0 });

    expect(res.status).toBe(400);
    expect(productService.purchaseProductService).not.toHaveBeenCalled();
  });

  it("purchase should succeed with a valid quantity", async () => {
    productService.purchaseProductService.mockResolvedValue({
      _id: "p1",
      stock: 3,
    });

    const res = await request(app)
      .post("/api/public/products/p1/purchase")
      .send({ quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Product purchased successfully");
    expect(productService.purchaseProductService).toHaveBeenCalledWith("p1", 2);
  });

  it("admin routes should reject requests without a token (401)", async () => {
    const res = await request(app).get("/api/admin/products");
    expect(res.status).toBe(401);
    expect(res.body.errors[0].field).toBe("token");
  });

  it("admin routes should allow an authenticated caller", async () => {
    productService.getAllProductsService.mockResolvedValue({
      products: [],
      pagination: { totalCount: 0, page: 1, limit: 50 },
    });
    const token = jwt.sign({ id: "admin1" }, process.env.JWT_ACCESS_SECRET, {
      expiresIn: "1h",
    });

    const res = await request(app)
      .get("/api/admin/products")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
  });
});
